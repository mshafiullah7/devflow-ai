'use strict';

// Clears app-level settings (AI Config, Model Mapping, Document Templates,
// Quick Commands, Style Guide presets) while leaving all project data
// (projects, layers, documents, workflows, issues, mockups, test/scan
// history, etc.) untouched. Backs up sdlc.db before touching it.
//
// The app must be closed before running this (SQLite file lock).
//
// Usage: node scripts/clear-settings.js

const fs   = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'sdlc.db');

const SETTINGS_TABLES = [
  'model_configs',
  'model_mapping',
  'document_templates',
  'quick_commands',
  'saved_themes',
];

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

// ---- Backup first ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(__dirname, '..', `sdlc.backup-${stamp}.db`);
fs.copyFileSync(DB_PATH, backupPath);
console.log(`Backed up sdlc.db -> ${path.basename(backupPath)}`);

// ---- Clear settings tables ----
const db = new Database(DB_PATH);

try {
  const tx = db.transaction(() => {
    for (const table of SETTINGS_TABLES) {
      const before = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      db.prepare(`DELETE FROM ${table}`).run();
      console.log(`Cleared ${table}: ${before} row(s) removed`);
    }
  });
  tx();
  console.log('\nSettings cleared. Project data was not touched.');
} finally {
  db.close();
}
