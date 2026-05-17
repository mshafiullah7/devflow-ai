'use strict';

/**
 * Ollama Console IPC handlers.
 *
 * Uses the same agent-cli mechanism as "Run in console" — spawns:
 *   node <agentCliPath> --once --model <model> --host <host> [--dir <dir>]
 * and writes the user's prompt to its stdin.  This gives the model access
 * to all filesystem tools (read_file, write_file, list_files, etc.) when
 * a working directory is provided.
 *
 * IPC channels (invoke):
 *   ollama:list-models  { host }                           → string[]
 *   ollama:chat         { agentCliPath, model, host, dir, prompt } → streams
 *   ollama:cancel       ()                                 → kills active proc
 *
 * IPC channels (send → renderer):
 *   ollama:token   { token: string }
 *   ollama:done    { success: bool, error?: string }
 *   ollama:error   { message: string }
 */

const { ipcMain } = require('electron');
const { safeHandle } = require('../../ipc-safe-handle');
const { spawn }   = require('child_process');
const http        = require('node:http');
const https       = require('node:https');
const os          = require('node:os');

let _activeProc = null;

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function safeBase(host) {
  const h = (host || 'http://localhost:11434').replace(/\/$/, '');
  return h.startsWith('http') ? h : `http://${h}`;
}

function killActive() {
  if (!_activeProc) return;
  try { _activeProc.kill('SIGTERM'); } catch (_) {}
  _activeProc = null;
}

// ----------------------------------------------------------------
// Register
// ----------------------------------------------------------------
function registerOllamaHandlers() {

  // ── List available local models via Ollama REST API ─────────────
  safeHandle('ollama:list-models', (_e, { host } = {}) => {
    return new Promise((resolve) => {
      const base = safeBase(host);
      const url  = `${base}/api/tags`;
      const mod  = url.startsWith('https') ? https : http;

      const req = mod.get(url, { timeout: 6000 }, (res) => {
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

  // ── Run one prompt turn via agent-cli --once ────────────────────
  // Same mechanism as "Run in console" but streams tokens back to the
  // Ollama Console UI rather than the terminal panel.
  safeHandle('ollama:chat', (event, { agentCliPath, model, host, dir, prompt }) => {
    const wc   = event.sender;
    const send = (ch, p) => { if (!wc.isDestroyed()) wc.send(ch, p); };

    // Kill any previous run
    killActive();

    const args = [
      agentCliPath,
      '--once',
      '--model', model || 'phi4-mini:latest',
      '--host',  safeBase(host),
    ];
    if (dir) args.push('--dir', dir);

    _activeProc = spawn('node', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd:   dir || os.homedir(),
      windowsHide: true,
      env: {
        ...process.env,
        FORCE_COLOR:  '0',   // no ANSI colours — agent-cli strips them in --once mode
        NO_COLOR:     '1',
      },
    });

    // Write prompt to stdin and close the stream so agent-cli gets EOF
    _activeProc.stdin.write(prompt + '\n');
    _activeProc.stdin.end();

    return new Promise((resolve) => {
      let doneFired = false;
      const finish = (success, error) => {
        if (doneFired) return;
        doneFired    = true;
        _activeProc  = null;
        send('ollama:done', { success, error });
        resolve({ success });
      };

      // Stream stdout tokens directly to the renderer
      _activeProc.stdout.on('data', (chunk) => {
        const text = chunk.toString('utf8');
        if (text) send('ollama:token', { token: text });
      });

      // Treat stderr as error info (agent-cli rarely writes here)
      _activeProc.stderr.on('data', (chunk) => {
        const text = chunk.toString('utf8').trim();
        if (text) send('ollama:error', { message: text });
      });

      _activeProc.on('close', (code) => {
        finish(code === 0, code !== 0 ? `Process exited with code ${code}` : undefined);
      });

      _activeProc.on('error', (err) => {
        send('ollama:error', { message: `Failed to start agent: ${err.message}` });
        finish(false, err.message);
      });
    });
  });

  // ── Cancel active run ───────────────────────────────────────────
  safeHandle('ollama:cancel', () => killActive());
}

module.exports = { registerOllamaHandlers };
