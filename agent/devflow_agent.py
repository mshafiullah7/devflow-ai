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
import threading
from pathlib import Path

# ---------------------------------------------------------------------------
# Graceful cancellation
# Set by Ctrl+C (SIGINT) or by the stdin watcher when the user types 'q'.
# Every long-running loop checks this before each iteration.
# ---------------------------------------------------------------------------
_cancel_requested = threading.Event()

# Force UTF-8 stdout/stderr so Unicode symbols (►, ✓, ✗, etc.) work on
# Windows terminals that default to cp1252.
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1, closefd=False)
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = open(sys.stderr.fileno(), mode='w', encoding='utf-8', buffering=1, closefd=False)

import ollama

import context_builder
from tools import TOOLS, execute_tool

try:
    from rag import CodeContextRetriever
    _HAS_RAG = True
except ImportError:
    _HAS_RAG = False

# ---------------------------------------------------------------------------
# Stdin watcher — 'q' + Enter cancels the agent gracefully
# Only started when stdin is a real TTY (not when piped by Electron).
# ---------------------------------------------------------------------------

def _stdin_watcher() -> None:
    """Background daemon thread: watch stdin for 'q' / 'quit' / 'exit'."""
    try:
        for line in sys.stdin:
            if line.strip().lower() in ('q', 'quit', 'exit'):
                _cancel_requested.set()
                print('\n► Cancel requested — stopping after current operation...',
                      flush=True)
                break
    except Exception:
        pass   # stdin closed or not readable — silently exit


def _start_stdin_watcher() -> None:
    """Start the stdin watcher thread only when stdin is an interactive TTY."""
    if not sys.stdin or not sys.stdin.isatty():
        return
    t = threading.Thread(target=_stdin_watcher, daemon=True, name='stdin-watcher')
    t.start()


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

    def _append_if_tool(obj):
        name = obj.get('name') or obj.get('tool') or obj.get('function')
        args = (obj.get('arguments') or obj.get('input') or
                obj.get('parameters') or obj.get('args') or {})
        if isinstance(name, str) and name.strip():
            calls.append(_FakeToolCall(name.strip(), args if isinstance(args, dict) else {}))

    for raw in candidates:
        obj = _try_parse_json(raw)
        if obj is not None:
            # Single JSON object — common for larger models
            _append_if_tool(obj)
        else:
            # Multiple JSON objects on separate lines — common for small models (7b)
            # that emit one tool call per line inside a single code fence.
            for line in raw.splitlines():
                line = line.strip()
                if not line.startswith('{'):
                    continue
                obj = _try_parse_json(line)
                if obj is not None:
                    _append_if_tool(obj)

    return calls


# ---------------------------------------------------------------------------
# System prompt template
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Planning system prompt
# ---------------------------------------------------------------------------

PLANNING_SYSTEM_PROMPT = """\
You are an expert software planning assistant. Analyze the coding task and \
produce a minimal, concrete, step-by-step execution plan.

Project root: {project_root}

{repo_map}

## Output format
Output ONLY a valid JSON object — no markdown fences, no explanation text:

{{
  "task": "<one-line summary of the overall task>",
  "steps": [
    {{
      "id": 1,
      "title": "<short action title, 5-8 words>",
      "description": "<what will be done in this step and why>",
      "files": ["<relative paths likely to be read or modified>"],
      "tools": ["read_file", "write_file"]
    }}
  ],
  "estimated_turns": <integer — total estimated tool calls across all steps>
}}

## Rules
- Output ONLY the raw JSON object. No markdown, no commentary.
- Use the MINIMUM number of steps needed — 2 to 5 steps maximum.
- NEVER create one step per function/method. Group related code into one step.
- Example: "add_task, list_tasks, mark_done, delete_task" → ONE step "Write task operations module", not 4 steps.
- Each step must produce a distinct, testable artifact (a new file, a passing test, a working command).
- Steps must be non-overlapping — no two steps should write to the same file.
- File paths must be realistic given the project structure shown above.
- Tools must be chosen from: read_file, write_file, list_directory, search_code,
  get_file_tree, run_command, delete_file, create_directory
"""

