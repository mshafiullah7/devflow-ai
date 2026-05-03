'use strict';

const { ipcMain } = require('electron');
const os  = require('node:os');
const fs  = require('node:fs');

let pty;
try {
  pty = require('node-pty');
} catch (e) {
  console.warn('[PTY] node-pty unavailable — run "npm start" to rebuild native modules:', e.message);
}

// One PTY per webContents (supports future multi-window, safe for single-window)
const _ptyMap = new Map();

function _getShell() {
  if (process.platform !== 'win32') return process.env.SHELL || '/bin/bash';
  const pwsh7 = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  return fs.existsSync(pwsh7) ? pwsh7 : 'powershell.exe';
}

function registerPtyHandlers() {
  ipcMain.handle('pty:create', (event, { cwd, cols = 80, rows = 24 }) => {
    if (!pty) throw new Error('node-pty is not available. Restart the app to rebuild native modules.');

    const wc = event.sender;
    const id = wc.id;

    // Kill any existing PTY for this window
    const existing = _ptyMap.get(id);
    if (existing) {
      try { existing.kill(); } catch {}
      _ptyMap.delete(id);
    }

    const proc = pty.spawn(_getShell(), [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: (cwd && fs.existsSync(cwd)) ? cwd : os.homedir(),
      env: {
        ...process.env,
        TERM:        'xterm-256color',
        COLORTERM:   'truecolor',
        FORCE_COLOR: '1',
      },
    });

    _ptyMap.set(id, proc);

    const send = (ch, payload) => { if (!wc.isDestroyed()) wc.send(ch, payload); };
    proc.onData(data => send('pty:data', data));
    proc.onExit(({ exitCode }) => { _ptyMap.delete(id); send('pty:exit', { exitCode }); });

    return { pid: proc.pid };
  });

  ipcMain.handle('pty:write', (event, data) => {
    _ptyMap.get(event.sender.id)?.write(data);
  });

  ipcMain.handle('pty:resize', (event, { cols, rows }) => {
    const proc = _ptyMap.get(event.sender.id);
    if (proc) try { proc.resize(cols, rows); } catch {}
  });

  ipcMain.handle('pty:destroy', (event) => {
    const proc = _ptyMap.get(event.sender.id);
    if (proc) {
      try { proc.kill(); } catch {}
      _ptyMap.delete(event.sender.id);
    }
  });
}

module.exports = { registerPtyHandlers };
