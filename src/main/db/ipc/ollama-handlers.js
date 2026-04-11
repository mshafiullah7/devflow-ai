'use strict';

/**
 * Ollama Console IPC handlers.
 *
 * Uses Ollama's REST API (POST /api/chat with stream:true) rather than the
 * CLI REPL so we get clean, reliable streaming without TTY detection issues.
 *
 * IPC channels (invoke):
 *   ollama:list-models  { host }           → string[]
 *   ollama:chat         { host, model, messages } → streams tokens back
 *   ollama:cancel       ()                 → kills active stream
 *
 * IPC channels (send → renderer):
 *   ollama:token   { token: string }
 *   ollama:done    { success: bool, error?: string }
 *   ollama:error   { message: string }
 */

const { ipcMain } = require('electron');
const http        = require('node:http');
const https       = require('node:https');

let _activeReq = null; // current in-flight http.ClientRequest

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function pickModule(url) {
  return url.startsWith('https') ? https : http;
}

function safeBase(host) {
  const h = (host || 'http://localhost:11434').replace(/\/$/, '');
  return h.startsWith('http') ? h : `http://${h}`;
}

// ----------------------------------------------------------------
// Register
// ----------------------------------------------------------------
function registerOllamaHandlers() {

  // ── List available local models ─────────────────────────────────
  ipcMain.handle('ollama:list-models', (_e, { host } = {}) => {
    return new Promise((resolve) => {
      const base = safeBase(host);
      const url  = `${base}/api/tags`;

      const req = pickModule(url).get(url, { timeout: 6000 }, (res) => {
        let raw = '';
        res.on('data', d => { raw += d; });
        res.on('end', () => {
          try {
            const json   = JSON.parse(raw);
            const models = (json.models || []).map(m => m.name);
            resolve(models);
          } catch {
            resolve([]);
          }
        });
      });
      req.on('error',   () => resolve([]));
      req.on('timeout', () => { req.destroy(); resolve([]); });
    });
  });

  // ── Stream a chat turn ──────────────────────────────────────────
  // messages = [{role:'user'|'assistant', content: string}, …]
  ipcMain.handle('ollama:chat', (event, { host, model, messages }) => {
    const wc   = event.sender;
    const send = (ch, p) => { if (!wc.isDestroyed()) wc.send(ch, p); };

    // Cancel any previous stream
    if (_activeReq) {
      try { _activeReq.destroy(); } catch (_) {}
      _activeReq = null;
    }

    const base    = safeBase(host);
    const url     = `${base}/api/chat`;
    const body    = JSON.stringify({ model, messages, stream: true });
    const mod     = pickModule(url);
    const urlObj  = new URL(url);

    const options = {
      hostname: urlObj.hostname,
      port:     urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path:     urlObj.pathname,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    return new Promise((resolve) => {
      let doneFired = false;
      const finish = (success, error) => {
        if (doneFired) return;
        doneFired = true;
        _activeReq = null;
        send('ollama:done', { success, error });
        resolve({ success });
      };

      const req = mod.request(options, (res) => {
        if (res.statusCode !== 200) {
          let errBody = '';
          res.on('data', d => { errBody += d; });
          res.on('end', () => {
            send('ollama:error', { message: `HTTP ${res.statusCode}: ${errBody.slice(0, 200)}` });
            finish(false, `HTTP ${res.statusCode}`);
          });
          return;
        }

        let buf = '';
        res.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          // Ollama sends newline-delimited JSON — process complete lines
          const lines = buf.split('\n');
          buf = lines.pop(); // keep the possibly-incomplete trailing line
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const json = JSON.parse(line);
              const token = json.message?.content;
              if (token) send('ollama:token', { token });
              if (json.done) finish(true);
            } catch (_) {}
          }
        });

        res.on('end', () => {
          // Flush any remaining buffer
          if (buf.trim()) {
            try {
              const json  = JSON.parse(buf);
              const token = json.message?.content;
              if (token) send('ollama:token', { token });
            } catch (_) {}
          }
          finish(true);
        });

        res.on('error', (err) => {
          send('ollama:error', { message: err.message });
          finish(false, err.message);
        });
      });

      req.on('error', (err) => {
        send('ollama:error', { message: err.message });
        finish(false, err.message);
      });

      _activeReq = req;
      req.write(body);
      req.end();
    });
  });

  // ── Cancel active stream ────────────────────────────────────────
  ipcMain.handle('ollama:cancel', () => {
    if (_activeReq) {
      try { _activeReq.destroy(); } catch (_) {}
      _activeReq = null;
    }
  });
}

module.exports = { registerOllamaHandlers };