# ---------------------------------------------------------------------------
# Execution system prompt
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
10. When running build or run commands, ALWAYS pass the full path to the project file (e.g. dotnet build src/MyApp.csproj), never a bare command with no target.
11. Once the task succeeds (e.g. the program builds without errors), stop immediately — do not re-run or re-verify commands that already passed.
12. NEVER run interactive programs (e.g. dotnet run on a program that reads from stdin). Use the build command only to verify correctness (e.g. dotnet build src/MyApp.csproj).
13. NEVER write a file with empty content. Every write_file call MUST contain the complete, working implementation. Never create placeholder files to fill in later — write the full code immediately in the same call.
14. NEVER split a file's implementation across multiple turns. Write the entire file content in one single write_file call.
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
    p.add_argument('--max-turns', default=15, type=int, dest='max_turns', help='Max agentic loop iterations')
    p.add_argument('--verbose',    action='store_true', help='Print extra debug info to stderr')
    p.add_argument('--max-retries', default=2, type=int, dest='max_retries',
                   help='Max build-fix retry cycles after the agent loop (default: 2)')
    # Planning mode
    p.add_argument('--plan-only', action='store_true', dest='plan_only',
                   help='Generate an execution plan and print it as [PLAN_START]...[PLAN_END], then exit')
    p.add_argument('--approved-plan', default=None, dest='approved_plan',
                   help='JSON string of an approved plan — execute it step-by-step')
    p.add_argument('--plan-model', default=None, dest='plan_model',
                   help='Separate model to use for plan generation (defaults to --model). '
                        'Use a larger model here for better plans, e.g. qwen2.5-coder:32b')
    p.add_argument('--max-tool-errors', default=3, type=int, dest='max_tool_errors',
                   help='Max consecutive tool errors before aborting the loop (default: 3)')
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


def _is_tool_error(result: str) -> bool:
    """Return True if the tool result string signals a failure."""
    low = result.lstrip()
    return (
        low.startswith('Error:')
        or low.startswith('ERROR:')
        or low.startswith('Error executing')
    )


def _format_tool_error_feedback(tool_name: str, tool_args: dict, error: str) -> str:
    """
    Convert a raw tool error string into a structured correction hint
    so the model understands exactly what went wrong and how to fix it.
    """
    low = error.lower()

    if 'not found' in low or 'no such file' in low or 'does not exist' in low:
        path = tool_args.get('path', '?')
        return (
            f'[TOOL ERROR] {tool_name} failed — "{path}" does not exist.\n'
            f'Call list_directory or get_file_tree first to confirm the correct path, '
            f'then retry with the exact path shown in the output.'
        )

    if 'timed out' in low:
        return (
            f'[TOOL ERROR] {tool_name} timed out (tried 30 s then 60 s).\n'
            f'Do NOT use run commands (dotnet run, npm start). '
            f'Use a build/compile command instead (dotnet build, npm run build, python -m py_compile).'
        )

    if 'permission' in low or 'access is denied' in low or 'permissionerror' in low:
        path = tool_args.get('path', '?')
        return (
            f'[TOOL ERROR] {tool_name} — permission denied on "{path}".\n'
            f'Do not write to system directories. Use a path inside the project root only.'
        )

    if 'is not a file' in low or 'is not a directory' in low:
        path = tool_args.get('path', '?')
        return (
            f'[TOOL ERROR] {tool_name} — "{path}" is the wrong type '
            f'(file vs directory mismatch).\n'
            f'Call get_file_tree to inspect the structure, then use the correct path.'
        )

    if 'unknown tool' in low:
        return (
            f'[TOOL ERROR] "{tool_name}" is not a valid tool.\n'
            f'Available tools: read_file, write_file, list_directory, search_code, '
            f'get_file_tree, run_command, delete_file, create_directory.'
        )

    # Generic fallback — include the full error so the model can reason about it
    return (
        f'[TOOL ERROR] {tool_name} failed: {error}\n'
        f'Read the error carefully and try a different approach.'
    )

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

_BUILD_SUCCESS_MARKERS = ['Build succeeded', 'build succeeded']

_BUILD_ERROR_MARKERS = [
    'Build FAILED',   # dotnet
    'build failed',   # generic
    ': error ',       # MSBuild  e.g. "file.csproj : error MSBxxxx:"
    ': ERROR ',       # MSBuild uppercase variant
    'ERROR:',         # cargo, cmake, general tools
    'FAILED',         # gradle, maven
]


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
    """Return True if the build output contains error indicators.

    Checks for explicit success first to avoid false positives from strings
    like '0 Error(s)' that appear in successful dotnet build output.
    """
    if any(m in output for m in _BUILD_SUCCESS_MARKERS):
        return False
    return any(m in output for m in _BUILD_ERROR_MARKERS)


