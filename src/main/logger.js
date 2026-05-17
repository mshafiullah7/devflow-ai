'use strict';

let _db = null;

function _getDb() {
  if (!_db) {
    try {
      _db = require('./db/database').getDb();
    } catch (_) {
      return null;
    }
  }
  return _db;
}

function logError(source, err, context = null) {
  console.error(`[ERROR][${source}]`, err);
  const db = _getDb();
  if (!db) return;
  try {
    db.prepare(
      'INSERT INTO error_logs (source, message, stack, context) VALUES (?, ?, ?, ?)'
    ).run(
      source,
      err?.message ?? String(err),
      err?.stack ?? null,
      context ? JSON.stringify(context) : null
    );
  } catch (dbErr) {
    console.error('[logger] Failed to persist error:', dbErr.message);
  }
}

module.exports = { logError };
