'use strict';

const { ipcMain, BrowserWindow, app } = require('electron');
const { safeHandle }      = require('../../ipc-safe-handle');
const { spawn, execSync } = require('child_process');
const http  = require('node:http');
const https = require('node:https');
const fs    = require('node:fs');
const os    = require('node:os');
const path  = require('node:path');
const { getTelegramConfig }    = require('../../app-config');
const { sendMessage: tgSend }  = require('../../telegram');

let _activeQueueProc = null;

function _flashWin(wc) {
  const win = BrowserWindow.fromWebContents(wc);
  if (!win || win.isFocused()) return;
  win.flashFrame(true);
  if (process.platform === 'darwin') app.dock.bounce('informational');
}

// ----------------------------------------------------------------
// AI call logger — prints every outgoing model invocation so you
// can audit which model is actually used and what prompt is sent.
// Format:  [HH:MM:SS] [queue:<type>]  exe --model NAME [flags]  cwd=X  "first line…"
// ----------------------------------------------------------------
function _logAiCall(type, modelName, exe, promptOrMessages, cwd, flags) {
  const ts     = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const flagStr = flags ? `  ${flags}` : '';
  const label   = exe ? `${exe} --model ${modelName}${flagStr}` : `model=${modelName}${flagStr}`;
  const cwdStr  = cwd ? `  cwd=${path.basename(cwd)}` : '';

  let preview = '';
  if (typeof promptOrMessages === 'string') {
    preview = promptOrMessages.trimStart();
  } else if (Array.isArray(promptOrMessages) && promptOrMessages.length) {
    preview = (promptOrMessages.find(m => m.role === 'user')?.content || '').trimStart();
  }
  const lines   = preview.split('\n').map(l => l.trim()).filter(Boolean);
  const snippet = lines.slice(0, 2).join(' ↵ ').slice(0, 120);

  console.log(`[${ts}] [queue:${type}]  ${label}${cwdStr}  "${snippet}"`);
}

function killTree(proc) {
  if (!proc) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { windowsHide: true }); } catch (_) {}
  } else {
    try { proc.kill('SIGTERM'); } catch (_) {}
  }
}

// Trim oldest messages when total content exceeds maxChars (~200K tokens)
function trimMessages(messages, maxChars = 800_000) {
  let total = messages.reduce((s, m) => s + m.content.length, 0);
  let i = 0;
  while (total > maxChars && i < messages.length - 1) {
    total -= messages[i].content.length;
    i++;
  }
  return messages.slice(i);
}

// Format a messages array as a plain-text conversation for CLI backends
function messagesToText(messages) {
  return messages.map(m => {
    const label = m.role === 'user' ? 'User' : 'Assistant';
    return `[${label}]\n${m.content}`;
  }).join('\n\n');
}

function _fmtTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function _notifyTelegram(projectName, label, phase, exitCode, duration) {
  try {
    const cfg = getTelegramConfig();
    if (!cfg.botToken || !cfg.chatId) return;
    const now     = _fmtTime(new Date());
    const projLine = projectName ? `Project: \`${projectName}\`` : null;
    let text;
    if (phase === 'start') {
      const lines = [`*DevFlow Job Started*`];
      if (projLine) lines.push(projLine);
      lines.push(`Job: \`${label}\``, `Time: ${now}`);
      text = lines.join('\n');
    } else if (exitCode === 0) {
      const lines = [`✅ *DevFlow: Job Completed*`];
      if (projLine) lines.push(projLine);
      lines.push(`Job: \`${label}\``, `Duration: ${duration}ms`, `Status: SUCCESS`);
      text = lines.join('\n');
    } else {
      const lines = [`❌ *DevFlow: Job FAILED*`];
      if (projLine) lines.push(projLine);
      lines.push(`Job: \`${label}\``, `Time: ${now}`);
      text = lines.join('\n');
    }
    await tgSend(cfg.botToken, cfg.chatId, text);
  } catch (_) {}
}