# ---------------------------------------------------------------------------
# Planning helpers
# ---------------------------------------------------------------------------

def _extract_plan_json(content: str) -> dict | None:
    """Extract and parse plan JSON from model output.

    Handles: raw JSON, markdown-fenced JSON, and JSON embedded in prose.
    Returns the parsed dict (must contain a 'steps' key) or None.
    """
    content = content.strip()

    # 1. Direct parse
    obj = _try_parse_json(content)
    if isinstance(obj, dict) and 'steps' in obj:
        return obj

    # 2. Strip markdown code fences (```json ... ```)
    for m in re.finditer(r'```(?:json)?\s*\n([\s\S]*?)\n```', content):
        obj = _try_parse_json(m.group(1).strip())
        if isinstance(obj, dict) and 'steps' in obj:
            return obj

    # 3. Greedy brace scan — find outermost {...} block
    depth, start = 0, None
    for i, ch in enumerate(content):
        if ch == '{':
            if depth == 0:
                start = i
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and start is not None:
                obj = _try_parse_json(content[start:i + 1])
                if isinstance(obj, dict) and 'steps' in obj:
                    return obj
                start = None

    return None


def _build_context(args: argparse.Namespace):
    """Build repo map + optional RAG retriever. Returns (repo_map, retriever)."""
    import datetime

    retriever = None
    if _HAS_RAG:
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

    return repo_map, retriever


def generate_plan(args: argparse.Namespace) -> int:
    """Generate a structured execution plan.

    Outputs [PLAN_START]{json}[PLAN_END] to stdout, then exits.
    The Electron layer detects these markers and shows the plan card.
    """
    _log('► Building project context for planning...', args.verbose)
    repo_map, _ = _build_context(args)
    _log(f'► Context ready — {len(repo_map)} chars', args.verbose, is_verbose=True)

    system = PLANNING_SYSTEM_PROMPT.format(
        project_root=args.project,
        repo_map=repo_map,
    )

    # Use --plan-model if provided (allows a smarter model for planning
    # while a faster model handles execution)
    planning_model = args.plan_model or args.model
    client = ollama.Client(host=args.base_url)
    _log(f'► Generating execution plan (model: {planning_model})...', args.verbose)

    try:
        response = client.chat(
            model=planning_model,
            messages=[
                {'role': 'system', 'content': system},
                {'role': 'user',   'content': f'Create a minimal execution plan for: {args.message}'},
            ],
        )
    except KeyboardInterrupt:
        _log('\n► Interrupted (Ctrl+C). Plan generation cancelled.', args.verbose)
        return 130
    except ollama.ResponseError as e:
        _log(f'Ollama error: {e.error}', args.verbose)
        return 1
    except Exception as e:
        _log(f'Failed to connect to Ollama at {args.base_url}: {e}', args.verbose)
        return 1

    content = response.message.content or ''
    plan = _extract_plan_json(content)

    if plan is None:
        _log(f'Could not parse plan JSON from model output:\n{content}', args.verbose)
        return 1

    # Normalise: ensure sequential IDs
    for i, step in enumerate(plan.get('steps', []), 1):
        step['id'] = i

    plan_json = json.dumps(plan, ensure_ascii=False, indent=2)
    # Emit the special marker so Electron can detect and parse the plan
    print(f'[PLAN_START]{plan_json}[PLAN_END]', flush=True)
    return 0


