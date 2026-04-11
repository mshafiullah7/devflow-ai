#!/usr/bin/env node
/**
 * agent-cli — Local AI coding agent powered by Ollama
 * Usage: node agent-cli/index.js [--model phi4-mini] [--dir /path/to/project]
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

// ─── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const MODEL = getArg('--model', 'phi4-mini:latest');
const PROJECT_DIR = path.resolve(getArg('--dir', process.cwd()));
const OLLAMA_HOST = getArg('--host', 'http://localhost:11434');
const MAX_TOOL_ROUNDS = 10;

// ─── Colors ──────────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

const clr = (color, text) => `${c[color]}${text}${c.reset}`;

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an autonomous coding agent working on a software project.
Project directory: ${PROJECT_DIR}

You have access to the following tools. To use a tool, emit a block in this exact format:

<tool_call>
<name>TOOL_NAME</name>
<input>TOOL_INPUT_AS_JSON</input>
</tool_call>

Available tools:

1. read_file
   Input: { "path": "relative/or/absolute/path" }
   Reads the content of a file.

2. write_file
   Input: { "path": "relative/or/absolute/path", "content": "full file content" }
   Writes (overwrites) a file with the given content. Creates directories if needed.

3. list_files
   Input: { "path": "relative/or/absolute/path", "pattern": "optional glob like **/*.js" }
   Lists files in a directory.

4. run_command
   Input: { "command": "shell command", "cwd": "optional working dir" }
   Runs a shell command and returns stdout/stderr. Use carefully.

5. search_code
   Input: { "pattern": "regex or text", "path": "optional dir or file", "glob": "optional *.js" }
   Searches for a pattern in files.

6. patch_file
   Input: { "path": "file path", "old": "exact text to replace", "new": "replacement text" }
   Replaces an exact string in a file. Safer than write_file for small edits.

