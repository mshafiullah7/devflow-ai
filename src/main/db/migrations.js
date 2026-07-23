'use strict';

/**
 * Seeds the status_master table with default values (only if empty).
 * @param {import('better-sqlite3').Database} db
 */
function seedStatuses(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM status_master').get().c;
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO status_master (name, sort_order) VALUES (?, ?)'
  );
  const statuses = [
    ['Backlog', 1],
    ['In Progress', 2],
    ['Implemented', 3],
    ['In Review', 4],
    ['Tested', 5],
    ['Done', 6],
  ];
  const insertMany = db.transaction((rows) => {
    for (const [name, sort_order] of rows) insert.run(name, sort_order);
  });
  insertMany(statuses);
}

/**
 * Runs incremental migrations for existing databases.
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
  // Add last_opened_at to projects if it doesn't exist yet
  const cols = db.prepare('PRAGMA table_info(projects)').all().map((c) => c.name);
  if (!cols.includes('last_opened_at')) {
    db.exec('ALTER TABLE projects ADD COLUMN last_opened_at TEXT');
  }
  if (!cols.includes('project_path')) {
    db.exec('ALTER TABLE projects ADD COLUMN project_path TEXT');
  }

  // no-op: prompt_history removed in v2 architecture

  // Add quick_commands table for existing databases
  const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!allTables.includes('quick_commands')) {
    db.exec(`
      CREATE TABLE quick_commands (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        command     TEXT    NOT NULL,
        description TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add project_documents table for existing databases
  const allTables2 = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!allTables2.includes('project_documents')) {
    db.exec(`
      CREATE TABLE project_documents (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title      TEXT    NOT NULL,
        content    TEXT,
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add document_templates table for existing databases
  const allTables3 = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!allTables3.includes('document_templates')) {
    db.exec(`
      CREATE TABLE document_templates (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL UNIQUE,
        description   TEXT,
        template_text TEXT    NOT NULL DEFAULT '',
        sort_order    INTEGER NOT NULL DEFAULT 0,
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
    seedDocumentTemplates(db);
  } else {
    // Ensure default templates exist in case they were never seeded
    seedDocumentTemplates(db);
  }

  // no-op: prompts table removed in v2 architecture

  // Add queued/executed to screen_designs
  const sdCols = db.prepare('PRAGMA table_info(screen_designs)').all().map(c => c.name);
  if (!sdCols.includes('queued')) {
    db.exec('ALTER TABLE screen_designs ADD COLUMN queued INTEGER NOT NULL DEFAULT 0');
  }
  if (!sdCols.includes('executed')) {
    db.exec('ALTER TABLE screen_designs ADD COLUMN executed INTEGER NOT NULL DEFAULT 0');
  }

  // no-op: prompts and user_stories removed in v2 architecture

  // Add screen_prompt_history table for existing databases
  const sphCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='screen_prompt_history'").get();
  if (!sphCheck) {
    db.exec(`
      CREATE TABLE screen_prompt_history (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        screen_design_id  INTEGER REFERENCES screen_designs(id) ON DELETE CASCADE,
        prompt            TEXT    NOT NULL,
        is_active         INTEGER NOT NULL DEFAULT 1,
        executed_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  } else {
    const sphCols = db.prepare("PRAGMA table_info(screen_prompt_history)").all().map(c => c.name);
    if (!sphCols.includes('screen_design_id')) {
      db.exec('ALTER TABLE screen_prompt_history ADD COLUMN screen_design_id INTEGER REFERENCES screen_designs(id) ON DELETE CASCADE');
    }
  }

  // Add issues table for existing databases, or recreate it if it still has
  // stale FK columns (feature_id / user_story_id) referencing dropped tables.
  const issuesCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='issues'").get();
  if (!issuesCheck) {
    db.exec(`
      CREATE TABLE issues (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        layer_id            INTEGER REFERENCES project_layers(id) ON DELETE SET NULL,
        title               TEXT    NOT NULL,
        description         TEXT,
        steps_to_reproduce  TEXT,
        expected_behavior   TEXT,
        actual_behavior     TEXT,
        severity            TEXT    NOT NULL DEFAULT 'medium',
        status              TEXT    NOT NULL DEFAULT 'open',
        is_active           INTEGER NOT NULL DEFAULT 1,
        created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  } else {
    const issuesCols = db.prepare('PRAGMA table_info(issues)').all().map(c => c.name);
    if (issuesCols.includes('feature_id') || issuesCols.includes('user_story_id')) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        ALTER TABLE issues RENAME TO issues_old;
        CREATE TABLE issues (
          id                  INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          layer_id            INTEGER REFERENCES project_layers(id) ON DELETE SET NULL,
          title               TEXT    NOT NULL,
          description         TEXT,
          steps_to_reproduce  TEXT,
          expected_behavior   TEXT,
          actual_behavior     TEXT,
          severity            TEXT    NOT NULL DEFAULT 'medium',
          status              TEXT    NOT NULL DEFAULT 'open',
          is_active           INTEGER NOT NULL DEFAULT 1,
          created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO issues (id, project_id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, status, is_active, created_at, updated_at)
          SELECT id, project_id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, status, is_active, created_at, updated_at
          FROM issues_old;
        DROP TABLE issues_old;
        PRAGMA foreign_keys = ON;
      `);
    }
  }

  // Add test_run_history table for existing databases
  const trhCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_run_history'").get();
  if (!trhCheck) {
    db.exec(`
      CREATE TABLE test_run_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        framework  TEXT,
        command    TEXT    NOT NULL,
        passed     INTEGER,
        failed     INTEGER,
        skipped    INTEGER,
        duration   TEXT,
        exit_code  INTEGER NOT NULL DEFAULT 0,
        ran_at     TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add output column to test_run_history for existing databases
  const trhCols = db.prepare('PRAGMA table_info(test_run_history)').all().map(c => c.name);
  if (trhCols.length > 0 && !trhCols.includes('output')) {
    db.exec('ALTER TABLE test_run_history ADD COLUMN output TEXT');
  }

  // Add saved_themes table for existing databases
  const allTablesST = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!allTablesST.includes('saved_themes')) {
    db.exec(`
      CREATE TABLE saved_themes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        light      TEXT    NOT NULL DEFAULT '',
        dark       TEXT    NOT NULL DEFAULT '',
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add document_attachments table for existing databases
  const allTables4 = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!allTables4.includes('document_attachments')) {
    db.exec(`
      CREATE TABLE document_attachments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
        name        TEXT    NOT NULL,
        type        TEXT    NOT NULL DEFAULT 'svg',
        content     TEXT    NOT NULL DEFAULT '',
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add model_mapping table for existing databases
  const mmCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='model_mapping'").get();
  if (!mmCheck) {
    db.exec(`
      CREATE TABLE model_mapping (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        page_key         TEXT    NOT NULL UNIQUE,
        model_config_id  INTEGER REFERENCES model_configs(id) ON DELETE SET NULL,
        updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add error_logs table for persistent error tracking
  const elCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='error_logs'").get();
  if (!elCheck) {
    db.exec(`
      CREATE TABLE error_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        source     TEXT    NOT NULL,
        message    TEXT    NOT NULL,
        stack      TEXT,
        context    TEXT,
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add screen_templates table for existing databases
  const stCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='screen_templates'").get();
  if (!stCheck) {
    db.exec(`
      CREATE TABLE screen_templates (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name  TEXT    NOT NULL DEFAULT 'General',
        name        TEXT    NOT NULL UNIQUE,
        description TEXT    NOT NULL DEFAULT '',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add fallback AI columns to model_configs for devflow-agent support
  const mcCols = db.prepare('PRAGMA table_info(model_configs)').all().map(c => c.name);
  if (!mcCols.includes('gemini_api_key')) {
    db.exec('ALTER TABLE model_configs ADD COLUMN gemini_api_key TEXT');
  }
  if (!mcCols.includes('claude_api_key')) {
    db.exec('ALTER TABLE model_configs ADD COLUMN claude_api_key TEXT');
  }
  if (!mcCols.includes('fallback_preference')) {
    db.exec("ALTER TABLE model_configs ADD COLUMN fallback_preference TEXT DEFAULT 'auto'");
  }
  if (!mcCols.includes('use_devflow_agent')) {
    db.exec('ALTER TABLE model_configs ADD COLUMN use_devflow_agent INTEGER NOT NULL DEFAULT 0');
  }

  // Explicit effort/purpose fields — replaces regex-guessing a model's tier/purpose
  // from its label (see generate-workflows-page.js's pickLightModel), which broke
  // once two config names happened to share a keyword. New rows get the column
  // defaults; existing seeded rows are backfilled explicitly by label below rather
  // than with another LIKE/regex guess, which would just reintroduce the same
  // fragility this change removes.
  if (!mcCols.includes('effort'))  db.exec("ALTER TABLE model_configs ADD COLUMN effort  TEXT NOT NULL DEFAULT 'medium'");
  if (!mcCols.includes('purpose')) db.exec("ALTER TABLE model_configs ADD COLUMN purpose TEXT NOT NULL DEFAULT 'general'");

  const effortPurposeByLabel = {
    'Claude Haiku General Purpose':          ['low',    'general'],
    'Claude Sonnet General Purpose':         ['medium', 'general'],
    'Claude Haiku Code':                     ['low',    'coding'],
    'Claude Sonnet Code':                    ['medium', 'coding'],
    'Gemini Flash Medium General Purpose':   ['low',    'general'],
    'Gemini Flash High General Purpose':     ['medium', 'general'],
    'Gemini Flash Medium Code':              ['low',    'coding'],
    'Gemini Flash High Code':                ['medium', 'coding'],
    'Ollama General Purpose':                ['low',    'general'],
    'Ollama Code':                           ['low',    'coding'],
    'Groq General Purpose':                  ['low',    'general'],
    'Groq Code':                             ['low',    'coding'],
    '[API] Claude Haiku General Purpose':    ['low',    'general'],
    '[API] Claude Sonnet 5 General Purpose': ['medium', 'general'],
    '[API] Claude Sonnet 5 Code':            ['medium', 'coding'],
    'Groq Code (DeepSeek R1 70B)':           ['high',   'coding'],
    'Ollama Code (DeepSeek Coder V2)':       ['medium', 'coding'],
  };
  const backfillEffortPurpose = db.prepare(
    `UPDATE model_configs SET effort = ?, purpose = ? WHERE label = ?`
  );
  db.transaction(() => {
    for (const [label, [effort, purpose]] of Object.entries(effortPurposeByLabel)) {
      backfillEffortPurpose.run(effort, purpose, label);
    }
  })();

  // Recreate prompt_queue if it still has stale FKs to dropped tables (prompts, user_stories)
  const pqSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='prompt_queue'").get()?.sql ?? '';
  if (pqSql.includes('REFERENCES prompts') || pqSql.includes('REFERENCES user_stories')) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      ALTER TABLE prompt_queue RENAME TO prompt_queue_old;
      CREATE TABLE prompt_queue (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_story_id INTEGER,
        story_title   TEXT,
        prompt_id     INTEGER,
        tag           TEXT,
        prompt_text   TEXT    NOT NULL,
        status        TEXT    NOT NULL DEFAULT 'pending',
        output        TEXT,
        exit_code     INTEGER,
        model_label   TEXT,
        commit_sha    TEXT,
        sort_order    INTEGER NOT NULL DEFAULT 0,
        layer_id      INTEGER REFERENCES project_layers(id) ON DELETE SET NULL,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        ran_at        TEXT
      );
      INSERT INTO prompt_queue (id, project_id, user_story_id, story_title, prompt_id, tag, prompt_text, status, output, exit_code, model_label, sort_order, created_at, ran_at)
        SELECT id, project_id, user_story_id, story_title, prompt_id, tag, prompt_text, status, output, exit_code, model_label, sort_order, created_at, ran_at
        FROM prompt_queue_old;
      DROP TABLE prompt_queue_old;
      PRAGMA foreign_keys = ON;
    `);
  }

  // Add commit_sha / layer_id / source / issue_id to prompt_queue for existing databases
  const pqCols = db.prepare('PRAGMA table_info(prompt_queue)').all().map(c => c.name);
  if (!pqCols.includes('commit_sha')) {
    db.exec('ALTER TABLE prompt_queue ADD COLUMN commit_sha TEXT');
  }
  if (!pqCols.includes('source')) {
    db.exec("ALTER TABLE prompt_queue ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  }
  if (!pqCols.includes('issue_id')) {
    db.exec('ALTER TABLE prompt_queue ADD COLUMN issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL');
  }

  // Ensure prompt_queue_messages exists and its FK points to prompt_queue (not prompt_queue_old).
  // When the rename migration above ran, SQLite 3.26+ rewrote the FK reference in
  // prompt_queue_messages from "prompt_queue" to "prompt_queue_old". After DROP TABLE
  // prompt_queue_old the FK became dangling, causing "no such table: main.prompt_queue_old"
  // on any access to prompt_queue_messages.
  const pqmRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='prompt_queue_messages'").get();
  if (!pqmRow) {
    // Table missing entirely in older databases — create it fresh
    db.exec(`
      CREATE TABLE prompt_queue_messages (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_item_id INTEGER NOT NULL REFERENCES prompt_queue(id) ON DELETE CASCADE,
        role          TEXT    NOT NULL,
        content       TEXT    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  } else if ((pqmRow.sql || '').includes('prompt_queue_old')) {
    // FK was rewritten to point at the now-dropped prompt_queue_old — rebuild the table
    db.exec(`
      PRAGMA foreign_keys = OFF;
      ALTER TABLE prompt_queue_messages RENAME TO prompt_queue_messages_old;
      CREATE TABLE prompt_queue_messages (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_item_id INTEGER NOT NULL REFERENCES prompt_queue(id) ON DELETE CASCADE,
        role          TEXT    NOT NULL,
        content       TEXT    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO prompt_queue_messages (id, queue_item_id, role, content, created_at)
        SELECT id, queue_item_id, role, content, created_at
        FROM prompt_queue_messages_old;
      DROP TABLE prompt_queue_messages_old;
      PRAGMA foreign_keys = ON;
    `);
  }

  // ---- v2 architecture: drop old user-story tables, create workflow tables ----
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS prompt_history;
    DROP TABLE IF EXISTS acceptance_criteria;
    DROP TABLE IF EXISTS prompts;
    DROP TABLE IF EXISTS test_cases;
    DROP TABLE IF EXISTS user_stories;
    DROP TABLE IF EXISTS features;
    DROP TABLE IF EXISTS features_log;
    DROP TABLE IF EXISTS user_stories_log;
    DROP TRIGGER IF EXISTS trg_features_insert;
    DROP TRIGGER IF EXISTS trg_features_update;
    DROP TRIGGER IF EXISTS trg_features_delete;
    DROP TRIGGER IF EXISTS trg_user_stories_insert;
    DROP TRIGGER IF EXISTS trg_user_stories_update;
    DROP TRIGGER IF EXISTS trg_user_stories_delete;
    PRAGMA foreign_keys = ON;
  `);

  const v2Tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  if (!v2Tables.includes('workflows')) {
    db.exec(`
      CREATE TABLE workflows (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        workflow_id TEXT    NOT NULL,
        feature     TEXT    NOT NULL,
        description TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE success_criteria (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        description TEXT    NOT NULL,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE layers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        layer       TEXT    NOT NULL,
        order_num   INTEGER NOT NULL DEFAULT 1,
        purpose     TEXT,
        inputs      TEXT,
        outputs     TEXT,
        prompt      TEXT,
        is_active   INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  // Add project_layer_id to layers for existing databases
  const layerCols = db.prepare("PRAGMA table_info(layers)").all().map(c => c.name);
  if (!layerCols.includes('project_layer_id')) {
    db.exec('ALTER TABLE layers ADD COLUMN project_layer_id INTEGER REFERENCES project_layers(id) ON DELETE SET NULL');
  }

  // Add screen_design_id to workflows for existing databases
  const wfCols = db.prepare("PRAGMA table_info(workflows)").all().map(c => c.name);
  if (!wfCols.includes('screen_design_id')) {
    db.exec('ALTER TABLE workflows ADD COLUMN screen_design_id INTEGER REFERENCES screen_designs(id) ON DELETE SET NULL');
  }

  // Add scaffold_structure to project_layers for existing databases
  const plCols = db.prepare("PRAGMA table_info(project_layers)").all().map(c => c.name);
  if (!plCols.includes('scaffold_structure')) {
    db.exec('ALTER TABLE project_layers ADD COLUMN scaffold_structure TEXT');
  }

  // Remove obsolete templates; 'Solution Architecture' is seeded separately via seedDocumentTemplates
  const tplTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_templates'").get();
  if (tplTables) {
    db.prepare(`DELETE FROM document_templates WHERE name IN ('Technical Specification', 'Meeting Notes', 'Release Notes', 'Tasks', 'Tech Stack', 'Architecture Overview')`).run();

    // Update Project Overview template to MacroStore project context
    const newProjectOverview = `# MacroStore Movie App — Project Context\n\n## Overview\nTwo-role (Admin/User) movie catalogue with approval-based registration,\nsearch, and CRUD management. Runs on-prem, IIS hosted, Oracle 19c database.\n\n**In scope:** registration with admin approval, movie CRUD, movie search  \n**Out of scope:** payments, media hosting, mobile app\n\n---\n\n## Users & Roles\n\n| Role  | Capabilities                              |\n|-------|-------------------------------------------|\n| Admin | Approve users, manage movies, view all    |\n| User  | Browse movies, search, view details       |\n\n---\n\n## System Structure\n\n\`\`\`yaml\nlayers:\n  - name: ui\n    tech: Angular 17\n    communicates_with: [api_gateway]\n\n  - name: api_gateway\n    tech: YARP (.NET 8)\n    routes:\n      - /auth/**    → identity_service   # no auth required\n      - /movies/**  → movie_service      # JWT required\n\n  - name: identity_service\n    tech: .NET 8, Oracle 19c\n    schema: MSI_AUTH\n    responsibilities: [registration, approval, JWT issuance]\n\n  - name: movie_service\n    tech: .NET 8, Oracle 19c\n    schema: MS_MACRO\n    responsibilities: [movie CRUD, search]\n\nauth:\n  header: Authorization\n  mechanism: JWT Bearer\n  issuer: identity_service\n  roles: [Admin, User]\n  token_expiry: 30m access / 7d refresh\n\nconventions:\n  api_prefix: /api/v1\n  error_format: "{ code, message, details }"\n  dates: UTC ISO 8601\n\n\`\`\`\n`;
    db.prepare(`UPDATE document_templates SET template_text = ? WHERE name = 'Project Overview'`).run(newProjectOverview);
  }

  // Replace the old bundled default model configs with a single lean default:
  // a Claude Haiku CLI config restricted from touching the local filesystem/shell,
  // mapped by default to Documents, Project Layers, and AI Chat.
  const NEW_DEFAULT_LABEL = 'Claude Haiku General Purpose';
  const NEW_DEFAULT_MODEL_NAME = 'claude-haiku-4-5';
  // A bare '@file' arg with no surrounding text renders as an attachment with
  // no request — the CLI then just asks what to do with it. Lead-in text keeps
  // the file as context while making the turn itself an actual instruction.
  const NEW_DEFAULT_FLAGS = `--model {{model}} 'Follow the instructions in the attached file exactly and respond accordingly. @{{prompt}}' --disallowedTools "Read,Glob,Grep,Bash,Write,Edit,WebFetch,WebSearch,Task,NotebookEdit"`;

  const existing = db.prepare(`
    SELECT id FROM model_configs WHERE label IN (?, 'Claude Haiku General CLI')
  `).get(NEW_DEFAULT_LABEL);

  if (existing) {
    // Already created by an earlier run of this migration — bring field values in line
    // (label may have been the earlier draft name, flags may still carry an inline --model).
    db.prepare(`
      UPDATE model_configs
         SET label            = ?,
             model_name        = ?,
             flags             = ?,
             batch_flags       = '',
             skip_perms_flag   = ''
       WHERE id = ?
    `).run(NEW_DEFAULT_LABEL, NEW_DEFAULT_MODEL_NAME, NEW_DEFAULT_FLAGS, existing.id);
  } else {
    const oldDefaults = db.prepare(`
      SELECT id FROM model_configs
       WHERE label IN ('Claude CLI', 'Gemini CLI', 'Mistral CLI', 'Ollama (phi4-mini)')
    `).all().map(r => r.id);

    db.transaction(() => {
      if (oldDefaults.length) {
        const placeholders = oldDefaults.map(() => '?').join(',');
        db.prepare(`DELETE FROM model_mapping WHERE model_config_id IN (${placeholders})`).run(...oldDefaults);
        db.prepare(`DELETE FROM model_configs WHERE id IN (${placeholders})`).run(...oldDefaults);
      }

      db.prepare('UPDATE model_configs SET is_default = 0').run();
      const { lastInsertRowid: newId } = db.prepare(`
        INSERT INTO model_configs (label, type, executable, model_name, flags, input_mode, is_default, sort_order, batch_flags, skip_perms_flag)
        VALUES (?, 'cli', 'claude', ?, ?, 'pipe', 1, 0, '', '')
      `).run(NEW_DEFAULT_LABEL, NEW_DEFAULT_MODEL_NAME, NEW_DEFAULT_FLAGS);

      const upsertMapping = db.prepare(`
        INSERT INTO model_mapping (page_key, model_config_id, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(page_key) DO UPDATE SET model_config_id = excluded.model_config_id, updated_at = excluded.updated_at
      `);
      for (const pageKey of ['documents', 'project-layers', 'ai-console']) {
        upsertMapping.run(pageKey, newId);
      }
    })();
  }

  // Styles page — map to the Haiku General Purpose CLI config regardless of
  // whether it was just (re)inserted above or already existed.
  const haikuGpId = db.prepare(`SELECT id FROM model_configs WHERE label = ? AND type = 'cli'`).get(NEW_DEFAULT_LABEL)?.id;
  if (haikuGpId) {
    db.prepare(`
      INSERT INTO model_mapping (page_key, model_config_id, updated_at)
      VALUES ('style-guide', ?, datetime('now'))
      ON CONFLICT(page_key) DO UPDATE SET model_config_id = excluded.model_config_id, updated_at = excluded.updated_at
    `).run(haikuGpId);
  }

  // Second general-purpose default: Sonnet 5, same tool-restricted flags as the
  // Haiku config above, mapped to Mockups and Generate Workflows.
  const SONNET_LABEL      = 'Claude Sonnet General Purpose';
  const SONNET_MODEL_NAME = 'claude-sonnet-5';
  const SONNET_FLAGS      = `--model {{model}} 'Follow the instructions in the attached file exactly and respond accordingly. @{{prompt}}' --disallowedTools "Read,Glob,Grep,Bash,Write,Edit,WebFetch,WebSearch,Task,NotebookEdit"`;

  const sonnetExisting = db.prepare('SELECT id FROM model_configs WHERE label = ?').get(SONNET_LABEL);
  if (sonnetExisting) {
    db.prepare(`
      UPDATE model_configs
         SET model_name      = ?,
             flags            = ?,
             batch_flags      = '',
             skip_perms_flag  = ''
       WHERE id = ?
    `).run(SONNET_MODEL_NAME, SONNET_FLAGS, sonnetExisting.id);
  } else {
    db.transaction(() => {
      const nextSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM model_configs').get().n;
      const { lastInsertRowid: sonnetId } = db.prepare(`
        INSERT INTO model_configs (label, type, executable, model_name, flags, input_mode, is_default, sort_order, batch_flags, skip_perms_flag)
        VALUES (?, 'cli', 'claude', ?, ?, 'pipe', 0, ?, '', '')
      `).run(SONNET_LABEL, SONNET_MODEL_NAME, SONNET_FLAGS, nextSort);

      const upsertSonnetMapping = db.prepare(`
        INSERT INTO model_mapping (page_key, model_config_id, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(page_key) DO UPDATE SET model_config_id = excluded.model_config_id, updated_at = excluded.updated_at
      `);
      for (const pageKey of ['mockups', 'generate-workflows']) {
        upsertSonnetMapping.run(pageKey, sonnetId);
      }
    })();
  }

  // General coding configs — unlike the Q&A defaults above these keep full tool
  // access (Read/Write/Edit/Bash) since they need to actually touch project files.
  // batch_flags/skip_perms_flag are left NULL (not '') so Run Layers / Run Issues'
  // own per-run "skip permissions" toggle keeps driving that behavior via its
  // built-in fallback (wfr-pty-handlers.js) instead of a hardcoded config value;
  // Run All is currently disabled so batch_flags isn't in play either way.
  const CODE_FLAGS = `--model {{model}} '@{{prompt}}'`;

  const upsertCodeConfig = (label, modelName, pageKeys) => {
    const row = db.prepare('SELECT id FROM model_configs WHERE label = ?').get(label);
    if (row) {
      db.prepare(`
        UPDATE model_configs
           SET model_name      = ?,
               flags            = ?,
               batch_flags      = NULL,
               skip_perms_flag  = NULL
         WHERE id = ?
      `).run(modelName, CODE_FLAGS, row.id);
      return row.id;
    }

    const nextSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM model_configs').get().n;
    const { lastInsertRowid: id } = db.prepare(`
      INSERT INTO model_configs (label, type, executable, model_name, flags, input_mode, is_default, sort_order, batch_flags, skip_perms_flag)
      VALUES (?, 'cli', 'claude', ?, ?, 'pipe', 0, ?, NULL, NULL)
    `).run(label, modelName, CODE_FLAGS, nextSort);

    const upsertMapping = db.prepare(`
      INSERT INTO model_mapping (page_key, model_config_id, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(page_key) DO UPDATE SET model_config_id = excluded.model_config_id, updated_at = excluded.updated_at
    `);
    for (const pageKey of pageKeys) upsertMapping.run(pageKey, id);
    return id;
  };

  db.transaction(() => {
    upsertCodeConfig('Claude Haiku Code', 'claude-haiku-4-5', ['test-generator']);
    upsertCodeConfig('Claude Sonnet Code', 'claude-sonnet-5', ['workflows', 'workflow-runner', 'issue-runner', 'issues']);
  })();

  // Gemini (agy CLI) configs — intentionally left unmapped to any page.
  // Identity here is (label, flags) rather than label alone, since the Medium/High
  // General-Purpose/Code variants only differ by flags (sandboxed vs not).
  // {{model}} MUST be quoted — model_name values for agy (e.g. "Gemini 3.5 Flash
  // (Medium)") contain spaces/parens that a shell would otherwise split into
  // multiple arguments. This has to match the format schema.js's own idempotent
  // fixup normalizes existing rows to (schema.js ~line 441) — applySchema() runs
  // before runMigrations() on every launch, so an unquoted literal here would
  // never match an already-quoted row and would re-insert a fresh duplicate
  // every single startup (which is exactly how this table ended up with dozens
  // of duplicate Gemini rows).
  const geminiConfigs = [
    { label: 'Gemini Flash Medium General Purpose', modelName: 'Gemini 3.5 Flash (Medium)', flags: `--sandbox -p "{{prompt}}" --model "{{model}}"` },
    { label: 'Gemini Flash High General Purpose',   modelName: 'Gemini 3.5 Flash (High)',   flags: `--sandbox -p "{{prompt}}" --model "{{model}}"` },
    { label: 'Gemini Flash Medium Code',            modelName: 'Gemini 3.5 Flash (Medium)', flags: `-p "{{prompt}}" --model "{{model}}"` },
    { label: 'Gemini Flash High Code',              modelName: 'Gemini 3.5 Flash (High)',   flags: `-p "{{prompt}}" --model "{{model}}"` },
  ];

  db.transaction(() => {
    for (const { label, modelName, flags } of geminiConfigs) {
      const row = db.prepare('SELECT id FROM model_configs WHERE label = ? AND flags = ?').get(label, flags);
      if (row) {
        db.prepare(`UPDATE model_configs SET model_name = ?, executable = 'agy' WHERE id = ?`).run(modelName, row.id);
        continue;
      }
      const nextSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM model_configs').get().n;
      db.prepare(`
        INSERT INTO model_configs (label, type, executable, model_name, flags, input_mode, is_default, sort_order, batch_flags, skip_perms_flag)
        VALUES (?, 'cli', 'agy', ?, ?, 'pipe', 0, ?, NULL, NULL)
      `).run(label, modelName, flags, nextSort);
    }
  })();

  // One-time cleanup: an earlier iteration of the block above lacked this exact
  // (label, flags) dedup — and, separately, mislabeled the non-sandboxed "High"
  // variant as "...High General Purpose" instead of "...High Code" — so existing
  // databases can carry many duplicate/mislabeled Gemini rows. Fix the mislabel,
  // then collapse exact (label, executable, flags) duplicates down to the oldest
  // row. model_mapping.model_config_id is ON DELETE SET NULL, and Gemini configs
  // are never mapped to a page by design, so this is safe.
  db.prepare(`
    UPDATE model_configs SET label = 'Gemini Flash High Code'
     WHERE executable = 'agy' AND label = 'Gemini Flash High General Purpose'
       AND flags NOT LIKE '%--sandbox%'
  `).run();
  db.transaction(() => {
    const dupGroups = db.prepare(`
      SELECT label, executable, flags, MIN(id) AS keepId
        FROM model_configs
       WHERE executable = 'agy'
       GROUP BY label, executable, flags
      HAVING COUNT(*) > 1
    `).all();
    const del = db.prepare(`
      DELETE FROM model_configs WHERE label = ? AND executable = ? AND flags = ? AND id != ?
    `);
    for (const g of dupGroups) del.run(g.label, g.executable, g.flags, g.keepId);
  })();

  // Non-CLI reference configs (Ollama / Groq via OpenAI-compatible API / Anthropic API) —
  // intentionally left unmapped to any page; these exist to illustrate the range of
  // supported configurations (local model, third-party API, first-party API,
  // agentic devflow-agent loop vs single-shot prompt).
  const upsertNonCliConfig = (label, type, { baseUrl = null, modelName, maxTokens = null, useDevflowAgent }) => {
    const row = db.prepare('SELECT id FROM model_configs WHERE label = ? AND type = ?').get(label, type);
    if (row) {
      db.prepare(`
        UPDATE model_configs
           SET base_url          = ?,
               model_name        = ?,
               max_tokens        = ?,
               use_devflow_agent = ?
         WHERE id = ?
      `).run(baseUrl, modelName, maxTokens, useDevflowAgent ? 1 : 0, row.id);
      return;
    }
    const nextSort = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM model_configs').get().n;
    db.prepare(`
      INSERT INTO model_configs (label, type, base_url, model_name, max_tokens, input_mode, is_default, sort_order, use_devflow_agent)
      VALUES (?, ?, ?, ?, ?, 'pipe', 0, ?, ?)
    `).run(label, type, baseUrl, modelName, maxTokens, nextSort, useDevflowAgent ? 1 : 0);
  };

  db.transaction(() => {
    // Ollama — local model server
    upsertNonCliConfig('Ollama General Purpose', 'ollama', { baseUrl: 'http://localhost:11434', modelName: 'phi4-mini:latest', useDevflowAgent: false });
    upsertNonCliConfig('Ollama Code',            'ollama', { baseUrl: 'http://localhost:11434', modelName: 'qwen2.5-coder:7b', useDevflowAgent: true });

    // Groq — OpenAI-compatible API
    upsertNonCliConfig('Groq General Purpose', 'api', { baseUrl: 'https://api.groq.com/openai/v1', modelName: 'llama-3.3-70b-versatile', useDevflowAgent: false });
    upsertNonCliConfig('Groq Code',            'api', { baseUrl: 'https://api.groq.com/openai/v1', modelName: 'llama-3.3-70b-versatile', useDevflowAgent: true });

    // Anthropic — first-party API ("[API] " prefix to avoid colliding with the CLI configs of the same name)
    const renameAnthropic = db.prepare(`UPDATE model_configs SET label = ? WHERE label = ? AND type = 'anthropic'`);
    renameAnthropic.run('[API] Claude Haiku General Purpose',    'Claude Haiku General Purpose (Anthropic API)');
    renameAnthropic.run('[API] Claude Sonnet 5 General Purpose', 'Claude Sonnet 5 General Purpose (Anthropic API)');
    renameAnthropic.run('[API] Claude Sonnet 5 Code',            'Claude Sonnet 5 Code (Anthropic API)');

    upsertNonCliConfig('[API] Claude Haiku General Purpose',    'anthropic', { modelName: 'claude-haiku-4-5', useDevflowAgent: false });
    upsertNonCliConfig('[API] Claude Sonnet 5 General Purpose', 'anthropic', { modelName: 'claude-sonnet-5',  useDevflowAgent: false });
    upsertNonCliConfig('[API] Claude Sonnet 5 Code',            'anthropic', { modelName: 'claude-sonnet-5',  useDevflowAgent: true });

    // Heavy-code-tier gap fillers — strongest Groq/Ollama picks for the agentic
    // Run Layers/Run Issues workload, distinct from the general-purpose 70B picks above.
    upsertNonCliConfig('Groq Code (DeepSeek R1 70B)',    'api',    { baseUrl: 'https://api.groq.com/openai/v1', modelName: 'deepseek-r1-distill-llama-70b', useDevflowAgent: true });
    upsertNonCliConfig('Ollama Code (DeepSeek Coder V2)', 'ollama', { baseUrl: 'http://localhost:11434', modelName: 'deepseek-coder-v2', useDevflowAgent: true });
  })();
}

/**
 * Seeds the document_templates table with built-in templates.
 * Inserts only if name doesn't already exist (idempotent).
 * @param {import('better-sqlite3').Database} db
 */
