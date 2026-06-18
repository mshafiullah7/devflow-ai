'use strict';

/**
 * Applies the full DB schema (idempotent — safe to run on every launch).
 * @param {import('better-sqlite3').Database} db
 */
function applySchema(db) {
  // Safe column migrations — silently ignored if column already exists
  const migrations = [
    `ALTER TABLE projects ADD COLUMN design_template TEXT`,
    `ALTER TABLE screen_designs ADD COLUMN queued       INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE screen_designs ADD COLUMN executed     INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE screen_designs ADD COLUMN style_valid  INTEGER`,
    `ALTER TABLE screen_designs ADD COLUMN style_issues TEXT`,
    `ALTER TABLE project_layers ADD COLUMN sort_order          INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE project_layers ADD COLUMN setup_instructions  TEXT`,
    `ALTER TABLE prompt_queue ADD COLUMN layer_id INTEGER REFERENCES project_layers(id) ON DELETE SET NULL`,
    `ALTER TABLE issues       ADD COLUMN layer_id INTEGER REFERENCES project_layers(id) ON DELETE SET NULL`,
    `ALTER TABLE document_templates ADD COLUMN group_name TEXT NOT NULL DEFAULT 'General'`,
    // Status tracking for workflow layers and workflows
    `ALTER TABLE layers    ADD COLUMN status TEXT NOT NULL DEFAULT 'open'`,
    `ALTER TABLE workflows ADD COLUMN status TEXT NOT NULL DEFAULT 'open'`,
    // Dart file path generated from the UI Shell workflow
    `ALTER TABLE screen_designs ADD COLUMN dart_file_path TEXT`,
    // Workflow type: 'ui_shell' | 'feature'
    `ALTER TABLE workflows ADD COLUMN workflow_type TEXT NOT NULL DEFAULT 'feature'`,
    // CLI model config: batch-mode extra flags and configurable skip-permissions flag
    `ALTER TABLE model_configs ADD COLUMN batch_flags     TEXT`,
    `ALTER TABLE model_configs ADD COLUMN skip_perms_flag TEXT`,
    `ALTER TABLE issues            ADD COLUMN type     TEXT NOT NULL DEFAULT 'issue'`,
    `ALTER TABLE test_run_history  ADD COLUMN coverage REAL`,
    `ALTER TABLE test_run_history  ADD COLUMN layer_id INTEGER REFERENCES project_layers(id) ON DELETE SET NULL`,
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch {}
  }

  db.exec(`
    PRAGMA foreign_keys = ON;

    -- ----------------------------------------------------------------
    -- MASTER / LOOKUP
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS status_master (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- CORE TABLES
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS projects (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      last_opened_at  TEXT,
      project_path    TEXT
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id       INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      workflow_id      TEXT    NOT NULL,
      feature          TEXT    NOT NULL,
      description      TEXT,
      screen_design_id INTEGER REFERENCES screen_designs(id) ON DELETE SET NULL,
      workflow_type    TEXT    NOT NULL DEFAULT 'feature',
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- SUCCESS CRITERIA
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS success_criteria (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      description TEXT    NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- LAYERS
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS layers (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id      INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
      project_layer_id INTEGER REFERENCES project_layers(id) ON DELETE SET NULL,
      layer            TEXT    NOT NULL,
      order_num        INTEGER NOT NULL DEFAULT 1,
      purpose          TEXT,
      inputs           TEXT,
      outputs          TEXT,
      prompt           TEXT,
      is_active        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- DOCUMENT TEMPLATES
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS document_templates (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL UNIQUE,
      description   TEXT,
      template_text TEXT    NOT NULL DEFAULT '',
      sort_order    INTEGER NOT NULL DEFAULT 0,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- PROJECT DOCUMENTS
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS project_documents (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title      TEXT    NOT NULL,
      content    TEXT,
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- DOCUMENT ATTACHMENTS
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS document_attachments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      type        TEXT    NOT NULL DEFAULT 'svg',  -- 'svg' | 'drawio'
      content     TEXT    NOT NULL DEFAULT '',
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- MODEL CONFIGS
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS model_configs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      label       TEXT    NOT NULL,
      type        TEXT    NOT NULL DEFAULT 'cli',   -- 'cli' | 'api'
      executable  TEXT,                              -- CLI: binary name (claude, gemini, vibe)
      flags       TEXT,                              -- CLI: extra flags for inline/pipe run
      input_mode  TEXT    NOT NULL DEFAULT 'pipe',  -- CLI: 'pipe' | 'heredoc'
      base_url    TEXT,                              -- API: endpoint base URL
      api_key     TEXT,                              -- API: auth key
      model_name  TEXT,                              -- API: model identifier sent in request
      max_tokens  INTEGER,                           -- API: optional token cap
      is_active   INTEGER NOT NULL DEFAULT 1,
      is_default  INTEGER NOT NULL DEFAULT 0,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- SCREEN DESIGNS
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS screen_designs (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title               TEXT    NOT NULL,
      description         TEXT,
      tech_stack          TEXT    NOT NULL DEFAULT 'html',
      html_content        TEXT    NOT NULL DEFAULT '',
      queued              INTEGER NOT NULL DEFAULT 0,
      executed            INTEGER NOT NULL DEFAULT 0,
      is_active           INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- SCREEN PROMPT HISTORY
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS screen_prompt_history (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id        INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      screen_design_id  INTEGER REFERENCES screen_designs(id) ON DELETE CASCADE,
      prompt            TEXT    NOT NULL,
      is_active         INTEGER NOT NULL DEFAULT 1,
      executed_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- WORKFLOW LAYER PROMPT HISTORY
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS workflow_layer_prompt_history (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      layer_id    INTEGER REFERENCES layers(id) ON DELETE CASCADE,
      prompt      TEXT    NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1,
      executed_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- ISSUES
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS issues (
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

    -- ----------------------------------------------------------------
    -- TEST RUN HISTORY
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS test_run_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      framework  TEXT,
      command    TEXT    NOT NULL,
      passed     INTEGER,
      failed     INTEGER,
      skipped    INTEGER,
      duration   TEXT,
      output     TEXT,
      exit_code  INTEGER NOT NULL DEFAULT 0,
      ran_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- QUICK COMMANDS
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS quick_commands (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      command     TEXT    NOT NULL,
      description TEXT,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- SCREEN TEMPLATES (global library of mockup design templates)
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS screen_templates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      group_name  TEXT    NOT NULL DEFAULT 'General',
      name        TEXT    NOT NULL UNIQUE,
      description TEXT    NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- SAVED THEMES (global library, shared across all projects)
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS saved_themes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      light      TEXT    NOT NULL DEFAULT '',
      dark       TEXT    NOT NULL DEFAULT '',
      is_active  INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- PROJECT LAYERS (sub-projects / architectural layers)
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS project_layers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      description         TEXT,
      folder_path         TEXT,
      setup_instructions  TEXT,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- PROMPT QUEUE
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS prompt_queue (
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
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      ran_at        TEXT
    );

    CREATE TABLE IF NOT EXISTS prompt_queue_messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_item_id INTEGER NOT NULL REFERENCES prompt_queue(id) ON DELETE CASCADE,
      role          TEXT    NOT NULL,
      content       TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- MODEL MAPPING (per-page model assignment)
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS model_mapping (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      page_key         TEXT    NOT NULL UNIQUE,
      model_config_id  INTEGER REFERENCES model_configs(id) ON DELETE SET NULL,
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- AUDIT / LOG TABLES
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS projects_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      action     TEXT NOT NULL,   -- 'INSERT' | 'UPDATE' | 'DELETE'
      old_data   TEXT,            -- JSON
      new_data   TEXT,            -- JSON
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- TRIGGERS — projects
    -- ----------------------------------------------------------------
    CREATE TRIGGER IF NOT EXISTS trg_projects_insert
    AFTER INSERT ON projects
    BEGIN
      INSERT INTO projects_log (project_id, action, old_data, new_data)
      VALUES (
        NEW.id, 'INSERT', NULL,
        json_object(
          'id', NEW.id, 'name', NEW.name, 'description', NEW.description,
          'is_active', NEW.is_active, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS trg_projects_update
    AFTER UPDATE ON projects
    BEGIN
      INSERT INTO projects_log (project_id, action, old_data, new_data)
      VALUES (
        NEW.id, 'UPDATE',
        json_object(
          'id', OLD.id, 'name', OLD.name, 'description', OLD.description,
          'is_active', OLD.is_active, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at
        ),
        json_object(
          'id', NEW.id, 'name', NEW.name, 'description', NEW.description,
          'is_active', NEW.is_active, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS trg_projects_delete
    AFTER DELETE ON projects
    BEGIN
      INSERT INTO projects_log (project_id, action, old_data, new_data)
      VALUES (
        OLD.id, 'DELETE',
        json_object(
          'id', OLD.id, 'name', OLD.name, 'description', OLD.description,
          'is_active', OLD.is_active, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at
        ),
        NULL
      );
    END;

  `);
}

/**
 * Seeds default model_configs rows on first run (idempotent).
 * @param {import('better-sqlite3').Database} db
 */
function seedModelConfigs(db) {
  const count = db.prepare('SELECT COUNT(*) AS n FROM model_configs').get().n;
  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO model_configs (label, type, executable, flags, input_mode, is_default, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertOllama = db.prepare(`
    INSERT INTO model_configs (label, type, base_url, model_name, input_mode, is_default, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insert.run('Claude CLI',  'cli', 'claude',  '--dangerously-skip-permissions --print', 'pipe', 1, 0);
    insert.run('Gemini CLI',  'cli', 'gemini',  '', 'pipe', 0, 1);
    insert.run('Mistral CLI', 'cli', 'mistral', '', 'pipe', 0, 2);
    insertOllama.run('Ollama (phi4-mini)', 'ollama', 'http://localhost:11434', 'phi4-mini:latest', 'pipe', 0, 3);
  })();
}

module.exports = { applySchema, seedModelConfigs };
