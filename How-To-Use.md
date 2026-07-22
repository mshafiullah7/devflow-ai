# How to Use DevFlow AI

A first-run walkthrough for a brand-new user, in the order you'd actually touch things: configure AI once, create a project, define its structure, then work page by page through Plan → Design → Build → Test → Ship.

For a full feature reference, see [README.md](README.md). This doc is about **order of operations**, not exhaustive feature lists.

---

## Table of Contents

1. [Before Your First Project — Configure AI Models](#1-before-your-first-project--configure-ai-models)
2. [Create a Project](#2-create-a-project)
3. [Define Project Layers (and set up Git)](#3-define-project-layers-and-set-up-git)
4. [Set Up the Style Guide](#4-set-up-the-style-guide)
5. [Write Your Planning Documents](#5-write-your-planning-documents)
6. [Design Screens with Mockups](#6-design-screens-with-mockups)
7. [Turn a Mockup into Workflows](#7-turn-a-mockup-into-workflows)
8. [Run Workflows to Build the Feature](#8-run-workflows-to-build-the-feature)
9. [Generate and Run Tests](#9-generate-and-run-tests)
10. [Run Security Scans](#10-run-security-scans)
11. [Track and Fix Issues](#11-track-and-fix-issues)
12. [Day-to-Day Tools: Git Changes, Terminal, AI Chat](#12-day-to-day-tools-git-changes-terminal-ai-chat)
13. [Settings Reference](#13-settings-reference)
14. [Suggested First-Week Workflow](#14-suggested-first-week-workflow)

---

## 1. Before Your First Project — Configure AI Models

Almost every page in DevFlow AI calls an AI model, so do this first.

1. Open **Settings → AI Config**.
2. Click **Add Model** and choose a type:
   - **CLI** — wraps a command-line tool already installed and on your `PATH` (e.g. `claude`, `gemini`, `aider`, `agy`, `copilot`). Pick the model name for that tool.
   - **Ollama** — point at a local Ollama server (default `http://localhost:11434`) and pick a pulled model. Run `ollama serve` first if it isn't running.
   - **OpenAI-compatible API** — any base URL that speaks the OpenAI chat-completions format (OpenRouter, LM Studio, llama.cpp server, etc.) plus an API key.
   - **Anthropic API** — Anthropic's API directly, with your API key.
3. Save at least one model. You need this before any AI feature (Documents AI Edit, Mockups, Workflows, Test Generator, Issues, AI Chat) will work.
4. Optional — **Settings → Model Mapping**: assign a specific model to a specific page. Useful if you want a fast/cheap model for chat and a stronger model for code generation.
5. Optional — **Settings → Runner Windows**: choose whether Workflow Runner, Terminal, and Issue Runner open as in-app tabs (default) or separate pop-out windows.

You can skip Cloud Sync, Telegram, and Backup for now — they're covered in [Settings Reference](#13-settings-reference) later.

---

## 2. Create a Project

1. From the **Launcher** (the app's home screen), click **New Project**.
2. Enter a name and optional description, and optionally set start/end dates.
3. Your new project opens on the **Project Home** dashboard.

The Launcher also lists recent projects and has the app's Light/Dark/Midnight theme switcher.

---

## 3. Define Project Layers (and set up Git)

Do this before Documents, Mockups, Test Generator, or Git Changes — those pages all depend on layers existing.

Go to **Project Layers** and define the sub-projects/deployment units that make up your system (e.g. `Frontend`, `Backend API`, `Mobile App`, `Database`, `Infrastructure`).

For each layer, set:
- **Name** and **description**
- **Setup instructions** (scaffold commands, install steps, env vars, run commands) — this text is what the Test Generator uses to auto-detect the language/framework, so keep it accurate
- **Folder path** — click **Browse** and point it at the actual folder on disk for that layer. **This must already be a git repository** (or a subfolder of one) for Git Changes, Terminal's git panel, and Test Generator's git integration to work — DevFlow AI does not run `git init` for you. If the folder isn't a repo yet, initialize it in a terminal first, then point the layer at it.

**Faster option — AI generation:** if you've already written a Project Overview or architecture document (see next section), select it in Project Layers and click **Generate**. The AI reads the document and proposes a full set of layers with setup instructions per technology. Review and adjust folder paths afterward — the AI can't know your actual disk layout.

Layers feed into almost everything else: Workflows, Test Generator, Git Changes, Issues, Security Scans.

---

## 4. Set Up the Style Guide

Go to **Styles** (Style Guide page) and define the visual language AI-generated Mockups should follow: color palette, typography, and component specs, separately for Light and Dark themes, with an optional target platform (web/mobile).

- Start from a built-in preset (e.g. "DevFlow Default", "Ocean Blue") and edit it, or write your own from scratch.
- Use the interactive preview to check it before relying on it.

This step is optional but worth doing before Mockups — whatever you save here gets injected into every mockup generation prompt, so mockups will match your product's look from the first screen instead of needing manual restyling later.

---

## 5. Write Your Planning Documents

Go to **Documents** and create your first document — typically a **Project Overview** or **PRD**. Use the template picker if you want a starting structure (manage templates in Settings).

- Write directly in Markdown (Edit tab, `Ctrl+S` to save), or use the **AI Edit** panel to have the AI draft/revise content — it reads any attached diagrams as context.
- Attach SVGs (paste or browse code) or draw.io diagrams for architecture visuals; draw.io attachments round-trip through the desktop draw.io app via **Open in draw.io → edit → Sync**.
- Export any document to PDF when you need to share it outside the app.

Typical documents to write early: Project Overview, PRD, Architecture Decision Records, Database Schema — these become the AI context source for Project Layers generation (step 3) and Generate Workflows (step 7).

---

## 6. Design Screens with Mockups

Once you know roughly what you're building, go to **Mockups** to generate screen designs.

1. Pick a starting point from **30+ built-in templates** (Authentication, Dashboards, E-Commerce, Social, Finance, Healthcare, Education, Settings, Onboarding, etc.), or describe a screen from scratch.
2. Generate — the AI produces an HTML/CSS mockup, using your saved Style Guide automatically.
3. Preview live in-app. Iterate with follow-up chat-style prompts.

Mockups are generated one at a time, not in bulk. A mockup can later be linked to a Workflow to scope AI generation to that specific screen.

---

## 7. Turn a Mockup into Workflows

Once a mockup looks right, go to **Generate Workflows** (reachable from the Workflows page's Generate button) to turn it into an implementation plan in one AI call:

- **Workflow 1 — UI Shell**: the mockup converted into real, static UI code (no backend wiring yet).
- **One workflow per discrete feature** found in the screen, each ending in a **Wire Up** step (connects the static UI to real logic) and an **Integration Build & Fix** step.
- Every generated workflow step is scoped to your actual Project Layers — set those up first (step 3) or generation will have nothing correct to target.

You can also skip AI generation and build a Workflow manually on the **Workflows** page: name it, add layers (steps) with purpose/inputs/outputs/prompt, and drag-and-drop to reorder.

---

## 8. Run Workflows to Build the Feature

On the **Workflows** page, open the workflow you just generated (or wrote manually):

- Run one step at a time — a preview drawer shows the purpose and prompt before it executes.
- Or click **Run All** to execute every step in sequence with live streaming output and automatic "Run Next" chaining. This opens as an in-app tab by default (change to a pop-out window in **Settings → Runner Windows**).
- A navigation guard stops you from accidentally leaving mid-run.
- Use the **Success Criteria** tab to record what "done" means for the workflow, so you (or the AI) can verify it afterward.

After a run, check **Git Changes** (step 12) to review and commit what the AI wrote.

---

## 9. Generate and Run Tests

Go to **Test Generator**, pick a layer, and generate tests — the AI detects the language/framework from that layer's setup instructions (Flutter, Python, .NET, Java/Kotlin, Go, Ruby, or defaults to Jest/TS) and writes appropriate unit or widget/UI tests.

The same page runs them: set (or auto-detect) the test command, run it, and watch live streaming output. Results are auto-parsed for Cypress, Jest, Flutter, Playwright, pytest, Go test, RSpec, MSTest, Vitest, and PHPUnit, with pass/fail/skip counts and run history retained per project.

---

## 10. Run Security Scans

Go to **Security Scans**, pick a layer, and run a scan (auto-detected command, or provide your own). Results are parsed into critical/high/medium/low severity counts, with history retained so you can track trend over time. Do this periodically, not just once — re-run after significant Workflow runs.

---

## 11. Track and Fix Issues

Go to **Issues** to log bugs, features, or changes as they come up (`Type` field: Bug / Feature / Change). Fill in severity, steps to reproduce, expected vs. actual behavior, and optionally associate the issue with a Project Layer.

- Use **AI-assisted analysis** on an individual issue for next-step suggestions.
- To fix several open issues in a batch, use the **Issue Runner** (button on the Issues page, or its own tab/window per Settings → Runner Windows). Filter by status, then run one issue or **Run All** — each gets its own live terminal-style output and timer.

---

## 12. Day-to-Day Tools: Git Changes, Terminal, AI Chat

These are the tools you'll come back to constantly once the project is underway, not one-time setup steps:

- **Git Changes** — see changed files across every layer (each layer = its own repo) from one screen, view inline diffs, stage/unstage, and commit. Save frequently-used shell commands in the **Quick Commands** modal (also editable from Settings).
- **Terminal** — an embedded real shell (via `xterm.js`/`node-pty`) scoped to a project/layer, with a side git panel for a quick status check without leaving the terminal. Opens as a tab or pop-out per Settings → Runner Windows.
- **AI Chat** (AI Console) — project-aware conversational AI using **Smart Context**: the model writes `SELECT` queries against a minimal schema of your project data (projects, issues, workflows, layers, documents, mockups) and only the query results are sent back, not your whole database. A live query log and privacy warning show you exactly what was fetched before it's shared with a cloud model.

---

## 13. Settings Reference

Beyond the AI Config covered in step 1:

| Section | What it's for | When you need it |
|---|---|---|
| **Model Mapping** | Assign a specific AI model per page | Once you have 2+ models and want cost/quality control |
| **Runner Windows** | Tab vs. pop-out window for Workflow Runner, Terminal, Issue Runner | Personal preference, anytime |
| **Document Templates** | Create/edit/reorder templates used in Documents | Before writing your first set of docs, or as you standardize |
| **Cloud Sync** | Configure a remote backup destination | When you want off-machine backup of the SQLite database |
| **Telegram** | Bot notifications for Workflow Runner / Issue Runner completion | If you want to walk away from long AI runs and get pinged |
| **Backup** | Export, restore, or back up the SQLite database | Before major changes, or on a regular cadence |
| **Quick Commands** | Saved shell commands used in Git Changes | Once you have repeatable git/build commands you run often |

> Note: the AI Config "type" values are `cli`, `ollama`, `api`, and `anthropic` — "Claude CLI," "Gemini CLI," and "Aider" are all the `cli` type, distinguished only by which executable name you enter.

---

## 14. Suggested First-Week Workflow

A concrete path for a brand-new project, tying the above together in order:

1. **Settings → AI Config** — add at least one model.
2. **New Project** from the Launcher.
3. **Documents** — write a short Project Overview.
4. **Project Layers** — generate layers from that overview, then fix folder paths to point at real (git-initialized) folders on disk.
5. **Styles** — pick or tweak a preset.
6. **Mockups** — generate your first screen.
7. **Generate Workflows** from that mockup.
8. **Workflows** — Run All, then review the diff in **Git Changes** and commit.
9. **Test Generator** — generate and run tests for the layer you just touched.
10. **Security Scans** — run a baseline scan.
11. Repeat 6–10 per screen/feature; use **Issues** + **Issue Runner** to track and batch-fix anything that comes up along the way.
