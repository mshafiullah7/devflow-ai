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

  // Add commit_sha / layer_id to prompt_queue for existing databases
  const pqCols = db.prepare('PRAGMA table_info(prompt_queue)').all().map(c => c.name);
  if (!pqCols.includes('commit_sha')) {
    db.exec('ALTER TABLE prompt_queue ADD COLUMN commit_sha TEXT');
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

  // Remove obsolete templates; 'Solution Architecture' is seeded separately via seedDocumentTemplates
  const tplTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='document_templates'").get();
  if (tplTables) {
    db.prepare(`DELETE FROM document_templates WHERE name IN ('Technical Specification', 'Meeting Notes', 'Release Notes', 'Tasks', 'Tech Stack', 'Architecture Overview')`).run();

    // Update Project Overview template to MacroStore project context
    const newProjectOverview = `# MacroStore Movie App — Project Context\n\n## Overview\nTwo-role (Admin/User) movie catalogue with approval-based registration,\nsearch, and CRUD management. Runs on-prem, IIS hosted, Oracle 19c database.\n\n**In scope:** registration with admin approval, movie CRUD, movie search  \n**Out of scope:** payments, media hosting, mobile app\n\n---\n\n## Users & Roles\n\n| Role  | Capabilities                              |\n|-------|-------------------------------------------|\n| Admin | Approve users, manage movies, view all    |\n| User  | Browse movies, search, view details       |\n\n---\n\n## System Structure\n\n\`\`\`yaml\nlayers:\n  - name: ui\n    tech: Angular 17\n    communicates_with: [api_gateway]\n\n  - name: api_gateway\n    tech: YARP (.NET 8)\n    routes:\n      - /auth/**    → identity_service   # no auth required\n      - /movies/**  → movie_service      # JWT required\n\n  - name: identity_service\n    tech: .NET 8, Oracle 19c\n    schema: MSI_AUTH\n    responsibilities: [registration, approval, JWT issuance]\n\n  - name: movie_service\n    tech: .NET 8, Oracle 19c\n    schema: MS_MACRO\n    responsibilities: [movie CRUD, search]\n\nauth:\n  header: Authorization\n  mechanism: JWT Bearer\n  issuer: identity_service\n  roles: [Admin, User]\n  token_expiry: 30m access / 7d refresh\n\nconventions:\n  api_prefix: /api/v1\n  error_format: "{ code, message, details }"\n  dates: UTC ISO 8601\n\n\`\`\`\n`;
    db.prepare(`UPDATE document_templates SET template_text = ? WHERE name = 'Project Overview'`).run(newProjectOverview);
  }
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
