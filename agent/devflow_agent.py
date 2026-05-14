#!/usr/bin/env python3
"""
devflow-agent — Agentic CLI for Ollama models with full project context.

Usage:
    python devflow_agent.py --project /path/to/project --message "task description"

The agent:
  1. Builds a repo map of the project (file tree + class/function signatures)
  2. Injects it into the system prompt alongside available tools
  3. Runs an agentic loop: Ollama decides which tools to call, Python executes them
  4. Continues until Ollama stops calling tools or max-turns is reached
  5. Streams all output to stdout (flush=True) — compatible with Electron pipe

Standalone testing:
    pip install -r requirements.txt
    python devflow_agent.py --project C:\\my-project --message "add X" --model qwen2.5-coder:32b
"""

import argparse
import json
import re
import sys

import ollama

import context_builder
from tools import TOOLS, execute_tool

# ---------------------------------------------------------------------------
# Text-based tool call fallback
# Small models (7b, 14b) often ignore native tool calling and output the call
# as JSON or XML in their text response. This parser catches those cases.
# ---------------------------------------------------------------------------

class _FakeFn:
    """Mimics ollama's tool_call.function so the main loop works for both paths."""
    def __init__(self, name: str, arguments: dict):
        self.name      = name
        self.arguments = arguments

class _FakeToolCall:
    def __init__(self, name: str, arguments: dict):
        self.function = _FakeFn(name, arguments)


def _parse_text_tool_calls(content: str) -> list:
    """
    Parse tool calls that the model emitted as plain text instead of using the
    native tool-calling API. Handles these common output formats:

      Format A — JSON inside a markdown code block:
        ```json
        {"name": "list_directory", "arguments": {"path": "src/app"}}
        ```

      Format B — raw JSON object anywhere in the text:
        {"name": "read_file", "arguments": {"path": "lib/main.dart"}}

      Format C — agent-cli XML tags:
        <tool_call><name>read_file</name><input>{"path": "..."}</input></tool_call>

    Returns a list of _FakeToolCall objects.
    """
    calls = []

    # ── Format C: XML tags ────────────────────────────────────────────────────
    xml = re.compile(
        r'<tool_call>\s*<name>([\w]+)</name>\s*<input>([\s\S]*?)</input>\s*</tool_call>',
        re.IGNORECASE,
    )
    for m in xml.finditer(content):
        name = m.group(1).strip()
        try:
            args = json.loads(m.group(2).strip())
            calls.append(_FakeToolCall(name, args))
        except json.JSONDecodeError:
            pass
    if calls:
        return calls

    # ── Formats A & B: JSON objects ───────────────────────────────────────────
    # Collect candidates: first try markdown fences, then bare JSON objects
    candidates: list[str] = []

    # Format A — ```json ... ``` or ``` ... ```
    for m in re.finditer(r'```(?:json)?\s*\n([\s\S]*?)\n```', content):
        candidates.append(m.group(1).strip())

    # Format B — any top-level {...} block in the text (greedy brace matching)
    if not candidates:
        depth, start = 0, None
        for i, ch in enumerate(content):
            if ch == '{':
                if depth == 0:
                    start = i
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0 and start is not None:
                    candidates.append(content[start:i + 1])
                    start = None

    for raw in candidates:
        try:
            obj = json.loads(raw)
        except json.JSONDecodeError:
            continue

        # Accept {"name": ..., "arguments"/"input"/"parameters"/"args": ...}
        name = obj.get('name') or obj.get('tool') or obj.get('function')
        args = (obj.get('arguments') or obj.get('input') or
                obj.get('parameters') or obj.get('args') or {})
        if isinstance(name, str) and name.strip():
            calls.append(_FakeToolCall(name.strip(), args if isinstance(args, dict) else {}))

    return calls


# ---------------------------------------------------------------------------
# System prompt template
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_TEMPLATE = """\
You are an expert software developer with full access to the project via tools.

Project root: {project_root}

{repo_map}

## Available tools
- read_file(path)              — read a file's content (always do this before writing)
- write_file(path, content)    — write or overwrite a file
- list_directory(path)         — list files and folders
- search_code(pattern, path)   — regex search across source files
- get_file_tree(max_depth)     — show full project structure
- run_command(command)         — run a shell command (tests, linters, git, etc.)
- delete_file(path)            — delete a file
- create_directory(path)       — create a directory

## Rules
- Always read a file before modifying it so you have the current content
- Use relative paths from the project root for all file operations
- Make ALL necessary changes across ALL affected files in one session
- When done with all changes, provide a concise summary of what was changed and why
- Do not ask for confirmation — just make the changes
- If a command fails, read the error and fix it
"""

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description='devflow-agent — Ollama coding agent with full project context',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument('--project',   required=True,  help='Project root directory')
    p.add_argument('--message',   required=True,  help='Task to perform')
    p.add_argument('--model',     default='qwen2.5-coder:32b', help='Ollama model name')
    p.add_argument('--base-url',  default='http://localhost:11434', dest='base_url', help='Ollama base URL')
    p.add_argument('--max-turns', default=30, type=int, dest='max_turns', help='Max agentic loop iterations')
    p.add_argument('--verbose',   action='store_true', help='Print extra debug info to stderr')
    return p.parse_args()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _log(msg: str, verbose: bool = False, is_verbose: bool = False):
    """Print to stdout (flushed). Verbose messages only print if --verbose."""
    if is_verbose and not verbose:
        return
    print(msg, flush=True)


