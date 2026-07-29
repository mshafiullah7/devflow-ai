"""Code search tool — regex search across project source files."""

import re
from pathlib import Path
from .file_ops import safe_path

_SOURCE_EXTS = {
    ".dart", ".py", ".ts", ".tsx", ".js", ".jsx", ".kt", ".swift",
    ".java", ".go", ".rs", ".rb", ".cs", ".cpp", ".c", ".h",
    ".yaml", ".yml", ".json", ".md",
}

_SKIP_DIRS = {
    ".git", "build", ".dart_tool", "node_modules", "__pycache__",
    ".gradle", ".idea", "dist",
}


def search_code(args: dict, root: Path) -> str:
    pattern     = args.get("pattern", "")
    rel         = args.get("path", ".")
    search_root = safe_path(root, rel)

    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        return f"Invalid regex pattern: {e}"

    matches = []
    for p in sorted(search_root.rglob("*")):
        if not p.is_file() or p.suffix not in _SOURCE_EXTS:
            continue
        if any(d in p.parts for d in _SKIP_DIRS):
            continue
        try:
            lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            for i, line in enumerate(lines, 1):
                if regex.search(line):
                    matches.append(f"{p.relative_to(root)}:{i}: {line.strip()}")
                    if len(matches) >= 50:
                        matches.append("... (truncated at 50 matches)")
                        return "\n".join(matches)
        except Exception:
            continue

    return "\n".join(matches) if matches else f"No matches for: {pattern}"


SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "search_code",
            "description": (
                "Regex search across all source files. "
                "Returns matching lines with file paths and line numbers."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "description": "Regex pattern to search for."},
                    "path":    {"type": "string", "description": "Directory to search (default: project root)."},
                },
                "required": ["pattern"],
            },
        },
    },
]

TOOL_MAP = {"search_code": search_code}
