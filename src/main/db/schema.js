'use strict';

/**
 * Applies the full DB schema (idempotent — safe to run on every launch).
 * @param {import('better-sqlite3').Database} db
 */
function applySchema(db) {
  // Safe column migrations — silently ignored if column already exists
  const migrations = [
    `ALTER TABLE projects ADD COLUMN design_template TEXT`,
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

    CREATE TABLE IF NOT EXISTS features (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      description TEXT,
      status_id   INTEGER REFERENCES status_master(id),
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_stories (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id          INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
      project_id          INTEGER NOT NULL REFERENCES projects(id),
      title               TEXT    NOT NULL,
      description         TEXT,
      acceptance_criteria TEXT,
      status_id           INTEGER REFERENCES status_master(id),
      priority            TEXT    NOT NULL DEFAULT 'medium',
      estimated_hours     REAL,
      remaining_hours     REAL,
      target_date         TEXT,
      is_active           INTEGER NOT NULL DEFAULT 1,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- PROMPTS
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS prompts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_story_id INTEGER NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
      tag           TEXT,
      prompt        TEXT    NOT NULL DEFAULT '',
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- PROMPT HISTORY
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS prompt_history (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_story_id INTEGER NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
      prompt        TEXT    NOT NULL,
      is_active     INTEGER NOT NULL DEFAULT 1,
      executed_at   TEXT    NOT NULL DEFAULT (datetime('now'))
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
      prompt_used         TEXT,
      model_used          TEXT,
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
    -- TEST CASES
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS test_cases (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_story_id   INTEGER REFERENCES user_stories(id) ON DELETE SET NULL,
      feature_id      INTEGER REFERENCES features(id) ON DELETE SET NULL,
      project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title           TEXT    NOT NULL,
      description     TEXT,
      test_steps      TEXT,
      expected_result TEXT,
      actual_result   TEXT,
      status          TEXT    NOT NULL DEFAULT 'not_run',
      priority        TEXT    NOT NULL DEFAULT 'medium',
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ----------------------------------------------------------------
    -- ISSUES
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS issues (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      user_story_id       INTEGER REFERENCES user_stories(id) ON DELETE SET NULL,
      feature_id          INTEGER REFERENCES features(id) ON DELETE SET NULL,
      project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
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
    -- PROMPT QUEUE
    -- ----------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS prompt_queue (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id    INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_story_id INTEGER REFERENCES user_stories(id) ON DELETE SET NULL,
      story_title   TEXT,
      prompt_id     INTEGER REFERENCES prompts(id) ON DELETE SET NULL,
      tag           TEXT,
      prompt_text   TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'pending',
      output        TEXT,
      exit_code     INTEGER,
      model_label   TEXT,
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

    CREATE TABLE IF NOT EXISTS features_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_id INTEGER,
      action     TEXT NOT NULL,
      old_data   TEXT,
      new_data   TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_stories_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_story_id INTEGER,
      action        TEXT NOT NULL,
      old_data      TEXT,
      new_data      TEXT,
      changed_at    TEXT NOT NULL DEFAULT (datetime('now'))
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

    -- ----------------------------------------------------------------
    -- TRIGGERS — features
    -- ----------------------------------------------------------------
    CREATE TRIGGER IF NOT EXISTS trg_features_insert
    AFTER INSERT ON features
    BEGIN
      INSERT INTO features_log (feature_id, action, old_data, new_data)
      VALUES (
        NEW.id, 'INSERT', NULL,
        json_object(
          'id', NEW.id, 'project_id', NEW.project_id, 'name', NEW.name,
          'description', NEW.description, 'status_id', NEW.status_id,
          'is_active', NEW.is_active, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS trg_features_update
    AFTER UPDATE ON features
    BEGIN
      INSERT INTO features_log (feature_id, action, old_data, new_data)
      VALUES (
        NEW.id, 'UPDATE',
        json_object(
          'id', OLD.id, 'project_id', OLD.project_id, 'name', OLD.name,
          'description', OLD.description, 'status_id', OLD.status_id,
          'is_active', OLD.is_active, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at
        ),
        json_object(
          'id', NEW.id, 'project_id', NEW.project_id, 'name', NEW.name,
          'description', NEW.description, 'status_id', NEW.status_id,
          'is_active', NEW.is_active, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS trg_features_delete
    AFTER DELETE ON features
    BEGIN
      INSERT INTO features_log (feature_id, action, old_data, new_data)
      VALUES (
        OLD.id, 'DELETE',
        json_object(
          'id', OLD.id, 'project_id', OLD.project_id, 'name', OLD.name,
          'description', OLD.description, 'status_id', OLD.status_id,
          'is_active', OLD.is_active, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at
        ),
        NULL
      );
    END;

    -- ----------------------------------------------------------------
    -- TRIGGERS — user_stories
    -- ----------------------------------------------------------------
    CREATE TRIGGER IF NOT EXISTS trg_user_stories_insert
    AFTER INSERT ON user_stories
    BEGIN
      INSERT INTO user_stories_log (user_story_id, action, old_data, new_data)
      VALUES (
        NEW.id, 'INSERT', NULL,
        json_object(
          'id', NEW.id, 'feature_id', NEW.feature_id, 'project_id', NEW.project_id,
          'title', NEW.title, 'description', NEW.description,
          'acceptance_criteria', NEW.acceptance_criteria,
          'status_id', NEW.status_id, 'is_active', NEW.is_active,
          'created_at', NEW.created_at, 'updated_at', NEW.updated_at
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS trg_user_stories_update
    AFTER UPDATE ON user_stories
    BEGIN
      INSERT INTO user_stories_log (user_story_id, action, old_data, new_data)
      VALUES (
        NEW.id, 'UPDATE',
        json_object(
          'id', OLD.id, 'feature_id', OLD.feature_id, 'project_id', OLD.project_id,
          'title', OLD.title, 'description', OLD.description,
          'acceptance_criteria', OLD.acceptance_criteria,
          'status_id', OLD.status_id, 'is_active', OLD.is_active,
          'created_at', OLD.created_at, 'updated_at', OLD.updated_at
        ),
        json_object(
          'id', NEW.id, 'feature_id', NEW.feature_id, 'project_id', NEW.project_id,
          'title', NEW.title, 'description', NEW.description,
          'acceptance_criteria', NEW.acceptance_criteria,
          'status_id', NEW.status_id, 'is_active', NEW.is_active,
          'created_at', NEW.created_at, 'updated_at', NEW.updated_at
        )
      );
    END;

    CREATE TRIGGER IF NOT EXISTS trg_user_stories_delete
    AFTER DELETE ON user_stories
    BEGIN
      INSERT INTO user_stories_log (user_story_id, action, old_data, new_data)
      VALUES (
        OLD.id, 'DELETE',
        json_object(
          'id', OLD.id, 'feature_id', OLD.feature_id, 'project_id', OLD.project_id,
          'title', OLD.title, 'description', OLD.description,
          'acceptance_criteria', OLD.acceptance_criteria,
          'status_id', OLD.status_id, 'is_active', OLD.is_active,
          'created_at', OLD.created_at, 'updated_at', OLD.updated_at
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
