'use strict';

const { safeHandle } = require('./ipc-safe-handle');
const pty  = require('node-pty');
const os   = require('node:os');
const fs   = require('node:fs');
const path = require('node:path');

let _pty     = null;
let _wc      = null;
let _tmpFile = null;   // kept only for Python-agent stdin; not used for claude CLI

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
  // TOOL-CALL VISIBILITY — `--print` alone outputs only the final answer.  Add
  // `--verbose` so claude also emits tool-call events (file reads, searches, etc.)
  // to stdout while it's working — the intermediate steps the user wants to see.
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
        '--verbose',
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

    _pty.onData((data) => send('wfrPty:data', data));

    _pty.onExit(({ exitCode }) => {
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