function registerQueueHandlers() {
  safeHandle('promptQueue:kill', () => {
    if (_activeQueueProc) { killTree(_activeQueueProc); _activeQueueProc = null; }
  });

  safeHandle('promptQueue:run', (event, { messages, modelConfig, cwd, itemLabel, projectName }) => {
    if (_activeQueueProc) { killTree(_activeQueueProc); _activeQueueProc = null; }

    const wc        = event.sender;
    const label     = itemLabel || 'job';
    const proj      = projectName || '';
    const startTime = Date.now();
    const send = (ch, payload) => {
      if (ch === 'promptQueue:done') {
        _notifyTelegram(proj, label, 'done', payload.exitCode, Date.now() - startTime);
      }
      if (!wc.isDestroyed()) {
        wc.send(ch, payload);
        if (ch === 'promptQueue:done') _flashWin(wc);
      }
    };
    const type = modelConfig?.type || 'cli';

    const trimmed = trimMessages(Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]);

    _notifyTelegram(proj, label, 'start', null, null);

    if (type === 'anthropic') {
      if (modelConfig?.use_devflow_agent) return _runAgentPy(send, trimmed, modelConfig, cwd, { planOnly: true });
      _runAnthropic(send, trimmed, modelConfig); return { pid: null };
    }
    if (type === 'ollama') {
      if (modelConfig?.use_devflow_agent) return _runDevflowAgent(send, trimmed, modelConfig, cwd, { planOnly: true });
      _runOllama(send, trimmed, modelConfig); return { pid: null };
    }
    if (type === 'api') {
      if (modelConfig?.use_devflow_agent) return _runAgentPy(send, trimmed, modelConfig, cwd, { planOnly: true });
      _runApi(send, trimmed, modelConfig); return { pid: null };
    }
    if (type === 'devflow-agent') { return _runDevflowAgent(send, trimmed, modelConfig, cwd, { planOnly: true }); }

    return _runCli(send, trimmed, modelConfig, cwd);
  });

  // Phase 2 — user approved the plan; spawn agent in execution mode
  safeHandle('promptQueue:approvePlan', (event, { plan, messages, modelConfig, cwd, itemLabel, projectName }) => {
    if (_activeQueueProc) { killTree(_activeQueueProc); _activeQueueProc = null; }

    const wc        = event.sender;
    const label     = itemLabel || 'job';
    const proj      = projectName || '';
    const startTime = Date.now();
    const send = (ch, payload) => {
      if (ch === 'promptQueue:done') {
        _notifyTelegram(proj, label, 'done', payload.exitCode, Date.now() - startTime);
      }
      if (!wc.isDestroyed()) {
        wc.send(ch, payload);
        if (ch === 'promptQueue:done') _flashWin(wc);
      }
    };

    const trimmed = trimMessages(Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]);
    _notifyTelegram(proj, label, 'start', null, null);

    const approveType = modelConfig?.type || 'ollama';
    if ((approveType === 'api' || approveType === 'anthropic') && modelConfig?.use_devflow_agent) {
      return _runAgentPy(send, trimmed, modelConfig, cwd, { approvedPlan: plan });
    }
    return _runDevflowAgent(send, trimmed, modelConfig, cwd, { approvedPlan: plan });
  });
}

