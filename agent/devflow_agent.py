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
import os
import re
import sys
from pathlib import Path

import ollama

import context_builder
from tools import TOOLS, execute_tool

try:
    from rag import CodeContextRetriever
    _HAS_RAG = True
except ImportError:
    _HAS_RAG = False

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


def _try_parse_json(raw: str):
    """
    Parse JSON, tolerating up to 3 extra trailing '}' characters.
    Small models (7b) sometimes emit one too many closing braces when the
    generated content itself contains '}' (e.g. C# code inside a JSON string).
    Returns the parsed object, or None on failure.
    """
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        trimmed = raw
        for _ in range(3):
            if not trimmed.endswith('}'):
                break
            trimmed = trimmed[:-1].rstrip()
            try:
                return json.loads(trimmed)
            except json.JSONDecodeError:
                continue
    return None


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
        args = _try_parse_json(m.group(2).strip())
        if isinstance(args, dict):
            calls.append(_FakeToolCall(name, args))
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
        obj = _try_parse_json(raw)
        if obj is None:
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
You are an expert software developer. You MUST use tools to make ALL changes. \
You have direct access to the project filesystem through the tools below.

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

## CRITICAL RULES — you MUST follow these exactly
1. NEVER write code in your response text. ALWAYS call write_file to apply changes.
2. Do NOT explain what you are about to do. Just call the tool immediately.
3. Do NOT show code blocks in your response. Put code in write_file calls only.
4. Always call read_file before write_file so you have the current file content.
5. Use relative paths from the project root for all file operations.
6. Make ALL necessary changes in one session — do not stop partway through.
7. Only after ALL tools have been called and files written, output a one-line summary.
8. Do not ask for confirmation. Do not ask clarifying questions. Just act.
9. If a command fails, read the error and fix it with another tool call.
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
    p.add_argument('--max-turns', default=5, type=int, dest='max_turns', help='Max agentic loop iterations')
    p.add_argument('--verbose',    action='store_true', help='Print extra debug info to stderr')
    p.add_argument('--max-retries', default=2, type=int, dest='max_retries',
                   help='Max build-fix retry cycles after the agent loop (default: 2)')
    p.add_argument('--gemini-api-key', default='', dest='gemini_api_key',
                   help='Google Gemini API key for fallback (or set GEMINI_API_KEY env var)')
    p.add_argument('--gemini-model', default='gemini-2.0-flash', dest='gemini_model',
                   help='Gemini model name (default: gemini-2.0-flash)')
    p.add_argument('--claude-api-key', default='', dest='claude_api_key',
                   help='Anthropic Claude API key for fallback (or set CLAUDE_API_KEY env var)')
    p.add_argument('--claude-model', default='claude-haiku-4-5-20251001', dest='claude_model',
                   help='Claude model name (default: claude-haiku-4-5-20251001)')
    p.add_argument('--fallback-preference', default='auto', dest='fallback_preference',
                   choices=['gemini', 'claude', 'auto'],
                   help='Which cloud AI to use as fallback (default: auto)')
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
# Build verification helpers
# ---------------------------------------------------------------------------

_BUILD_COMMANDS = [
    ('*.csproj',     'dotnet build'),
    ('pom.xml',      'mvn compile -q'),
    ('build.gradle', './gradlew build -q'),
    ('Cargo.toml',   'cargo build'),
    ('go.mod',       'go build ./...'),
    ('package.json', 'npm run build'),
]

_BUILD_ERROR_MARKERS = ['error', 'Error', 'ERROR', 'FAILED', 'failed']


def _detect_build_command(project_path: str) -> str | None:
    """Return the first matching build command for the project, or None."""
    root = Path(project_path)
    for glob_pattern, cmd in _BUILD_COMMANDS:
        matches = list(root.rglob(glob_pattern))
        if matches:
            # For dotnet: pass the csproj path explicitly so subdirectory projects work
            if glob_pattern == '*.csproj':
                rel = matches[0].relative_to(root)
                return f'dotnet build "{rel}"'
            return cmd
    return None


def _has_build_errors(output: str) -> bool:
    """Return True if the build output contains error indicators."""
    return any(marker in output for marker in _BUILD_ERROR_MARKERS)


# ---------------------------------------------------------------------------
# Cloud fallback helpers (Gemini Flash / Claude Haiku)
# ---------------------------------------------------------------------------

def _collect_file_contents(modified_files: set, project_root) -> str:
    sections = []
    for rel_path in modified_files:
        abs_path = (project_root / rel_path).resolve()
        if abs_path.exists():
            content = abs_path.read_text(encoding='utf-8', errors='replace')
            sections.append(f'FILE: {rel_path}\n```\n{content}\n```')
    return '\n\n'.join(sections) if sections else '(no files modified yet)'


