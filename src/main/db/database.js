'use strict';

const path = require('node:path');
const { app } = require('electron');
const Database = require('better-sqlite3');
const { applySchema } = require('./schema');
const { seedStatuses, runMigrations } = require('./migrations');

let _db = null;

function getDb() {
  if (_db) return _db;

  // In development use the project-root DB so existing data is preserved.
  // In production (packaged) fall back to userData which is always writable.
  const dbPath = app.isPackaged
    ? path.join(app.getPath('userData'), 'sdlc.db')
    : path.join(app.getAppPath(), 'sdlc.db');
  _db = new Database(dbPath);

  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  applySchema(_db);
  runMigrations(_db);
  seedStatuses(_db);

  return _db;
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb };
