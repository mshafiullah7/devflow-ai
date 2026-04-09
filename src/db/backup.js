'use strict';

const fs   = require('node:fs');
const path = require('node:path');

const DB_PATH        = path.join(__dirname, '..', '..', 'sdlc.db');
const BACKUP_DIR     = path.join(__dirname, '..', '..', 'backup');
const C_BACKUP_DIR   = 'C:\\dev_flow_ai_backup';
const MAX_BACKUPS    = 5;

/**
 * Takes a daily backup of sdlc.db into the /backup folder.
 * - Skips if a backup for today already exists.
 * - Keeps only the most recent MAX_BACKUPS files, deleting older ones.
 * - Also attempts a secondary copy to C:\dev_flow_ai_backup (silent on failure).
 */
function runBackup() {
  try {
    // Nothing to back up if the DB doesn't exist yet
    if (!fs.existsSync(DB_PATH)) return;

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const today    = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const destName = `sdlc_${today}.db`;
    const destPath = path.join(BACKUP_DIR, destName);

    // Skip if today's backup already exists
    if (fs.existsSync(destPath)) return;

    // Copy the database file
    fs.copyFileSync(DB_PATH, destPath);

    // Prune old backups — keep only the latest MAX_BACKUPS
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => /^sdlc_\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort(); // lexicographic sort works for YYYY-MM-DD

    if (files.length > MAX_BACKUPS) {
      const toDelete = files.slice(0, files.length - MAX_BACKUPS);
      for (const f of toDelete) fs.unlinkSync(path.join(BACKUP_DIR, f));
    }

    console.log(`[backup] Created ${destName}`);
  } catch (err) {
    console.error('[backup] Failed to back up database:', err);
  }

  // Secondary backup to C:\dev_flow_ai_backup — failures are non-fatal
  try {
    if (!fs.existsSync(DB_PATH)) return;

    if (!fs.existsSync(C_BACKUP_DIR)) fs.mkdirSync(C_BACKUP_DIR, { recursive: true });

    const today    = new Date().toISOString().slice(0, 10);
    const destName = `sdlc_${today}.db`;
    const destPath = path.join(C_BACKUP_DIR, destName);

    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(DB_PATH, destPath);

      // Prune old backups in C drive dir too
      const files = fs.readdirSync(C_BACKUP_DIR)
        .filter(f => /^sdlc_\d{4}-\d{2}-\d{2}\.db$/.test(f))
        .sort();

      if (files.length > MAX_BACKUPS) {
        const toDelete = files.slice(0, files.length - MAX_BACKUPS);
        for (const f of toDelete) fs.unlinkSync(path.join(C_BACKUP_DIR, f));
      }

      console.log(`[backup] C-drive copy created: ${destPath}`);
    }
  } catch (err) {
    console.warn('[backup] C-drive backup skipped:', err.message);
  }
}

module.exports = { runBackup };