def _build_fallback_prompt(task: str, error_context: str, file_sections: str) -> str:
    return (
        'A local AI agent tried to complete this coding task but got stuck.\n\n'
        f'TASK:\n{task}\n\n'
        f'ERROR / LAST OUTPUT:\n{error_context}\n\n'
        f'RELEVANT FILES (current state):\n{file_sections}\n\n'
        'Provide corrected file(s) in this exact format — one block per file:\n\n'
        'FILE: <relative-path>\n'
        '```\n'
        '<full corrected file content>\n'
        '```\n\n'
        'Only output files that need changes. No explanations.'
    )


def _apply_file_fixes(text: str, project_root) -> bool:
    from tools import _safe_path
    pattern = re.compile(r'FILE:\s*(\S+)\s*\n```[^\n]*\n(.*?)```', re.DOTALL)
    fixes = pattern.findall(text)
    if not fixes:
        print('[fallback] No file fixes returned.', flush=True)
        return False
    for rel_path, content in fixes:
        abs_path = _safe_path(project_root, rel_path.strip())
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_text(content, encoding='utf-8')
        print(f'[fallback] Wrote fix: {rel_path.strip()}', flush=True)
    return True


def _gemini_fallback(api_key: str, model_name: str, task: str, error_context: str,
                     modified_files: set, project_root) -> bool:
    from google import genai
    client = genai.Client(api_key=api_key)
    file_sections = _collect_file_contents(modified_files, project_root)
    prompt = _build_fallback_prompt(task, error_context, file_sections)
    response = client.models.generate_content(model=model_name, contents=prompt)
    return _apply_file_fixes(response.text, project_root)


def _claude_fallback(api_key: str, model_name: str, task: str, error_context: str,
                     modified_files: set, project_root) -> bool:
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)
    file_sections = _collect_file_contents(modified_files, project_root)
    prompt = _build_fallback_prompt(task, error_context, file_sections)
    message = client.messages.create(
        model=model_name,
        max_tokens=4096,
        messages=[{'role': 'user', 'content': prompt}],
    )
    return _apply_file_fixes(message.content[0].text, project_root)


def _run_fallback(args, task: str, error_context: str, modified_files: set, project_root) -> bool:
    """Orchestrate fallback based on preference. Auto: try Gemini, switch to Claude on 429."""
    import os
    gemini_key = args.gemini_api_key or os.environ.get('GEMINI_API_KEY', '')
    claude_key  = args.claude_api_key  or os.environ.get('CLAUDE_API_KEY', '')
    pref        = args.fallback_preference

    def try_gemini():
        if not gemini_key:
            return False
        print('[fallback] Trying Gemini Flash...', flush=True)
        return _gemini_fallback(gemini_key, args.gemini_model, task, error_context,
                                modified_files, project_root)

    def try_claude():
        if not claude_key:
            return False
        print('[fallback] Trying Claude Haiku...', flush=True)
        return _claude_fallback(claude_key, args.claude_model, task, error_context,
                                modified_files, project_root)

    if pref == 'gemini':
        return try_gemini()
    if pref == 'claude':
        return try_claude()

    # auto: Gemini first, Claude on quota exceeded
    try:
        return try_gemini()
    except Exception as e:
        err_str = str(e).lower()
        if '429' in err_str or 'quota' in err_str or 'exhausted' in err_str or 'rate' in err_str:
            print('[fallback] Gemini quota exceeded — switching to Claude Haiku...', flush=True)
            return try_claude()
        raise


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

