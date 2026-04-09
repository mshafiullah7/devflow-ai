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
}

module.exports = { seedStatuses, runMigrations };
