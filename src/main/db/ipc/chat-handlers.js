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

const _mainCtx           = createCtx();
const _workflowCtx       = createCtx();
const _genWfCtx          = createCtx();
const _testGenCtx        = createCtx();
const _screenAnalysisCtx = createCtx();

function _logAiCall(type, modelName, exe, promptOrMessages, flags) {
  const ts    = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const label = flags ? `${exe} ${flags}` : (exe ? `${exe} --model ${modelName}` : `model=${modelName}`);
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

// Best-effort salvage when the response was cut off (e.g. hit max_tokens)
// before the closing </html> ever streamed — returns everything from
// <!DOCTYPE html> onward, unclosed, so the caller can render *something*
// instead of discarding a mostly-complete document.
function extractPartialHtml(text) {
  const clean = stripAnsi(text);
  const start = clean.search(/<!DOCTYPE\s+html/i);
  if (start === -1) return null;
  const partial = clean.slice(start).trim();
  return partial || null;
}

// Anthropic's real per-model output ceilings — not user-configurable, since
// requesting above a model's actual max just 400s. Haiku models cap at 64K;
// everything else current (Sonnet, Opus, Fable) caps at 128K.
function resolveAnthropicMaxTokens(modelName) {
  return /haiku/i.test(modelName || '') ? 64000 : 128000;
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

// Walks from the array's opening '[' tracking bracket depth and string state
// so stray '[' / ']' characters inside surrounding prose (or inside search/
// replace values, e.g. CSS attribute selectors like a[href]) don't fool a
// naive indexOf/lastIndexOf scan into slicing the wrong boundaries.
function findJsonArrayEnd(text, start) {
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function extractPatches(text) {
  const clean = stripAnsi(text);
  const start = clean.indexOf('[');
  if (start === -1) return null;

  const end = findJsonArrayEnd(clean, start);
  if (end !== -1) {
    try {
      const parsed = JSON.parse(clean.slice(start, end + 1));
      if (Array.isArray(parsed) && parsed.length > 0 &&
          parsed.every(p => typeof p.search === 'string' && 'replace' in p)) {
        return parsed;
      }
    } catch (_) {}
  }

  // Salvage: the array was cut off mid-stream (e.g. hit max_tokens) or is
  // otherwise malformed — recover whichever complete {"search":...,"replace":...}
  // objects did stream instead of discarding the whole response.
  const patches = [];
  const objRe = /\{\s*"search"\s*:\s*"(?:[^"\\]|\\.)*"\s*,\s*"replace"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}/g;
  let m;
  while ((m = objRe.exec(clean.slice(start))) !== null) {
    try {
      const obj = JSON.parse(m[0]);
      if (typeof obj.search === 'string' && 'replace' in obj) patches.push(obj);
    } catch (_) {}
  }
  return patches.length > 0 ? patches : null;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyPatches(html, patches) {
  let result = html;
  for (const { search, replace } of patches) {
    if (result.includes(search)) {
      result = result.split(search).join(replace);
      continue;
    }
    // Fallback: models often echo HTML back with slightly different
    // whitespace (re-indented, wrapped differently) than what's actually
    // stored — tolerate runs-of-whitespace drift before giving up.
    const pattern = escapeRegExp(search).replace(/\s+/g, '\\s+');
    let re = null;
    try { re = new RegExp(pattern); } catch (_) {}
    if (re && re.test(result)) {
      result = result.replace(re, () => replace);
      continue;
    }
    throw new Error(`Patch search string not found: "${search.slice(0, 80)}"`);
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

  const modelName = model.model_name || 'claude-sonnet-4-6';
  const bodyObj = {
    model:      modelName,
    max_tokens: resolveAnthropicMaxTokens(modelName),
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
    let rawBody     = '';
    let stopReason  = null;
    const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    // On a max_tokens cutoff, fall back to whatever HTML streamed so far
    // instead of discarding a mostly-complete document.
    const htmlOrPartial = () => {
      const html = extractHtml(accumulated);
      if (html) return { html, error: null };
      if (stopReason === 'max_tokens') {
        const partial = extractPartialHtml(accumulated);
        if (partial) {
          return { html: partial, error: 'Response was cut off (max tokens reached) — showing partial output. Raise Max Tokens in Model Settings to avoid this.' };
        }
        return { html: null, error: 'Response was cut off (max tokens reached) before any usable HTML streamed — raise Max Tokens in Model Settings.' };
      }
      return { html: null, error: 'Could not extract HTML from response' };
    };
    res.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      rawBody += text;
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      for (const line of text.split('\n')) {
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
            if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
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
              const { html, error } = htmlOrPartial();
              finish({ html, raw: accumulated, usage, error });
            }
          }
        } catch (_) {}
      }
    });
    res.on('error', (err) => finish({ html: null, raw: '', error: err.message }));

    res.on('end', () => {
      if (finished) return;
      // Stream ended without a message_stop — either a non-2xx error response
      // (Anthropic sends a plain JSON error body, not SSE) or a dropped connection.
      if (res.statusCode < 200 || res.statusCode >= 300) {
        let msg = `Anthropic API error (HTTP ${res.statusCode})`;
        try {
          const parsed = JSON.parse(rawBody);
          if (parsed?.error?.message) msg = parsed.error.message;
        } catch (_) {}
        finish({ html: null, raw: accumulated, error: msg });
      } else {
        finish({ html: null, raw: accumulated, error: 'Connection closed before response completed' });
      }
    });
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

function runOllama(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, _cwd, rawMode, systemPrompt) {
  _logAiCall('ollama', model.model_name || '(no model)', null, messages || prompt);
  let msgs;
  let isDiffMode = false;

  if (editPayload) {
    isDiffMode = true;
    const content = buildDiffPromptInline(editPayload.instruction, editPayload.htmlContent, editPayload.projectDescription);
    msgs = [OLLAMA_SYSTEM_DIFF, { role: 'user', content }];
  } else if (messages && messages.length > 0) {
    msgs = messages[0]?.role === 'system' ? messages : [OLLAMA_SYSTEM_HTML, ...messages];
  } else if (systemPrompt) {
    // Caller supplied its own system context (e.g. a workflow layer's
    // purpose/instructions) — use it as-is instead of forcing the
    // HTML-only system prompt, which only applies to the screen-design
    // generator's callers (those never pass systemPrompt).
    msgs = [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }];
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

  const agentPath = path.join(__dirname, '../../../../devflow-cli/ollama_proxy.py');
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
      html = extractHtml(accumulated);
      if (!html && code === 0) {
        // Process exited cleanly but no complete document ever streamed —
        // most often the model's own output-length limit truncated it.
        // Salvage whatever HTML did stream instead of discarding it.
        const partial = extractPartialHtml(accumulated);
        if (partial) {
          html  = partial;
          error = 'Response appears to be cut off — showing partial output. Try raising the model\'s output/token limit.';
        } else {
          error = 'Could not extract HTML from response';
        }
      } else {
        error = html ? null : `Process exited with code ${code}`;
      }
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

  // Resolve flags template — fall back to Claude defaults for configs saved before this change.
  // The skip-perms flag must be prepended whether or not a custom CLI Command
  // is saved — otherwise the CLI runs with permission prompts enabled and
  // stalls waiting for input that never arrives (stdin is piped/ignored here).
  const skipPermsFlag  = (model.skip_perms_flag != null) ? model.skip_perms_flag : '--dangerously-skip-permissions';
  const permsPrefix    = skipPermsFlag ? skipPermsFlag + ' ' : '';
  const userFlags      = (model.flags || '').trim();
  const flagsTemplate  = `${permsPrefix}${userFlags || `--model ${modelName} '@{{prompt}}'`}`;
  // {{cwd}} — e.g. agy/Gemini configs' `--add-dir "{{cwd}}"` — must resolve to
  // the actual project folder, not stay as a literal placeholder (which agy
  // rejects as an invalid path). Escape embedded double quotes since the
  // template always wraps {{cwd}} in "..." for the PowerShell command line.
  const escapedCwd     = (cwd || '').replace(/"/g, '\\"');
  const resolvedFlags  = flagsTemplate
    .replace(/\{\{model\}\}/g, modelName)
    .replace(/\{\{cwd\}\}/g, escapedCwd);
  const hasInlinePrompt = resolvedFlags.includes('{{prompt}}');

  const ts = Date.now();

  // Claude Code CLI sandboxes file reads (including the '@promptfile' context
  // reference below) to within its working directory — a path under the OS
  // temp dir sits outside that sandbox and gets rejected with "outside the
  // allowed working directory". Write the temp prompt file inside the same
  // directory the CLI is spawned in instead (cwd, or process.cwd() when no
  // cwd is passed — that's what the spawn below inherits).
  const tmpDir = path.join(cwd || process.cwd(), '.devflow-tmp');
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch (_) {}

  let promptText;
  let isDiffMode  = false;

  if (editPayload) {
    // Embed the HTML directly in the prompt file (same as the API/Ollama
    // backends) instead of writing a second file and telling the model to
    // Read it — that required an actual Read tool call, which a model
    // config with --disallowedTools "Read,..." (e.g. the default "General
    // Purpose" configs) blocks outright, and read as a suspicious embedded
    // instruction besides. Inline content only needs the same '@promptfile'
    // context reference already used to pass the instruction itself.
    promptText = buildDiffPromptInline(editPayload.instruction, editPayload.htmlContent, editPayload.projectDescription);
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

  _logAiCall('cli', modelName, exe, promptText, resolvedFlags);

  const tmpFile = path.join(tmpDir, `ai-sdlc-chat-${ts}.txt`);
  try {
    fs.writeFileSync(tmpFile, promptText, 'utf8');
  } catch (err) {
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
      html = extractHtml(accumulated);
      if (!html && code === 0) {
        // Process exited cleanly but no complete document ever streamed —
        // most often the model's own output-length limit truncated it.
        // Salvage whatever HTML did stream instead of discarding it.
        const partial = extractPartialHtml(accumulated);
        if (partial) {
          html  = partial;
          error = 'Response appears to be cut off — showing partial output. Try raising the model\'s output/token limit.';
        } else {
          error = 'Could not extract HTML from response';
        }
      } else {
        error = html ? null : `Process exited with code ${code}`;
      }
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
function runApi(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, _cwd, rawMode, systemPrompt) {
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
  } else if (systemPrompt) {
    msgs = [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }];
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

  const agentPath = path.join(__dirname, '../../../../devflow-cli/openai_proxy.py');
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
// Ollama via devflow_agent.py — dedicated, native Ollama agentic loop
// with real file-write tools.
//
// Used instead of the plain ollama_proxy.py streaming proxy when the
// model config has "Use Devflow Agent loop" enabled. ollama_proxy.py is a
// bare chat completion — it can only return text, never touch the
// filesystem. devflow_agent.py talks to Ollama directly via the native
// `ollama` package (ollama.Client(...).chat(..., tools=TOOLS)) — no
// OpenAI-compatibility shim, no base-url/`/v1` guessing — and runs the
// same tool-calling loop (read_file/write_file/run_command/etc.) scoped
// to `cwd`, so an Ollama-backed workflow layer can actually create or
// modify files in its linked Project Layer folder.
//
// (agent.py's generic --provider ollama path, which goes through the
// shared OpenAI-compatible shim, is left as-is for direct CLI use, but
// the app routes Ollama devflow-agent runs through this dedicated script
// instead — it's simpler and avoids that shim's provider-specific quirks.)
// ----------------------------------------------------------------
function runDevflowAgent(wc, prompt, model, ctx, tokenCh, doneCh, cwd, systemPrompt) {
  const spawnCwd    = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();
  const fullPrompt  = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : (prompt || '');

  _logAiCall('devflow-agent', model.model_name || '(no model)', 'python devflow_agent.py', fullPrompt);

  const agentPath = path.join(__dirname, '../../../../devflow-cli/devflow_agent.py');
  const spawnArgs = [
    agentPath,
    '--project',   spawnCwd,
    '--message',   fullPrompt,
    '--model',     model.model_name || 'qwen2.5-coder:7b',
    '--base-url',  model.base_url   || 'http://localhost:11434',
    '--max-turns', String(model.max_tokens || 15),
    '--verbose',
  ];

  console.log(`[devflow-agent] cwd (--project) = ${spawnCwd}`);
  console.log(`[devflow-agent] spawn: python ${JSON.stringify(spawnArgs)}`);

  ctx.proc = spawn('python', spawnArgs, { cwd: spawnCwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env } });

  let accumulated = '';

  ctx.proc.stdout.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    accumulated += text;
    send(wc, tokenCh, { text });
  });
  ctx.proc.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8');
    accumulated += text;
    send(wc, tokenCh, { text });
  });

  ctx.proc.on('close', (code) => {
    if (ctx.cancelled) return;
    send(wc, doneCh, { html: null, raw: accumulated, error: code !== 0 ? `Process exited with code ${code}` : null });
    ctx.proc = null;
  });
  ctx.proc.on('error', (err) => {
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
    // Screen-design edit/diff flows still need the plain proxy's JSON-patch
    // output format — only route plain generate calls through the agent.
    if (model.use_devflow_agent && !editPayload) {
      runDevflowAgent(wc, prompt, model, ctx, tokenCh, doneCh, cwd, systemPrompt);
    } else {
      runOllama(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode, systemPrompt);
    }
  } else if (model.type === 'api') {
    runApi(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode, systemPrompt);
  } else {
    runCli(wc, prompt, editPayload, model, messages, ctx, tokenCh, doneCh, cwd, rawMode);
  }
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

  safeHandle('testGenChat:generate', (event, { prompt, model, cwd }) => {
    if (_testGenCtx.proc || _testGenCtx.req) killCtx(_testGenCtx);
    _testGenCtx.cancelled = false;
    dispatch(event.sender, prompt, null, model, null, _testGenCtx, 'testGenChat:token', 'testGenChat:done', cwd || null, true);
    return { started: true };
  });

  // --- Screen functional-analysis chat (screenAnalysisChat:*) — separate subprocess slot ---
  safeHandle('screenAnalysisChat:cancel', () => killCtx(_screenAnalysisCtx));

  safeHandle('screenAnalysisChat:generate', (event, { prompt, model }) => {
    if (_screenAnalysisCtx.proc || _screenAnalysisCtx.req) killCtx(_screenAnalysisCtx);
    _screenAnalysisCtx.cancelled = false;
    dispatch(event.sender, prompt, null, model, null, _screenAnalysisCtx, 'screenAnalysisChat:token', 'screenAnalysisChat:done', null, true);
    return { started: true };
  });

}

module.exports = { registerChatHandlers };