// ----------------------------------------------------------------
// Devflow Agent (Python subprocess)
//
// options:
//   planOnly     {boolean} — pass --plan-only; emit promptQueue:plan on detection
//   approvedPlan {string}  — JSON string; pass --approved-plan; emit step events
// ----------------------------------------------------------------
function _runDevflowAgent(send, messages, modelConfig, cwd, options = {}) {
  _logAiCall('devflow-agent', modelConfig?.model_name || 'qwen2.5-coder:7b', 'python devflow_agent.py', messages, cwd);
  const agentPath = path.join(__dirname, '../../../../agent/devflow_agent.py');
  const task      = messages.map(m => (typeof m === 'string' ? m : m.content || '')).join('\n');

  const spawnArgs = [
    agentPath,
    '--project',   cwd || os.homedir(),
    '--message',   task,
    '--model',     modelConfig.model_name || 'qwen2.5-coder:7b',
    '--base-url',  modelConfig.base_url   || 'http://localhost:11434',
    '--max-turns', String(modelConfig.max_tokens || 5),
    '--verbose',
  ];

  if (options.planOnly) {
    spawnArgs.push('--plan-only');
  }
  if (options.approvedPlan) {
    spawnArgs.push('--approved-plan', options.approvedPlan);
  }

  const proc = spawn('python', spawnArgs, {
    cwd: cwd || os.homedir(),
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  _activeQueueProc = proc;

  // ── Plan marker detection ────────────────────────────────────────────────
  // When running in --plan-only mode the agent prints:
  //   [PLAN_START]{json}[PLAN_END]
  // We intercept those bytes, parse the JSON, and emit promptQueue:plan.
  // Everything before [PLAN_START] is forwarded normally as promptQueue:data.
  let planBuf   = '';
  let inPlan    = false;

  proc.stdout.on('data', d => {
    let remaining = d.toString('utf8');

    // ── Inside a plan block — keep accumulating ──────────────────────────
    if (inPlan) {
      const endIdx = remaining.indexOf('[PLAN_END]');
      if (endIdx === -1) {
        planBuf += remaining;
        return;
      }
      // Found the closing marker
      planBuf  += remaining.slice(0, endIdx);
      remaining  = remaining.slice(endIdx + '[PLAN_END]'.length);
      inPlan     = false;

      try {
        const plan = JSON.parse(planBuf.trim());
        send('promptQueue:plan', { plan });
      } catch (e) {
        send('promptQueue:data', { text: `[Plan parse error: ${e.message}]\n` });
      }
      planBuf = '';
      if (remaining) send('promptQueue:data', { text: remaining });
      return;
    }

    // ── Not in plan block — scan for [PLAN_START] ───────────────────────
    const startIdx = remaining.indexOf('[PLAN_START]');
    if (startIdx !== -1) {
      const pre = remaining.slice(0, startIdx);
      if (pre) send('promptQueue:data', { text: pre });

      const afterStart = remaining.slice(startIdx + '[PLAN_START]'.length);
      const endIdx     = afterStart.indexOf('[PLAN_END]');

      if (endIdx !== -1) {
        // Both markers on the same chunk
        planBuf = afterStart.slice(0, endIdx);
        remaining = afterStart.slice(endIdx + '[PLAN_END]'.length);
        try {
          const plan = JSON.parse(planBuf.trim());
          send('promptQueue:plan', { plan });
        } catch (e) {
          send('promptQueue:data', { text: `[Plan parse error: ${e.message}]\n` });
        }
        planBuf = '';
        if (remaining) send('promptQueue:data', { text: remaining });
      } else {
        // Only opening marker seen — accumulate until closing arrives
        planBuf = afterStart;
        inPlan  = true;
      }
      return;
    }

    // ── Step progress markers ────────────────────────────────────────────
    // [STEP:N/total] Title  →  emit promptQueue:step for UI progress bar
    // [STEP_DONE:N/total]   →  emit promptQueue:stepDone
    // [STEP_FAILED:N/total] →  emit promptQueue:stepFailed
    // These are also forwarded as promptQueue:data for the live output bubble.
    const stepMatch = remaining.match(/\[STEP:(\d+)\/(\d+)\]\s*(.*)/);
    if (stepMatch) {
      send('promptQueue:step', {
        stepNum:  parseInt(stepMatch[1]),
        total:    parseInt(stepMatch[2]),
        title:    stepMatch[3].trim(),
        state:    'running',
      });
    }
    const doneMatch = remaining.match(/\[STEP_DONE:(\d+)\/(\d+)\]/);
    if (doneMatch) {
      send('promptQueue:step', {
        stepNum: parseInt(doneMatch[1]),
        total:   parseInt(doneMatch[2]),
        state:   'done',
      });
    }
    const failMatch = remaining.match(/\[STEP_FAILED:(\d+)\/(\d+)\]/);
    if (failMatch) {
      send('promptQueue:step', {
        stepNum: parseInt(failMatch[1]),
        total:   parseInt(failMatch[2]),
        state:   'failed',
      });
    }

    // ── [DONE] run summary ───────────────────────────────────────────────
    // Format: [DONE] turns=N tool_calls=N tokens_in=N tokens_out=N elapsed=Xs files=[...]
    if (remaining.includes('[DONE]')) {
      const m = remaining.match(/\[DONE\] turns=(\d+) tool_calls=(\d+) tokens_in=(\d+) tokens_out=(\d+) elapsed=([\d.]+)s files=(\[.*?\])/);
      if (m) {
        let files = [];
        try { files = JSON.parse(m[6]); } catch (_) {}
        send('promptQueue:runSummary', {
          turns:      parseInt(m[1]),
          toolCalls:  parseInt(m[2]),
          tokensIn:   parseInt(m[3]),
          tokensOut:  parseInt(m[4]),
          elapsed:    parseFloat(m[5]),
          files,
        });
      }
    }

    send('promptQueue:data', { text: remaining });
  });

  proc.stderr.on('data', d => send('promptQueue:data', { text: d.toString('utf8') }));

  proc.on('close', code => {
    _activeQueueProc = null;
    send('promptQueue:done', { exitCode: code ?? 0 });
  });
  proc.on('error', err => {
    _activeQueueProc = null;
    send('promptQueue:data', { text: `devflow-agent error: ${err.message}\n` });
    send('promptQueue:done', { exitCode: 1 });
  });

  return { pid: proc.pid };
}

// ----------------------------------------------------------------
// agent.py — multi-provider (anthropic, api/custom, openai, etc.)
//
// Mirrors _runDevflowAgent but invokes agent.py with --provider
// instead of devflow_agent.py with --base-url.
// ----------------------------------------------------------------
function _runAgentPy(send, messages, modelConfig, cwd, options = {}) {
  const type     = modelConfig?.type || 'api';
  const provider = type === 'anthropic' ? 'anthropic' : 'custom';
  const model    = modelConfig?.model_name || (type === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o');

  _logAiCall('agent.py', model, `python agent.py --provider ${provider}`, messages, cwd);

  const agentPath = path.join(__dirname, '../../../../agent/agent.py');
  const task      = messages.map(m => (typeof m === 'string' ? m : m.content || '')).join('\n');

  const spawnArgs = [
    agentPath,
    '--project',   cwd || os.homedir(),
    '--message',   task,
    '--provider',  provider,
    '--model',     model,
    '--max-turns', String(modelConfig?.max_tokens || 15),
    '--verbose',
  ];

  if (provider === 'custom' && modelConfig?.base_url) {
    spawnArgs.push('--base-url', modelConfig.base_url);
  }
  if (options.planOnly)     spawnArgs.push('--plan-only');
  if (options.approvedPlan) spawnArgs.push('--approved-plan', options.approvedPlan);

  // Inject stored API key into the subprocess environment
  const env = { ...process.env };
  if (type === 'anthropic' && modelConfig?.api_key) env.ANTHROPIC_API_KEY = modelConfig.api_key;
  if (type === 'api'       && modelConfig?.api_key) env.CUSTOM_API_KEY    = modelConfig.api_key;

  const proc = spawn('python', spawnArgs, {
    cwd: cwd || os.homedir(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  _activeQueueProc = proc;

  let planBuf = '';
  let inPlan  = false;

  proc.stdout.on('data', d => {
    let remaining = d.toString('utf8');

    if (inPlan) {
      const endIdx = remaining.indexOf('[PLAN_END]');
      if (endIdx === -1) { planBuf += remaining; return; }
      planBuf  += remaining.slice(0, endIdx);
      remaining  = remaining.slice(endIdx + '[PLAN_END]'.length);
      inPlan     = false;
      try { send('promptQueue:plan', { plan: JSON.parse(planBuf.trim()) }); }
      catch (e) { send('promptQueue:data', { text: `[Plan parse error: ${e.message}]\n` }); }
      planBuf = '';
      if (remaining) send('promptQueue:data', { text: remaining });
      return;
    }

    const startIdx = remaining.indexOf('[PLAN_START]');
    if (startIdx !== -1) {
      const pre = remaining.slice(0, startIdx);
      if (pre) send('promptQueue:data', { text: pre });
      const afterStart = remaining.slice(startIdx + '[PLAN_START]'.length);
      const endIdx     = afterStart.indexOf('[PLAN_END]');
      if (endIdx !== -1) {
        planBuf   = afterStart.slice(0, endIdx);
        remaining = afterStart.slice(endIdx + '[PLAN_END]'.length);
        try { send('promptQueue:plan', { plan: JSON.parse(planBuf.trim()) }); }
        catch (e) { send('promptQueue:data', { text: `[Plan parse error: ${e.message}]\n` }); }
        planBuf = '';
        if (remaining) send('promptQueue:data', { text: remaining });
      } else {
        planBuf = afterStart;
        inPlan  = true;
      }
      return;
    }

    const stepMatch = remaining.match(/\[STEP:(\d+)\/(\d+)\]\s*(.*)/);
    if (stepMatch) send('promptQueue:step', { stepNum: parseInt(stepMatch[1]), total: parseInt(stepMatch[2]), title: stepMatch[3].trim(), state: 'running' });
    const doneMatch = remaining.match(/\[STEP_DONE:(\d+)\/(\d+)\]/);
    if (doneMatch) send('promptQueue:step', { stepNum: parseInt(doneMatch[1]), total: parseInt(doneMatch[2]), state: 'done' });
    const failMatch = remaining.match(/\[STEP_FAILED:(\d+)\/(\d+)\]/);
    if (failMatch) send('promptQueue:step', { stepNum: parseInt(failMatch[1]), total: parseInt(failMatch[2]), state: 'failed' });

    if (remaining.includes('[DONE]')) {
      const m = remaining.match(/\[DONE\] turns=(\d+) tool_calls=(\d+) tokens_in=(\d+) tokens_out=(\d+) elapsed=([\d.]+)s files=(\[.*?\])/);
      if (m) {
        let files = [];
        try { files = JSON.parse(m[6]); } catch (_) {}
        send('promptQueue:runSummary', { turns: parseInt(m[1]), toolCalls: parseInt(m[2]), tokensIn: parseInt(m[3]), tokensOut: parseInt(m[4]), elapsed: parseFloat(m[5]), files });
      }
    }

    send('promptQueue:data', { text: remaining });
  });

  proc.stderr.on('data', d => send('promptQueue:data', { text: d.toString('utf8') }));

  proc.on('close', code => {
    _activeQueueProc = null;
    send('promptQueue:done', { exitCode: code ?? 0 });
  });
  proc.on('error', err => {
    _activeQueueProc = null;
    send('promptQueue:data', { text: `agent.py error: ${err.message}\n` });
    send('promptQueue:done', { exitCode: 1 });
  });

  return { pid: proc.pid };
}

// ----------------------------------------------------------------
// CLI (PowerShell spawn)
// ----------------------------------------------------------------
function _runCli(send, messages, modelConfig, cwd) {
  const ts        = Date.now();
  const exe       = modelConfig?.executable || 'claude';
  const modelFlag = modelConfig?.model_name ? ` --model ${modelConfig.model_name}` : '';

  // Always include the required base flags; append any user-configured extra flags.
  const baseFlags   = '--dangerously-skip-permissions --print';
  const extraFlags  = (modelConfig?.flags || '').trim();
  const flags       = `${baseFlags}${extraFlags ? ' ' + extraFlags : ''}${modelFlag}`;

  _logAiCall('cli', modelConfig?.model_name || 'claude-haiku-4-5', exe, messages, cwd, extraFlags || null);

  const promptText = messagesToText(messages);

  const tmpPrompt = path.join(os.tmpdir(), `ai-sdlc-qprompt-${ts}.txt`);
  const tmpScript = path.join(os.tmpdir(), `ai-sdlc-qscript-${ts}.ps1`);

  try { fs.writeFileSync(tmpPrompt, promptText, 'utf8'); }
  catch (err) {
    send('promptQueue:data', { text: `Error writing prompt: ${err.message}\n` });
    send('promptQueue:done', { exitCode: 1 });
    return { pid: null };
  }

  const safePath = tmpPrompt.replace(/'/g, "''");
  const psScript = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null',
    `$__p = Get-Content -Path '${safePath}' -Raw -Encoding UTF8`,
    `${exe} ${flags} $__p`,
  ].join('\n');

  try { fs.writeFileSync(tmpScript, psScript, 'utf8'); }
  catch (err) {
    try { fs.unlinkSync(tmpPrompt); } catch (_) {}
    send('promptQueue:data', { text: `Error writing script: ${err.message}\n` });
    send('promptQueue:done', { exitCode: 1 });
    return { pid: null };
  }

  const proc = spawn(
    'powershell.exe',
    ['-NoLogo', '-NonInteractive', '-File', tmpScript],
    { stdio: ['ignore', 'pipe', 'pipe'], cwd: cwd || os.homedir(), env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }, windowsHide: true }
  );
  _activeQueueProc = proc;

  const cleanup = () => {
    try { fs.unlinkSync(tmpScript); } catch (_) {}
    try { fs.unlinkSync(tmpPrompt); } catch (_) {}
  };

  proc.stdout.on('data', d => send('promptQueue:data', { text: d.toString('utf8') }));
  proc.stderr.on('data', d => send('promptQueue:data', { text: d.toString('utf8') }));
  proc.on('close', code => { _activeQueueProc = null; cleanup(); send('promptQueue:done', { exitCode: code ?? 0 }); });
  proc.on('error', err => {
    _activeQueueProc = null; cleanup();
    send('promptQueue:data', { text: err.message + '\n' });
    send('promptQueue:done', { exitCode: 1 });
  });

  return { pid: proc.pid };
}

// ----------------------------------------------------------------
// Anthropic SSE streaming
// ----------------------------------------------------------------
function _runAnthropic(send, messages, modelConfig) {
  _logAiCall('anthropic', modelConfig.model_name || 'claude-sonnet-4-6', null, messages);
  let doneSent = false;
  const finish = (code) => { if (!doneSent) { doneSent = true; send('promptQueue:done', { exitCode: code }); } };

  const body = JSON.stringify({
    model:      modelConfig.model_name || 'claude-sonnet-4-6',
    max_tokens: modelConfig.max_tokens || 8096,
    stream:     true,
    messages,
  });

  const req = https.request({
    hostname: 'api.anthropic.com',
    path:     '/v1/messages',
    method:   'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         modelConfig.api_key || '',
      'anthropic-version': '2023-06-01',
      'Content-Length':    Buffer.byteLength(body),
    },
  }, (res) => {
    res.on('data', (chunk) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') { finish(0); continue; }
        try {
          const data = JSON.parse(raw);
          if (data.type === 'content_block_delta' && data.delta?.text) {
            send('promptQueue:data', { text: data.delta.text });
          }
          if (data.type === 'message_stop') finish(0);
        } catch (_) {}
      }
    });
    res.on('end',   () => finish(0));
    res.on('error', (err) => { send('promptQueue:data', { text: err.message }); finish(1); });
  });

  req.on('error', (err) => { send('promptQueue:data', { text: err.message }); finish(1); });
  req.write(body);
  req.end();
  _activeQueueProc = req;
}

// ----------------------------------------------------------------
// Ollama NDJSON streaming
// ----------------------------------------------------------------
function _runOllama(send, messages, modelConfig) {
  _logAiCall('ollama', modelConfig.model_name || '(no model)', null, messages);
  let doneSent = false;
  const finish = (code) => { if (!doneSent) { doneSent = true; send('promptQueue:done', { exitCode: code }); } };

  const baseUrl = (modelConfig.base_url || 'http://localhost:11434').replace(/\/$/, '');
  const body    = JSON.stringify({
    model:    modelConfig.model_name,
    messages,
    stream:   true,
  });

  const url = new URL('/api/chat', baseUrl);
  const mod = url.protocol === 'https:' ? https : http;
  let buffer = '';

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
          if (token) send('promptQueue:data', { text: token });
          if (data.done) finish(0);
        } catch (_) {}
      }
    });
    res.on('end',   () => finish(0));
    res.on('error', (err) => { send('promptQueue:data', { text: err.message }); finish(1); });
  });

  req.on('error', (err) => { send('promptQueue:data', { text: err.message }); finish(1); });
  req.write(body);
  req.end();
  _activeQueueProc = req;
}

