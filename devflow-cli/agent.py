#!/usr/bin/env python3
"""
agent.py — provider-agnostic coding agent.

Supports Ollama, OpenAI, Groq, and Anthropic via --provider flag.
The agent loop is identical for all providers; only the provider
object differs.

Usage:
    python agent.py --project /path/to/project --message "task" --provider ollama
    python agent.py --project /path/to/project --message "task" --provider anthropic --model claude-sonnet-4-6
    python agent.py --project /path/to/project --message "task" --provider groq --model llama-3.3-70b-versatile
"""

import argparse
import json
import os
import re
import sys
import threading
import time
from pathlib import Path

# Force UTF-8 on Windows terminals
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = open(sys.stdout.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    sys.stderr = open(sys.stderr.fileno(), mode="w", encoding="utf-8", buffering=1, closefd=False)

import context_builder
from providers import create_provider
from providers.base import ToolCall
from tools import TOOLS, execute_tool

try:
    from rag import CodeContextRetriever
    _HAS_RAG = True
except ImportError:
    _HAS_RAG = False

# ---------------------------------------------------------------------------
# Cancellation
# ---------------------------------------------------------------------------

_cancel = threading.Event()


def _stdin_watcher():
    try:
        for line in sys.stdin:
            if line.strip().lower() in ("q", "quit", "exit"):
                _cancel.set()
                print("\n► Cancel requested — stopping after current operation...", flush=True)
                break
    except Exception:
        pass


def _start_stdin_watcher():
    if not sys.stdin or not sys.stdin.isatty():
        return
    t = threading.Thread(target=_stdin_watcher, daemon=True, name="stdin-watcher")
    t.start()


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

PLANNING_SYSTEM_PROMPT = """\
You are an expert software planning assistant. Analyze the coding task and \
produce a minimal, concrete, step-by-step execution plan.

Project root: {project_root}

{repo_map}

## Output format
Output ONLY a valid JSON object — no markdown fences, no explanation text:

{{
  "task": "<one-line summary>",
  "steps": [
    {{
      "id": 1,
      "title": "<short action title, 5-8 words>",
      "description": "<exact file, class/function names, signatures, how files connect>",
      "files": ["<relative path>"],
      "tools": ["read_file", "write_file"]
    }}
  ],
  "estimated_turns": <integer>
}}

## Rules
- Output ONLY the raw JSON. No markdown, no commentary.
- 2 to 5 steps maximum.
- Never one step per function — group related code.
- Steps must be non-overlapping (no two steps write the same file).
- Use relative paths only in "files".
"""

SYSTEM_PROMPT_TEMPLATE = """\
You are an expert software developer. You MUST use tools to make ALL changes.

Project root: {project_root}

{repo_map}

## Available tools
- read_file(path)              — read a file (always do this before writing)
- write_file(path, content)    — write or overwrite a file
- list_directory(path)         — list files and folders
- search_code(pattern, path)   — regex search across source files
- get_file_tree(max_depth)     — show full project structure
- run_command(command)         — run a shell command
- delete_file(path)            — delete a file
- create_directory(path)       — create a directory
- create_issue(repo, title, body, labels) — create a GitHub issue
- list_issues(repo, state)     — list GitHub issues
- create_pr(repo, title, body, head, base) — create a GitHub PR

## CRITICAL RULES
1. NEVER write code in response text. ALWAYS call write_file.
2. Do NOT explain what you are about to do. Just call the tool.
3. Always call read_file before write_file.
4. Use relative paths from project root.
5. Make ALL changes in one session.
6. Only after all tools are done, output a one-line summary.
7. Do not ask for confirmation or clarification. Just act.
8. If a command fails, read the error and fix it with another tool call.
9. Once the task succeeds, stop immediately.
10. NEVER write a file with empty content.
"""

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

_DEFAULT_MODELS = {
    "ollama":      "qwen2.5-coder:32b",
    "openai":      "gpt-4o",
    "groq":        "llama-3.3-70b-versatile",
    "anthropic":   "claude-sonnet-4-6",
    "mistral":     "mistral-large-latest",
    "together":    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    "fireworks":   "accounts/fireworks/models/firefunction-v2",
    "xai":         "grok-3-mini",
    "cohere":      "command-r-plus",
    "deepseek":    "deepseek-chat",
    "perplexity":  "sonar-pro",
    "nvidia":      "meta/llama-3.3-70b-instruct",
    "custom":      "model-name",   # override with --model
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="devflow agent — multi-provider coding agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Provider-specific options:
  --thinking-budget N     Anthropic only. Enables extended thinking with N budget_tokens
                          (min 1024, recommended 5000-16000). Forces temperature=1.
  --reasoning-effort LVL  OpenAI o-series only (o1, o3, o4-mini). Values: low, medium, high.
  --context-size N        Ollama / custom only. Sets num_ctx, e.g. 32768.
  --temperature T         All providers (float 0.0-2.0). Ignored when thinking is enabled
                          or when using OpenAI o-series models.

Custom / self-hosted provider:
  --provider custom --base-url http://localhost:8080/v1 --model my-model
  Set CUSTOM_API_KEY env var if the server requires a key (defaults to "none").
  Compatible with: vLLM, LM Studio, Jan, LocalAI, Llamafile, TabbyAPI, Oobabooga.
""",
    )
    p.add_argument("--project",    required=True,  help="Project root directory")
    p.add_argument("--message",    required=True,  help="Task to perform")
    p.add_argument("--provider",   default="ollama",
                   choices=["ollama", "openai", "groq", "anthropic",
                            "mistral", "together", "fireworks", "xai",
                            "cohere", "deepseek", "perplexity", "nvidia",
                            "custom"],
                   help="LLM provider (default: ollama)")
    p.add_argument("--model",      default=None,   help="Model name (provider default used if omitted)")
    p.add_argument("--base-url",   default=None,   dest="base_url", help="Ollama base URL")
    p.add_argument("--max-turns",  default=15,     type=int, dest="max_turns")
    p.add_argument("--max-retries", default=2,     type=int, dest="max_retries")
    p.add_argument("--max-tool-errors", default=3, type=int, dest="max_tool_errors")
    p.add_argument("--verbose",    action="store_true")
    p.add_argument("--plan-only",  action="store_true", dest="plan_only")
    p.add_argument("--approved-plan", default=None, dest="approved_plan")
    p.add_argument("--plan-model", default=None,   dest="plan_model")
    # Provider-specific tuning
    p.add_argument("--thinking-budget",  default=None, type=int,   dest="thinking_budget",
                   help="Anthropic extended thinking budget_tokens (min 1024)")
    p.add_argument("--reasoning-effort", default=None,              dest="reasoning_effort",
                   choices=["low", "medium", "high"],
                   help="OpenAI o-series reasoning effort")
    p.add_argument("--context-size",     default=None, type=int,   dest="context_size",
                   help="Ollama num_ctx context window size")
    p.add_argument("--temperature",      default=None, type=float, dest="temperature",
                   help="Sampling temperature 0.0-2.0")
    args = p.parse_args()
    if args.model is None:
        args.model = _DEFAULT_MODELS[args.provider]
    return args


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _log(msg: str, verbose: bool = False, is_verbose: bool = False):
    if is_verbose and not verbose:
        return
    print(msg, flush=True)


def _fmt_call(name: str, args: dict) -> str:
    parts = []
    for k, v in args.items():
        s = repr(v)
        parts.append(f"{k}={s[:77] + '...' if len(s) > 80 else s}")
    return f"► {name}({', '.join(parts)})"


def _is_error(result: str) -> bool:
    low = result.lstrip()
    return low.startswith("Error:") or low.startswith("ERROR:") or low.startswith("Error executing")


def _error_feedback(name: str, args: dict, error: str, project: str) -> str:
    low = error.lower()
    if "not found" in low or "no such file" in low or "does not exist" in low:
        path = args.get("path", "?")
        tree = execute_tool("get_file_tree", {}, project)
        tree_sec = f"\nProject structure:\n{tree}" if tree and not tree.startswith("Error") else ""
        return f'[TOOL ERROR] {name} — "{path}" does not exist.{tree_sec}\nRetry with the exact path shown.'
    if "timed out" in low:
        return f"[TOOL ERROR] {name} timed out. Use a build command, not a run command."
    if "permission" in low or "access is denied" in low:
        return f'[TOOL ERROR] {name} — permission denied on "{args.get("path", "?")}". Use a path inside the project root.'
    if "unknown tool" in low:
        return f'[TOOL ERROR] "{name}" is not a valid tool.'
    return f"[TOOL ERROR] {name} failed: {error}\nRead the error and try a different approach."


def _print_summary(turns, tool_calls, p_tok, e_tok, elapsed, files=None):
    files_list = sorted(f for f in (files or []) if f)
    if sys.stdout.isatty():
        print(f"\n── Run summary ───────────────────────────", flush=True)
        print(f"  Turns: {turns}  |  Tool calls: {tool_calls}", flush=True)
        print(f"  Tokens: {p_tok} in / {e_tok} out  |  Elapsed: {elapsed:.1f}s", flush=True)
        if files_list:
            print("  Files written:", flush=True)
            for f in files_list:
                print(f"    • {f}", flush=True)
        print(f"──────────────────────────────────────────", flush=True)
    else:
        print(
            f"[DONE] turns={turns} tool_calls={tool_calls} "
            f"tokens_in={p_tok} tokens_out={e_tok} "
            f"elapsed={elapsed:.1f}s files={json.dumps(files_list)}",
            flush=True,
        )


# ---------------------------------------------------------------------------
# Text-based tool call fallback (for small models that ignore native tool API)
# ---------------------------------------------------------------------------

class _FakeToolCall:
    def __init__(self, name, arguments):
        self.name      = name
        self.arguments = arguments
        self.id        = ""


def _try_parse_json(raw: str):
    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        trimmed = raw
        for _ in range(3):
            if not trimmed.endswith("}"):
                break
            trimmed = trimmed[:-1].rstrip()
            try:
                return json.loads(trimmed)
            except json.JSONDecodeError:
                continue
    return None


def _parse_text_tool_calls(content: str) -> list[ToolCall]:
    calls = []

    xml = re.compile(
        r"<tool_call>\s*<name>([\w]+)</name>\s*<input>([\s\S]*?)</input>\s*</tool_call>",
        re.IGNORECASE,
    )
    for m in xml.finditer(content):
        args = _try_parse_json(m.group(2).strip())
        if isinstance(args, dict):
            calls.append(ToolCall(name=m.group(1).strip(), arguments=args))
    if calls:
        return calls

    candidates: list[str] = []
    for m in re.finditer(r"```(?:json)?\s*\n([\s\S]*?)\n```", content):
        candidates.append(m.group(1).strip())

    if not candidates:
        depth, start = 0, None
        for i, ch in enumerate(content):
            if ch == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start is not None:
                    candidates.append(content[start:i + 1])
                    start = None

    def _append(obj):
        name = obj.get("name") or obj.get("tool") or obj.get("function")
        args = obj.get("arguments") or obj.get("input") or obj.get("parameters") or obj.get("args") or {}
        if isinstance(name, str) and name.strip():
            calls.append(ToolCall(name=name.strip(), arguments=args if isinstance(args, dict) else {}))

    for raw in candidates:
        obj = _try_parse_json(raw)
        if obj is not None:
            _append(obj)
        else:
            for line in raw.splitlines():
                line = line.strip()
                if line.startswith("{"):
                    obj = _try_parse_json(line)
                    if obj is not None:
                        _append(obj)

    return calls


# ---------------------------------------------------------------------------
# Build verification
# ---------------------------------------------------------------------------

_BUILD_COMMANDS = [
    ("*.csproj",     "dotnet build"),
    ("pom.xml",      "mvn compile -q"),
    ("build.gradle", "./gradlew build -q"),
    ("Cargo.toml",   "cargo build"),
    ("go.mod",       "go build ./..."),
    ("package.json", "npm run build"),
]

_BUILD_SUCCESS = ["Build succeeded", "build succeeded"]
_BUILD_ERRORS  = ["Build FAILED", "build failed", ": error ", ": ERROR ", "ERROR:", "FAILED"]


def _detect_build_cmd(project: str) -> str | None:
    root = Path(project)
    for pattern, cmd in _BUILD_COMMANDS:
        matches = list(root.rglob(pattern))
        if matches:
            if pattern == "*.csproj":
                return f'dotnet build "{matches[0].relative_to(root)}"'
            return cmd
    return None


def _has_build_errors(output: str) -> bool:
    if any(m in output for m in _BUILD_SUCCESS):
        return False
    return any(m in output for m in _BUILD_ERRORS)


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------

def _build_context(args: argparse.Namespace):
    import datetime
    retriever = None
    if _HAS_RAG:
        state_dir  = Path(args.project) / ".devflow_agent"
        state_file = state_dir / "state.json"
        already    = False
        if state_file.exists():
            try:
                already = json.loads(state_file.read_text(encoding="utf-8")).get("indexed") is True
            except Exception:
                pass
        retriever = CodeContextRetriever(args.project)
        if already:
            _log("► RAG: re-indexing changed files...", args.verbose)
            retriever.reindex_changed(verbose=args.verbose)
        else:
            _log("► RAG: building full index...", args.verbose)
            retriever.index(verbose=args.verbose)
            try:
                state_dir.mkdir(exist_ok=True)
                state_file.write_text(
                    json.dumps({"indexed": True, "indexed_at": datetime.datetime.now().isoformat()}),
                    encoding="utf-8",
                )
            except Exception:
                pass

    try:
        if retriever:
            repo_map = context_builder.build_with_rag(args.project, query=args.message, retriever=retriever)
        else:
            repo_map = context_builder.build(args.project)
    except Exception as e:
        _log(f"Error building context: {e}", args.verbose)
        repo_map = "(context unavailable)"

    return repo_map, retriever


# ---------------------------------------------------------------------------
# Plan helpers
# ---------------------------------------------------------------------------

def _extract_plan_json(content: str) -> dict | None:
    content = content.strip()
    obj = _try_parse_json(content)
    if isinstance(obj, dict) and "steps" in obj:
        return obj
    for m in re.finditer(r"```(?:json)?\s*\n([\s\S]*?)\n```", content):
        obj = _try_parse_json(m.group(1).strip())
        if isinstance(obj, dict) and "steps" in obj:
            return obj
    depth, start = 0, None
    for i, ch in enumerate(content):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start is not None:
                obj = _try_parse_json(content[start:i + 1])
                if isinstance(obj, dict) and "steps" in obj:
                    return obj
                start = None
    return None


def generate_plan(args: argparse.Namespace) -> int:
    _log("► Building project context for planning...", args.verbose)
    repo_map, _ = _build_context(args)

    system   = PLANNING_SYSTEM_PROMPT.format(project_root=args.project, repo_map=repo_map)
    plan_model = args.plan_model or args.model
    provider   = create_provider(
        args.provider, plan_model, args.base_url,
        thinking_budget=args.thinking_budget,
        reasoning_effort=args.reasoning_effort,
        context_size=args.context_size,
        temperature=args.temperature,
    )

    _log(f"► Generating plan (provider: {args.provider}, model: {plan_model})...", args.verbose)
    try:
        response = provider.chat(
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": f"Create a minimal execution plan for: {args.message}"},
            ],
            tools=[],
        )
    except KeyboardInterrupt:
        return 130
    except Exception as e:
        _log(f"Provider error: {e}", args.verbose)
        return 1

    plan = _extract_plan_json(response.text)
    if plan is None:
        _log(f"Could not parse plan JSON:\n{response.text}", args.verbose)
        return 1

    for i, step in enumerate(plan.get("steps", []), 1):
        step["id"] = i

    print(f"[PLAN_START]{json.dumps(plan, ensure_ascii=False, indent=2)}[PLAN_END]", flush=True)
    return 0


def execute_with_plan(args: argparse.Namespace, plan: dict) -> int:
    import copy
    steps = plan.get("steps", [])
    total = len(steps)
    if not steps:
        _log("Approved plan has no steps.", args.verbose)
        return 1

    _log(f"► Executing plan: {plan.get('task', args.message)}", args.verbose)

    for step in steps:
        if _cancel.is_set():
            return 130
        step_num    = step.get("id", steps.index(step) + 1)
        title       = step.get("title", f"Step {step_num}")
        description = step.get("description", "")
        print(f"[STEP:{step_num}/{total}] {title}", flush=True)
        _log(f"  {description}", args.verbose)

        step_args               = copy.copy(args)
        step_args.message       = (
            f"Overall task: {args.message}\n\n"
            f"You are now executing step {step_num} of {total}: {title}\n"
            f"Details: {description}\n\n"
            f"Focus ONLY on this step."
        )
        step_args.plan_only     = False
        step_args.approved_plan = None

        code = run(step_args)
        if code != 0:
            print(f"[STEP_FAILED:{step_num}/{total}]", flush=True)
            return code
        print(f"[STEP_DONE:{step_num}/{total}]", flush=True)

    _log(f"\n✓ All {total} steps completed.", args.verbose)
    return 0


# ---------------------------------------------------------------------------
# Main agent loop — provider-agnostic
# ---------------------------------------------------------------------------

def run(args: argparse.Namespace) -> int:
    _log("► Building project context...", args.verbose)
    repo_map, _ = _build_context(args)
    _log(f"► Context ready — {len(repo_map)} chars", args.verbose, is_verbose=True)

    system   = SYSTEM_PROMPT_TEMPLATE.format(project_root=args.project, repo_map=repo_map)
    provider = create_provider(
        args.provider, args.model, args.base_url,
        thinking_budget=args.thinking_budget,
        reasoning_effort=args.reasoning_effort,
        context_size=args.context_size,
        temperature=args.temperature,
    )

    # Internal normalized message history
    messages: list[dict] = [
        {"role": "system", "content": system},
        {"role": "user",   "content": args.message},
    ]

    def _trim(msgs: list, max_chars: int = 80_000) -> list:
        total = sum(len(str(m.get("content", ""))) for m in msgs)
        if total <= max_chars:
            return msgs
        pinned   = msgs[:2]
        trimable = msgs[2:]
        while trimable and total > max_chars:
            for i, m in enumerate(trimable):
                if m.get("role") == "tool":
                    total -= len(str(m.get("content", "")))
                    trimable.pop(i)
                    break
            else:
                dropped  = trimable.pop(0)
                total   -= len(str(dropped.get("content", "")))
        trimmed = pinned + trimable
        _log(f"  (trimmed to {len(trimmed)} messages)", args.verbose, is_verbose=True)
        return trimmed

    turns              = 0
    consecutive_errors = 0
    total_p_tok        = 0
    total_e_tok        = 0
    total_calls        = 0
    written_files      : set[str] = set()
    loop_start         = time.time()

    _log(f"► Starting agent loop (provider: {args.provider}, model: {args.model}, max turns: {args.max_turns})", args.verbose)

    while turns < args.max_turns:
        if _cancel.is_set():
            _log("\n► Cancelled. Exiting cleanly.", args.verbose)
            return 130

        turns += 1
        messages = _trim(messages)
        _log(f"[turn {turns}]", args.verbose, is_verbose=True)

        t0 = time.time()
        try:
            response = provider.chat(messages, TOOLS)
        except KeyboardInterrupt:
            _log("\n► Interrupted. Exiting cleanly.", args.verbose)
            return 130
        except Exception as e:
            _log(f"Provider error: {e}", args.verbose)
            return 1

        total_p_tok += response.prompt_tokens
        total_e_tok += response.completion_tokens
        _log(
            f"  [{time.time()-t0:.1f}s | in:{response.prompt_tokens} out:{response.completion_tokens} tok]",
            args.verbose, is_verbose=True,
        )

        tool_calls = response.tool_calls

        # Fallback: parse tool calls from text if model didn't use native API
        if not tool_calls and response.text:
            parsed = _parse_text_tool_calls(response.text)
            if parsed:
                _log(f"  (parsed {len(parsed)} tool call(s) from text)", args.verbose, is_verbose=True)
                tool_calls = parsed

        # Append assistant turn to history
        messages.append(provider.build_assistant_entry(response))

        # No tool calls → model is done
        if not tool_calls:
            if response.text:
                _log(response.text, args.verbose)
            break

        # Execute each tool
        for tc in tool_calls:
            if _cancel.is_set():
                return 130

            fn_args = tc.arguments
            if isinstance(fn_args, str):
                try:
                    fn_args = json.loads(fn_args)
                except json.JSONDecodeError:
                    fn_args = {}

            _log(_fmt_call(tc.name, fn_args), args.verbose)
            result = execute_tool(tc.name, fn_args, args.project)
            total_calls += 1

            preview = result[:120].replace("\n", " ")
            _log(f"  → {preview}{'...' if len(result) > 120 else ''}", args.verbose, is_verbose=True)

            if _is_error(result):
                consecutive_errors += 1
                _log(f"  ✗ tool error ({consecutive_errors}/{args.max_tool_errors})", args.verbose)

                if consecutive_errors >= args.max_tool_errors:
                    _log(f"\n⚠  {consecutive_errors} consecutive errors — injecting abort signal.", args.verbose)
                    messages.append({
                        "role": "user",
                        "content": (
                            f"[ABORT] {consecutive_errors} tool calls failed. Last error: {result}\n"
                            "Stop calling tools. Summarise what is done and what still needs manual work."
                        ),
                    })
                    break

                feedback = _error_feedback(tc.name, fn_args, result, args.project)
                messages.append(provider.build_tool_result_entry(tc, feedback))

            else:
                consecutive_errors = 0

                # Empty-file guard
                if tc.name == "write_file" and result.startswith("Written 0 bytes"):
                    path    = fn_args.get("path", "?")
                    warning = (
                        f"[EMPTY FILE WARNING] {path} was written with no content.\n"
                        f'Call write_file again for "{path}" with the full implementation.'
                    )
                    _log(f"  ⚠ empty file: {path}", args.verbose)
                    messages.append(provider.build_tool_result_entry(tc, warning))
                else:
                    if tc.name == "write_file":
                        written_files.add(fn_args.get("path", ""))
                    messages.append(provider.build_tool_result_entry(tc, result))

    else:
        _log(f"\n⚠  Reached max turns ({args.max_turns}).", args.verbose)

    # Post-loop build verification
    build_cmd = _detect_build_cmd(args.project)
    if not build_cmd:
        _print_summary(turns, total_calls, total_p_tok, total_e_tok, time.time() - loop_start, written_files)
        return 0

    for retry in range(1, args.max_retries + 1):
        _log(f"\n► Verifying build: {build_cmd}", args.verbose)
        build_out = execute_tool("run_command", {"command": build_cmd}, args.project)
        _log(build_out, args.verbose)

        if not _has_build_errors(build_out):
            _log("✓ Build passed.", args.verbose)
            _print_summary(turns, total_calls, total_p_tok, total_e_tok, time.time() - loop_start, written_files)
            return 0

        _log(f"⚠  Build errors — asking model to fix (retry {retry}/{args.max_retries})...", args.verbose)
        messages.append({
            "role": "user",
            "content": f"The build failed. Fix ALL errors.\n\nBuild command: {build_cmd}\n\nOutput:\n{build_out}",
        })

        while turns < args.max_turns:
            if _cancel.is_set():
                return 130
            turns += 1
            messages = _trim(messages)
            _log(f"[fix turn {turns}]", args.verbose, is_verbose=True)

            try:
                response = provider.chat(messages, TOOLS)
            except KeyboardInterrupt:
                return 130
            except Exception as e:
                _log(f"Provider error during fix: {e}", args.verbose)
                return 1

            total_p_tok += response.prompt_tokens
            total_e_tok += response.completion_tokens

            tool_calls = response.tool_calls
            if not tool_calls and response.text:
                tool_calls = _parse_text_tool_calls(response.text)

            messages.append(provider.build_assistant_entry(response))

            if not tool_calls:
                if response.text:
                    _log(response.text, args.verbose)
                break

            for tc in tool_calls:
                if _cancel.is_set():
                    return 130
                fn_args = tc.arguments
                if isinstance(fn_args, str):
                    try:
                        fn_args = json.loads(fn_args)
                    except json.JSONDecodeError:
                        fn_args = {}
                _log(_fmt_call(tc.name, fn_args), args.verbose)
                result = execute_tool(tc.name, fn_args, args.project)
                total_calls += 1

                if _is_error(result):
                    consecutive_errors += 1
                    if consecutive_errors >= args.max_tool_errors:
                        messages.append({
                            "role": "user",
                            "content": (
                                f"[ABORT] {consecutive_errors} tool calls failed. Last: {result}\n"
                                "Stop and summarise what remains to be fixed manually."
                            ),
                        })
                        break
                    messages.append(provider.build_tool_result_entry(
                        tc, _error_feedback(tc.name, fn_args, result, args.project)
                    ))
                else:
                    consecutive_errors = 0
                    if tc.name == "write_file":
                        written_files.add(fn_args.get("path", ""))
                    messages.append(provider.build_tool_result_entry(tc, result))

    _log(f"\n✗ Build still failing after {args.max_retries} attempt(s).", args.verbose)
    _print_summary(turns, total_calls, total_p_tok, total_e_tok, time.time() - loop_start, written_files)
    return 1


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    _start_stdin_watcher()

    try:
        if args.plan_only:
            sys.exit(generate_plan(args))
        elif args.approved_plan:
            try:
                plan = json.loads(args.approved_plan)
            except json.JSONDecodeError as e:
                print(f"Error parsing plan JSON: {e}", flush=True)
                sys.exit(1)
            sys.exit(execute_with_plan(args, plan))
        else:
            sys.exit(run(args))
    except KeyboardInterrupt:
        print("\n► Interrupted. Exiting cleanly.", flush=True)
        sys.exit(130)


if __name__ == "__main__":
    main()
