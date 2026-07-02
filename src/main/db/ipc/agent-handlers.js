'use strict';

const { safeHandle }       = require('../../ipc-safe-handle');
const { execSync, spawn }  = require('child_process');
const path                 = require('node:path');

const AGENT_DIR = path.join(__dirname, '../../../../agent');

function registerAgentHandlers() {
  // Check whether the `devflow` console command is available in PATH
  safeHandle('agent:checkInstalled', () => {
    try {
      execSync('devflow --help', { timeout: 5000, stdio: 'ignore' });
      return { installed: true };
    } catch (_) {
      return { installed: false };
    }
  });

  // Run `pip install -e .` in the agent directory.
  // Streams output lines back as agent:installLog events, then resolves.
  safeHandle('agent:install', (event) => {
    return new Promise((resolve) => {
      const wc   = event.sender;
      const send = (text) => { if (!wc.isDestroyed()) wc.send('agent:installLog', { text }); };

      const proc = spawn('pip', ['install', '-e', '.'], {
        cwd:   AGENT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      proc.stdout.on('data', d => send(d.toString()));
      proc.stderr.on('data', d => send(d.toString()));
      proc.on('close', code  => resolve({ success: code === 0, exitCode: code }));
      proc.on('error', err   => resolve({ success: false, error: err.message }));
    });
  });
}

module.exports = { registerAgentHandlers };
