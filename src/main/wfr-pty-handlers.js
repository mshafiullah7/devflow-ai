'use strict';

const { safeHandle } = require('./ipc-safe-handle');
const pty  = require('node-pty');
const os   = require('node:os');
const fs   = require('node:fs');
const path = require('node:path');

let _pty             = null;
let _wc              = null;
let _tmpFile         = null;   // kept only for Python-agent stdin; not used for claude CLI
let _jsonLineBuf     = '';     // accumulates partial PTY lines for stream-json parsing
let _sentinelCallback = null;  // set while waiting for ##WFR_DONE:## from the shell
let _shellLineBuf    = '';     // line buffer used during sentinel detection
let _claudeActive        = false;
let _batchSessionActive  = false; // true after first non-interactive layer runs; enables -c for subsequent layers
let _currentLayerId      = null;
let _lastCommandTime     = 0;
let _flushTimeout        = null;

// ---------------------------------------------------------------------------
// Parse one line of Claude CLI --output-format stream-json output and return
// a human-readable string to write to xterm, or null to suppress the line.
// ---------------------------------------------------------------------------
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
      send('wfrPty:tokenStats', {
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
        send('wfrPty:tokenStats', { thinkingTokens: obj.estimated_tokens });
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

function send(ch, data) {
  if (_wc && !_wc.isDestroyed()) _wc.send(ch, data);
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

// ---------------------------------------------------------------------------
// Resolve an executable name to its full path on Windows.
// node-pty needs the real exe path when the command is a shim/cmd wrapper.
// e.g. npm-installed 'claude' lives at  %APPDATA%\npm\claude.cmd  — but the
// *real* binary is the .exe inside node_modules.  We let 'where.exe' find it.
// Falls back to the original name if lookup fails (works fine when it's truly
// in PATH as a native exe).
// ---------------------------------------------------------------------------
function resolveExe(name) {
  if (path.isAbsolute(name)) return name;
  try {
    const { execSync } = require('node:child_process');
    // 'where' returns the first match; on Windows it finds .exe/.cmd/.bat
    const result = execSync(`where "${name}"`, { encoding: 'utf8', timeout: 3000 }).trim();
    // Prefer .exe over .cmd wrappers (first .exe line wins)
    const lines = result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const exeLine = lines.find(l => l.toLowerCase().endsWith('.exe'));
    return exeLine || lines[0] || name;
  } catch (_) {
    return name;
  }
}

function registerWfrPtyHandlers() {

  // Write raw keystrokes to running PTY (user typing into the terminal)
  safeHandle('wfrPty:write', (_e, data) => {
    if (_pty) _pty.write(data);
  });

  // Resize PTY to match terminal window dimensions
  safeHandle('wfrPty:resize', (_e, { cols, rows }) => {
    if (_pty) {
      try { _pty.resize(Math.max(2, cols), Math.max(2, rows)); } catch (_) {}
    }
  });

  // Kill any running layer PTY
  safeHandle('wfrPty:kill', () => { killPty(); });

  // Spawn a raw interactive shell
  safeHandle('wfrPty:spawnShell', (event, { cwd, cols, rows }) => {
    _wc = event.sender;

    const isWin = os.platform() === 'win32';
    if (_pty) {
      // Reuse existing PTY and change directory to avoid conhost.exe flashing on selection change
      const spawnCwd = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();
      const cdCmd = isWin 
        ? `Set-Location "${spawnCwd}"; Clear-Host` 
        : `cd "${spawnCwd}" && clear`;
      _pty.write(cdCmd + '\r');
      return { ok: true, reused: true };
    }

    killPty();
    _wc = event.sender;

    const spawnExe = isWin ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    const spawnArgs = isWin
      ? ['-NoLogo', '-NoExit', '-Command', 'Remove-Module PSReadLine -ErrorAction SilentlyContinue']
      : [];
    const spawnCwd = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();

    try {
      _pty = pty.spawn(spawnExe, spawnArgs, {
        name: 'xterm-256color',
        cols: Math.max(2, cols || 120),
        rows: Math.max(2, rows || 30),
        cwd:  spawnCwd,
        env:  {
          ...process.env,
          TERM:      'xterm-256color',
          FORCE_COLOR: '1',
          COLORTERM: 'truecolor',
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

      // Check for complete sentinel
      const m = _shellLineBuf.match(/##WFR_DONE:(\d+):(\d+)##/);
      if (m) {
        const fullSentinel = m[0];
        const layerId = parseInt(m[1], 10);
        const exitCode = parseInt(m[2], 10);

        const idx = _shellLineBuf.indexOf(fullSentinel);
        const before = _shellLineBuf.slice(0, idx);
        const after = _shellLineBuf.slice(idx + fullSentinel.length);

        if (before) send('wfrPty:data', before);

        if (_sentinelCallback) {
          const cb = _sentinelCallback;
          _sentinelCallback = null;
          cb(layerId, exitCode);
        } else {
          send('wfrPty:layerDone', {
            layerId,
            error: exitCode !== 0 ? `Exited with code ${exitCode}` : null,
          });
        }

        _shellLineBuf = after;
        if (_shellLineBuf) {
          send('wfrPty:data', _shellLineBuf);
          _shellLineBuf = '';
        }
        return;
      }

      // Check for partial sentinel prefix
      let sendLen = _shellLineBuf.length;
      const hashIdx = _shellLineBuf.lastIndexOf('##');
      if (hashIdx !== -1) {
        const sub = _shellLineBuf.slice(hashIdx);
        const isPrefix = /^##(?:W(?:F(?:R(?:_(?:D(?:O(?:N(?:E(?::(?:\d+(?::(?:\d+#?)?)?)?)?)?)?)?)?)?)?)?)?$/.test(sub);
        if (isPrefix) {
          sendLen = hashIdx;
        }
      } else if (_shellLineBuf.endsWith('#')) {
        sendLen = _shellLineBuf.length - 1;
      }

      if (sendLen > 0) {
        const toSend = _shellLineBuf.slice(0, sendLen);
        send('wfrPty:data', toSend);
        _shellLineBuf = _shellLineBuf.slice(sendLen);
      }

      // If we have remaining buffered data (potential partial sentinel), set a timeout to flush it
      if (_shellLineBuf) {
        _flushTimeout = setTimeout(() => {
          if (_shellLineBuf) {
            send('wfrPty:data', _shellLineBuf);
            _shellLineBuf = '';
          }
        }, 50);
      }
    });

    const myPty = _pty;
    _pty.onExit(({ exitCode }) => {
      if (_pty !== myPty) {
        // Old/replaced PTY process, do not send shell exited events
        return;
      }
      _pty = null;
      _claudeActive = false;
      if (_sentinelCallback) {
        const cb = _sentinelCallback;
        _sentinelCallback = null;
        _shellLineBuf = '';
        cb(_currentLayerId || 0, exitCode);
      }
      send('wfrPty:layerDone', {
        layerId: 'shell',
        error: exitCode !== 0 ? `Shell exited with code ${exitCode}` : null,
      });
    });

    return { ok: true };
  });

  // Run `claude /usage` (or any configured exe) and return its stdout
  safeHandle('wfrPty:runUsage', (_e, { exe, cwd: rawCwd }) => {
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
          // Strip all ANSI escape sequences so xterm doesn't misinterpret them
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

  // Open a real PowerShell window running the Python agent with the given prompt.
  // Uses a temp .ps1 file so the prompt content never needs shell escaping.
  safeHandle('wfrPty:openInTerminal', (_e, { scriptPath, project, message }) => {
    const spawnCwd = (project && fs.existsSync(project)) ? project : os.homedir();

    const q = (s) => s.replace(/"/g, '`"');  // escape " for PS double-quoted strings
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

    // Give PowerShell time to read the file before we delete it
    setTimeout(() => { try { fs.unlinkSync(psFile); } catch (_) {} }, 8000);

    return { ok: true };
  });

  // ---------------------------------------------------------------------------
  // Run a workflow layer by sending a command into the already-running shell PTY.
  // The prompt is written to a temp file and passed via the CLI's @filepath syntax.
  // A sentinel marker (##WFR_DONE:layerId:exitCode##) is appended to the shell
  // command so completion can be detected without killing the shell.
  // ---------------------------------------------------------------------------
  safeHandle('wfrPty:runInShell', (event, { layerId, prompt, systemPrompt, model, cwd, skipPermissions, interactive }) => {
    if (!_pty) return { ok: false, error: 'No shell running — terminal not initialised' };
    _wc = event.sender;

    cleanOldTempFiles();

    const exe       = model?.executable || 'claude';
    const modelName = model?.model_name || 'claude-haiku-4-5';
    const isWin     = os.platform() === 'win32';
    const spawnCwd  = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();

    // Combine system context + user prompt into the temp file
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : (prompt || '');
    const ts         = Date.now();
    const tmpFile    = path.join(os.tmpdir(), `wfr-layer-${layerId}-${ts}.txt`);
    try {
      fs.writeFileSync(tmpFile, fullPrompt, 'utf8');
    } catch (err) {
      return { ok: false, error: err.message };
    }

    _currentLayerId = layerId;
    _shellLineBuf   = '';
    _lastCommandTime = Date.now();

    // Register callback BEFORE writing so no output is missed
    _sentinelCallback = (foundLayerId, exitCode) => {
      send('wfrPty:layerDone', {
        layerId: foundLayerId,
        error:   exitCode !== 0 ? `Exited with code ${exitCode}` : null,
      });
    };

    // Escape single quotes inside the path for safe single-quoting in the shell
    const escapedPath = isWin
      ? tmpFile.replace(/'/g, "''")           // PowerShell: '' inside single quotes
      : tmpFile.replace(/'/g, "'\\''");        // bash: end-quote, escaped quote, re-open

    // Resolve skip-permissions prefix — use model config, fall back to claude default
    const skipPermsFlag = (model?.skip_perms_flag != null) ? model.skip_perms_flag : '--dangerously-skip-permissions';
    const permsPart     = (skipPermissions && skipPermsFlag) ? skipPermsFlag + ' ' : '';

    let coreCmd;
    if (model?.flags && model.flags.includes('{{prompt}}')) {
      // Template-based: substitute {{model}} and {{prompt}} (file path) from model config
      const resolved = model.flags
        .replace(/\{\{model\}\}/g, modelName)
        .replace(/\{\{prompt\}\}/g, escapedPath);

      // Batch flags — use model config; empty string = no extra flags (CLI exits naturally)
      const batchPart = (interactive === false && model?.batch_flags)
        ? model.batch_flags + ' '
        : '';

      coreCmd = `${exe} ${permsPart}${batchPart}${resolved}`;
    } else {
      // Claude default path: @filepath syntax with interactive/batch handling
      if (_claudeActive) {
        _pty.write(`@${tmpFile}\r`);
        return { ok: true, command: `[Pasting into active Claude session] @${tmpFile}` };
      }

      // Batch flags — use model config if set, else Claude defaults (--print -c)
      let batchPart = '';
      if (interactive === false) {
        if (model?.batch_flags != null) {
          batchPart = model.batch_flags ? model.batch_flags + ' ' : '';
        } else {
          batchPart = '--print ' + (_batchSessionActive ? '-c ' : '');
        }
      }

      coreCmd = `${exe} ${permsPart}${batchPart}--model ${modelName} '@${escapedPath}'`;
    }

    if (interactive === false) _batchSessionActive = true;

    const fullCmd  = isWin
      ? `${coreCmd}; Write-Host "##WFR_DONE:${layerId}:$LASTEXITCODE##"`
      : `${coreCmd}; echo "##WFR_DONE:${layerId}:$?"`;

    // Send command into the live shell
    _pty.write(fullCmd + '\r');

    return { ok: true, command: coreCmd };
  });

  // ---------------------------------------------------------------------------
  // Spawn a new PTY to execute one workflow layer.
  //
  // ROOT CAUSE OF "no streaming" — Windows ConPTY only attaches to the DIRECTLY
  // spawned process.  All our previous approaches (PowerShell pipe, cmd.exe batch
  // file) put a shell between node-pty and claude.  That shell gets the ConPTY;
  // claude (a grandchild) does NOT.  So isatty(stdout) returns false for claude →
  // full stdout buffering → entire response arrives at once on process exit.
  //
  // THE FIX — spawn claude.exe (or python.exe) DIRECTLY as the PTY slave.
  // node-pty attaches the ConPTY directly to that process, isatty(stdout) → true,
  // and output streams to xterm line-by-line in real time.
  //
  // This is exactly what VS Code / Hyper do: the user's shell is the direct PTY
  // child, so every program the shell launches inherits the TTY handles and
  // streams live.  We skip the shell layer entirely.
  //
  // PROMPT DELIVERY — pass the prompt as a positional CLI argument so we don't
  // need any stdin pipe at all.  For very long prompts (> 20 KB) we fall back to
  // writing it to the PTY's stdin followed by Ctrl+Z (Windows EOF signal).
  //
  // TOOL-CALL VISIBILITY — `--output-format stream-json` makes Claude emit one
  // JSON object per line for every event (tool calls, text deltas, final result).
  // We parse each line in onData and format it as human-readable terminal output.
  // This avoids the TUI progress display that --verbose produces, which clears the
  // screen using ANSI escape sequences and hides intermediate work from the user.
  // ---------------------------------------------------------------------------
  safeHandle('wfrPty:runLayer', (event, { layerId, prompt, systemPrompt, model, cwd, cols, rows, continueSession, skipPermissions }) => {
    killPty();
    _wc = event.sender;

    const exeRaw   = model.executable || 'claude';
    const modelName = model.model_name || 'claude-haiku-4-5';
    const isPython  = exeRaw.toLowerCase().endsWith('.py');

    // When continuing a session the system context is already in history — send only the new prompt.
    const fullPrompt = (!continueSession && systemPrompt) ? `${systemPrompt}\n\n---\n\n${prompt}` : (prompt || '');
    const spawnCwd   = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();

    // For Python agents, spawn: python <script.py>
    // For everything else (claude, any other CLI): spawn exe directly
    let spawnExe, spawnArgs;
    let useArg = true;

    if (isPython) {
      // Python agent — write prompt to temp file and pass path as first arg,
      // OR pipe via stdin.  Adjust to match your agent.py's calling convention.
      const ts = Date.now();
      _tmpFile = path.join(os.tmpdir(), `wfr-prompt-${ts}.txt`);
      try {
        fs.writeFileSync(_tmpFile, fullPrompt, 'utf8');
      } catch (err) {
        send('wfrPty:layerDone', { layerId, error: err.message });
        return { ok: false };
      }
      spawnExe  = 'python';     // or 'python3' on unix
      spawnArgs = [exeRaw, _tmpFile];
    } else {
      // Claude CLI (or any other CLI model) — DIRECT spawn.
      // --print   : non-interactive, exits when done  → onExit fires layerDone
      // --verbose : streams tool-call events to stdout while processing
      //
      // Prompt as positional arg: avoids stdin entirely.
      // If the prompt exceeds 20 KB (edge case), fall back to PTY-stdin delivery.
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
          TERM:      'xterm-256color',
          FORCE_COLOR: '1',
          COLORTERM: 'truecolor',
        },
      });
    } catch (err) {
      send('wfrPty:layerDone', { layerId, error: `Failed to spawn "${spawnExe}": ${err.message}` });
      return { ok: false };
    }

    // If using stdin delivery (long prompt), write it now followed by
    // Windows EOF (Ctrl+Z on its own line).
    if (!useArg && !isPython) {
      // Small delay so the process has time to open its stdin read loop
      setTimeout(() => {
        if (_pty) {
          _pty.write(fullPrompt);
          _pty.write('\r\n\x1a'); // CRLF + Ctrl+Z = EOF on Windows PTY
        }
      }, 120);
    }

    _jsonLineBuf = '';
    _pty.onData((data) => {
      if (isPython) {
        // Python agents write plain text — pass through directly
        send('wfrPty:data', data);
        return;
      }
      // Claude CLI with --output-format stream-json: parse line-by-line
      _jsonLineBuf += data;
      const lines = _jsonLineBuf.split('\n');
      _jsonLineBuf = lines.pop(); // keep trailing incomplete line
      for (const line of lines) {
        const out = formatStreamLine(line);
        if (out) send('wfrPty:data', out);
      }
    });

    const myPty = _pty;
    _pty.onExit(({ exitCode }) => {
      if (_pty !== myPty) {
        // Old/replaced PTY process, ignore exit events
        return;
      }
      // Flush any remaining buffered content
      if (_jsonLineBuf.trim() && !isPython) {
        const out = formatStreamLine(_jsonLineBuf);
        if (out) send('wfrPty:data', out);
        _jsonLineBuf = '';
      }
      _pty = null;
      if (_tmpFile) { try { fs.unlinkSync(_tmpFile); } catch (_) {} _tmpFile = null; }
      send('wfrPty:layerDone', {
        layerId,
        error: exitCode !== 0 ? `Exited with code ${exitCode}` : null,
      });
    });

    return { ok: true };
  });
}

module.exports = { registerWfrPtyHandlers };
