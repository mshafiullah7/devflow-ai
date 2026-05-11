'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { getConfigValue } = require('../app-config');

const MAX_BACKUPS = 5;

/**
 * Copies dbPath into destDir as a daily snapshot and prunes old copies.
 * Returns the filename created, or null if today's backup already exists.
 */
function _runBackup(dbPath, destDir) {
  if (!fs.existsSync(dbPath)) return null;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const today    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const destName = `sdlc_${today}.db`;
  const destPath = path.join(destDir, destName);

  if (fs.existsSync(destPath)) return null; // today's backup already done

  fs.copyFileSync(dbPath, destPath);

  // Prune: keep only the latest MAX_BACKUPS files
  const files = fs.readdirSync(destDir)
    .filter(f => /^sdlc_\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort();
  if (files.length > MAX_BACKUPS) {
    for (const f of files.slice(0, files.length - MAX_BACKUPS)) {
      fs.unlinkSync(path.join(destDir, f));
    }
  }

  return destName;
}

/**
 * Runs daily backup of sdlc.db.
 * Primary destination: <userData>/backup
 * Secondary destination: C:\dev_flow_ai_backup (Windows-only, silent on failure)
 */
function runBackup() {
  const dbPath    = app.isPackaged
    ? path.join(app.getPath('userData'), 'sdlc.db')
    : path.join(app.getAppPath(), 'sdlc.db');
  const backupDir = path.join(app.getPath('userData'), 'backup');

  try {
    const name = _runBackup(dbPath, backupDir);
    if (name) console.log(`[backup] Created ${name}`);
  } catch (err) {
    console.error('[backup] Primary backup failed:', err);
  }

  // Secondary backup — user-configured path, failures are non-fatal
  const userBackupPath = getConfigValue('backupPath');
  if (userBackupPath) {
    try {
      const name = _runBackup(dbPath, userBackupPath);
      if (name) console.log(`[backup] User-path copy: ${name}`);
    } catch (err) {
      console.warn('[backup] User-path backup skipped:', err.message);
    }
  }
}

module.exports = { runBackup };
