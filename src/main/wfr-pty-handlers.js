'use strict';

const { safeHandle } = require('./ipc-safe-handle');
const pty  = require('node-pty');
const os   = require('node:os');
const fs   = require('node:fs');
const path = require('node:path');

// $LASTEXITCODE is only set by native executables — if the resolved CLI
// command runs as a PowerShell script/function shim instead, it can stay
// $null, which would print a blank exit-code segment ("##WFR_DONE:5:##")
// that fails the `(\d+)` sentinel regex and hangs the run forever. Fall
// back to $? (always boolean) so the sentinel always contains a digit.
const WIN_EXIT_CODE_EXPR = '$(if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 })';

// ---------------------------------------------------------------------------
// Resolve an executable name to its full path on Windows.
// ---------------------------------------------------------------------------
function resolveExe(name) {
  if (path.isAbsolute(name)) return name;
  try {
    const { execSync } = require('node:child_process');
    const result = execSync(`where "${name}"`, { encoding: 'utf8', timeout: 3000 }).trim();
    const lines = result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const exeLine = lines.find(l => l.toLowerCase().endsWith('.exe'));
    return exeLine || lines[0] || name;
  } catch (_) {
    return name;
  }
}

function cleanOldTempFiles() {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  try {
    const entries = fs.readdirSync(os.tmpdir());
    for (const name of entries) {
      if (!/^wfr-layer-/.test(name)) continue;
      const full = path.join(os.tmpdir(), name);
      try {
        const { mtimeMs } = fs.statSync(full);
        if (now - mtimeMs > TWO_HOURS) fs.unlinkSync(full);
      } catch (_) {}
    }
  } catch (_) {}
}

