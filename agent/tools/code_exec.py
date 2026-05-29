"""Shell command execution tool."""

import subprocess
from pathlib import Path

_TIMEOUT_1 = 30
_TIMEOUT_2 = 60


def run_command(args: dict, root: Path) -> str:
    command = args.get("command", "")
    if not command.strip():
        return "Error: empty command"

    def _spawn():
        return subprocess.Popen(
            command,
            shell=True,
            cwd=str(root),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

    def _collect(proc, timeout):
        try:
            stdout, stderr = proc.communicate(timeout=timeout)
            output = ((stdout or "") + (stderr or "")).strip()
            if not output:
                output = f"(exit code {proc.returncode}, no output)"
            elif len(output) > 3000:
                output = output[:3000] + "\n... (truncated)"
            return output, False
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
            return "", True

    try:
        proc   = _spawn()
        output, timed_out = _collect(proc, _TIMEOUT_1)
        if timed_out:
            proc2  = _spawn()
            output, timed_out2 = _collect(proc2, _TIMEOUT_2)
            if timed_out2:
                return (
                    f"Error: command timed out after {_TIMEOUT_2}s. "
                    "Use a build command (dotnet build, npm run build) not a run command."
                )
        return output
    except Exception as e:
        return f"Error running command: {e}"


SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": (
                "Run a shell command in the project root. "
                "Useful for tests, linters, build tools, git. Returns stdout + stderr."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Shell command to run."}
                },
                "required": ["command"],
            },
        },
    },
]

TOOL_MAP = {"run_command": run_command}
