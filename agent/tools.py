'tools.py — MCP-style tool schemas and executors for devflow-agent'

import os
import re
import subprocess
from pathlib import Path

# ---------------------------------------------------------------------------
# Tool schemas — sent to Ollama so the model knows what tools exist
# ---------------------------------------------------------------------------

TOOLS = [
    {
        'type': 'function',
        'function': {
            'name': 'read_file',
            'description': (
                'Read the full content of a file in the project. '
                'Always call this before writing to a file.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'path': {
                        'type': 'string',
                        'description': 'File path relative to project root, e.g. lib/domain/entities/user.dart',
                    }
                },
                'required': ['path'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'write_file',
            'description': (
                'Write or overwrite a file with new content. '
                'Creates parent directories if they do not exist. '
                'Always read the file first before writing.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'path': {
                        'type': 'string',
                        'description': 'File path relative to project root.',
                    },
                    'content': {
                        'type': 'string',
                        'description': 'Full new content to write to the file.',
                    },
                },
                'required': ['path', 'content'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'list_directory',
            'description': 'List all files and subdirectories at the given path.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'path': {
                        'type': 'string',
                        'description': 'Directory path relative to project root. Defaults to project root.',
                    }
                },
                'required': [],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'search_code',
            'description': (
                'Search for a regex pattern across all source files in the project. '
                'Returns matching lines with file paths and line numbers. '
                'Useful for finding where a class or function is used.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'pattern': {
                        'type': 'string',
                        'description': 'Regex pattern to search for.',
                    },
                    'path': {
                        'type': 'string',
                        'description': 'Directory to search in, relative to project root. Defaults to entire project.',
                    },
                },
                'required': ['pattern'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_file_tree',
            'description': 'Get the full project directory tree as a text outline.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'max_depth': {
                        'type': 'integer',
                        'description': 'Maximum directory depth to show. Defaults to 4.',
                    }
                },
                'required': [],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'run_command',
            'description': (
                'Run a shell command in the project root directory. '
                'Useful for running tests, linters, build tools, or git commands. '
                'Returns combined stdout and stderr. Has a 30-second timeout.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'command': {
                        'type': 'string',
                        'description': 'Shell command to run, e.g. "flutter analyze" or "dart test"',
                    }
                },
                'required': ['command'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'delete_file',
            'description': 'Delete a file from the project.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'path': {
                        'type': 'string',
                        'description': 'File path relative to project root.',
                    }
                },
                'required': ['path'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'create_directory',
            'description': 'Create a new directory (and any missing parent directories).',
            'parameters': {
                'type': 'object',
                'properties': {
                    'path': {
                        'type': 'string',
                        'description': 'Directory path relative to project root.',
                    }
                },
                'required': ['path'],
            },
        },
    },
]

# ---------------------------------------------------------------------------
# Tool router
# ---------------------------------------------------------------------------

def execute_tool(name: str, args: dict, project_root: str) -> str:
    """
    Route a tool call from Ollama to the correct Python function.
    Always returns a string — never raises, so the agent loop never crashes.
    """
    try:
        root = Path(project_root).resolve()
        fn = _TOOL_MAP.get(name)
        if fn is None:
            return f'Error: unknown tool "{name}"'
        return fn(args, root)
    except Exception as exc:
        return f'Error executing {name}: {exc}'


# ---------------------------------------------------------------------------
# Executor implementations
# ---------------------------------------------------------------------------

def _safe_path(root: Path, rel: str) -> Path:
    """Resolve a relative path under root. Raises if it escapes the root."""
    p = (root / rel).resolve()
    if not str(p).startswith(str(root)):
        raise ValueError(f'Path "{rel}" escapes the project root — not allowed.')
    return p


def _read_file(args: dict, root: Path) -> str:
    path = _safe_path(root, args.get('path', ''))
    if not path.exists():
        return f'Error: file not found: {args.get("path")}'
    if not path.is_file():
        return f'Error: "{args.get("path")}" is not a file'
    try:
        return path.read_text(encoding='utf-8', errors='replace')
    except Exception as e:
        return f'Error reading file: {e}'


def _write_file(args: dict, root: Path) -> str:
    rel     = args.get('path', '')
    content = args.get('content', '')
    path    = _safe_path(root, rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
    return f'Written {len(content)} bytes to {rel}'


def _list_directory(args: dict, root: Path) -> str:
    rel  = args.get('path', '.')
    path = _safe_path(root, rel)
    if not path.exists():
        return f'Error: directory not found: {rel}'
    if not path.is_dir():
        return f'Error: "{rel}" is not a directory'
    entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name))
    lines = []
    for e in entries:
        kind = '' if e.is_dir() else ''
        lines.append(f'{kind} {e.name}')
    return '\n'.join(lines) if lines else '(empty directory)'


