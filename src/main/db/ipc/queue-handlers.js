'use strict';

const { ipcMain }         = require('electron');
const { spawn, execSync } = require('child_process');
const http  = require('node:http');
const https = require('node:https');
const fs    = require('node:fs');
const os    = require('node:os');
const path  = require('node:path');
const { getTelegramConfig }    = require('../../app-config');
const { sendMessage: tgSend }  = require('../../telegram');

let _activeQueueProc = null;

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

async function _notifyTelegram(label, phase, exitCode, duration) {
  try {
    const cfg = getTelegramConfig();
    if (!cfg.botToken || !cfg.chatId) return;
    const now = _fmtTime(new Date());
    let text;
    if (phase === 'start') {
      text = `*DevFlow Job Started*\nJob: \`${label}\`\nTime: ${now}`;
    } else if (exitCode === 0) {
      text = `✅ *DevFlow: Job Completed*\nJob: \`${label}\`\nDuration: ${duration}ms\nStatus: SUCCESS`;
    } else {
      text = `❌ *DevFlow: Job FAILED*\nJob: \`${label}\`\nTime: ${now}`;
    }
    await tgSend(cfg.botToken, cfg.chatId, text);
  } catch (_) {}
}

function registerQueueHandlers() {
  ipcMain.handle('promptQueue:kill', () => {
    if (_activeQueueProc) { killTree(_activeQueueProc); _activeQueueProc = null; }
  });

  ipcMain.handle('promptQueue:run', (event, { messages, modelConfig, cwd, itemLabel }) => {
    if (_activeQueueProc) { killTree(_activeQueueProc); _activeQueueProc = null; }

    const wc        = event.sender;
    const label     = itemLabel || 'job';
    const startTime = Date.now();
    const send = (ch, payload) => {
      if (ch === 'promptQueue:done') {
        _notifyTelegram(label, 'done', payload.exitCode, Date.now() - startTime);
      }
      if (!wc.isDestroyed()) wc.send(ch, payload);
    };
    const type = modelConfig?.type || 'cli';

    const trimmed = trimMessages(Array.isArray(messages) ? messages : [{ role: 'user', content: messages }]);

    _notifyTelegram(label, 'start', null, null);

    if (type === 'anthropic') { _runAnthropic(send, trimmed, modelConfig); return { pid: null }; }
    if (type === 'ollama')    { _runOllama(send, trimmed, modelConfig);    return { pid: null }; }
    if (type === 'api')       { _runApi(send, trimmed, modelConfig);       return { pid: null }; }

    return _runCli(send, trimmed, modelConfig, cwd);
  });
}

// ----------------------------------------------------------------
// CLI (PowerShell spawn)
// ----------------------------------------------------------------
function _runCli(send, messages, modelConfig, cwd) {
  const ts    = Date.now();
  const exe       = modelConfig?.executable || 'claude';
  const modelFlag = modelConfig?.model_name ? ` --model ${modelConfig.model_name}` : '';
  const flags     = `${modelConfig?.flags || '--dangerously-skip-permissions --print'}${modelFlag}`;

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
