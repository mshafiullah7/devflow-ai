'use strict';

const { ipcMain, BrowserWindow, app } = require('electron');
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

const DEFAULT_CLI_MODEL = 'claude-haiku-4-5';

// ----------------------------------------------------------------
// Per-session context — each chat session (main window, queue window)
// gets its own context so their subprocesses never clobber each other.
// ----------------------------------------------------------------
function createCtx() {
  return { proc: null, req: null, cancelled: false };
}

const _mainCtx       = createCtx();
const _validateCtx   = createCtx();
const _workflowCtx   = createCtx();
const _genWfCtx      = createCtx();
const _testGenCtx    = createCtx();

function _logAiCall(type, modelName, exe, promptOrMessages) {
  const ts    = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const label = exe ? `${exe} --model ${modelName}` : `model=${modelName}`;
  let preview = '';
  if (typeof promptOrMessages === 'string') {
    preview = promptOrMessages.trimStart();
  } else if (Array.isArray(promptOrMessages) && promptOrMessages.length) {
    preview = (promptOrMessages.find(m => m.role === 'user')?.content || '').trimStart();
  }
  const lines   = preview.split('\n').map(l => l.trim()).filter(Boolean);
  const snippet = lines.slice(0, 2).join(' ↵ ').slice(0, 120);
  console.log(`[${ts}] [chat:${type}]  ${label}  "${snippet}"`);
}

function killCtx(ctx) {
  ctx.cancelled = true;
  if (ctx.req) {
    try { ctx.req.destroy(); } catch (_) {}
    ctx.req = null;
  }
  if (ctx.proc) {
    if (process.platform === 'win32') {
      try { execSync(`taskkill /F /T /PID ${ctx.proc.pid}`, { windowsHide: true }); } catch (_) {}
    } else {
      try { ctx.proc.kill('SIGTERM'); } catch (_) {}
    }
    ctx.proc = null;
  }
}

const _SUBWIN_DONE = new Set(['workflowChat:done', 'genWorkflowChat:done', 'testGenChat:done']);

function _flashWin(wc) {
  const win = BrowserWindow.fromWebContents(wc);
  if (!win || win.isFocused()) return;
  win.flashFrame(true);
  if (process.platform === 'darwin') app.dock.bounce('informational');
}

function send(wc, ch, payload) {
  if (!wc.isDestroyed()) {
    wc.send(ch, payload);
    if (_SUBWIN_DONE.has(ch)) _flashWin(wc);
  }
}

function stripAnsi(str) {
  return str
    .replace(/\x1B\[[0-9;]*[mGKHFJA-Za-z]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '');
}

function extractHtml(text) {
  const clean = stripAnsi(text);
  const direct = clean.match(/<!DOCTYPE\s+html[\s\S]*<\/html>/i);
  if (direct) return direct[0].trim();
  const fenced = clean.match(/```(?:html)?\s*\n(<!DOCTYPE\s+html[\s\S]*<\/html>)\s*\n```/i);
  if (fenced) return fenced[1].trim();
  return null;
}

function buildDiffPromptInline(instruction, existingHtml, projectDescription) {
  const ctx = projectDescription ? `\nProject context: ${projectDescription}` : '';
  return `Apply the instruction below to the existing HTML.${ctx}

Instruction: ${instruction}

Existing HTML:
${existingHtml}

Output ONLY a raw JSON array of search-replace patches. No explanation, no markdown, no HTML.
The output must start with [ and end with ].

Format:
[{"search":"exact substring copied from the HTML","replace":"new content"}]

Rules:
- Each "search" must be an exact, unique substring of the HTML above
- Include at least 20 surrounding characters so the string is unambiguous
- Replace the smallest snippet that achieves the change — do not repeat unchanged content
- Multiple patches are fine and applied in order`;
}

function buildDiffPromptWithRef(instruction, htmlFilePath, projectDescription) {
  const ctx = projectDescription ? `\nProject context: ${projectDescription}` : '';
  return `You are an expert UI/UX developer. Apply the instruction below to the HTML file.

Read the existing HTML from: ${htmlFilePath}${ctx}

Instruction: ${instruction}

Output ONLY a raw JSON array of search-replace patches. No explanation, no markdown, no HTML.
The output must start with [ and end with ].

Format:
[{"search":"exact substring copied from the HTML","replace":"new content"}]

Rules:
- Each "search" must be an exact, unique substring of the HTML in the file
- Include at least 20 surrounding characters so the string is unambiguous
- Replace the smallest snippet that achieves the change — do not repeat unchanged content
- Multiple patches are fine and applied in order`;
}

function extractPatches(text) {
  const clean = stripAnsi(text);
  const start = clean.indexOf('[');
  const end   = clean.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(clean.slice(start, end + 1));
    if (Array.isArray(parsed) && parsed.length > 0 &&
        parsed.every(p => typeof p.search === 'string' && 'replace' in p)) {
      return parsed;
    }
  } catch (_) {}
  return null;
}

