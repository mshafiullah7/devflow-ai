"""
Tools registry — aggregates all tool schemas and executors.

To add a new tool module:
  1. Create devflow-cli/tools/your_module.py with SCHEMAS and TOOL_MAP
  2. Import it here and add to _MODULES

The TOOLS list and execute_tool() function are what agent.py consumes.
"""

from pathlib import Path
from . import file_ops, code_exec, search, github

_MODULES = [file_ops, code_exec, search, github]

# Flat list of all OpenAI-style tool schemas
TOOLS: list[dict] = []
for _m in _MODULES:
    TOOLS.extend(_m.SCHEMAS)

# Unified dispatch map: tool_name -> callable(args, root)
_TOOL_MAP: dict = {}
for _m in _MODULES:
    _TOOL_MAP.update(_m.TOOL_MAP)


def execute_tool(name: str, args: dict, project_root: str) -> str:
    """Route a tool call to its implementation. Always returns a string."""
    try:
        root = Path(project_root).resolve()
        fn   = _TOOL_MAP.get(name)
        if fn is None:
            return f'Error: unknown tool "{name}"'
        return fn(args, root)
    except Exception as exc:
        return f"Error executing {name}: {exc}"


__all__ = ["TOOLS", "execute_tool"]