def execute_with_plan(args: argparse.Namespace, plan: dict) -> int:
    """Execute an approved plan step by step.

    Prints [STEP:N/total] Title  before each step, and
           [STEP_DONE:N/total]   or [STEP_FAILED:N/total] after.
    The Electron layer listens for these markers to drive the step progress UI.
    """
    import copy

    steps = plan.get('steps', [])
    total = len(steps)

    if not steps:
        _log('Approved plan contains no steps.', args.verbose)
        return 1

    _log(f'► Executing plan: {plan.get("task", args.message)}', args.verbose)
    _log(f'► {total} step(s) to execute', args.verbose)
    _log('', args.verbose)

    for step in steps:
        # ── Cancellation check before each step ─────────────────────────────
        if _cancel_requested.is_set():
            _log('\n► Cancelled by user. Stopping plan execution.', args.verbose)
            return 130

        step_num    = step.get('id', steps.index(step) + 1)
        title       = step.get('title', f'Step {step_num}')
        description = step.get('description', '')

        # Emit step-start marker (Electron picks this up for step progress bar)
        print(f'[STEP:{step_num}/{total}] {title}', flush=True)
        _log(f'  {description}', args.verbose)

        # Build step-specific args — focus the agent on this one step only
        step_args         = copy.copy(args)
        step_args.message = (
            f'Overall task: {args.message}\n\n'
            f'You are now executing step {step_num} of {total}: {title}\n'
            f'Details: {description}\n\n'
            f'Focus ONLY on this step. Do not work ahead to other steps.'
        )
        # Remove plan flags so run() is used normally
        step_args.plan_only      = False
        step_args.approved_plan  = None

        exit_code = run(step_args)

        if exit_code != 0:
            print(f'[STEP_FAILED:{step_num}/{total}]', flush=True)
            return exit_code

        print(f'[STEP_DONE:{step_num}/{total}]', flush=True)
        _log('', args.verbose)

    _log(f'\n✓ All {total} steps completed successfully.', args.verbose)
    return 0


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

