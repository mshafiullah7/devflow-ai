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

  // Add prompt_history table for existing databases
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
  if (!tables.includes('prompt_history')) {
    db.exec(`
      CREATE TABLE prompt_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_story_id INTEGER NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
        prompt        TEXT    NOT NULL,
        is_active     INTEGER NOT NULL DEFAULT 1,
        executed_at   TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  } else {
    const phCols = db.prepare('PRAGMA table_info(prompt_history)').all().map(c => c.name);
    if (!phCols.includes('is_active')) {
      db.exec('ALTER TABLE prompt_history ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
    }
  }

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

  // Add prompts table for existing databases
  const promptsCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='prompts'").get();
  if (!promptsCheck) {
    db.exec(`
      CREATE TABLE prompts (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_story_id INTEGER NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
        tag           TEXT,
        prompt        TEXT    NOT NULL DEFAULT '',
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Add queued/executed to screen_designs
  const sdCols = db.prepare('PRAGMA table_info(screen_designs)').all().map(c => c.name);
  if (!sdCols.includes('queued')) {
    db.exec('ALTER TABLE screen_designs ADD COLUMN queued INTEGER NOT NULL DEFAULT 0');
  }
  if (!sdCols.includes('executed')) {
    db.exec('ALTER TABLE screen_designs ADD COLUMN executed INTEGER NOT NULL DEFAULT 0');
  }

  // Add is_executed to prompts
  const promptsCols = db.prepare('PRAGMA table_info(prompts)').all().map(c => c.name);
  if (!promptsCols.includes('is_executed')) {
    db.exec('ALTER TABLE prompts ADD COLUMN is_executed INTEGER NOT NULL DEFAULT 0');
  }

  // Add is_extracted to user_stories (marks AI-extracted stories not yet confirmed as final)
  const usCols = db.prepare('PRAGMA table_info(user_stories)').all().map(c => c.name);
  if (!usCols.includes('is_extracted')) {
    db.exec('ALTER TABLE user_stories ADD COLUMN is_extracted INTEGER NOT NULL DEFAULT 0');
  }

  // Add planning fields to user_stories
  const usColsPlanning = db.prepare('PRAGMA table_info(user_stories)').all().map(c => c.name);
  if (!usColsPlanning.includes('priority')) {
    db.exec("ALTER TABLE user_stories ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'");
  }
  if (!usColsPlanning.includes('estimated_hours')) {
    db.exec('ALTER TABLE user_stories ADD COLUMN estimated_hours REAL');
  }
  if (!usColsPlanning.includes('remaining_hours')) {
    db.exec('ALTER TABLE user_stories ADD COLUMN remaining_hours REAL');
  }
  if (!usColsPlanning.includes('target_date')) {
    db.exec('ALTER TABLE user_stories ADD COLUMN target_date TEXT');
  }

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

  // Add issues table for existing databases
  const issuesCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='issues'").get();
  if (!issuesCheck) {
    db.exec(`
      CREATE TABLE issues (
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
      )
    `);
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

  // Drop prompt and is_executed columns from user_stories (replaced by the prompts table)
  const usColsNow = db.prepare('PRAGMA table_info(user_stories)').all().map(c => c.name);
  if (usColsNow.includes('prompt') || usColsNow.includes('is_executed')) {
    // Triggers that reference these columns must be dropped first
    db.exec(`
      DROP TRIGGER IF EXISTS trg_user_stories_insert;
      DROP TRIGGER IF EXISTS trg_user_stories_update;
      DROP TRIGGER IF EXISTS trg_user_stories_delete;
    `);
    if (usColsNow.includes('prompt')) {
      db.exec('ALTER TABLE user_stories DROP COLUMN prompt');
    }
    if (usColsNow.includes('is_executed')) {
      db.exec('ALTER TABLE user_stories DROP COLUMN is_executed');
    }
    // Recreate triggers without the removed fields
    db.exec(`
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

  // Add acceptance_criteria table for existing databases
  const acCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='acceptance_criteria'").get();
  if (!acCheck) {
    db.exec(`
      CREATE TABLE acceptance_criteria (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_story_id INTEGER NOT NULL REFERENCES user_stories(id) ON DELETE CASCADE,
        description   TEXT    NOT NULL DEFAULT '',
        is_active     INTEGER NOT NULL DEFAULT 1,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
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

  // Add commit_sha to prompt_queue for git commit linkage
  const pqCols = db.prepare('PRAGMA table_info(prompt_queue)').all().map(c => c.name);
  if (!pqCols.includes('commit_sha')) {
    db.exec('ALTER TABLE prompt_queue ADD COLUMN commit_sha TEXT');
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
      `# Project Overview\n\n## Purpose\n\nDescribe the purpose of this project.\n\n## Goals\n\n- Goal 1\n- Goal 2\n- Goal 3\n\n## Stakeholders\n\n| Name | Role |\n|------|------|\n|      |      |\n\n## Timeline\n\nOutline key milestones here.\n`,
      2,
    ],
    [
      'Technical Specification',
      'Architecture, components and design decisions',
      `# Technical Specification\n\n## Overview\n\nBrief description of what is being built.\n\n## Architecture\n\nDescribe the high-level architecture.\n\n## Components\n\n### Component 1\n\nDescription.\n\n## API Design\n\n\`\`\`\nGET /api/resource\n\`\`\`\n\n## Data Model\n\nDescribe key entities.\n\n## Dependencies\n\n- Dependency 1\n- Dependency 2\n\n## Open Questions\n\n- [ ] Question 1\n`,
      3,
    ],
    [
      'Meeting Notes',
      'Record decisions and action items from a meeting',
      `# Meeting Notes\n\n**Date:** \n**Attendees:** \n\n## Agenda\n\n1. Item 1\n2. Item 2\n\n## Discussion\n\n### Item 1\n\nNotes here.\n\n## Decisions\n\n- Decision 1\n\n## Action Items\n\n| Action | Owner | Due |\n|--------|-------|-----|\n|        |       |     |\n`,
      4,
    ],
    [
      'Tasks',
      'Checklist of to-do items with sections',
      `# Tasks\n\n## To Do\n\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n\n## In Progress\n\n- [ ] Task 4\n\n## Done\n\n- [x] Completed task\n`,
      5,
    ],
    [
      'Release Notes',
      'What changed in this version',
      `# Release Notes\n\n## Version X.Y.Z — \n\n### New Features\n\n- Feature 1\n\n### Bug Fixes\n\n- Fix 1\n\n### Breaking Changes\n\n_None_\n\n### Upgrade Notes\n\nDescribe any steps required to upgrade.\n`,
      6,
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