// ----------------------------------------------------------------
// Generic API (OpenAI-compatible, non-streaming)
// ----------------------------------------------------------------
function _runApi(send, messages, modelConfig) {
  _logAiCall('api', modelConfig.model_name || '(no model)', modelConfig.base_url || 'api', messages);
  const baseUrl = (modelConfig.base_url || '').replace(/\/$/, '');
  if (!baseUrl) {
    send('promptQueue:data', { text: 'Error: API base_url not configured\n' });
    send('promptQueue:done', { exitCode: 1 });
    return;
  }

  const bodyObj = {
    model:    modelConfig.model_name || 'default',
    messages,
    stream:   false,
  };
  if (modelConfig.max_tokens) bodyObj.max_tokens = modelConfig.max_tokens;
  const body = JSON.stringify(bodyObj);

  const url = new URL('/chat/completions', baseUrl);
  const mod = url.protocol === 'https:' ? https : http;
  const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
  if (modelConfig.api_key) headers['Authorization'] = `Bearer ${modelConfig.api_key}`;

  const req = mod.request(
    { hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80), path: url.pathname, method: 'POST', headers },
    (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk.toString('utf8'); });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          send('promptQueue:data', { text: json.choices?.[0]?.message?.content ?? data });
        } catch (_) {
          send('promptQueue:data', { text: data });
        }
        send('promptQueue:done', { exitCode: 0 });
      });
      res.on('error', (err) => { send('promptQueue:data', { text: err.message }); send('promptQueue:done', { exitCode: 1 }); });
    }
  );

  req.on('error', (err) => { send('promptQueue:data', { text: err.message }); send('promptQueue:done', { exitCode: 1 }); });
  req.write(body);
  req.end();
  _activeQueueProc = req;
}

module.exports = { registerQueueHandlers };