def _fmt_tool_call(name: str, args: dict) -> str:
    """Format a tool call for display, truncating long values."""
    parts = []
    for k, v in args.items():
        v_str = repr(v)
        if len(v_str) > 80:
            v_str = v_str[:77] + '...'
        parts.append(f'{k}={v_str}')
    return f'► {name}({", ".join(parts)})'


def _build_tool_result_message(tool_call, result: str) -> dict:
    """
    Build the tool result message in the format Ollama expects.
    Ollama uses role='tool' with the content being the result string.
    """
    return {
        'role':    'tool',
        'content': result,
    }

# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

def run(args: argparse.Namespace) -> int:
    """
    Run the agentic loop. Returns exit code (0 = success, 1 = error/timeout).
    """
    # Step 1 — Build project context
    _log('► Building project context...', args.verbose)
    try:
        repo_map = context_builder.build(args.project)
    except Exception as e:
        _log(f'Error building project context: {e}', args.verbose)
        repo_map = '(context unavailable)'

    _log(f'► Context ready — {len(repo_map)} chars', args.verbose, is_verbose=True)

    # Step 2 — Assemble system prompt
    system = SYSTEM_PROMPT_TEMPLATE.format(
        project_root=args.project,
        repo_map=repo_map,
    )

    messages = [
        {'role': 'system', 'content': system},
        {'role': 'user',   'content': args.message},
    ]

    # Step 3 — Agentic loop
    client = ollama.Client(host=args.base_url)
    turns  = 0

    _log(f'► Starting agent loop (model: {args.model}, max turns: {args.max_turns})', args.verbose)
    _log('', args.verbose)

    while turns < args.max_turns:
        turns += 1
        _log(f'[turn {turns}]', args.verbose, is_verbose=True)

        try:
            response = client.chat(
                model=args.model,
                messages=messages,
                tools=TOOLS,
            )
        except ollama.ResponseError as e:
            _log(f'Ollama error: {e.error}', args.verbose)
            return 1
        except Exception as e:
            _log(f'Failed to connect to Ollama at {args.base_url}: {e}', args.verbose)
            _log('Make sure Ollama is running: ollama serve', args.verbose)
            return 1

        msg = response.message

        # Resolve tool calls: prefer native API, fall back to text parsing.
        # Small models (7b/14b) frequently output JSON/XML in content instead
        # of using the structured tool-calling API.
        tool_calls = list(msg.tool_calls or [])
        if not tool_calls and msg.content:
            tool_calls = _parse_text_tool_calls(msg.content)
            if tool_calls:
                _log(f'  (parsed {len(tool_calls)} tool call(s) from model text output)',
                     args.verbose, is_verbose=True)

        # Append assistant message to history
        assistant_entry = {'role': 'assistant', 'content': msg.content or ''}
        if tool_calls:
            assistant_entry['tool_calls'] = [
                {'function': {'name': tc.function.name, 'arguments': tc.function.arguments}}
                for tc in tool_calls
            ]
        messages.append(assistant_entry)

        # No tool calls → model is done
        if not tool_calls:
            if msg.content:
                _log(msg.content, args.verbose)
            break

        # Execute each tool the model requested
        for tc in tool_calls:
            fn        = tc.function.name
            fn_args   = tc.function.arguments
            if isinstance(fn_args, str):
                try:
                    fn_args = json.loads(fn_args)
                except json.JSONDecodeError:
                    fn_args = {}

            _log(_fmt_tool_call(fn, fn_args), args.verbose)

            result = execute_tool(fn, fn_args, args.project)

            # Show a short preview of the result
            preview = result[:120].replace('\n', ' ')
            if len(result) > 120:
                preview += '...'
            _log(f'  → {preview}', args.verbose, is_verbose=True)

            messages.append(_build_tool_result_message(tc, result))

    else:
        _log(f'\n⚠  Reached max turns ({args.max_turns}). Stopping.', args.verbose)
        return 1

    return 0

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args       = parse_args()
    exit_code  = run(args)
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
