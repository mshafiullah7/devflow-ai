# devflow-agent

Self-contained Python CLI agent that gives Ollama models full agentic capabilities:
file read/write, code search, shell execution, and full project context injection.

## Requirements

- Python 3.10+
- [Ollama](https://ollama.com) running locally with your model pulled

## Setup

```bash
cd agent
pip install -r requirements.txt
```

## Usage

```bash
python devflow_agent.py \
  --project /path/to/your/project \
  --message "your task description" \
  --model qwen2.5-coder:32b \
  --base-url http://localhost:11434
```

## Options

| Option | Default | Description |
|---|---|---|
| `--project` | *(required)* | Project root directory |
| `--message` | *(required)* | Task to perform |
| `--model` | `qwen2.5-coder:32b` | Ollama model name |
| `--base-url` | `http://localhost:11434` | Ollama base URL |
| `--max-turns` | `30` | Max agentic loop iterations |
| `--verbose` | `false` | Show extra debug output |

## Test the context builder standalone

```bash
python context_builder.py /path/to/project
```

## Example output

```
► Building project context...
► read_file(path='lib/domain/entities/user.dart')
► read_file(path='lib/data/models/user_model.dart')
► write_file(path='lib/domain/entities/user.dart', content='...')
► write_file(path='lib/data/models/user_model.dart', content='...')
► run_command(command='flutter analyze lib/')

Added `createdAt` (DateTime) field to User entity and UserModel.
Flutter analyze shows no errors.
```

## Recommended models

| Model | Use case |
|---|---|
| `qwen2.5-coder:7b` | Quick tasks, single-file changes (~4GB VRAM) |
| `qwen2.5-coder:32b` | Multi-file, Clean Architecture, Flutter (~20GB VRAM) |
| `deepseek-coder-v2:16b` | Strong alternative (~10GB VRAM) |

## Available tools

| Tool | Description |
|---|---|
| `read_file` | Read file content |
| `write_file` | Write or overwrite a file |
| `list_directory` | List files and folders |
| `search_code` | Regex search across source files |
| `get_file_tree` | Full project directory tree |
| `run_command` | Run shell command (tests, lint, git) |
| `delete_file` | Delete a file |
| `create_directory` | Create a directory |

---

That's exactly the right strategic thinking. The agent is **infrastructure** — you build it once, and every model improvement (Qwen3, DeepSeek R2, Llama 4, whatever comes next) makes it more capable automatically. The investment pays forward.

Here's a realistic 1-week breakdown:

---

## Week Plan

**Days 1–2 — Python standalone (foundation)**
- `tools.py` — all tool definitions + executors (read, write, search, list, run)
- `context_builder.py` — repo map, file tree, `.gitignore` aware
- `requirements.txt`

**Day 3 — Core agent loop**
- `devflow_agent.py` — arg parsing, context injection, Ollama tool-call loop
- Test on a simple project (single-file changes)

**Day 4 — Real project testing**
- Test against Flutter / Clean Architecture project
- Multi-file changes across layers
- Tune context window usage, fix edge cases

**Day 5 — Electron integration**
- `_runDevflowAgent()` in `queue-handlers.js`
- `devflow-agent` type in Settings UI + seed config
- Bundle `agent/` via `extraResources` in `package.json`

---

## Future-proofing built into the design

Since you're building for future models, the agent should be designed so that **upgrading the model is a one-line config change**:

```
# Today — qwen2.5-coder:32b  (capable but imperfect)
# 3 months — qwen3:32b       (likely much stronger)
# 6 months — whatever wins   (just change model_name in Settings)
```

The tool schemas, context injection, and loop logic stay identical — only the model name changes. That's the whole point.

---

Shall I start building the Python standalone now — `tools.py`, `context_builder.py`, and `devflow_agent.py` — so you can run Day 1 tests today?