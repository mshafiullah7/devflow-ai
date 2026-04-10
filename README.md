# electron-ai-sdlc

AI-assisted Software Development Lifecycle management — Electron desktop app using SQLite (no bundler, plain ES modules).

---

## Running the App

```
npm start
```

---

## Features

### Projects

- Create, rename, and delete projects from the home screen.
- Recent projects are listed on the dashboard (last 5 opened).
- Each project has a name and optional description.

---

### Features & User Stories

- Each project contains **Features**, each feature contains **User Stories**.
- User stories have: Title, Description, Acceptance Criteria, Prompt, and Status.
- Status values: Backlog, In Progress, Implemented, In Review, Tested, Done.

---

### User Story Detail — Prompt (Edit / Preview)

- Click a user story to open the detail panel.
- The **Prompt** field has two tabs: **Edit** and **Preview**.
- Preview renders the prompt as Markdown (headings, bold, italic, code blocks, lists, links, etc.).
- Closing the popup works only via the **×** button or title bar — clicking outside does nothing.

---

### Documents

- Click the **Documents** button (top-right of project page, next to AI Model selector) to open the Documents modal.
- Documents are stored per-project in SQLite (`project_documents` table).

#### Creating a Document
- Click **New** in the sidebar.
- Choose a template from the picker:
  - **Empty Document** — blank page
  - **Project Overview** — purpose, goals, stakeholders, timeline
  - **Technical Specification** — architecture, components, API, data model
  - **Meeting Notes** — agenda, discussion, decisions, action items
  - **Release Notes** — new features, bug fixes, breaking changes
- Document title and content are editable. Press `Ctrl+S` or click **Save**.

#### Edit / Preview Tabs
- **Edit** — write content in Markdown.
- **Preview** — rendered Markdown view with syntax-highlighted headings, code blocks, lists, tables, blockquotes, etc.

#### Deleting a Document
- Hover a document in the sidebar → click the trash icon.

---

### Document Attachments (SVG & draw.io)

Attachments are stored in SQLite (`document_attachments` table). Each attachment belongs to a document.

#### Adding an Attachment
- Open the **Attachments** bar at the bottom of the editor (click to expand).
- Click **Add SVG** or **Add draw.io**.
- Enter a name and paste the SVG/XML code → click **Add**.

#### Referencing an Attachment in Markdown
- Each attachment shows its reference ID: `attach:ID`
- Use in Markdown: `[My Diagram](attach:12)` — renders as a clickable badge in Preview.
- Clicking the badge opens the attachment in the lightbox.

#### SVG Attachments
- **View** — opens the SVG in a lightbox (isolated from app CSS, renders correctly).
- **Delete** — removes the attachment.

#### draw.io Attachments
- **View** — shows an info card with an **Open in draw.io** button (draw.io XML cannot be previewed inline).
- **Open in draw.io** — writes the file to a temp folder and opens it in the draw.io desktop app.
- **Sync** — after editing in draw.io desktop, click Sync to read the saved file back and update the database.
  - If draw.io hasn't been opened yet in the current session, Sync shows a reminder toast.
- **Delete** — removes the attachment.

#### Sync Workflow for draw.io
1. Click **Open in draw.io** → diagram opens in draw.io desktop.
2. Edit and **save** in draw.io (`Ctrl+S`).
3. Return to the app and click **Sync** → changes are saved to the database.

---

### Markdown Supported Syntax (in Prompt Preview and Document Preview)

| Syntax | Result |
|--------|--------|
| `# Heading` .. `###### Heading` | H1–H6 |
| `**bold**` | Bold |
| `*italic*` | Italic |
| `~~text~~` | Strikethrough |
| `` `code` `` | Inline code |
| ` ``` ` fenced block | Code block |
| `- item` / `* item` | Unordered list |
| `1. item` | Ordered list |
| `> text` | Blockquote |
| `---` | Horizontal rule |
| `[label](url)` | Hyperlink |
| `[label](attach:ID)` | Attachment link (opens lightbox) |

---

### Quick Commands

- Reusable prompt snippets accessible from the user story panel.
- Create, edit, and delete quick commands from the settings/commands panel.

---

### Terminal

- Built-in terminal panel for running commands.
- Supports starting long-running processes and killing them.
- `Ctrl+C` / Kill Active stops the running process.

---

## Database

- SQLite via `better-sqlite3`, stored locally.
- Tables: `projects`, `features`, `user_stories`, `prompt_history`, `status_master`, `quick_commands`, `document_templates`, `project_documents`, `document_attachments`.
- Migrations run automatically on startup — no manual steps needed.

---

## Tech Stack

- **Electron** (no bundler — plain `file://` ES modules)
- **better-sqlite3** (synchronous SQLite in main process)
- **IPC** via `contextBridge` / `ipcMain.handle` / `ipcRenderer.invoke`
- No external UI frameworks or CSS libraries
