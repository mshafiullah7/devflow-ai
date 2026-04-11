'use strict';

const { ipcMain } = require('electron');
const { spawn, execSync } = require('child_process');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

let _activeProc = null;

function killTree(proc) {
  if (!proc) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { windowsHide: true }); } catch (_) {}
  } else {
    try { proc.kill('SIGTERM'); } catch (_) {}
  }
}

function registerTerminalHandlers() {
  ipcMain.handle('terminal:homedir', () => os.homedir());

  // Quick exec used only for `cd` path resolution (short-lived, 10 s max)
  ipcMain.handle('terminal:exec', (_e, { command, cwd }) => {
    return new Promise((resolve) => {
      const proc = spawn(
        'powershell.exe',
        ['-NoLogo', '-NonInteractive', '-Command', command],
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: cwd || os.homedir(), env: process.env, windowsHide: true }
      );
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => resolve({ stdout, stderr, exitCode: code }));
      proc.on('error', err => resolve({ stdout: '', stderr: err.message, exitCode: 1 }));
      const timer = setTimeout(() => proc.kill(), 10000);
      proc.on('close', () => clearTimeout(timer));
    });
  });

  // Streaming exec — no timeout, pushes chunks back via webContents.send
  ipcMain.handle('terminal:exec-start', (event, { command, cwd }) => {
    if (_activeProc) { killTree(_activeProc); _activeProc = null; }

    const wc = event.sender;
    // Force UTF-8 so box-drawing chars from CMD tools render correctly
    const utf8Prefix = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; ';
    _activeProc = spawn(
      'powershell.exe',
      ['-NoLogo', '-NonInteractive', '-Command', utf8Prefix + command],
      { stdio: ['pipe', 'pipe', 'pipe'], cwd: cwd || os.homedir(), env: { ...process.env, FORCE_COLOR: '1', COLORTERM: 'truecolor' }, windowsHide: true }
    );

    const send = (ch, payload) => { if (!wc.isDestroyed()) wc.send(ch, payload); };

    _activeProc.stdout.on('data', d => send('terminal:data', { text: d.toString('utf8'), stream: 'stdout' }));
    _activeProc.stderr.on('data', d => send('terminal:data', { text: d.toString('utf8'), stream: 'stderr' }));
    _activeProc.on('close', code => { _activeProc = null; send('terminal:done', { exitCode: code }); });
    _activeProc.on('error', err => {
      _activeProc = null;
      send('terminal:data', { text: err.message, stream: 'stderr' });
      send('terminal:done', { exitCode: 1 });
    });

    return { pid: _activeProc.pid };
  });

  ipcMain.handle('terminal:kill-active', () => {
    if (_activeProc) { killTree(_activeProc); _activeProc = null; }
  });

  // Forward user input to the running process's stdin (for interactive programs)
  ipcMain.handle('terminal:stdin', (_e, text) => {
    if (_activeProc && _activeProc.stdin && !_activeProc.stdin.destroyed) {
      _activeProc.stdin.write(text);
    }
  });

  // Open an interactive PowerShell window (visible, stays open)
  ipcMain.handle('terminal:open-external', (_e, { command, cwd }) => {
    const workDir  = cwd || os.homedir();
    const safeCwd  = workDir.replace(/'/g, "''");
    const fullCmd  = `Set-Location '${safeCwd}'\n${command}`;
    const tmpFile  = path.join(os.tmpdir(), `ai-sdlc-run-${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, fullCmd, 'utf8');

    const shell = fs.existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
      ? 'pwsh.exe' : 'powershell.exe';

    const proc = spawn(
      'cmd.exe',
      ['/c', 'start', shell, '-NoLogo', '-NoExit', '-File', tmpFile],
      { stdio: 'ignore', detached: true, windowsHide: true, cwd: workDir, env: process.env }
    );
    proc.unref();
    return { pid: proc.pid };
  });
}

module.exports = { registerTerminalHandlers };
