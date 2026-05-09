'use strict';

const { ipcMain } = require('electron');
const { spawn, execSync } = require('child_process');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

let _activeProc     = null;
let _activeTestProc = null;
let _activeCliProc  = null;

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
  ipcMain.handle('terminal:exec-start', (event, { command, cwd, initialStdin }) => {
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

  // Dedicated test runner — separate process slot so it doesn't conflict with the terminal panel
  ipcMain.handle('testRunner:run', (event, { command, cwd }) => {
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

  ipcMain.handle('testRunner:kill', () => {
    if (_activeTestProc) { killTree(_activeTestProc); _activeTestProc = null; }
  });

  // Dedicated CLI runner — separate process slot, supports stdin for interactive CLIs
  ipcMain.handle('cliRunner:run', (event, { command, prompt, cwd }) => {
    if (_activeCliProc) { killTree(_activeCliProc); _activeCliProc = null; }

    const wc = event.sender;
    const send = (ch, payload) => { if (!wc.isDestroyed()) wc.send(ch, payload); };

    let tmpPromptFile = null;
    const ts = Date.now();

    // Build PS1 script — prompt is written to a temp file to avoid quoting issues
    let psScript = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null\n';

    if (prompt) {
      tmpPromptFile = path.join(os.tmpdir(), `ai-sdlc-cliprompt-${ts}.txt`);
      try {
        fs.writeFileSync(tmpPromptFile, prompt, 'utf8');
      } catch (err) {
        send('cliRunner:data', { text: `Failed to write prompt file: ${err.message}` });
        send('cliRunner:done', { exitCode: 1 });
        return { pid: null };
      }
      const safePath = tmpPromptFile.replace(/'/g, "''");
      psScript += `$__p = Get-Content -Path '${safePath}' -Raw -Encoding UTF8\n`;
      psScript += `${command} $__p\n`;
    } else {
      psScript += `${command}\n`;
    }

    const tmpScript = path.join(os.tmpdir(), `ai-sdlc-cli-${ts}.ps1`);
    try {
      fs.writeFileSync(tmpScript, psScript, 'utf8');
    } catch (err) {
      if (tmpPromptFile) { try { fs.unlinkSync(tmpPromptFile); } catch (_) {} }
      send('cliRunner:data', { text: `Failed to write script: ${err.message}` });
      send('cliRunner:done', { exitCode: 1 });
      return { pid: null };
    }

    _activeCliProc = spawn(
      'powershell.exe',
      ['-NoLogo', '-NonInteractive', '-File', tmpScript],
      { stdio: ['pipe', 'pipe', 'pipe'], cwd: cwd || os.homedir(), env: { ...process.env, FORCE_COLOR: '1', COLORTERM: 'truecolor' }, windowsHide: true }
    );

    const cleanup = () => {
      try { fs.unlinkSync(tmpScript); } catch (_) {}
      if (tmpPromptFile) { try { fs.unlinkSync(tmpPromptFile); } catch (_) {} }
    };

    _activeCliProc.stdout.on('data', d => send('cliRunner:data', { text: d.toString('utf8') }));
    _activeCliProc.stderr.on('data', d => send('cliRunner:data', { text: d.toString('utf8') }));
    _activeCliProc.on('close', code => { _activeCliProc = null; cleanup(); send('cliRunner:done', { exitCode: code }); });
    _activeCliProc.on('error', err => {
      _activeCliProc = null;
      cleanup();
      send('cliRunner:data', { text: err.message });
      send('cliRunner:done', { exitCode: 1 });
    });

    return { pid: _activeCliProc.pid };
  });

  ipcMain.handle('cliRunner:kill', () => {
    if (_activeCliProc) { killTree(_activeCliProc); _activeCliProc = null; }
  });

  ipcMain.handle('cliRunner:stdin', (_e, text) => {
    if (_activeCliProc && _activeCliProc.stdin && !_activeCliProc.stdin.destroyed) {
      _activeCliProc.stdin.write(text);
    }
  });
}

module.exports = { registerTerminalHandlers };