def run(args: argparse.Namespace) -> int:
    """
    Run the agentic loop. Returns exit code (0 = success, 1 = error/timeout).
    """
    # Step 1 — Build project context (with auto-detected RAG mode)
    _log('► Building project context...', args.verbose)

    retriever = None
    if _HAS_RAG:
        # State file: <project>/.devflow_agent/state.json
        # Presence of {"indexed": true} → incremental re-index (modify).
        # Missing file or any other state → full index (initial).
        # To force a full re-index, delete .devflow_agent/state.json.
        import datetime
        state_dir  = Path(args.project) / '.devflow_agent'
        state_file = state_dir / 'state.json'

        already_indexed = False
        if state_file.exists():
            try:
                state = json.loads(state_file.read_text(encoding='utf-8'))
                already_indexed = state.get('indexed') is True
            except Exception:
                pass

        retriever = CodeContextRetriever(args.project)
        if already_indexed:
            _log('► RAG: re-indexing changed files...', args.verbose)
            retriever.reindex_changed(verbose=args.verbose)
        else:
            _log('► RAG: building full index (first run may take ~30s)...', args.verbose)
            retriever.index(verbose=args.verbose)
            # Write state file so subsequent runs do incremental re-index
            try:
                state_dir.mkdir(exist_ok=True)
                state_file.write_text(
                    json.dumps({
                        'indexed':    True,
                        'indexed_at': datetime.datetime.now().isoformat(),
                    }),
                    encoding='utf-8',
                )
            except Exception:
                pass

    try:
        if retriever is not None:
            repo_map = context_builder.build_with_rag(
                args.project,
                query=args.message,
                retriever=retriever,
            )
        else:
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
    modified_files: set = set()  # tracks files written — used by cloud fallback

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
            if fn == 'write_file' and fn_args.get('path'):
                modified_files.add(fn_args['path'])

            # Show a short preview of the result
            preview = result[:120].replace('\n', ' ')
            if len(result) > 120:
                preview += '...'
            _log(f'  → {preview}', args.verbose, is_verbose=True)

            messages.append(_build_tool_result_message(tc, result))

    else:
        _log(f'\n⚠  Reached max turns ({args.max_turns}). Stopping.', args.verbose)
        last_error = f'Agent loop exhausted {args.max_turns} turns without completing the task.'
        _run_fallback(args, args.message, last_error, modified_files, Path(args.project))

    # Step 4 — Post-loop build verification
    build_cmd = _detect_build_command(args.project)
    if not build_cmd:
        return 0  # no build system detected — nothing to verify

    for retry in range(1, args.max_retries + 1):
        _log(f'\n► Verifying build: {build_cmd}', args.verbose)
        build_output = execute_tool('run_command', {'command': build_cmd}, args.project)
        _log(build_output, args.verbose)

        if not _has_build_errors(build_output):
            _log('✓ Build passed.', args.verbose)
            return 0

        _log(f'⚠  Build errors detected — asking model to fix (retry {retry}/{args.max_retries})...', args.verbose)

        # Inject errors as a new user turn so the model can correct them
        messages.append({
            'role':    'user',
            'content': (
                f'The build failed. Fix ALL errors before finishing.\n\n'
                f'Build command: {build_cmd}\n\n'
                f'Output:\n{build_output}'
            ),
        })

        # Re-run the agent loop for this retry cycle
        while turns < args.max_turns:
            turns += 1
            _log(f'[fix turn {turns}]', args.verbose, is_verbose=True)

            try:
                response = client.chat(model=args.model, messages=messages, tools=TOOLS)
            except Exception as e:
                _log(f'Ollama error during fix: {e}', args.verbose)
                return 1

            msg        = response.message
            tool_calls = list(msg.tool_calls or [])
            if not tool_calls and msg.content:
                tool_calls = _parse_text_tool_calls(msg.content)

            assistant_entry = {'role': 'assistant', 'content': msg.content or ''}
            if tool_calls:
                assistant_entry['tool_calls'] = [
                    {'function': {'name': tc.function.name, 'arguments': tc.function.arguments}}
                    for tc in tool_calls
                ]
            messages.append(assistant_entry)

            if not tool_calls:
                if msg.content:
                    _log(msg.content, args.verbose)
                break

            for tc in tool_calls:
                fn      = tc.function.name
                fn_args = tc.function.arguments
                if isinstance(fn_args, str):
                    try:
                        fn_args = json.loads(fn_args)
                    except json.JSONDecodeError:
                        fn_args = {}
                _log(_fmt_tool_call(fn, fn_args), args.verbose)
                result  = execute_tool(fn, fn_args, args.project)
                if fn == 'write_file' and fn_args.get('path'):
                    modified_files.add(fn_args['path'])
                preview = result[:120].replace('\n', ' ')
                if len(result) > 120:
                    preview += '...'
                _log(f'  → {preview}', args.verbose, is_verbose=True)
                messages.append(_build_tool_result_message(tc, result))

    _log(f'\n⚠  Build still failing after {args.max_retries} fix attempt(s). Trying cloud fallback...', args.verbose)
    fixed = _run_fallback(args, args.message, build_output, modified_files, Path(args.project))
    if fixed:
        final = execute_tool('run_command', {'command': build_cmd}, args.project)
        _log(final, args.verbose)
        if not _has_build_errors(final):
            _log('✓ Build passed after cloud fallback.', args.verbose)
            return 0
    return 1

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args       = parse_args()
    exit_code  = run(args)
    sys.exit(exit_code)


if __name__ == '__main__':
    main()
