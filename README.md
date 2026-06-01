# DevFlow AI

**An AI-powered Software Development Life Cycle (SDLC) companion — desktop app for solo developers and small teams.**

DevFlow AI is a local-first Electron desktop application that covers the full development lifecycle from requirements through testing. It is **tech-stack agnostic** and works alongside your existing IDE and terminal — not as a replacement.

---

## Table of Contents

1. [What It Is](#what-it-is)
2. [SDLC Coverage](#sdlc-coverage)
3. [Feature Breakdown by Page](#feature-breakdown-by-page)
4. [AI Model Support](#ai-model-support)
5. [Developer Setup](#developer-setup)
6. [Building Executables](#building-executables)
7. [Tech Stack & Architecture](#tech-stack--architecture)

---

## What It Is

DevFlow AI helps you structure, document, and execute software projects with AI assistance at every step.

- Structure projects into architectural **layers** (Frontend, Backend API, Mobile, etc.)
- Write and AI-edit **Markdown documents** (PRD, specs, architecture notes) with diagram attachments
- Generate **UI mockups** from natural-language templates
- Define and run multi-step **AI workflows** for recurring development tasks
- Track **bugs and issues** with severity, status, and AI-assisted analysis
- **Generate and run tests** across Flutter, Python, .NET, Java, Go, Ruby, and JS/TS
- View **git changes** across all layers from a single screen
- Chat with AI in the context of your project's documents and issues
- Queue and batch-run **AI prompts** with plan-and-approve execution

Everything runs locally. Data is stored in a SQLite database on your machine. No account or internet connection is required unless using a cloud AI API.

---

## SDLC Coverage

DevFlow AI covers **6 of the 7 standard SDLC phases**. CI/CD (automated pipelines, deployments) is outside its scope — it is a pre-deployment companion tool.

| SDLC Phase | Coverage | Features in DevFlow AI |
|---|---|---|
| **Planning** | Full | Projects, layers, documents, AI architecture generation |
| **Requirements** | Full | Documents (PRD, specs), issues, templates |
| **System Design** | Full | Architecture docs, mockups, style guide, draw.io diagrams |
| **Implementation** | Full | Prompt queue, AI workflows, AI console, git integration |
| **Testing** | Full | Test generator (multi-language), test runner (multi-framework) |
| **Maintenance** | Full | Issue tracker (severity/status), AI-assisted bug analysis |
| **CI/CD / Deployment** | Not covered | Use GitHub Actions, GitLab CI, or similar external tools |

---

## Feature Breakdown by Page

### Launcher — Project Manager

The home screen for the app.

- Create and manage multiple projects
- Recent projects list with last-opened timestamps
- Theme switcher: **Light / Dark / Midnight**
- Delete projects (with confirmation)

---

### Project Home — Dashboard

The per-project overview screen.

- Stats strip: workflow count, open issues, last test run failures
- Quick links: Project Overview document and Style Guide
- Live **git status badge** with background polling
- AI model picker (active model shown in header)
- Sidebar navigation to all project sections

---

### Project Layers — Architecture Definition

Define the sub-projects or deployment units that make up your system (e.g. Frontend, Backend API, Mobile App, Database, Infrastructure).

- Each layer stores: name, description, setup instructions, folder path
- **AI generation**: select project documents → AI analyses them and suggests architectural layers with full setup instructions per technology (scaffold commands, install steps, env vars, run commands)
- Per-layer folder path picker used by the Git Changes and Test Generator pages
- Layers feed into: Workflows, Test Generator, Git Changes, Issues, Prompt Queue

---

### Documents — Project Documentation

Full-featured Markdown document editor with AI editing built in.

| Feature | Detail |
|---|---|
| Edit / Preview tabs | Ctrl+S to save in Edit mode |
| AI Edit panel | Right-hand panel: instruct the AI to update the document; reads attached diagrams for context |
| SVG attachments | Paste or browse SVG code; renders inline in Preview |
| draw.io attachments | Open in draw.io desktop, edit, sync changes back |
| PDF export | Exports styled HTML as PDF |
| Templates | Template picker on new document; manage templates in Settings |
| Revert AI edits | One-click revert to previous content per AI message |
| Model support | Ollama, Claude CLI, Gemini CLI, any OpenAI-compatible API |

**Typical documents:** Project Overview, PRD, API Specification, Architecture Decision Records, Database Schema, Meeting Notes, Release Notes.

#### draw.io Workflow
1. Add a draw.io attachment → click **Open in draw.io**
2. Edit and save in draw.io (`Ctrl+S`)
3. Return to the app → click **Sync** → saved to database
4. Reference in Markdown: `[Diagram Name](attach:ID)` — renders as inline badge

---

### Mockups — Screen Design Generator

AI-generated HTML/CSS screen mockups from natural-language descriptions.

- **30+ built-in screen templates** grouped by category:
  - Authentication (Login, OTP, Register, Forgot Password)
  - Dashboards, Analytics, Admin panels
  - E-Commerce (Product listing, Cart, Checkout, Order tracking)
  - Social Media (Feed, Profile, Stories, DMs)
  - Finance (Wallet, Transaction history, Send money)
  - Healthcare, Education, Real Estate, Travel, Food Delivery
  - Settings, Onboarding, Notifications, Search
- Live HTML preview in-app
- Queue screens for bulk AI generation
- Style guide enforcement per project
- Mockups can be linked to Workflows (scope a workflow to a specific screen)

---

### Workflows — AI Task Orchestration

Define reusable multi-step AI workflows for recurring development tasks (e.g. code review, feature implementation, documentation generation).

- Each workflow: name, description, optional linked screen design
- Workflow **layers** (steps): name, purpose, inputs, outputs, AI prompt
- Drag-and-drop reorder of steps
- Run one layer at a time (with preview drawer showing purpose/prompt)
- **Run All** opens a dedicated runner window with live streaming output and "Run Next" chaining
- Navigation guard prevents leaving while a run is in progress
- **Success criteria** tab per workflow
- **AI generation**: click Generate → describe the feature → AI creates a full workflow with steps

---

### Issues — Bug & Issue Tracker

Lightweight per-project issue tracker with AI assistance.

| Field | Values |
|---|---|
| Severity | Critical / High / Medium / Low |
| Status | Open → In Progress → Resolved / Closed / Won't Fix |
| Detail | Title, description, steps to reproduce, expected vs actual behavior |
| Layer | Associate issue with a specific project layer |

- Grouped list view with collapsible status sections (Resolved/Closed collapse by default)
- AI-assisted analysis and next-step suggestions
- Queue issues for batch AI processing
- Live git badge in header

---

### Git Changes — Multi-Repo Git View

View and manage git changes across all project layers from a single screen.

- Per-layer tab showing changed files (each layer = a separate git repo)
- Pending commit count badge per layer
- Inline diff viewer per file
- Stage, unstage, and commit with message
- Terminal console for custom git commands
- **Quick Commands** modal for saved shell commands
- Overall project-root git view as fallback

---

### AI Console — Project-Aware Chat

Full conversation AI chat with your project loaded as context.

- Automatically loads project documents and open issues as context
- Multi-turn conversation history with token count estimate
- Streaming response display
- Clear conversation button
- Works with all configured AI models (Ollama, Claude CLI, Gemini, API)

---

### Test Generator — AI Test Generation

Generate tests for any project layer using AI, with automatic language/framework detection.

| Setup Instructions contain | Generated test type |
|---|---|
| flutter / dart | Dart widget & unit tests (`flutter test`) |
| python / pytest / pip | Python pytest `.py` |
| .net / c# / dotnet | C# xUnit `.cs` |
| java / kotlin | JUnit `.java` / `.kt` |
| golang / go | Go `_test.go` |
| ruby / rspec / rails | Ruby RSpec `_spec.rb` |
| Default | Jest / TypeScript `.ts` / `.js` |

- Detects UI layers (React, Angular, Flutter, SwiftUI, Jetpack Compose, etc.) and generates appropriate UI/widget tests
- Git integration shows generated test files

---

### Test Runner — Multi-Framework Test Execution

Run and track test suites per project layer.

- Configurable test command per layer
- Live output streaming in-app
- **Auto-parses results from:** Cypress, Jest, Flutter, Playwright, pytest, Go test, RSpec, MSTest, Vitest, PHPUnit
- Shows pass / fail / skip counts and duration
- Test run history per project — last run's fail count shown as sidebar badge
- Model configs manager accessible inline

---

### Prompt Queue — Batch AI Task Runner

Queue up AI prompts for sequential execution with full conversation history per item.

- Each item: title, prompt, per-layer association, status (pending / running / done / failed / skipped)
- **Planning mode**: AI first generates a step-by-step plan → user approves → AI executes
  - Plan step progress bar shown during execution
- Run all pending items sequentially in one click
- Per-item conversation history preserved across runs
- Separate **Queue Runner window** for distraction-free execution
- Timer and elapsed time shown while running

---

### Settings — App Configuration

| Section | What it configures |
|---|---|
| **AI Config** | Add, edit, and delete AI model configurations |
| **Model Mapping** | Assign specific models to specific pages (Documents, Workflows, Issues, etc.) |
| **Document Templates** | Create, edit, group, and reorder templates used in Documents |
| **Cloud Sync** | Configure remote backup destination |
| **Telegram** | Configure a Telegram bot for run notifications |
| **Backup** | Export, restore, or backup the SQLite database |
| **Quick Commands** | Manage saved shell commands used in Git Changes |

#### AI Config — Supported Model Types

| Type | Executable / Endpoint | Notes |
|---|---|---|
| Claude CLI | `claude` | Pipe or heredoc input modes; choose model (Haiku, Sonnet, Opus) |
| Gemini CLI | `gemini` | 2.5 Flash, 2.5 Pro, 2.0 Flash, 1.5 Pro |
| Aider | `aider` | GPT-4o, Claude, DeepSeek Coder |
| Ollama | `http://localhost:11434` | Any locally pulled model |
| OpenAI-compatible API | Any base URL | OpenRouter, LM Studio, Anthropic API, llama.cpp server |

---

## AI Model Support

DevFlow AI is fully model-agnostic. You can configure multiple models and assign different models to different pages.

```
Settings → AI Config → Add model
```

Different pages can be mapped to different models via **Settings → Model Mapping** — e.g. use a fast model for chat and a powerful model for code generation.

---

## Python Agent (`agent/`)

The `agent/` folder is a Python layer that the Electron app spawns as subprocesses. It is **actively used** at runtime — not optional infrastructure.

### What's in `agent/`

| File | Role | Called from |
|---|---|---|
| `ollama_proxy.py` | Thin streaming proxy for Ollama models | `chat-handlers.js` — used by every page that calls an Ollama model (Documents AI Edit, Workflows runner, AI Console, etc.) |
| `openai_proxy.py` | Thin streaming proxy for OpenAI-compatible API models | `chat-handlers.js` — used by every page calling an API model |
| `devflow_agent.py` | Full agentic coding agent (plan + execute loop) | `queue-handlers.js` — Prompt Queue when DevFlow Agent is enabled |
| `agent.py` | Provider-agnostic agent (Ollama, OpenAI, Anthropic, Groq) | Standalone CLI — not yet wired to Electron |
| `context_builder.py` | Builds repo map (file tree + signatures) for agent context | `devflow_agent.py` at startup |
| `tools.py` | Tool schemas and executors the agent uses | `devflow_agent.py` agentic loop |
| `rag.py` | Optional RAG via ChromaDB + sentence-transformers | `devflow_agent.py` (gracefully skipped if not installed) |
| `providers/` | Provider abstractions (Ollama, Anthropic, OpenAI) | `agent.py` |

### How `ollama_proxy.py` and `openai_proxy.py` work

Every time the app streams a response from an Ollama or OpenAI-compatible model, it:

1. Writes the message array to a temp JSON file
2. Spawns `python ollama_proxy.py --messages-file <tmp> --model <name>` (or `openai_proxy.py`)
3. Streams stdout tokens back to the renderer in real time
4. Deletes the temp file on close

This affects: Documents AI Edit, Workflow layer runs, AI Console, Test Generator, Project Layers generate, and anywhere else a model response is streamed.

### How `devflow_agent.py` works (DevFlow Agent mode)

Enabled in Settings → AI Config by ticking **"Use DevFlow Agent"** on an Ollama model config, or by adding a model with type `devflow-agent`.

**Phase 1 — Planning** (`--plan-only`):
- Agent reads the project repo map (file tree + class/function signatures via `context_builder.py`)
- Optionally uses RAG (ChromaDB semantic search) if installed
- Produces a JSON plan: task summary + 2–5 steps with files, tools, descriptions
- Electron detects `[PLAN_START]…[PLAN_END]` markers in stdout and shows the plan for approval

**Phase 2 — Execution** (`--approved-plan <json>`):
- Agent executes each step using the tool loop
- Streams step progress markers: `[STEP:1/3]`, `[STEP_DONE:1/3]`, `[STEP_FAILED:1/3]`
- Runs shell commands (build, test, lint) to verify changes
- Auto-retries on build errors

**Agent tools available to the model:**

| Tool | What it does |
|---|---|
| `read_file` | Read file content from project |
| `write_file` | Write or overwrite a file |
| `list_directory` | List files and folders |
| `search_code` | Regex search across source files |
| `get_file_tree` | Full project directory tree |
| `run_command` | Run shell command (tests, lint, git, build) |
| `delete_file` | Delete a file |
| `create_directory` | Create a directory |

**Context injection:** The agent auto-detects language signatures (classes, functions, methods) for Dart, Python, TypeScript, Go, Rust, C#, C/C++ and injects a repo map into every prompt.

**Text-based tool call fallback:** Small models (7b, 14b) that ignore native tool-calling API emit tool calls as JSON or XML in text — the agent parses both formats automatically.

### Agent Prerequisites

```bash
cd agent
pip install -r requirements.txt
```

Requirements: `ollama`, `openai`, `pathspec`, `chromadb`, `sentence-transformers`, `gitpython`, `google-genai`, `anthropic`

> `chromadb` and `sentence-transformers` are only needed for RAG. If they fail to install, the agent still works — RAG is skipped gracefully.

Ollama must be running for Ollama model types:

```bash
ollama serve
ollama pull qwen2.5-coder:7b   # fast tasks
ollama pull qwen2.5-coder:32b  # multi-file, complex changes
```

### Recommended models for DevFlow Agent

| Model | VRAM | Use case |
|---|---|---|
| `qwen2.5-coder:7b` | ~4 GB | Quick single-file tasks |
| `qwen2.5-coder:32b` | ~20 GB | Multi-file, Clean Architecture, Flutter |
| `deepseek-coder-v2:16b` | ~10 GB | Strong alternative |

### Standalone CLI usage

```bash
# Run the agent directly (without Electron)
python agent/devflow_agent.py \
  --project /path/to/project \
  --message "Add input validation to the login form" \
  --model qwen2.5-coder:32b \
  --max-turns 20 \
  --verbose

# Plan only — inspect before running
python agent/devflow_agent.py \
  --project /path/to/project \
  --message "Refactor auth module to use JWT" \
  --model qwen2.5-coder:32b \
  --plan-only
```

---

## Developer Setup

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | 18+ LTS | https://nodejs.org |
| **npm** | comes with Node.js | — |
| **Python** | 3.x | Required to compile `better-sqlite3` native module |
| **Visual Studio Build Tools** *(Windows)* | 2019 or 2022 | Select "Desktop development with C++" workload |
| **draw.io Desktop** *(optional)* | latest | Only needed for editing draw.io attachments |

> macOS / Linux: Python and a C++ compiler (Xcode CLT / gcc) are usually pre-installed.

### Install & Run

```bash
# 1. Clone the repo
git clone <repo-url>
cd devflow-ai-sdlc

# 2. Install dependencies (also compiles better-sqlite3 native module)
npm install

# 3. Start the app
npm start
```

> **If `npm install` fails on `better-sqlite3`:** ensure Python and Visual Studio Build Tools are installed, then:
> ```bash
> npm install --build-from-source
> ```

### First Run

- SQLite database is created automatically on first launch (OS app-data folder)
- All schema migrations run on startup — no manual DB setup needed
- Go to **Settings → AI Config** and add at least one AI model before using AI features
- Set a project folder path for git tracking and test running

### Scripts

| Command | Description |
|---|---|
| `npm start` | Start the app in development mode |
| `npm run package` | Bundle app + Electron binary into `out/` |
| `npm run make` | Build platform installer from the package |
| `npm test` | Run Playwright e2e tests (headless) |
| `npm run test:watch` | Run tests with visible window |
| `npm run test:report` | Show HTML test report |

---

## Building Executables

> Build on the **target platform** — cross-platform builds are not supported.

```bash
npm run make
```

| Platform | Output |
|---|---|
| Windows | `out/make/squirrel.windows/x64/devflow-ai-sdlc Setup.exe` |
| macOS | `out/make/zip/darwin/x64/devflow-ai-sdlc-darwin-x64-1.0.0.zip` |
| Linux DEB | `out/make/deb/x64/devflow-ai-sdlc_1.0.0_amd64.deb` |
| Linux RPM | `out/make/rpm/x64/devflow-ai-sdlc-1.0.0.x86_64.rpm` |

Packaged installers are self-contained — end users do not need Node.js installed.

---

## Tech Stack & Architecture

| Layer | Technology |
|---|---|
| Desktop shell | Electron v41 |
| Database | SQLite via `better-sqlite3` (main process) |
| IPC | `contextBridge` + `ipcMain.handle` / `ipcRenderer.invoke` |
| Renderer | Vanilla ES modules — no bundler, no framework |
| Styling | Vanilla CSS with CSS variables (Light / Dark / Midnight themes) |
| Build tooling | Electron Forge v7 |
| AI backends | Ollama HTTP, Claude CLI, Gemini CLI, Aider, OpenAI-compatible API |
| Python agent | `agent/devflow_agent.py` — agentic coding agent with plan+approve+execute loop |
| Streaming proxies | `agent/ollama_proxy.py`, `agent/openai_proxy.py` — subprocess streaming bridges |
| RAG (optional) | ChromaDB + sentence-transformers — semantic code search for agent context |
| Node.js agent | `agent-cli/index.js` — lightweight Ollama agent (alternative to Python agent) |
| E2E tests | Playwright |

### Project Structure

```
src/
  main/                    # Electron main process
    index.js               # App entry, BrowserWindow, IPC registration
    preload.js             # contextBridge — renderer ↔ main API surface
    app-config.js          # Encrypted config (API keys, cloud sync, Telegram)
    telegram.js            # Telegram notification integration
    logger.js              # Uncaught error logging
    db/
      database.js          # SQLite connection (singleton)
      schema.js            # CREATE TABLE + idempotent migrations
      migrations.js        # Named migration runner
      backup.js            # DB backup, export, restore
      ipc/                 # IPC handler modules (one per domain)
        db-handlers.js     # Projects, documents, workflows, issues, layers …
        chat-handlers.js   # AI streaming (Ollama / API / CLI)
        queue-handlers.js  # Prompt queue execution
        terminal-handlers.js  # Shell command execution + streaming
        dialog-handlers.js    # Native file/folder pickers
        ollama-handlers.js    # Ollama model detection

  renderer/                # Renderer process (SPA)
    index.html             # SPA shell
    app.js                 # Router setup + page registration
    pages/
      launcher/            # Project list / home screen
      project-home/        # Per-project dashboard + sidebar nav
      project-layers/      # Architectural layer management
      documents/           # Markdown editor + AI editing + diagrams
      mockups/             # HTML screen design generator
      workflows/           # AI workflow orchestration + runner
      issues/              # Bug & issue tracker
      git-changes/         # Multi-repo git viewer + commit UI
      ai-console/          # Project-aware AI chat
      test-generator/      # AI test generation (multi-language)
      test-runner/         # Multi-framework test runner + history
      prompt-queue/        # Batch AI prompt runner (plan + execute)
      settings/            # AI config, model mapping, templates, backup
      style-guide/         # Project design system / style token editor
    components/
      model-picker/        # AI model selector (used in page headers)
      git/                 # Git controller + diff viewer component
      quick-commands/      # Saved shell command launcher modal
      model-configs/       # Inline model config manager modal
    shared/
      router.js            # Minimal SPA page router
      helpers.js           # escHtml, timeAgo, Markdown renderer, etc.
      theme-manager.js     # Light / Dark / Midnight theme management

  # Standalone BrowserWindow pages
  workflow-runner.html     # Full-screen workflow layer execution
  queue-runner.html        # Prompt queue runner window
  task-queue.html          # Task queue window
  generate-workflows.html  # AI workflow generation window
  test-generation.html     # Test generation window

agent/                       # Python agent layer (spawned as subprocesses by Electron)
  devflow_agent.py         # Full agentic coding agent (plan + execute loop)
  agent.py                 # Provider-agnostic agent (Ollama, Anthropic, OpenAI, Groq)
  ollama_proxy.py          # Streaming proxy for Ollama models → used by all pages
  openai_proxy.py          # Streaming proxy for OpenAI-compatible API → used by all pages
  context_builder.py       # Repo map builder (file tree + class/function signatures)
  tools.py                 # Tool definitions and executors for the agentic loop
  rag.py                   # Optional RAG via ChromaDB + sentence-transformers
  providers/               # Provider abstractions (Ollama, Anthropic, OpenAI)
  requirements.txt         # Python dependencies

agent-cli/
  index.js                 # Lightweight Node.js Ollama coding agent (alternative)
```

### Database Tables

| Table | Purpose |
|---|---|
| `projects` | Top-level projects (name, path, description) |
| `project_layers` | Architectural sub-projects per project |
| `workflows` | AI workflows (feature-level task sequences) |
| `layers` | Workflow steps (purpose, inputs, outputs, prompt) |
| `success_criteria` | Acceptance criteria per workflow |
| `issues` | Bug and issue tracker entries |
| `prompt_queue` | Queued AI prompts for batch execution |
| `screen_designs` | AI-generated HTML mockups |
| `screen_prompt_history` | Mockup generation history |
| `project_documents` | Markdown documents per project |
| `document_attachments` | SVG and draw.io diagram files |
| `document_templates` | Reusable document templates |
| `model_configs` | AI model configurations and encrypted credentials |
| `model_mapping` | Page-to-model assignments |
| `test_run_history` | Test run results and output per project |
| `quick_commands` | Saved shell commands |
| `status_master` | Shared status lookup values |

### IPC Channel Groups

| Prefix | Handles |
|---|---|
| `db:*` | All database CRUD operations |
| `chat:*` | AI streaming responses (Ollama, API, CLI pipe/heredoc) |
| `queue:*` | Prompt queue run / plan / approve / cancel |
| `ollama:*` | Model detection + direct Ollama inference |
| `terminal:*` | Shell command execution and streaming output |
| `dialog:*` | Native OS file/folder pickers |
| `shell:*` | draw.io temp file open/sync, read file |
| `app:*` | Open child windows (workflow runner, queue runner, etc.) |

### Markdown Support

The Documents page and AI console support a rich subset of Markdown:

| Syntax | Output |
|---|---|
| `# H1` … `###### H6` | Headings |
| `**bold**`, `*italic*`, `~~strike~~` | Inline formatting |
| `` `code` ``, fenced ` ``` ` blocks | Code (inline and block) |
| `- item`, `1. item` | Lists (unordered and ordered) |
| `- [ ] task`, `- [x] done` | Task lists |
| `> text` | Blockquote |
| `---` | Horizontal rule |
| `\| col \| col \|` tables | Tables with header row |
| `[label](url)` | External link |
| `[label](attach:ID)` | Attachment link (renders inline SVG or draw.io badge) |
| Raw `<svg>…</svg>` blocks | Inline SVG rendering |
