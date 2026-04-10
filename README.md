# devflow-ai-sdlc

AI-assisted Software Development Lifecycle (SDLC) management desktop app. Manage projects, features, user stories, prompts, and documents — all stored locally with no cloud dependency.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Features](#features)
3. [Markdown Reference](#markdown-reference)
4. [Developer Setup](#developer-setup)
5. [Building Executables](#building-executables)
6. [Tech Stack & Architecture](#tech-stack--architecture)

---

## What It Does

- Organise work into **Projects → Features → User Stories**.
- Write and track AI **Prompts** per user story with Markdown preview.
- Create rich **Documents** per project using Markdown with templates.
- Attach **SVG diagrams** and **draw.io diagrams** directly to documents.
- Run terminal commands from within the app.
- Everything stored **locally in SQLite** — no internet or account required.

---

## Features

### Projects

- Create, rename, and delete projects from the home screen.
- Recent projects listed on the dashboard (last 5 opened).
- Each project has a name and optional description.

---

### Features & User Stories

- Each project contains **Features**; each feature contains **User Stories**.
- User stories have: Title, Description, Acceptance Criteria, Prompt, and Status.
- Status values: Backlog · In Progress · Implemented · In Review · Tested · Done.

---

### User Story Detail

- Click a user story to open the detail panel.
- Fields: **Description**, **Acceptance Criteria**, **Prompt**.
- Each field opens in a popup with **Edit** and **Preview** tabs.
- Preview renders the content as Markdown.
- Popup closes only via the **×** button — clicking outside does nothing.

---

### Documents

- Click **Documents** (top-right of project page, next to AI Model selector) to open the Documents modal.
- Documents belong to a project and are stored in SQLite.

#### Creating a Document
- Click **New** in the sidebar → choose a template:

| Template | Contents |
|----------|----------|
| Empty Document | Blank page |
| Project Overview | Purpose, goals, stakeholders, timeline |
| Technical Specification | Architecture, components, API design, data model |
| Meeting Notes | Agenda, discussion, decisions, action items |
| Release Notes | New features, bug fixes, breaking changes |

- Edit the title inline. Press `Ctrl+S` or click **Save** to persist.

#### Edit / Preview Tabs
- **Edit** — write content in Markdown.
- **Preview** — rendered view with styled headings, code blocks, lists, blockquotes, and attachment links.

#### Deleting a Document
- Hover a document in the sidebar → click the trash icon.

---

### Document Attachments (SVG & draw.io)

Attachments are stored in SQLite and linked inside Markdown content.

#### Adding an Attachment
1. Open the **Attachments** bar at the bottom of the editor (click to expand).
2. Click **Add SVG** or **Add draw.io**.
3. Enter a name and paste the SVG/XML code → click **Add**.

#### Referencing in Markdown
- Each attachment shows its ID as `attach:ID`.
- Use in Markdown: `[My Diagram](attach:12)`
- In Preview this renders as a clickable badge → opens the diagram lightbox.

#### SVG Attachments

| Button | Action |
|--------|--------|
| View | Opens SVG in a lightbox (isolated from app CSS) |
| Delete | Removes the attachment |

#### draw.io Attachments

| Button | Action |
|--------|--------|
| View | Shows info card — draw.io XML cannot be previewed inline. Includes an **Open in draw.io** button. |
| Open in draw.io | Writes file to a temp folder and opens in draw.io desktop app |
| Sync | Reads the saved temp file back and updates the database |
| Delete | Removes the attachment |

#### draw.io Edit & Sync Workflow
1. Click **Open in draw.io** → diagram opens in draw.io desktop.
2. Edit and save in draw.io (`Ctrl+S`).
3. Return to the app → click **Sync** → changes saved to database.
- If draw.io has not been opened in the current session, Sync shows a reminder toast.

---

### Quick Commands

- Reusable prompt snippets accessible from the user story panel.
- Create, edit, and delete quick commands from the settings/commands panel.

---

### Terminal

- Built-in terminal panel for running shell commands.
- Supports long-running processes.
- Kill Active / `Ctrl+C` stops the running process.

---

## Markdown Reference

Supported in both Prompt preview and Document preview:

| Syntax | Output |
|--------|--------|
| `# H1` through `###### H6` | Headings |
| `**bold**` | **Bold** |
| `*italic*` | *Italic* |
| `~~text~~` | ~~Strikethrough~~ |
| `` `code` `` | Inline code |
| ` ``` ` fenced block | Code block |
| `- item` or `* item` | Unordered list |
| `1. item` | Ordered list |
| `> text` | Blockquote |
| `---` | Horizontal rule |
| `[label](url)` | Hyperlink |
| `[label](attach:ID)` | Attachment link (opens lightbox) |

---

## Developer Setup

### Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | 18+ LTS | https://nodejs.org |
| **npm** | comes with Node.js | — |
| **Python** | 3.x | https://python.org — required to compile `better-sqlite3` |
| **Visual Studio Build Tools** *(Windows only)* | 2019 or 2022 | https://visualstudio.microsoft.com/visual-cpp-build-tools/ — select "Desktop development with C++" workload |
| **draw.io Desktop** *(optional)* | latest | https://github.com/jgraph/drawio-desktop/releases — only needed for editing draw.io attachments |

> **macOS / Linux:** Python and a C++ compiler (Xcode CLT / gcc) are usually pre-installed. Visual Studio is not needed.

---

### Install & Run

```bash
# 1. Clone the repo
git clone <repo-url>
cd electron-ai-sdlc

# 2. Install dependencies (also compiles better-sqlite3 native module)
npm install

# 3. Start the app
npm start
```

> **If `npm install` fails on `better-sqlite3`** — ensure Python and Visual Studio Build Tools are installed, then:
> ```bash
> npm install --build-from-source
> ```

---

### Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start the app in development mode |
| `npm run package` | Bundle app + Electron binary into `out/` |
| `npm run make` | Build a platform installer from the package |

---

### First Run Notes

- SQLite database is created automatically on first launch (stored in the OS app-data folder).
- All table migrations run on startup — no manual DB setup needed.
- Default seed data is inserted once: status values and document templates.

---

## Building Executables

> You must build on the **target platform**. Cross-platform builds are not supported (e.g. cannot build a macOS `.dmg` from Windows).

---

### Step 1 — Package

Bundles source + Electron binary into a folder.

```bash
npm run package
```

Output: `out/electron-ai-sdlc-<platform>-<arch>/`

---

### Step 2 — Make Installer

Creates the platform installer from the packaged output.

```bash
npm run make
```

Output: `out/make/`

---

### Platform Outputs

#### Windows
```bash
npm run make
```
- Output: `out/make/squirrel.windows/x64/electron-ai-sdlc Setup.exe`
- Requires Visual Studio Build Tools for native module compilation.

#### macOS
```bash
npm run make
```
- Output: `out/make/zip/darwin/x64/electron-ai-sdlc-darwin-x64-1.0.0.zip`
- For a signed `.dmg`, configure `packagerConfig.osxSign` and `osxNotarize` in `forge.config.js`.

#### Linux
```bash
npm run make
```
- DEB: `out/make/deb/x64/electron-ai-sdlc_1.0.0_amd64.deb`
- RPM: `out/make/rpm/x64/electron-ai-sdlc-1.0.0.x86_64.rpm`

```bash
# Install DEB
sudo dpkg -i electron-ai-sdlc_1.0.0_amd64.deb

# Install RPM
sudo rpm -i electron-ai-sdlc-1.0.0.x86_64.rpm
```

---

### Maker Reference (`forge.config.js`)

| Maker | Platform | Output |
|-------|----------|--------|
| `maker-squirrel` | Windows | `.exe` installer |
| `maker-zip` | macOS | `.zip` archive |
| `maker-deb` | Linux | `.deb` package |
| `maker-rpm` | Linux | `.rpm` package |

- `asar: true` — bundles all source into an `.asar` archive inside the installer.
- `plugin-auto-unpack-natives` — automatically rebuilds `better-sqlite3` for the correct Electron version. No manual rebuild needed.

---

## Tech Stack & Architecture

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron v41 |
| Database | SQLite via `better-sqlite3` (runs in main process) |
| IPC | `contextBridge` + `ipcMain.handle` + `ipcRenderer.invoke` |
| Renderer | Plain ES modules (`file://`) — no bundler, no framework |
| Styling | Vanilla CSS with CSS variables (dark/light theme) |
| Build tooling | Electron Forge v7 |

### Database Tables

| Table | Purpose |
|-------|---------|
| `projects` | Top-level projects |
| `features` | Features per project |
| `user_stories` | User stories per feature |
| `prompt_history` | History of prompts run per user story |
| `status_master` | Shared status values (Backlog, Done, etc.) |
| `quick_commands` | Reusable prompt snippets |
| `document_templates` | Built-in Markdown templates |
| `project_documents` | Documents per project |
| `document_attachments` | SVG / draw.io files attached to documents |

### IPC Channels

- `db:*` — all database read/write operations
- `shell:openDrawio` — write temp `.drawio` file and open in desktop app
- `shell:readFile` — read a file path (used for draw.io Sync)
- `terminal:*` — terminal execution and streaming output
- `dialog:*` — native OS file/folder pickers
- `window:expand` — resize the app window