// Same cleanup, but for the per-project ".devflow-tmp" folder used by
// runInShell prompt files (must live inside cwd for Claude Code's sandbox).
function cleanOldTempFilesIn(dir) {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  try {
    const entries = fs.readdirSync(dir);
    for (const name of entries) {
      if (!/^prompt-/.test(name)) continue;
      const full = path.join(dir, name);
      try {
        const { mtimeMs } = fs.statSync(full);
        if (now - mtimeMs > TWO_HOURS) fs.unlinkSync(full);
      } catch (_) {}
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Factory — creates an isolated PTY context for a given IPC channel prefix.
// Call registerPtyHandlers('wfrPty') for Workflow Runner and
// registerPtyHandlers('irPty') for Issue Runner — each gets its own PTY,
// state, and IPC channels so they can run simultaneously.
// ---------------------------------------------------------------------------
function registerPtyHandlers(prefix) {
  let _pty             = null;
  let _wc              = null;
  let _tmpFile         = null;
  let _jsonLineBuf     = '';
  let _sentinelCallback = null;
  let _shellLineBuf    = '';
  let _claudeActive        = false;
  let _batchSessionActive  = false;
  let _batchSessionCwd     = null;
  let _currentLayerId      = null;
  let _lastCommandTime     = 0;
  let _flushTimeout        = null;

  const send = (ch, data) => {
    if (_wc && !_wc.isDestroyed()) _wc.send(`${prefix}:${ch}`, data);
  };

  // -------------------------------------------------------------------------
  // Parse one line of Claude CLI --output-format stream-json output.
  // -------------------------------------------------------------------------
  function formatStreamLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;

    let obj;
    try {
      const clean = trimmed
        .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
        .replace(/\x1B\][^\x07]*\x07/g, '')
        .replace(/\r/g, '');
      obj = JSON.parse(clean);
    } catch {
      return trimmed.replace(/\r/g, '') + '\r\n';
    }

    switch (obj.type) {
      case 'stream_event': {
        const ev = obj.event || {};
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          return ev.delta.text || null;
        }
        return null;
      }
      case 'tool_use': {
        const inp    = obj.tool_input || {};
        const detail = inp.file_path || inp.command || inp.query || inp.pattern || inp.path || '';
        const short  = detail.length > 70 ? '…' + detail.slice(-67) : detail;
        return `\x1b[36m●\x1b[0m \x1b[1m${obj.tool_name || 'Tool'}\x1b[0m${short ? `(\x1b[2m${short}\x1b[0m)` : ''}\r\n`;
      }
      case 'assistant': {
        const content = obj.message?.content || [];
        let output = '';
        for (const item of content) {
          if (item.type === 'tool_use') {
            const inp    = item.input || {};
            const detail = inp.file_path || inp.command || inp.query || inp.pattern || inp.path || '';
            const short  = detail.length > 70 ? '…' + detail.slice(-67) : detail;
            output += `\x1b[36m●\x1b[0m \x1b[1m${item.name || 'Tool'}\x1b[0m${short ? `(\x1b[2m${short}\x1b[0m)` : ''}\r\n`;
          }
        }
        return output || null;
      }
      case 'result': {
        const u = obj.usage || {};
        send('tokenStats', {
          input:     u.input_tokens               ?? null,
          output:    u.output_tokens              ?? null,
          cacheRead: u.cache_read_input_tokens    ?? null,
          costUsd:   obj.cost_usd                 ?? null,
        });
        if (obj.subtype === 'error') return `\x1b[31m${obj.result || 'Error'}\x1b[0m\r\n`;
        return null;
      }
      case 'system':
        if (obj.subtype === 'thinking_tokens' && obj.estimated_tokens != null) {
          send('tokenStats', { thinkingTokens: obj.estimated_tokens });
        }
        return null;
      case 'tool_result':
        return null;
      default:
        return null;
    }
  }

  function killPty() {
    _sentinelCallback = null;
    _shellLineBuf     = '';
    _claudeActive        = false;
    _batchSessionActive  = false;
    _batchSessionCwd     = null;
    if (_flushTimeout) {
      clearTimeout(_flushTimeout);
      _flushTimeout = null;
    }
    if (_pty) {
      try { _pty.kill(); } catch (_) {}
      _pty = null;
    }
    if (_tmpFile) {
      try { fs.unlinkSync(_tmpFile); } catch (_) {}
      _tmpFile = null;
    }
  }

  // Write raw keystrokes to running PTY
  safeHandle(`${prefix}:write`, (_e, data) => {
    if (_pty) _pty.write(data);
  });

  // Resize PTY to match terminal window dimensions
  safeHandle(`${prefix}:resize`, (_e, { cols, rows }) => {
    if (_pty) {
      try { _pty.resize(Math.max(2, cols), Math.max(2, rows)); } catch (_) {}
    }
  });

  // Kill any running PTY
  safeHandle(`${prefix}:kill`, () => { killPty(); });

  // Interrupt whatever's currently running in the shell (Ctrl+C) without
  // killing the whole PTY/session — used for a user-initiated "Esc to
  // cancel" on a layer run. Also clears _sentinelCallback: the run's
  // completion marker (##WFR_DONE:...) was chained onto the same submitted
  // command line via ';' and will never print once that line is
  // interrupted, so the caller resolves its own UI state immediately
  // instead of waiting on the (now unreachable) sentinel.
  safeHandle(`${prefix}:cancelCurrent`, () => {
    if (!_pty) return { ok: false, error: 'No shell running' };
    _sentinelCallback = null;
    try { _pty.write('\x03'); } catch (_) {}
    return { ok: true };
  });

  // Returns true if a Claude/agent run is currently in progress
  safeHandle(`${prefix}:isBusy`, () => _claudeActive);

  // Spawn a raw interactive shell
  safeHandle(`${prefix}:spawnShell`, (event, { cwd, cols, rows }) => {
    _wc = event.sender;

    const isWin = os.platform() === 'win32';
    if (_pty) {
      const spawnCwd = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();
      const cdCmd = isWin
        ? `Set-Location "${spawnCwd}"; [System.IO.Directory]::SetCurrentDirectory($pwd); Clear-Host`
        : `cd "${spawnCwd}" && clear`;
      _pty.write(cdCmd + '\r');
      return { ok: true, reused: true };
    }

    killPty();
    _wc = event.sender;

    const spawnExe  = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    const spawnArgs = isWin ? ['-NoLogo', '-NoExit'] : [];
    const spawnCwd  = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();

    try {
      _pty = pty.spawn(spawnExe, spawnArgs, {
        name: 'xterm-256color',
        cols: Math.max(2, cols || 120),
        rows: Math.max(2, rows || 30),
        cwd:  spawnCwd,
        env:  {
          ...process.env,
          TERM:        'xterm-256color',
          FORCE_COLOR: '1',
          COLORTERM:   'truecolor',
        },
      });
    } catch (err) {
      return { ok: false, error: `Failed to spawn shell: ${err.message}` };
    }

    _pty.onData((data) => {
      if (_flushTimeout) {
        clearTimeout(_flushTimeout);
        _flushTimeout = null;
      }
      _shellLineBuf += data;

      const m = _shellLineBuf.match(/##WFR_DONE:([^:]+):(\d+)##/);
      if (m) {
        const fullSentinel = m[0];
        const layerId  = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : m[1];
        const exitCode = parseInt(m[2], 10);

        const idx    = _shellLineBuf.indexOf(fullSentinel);
        const before = _shellLineBuf.slice(0, idx);
        const after  = _shellLineBuf.slice(idx + fullSentinel.length);

        if (before) send('data', before);

        if (_sentinelCallback) {
          const cb = _sentinelCallback;
          _sentinelCallback = null;
          cb(layerId, exitCode);
        } else {
          send('layerDone', {
            layerId,
            error: exitCode !== 0 ? `Exited with code ${exitCode}` : null,
          });
        }

        _shellLineBuf = after;
        if (_shellLineBuf) {
          send('data', _shellLineBuf);
          _shellLineBuf = '';
        }
        return;
      }

      let sendLen = _shellLineBuf.length;
      const hashIdx = _shellLineBuf.lastIndexOf('##');
      if (hashIdx !== -1) {
        const sub = _shellLineBuf.slice(hashIdx);
        const isPrefix = /^##(?:W(?:F(?:R(?:_(?:D(?:O(?:N(?:E(?::(?:\d+(?::(?:\d+#?)?)?)?)?)?)?)?)?)?)?)?)?$/.test(sub);
        if (isPrefix) sendLen = hashIdx;
      } else if (_shellLineBuf.endsWith('#')) {
        sendLen = _shellLineBuf.length - 1;
      }

      if (sendLen > 0) {
        const toSend = _shellLineBuf.slice(0, sendLen);
        send('data', toSend);
        _shellLineBuf = _shellLineBuf.slice(sendLen);
      }

      if (_shellLineBuf) {
        _flushTimeout = setTimeout(() => {
          if (_shellLineBuf) {
            send('data', _shellLineBuf);
            _shellLineBuf = '';
          }
        }, 50);
      }
    });

    const myPty = _pty;
    _pty.onExit(({ exitCode }) => {
      if (_pty !== myPty) return;
      _pty = null;
      _claudeActive = false;
      if (_sentinelCallback) {
        const cb = _sentinelCallback;
        _sentinelCallback = null;
        _shellLineBuf = '';
        cb(_currentLayerId || 0, exitCode);
      }
      send('layerDone', {
        layerId: 'shell',
        error: exitCode !== 0 ? `Shell exited with code ${exitCode}` : null,
      });
    });

    return { ok: true };
  });

  // Run `claude /usage` and return its stdout
  safeHandle(`${prefix}:runUsage`, (_e, { exe, cwd: rawCwd }) => {
    return new Promise((resolve) => {
      const { exec } = require('node:child_process');
      const resolvedExe = resolveExe(exe || 'claude');
      const spawnCwd = (rawCwd && fs.existsSync(rawCwd)) ? rawCwd : os.homedir();
      exec(
        `"${resolvedExe}" --print /usage`,
        {
          cwd: spawnCwd,
          timeout: 15000,
          encoding: 'utf8',
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        },
        (err, stdout, stderr) => {
          const raw = (stdout || stderr || err?.message || '').trim();
          const clean = raw
            .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
            .replace(/\x1B\][^\x07]*\x07/g, '')
            .replace(/\x1B[()][AB012]/g, '')
            .replace(/\r/g, '');
          resolve({ output: clean });
        }
      );
    });
  });

  // Open a real PowerShell window running the Python agent
  safeHandle(`${prefix}:openInTerminal`, (_e, { scriptPath, project, message }) => {
    const spawnCwd = (project && fs.existsSync(project)) ? project : os.homedir();

    const q = (s) => s.replace(/"/g, '`"');
    const script = [
      `Set-Location "${q(spawnCwd)}"`,
      `python "${q(scriptPath)}" --project "${q(spawnCwd)}" --message @'`,
      message || '',
      `'@`,
    ].join('\n');

    const psFile = path.join(os.tmpdir(), `wfr-cli-${Date.now()}.ps1`);
    try {
      fs.writeFileSync(psFile, script, 'utf8');
    } catch (err) {
      return { ok: false, error: err.message };
    }

    const { spawn } = require('node:child_process');
    const proc = spawn(
      'cmd.exe',
      ['/c', 'start', 'powershell.exe', '-NoExit', '-NoLogo', '-File', psFile],
      { detached: true, stdio: 'ignore' }
    );
    proc.unref();

    setTimeout(() => { try { fs.unlinkSync(psFile); } catch (_) {} }, 8000);

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // Run a layer by sending a command into the already-running shell PTY.
  // A sentinel marker (##WFR_DONE:layerId:exitCode##) detects completion.
  // ---------------------------------------------------------------------------
  safeHandle(`${prefix}:runInShell`, (event, { layerId, prompt, systemPrompt, model, cwd, skipPermissions, interactive }) => {
    if (!_pty) return { ok: false, error: 'No shell running — terminal not initialised' };
    _wc = event.sender;

    cleanOldTempFiles();

    const exe       = model?.executable || 'claude';
    const modelName = model?.model_name || 'claude-haiku-4-5';
    const isWin     = os.platform() === 'win32';
    const spawnCwd  = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : (prompt || '');
    const ts         = Date.now();
    // Claude Code CLI sandboxes file reads to within its working directory —
    // a prompt file under the OS temp dir (outside cwd) gets rejected with
    // "outside the allowed working directory". Write it inside cwd instead,
    // in a hidden subfolder, so `@<file>` resolves within the sandbox.
    const tmpDir  = path.join(spawnCwd, '.devflow-tmp');
    let tmpFile;
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
      cleanOldTempFilesIn(tmpDir);
      tmpFile = path.join(tmpDir, `prompt-${layerId}-${ts}.txt`);
      fs.writeFileSync(tmpFile, fullPrompt, 'utf8');
    } catch (err) {
      return { ok: false, error: err.message };
    }

    _currentLayerId  = layerId;
    _shellLineBuf    = '';
    _lastCommandTime = Date.now();

    _sentinelCallback = (foundLayerId, exitCode) => {
      send('layerDone', {
        layerId: foundLayerId,
        error:   exitCode !== 0 ? `Exited with code ${exitCode}` : null,
      });
    };

    const escapedPath = isWin
      ? tmpFile.replace(/'/g, "''")
      : tmpFile.replace(/'/g, "'\\''");

    // Layers can point at different project-layer folders — the shell is a
    // long-lived PTY reused across layers, so its cwd must be explicitly
    // (re)synced to this layer's folder before every run, not just once at
    // spawn time. Without this, a layer whose folder differs from wherever
    // the shell was last left runs its prompt against the wrong directory.
    const escapedCwd = isWin
      ? spawnCwd.replace(/'/g, "''")
      : spawnCwd.replace(/'/g, "'\\''");
    const cdCmd = isWin
      ? `Set-Location -LiteralPath '${escapedCwd}'; [System.IO.Directory]::SetCurrentDirectory($pwd)`
      : `cd '${escapedCwd}'`;

    // `-c` resumes Claude's previous conversation, which stays anchored to the
    // directory it was started in — if this layer's folder differs from the
    // last one, continuing would keep operating on the OLD layer's folder
    // even though the shell itself has cd'd elsewhere. Only allow continuation
    // when consecutive layers share the same cwd; otherwise force a fresh
    // cold start scoped to the new directory.
    const canContinueSession = _batchSessionActive && _batchSessionCwd === spawnCwd;

    const skipPermsFlag = (model?.skip_perms_flag != null) ? model.skip_perms_flag : '--dangerously-skip-permissions';
    const permsPart     = (skipPermissions && skipPermsFlag) ? skipPermsFlag + ' ' : '';

    let coreCmd;

    if (model?.use_devflow_agent && (model?.type === 'api' || model?.type === 'anthropic')) {
      const agentPath = path.join(__dirname, '../../devflow-cli/agent.py');
      const provider  = model.type === 'anthropic' ? 'anthropic' : 'custom';
      const baseUrlPart = (provider === 'custom' && model?.base_url)
        ? ` --base-url "${model.base_url}"`
        : '';
      if (isWin) {
        coreCmd = `python "${agentPath}" --project "${spawnCwd}" --message (Get-Content '${escapedPath}' -Raw) --provider ${provider} --model ${modelName}${baseUrlPart} --verbose`;
      } else {
        coreCmd = `python "${agentPath}" --project "${spawnCwd}" --message "$(cat '${escapedPath}')" --provider ${provider} --model ${modelName}${baseUrlPart} --verbose`;
      }
      const fullCmd = isWin
        ? `${cdCmd}; ${coreCmd}; Write-Host "##WFR_DONE:${layerId}:${WIN_EXIT_CODE_EXPR}##"`
        : `${cdCmd}; ${coreCmd}; echo "##WFR_DONE:${layerId}:$?"`;
      _pty.write(fullCmd + '\r');
      return { ok: true, command: coreCmd };
    }

    const escapedSpawnCwd = spawnCwd.replace(/"/g, '\\"');

    if (model?.flags && model.flags.includes('{{prompt}}')) {
      const resolved = model.flags
        .replace(/\{\{model\}\}/g, modelName)
        .replace(/\{\{prompt\}\}/g, escapedPath)
        .replace(/\{\{cwd\}\}/g, escapedSpawnCwd);

      let batchPart = '';
      if (interactive === false) {
        if (model?.batch_flags) {
          batchPart = model.batch_flags + ' ';
        } else if (exe === 'claude') {
          // No batch_flags configured for this Claude CLI config — fall back to
          // the same auto non-interactive behavior as the flag-less default path,
          // so Run All still runs headless instead of dropping into the REPL.
          batchPart = '--print ' + (canContinueSession ? '-c ' : '');
        }
      }

      coreCmd = `${exe} ${permsPart}${batchPart}${resolved}`;
    } else if (model?.flags) {
      const echoCmd = isWin
        ? `Write-Host "Prompt file: ${tmpFile}"`
        : `echo "Prompt file: ${tmpFile}"`;
      const resolvedFlags = model.flags
        .replace(/\{\{model\}\}/g, modelName)
        .replace(/\{\{cwd\}\}/g, escapedSpawnCwd);
      const batchPart = (interactive === false && model?.batch_flags)
        ? model.batch_flags + ' '
        : '';
      coreCmd = `${echoCmd}; ${exe} ${permsPart}${batchPart}${resolvedFlags}`;
    } else {
      if (_claudeActive) {
        _pty.write(`@${tmpFile}\r`);
        return { ok: true, command: `[Pasting into active Claude session] @${tmpFile}` };
      }

      let batchPart = '';
      if (interactive === false) {
        if (model?.batch_flags != null) {
          batchPart = model.batch_flags ? model.batch_flags + ' ' : '';
        } else {
          batchPart = '--print ' + (canContinueSession ? '-c ' : '');
        }
      }

      coreCmd = `${exe} ${permsPart}${batchPart}--model ${modelName} '@${escapedPath}'`;
    }

    if (interactive === false) {
      _batchSessionActive = true;
      _batchSessionCwd    = spawnCwd;
    }

    const fullCmd = isWin
      ? `${cdCmd}; ${coreCmd}; Write-Host "##WFR_DONE:${layerId}:${WIN_EXIT_CODE_EXPR}##"`
      : `${cdCmd}; ${coreCmd}; echo "##WFR_DONE:${layerId}:$?"`;

    _pty.write(fullCmd + '\r');

    return { ok: true, command: coreCmd };
  });

  // ---------------------------------------------------------------------------
  // Spawn a new PTY to execute one layer directly (not via a shell).
  // ---------------------------------------------------------------------------
  safeHandle(`${prefix}:runLayer`, (event, { layerId, prompt, systemPrompt, model, cwd, cols, rows, continueSession, skipPermissions }) => {
    killPty();
    _wc = event.sender;

    const exeRaw    = model.executable || 'claude';
    const modelName = model.model_name || 'claude-haiku-4-5';
    const isPython  = exeRaw.toLowerCase().endsWith('.py');

    const fullPrompt = (!continueSession && systemPrompt) ? `${systemPrompt}\n\n---\n\n${prompt}` : (prompt || '');
    const spawnCwd   = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();

    let spawnExe, spawnArgs;
    let useArg = true;

    if (isPython) {
      const ts = Date.now();
      _tmpFile = path.join(os.tmpdir(), `wfr-prompt-${ts}.txt`);
      try {
        fs.writeFileSync(_tmpFile, fullPrompt, 'utf8');
      } catch (err) {
        send('layerDone', { layerId, error: err.message });
        return { ok: false };
      }
      spawnExe  = 'python';
      spawnArgs = [exeRaw, _tmpFile];
    } else {
      const MAX_ARG = 20000;
      useArg  = fullPrompt.length <= MAX_ARG;

      spawnExe  = resolveExe(exeRaw);
      spawnArgs = [
        ...(skipPermissions ? ['--dangerously-skip-permissions'] : []),
        '--print',
        '--verbose',
        '--output-format', 'stream-json',
        '--include-partial-messages',
        '--model', modelName,
        ...(useArg ? [fullPrompt] : []),
      ];
    }

    try {
      _pty = pty.spawn(spawnExe, spawnArgs, {
        name: 'xterm-256color',
        cols: Math.max(2, cols || 120),
        rows: Math.max(2, rows || 30),
        cwd:  spawnCwd,
        env:  {
          ...process.env,
          TERM:        'xterm-256color',
          FORCE_COLOR: '1',
          COLORTERM:   'truecolor',
        },
      });
    } catch (err) {
      send('layerDone', { layerId, error: `Failed to spawn "${spawnExe}": ${err.message}` });
      return { ok: false };
    }

    if (!useArg && !isPython) {
      setTimeout(() => {
        if (_pty) {
          _pty.write(fullPrompt);
          _pty.write('\r\n\x1a');
        }
      }, 120);
    }

    _jsonLineBuf = '';
    _pty.onData((data) => {
      if (isPython) {
        send('data', data);
        return;
      }
      _jsonLineBuf += data;
      const lines = _jsonLineBuf.split('\n');
      _jsonLineBuf = lines.pop();
      for (const line of lines) {
        const out = formatStreamLine(line);
        if (out) send('data', out);
      }
    });

    const myPty = _pty;
    _pty.onExit(({ exitCode }) => {
      if (_pty !== myPty) return;
      if (_jsonLineBuf.trim() && !isPython) {
        const out = formatStreamLine(_jsonLineBuf);
        if (out) send('data', out);
        _jsonLineBuf = '';
      }
      _pty = null;
      if (_tmpFile) { try { fs.unlinkSync(_tmpFile); } catch (_) {} _tmpFile = null; }
      send('layerDone', {
        layerId,
        error: exitCode !== 0 ? `Exited with code ${exitCode}` : null,
      });
    });

    return { ok: true };
  });
}

registerPtyHandlers('wfrPty');
registerPtyHandlers('irPty');
registerPtyHandlers('termPty');
registerPtyHandlers('plPty');

// Keep named export for the existing ipc/index.js call — now a no-op since
// handlers are already registered by the two calls above.
function registerWfrPtyHandlers() {}

module.exports = { registerWfrPtyHandlers, registerPtyHandlers };
