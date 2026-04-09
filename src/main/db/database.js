'use strict';

const path = require('node:path');
const { app } = require('electron');
const Database = require('better-sqlite3');
const { applySchema } = require('./schema');
const { seedStatuses, runMigrations } = require('./migrations');

let _db = null;

function getDb() {
  if (_db) return _db;

  // Use userData so the DB file lives in a writable location in packaged builds.
  const dbPath = path.join(app.getPath('userData'), 'sdlc.db');
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