function seedDocumentTemplates(db) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO document_templates (name, description, template_text, sort_order)
    VALUES (?, ?, ?, ?)
  `);

  const templates = [
    [
      'Empty Document',
      'Start with a blank page',
      '',
      1,
    ],
    [
      'Project Overview',
      'High-level summary of the project',
      `# MacroStore Movie App — Project Context\n\n## Overview\nTwo-role (Admin/User) movie catalogue with approval-based registration,\nsearch, and CRUD management. Runs on-prem, IIS hosted, Oracle 19c database.\n\n**In scope:** registration with admin approval, movie CRUD, movie search  \n**Out of scope:** payments, media hosting, mobile app\n\n---\n\n## Users & Roles\n\n| Role  | Capabilities                              |\n|-------|-------------------------------------------|\n| Admin | Approve users, manage movies, view all    |\n| User  | Browse movies, search, view details       |\n\n---\n\n## System Structure\n\n\`\`\`yaml\nlayers:\n  - name: ui\n    tech: Angular 17\n    communicates_with: [api_gateway]\n\n  - name: api_gateway\n    tech: YARP (.NET 8)\n    routes:\n      - /auth/**    → identity_service   # no auth required\n      - /movies/**  → movie_service      # JWT required\n\n  - name: identity_service\n    tech: .NET 8, Oracle 19c\n    schema: MSI_AUTH\n    responsibilities: [registration, approval, JWT issuance]\n\n  - name: movie_service\n    tech: .NET 8, Oracle 19c\n    schema: MS_MACRO\n    responsibilities: [movie CRUD, search]\n\nauth:\n  header: Authorization\n  mechanism: JWT Bearer\n  issuer: identity_service\n  roles: [Admin, User]\n  token_expiry: 30m access / 7d refresh\n\nconventions:\n  api_prefix: /api/v1\n  error_format: "{ code, message, details }"\n  dates: UTC ISO 8601\n\n\`\`\`\n`,
      2,
    ],
    [
      'Solution Architecture',
      'Architecture, components and design decisions',
      `# Solution Architecture\n\n## Overview\n\nBrief description of what is being built.\n\n## Architecture\n\nDescribe the high-level architecture.\n\n## Components\n\n### Component 1\n\nDescription.\n\n## API Design\n\n\`\`\`\nGET /api/resource\n\`\`\`\n\n## Data Model\n\nDescribe key entities.\n\n## Dependencies\n\n- Dependency 1\n- Dependency 2\n\n## Open Questions\n\n- [ ] Question 1\n`,
      3,
    ],
  ];

  const insertAll = db.transaction((rows) => {
    for (const row of rows) insert.run(...row);
  });
  insertAll(templates);
}

