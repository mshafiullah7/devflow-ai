'use strict';

const { ipcMain } = require('electron');
const { safeHandle } = require('../../ipc-safe-handle');
const { spawn, execSync } = require('child_process');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

let _activeProc     = null;
let _activeTestProc = null;

function killTree(proc) {
  if (!proc) return;
  if (process.platform === 'win32') {
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { windowsHide: true }); } catch (_) {}
  } else {
    try { proc.kill('SIGTERM'); } catch (_) {}
  }
}

function registerTerminalHandlers() {
  safeHandle('terminal:homedir', () => os.homedir());

  // Quick exec used only for `cd` path resolution (short-lived, 10 s max)
  safeHandle('terminal:exec', (_e, { command, cwd }) => {
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
  safeHandle('terminal:exec-start', (event, { command, cwd, initialStdin }) => {
    if (_activeProc) { killTree(_activeProc); _activeProc = null; }

    const wc = event.sender;
    // Purge stale temp scripts older than 2 days
    const tmpDir = os.tmpdir();
    const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        if (!f.startsWith('ai-sdlc-exec-') || !f.endsWith('.ps1')) continue;
        const fp = path.join(tmpDir, f);
        try { if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp); } catch (_) {}
      }
    } catch (_) {}
    // Write command to a temp .ps1 file to avoid Windows command-line length limits
    const utf8Prefix = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null\n';
    const tmpFile = path.join(tmpDir, `ai-sdlc-exec-${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, utf8Prefix + command, 'utf8');
    _activeProc = spawn(
      'powershell.exe',
      ['-NoLogo', '-NonInteractive', '-File', tmpFile],
      { stdio: ['pipe', 'pipe', 'pipe'], cwd: cwd || os.homedir(), env: { ...process.env, FORCE_COLOR: '1', COLORTERM: 'truecolor' }, windowsHide: true }
    );

    // Send the opening prompt automatically so the user doesn't have to retype it
    if (initialStdin) {
      _activeProc.stdin.write(initialStdin.endsWith('\n') ? initialStdin : initialStdin + '\n');
    }

    const send = (ch, payload) => { if (!wc.isDestroyed()) wc.send(ch, payload); };

    _activeProc.stdout.on('data', d => send('terminal:data', { text: d.toString('utf8'), stream: 'stdout' }));
    _activeProc.stderr.on('data', d => send('terminal:data', { text: d.toString('utf8'), stream: 'stderr' }));
    const cleanup = () => { try { fs.unlinkSync(tmpFile); } catch (_) {} };
    _activeProc.on('close', code => { _activeProc = null; cleanup(); send('terminal:done', { exitCode: code }); });
    _activeProc.on('error', err => {
      _activeProc = null;
      cleanup();
      send('terminal:data', { text: err.message, stream: 'stderr' });
      send('terminal:done', { exitCode: 1 });
    });

    return { pid: _activeProc.pid };
  });

  safeHandle('terminal:kill-active', () => {
    if (_activeProc) { killTree(_activeProc); _activeProc = null; }
  });

  // Forward user input to the running process's stdin (for interactive programs)
  safeHandle('terminal:stdin', (_e, text) => {
    if (_activeProc && _activeProc.stdin && !_activeProc.stdin.destroyed) {
      _activeProc.stdin.write(text);
    }
  });

  // Open an interactive PowerShell window (visible, stays open)
  safeHandle('terminal:open-external', (_e, { command, cwd }) => {
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

  // Dedicated test runner — separate process slot so it doesn't conflict with the terminal panel
  safeHandle('testRunner:run', (event, { command, cwd }) => {
    if (_activeTestProc) { killTree(_activeTestProc); _activeTestProc = null; }

    const wc        = event.sender;
    const utf8Pre   = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; ';
    _activeTestProc = spawn(
      'powershell.exe',
      ['-NoLogo', '-NonInteractive', '-Command', utf8Pre + command],
      { stdio: ['ignore', 'pipe', 'pipe'], cwd: cwd || os.homedir(), env: process.env, windowsHide: true }
    );

    const send = (ch, payload) => { if (!wc.isDestroyed()) wc.send(ch, payload); };

    _activeTestProc.stdout.on('data', d => send('testRunner:data', { text: d.toString('utf8') }));
    _activeTestProc.stderr.on('data', d => send('testRunner:data', { text: d.toString('utf8') }));
    _activeTestProc.on('close', code => { _activeTestProc = null; send('testRunner:done', { exitCode: code }); });
    _activeTestProc.on('error', err => {
      _activeTestProc = null;
      send('testRunner:data', { text: err.message });
      send('testRunner:done', { exitCode: 1 });
    });

    return { pid: _activeTestProc.pid };
  });

  safeHandle('testRunner:kill', () => {
    if (_activeTestProc) { killTree(_activeTestProc); _activeTestProc = null; }
  });
}

module.exports = { registerTerminalHandlers };