def _search_code(args: dict, root: Path) -> str:
    pattern = args.get('pattern', '')
    rel     = args.get('path', '.')
    search_root = _safe_path(root, rel)

    # Extensions to search
    exts = {'.dart', '.py', '.ts', '.tsx', '.js', '.jsx', '.kt', '.swift',
            '.java', '.go', '.rs', '.rb', '.cs', '.cpp', '.c', '.h',
            '.yaml', '.yml', '.json', '.md'}

    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        return f'Invalid regex pattern: {e}'

    matches = []
    for p in sorted(search_root.rglob('*')):
        if not p.is_file():
            continue
        if p.suffix not in exts:
            continue
        # Skip common noise dirs
        parts = p.parts
        if any(d in parts for d in ('.git', 'build', '.dart_tool', 'node_modules',
                                     '__pycache__', '.gradle', '.idea', 'dist')):
            continue
        try:
            lines = p.read_text(encoding='utf-8', errors='replace').splitlines()
            for i, line in enumerate(lines, 1):
                if regex.search(line):
                    rel_path = p.relative_to(root)
                    matches.append(f'{rel_path}:{i}: {line.strip()}')
                    if len(matches) >= 50:
                        matches.append('... (truncated at 50 matches)')
                        return '\n'.join(matches)
        except Exception:
            continue

    if not matches:
        return f'No matches found for pattern: {pattern}'
    return '\n'.join(matches)


def _get_file_tree(args: dict, root: Path) -> str:
    max_depth = int(args.get('max_depth', 4))
    lines = [str(root)]
    _walk_tree(root, root, '', max_depth, 0, lines)
    return '\n'.join(lines)


def _walk_tree(root: Path, current: Path, prefix: str, max_depth: int, depth: int, lines: list):
    if depth >= max_depth:
        return
    skip = {'.git', 'build', '.dart_tool', 'node_modules', '__pycache__',
            '.gradle', '.idea', 'dist', '.flutter-plugins', '.packages'}
    try:
        entries = sorted(current.iterdir(), key=lambda p: (p.is_file(), p.name))
    except PermissionError:
        return
    entries = [e for e in entries if e.name not in skip]
    for i, entry in enumerate(entries):
        connector = '└── ' if i == len(entries) - 1 else '├── '
        lines.append(f'{prefix}{connector}{entry.name}')
        if entry.is_dir():
            extension = '    ' if i == len(entries) - 1 else '│   '
            _walk_tree(root, entry, prefix + extension, max_depth, depth + 1, lines)


def _run_command(args: dict, root: Path) -> str:
    command = args.get('command', '')
    if not command.strip():
        return 'Error: empty command'
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(root),
            capture_output=True,
            text=True,
            timeout=30,
            encoding='utf-8',
            errors='replace',
        )
        output = (result.stdout or '') + (result.stderr or '')
        output = output.strip()
        if not output:
            output = f'(exit code {result.returncode}, no output)'
        elif len(output) > 3000:
            output = output[:3000] + '\n... (truncated)'
        return output
    except subprocess.TimeoutExpired:
        return 'Error: command timed out after 30 seconds'
    except Exception as e:
        return f'Error running command: {e}'


def _delete_file(args: dict, root: Path) -> str:
    rel  = args.get('path', '')
    path = _safe_path(root, rel)
    if not path.exists():
        return f'Error: file not found: {rel}'
    if not path.is_file():
        return f'Error: "{rel}" is not a file'
    path.unlink()
    return f'Deleted {rel}'


def _create_directory(args: dict, root: Path) -> str:
    rel  = args.get('path', '')
    path = _safe_path(root, rel)
    path.mkdir(parents=True, exist_ok=True)
    return f'Created directory {rel}'


# ---------------------------------------------------------------------------
# Tool dispatch map
# ---------------------------------------------------------------------------

_TOOL_MAP = {
    'read_file':       _read_file,
    'write_file':      _write_file,
    'list_directory':  _list_directory,
    'search_code':     _search_code,
    'get_file_tree':   _get_file_tree,
    'run_command':     _run_command,
    'delete_file':     _delete_file,
    'create_directory': _create_directory,
}
