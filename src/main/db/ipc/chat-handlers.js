'use strict';

const { ipcMain }          = require('electron');
const { safeHandle }       = require('../../ipc-safe-handle');
const { spawn, execSync }  = require('child_process');
const http                 = require('node:http');
const https                = require('node:https');
const fs                   = require('node:fs');
const os                   = require('node:os');
const path                 = require('node:path');

function buildEditPromptWithRef(instruction, htmlFilePath, projectDescription) {
  const ctx = projectDescription ? `\nProject context: ${projectDescription}` : '';
  return `You are an expert UI/UX developer. Modify the existing HTML screen based on the instruction provided.
Rules:
- Output ONLY the complete modified HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag
- Preserve the overall design language; only apply the requested changes
- No explanation, no markdown — raw HTML only
- Do NOT use any tools, write any files, or save anything — print the raw HTML directly to stdout${ctx}

Modification instruction:
${instruction}

Read the existing HTML from this file path (use the file content as the base):
${htmlFilePath}`;
}

function buildEditPromptInline(instruction, existingHtml, projectDescription) {
  const ctx = projectDescription ? `\nProject context: ${projectDescription}` : '';
  return `You are an expert UI/UX developer. Modify the existing HTML screen below based on the instruction provided.
Rules:
- Output ONLY the complete modified HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag
- Preserve the overall design language; only apply the requested changes
- No explanation, no markdown — raw HTML only
- Do NOT use any tools, write any files, or save anything — print the raw HTML directly to stdout${ctx}

Modification instruction:
${instruction}

Existing HTML:
${existingHtml}`;
}

// Fallback model used when CLI model config has no model_name set.
// Uses the undated alias so it survives patch/date-suffix rotations within the same
// model generation. Update this constant when Anthropic retires the haiku-4-5 family.
// Set model_name explicitly in the model config to override per-profile.
const DEFAULT_CLI_MODEL = 'claude-haiku-4-5';

let _activeProc = null;
let _cancelled  = false;

function killActive() {
  _cancelled = true;
  if (_activeProc) {
    if (process.platform === 'win32') {
      try { execSync(`taskkill /F /T /PID ${_activeProc.pid}`, { windowsHide: true }); } catch (_) {}
    } else {
      try { _activeProc.kill('SIGTERM'); } catch (_) {}
    }
    _activeProc = null;
  }
}

function send(wc, ch, payload) {
  if (!wc.isDestroyed()) wc.send(ch, payload);
}

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
}

function extractHtml(text) {
  const clean = stripAnsi(text);
  // Direct match — greedy so it captures the entire document
  const direct = clean.match(/<!DOCTYPE\s+html[\s\S]*<\/html>/i);
  if (direct) return direct[0].trim();
  // Fallback: model wrapped output in a markdown code fence
  const fenced = clean.match(/```(?:html)?\s*\n(<!DOCTYPE\s+html[\s\S]*<\/html>)\s*\n```/i);
  if (fenced) return fenced[1].trim();
  return null;
}

// ----------------------------------------------------------------
// Anthropic SSE streaming
// ----------------------------------------------------------------
function runAnthropic(wc, prompt, editPayload, model, messages) {
  let msgs;
  if (editPayload) {
    const content = buildEditPromptInline(editPayload.instruction, editPayload.htmlContent, editPayload.projectDescription);
    msgs = [{ role: 'user', content }];
  } else if (messages && messages.length > 0) {
    msgs = messages;
  } else {
    msgs = [{ role: 'user', content: prompt }];
  }

  const body = JSON.stringify({
    model:      model.model_name || 'claude-sonnet-4-6',
    max_tokens: model.max_tokens || 8096,
    stream:     true,
    messages:   msgs,
  });

  const req = https.request({
    hostname: 'api.anthropic.com',
    path:     '/v1/messages',
    method:   'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         model.api_key || '',
      'anthropic-version': '2023-06-01',
      'Content-Length':    Buffer.byteLength(body),
    },
  }, (res) => {
    let accumulated = '';
    res.on('data', (chunk) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const data = JSON.parse(raw);
          if (data.type === 'content_block_delta' && data.delta?.text) {
            accumulated += data.delta.text;
            send(wc, 'chat:token', { text: data.delta.text });
          }
          if (data.type === 'message_stop') {
            const html = extractHtml(accumulated);
            send(wc, 'chat:done', { html, raw: accumulated, error: html ? null : 'Could not extract HTML from response' });
          }
        } catch (_) {}
      }
    });
    res.on('error', (err) => send(wc, 'chat:done', { html: null, raw: '', error: err.message }));
  });

  req.on('error', (err) => send(wc, 'chat:done', { html: null, raw: '', error: err.message }));
  req.write(body);
  req.end();
}