Rules:
- Always read a file before editing it.
- Use patch_file for small targeted edits; write_file only for new files or full rewrites.
- After making changes, verify by reading the file back.
- Paths can be relative to the project directory or absolute.
- When done, provide a clear summary of what was changed.
- Think step by step. Use tools one at a time and observe results before continuing.
`;

// ─── Ollama API ───────────────────────────────────────────────────────────────

function ollamaRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(OLLAMA_HOST + endpoint);
    const lib = url.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);

    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error('Invalid JSON from Ollama: ' + raw.slice(0, 200)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function chatCompletion(messages) {
  const res = await ollamaRequest('/api/chat', {
    model: MODEL,
    messages,
    stream: false,
    options: { temperature: 0.2, num_predict: 4096 },
  });
  if (!res.message) throw new Error('No message in response: ' + JSON.stringify(res));
  return res.message.content;
}

// ─── Tool Execution ──────────────────────────────────────────────────────────

function resolvePath(p) {
  // Treat Unix-style absolute paths like /src as relative to PROJECT_DIR on Windows.
  // A real Windows absolute path looks like C:\... or C:/...
  if (path.isAbsolute(p) && !/^[A-Za-z]:[/\\]/.test(p)) {
    p = p.replace(/^[/\\]+/, ''); // strip leading slashes → make relative
  }
  if (path.isAbsolute(p)) return p;
  return path.join(PROJECT_DIR, p);
}

function safeRelative(p) {
  const abs = resolvePath(p);
  const rel = path.relative(PROJECT_DIR, abs);
  return rel;
}

const tools = {
  read_file({ path: p }) {
    const abs = resolvePath(p);
    if (!fs.existsSync(abs)) return `Error: File not found: ${abs}`;
    const stat = fs.statSync(abs);
    if (stat.size > 200 * 1024) return `Error: File too large (${stat.size} bytes). Use search_code to find specific sections.`;
    return fs.readFileSync(abs, 'utf8');
  },

  write_file({ path: p, content }) {
    const abs = resolvePath(p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return `Written ${content.length} chars to ${safeRelative(p)}`;
  },

  list_files({ path: p = '.', pattern }) {
    const abs = resolvePath(p);
    if (!fs.existsSync(abs)) return `Error: Path not found: ${abs}`;

    function walk(dir, depth = 0) {
      if (depth > 4) return [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const results = [];
      for (const e of entries) {
        if (['node_modules', '.git', 'out', 'backup', '.cache'].includes(e.name)) continue;
        const full = path.join(dir, e.name);
        const rel = path.relative(PROJECT_DIR, full);
        if (e.isDirectory()) {
          results.push(`📁 ${rel}/`);
          results.push(...walk(full, depth + 1));
        } else {
          if (!pattern || rel.includes(pattern.replace('**/', '').replace('*', ''))) {
            results.push(`   ${rel}`);
          }
        }
      }
      return results;
    }

    const lines = walk(abs);
    return lines.length ? lines.join('\n') : '(empty directory)';
  },

  run_command({ command, cwd }) {
    const workDir = cwd ? resolvePath(cwd) : PROJECT_DIR;
    // Safety: block obviously destructive commands
    const blocked = ['rm -rf /', 'del /f /s', 'format ', 'mkfs', 'dd if='];
    for (const b of blocked) {
      if (command.toLowerCase().includes(b)) {
        return `Error: Blocked command for safety: "${b}"`;
      }
    }
    try {
      const out = execSync(command, {
        cwd: workDir,
        timeout: 30000,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        shell: true,
      });
      return out || '(no output)';
    } catch (err) {
      return `Exit ${err.status || 1}:\n${err.stdout || ''}\n${err.stderr || err.message}`;
    }
  },

  search_code({ pattern, path: p = '.', glob }) {
    const abs = resolvePath(p);
    try {
      let cmd = `grep -r --include="*.js" --include="*.json" --include="*.html" --include="*.css" -n -l "${pattern}" "${abs}" 2>/dev/null | head -20`;
      if (glob) {
        const ext = glob.replace('*.', '').replace('**/*.', '');
        cmd = `grep -r --include="*.${ext}" -n "${pattern}" "${abs}" 2>/dev/null | head -40`;
      } else {
        cmd = `grep -rn "${pattern}" --include="*.js" --include="*.json" --include="*.html" --include="*.css" "${abs}" 2>/dev/null | head -40`;
      }
      const out = execSync(cmd, { encoding: 'utf8', shell: true, timeout: 10000 });
      return out || `No matches found for: ${pattern}`;
    } catch (err) {
      return `Search error: ${err.message}`;
    }
  },

  patch_file({ path: p, old: oldText, new: newText }) {
    const abs = resolvePath(p);
    if (!fs.existsSync(abs)) return `Error: File not found: ${abs}`;
    const content = fs.readFileSync(abs, 'utf8');
    if (!content.includes(oldText)) return `Error: Could not find the text to replace in ${safeRelative(p)}. Check spacing/indentation.`;
    const count = (content.split(oldText).length - 1);
    if (count > 1) return `Error: Found ${count} occurrences of the text. Make old string more specific.`;
    const updated = content.replace(oldText, newText);
    fs.writeFileSync(abs, updated, 'utf8');
    return `Patched ${safeRelative(p)} — replaced 1 occurrence.`;
  },
};

// ─── Tool Call Parser ─────────────────────────────────────────────────────────

function parseToolCalls(text) {
  const calls = [];

  // Try all known formats in priority order, stop at first that yields matches.
  const patterns = [
    // Format 1 — standard XML: <name>tool</name> <input>{...}</input>
    /<tool_call>\s*<name>([\w]+)<\/name>\s*<input>([\s\S]*?)<\/input>\s*<\/tool_call>/g,
    // Format 2 — missing </input>: <name>tool</name> <input>{...}   </tool_call>
    /<tool_call>\s*<name>([\w]+)<\/name>\s*<input>([\s\S]*?)\s*<\/tool_call>/g,
    // Format 3 — phi4-mini style: {name} tool\n{input}\n{...json...}\n</tool_call>
    /<tool_call>\s*\{name\}\s*([\w]+)\s*\{input\}\s*([\s\S]*?)\s*<\/tool_call>/g,
    // Format 4 — plain name/input lines inside tags
    /<tool_call>\s*name:\s*([\w]+)\s*input:\s*([\s\S]*?)\s*<\/tool_call>/gi,
  ];

  for (const regex of patterns) {
    const matches = [...text.matchAll(regex)];
    if (matches.length === 0) continue;

    for (const match of matches) {
      const name     = match[1].trim();
      const inputRaw = match[2].trim();
      // inputRaw may be JSON directly, or wrapped in extra braces — try to find first {...}
      const jsonStr = inputRaw.startsWith('{') ? inputRaw : (inputRaw.match(/\{[\s\S]*\}/) || [inputRaw])[0];
      try {
        const input = JSON.parse(jsonStr);
        calls.push({ name, input });
      } catch (e) {
        calls.push({ name, input: null, parseError: `Invalid JSON: ${e.message}\nRaw: ${inputRaw}` });
      }
    }
    break; // stop after first format that matched
  }

  return calls;
}

function executeTool(name, input) {
  if (!tools[name]) return `Error: Unknown tool "${name}"`;
  if (!input) return `Error: Invalid tool input JSON`;
  try {
    return tools[name](input);
  } catch (err) {
    return `Error executing ${name}: ${err.message}`;
  }
}

// ─── Agentic Loop ─────────────────────────────────────────────────────────────

async function runAgentLoop(userMessage, conversationHistory) {
  const messages = [
    ...conversationHistory,
    { role: 'user', content: userMessage },
  ];

  console.log(clr('dim', '\n[Thinking...]\n'));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chatCompletion([
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ]);

    const toolCalls = parseToolCalls(response);

    if (toolCalls.length === 0) {
      // No tool calls — final answer
      const clean = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      console.log(clr('cyan', '\nAssistant: ') + clean + '\n');
      messages.push({ role: 'assistant', content: response });
      return messages;
    }

    // Show thinking text (before tool calls)
    const thinkingText = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
    if (thinkingText) {
      console.log(clr('dim', thinkingText) + '\n');
    }

    messages.push({ role: 'assistant', content: response });

    // Execute all tool calls
    let toolResultBlock = '';
    for (const call of toolCalls) {
      console.log(clr('yellow', `  ⚙  ${call.name}`) + clr('gray', ' ' + JSON.stringify(call.input)));
      const result = call.parseError
        ? `Error: ${call.parseError}`
        : executeTool(call.name, call.input);

      const truncated = typeof result === 'string' && result.length > 8000
        ? result.slice(0, 8000) + '\n... (truncated)'
        : result;

      toolResultBlock += `<tool_result>\n<name>${call.name}</name>\n<output>${truncated}</output>\n</tool_result>\n`;
      console.log(clr('green', '  ✓ done') + clr('gray', ` (${String(result).length} chars)\n`));
    }

    messages.push({ role: 'user', content: toolResultBlock });
  }

  console.log(clr('red', '\nMax tool rounds reached. Agent stopped.\n'));
  return messages;
}

// ─── REPL ─────────────────────────────────────────────────────────────────────

async function checkOllama() {
  return new Promise((resolve) => {
    const url = new URL(OLLAMA_HOST + '/api/tags');
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.get(
      { hostname: url.hostname, port: url.port || 11434, path: '/api/tags', timeout: 3000 },
      (res) => { resolve(res.statusCode < 500); }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function main() {
  console.log(clr('bold', '\n╔══════════════════════════════════════════╗'));
  console.log(clr('bold', '║       AI Coding Agent  (Ollama)          ║'));
  console.log(clr('bold', '╚══════════════════════════════════════════╝'));
  console.log(clr('cyan',  `  Model   : ${MODEL}`));
  console.log(clr('cyan',  `  Project : ${PROJECT_DIR}`));
  console.log(clr('cyan',  `  Ollama  : ${OLLAMA_HOST}`));
  console.log(clr('dim',   '\n  Commands: /clear  /exit  /model <name>  /dir\n'));

  const ok = await checkOllama();
  if (!ok) {
    console.error(clr('red', `\nError: Cannot reach Ollama at ${OLLAMA_HOST}`));
    console.error(clr('yellow', 'Make sure Ollama is running: ollama serve\n'));
    process.exit(1);
  }
  console.log(clr('green', '  Ollama connection OK\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: clr('magenta', 'You > '),
  });

  let conversationHistory = [];
  let currentModel = MODEL;

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // Commands
    if (input === '/exit' || input === '/quit') {
      console.log(clr('dim', 'Goodbye.\n'));
      process.exit(0);
    }
    if (input === '/clear') {
      conversationHistory = [];
      console.log(clr('green', '  Conversation cleared.\n'));
      rl.prompt();
      return;
    }
    if (input === '/dir') {
      console.log(clr('cyan', `  Project dir: ${PROJECT_DIR}\n`));
      rl.prompt();
      return;
    }
    if (input.startsWith('/model ')) {
      currentModel = input.slice(7).trim();
      console.log(clr('green', `  Switched to model: ${currentModel}\n`));
      rl.prompt();
      return;
    }
    if (input === '/history') {
      console.log(clr('dim', JSON.stringify(conversationHistory, null, 2) + '\n'));
      rl.prompt();
      return;
    }

    rl.pause();
    try {
      conversationHistory = await runAgentLoop(input, conversationHistory);
      // Keep last 20 turns to avoid context overflow
      if (conversationHistory.length > 40) {
        conversationHistory = conversationHistory.slice(-40);
      }
    } catch (err) {
      console.error(clr('red', `\nError: ${err.message}\n`));
    }
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(clr('dim', '\nGoodbye.\n'));
    process.exit(0);
  });
}

// ─── Single-shot mode (--once) ───────────────────────────────────────────────
// Used by the Electron app: prompt is piped via stdin, result printed to stdout, then exit.

async function runOnce() {
  // Read prompt from stdin
  const chunks = [];
  process.stdin.resume();
  process.stdin.on('data', (d) => chunks.push(d));
  await new Promise((resolve) => process.stdin.on('end', resolve));
  const prompt = Buffer.concat(chunks).toString('utf8').trim();

  const done = (code) => {
    // Flush stdout/stderr before exiting (process.exit skips buffer flush)
    process.stdout.write('', () => {
      process.stderr.write('', () => process.exit(code));
    });
  };

  if (!prompt) {
    process.stderr.write('agent-cli --once: no prompt received on stdin\n');
    return done(1);
  }

  const ok = await checkOllama();
  if (!ok) {
    process.stderr.write(`agent-cli: Cannot reach Ollama at ${OLLAMA_HOST}\n`);
    return done(1);
  }

  const messages = [{ role: 'user', content: prompt }];

  // Strip ANSI color codes from text going to the app terminal panel
  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');

  const out  = (s) => process.stdout.write(stripAnsi(s));
  const oute = (s) => process.stderr.write(stripAnsi(s));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await chatCompletion([
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ]);

    const toolCalls = parseToolCalls(response);

    if (toolCalls.length === 0) {
      // No tool calls — this is the final answer
      const clean = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      out((clean || '(no response)') + '\n');
      return done(0);
    }

    // Print any thinking text before the tool calls
    const thinkingText = response.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
    if (thinkingText) out(thinkingText + '\n');

    messages.push({ role: 'assistant', content: response });

    // Execute tools and collect results
    let toolResultBlock = '';
    for (const call of toolCalls) {
      out(`[tool: ${call.name}] ${JSON.stringify(call.input)}\n`);
      const result = call.parseError
        ? `Error: ${call.parseError}`
        : executeTool(call.name, call.input);
      const truncated = typeof result === 'string' && result.length > 8000
        ? result.slice(0, 8000) + '\n... (truncated)' : result;
      out(`${truncated}\n`);
      toolResultBlock += `<tool_result>\n<name>${call.name}</name>\n<output>${truncated}</output>\n</tool_result>\n`;
    }

    messages.push({ role: 'user', content: toolResultBlock });
  }

  oute('agent-cli: max tool rounds reached\n');
  return done(1);
}

if (args.includes('--once')) {
  runOnce();
} else {
  main();
}
