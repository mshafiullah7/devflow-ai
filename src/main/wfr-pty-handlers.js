'use strict';

const { safeHandle } = require('./ipc-safe-handle');
const pty  = require('node-pty');
const os   = require('node:os');
const fs   = require('node:fs');
const path = require('node:path');

let _pty        = null;
let _wc         = null;
let _tmpFile    = null;   // kept only for Python-agent stdin; not used for claude CLI
let _jsonLineBuf = '';    // accumulates partial PTY lines for stream-json parsing

// ---------------------------------------------------------------------------
// Parse one line of Claude CLI --output-format stream-json output and return
// a human-readable string to write to xterm, or null to suppress the line.
// ---------------------------------------------------------------------------
function formatStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let obj;
  try { obj = JSON.parse(trimmed); } catch { return trimmed + '\r\n'; }

  switch (obj.type) {
    case 'tool_use': {
      const inp    = obj.tool_input || {};
      const detail = inp.file_path || inp.command || inp.query || inp.pattern || inp.path || '';
      const short  = detail.length > 70 ? '…' + detail.slice(-67) : detail;
      return `\x1b[36m●\x1b[0m \x1b[1m${obj.tool_name || 'Tool'}\x1b[0m${short ? `(\x1b[2m${short}\x1b[0m)` : ''}\r\n`;
    }
    case 'assistant': {
      const texts = (obj.message?.content || [])
        .filter(c => c.type === 'text').map(c => c.text).join('');
      return texts ? texts.replace(/\n/g, '\r\n') : null;
    }
    case 'result': {
      if (obj.subtype === 'error') return `\x1b[31m${obj.result || 'Error'}\x1b[0m\r\n`;
      const parts = [];
      if (obj.result) parts.push(obj.result.replace(/\n/g, '\r\n'));
      const u = obj.usage || {};
      const statsTokens = [];
      if (u.input_tokens  != null) statsTokens.push(`\x1b[2m↑ ${u.input_tokens.toLocaleString()} in\x1b[0m`);
      if (u.output_tokens != null) statsTokens.push(`\x1b[2m↓ ${u.output_tokens.toLocaleString()} out\x1b[0m`);
      if (u.cache_read_input_tokens)     statsTokens.push(`\x1b[2m${u.cache_read_input_tokens.toLocaleString()} cached\x1b[0m`);
      if (obj.cost_usd    != null) statsTokens.push(`\x1b[2m$${obj.cost_usd.toFixed(4)}\x1b[0m`);
      if (statsTokens.length) parts.push(`\r\n\x1b[2m── tokens: \x1b[0m${statsTokens.join('\x1b[2m  ·  \x1b[0m')}\r\n`);
      return parts.length ? parts.join('\r\n') + '\r\n' : null;
    }
    case 'system':
    case 'tool_result':
      return null;
    default:
      return null;
  }
}

function killPty() {
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
  safeHandle('wfrPty:runLayer', (event, { layerId, prompt, systemPrompt, model, cwd, cols, rows }) => {
    killPty();
    _wc = event.sender;

    const exeRaw   = model.executable || 'claude';
    const modelName = model.model_name || 'claude-haiku-4-5';
    const isPython  = exeRaw.toLowerCase().endsWith('.py');

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n---\n\n${prompt}` : (prompt || '');
    const spawnCwd   = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();

    // For Python agents, spawn: python <script.py>
    // For everything else (claude, any other CLI): spawn exe directly
    let spawnExe, spawnArgs;

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
      const useArg  = fullPrompt.length <= MAX_ARG;

      spawnExe  = resolveExe(exeRaw);
      spawnArgs = [
        '--dangerously-skip-permissions',
        '--print',
        '--output-format', 'stream-json',
        '--model', modelName,
        ...(useArg ? [fullPrompt] : []),
      ];

      if (!useArg) {
        // Prompt too long for a CLI arg — write to temp file and deliver via stdin
        const ts = Date.now();
        _tmpFile = path.join(os.tmpdir(), `wfr-prompt-${ts}.txt`);
        try {
          fs.writeFileSync(_tmpFile, fullPrompt, 'utf8');
        } catch (err) {
          send('wfrPty:layerDone', { layerId, error: err.message });
          return { ok: false };
        }
      }
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
    if (_tmpFile && !isPython) {
      try {
        const content = fs.readFileSync(_tmpFile, 'utf8');
        // Small delay so the process has time to open its stdin read loop
        setTimeout(() => {
          if (_pty) {
            _pty.write(content);
            _pty.write('\r\n\x1a'); // CRLF + Ctrl+Z = EOF on Windows PTY
          }
        }, 120);
      } catch (_) {}
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

    _pty.onExit(({ exitCode }) => {
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
