'use strict';

const { ipcMain, dialog } = require('electron');
const { getDb } = require('./database');

function registerHandlers() {
  const db = getDb();

  // ----------------------------------------------------------------
  // status_master
  // ----------------------------------------------------------------
  ipcMain.handle('db:status:list', () => {
    return db.prepare('SELECT * FROM status_master WHERE is_active = 1 ORDER BY sort_order').all();
  });

  // ----------------------------------------------------------------
  // projects
  // ----------------------------------------------------------------
  ipcMain.handle('db:projects:list', () => {
    return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  });

  ipcMain.handle('db:projects:get', (_e, id) => {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  ipcMain.handle('db:projects:create', (_e, { name, description }) => {
    const result = db
      .prepare('INSERT INTO projects (name, description) VALUES (?, ?)')
      .run(name, description ?? null);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:projects:update', (_e, { id, name, description, is_active }) => {
    db.prepare(
      `UPDATE projects
          SET name = coalesce(?, name),
              description = coalesce(?, description),
              is_active = coalesce(?, is_active),
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(name ?? null, description ?? null, is_active ?? null, id);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  ipcMain.handle('db:projects:delete', (_e, id) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('db:projects:open', (_e, id) => {
    db.prepare(
      `UPDATE projects SET last_opened_at = datetime('now') WHERE id = ?`
    ).run(id);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  ipcMain.handle('db:projects:recent', () => {
    return db
      .prepare(
        `SELECT * FROM projects
          WHERE is_active = 1 AND last_opened_at IS NOT NULL
          ORDER BY last_opened_at DESC
          LIMIT 5`
      )
      .all();
  });

  // ----------------------------------------------------------------
  // features
  // ----------------------------------------------------------------
  ipcMain.handle('db:features:list', (_e, project_id) => {
    const base = `
      SELECT f.*, sm.name AS status_name
      FROM features f
      LEFT JOIN status_master sm ON f.status_id = sm.id
      WHERE f.is_active = 1`;
    if (project_id) {
      return db.prepare(base + ' AND f.project_id = ? ORDER BY f.created_at DESC').all(project_id);
    }
    return db.prepare(base + ' ORDER BY f.created_at DESC').all();
  });

  ipcMain.handle('db:features:get', (_e, id) => {
    return db.prepare('SELECT * FROM features WHERE id = ?').get(id);
  });

  ipcMain.handle('db:features:create', (_e, { project_id, name, description, status_id }) => {
    const result = db
      .prepare(
        'INSERT INTO features (project_id, name, description, status_id) VALUES (?, ?, ?, ?)'
      )
      .run(project_id, name, description ?? null, status_id ?? null);
    return db.prepare('SELECT * FROM features WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:features:update', (_e, { id, name, description, status_id, is_active }) => {
    db.prepare(
      `UPDATE features
          SET name = coalesce(?, name),
              description = coalesce(?, description),
              status_id = coalesce(?, status_id),
              is_active = coalesce(?, is_active),
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(name ?? null, description ?? null, status_id ?? null, is_active ?? null, id);
    return db.prepare('SELECT * FROM features WHERE id = ?').get(id);
  });

  ipcMain.handle('db:features:delete', (_e, id) => {
    db.prepare('DELETE FROM features WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // user_stories
  // ----------------------------------------------------------------
  ipcMain.handle('db:user_stories:list', (_e, { feature_id, project_id } = {}) => {
    const base = `
      SELECT us.*, sm.name AS status_name
      FROM user_stories us
      LEFT JOIN status_master sm ON us.status_id = sm.id
      WHERE us.is_active = 1`;
    if (feature_id) {
      return db.prepare(base + ' AND us.feature_id = ? ORDER BY us.created_at DESC').all(feature_id);
    }
    if (project_id) {
      return db.prepare(base + ' AND us.project_id = ? ORDER BY us.created_at DESC').all(project_id);
    }
    return db.prepare(base + ' ORDER BY us.created_at DESC').all();
  });

  ipcMain.handle('db:user_stories:get', (_e, id) => {
    return db.prepare('SELECT * FROM user_stories WHERE id = ?').get(id);
  });

  ipcMain.handle(
    'db:user_stories:create',
    (_e, { feature_id, project_id, title, description, acceptance_criteria, prompt, status_id }) => {
      const result = db
        .prepare(
          `INSERT INTO user_stories
            (feature_id, project_id, title, description, acceptance_criteria, prompt, status_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          feature_id, project_id, title,
          description ?? null, acceptance_criteria ?? null,
          prompt ?? null, status_id ?? null
        );
      return db.prepare('SELECT * FROM user_stories WHERE id = ?').get(result.lastInsertRowid);
    }
  );

  ipcMain.handle(
    'db:user_stories:update',
    (_e, { id, title, description, acceptance_criteria, prompt, status_id, is_active }) => {
      db.prepare(
        `UPDATE user_stories
            SET title = coalesce(?, title),
                description = coalesce(?, description),
                acceptance_criteria = coalesce(?, acceptance_criteria),
                prompt = coalesce(?, prompt),
                status_id = coalesce(?, status_id),
                is_active = coalesce(?, is_active),
                updated_at = datetime('now')
          WHERE id = ?`
      ).run(
        title ?? null, description ?? null, acceptance_criteria ?? null,
        prompt ?? null, status_id ?? null, is_active ?? null, id
      );
      return db.prepare('SELECT * FROM user_stories WHERE id = ?').get(id);
    }
  );

  ipcMain.handle('db:user_stories:delete', (_e, id) => {
    db.prepare('DELETE FROM user_stories WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // prompt_history
  // ----------------------------------------------------------------
  ipcMain.handle('db:prompt_history:list', (_e, user_story_id) => {
    return db
      .prepare('SELECT * FROM prompt_history WHERE user_story_id = ? AND is_active = 1 ORDER BY executed_at DESC LIMIT 20')
      .all(user_story_id);
  });

  ipcMain.handle('db:prompt_history:create', (_e, { user_story_id, prompt }) => {
    const result = db
      .prepare('INSERT INTO prompt_history (user_story_id, prompt) VALUES (?, ?)')
      .run(user_story_id, prompt);
    return db.prepare('SELECT * FROM prompt_history WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:prompt_history:delete', (_e, id) => {
    db.prepare('UPDATE prompt_history SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('db:prompt_history:deleteAll', (_e, user_story_id) => {
    db.prepare('UPDATE prompt_history SET is_active = 0 WHERE user_story_id = ?').run(user_story_id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // quick_commands
  // ----------------------------------------------------------------
  ipcMain.handle('db:quick_commands:list', () => {
    return db.prepare('SELECT * FROM quick_commands WHERE is_active = 1 ORDER BY created_at ASC').all();
  });

  ipcMain.handle('db:quick_commands:create', (_e, { command, description }) => {
    const result = db
      .prepare('INSERT INTO quick_commands (command, description) VALUES (?, ?)')
      .run(command, description ?? null);
    return db.prepare('SELECT * FROM quick_commands WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:quick_commands:update', (_e, { id, command, description }) => {
    db.prepare(
      `UPDATE quick_commands SET command = coalesce(?, command), description = coalesce(?, description),
       updated_at = datetime('now') WHERE id = ?`
    ).run(command ?? null, description ?? null, id);
    return db.prepare('SELECT * FROM quick_commands WHERE id = ?').get(id);
  });

  ipcMain.handle('db:quick_commands:delete', (_e, id) => {
    db.prepare('UPDATE quick_commands SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // dialog
  // ----------------------------------------------------------------
  ipcMain.handle('dialog:openFolder', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:openJsonFile', async (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: 'Import User Stories',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return require('fs').readFileSync(result.filePaths[0], 'utf-8');
  });

  // ----------------------------------------------------------------
  // terminal
  // ----------------------------------------------------------------
  ipcMain.handle('terminal:homedir', () => require('os').homedir());

  // Quick exec used only for `cd` path resolution (short-lived, 10s max)
  ipcMain.handle('terminal:exec', (_e, { command, cwd }) => {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const proc = spawn('powershell.exe', ['-NoLogo', '-NonInteractive', '-Command', command], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: cwd || require('os').homedir(),
        env: process.env,
        windowsHide: true,
      });
      let stdout = '', stderr = '';
      proc.stdout.on('data', d => { stdout += d.toString(); });
      proc.stderr.on('data', d => { stderr += d.toString(); });
      proc.on('close', code => resolve({ stdout, stderr, exitCode: code }));
      proc.on('error', err => resolve({ stdout: '', stderr: err.message, exitCode: 1 }));
      const timer = setTimeout(() => { proc.kill(); }, 10000);
      proc.on('close', () => clearTimeout(timer));
    });
  });

  // Streaming exec — no timeout, pushes chunks back via webContents.send
  let _activeProc = null;

  const killTree = (proc) => {
    if (!proc) return;
    if (process.platform === 'win32') {
      const { execSync } = require('child_process');
      try { execSync(`taskkill /F /T /PID ${proc.pid}`, { windowsHide: true }); } catch (_) {}
    } else {
      try { proc.kill('SIGTERM'); } catch (_) {}
    }
  };

  ipcMain.handle('terminal:exec-start', (event, { command, cwd }) => {
    if (_activeProc) { killTree(_activeProc); _activeProc = null; }

    const { spawn } = require('child_process');
    const wc = event.sender;

    // Force UTF-8 code page so box-drawing chars from CMD tools (tree, etc.) render correctly
    const utf8Prefix = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; chcp 65001 | Out-Null; ';
    _activeProc = spawn('powershell.exe', ['-NoLogo', '-NonInteractive', '-Command', utf8Prefix + command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: cwd || require('os').homedir(),
      env: process.env,
      windowsHide: true,
    });

    const send = (ch, payload) => { if (!wc.isDestroyed()) wc.send(ch, payload); };

    _activeProc.stdout.on('data', d => send('terminal:data', { text: d.toString('utf8'), stream: 'stdout' }));
    _activeProc.stderr.on('data', d => send('terminal:data', { text: d.toString('utf8'), stream: 'stderr' }));
    _activeProc.on('close',  code => { _activeProc = null; send('terminal:done', { exitCode: code }); });
    _activeProc.on('error',  err  => {
      _activeProc = null;
      send('terminal:data', { text: err.message, stream: 'stderr' });
      send('terminal:done', { exitCode: 1 });
    });

    return { pid: _activeProc.pid };
  });

  ipcMain.handle('terminal:kill-active', () => {
    if (_activeProc) { killTree(_activeProc); _activeProc = null; }
  });

  // Open an interactive PowerShell window (visible, stays open)
  ipcMain.handle('terminal:open-external', (_e, { command, cwd }) => {
    const { spawn } = require('child_process');
    const fs   = require('fs');
    const os   = require('os');
    const path = require('path');
    const workDir = cwd || os.homedir();
    const safeCwd = workDir.replace(/'/g, "''");
    // Write to a temp .ps1 file — preserves newlines/here-strings that cmd.exe would strip
    const fullCmd = `Set-Location '${safeCwd}'\n${command}`;
    const tmpFile = path.join(os.tmpdir(), `ai-sdlc-run-${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, fullCmd, 'utf8');
    // Prefer pwsh (PowerShell 7); fall back to powershell.exe
    const shell = fs.existsSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
      ? 'pwsh.exe' : 'powershell.exe';
    const proc = spawn('cmd.exe', ['/c', 'start', shell, '-NoLogo', '-NoExit', '-File', tmpFile], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
      cwd: workDir,
      env: process.env,
    });
    proc.unref();
    return { pid: proc.pid };
  });
}

module.exports = { registerHandlers };