def run(args: argparse.Namespace) -> int:
    """
    Run the agentic loop. Returns exit code (0 = success, 1 = error/timeout).
    """
    # Step 1 — Build project context (repo map + optional RAG)
    _log('► Building project context...', args.verbose)
    repo_map, _ = _build_context(args)
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

    def _trim_messages(msgs: list, max_chars: int = 80_000) -> list:
        """Keep system + user message; drop oldest tool results when history is too large.

        Tool result messages (role='tool') are the most verbose — they contain full
        file contents and command outputs. Dropping the oldest ones keeps the model
        focused on recent context without losing the task goal.
        """
        total = sum(len(str(m.get('content', ''))) for m in msgs)
        if total <= max_chars:
            return msgs

        # Always preserve: index 0 (system), index 1 (original user task)
        pinned  = msgs[:2]
        trimable = msgs[2:]

        while trimable and total > max_chars:
            # Find the oldest tool result to drop
            for i, m in enumerate(trimable):
                if m.get('role') == 'tool':
                    total -= len(str(m.get('content', '')))
                    trimable.pop(i)
                    break
            else:
                # No more tool messages — drop the oldest non-pinned message
                dropped = trimable.pop(0)
                total -= len(str(dropped.get('content', '')))

        trimmed = pinned + trimable
        _log(f'  (trimmed history to {len(trimmed)} messages, ~{total} chars)', args.verbose, is_verbose=True)
        return trimmed

    # Step 3 — Agentic loop
    client = ollama.Client(host=args.base_url)
    turns             = 0
    consecutive_errors = 0   # reset to 0 on any successful tool call

    _log(f'► Starting agent loop (model: {args.model}, max turns: {args.max_turns})', args.verbose)
    _log('', args.verbose)

    while turns < args.max_turns:
        # ── Cancellation check (Ctrl+C or 'q') ──────────────────────────────
        if _cancel_requested.is_set():
            _log('\n► Cancelled by user. Exiting cleanly.', args.verbose)
            return 130

        turns += 1
        messages = _trim_messages(messages)
        _log(f'[turn {turns}]', args.verbose, is_verbose=True)

        try:
            response = client.chat(
                model=args.model,
                messages=messages,
                tools=TOOLS,
            )
        except KeyboardInterrupt:
            _log('\n► Interrupted (Ctrl+C). Exiting cleanly.', args.verbose)
            return 130
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
            if _cancel_requested.is_set():
                _log('\n► Cancelled by user. Exiting cleanly.', args.verbose)
                return 130

            fn      = tc.function.name
            fn_args = tc.function.arguments
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

            # ── Tool error detection & structured feedback ───────────────────
            if _is_tool_error(result):
                consecutive_errors += 1
                _log(
                    f'  ✗ tool error ({consecutive_errors}/{args.max_tool_errors})',
                    args.verbose,
                )

                if consecutive_errors >= args.max_tool_errors:
                    # Too many failures in a row — tell the model to stop and
                    # summarise rather than keep spiralling into bad tool calls.
                    _log(
                        f'\n⚠  {consecutive_errors} consecutive tool errors — '
                        'injecting abort signal.',
                        args.verbose,
                    )
                    messages.append({
                        'role':    'user',
                        'content': (
                            f'[ABORT] {consecutive_errors} tool calls failed in a row. '
                            f'Last error: {result}\n'
                            'Stop calling tools. Summarise what you have completed so far '
                            'and what still needs to be done manually.'
                        ),
                    })
                    break   # exit tool loop → next while turn → model summarises

                # Inject structured hint so the model corrects its approach
                feedback = _format_tool_error_feedback(fn, fn_args, result)
                messages.append(_build_tool_result_message(tc, feedback))

            else:
                # Successful tool call — reset the error streak
                consecutive_errors = 0

                # ── Empty-file guard ─────────────────────────────────────────
                # If write_file succeeded but wrote 0 bytes the model created a
                # placeholder. Reinject a warning so it fills the file immediately
                # instead of moving on and forgetting.
                if fn == 'write_file' and result.startswith('Written 0 bytes'):
                    path = fn_args.get('path', '?')
                    warning = (
                        f'[EMPTY FILE WARNING] {path} was written with no content.\n'
                        f'You MUST call write_file again for "{path}" with the complete '
                        f'implementation. Never leave a file empty.'
                    )
                    _log(f'  ⚠ empty file detected: {path}', args.verbose)
                    messages.append(_build_tool_result_message(tc, warning))
                else:
                    messages.append(_build_tool_result_message(tc, result))

    else:
        _log(f'\n⚠  Reached max turns ({args.max_turns}). Proceeding to build verification.', args.verbose)

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
            if _cancel_requested.is_set():
                _log('\n► Cancelled by user. Exiting cleanly.', args.verbose)
                return 130

            turns += 1
            messages = _trim_messages(messages)
            _log(f'[fix turn {turns}]', args.verbose, is_verbose=True)

            try:
                response = client.chat(model=args.model, messages=messages, tools=TOOLS)
            except KeyboardInterrupt:
                _log('\n► Interrupted (Ctrl+C). Exiting cleanly.', args.verbose)
                return 130
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
                if _cancel_requested.is_set():
                    _log('\n► Cancelled by user. Exiting cleanly.', args.verbose)
                    return 130

                fn      = tc.function.name
                fn_args = tc.function.arguments
                if isinstance(fn_args, str):
                    try:
                        fn_args = json.loads(fn_args)
                    except json.JSONDecodeError:
                        fn_args = {}
                _log(_fmt_tool_call(fn, fn_args), args.verbose)
                result  = execute_tool(fn, fn_args, args.project)
                preview = result[:120].replace('\n', ' ')
                if len(result) > 120:
                    preview += '...'
                _log(f'  → {preview}', args.verbose, is_verbose=True)

                if _is_tool_error(result):
                    consecutive_errors += 1
                    _log(f'  ✗ tool error ({consecutive_errors}/{args.max_tool_errors})', args.verbose)
                    if consecutive_errors >= args.max_tool_errors:
                        _log(f'\n⚠  {consecutive_errors} consecutive tool errors — injecting abort signal.', args.verbose)
                        messages.append({
                            'role':    'user',
                            'content': (
                                f'[ABORT] {consecutive_errors} tool calls failed in a row. '
                                f'Last error: {result}\n'
                                'Stop calling tools and summarise what remains to be fixed manually.'
                            ),
                        })
                        break
                    messages.append(_build_tool_result_message(tc, _format_tool_error_feedback(fn, fn_args, result)))
                else:
                    consecutive_errors = 0
                    messages.append(_build_tool_result_message(tc, result))

    _log(f'\n✗ Build still failing after {args.max_retries} fix attempt(s).', args.verbose)
    return 1

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    # Start 'q' watcher only when running directly in a terminal.
    # When spawned by Electron, stdin is 'ignore' so isatty() returns False.
    _start_stdin_watcher()

    try:
        if args.plan_only:
            # Phase 1 — generate plan, print markers, exit
            exit_code = generate_plan(args)

        elif args.approved_plan:
            # Phase 2 — execute the user-approved plan step by step
            try:
                plan = json.loads(args.approved_plan)
            except json.JSONDecodeError as e:
                print(f'Error parsing approved plan JSON: {e}', flush=True)
                sys.exit(1)
            exit_code = execute_with_plan(args, plan)

        else:
            # Normal mode — no planning, run full agentic loop directly
            exit_code = run(args)

    except KeyboardInterrupt:
        # Ctrl+C pressed between phases or before the first loop iteration
        print('\n► Interrupted (Ctrl+C). Exiting cleanly.', flush=True)
        sys.exit(130)

    sys.exit(exit_code)


if __name__ == '__main__':
    main()
