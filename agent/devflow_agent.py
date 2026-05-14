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
import sys

import ollama

import context_builder
from tools import TOOLS, execute_tool

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

        # Append assistant message to history
        assistant_entry = {'role': 'assistant', 'content': msg.content or ''}
        if msg.tool_calls:
            # Store raw tool call info for history
            assistant_entry['tool_calls'] = [
                {
                    'function': {
                        'name':      tc.function.name,
                        'arguments': tc.function.arguments,
                    }
                }
                for tc in msg.tool_calls
            ]
        messages.append(assistant_entry)

        # No tool calls → model is done
        if not msg.tool_calls:
            if msg.content:
                _log(msg.content, args.verbose)
            break

        # Execute each tool the model requested
        for tc in msg.tool_calls:
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
