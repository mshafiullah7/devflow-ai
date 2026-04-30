'use strict';

const { ipcMain }          = require('electron');
const { spawn, execSync }  = require('child_process');
const http                 = require('node:http');
const https                = require('node:https');

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

function extractHtml(text) {
  const m = text.match(/<!DOCTYPE\s+html[\s\S]*?<\/html>/i);
  return m ? m[0].trim() : null;
}

// ----------------------------------------------------------------
// Anthropic SSE streaming
// ----------------------------------------------------------------
function runAnthropic(wc, prompt, model) {
  const body = JSON.stringify({
    model:      model.model_name || 'claude-sonnet-4-6',
    max_tokens: model.max_tokens || 8096,
    stream:     true,
    messages:   [{ role: 'user', content: prompt }],
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
            send(wc, 'chat:done', { html, error: html ? null : 'Could not extract HTML from response' });
          }
        } catch (_) {}
      }
    });
    res.on('error', (err) => send(wc, 'chat:done', { html: null, error: err.message }));
  });

  req.on('error', (err) => send(wc, 'chat:done', { html: null, error: err.message }));
  req.write(body);
  req.end();
}

// ----------------------------------------------------------------
// Ollama NDJSON streaming  (/api/chat)
// ----------------------------------------------------------------
function runOllama(wc, prompt, model) {
  const baseUrl = (model.base_url || 'http://localhost:11434').replace(/\/$/, '');
  const body    = JSON.stringify({
    model:    model.model_name,
    messages: [{ role: 'user', content: prompt }],
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
            send(wc, 'chat:done', { html, error: html ? null : 'Could not extract HTML from response' });
          }
        } catch (_) {}
      }
    });
    res.on('error', (err) => send(wc, 'chat:done', { html: null, error: err.message }));
  });

  req.on('error', (err) => send(wc, 'chat:done', { html: null, error: err.message }));
  req.write(body);
  req.end();
  _activeProc = req;
}

// ----------------------------------------------------------------
// CLI — hidden PowerShell spawn, stdout captured
// ----------------------------------------------------------------
function runCli(wc, prompt, model) {
  const exe   = model.executable || 'claude';
  const flags = model.flags || '--dangerously-skip-permissions --print';
  const safe  = prompt.replace(/'/g, "''");
  const psCmd = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null;',
    `$p = @'\n${safe}\n'@`,
    `${exe} ${flags} $p`,
  ].join('\n');

  let accumulated = '';

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
    if (_cancelled) return;
    const html = extractHtml(accumulated);
    send(wc, 'chat:done', {
      html,
      error: html ? null : (code !== 0 ? `Process exited with code ${code}` : 'Could not extract HTML from response'),
    });
    _activeProc = null;
  });

  _activeProc.on('error', (err) => {
    send(wc, 'chat:done', { html: null, error: err.message });
    _activeProc = null;
  });
}

// ----------------------------------------------------------------
// Register
// ----------------------------------------------------------------
function registerChatHandlers() {
  ipcMain.handle('chat:cancel', () => killActive());

  ipcMain.handle('chat:generate', (event, { prompt, model }) => {
    if (_activeProc) killActive();
    _cancelled = false;
    const wc   = event.sender;

    if (model.type === 'anthropic') {
      runAnthropic(wc, prompt, model);
    } else if (model.type === 'ollama') {
      runOllama(wc, prompt, model);
    } else {
      runCli(wc, prompt, model);
    }

    return { started: true };
  });
}

module.exports = { registerChatHandlers };
