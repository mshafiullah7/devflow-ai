'context_builder.py — builds a repo map injected into the agent system prompt'

import os
import re
from pathlib import Path

try:
    import pathspec
    _HAS_PATHSPEC = True
except ImportError:
    _HAS_PATHSPEC = False

# ---------------------------------------------------------------------------
# Directories always skipped (regardless of .gitignore)
# ---------------------------------------------------------------------------
SKIP_DIRS = {
    '.git', '.dart_tool', '.flutter-plugins', '.flutter-plugins-dependencies',
    '.pub-cache', 'build', 'dist', 'out', '.gradle', '.idea', '.vscode',
    '__pycache__', 'node_modules', '.next', '.nuxt', 'coverage',
    '.pytest_cache', '.mypy_cache', 'venv', '.venv', 'env', '.env',
}

# ---------------------------------------------------------------------------
# File extensions considered "source code" for signature extraction
# ---------------------------------------------------------------------------
SOURCE_EXTS = {
    '.dart', '.py', '.ts', '.tsx', '.js', '.jsx',
    '.kt', '.java', '.swift', '.go', '.rs',
    '.cs', '.cpp', '.c', '.h',
}

# ---------------------------------------------------------------------------
# Regex patterns for extracting top-level class/function signatures
# ---------------------------------------------------------------------------
SIGNATURE_PATTERNS = {
    '.dart': re.compile(
        r'^\s*(abstract\s+class|class|mixin|extension|enum|typedef)\s+(\w+)',
        re.MULTILINE
    ),
    '.py': re.compile(
        r'^(class|def|async def)\s+(\w+)',
        re.MULTILINE
    ),
    '.ts': re.compile(
        r'^\s*(export\s+)?(default\s+)?(abstract\s+)?(class|function\*?|const|let|var|interface|type|enum)\s+(\w+)',
        re.MULTILINE
    ),
    '.tsx': re.compile(
        r'^\s*(export\s+)?(default\s+)?(abstract\s+)?(class|function\*?|const|let|var|interface|type|enum)\s+(\w+)',
        re.MULTILINE
    ),
    '.js': re.compile(
        r'^\s*(export\s+)?(default\s+)?(class|function\*?|const|let|var)\s+(\w+)',
        re.MULTILINE
    ),
    '.jsx': re.compile(
        r'^\s*(export\s+)?(default\s+)?(class|function\*?|const|let|var)\s+(\w+)',
        re.MULTILINE
    ),
    '.kt': re.compile(
        r'^\s*(abstract\s+|data\s+|sealed\s+|open\s+|inner\s+)*(class|object|interface|fun|typealias)\s+(\w+)',
        re.MULTILINE
    ),
    '.java': re.compile(
        r'^\s*(public|private|protected|static|abstract|final)?\s*(class|interface|enum|record)\s+(\w+)',
        re.MULTILINE
    ),
    '.swift': re.compile(
        r'^\s*(public|private|internal|open|fileprivate)?\s*(class|struct|protocol|enum|extension|func)\s+(\w+)',
        re.MULTILINE
    ),
    '.go': re.compile(
        r'^(type\s+(\w+)\s+(struct|interface)|func\s+(?:\([^)]+\)\s+)?(\w+)\s*\()',
        re.MULTILINE
    ),
    '.rs': re.compile(
        r'^\s*(pub\s+)?(struct|enum|trait|impl|fn)\s+(\w+)',
        re.MULTILINE
    ),
}


def _load_gitignore(project_root: Path):
    """Return a pathspec matcher for the project's .gitignore, or None."""
    if not _HAS_PATHSPEC:
        return None
    gitignore = project_root / '.gitignore'
    if not gitignore.exists():
        return None
    try:
        patterns = gitignore.read_text(encoding='utf-8', errors='replace').splitlines()
        return pathspec.PathSpec.from_lines('gitwildmatch', patterns)
    except Exception:
        return None


def _extract_signatures(path: Path) -> list[str]:
    """Return a list of top-level symbol names from a source file."""
    ext     = path.suffix.lower()
    pattern = SIGNATURE_PATTERNS.get(ext)
    if pattern is None:
        return []
    try:
        text  = path.read_text(encoding='utf-8', errors='replace')
        names = []
        for m in pattern.finditer(text):
            # Last non-empty group is the name
            name = next((g for g in reversed(m.groups()) if g and g.isidentifier()), None)
            if name and name not in names:
                names.append(name)
        return names[:8]  # cap at 8 symbols per file
    except Exception:
        return []


def build(project_root: str, max_chars: int = 12_000) -> str:
    """
    Walk the project and return a repo-map string for injection into the system prompt.
    Respects .gitignore. Extracts class/function signatures for source files.
    Truncates to max_chars to stay within context window budgets.
    """
    root      = Path(project_root).resolve()
    gitignore = _load_gitignore(root)
    lines     = [f'PROJECT STRUCTURE ({root})', '']

    def _should_skip_dir(rel_parts: tuple) -> bool:
        name = rel_parts[-1]
        if name in SKIP_DIRS or name.startswith('.'):
            return True
        if gitignore:
            rel = '/'.join(rel_parts) + '/'
            if gitignore.match_file(rel):
                return True
        return False

    def _should_skip_file(rel: str) -> bool:
        if gitignore and gitignore.match_file(rel):
            return True
        return False

    def _walk(directory: Path, prefix: str, depth: int):
        if depth > 5:
            return
        try:
            entries = sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except PermissionError:
            return

        visible = []
        for e in entries:
            rel_parts = e.relative_to(root).parts
            if e.is_dir():
                if _should_skip_dir(rel_parts):
                    continue
            else:
                rel_str = str(e.relative_to(root)).replace('\\', '/')
                if _should_skip_file(rel_str):
                    continue
            visible.append(e)

        for i, entry in enumerate(visible):
            connector = '└── ' if i == len(visible) - 1 else '├── '
            extension = '    ' if i == len(visible) - 1 else '│   '

            if entry.is_dir():
                lines.append(f'{prefix}{connector}{entry.name}/')
                _walk(entry, prefix + extension, depth + 1)
            else:
                sigs = _extract_signatures(entry)
                sig_str = f'  [{", ".join(sigs)}]' if sigs else ''
                lines.append(f'{prefix}{connector}{entry.name}{sig_str}')

                # Stop early if we're already near the char limit
                current = sum(len(l) + 1 for l in lines)
                if current > max_chars * 0.9:
                    lines.append(f'{prefix}    ... (truncated)')
                    return

    _walk(root, '', 0)

    result = '\n'.join(lines)
    if len(result) > max_chars:
        result = result[:max_chars] + '\n... (repo map truncated)'
    return result


def build_with_rag(
    project_root: str,
    query: str,
    retriever,
    max_chars: int = 12_000,
    rag_snippets: int = 5,
    rag_char_budget: int = 6_000,
) -> str:
    """
    Combines the static repo map with semantically retrieved code snippets.
    The static map is built first (capped at max_chars), then RAG snippets
    for the specific query are appended (capped at rag_char_budget).
    """
    repo_map  = build(project_root, max_chars=max_chars)
    rag_block = retriever.query(query, n_results=rag_snippets)
    if rag_block:
        trimmed = rag_block[:rag_char_budget]
        if len(rag_block) > rag_char_budget:
            trimmed += '\n... (RAG snippets truncated)'
        return repo_map + '\n\n' + trimmed
    return repo_map


if __name__ == '__main__':
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else '.'
    print(build(target))
