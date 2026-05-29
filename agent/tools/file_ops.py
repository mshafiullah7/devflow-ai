"""File system tools: read, write, list, delete, create directory, file tree."""

import time
from pathlib import Path


def safe_path(root: Path, rel: str) -> Path:
    p = (root / rel).resolve()
    if not str(p).startswith(str(root)):
        raise ValueError(f'Path "{rel}" escapes the project root.')
    return p


def read_file(args: dict, root: Path) -> str:
    path = safe_path(root, args.get("path", ""))
    if not path.exists():
        return f'Error: file not found: {args.get("path")}'
    if not path.is_file():
        return f'Error: "{args.get("path")}" is not a file'
    return path.read_text(encoding="utf-8", errors="replace")


def write_file(args: dict, root: Path) -> str:
    rel     = args.get("path", "")
    content = args.get("content", "")
    path    = safe_path(root, rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        path.write_text(content, encoding="utf-8")
    except PermissionError:
        time.sleep(0.5)
        path.write_text(content, encoding="utf-8")
    return f"Written {len(content)} bytes to {rel}"


def list_directory(args: dict, root: Path) -> str:
    rel  = args.get("path", ".")
    path = safe_path(root, rel)
    if not path.exists():
        return f"Error: directory not found: {rel}"
    if not path.is_dir():
        return f'Error: "{rel}" is not a directory'
    entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name))
    lines = [f'{"" if e.is_dir() else ""} {e.name}' for e in entries]
    return "\n".join(lines) if lines else "(empty directory)"


def delete_file(args: dict, root: Path) -> str:
    rel  = args.get("path", "")
    path = safe_path(root, rel)
    if not path.exists():
        return f"Error: file not found: {rel}"
    if not path.is_file():
        return f'Error: "{rel}" is not a file'
    path.unlink()
    return f"Deleted {rel}"


def create_directory(args: dict, root: Path) -> str:
    rel  = args.get("path", "")
    path = safe_path(root, rel)
    path.mkdir(parents=True, exist_ok=True)
    return f"Created directory {rel}"


def get_file_tree(args: dict, root: Path) -> str:
    max_depth = int(args.get("max_depth", 4))
    lines     = [str(root)]
    _walk(root, root, "", max_depth, 0, lines)
    return "\n".join(lines)


_SKIP_DIRS = {
    ".git", "build", ".dart_tool", "node_modules", "__pycache__",
    ".gradle", ".idea", "dist", ".flutter-plugins", ".packages",
}


def _walk(root: Path, current: Path, prefix: str, max_depth: int, depth: int, lines: list):
    if depth >= max_depth:
        return
    try:
        entries = sorted(current.iterdir(), key=lambda p: (p.is_file(), p.name))
    except PermissionError:
        return
    entries = [e for e in entries if e.name not in _SKIP_DIRS]
    for i, entry in enumerate(entries):
        connector = "└── " if i == len(entries) - 1 else "├── "
        lines.append(f"{prefix}{connector}{entry.name}")
        if entry.is_dir():
            ext = "    " if i == len(entries) - 1 else "│   "
            _walk(root, entry, prefix + ext, max_depth, depth + 1, lines)


# ---------------------------------------------------------------------------
# Tool schemas
# ---------------------------------------------------------------------------

SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the full content of a file. Always call before writing.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to project root."}
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write or overwrite a file. Creates parent dirs if needed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path":    {"type": "string", "description": "File path relative to project root."},
                    "content": {"type": "string", "description": "Full content to write."},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files and subdirectories at a path.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path relative to project root."}
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": "Delete a file from the project.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path relative to project root."}
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_directory",
            "description": "Create a new directory and any missing parents.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "Directory path relative to project root."}
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_file_tree",
            "description": "Get the full project directory tree.",
            "parameters": {
                "type": "object",
                "properties": {
                    "max_depth": {"type": "integer", "description": "Max depth. Default 4."}
                },
                "required": [],
            },
        },
    },
]

TOOL_MAP = {
    "read_file":       read_file,
    "write_file":      write_file,
    "list_directory":  list_directory,
    "delete_file":     delete_file,
    "create_directory": create_directory,
    "get_file_tree":   get_file_tree,
}