function applyPatches(html, patches) {
  let result = html;
  for (const { search, replace } of patches) {
    if (!result.includes(search)) {
      throw new Error(`Patch search string not found: "${search.slice(0, 80)}"`);
    }
    result = result.split(search).join(replace);
  }
  return result;
}

// ----------------------------------------------------------------
// Anthropic SSE streaming
// ctx controls subprocess lifetime; tokenCh/doneCh are the IPC channels.
// ----------------------------------------------------------------
function runAnthropic(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, _cwd, rawMode, systemPrompt) {
  _logAiCall('anthropic', model.model_name || 'claude-sonnet-4-6', null, messages || prompt);
  let msgs;
  let isDiffMode = false;
  if (editPayload) {
    isDiffMode = true;
    const content = buildDiffPromptInline(editPayload.instruction, editPayload.htmlContent, editPayload.projectDescription);
    msgs = [{ role: 'user', content }];
  } else if (messages && messages.length > 0) {
    msgs = messages;
  } else {
    msgs = [{ role: 'user', content: prompt }];
  }

  // Cache the stable system context (layer prompt / screen design) so repeated
  // calls within a run only pay ~10% of those input tokens on cache hits.
  const systemArr = systemPrompt
    ? [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    : undefined;

  const bodyObj = {
    model:      model.model_name || 'claude-sonnet-4-6',
    max_tokens: model.max_tokens || 8096,
    stream:     true,
    messages:   msgs,
  };
  if (systemArr) bodyObj.system = systemArr;
  const body = JSON.stringify(bodyObj);

  let finished = false;
  const finish = (result) => {
    if (finished) return;
    finished  = true;
    ctx.req   = null;
    send(wc, doneCh, result);
  };

  const req = https.request({
    hostname: 'api.anthropic.com',
    path:     '/v1/messages',
    method:   'POST',
    headers: {
      'Content-Type':        'application/json',
      'x-api-key':           model.api_key || '',
      'anthropic-version':   '2023-06-01',
      'anthropic-beta':      'prompt-caching-2024-07-31',
      'Content-Length':      Buffer.byteLength(body),
    },
  }, (res) => {
    let accumulated = '';
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    res.on('data', (chunk) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const data = JSON.parse(raw);
          if (data.type === 'message_start') {
            const u = data.message?.usage || {};
            usage.input_tokens                = u.input_tokens                || 0;
            usage.cache_read_input_tokens     = u.cache_read_input_tokens     || 0;
            usage.cache_creation_input_tokens = u.cache_creation_input_tokens || 0;
          }
          if (data.type === 'message_delta') {
            usage.output_tokens = data.usage?.output_tokens || 0;
          }
          if (data.type === 'content_block_delta' && data.delta?.text) {
            accumulated += data.delta.text;
            send(wc, tokenCh, { text: data.delta.text });
          }
          if (data.type === 'message_stop') {
            if (rawMode) {
              finish({ html: null, raw: accumulated, usage, error: null });
            } else if (isDiffMode) {
              const patches = extractPatches(accumulated);
              if (patches) {
                try {
                  const html = applyPatches(editPayload.htmlContent, patches);
                  finish({ html, raw: accumulated, usage, error: null });
                } catch (err) {
                  const html = extractHtml(accumulated);
                  finish({ html, raw: accumulated, usage, error: html ? null : `Patch failed (${err.message}) and no full HTML found` });
                }
              } else {
                const html = extractHtml(accumulated);
                finish({ html, raw: accumulated, usage, error: html ? null : 'No patches or HTML found in response' });
              }
            } else {
              const html = extractHtml(accumulated);
              finish({ html, raw: accumulated, usage, error: html ? null : 'Could not extract HTML from response' });
            }
          }
        } catch (_) {}
      }
    });
    res.on('error', (err) => finish({ html: null, raw: '', error: err.message }));
  });

  req.on('error', (err) => {
    finish({ html: null, raw: '', error: ctx.cancelled ? 'Cancelled' : err.message });
  });

  ctx.req = req;
  req.write(body);
  req.end();
}