/**
 * Seeds the quick_commands table with common git commands.
 * Uses WHERE NOT EXISTS so it's safe to call repeatedly.
 * @param {import('better-sqlite3').Database} db
 */
function seedQuickCommands(db) {
  const insert = db.prepare(`
    INSERT INTO quick_commands (command, description)
    SELECT ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM quick_commands WHERE command = ?)
  `);

  const commands = [
    ['git add -A; git commit -m "{{input}}"', 'Commit the changes'],
    ['git push', 'Push the changes to origin'],

    ['git status', 'Show working tree status'],
    ['git log --oneline -10', 'Last 20 commits (compact)'],

    ['git revert HEAD --no-edit',                           'Revert last commit (new commit)'],
    ['git revert {{input}} --no-edit',                      'Revert a specific commit hash'],

    ['git branch',                                          'List local branches'],
    ['git branch -a',                                       'List all branches (local + remote)'],

    ['git pull',                                            'Pull from remote'],
    ['git push',                                            'Push to remote'],
    ['git remote -v',                                       'Show remote URLs'],
  ];

  const insertAll = db.transaction((rows) => {
    for (const [cmd, desc] of rows) insert.run(cmd, desc, cmd);
  });
  insertAll(commands);
}

module.exports = { seedStatuses, runMigrations, seedQuickCommands };