// ----------------------------------------------------------------
// Ollama NDJSON streaming  (/api/chat)
// ----------------------------------------------------------------
function runOllama(wc, prompt, editPayload, model, messages) {
  let msgs;
  if (editPayload) {
    const content = buildEditPromptInline(editPayload.instruction, editPayload.htmlContent, editPayload.projectDescription);
    msgs = [{ role: 'user', content }];
  } else if (messages && messages.length > 0) {
    msgs = messages;
  } else {
    msgs = [{ role: 'user', content: prompt }];
  }

  const baseUrl = (model.base_url || 'http://localhost:11434').replace(/\/$/, '');
  const body    = JSON.stringify({
    model:    model.model_name,
    messages: msgs,
    stream:   true,
  });

  const url = new URL('/api/chat', baseUrl);
  const mod = url.protocol === 'https:' ? https : http;
  let accumulated = '';
  let buffer      = '';

  const req = mod.request({
    hostname: url.hostname,
    port:     url.port || (url.protocol === 'https:' ? 443 : 80),
    path:     url.pathname,
    method:   'POST',
    headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, (res) => {
    res.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data  = JSON.parse(line);
          const token = data.message?.content || '';
          if (token) {
            accumulated += token;
            send(wc, 'chat:token', { text: token });
          }
          if (data.done) {
            const html = extractHtml(accumulated);
            send(wc, 'chat:done', { html, raw: accumulated, error: html ? null : 'Could not extract HTML from response' });
          }
        } catch (_) {}
      }
    });
    res.on('error', (err) => send(wc, 'chat:done', { html: null, raw: '', error: err.message }));
  });

  req.on('error', (err) => send(wc, 'chat:done', { html: null, raw: '', error: err.message }));
  req.write(body);
  req.end();
  _activeProc = req;
}

// ----------------------------------------------------------------
// CLI — hidden PowerShell spawn, prompt via temp file
// ----------------------------------------------------------------
function runCli(wc, prompt, editPayload, model, messages) {
  const exe       = model.executable || 'claude';
  const modelName = model.model_name || DEFAULT_CLI_MODEL;
  const baseFlags = `--dangerously-skip-permissions --print --model ${modelName}`;
  const ts        = Date.now();

  let promptText;
  let htmlTmpFile = null;

  if (editPayload) {
    htmlTmpFile = path.join(os.tmpdir(), `ai-sdlc-html-${ts}.html`);
    try {
      fs.writeFileSync(htmlTmpFile, editPayload.htmlContent, 'utf8');
    } catch (err) {
      send(wc, 'chat:done', { html: null, raw: '', error: `Failed to write HTML temp file: ${err.message}` });
      return;
    }
    promptText = buildEditPromptWithRef(editPayload.instruction, htmlTmpFile, editPayload.projectDescription);
  } else if (messages && messages.length > 1) {
    // Format conversation history as plain text for stateless CLI tools
    const lines = messages.slice(0, -1).map(m =>
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`
    ).join('\n\n');
    const last = messages[messages.length - 1];
    promptText = `[Conversation so far]\n${lines}\n\n[Current message]\nUser: ${last.content}`;
  } else if (messages && messages.length === 1) {
    promptText = messages[0].content;
  } else {
    promptText = prompt;
  }

  // Write prompt to a temp file — avoids PowerShell here-string length
  // limits and breakage on '@ sequences inside the content
  const tmpFile = path.join(os.tmpdir(), `ai-sdlc-chat-${ts}.txt`);
  try {
    fs.writeFileSync(tmpFile, promptText, 'utf8');
  } catch (err) {
    if (htmlTmpFile) { try { fs.unlinkSync(htmlTmpFile); } catch (_) {} }
    send(wc, 'chat:done', { html: null, raw: '', error: `Failed to write temp file: ${err.message}` });
    return;
  }

  const safeTmp = tmpFile.replace(/'/g, "''");
  // Pipe file content via stdin instead of passing as a CLI argument.
  // Passing $p unquoted splits multi-line strings into separate tokens and
  // causes "---" section markers to be interpreted as end-of-flags by the CLI.
  const psCmd = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null;',
    `Get-Content -Path '${safeTmp}' -Raw | ${exe} ${baseFlags}`,
  ].join('\n');

  let accumulated = '';

  const cleanup = () => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    if (htmlTmpFile) { try { fs.unlinkSync(htmlTmpFile); } catch (_) {} }
  };

  _activeProc = spawn(
    'powershell.exe',
    ['-NoLogo', '-NonInteractive', '-Command', psCmd],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' } }
  );

  _activeProc.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    accumulated += text;
    send(wc, 'chat:token', { text });
  });
  _activeProc.stderr.on('data', () => {});

  _activeProc.on('close', (code) => {
    cleanup();
    if (_cancelled) return;
    const html = extractHtml(accumulated);
    send(wc, 'chat:done', {
      html,
      raw:   accumulated,
      error: html ? null : (code !== 0 ? `Process exited with code ${code}` : 'Could not extract HTML from response'),
    });
    _activeProc = null;
  });

  _activeProc.on('error', (err) => {
    cleanup();
    send(wc, 'chat:done', { html: null, raw: accumulated, error: err.message });
    _activeProc = null;
  });
}

// ----------------------------------------------------------------
// Register
// ----------------------------------------------------------------
function registerChatHandlers() {
  safeHandle('chat:cancel', () => killActive());

  safeHandle('chat:generate', (event, { prompt, messages, editPayload, model }) => {
    if (_activeProc) killActive();
    _cancelled = false;
    const wc   = event.sender;

    if (model.type === 'anthropic') {
      runAnthropic(wc, prompt, editPayload, model, messages);
    } else if (model.type === 'ollama') {
      runOllama(wc, prompt, editPayload, model, messages);
    } else {
      runCli(wc, prompt, editPayload, model, messages);
    }

    return { started: true };
  });
}

module.exports = { registerChatHandlers };