// ----------------------------------------------------------------
// Ollama — Python proxy subprocess
// ----------------------------------------------------------------
const OLLAMA_SYSTEM_HTML = {
  role: 'system',
  content: 'You are an expert UI/UX developer. You MUST output ONLY raw, complete HTML starting with <!DOCTYPE html> and ending with </html>. Never explain, describe, or comment on the HTML. Never use markdown code fences. Output nothing except the HTML document itself.',
};

const OLLAMA_SYSTEM_DIFF = {
  role: 'system',
  content: 'You are an expert UI/UX developer. You MUST output ONLY a raw JSON array of search-replace patches. Never explain, never output HTML, never use markdown. The output must start with [ and end with ].',
};

function runOllama(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, _cwd, rawMode) {
  _logAiCall('ollama', model.model_name || '(no model)', null, messages || prompt);
  let msgs;
  let isDiffMode = false;

  if (editPayload) {
    isDiffMode = true;
    const content = buildDiffPromptInline(editPayload.instruction, editPayload.htmlContent, editPayload.projectDescription);
    msgs = [OLLAMA_SYSTEM_DIFF, { role: 'user', content }];
  } else if (messages && messages.length > 0) {
    msgs = messages[0]?.role === 'system' ? messages : [OLLAMA_SYSTEM_HTML, ...messages];
  } else {
    msgs = [OLLAMA_SYSTEM_HTML, { role: 'user', content: prompt }];
  }

  const ts      = Date.now();
  const tmpFile = path.join(os.tmpdir(), `ai-sdlc-ollama-${ts}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(msgs), 'utf8');
  } catch (err) {
    send(wc, doneCh, { html: null, raw: '', error: `Failed to write temp file: ${err.message}` });
    return;
  }

  const agentPath = path.join(__dirname, '../../../../agent/ollama_proxy.py');
  const baseUrl   = (model.base_url || 'http://localhost:11434').replace(/\/$/, '');
  const cleanup   = () => { try { fs.unlinkSync(tmpFile); } catch (_) {} };
  let accumulated = '';

  ctx.proc = spawn('python', [
    agentPath,
    '--messages-file', tmpFile,
    '--model',         model.model_name,
    '--base-url',      baseUrl,
    '--verbose',
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env } });

  ctx.proc.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    accumulated += text;
    send(wc, tokenCh, { text });
  });

  ctx.proc.stderr.on('data', (chunk) => {
    send(wc, tokenCh, { text: chunk.toString('utf8') });
  });

  ctx.proc.on('close', (code) => {
    cleanup();
    if (ctx.cancelled) return;

    let html  = null;
    let error = null;

    if (isDiffMode) {
      const patches = extractPatches(accumulated);
      if (patches) {
        try {
          html = applyPatches(editPayload.htmlContent, patches);
        } catch (err) {
          html  = extractHtml(accumulated);
          error = html ? null : `Patch failed (${err.message}) and no full HTML found`;
        }
      } else {
        html  = extractHtml(accumulated);
        error = html ? null : (code !== 0 ? `Process exited with code ${code}` : 'No patches or HTML found in response');
      }
    } else if (rawMode) {
      error = code !== 0 ? `Process exited with code ${code}` : null;
    } else {
      html  = extractHtml(accumulated);
      error = html ? null : (code !== 0 ? `Process exited with code ${code}` : 'Could not extract HTML from response');
    }

    send(wc, doneCh, { html, raw: accumulated, error });
    ctx.proc = null;
  });

  ctx.proc.on('error', (err) => {
    cleanup();
    send(wc, doneCh, { html: null, raw: accumulated, error: err.message });
    ctx.proc = null;
  });
}

// ----------------------------------------------------------------
// CLI — hidden PowerShell spawn, prompt via temp file
// ----------------------------------------------------------------
function runCli(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode) {
  const exe       = model.executable || 'claude';
  const modelName = model.model_name || DEFAULT_CLI_MODEL;
  _logAiCall('cli', modelName, exe, messages || prompt);

  // Resolve flags template — fall back to Claude defaults for configs saved before this change
  const skipPermsFlag  = (model.skip_perms_flag != null) ? model.skip_perms_flag : '--dangerously-skip-permissions';
  const permsPrefix    = skipPermsFlag ? skipPermsFlag + ' ' : '';
  const flagsTemplate  = (model.flags || '').trim() || `${permsPrefix}--model ${modelName} '@{{prompt}}'`;
  const resolvedFlags  = flagsTemplate.replace(/\{\{model\}\}/g, modelName);
  const hasInlinePrompt = resolvedFlags.includes('{{prompt}}');

  const ts = Date.now();

  let promptText;
  let htmlTmpFile = null;
  let isDiffMode  = false;

  if (editPayload) {
    htmlTmpFile = path.join(os.tmpdir(), `ai-sdlc-html-${ts}.html`);
    try {
      fs.writeFileSync(htmlTmpFile, editPayload.htmlContent, 'utf8');
    } catch (err) {
      send(wc, doneCh, { html: null, raw: '', error: `Failed to write HTML temp file: ${err.message}` });
      return;
    }
    promptText = buildDiffPromptWithRef(editPayload.instruction, htmlTmpFile, editPayload.projectDescription);
    isDiffMode = true;
  } else if (messages && messages.length > 1) {
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

  const tmpFile = path.join(os.tmpdir(), `ai-sdlc-chat-${ts}.txt`);
  try {
    fs.writeFileSync(tmpFile, promptText, 'utf8');
  } catch (err) {
    if (htmlTmpFile) { try { fs.unlinkSync(htmlTmpFile); } catch (_) {} }
    send(wc, doneCh, { html: null, raw: '', error: `Failed to write temp file: ${err.message}` });
    return;
  }

  // {{prompt}} = temp file path; each CLI reads the prompt from the file in its own way
  // (Claude: '@filepath', agy/copilot: -p 'filepath', aider: --message 'filepath')
  const safeTmp    = tmpFile.replace(/'/g, "''");
  let psCmd;
  if (hasInlinePrompt) {
    const finalFlags = resolvedFlags.replace('{{prompt}}', safeTmp);
    psCmd = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null;',
      `${exe} ${finalFlags}`,
    ].join('\n');
  } else {
    // Stdin pipe fallback for any custom template without {{prompt}}
    psCmd = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null;',
      `Get-Content -Path '${safeTmp}' -Raw | ${exe} ${resolvedFlags}`,
    ].join('\n');
  }

  let accumulated = '';

  const cleanup = () => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    if (htmlTmpFile) { try { fs.unlinkSync(htmlTmpFile); } catch (_) {} }
  };

  ctx.proc = spawn(
    'powershell.exe',
    ['-NoLogo', '-NonInteractive', '-Command', psCmd],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, ...(cwd ? { cwd } : {}) }
  );

  ctx.proc.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    accumulated += text;
    send(wc, tokenCh, { text });
  });
  ctx.proc.stderr.on('data', () => {});

  ctx.proc.on('close', (code) => {
    cleanup();
    if (ctx.cancelled) return;

    let html  = null;
    let error = null;

    if (isDiffMode) {
      const patches = extractPatches(accumulated);
      if (patches) {
        try {
          html = applyPatches(editPayload.htmlContent, patches);
        } catch (err) {
          html  = extractHtml(accumulated);
          error = html ? null : `Patch failed (${err.message}) and no full HTML found`;
        }
      } else {
        html  = extractHtml(accumulated);
        error = html ? null : (code !== 0 ? `Process exited with code ${code}` : 'No patches or HTML found in response');
      }
    } else if (rawMode) {
      error = code !== 0 ? `Process exited with code ${code}` : null;
    } else {
      html  = extractHtml(accumulated);
      error = html ? null : (code !== 0 ? `Process exited with code ${code}` : 'Could not extract HTML from response');
    }

    send(wc, doneCh, { html, raw: accumulated, error });
    ctx.proc = null;
  });

  ctx.proc.on('error', (err) => {
    cleanup();
    send(wc, doneCh, { html: null, raw: accumulated, error: err.message });
    ctx.proc = null;
  });
}

// ----------------------------------------------------------------
// OpenAI-compatible streaming proxy (OpenAI, Groq, Ollama /v1, etc.)
// ----------------------------------------------------------------
function runApi(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, _cwd, rawMode) {
  _logAiCall('api', model.model_name || '(no model)', 'python openai_proxy.py', messages || prompt);
  const ts = Date.now();

  let msgs;
  let isDiffMode = false;

  if (editPayload) {
    isDiffMode = true;
    const content = buildDiffPromptInline(editPayload.instruction, editPayload.htmlContent, editPayload.projectDescription);
    msgs = [{ role: 'user', content }];
  } else if (messages && messages.length > 0) {
    msgs = messages;
  } else {
    msgs = [{ role: 'user', content: prompt }];
  }

  const tmpFile = path.join(os.tmpdir(), `ai-sdlc-api-${ts}.json`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(msgs), 'utf8');
  } catch (err) {
    send(wc, doneCh, { html: null, raw: '', error: `Failed to write temp file: ${err.message}` });
    return;
  }

  const agentPath = path.join(__dirname, '../../../../agent/openai_proxy.py');
  const spawnArgs = [
    agentPath,
    '--messages-file', tmpFile,
    '--model',         model.model_name || 'gpt-4o',
    '--api-key',       model.api_key    || '',
  ];
  if (model.base_url)   spawnArgs.push('--base-url',   model.base_url);
  if (model.max_tokens) spawnArgs.push('--max-tokens', String(model.max_tokens));

  const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch (_) {} };
  let accumulated = '';

  ctx.proc = spawn('python', spawnArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env },
  });

  ctx.proc.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    accumulated += text;
    send(wc, tokenCh, { text });
  });
  ctx.proc.stderr.on('data', () => {});

  ctx.proc.on('close', (code) => {
    cleanup();
    if (ctx.cancelled) return;

    let html  = null;
    let error = null;

    if (isDiffMode) {
      const patches = extractPatches(accumulated);
      if (patches) {
        try {
          html = applyPatches(editPayload.htmlContent, patches);
        } catch (err) {
          html  = extractHtml(accumulated);
          error = html ? null : `Patch failed (${err.message}) and no full HTML found`;
        }
      } else {
        html  = extractHtml(accumulated);
        error = html ? null : (code !== 0 ? `Process exited with code ${code}` : 'No patches or HTML found in response');
      }
    } else {
      // Plain prompt (e.g. test generation) — no HTML extraction needed
      error = code !== 0 ? `Process exited with code ${code}` : null;
    }

    send(wc, doneCh, { html, raw: accumulated, error });
    ctx.proc = null;
  });

  ctx.proc.on('error', (err) => {
    cleanup();
    send(wc, doneCh, { html: null, raw: accumulated, error: err.message });
    ctx.proc = null;
  });
}

// ----------------------------------------------------------------
// Dispatch helper — picks the right backend
// ----------------------------------------------------------------
function dispatch(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode, systemPrompt) {
  if (model.type === 'anthropic') {
    runAnthropic(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode, systemPrompt);
  } else if (model.type === 'ollama') {
    runOllama(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode);
  } else if (model.type === 'api') {
    runApi(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode);
  } else {
    runCli(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode);
  }
}

function buildValidationPrompt(screenTitle, htmlContent, designTemplate) {
  const trimmed = htmlContent.length > 60000 ? htmlContent.slice(0, 60000) + '\n<!-- truncated -->' : htmlContent;
  return `You are a UI/UX quality auditor. Check whether the HTML screen below correctly implements the design system specification.

Design System:
${designTemplate}

Screen: ${screenTitle}
HTML:
${trimmed}

Check for violations in:
- Colors (backgrounds, text, buttons, borders, links — must match design system values)
- Typography (font-family, font sizes, font weights)
- Spacing, border-radius, and component styling

Respond with ONLY a raw JSON object. No explanation, no markdown fences.
If compliant: {"valid":true,"issues":[]}
If violations found: {"valid":false,"issues":["description of violation 1","description of violation 2"]}`;
}

// ----------------------------------------------------------------
// Register IPC handlers
// ----------------------------------------------------------------
function registerChatHandlers() {
  // --- Main window chat (chat:*) ---
  safeHandle('chat:cancel', () => killCtx(_mainCtx));

  safeHandle('chat:generate', (event, { prompt, messages, editPayload, model, cwd, rawMode }) => {
    if (_mainCtx.proc || _mainCtx.req) killCtx(_mainCtx);
    _mainCtx.cancelled = false;
    dispatch(event.sender, prompt, editPayload, model, messages, _mainCtx, 'chat:token', 'chat:done', cwd, rawMode);
    return { started: true };
  });

  // --- Style validation (chat:validateStyle) — separate subprocess slot ---
  safeHandle('chat:validateCancel', () => killCtx(_validateCtx));

  safeHandle('chat:validateStyle', (event, { screenTitle, htmlContent, designTemplate, model }) => {
    if (_validateCtx.proc || _validateCtx.req) killCtx(_validateCtx);
    _validateCtx.cancelled = false;
    const prompt = buildValidationPrompt(screenTitle, htmlContent, designTemplate);
    dispatch(event.sender, prompt, null, model, null, _validateCtx, 'chat:validateToken', 'chat:validateDone');
    return { started: true };
  });

  // --- Workflow runner window chat (workflowChat:*) — separate subprocess slot ---
  safeHandle('workflowChat:cancel', () => killCtx(_workflowCtx));

  safeHandle('workflowChat:generate', (event, { prompt, model, cwd, systemPrompt }) => {
    if (_workflowCtx.proc || _workflowCtx.req) killCtx(_workflowCtx);
    _workflowCtx.cancelled = false;
    dispatch(event.sender, prompt, null, model, null, _workflowCtx, 'workflowChat:token', 'workflowChat:done', cwd, true, systemPrompt);
    return { started: true };
  });

  // --- Generate Workflows window chat (genWorkflowChat:*) — separate subprocess slot ---
  safeHandle('genWorkflowChat:cancel', () => killCtx(_genWfCtx));

  safeHandle('genWorkflowChat:generate', (event, { prompt, model }) => {
    if (_genWfCtx.proc || _genWfCtx.req) killCtx(_genWfCtx);
    _genWfCtx.cancelled = false;
    dispatch(event.sender, prompt, null, model, null, _genWfCtx, 'genWorkflowChat:token', 'genWorkflowChat:done', null, true);
    return { started: true };
  });

  // --- Test generation window chat (testGenChat:*) — separate subprocess slot ---
  safeHandle('testGenChat:cancel', () => killCtx(_testGenCtx));

  safeHandle('testGenChat:generate', (event, { prompt, model }) => {
    if (_testGenCtx.proc || _testGenCtx.req) killCtx(_testGenCtx);
    _testGenCtx.cancelled = false;
    dispatch(event.sender, prompt, null, model, null, _testGenCtx, 'testGenChat:token', 'testGenChat:done', null, true);
    return { started: true };
  });

}

module.exports = { registerChatHandlers };
