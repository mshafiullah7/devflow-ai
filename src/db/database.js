'use strict';

const path = require('node:path');
const Database = require('better-sqlite3');
const { applySchema, seedStatuses, runMigrations } = require('./schema');

let _db = null;

/**
 * Returns the singleton DB connection, initialising it on first call.
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  if (_db) return _db;

  const dbPath = path.join(__dirname, '..', '..', 'sdlc.db');
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  applySchema(_db);
  runMigrations(_db);
  seedStatuses(_db);

  return _db;
}

/**
 * Closes the DB connection. Call on app quit.
 */
function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

module.exports = { getDb, closeDb };
