'use strict';

const { ipcMain } = require('electron');
const { shell } = require('electron');
const os        = require('os');
const fs        = require('fs');
const path      = require('path');
const { getDb } = require('../database');

function registerDbHandlers() {
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
    db.prepare(`UPDATE projects SET last_opened_at = datetime('now') WHERE id = ?`).run(id);
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
      .prepare('INSERT INTO features (project_id, name, description, status_id) VALUES (?, ?, ?, ?)')
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
      .prepare(
        'SELECT * FROM prompt_history WHERE user_story_id = ? AND is_active = 1 ORDER BY executed_at DESC LIMIT 20'
      )
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
      `UPDATE quick_commands
          SET command = coalesce(?, command),
              description = coalesce(?, description),
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(command ?? null, description ?? null, id);
    return db.prepare('SELECT * FROM quick_commands WHERE id = ?').get(id);
  });

  ipcMain.handle('db:quick_commands:delete', (_e, id) => {
    db.prepare('UPDATE quick_commands SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // document_templates
  // ----------------------------------------------------------------
  ipcMain.handle('db:document_templates:list', () => {
    return db
      .prepare('SELECT * FROM document_templates WHERE is_active = 1 ORDER BY sort_order ASC')
      .all();
  });

  // ----------------------------------------------------------------
  // project_documents
  // ----------------------------------------------------------------
  ipcMain.handle('db:documents:list', (_e, project_id) => {
    return db
      .prepare('SELECT * FROM project_documents WHERE project_id = ? AND is_active = 1 ORDER BY created_at ASC')
      .all(project_id);
  });

  ipcMain.handle('db:documents:get', (_e, id) => {
    return db.prepare('SELECT * FROM project_documents WHERE id = ?').get(id);
  });

  ipcMain.handle('db:documents:create', (_e, { project_id, title, content }) => {
    const result = db
      .prepare('INSERT INTO project_documents (project_id, title, content) VALUES (?, ?, ?)')
      .run(project_id, title, content ?? null);
    return db.prepare('SELECT * FROM project_documents WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:documents:update', (_e, { id, title, content }) => {
    db.prepare(
      `UPDATE project_documents
          SET title   = coalesce(?, title),
              content = ?,
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(title ?? null, content ?? null, id);
    return db.prepare('SELECT * FROM project_documents WHERE id = ?').get(id);
  });

  ipcMain.handle('db:documents:delete', (_e, id) => {
    db.prepare('UPDATE project_documents SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // document_attachments
  // ----------------------------------------------------------------
  ipcMain.handle('db:attachments:list', (_e, document_id) => {
    return db
      .prepare('SELECT id, document_id, name, type, is_active, created_at FROM document_attachments WHERE document_id = ? AND is_active = 1 ORDER BY created_at ASC')
      .all(document_id);
  });

  ipcMain.handle('db:attachments:get', (_e, id) => {
    return db.prepare('SELECT * FROM document_attachments WHERE id = ?').get(id);
  });

  ipcMain.handle('db:attachments:create', (_e, { document_id, name, type, content }) => {
    const result = db
      .prepare('INSERT INTO document_attachments (document_id, name, type, content) VALUES (?, ?, ?, ?)')
      .run(document_id, name, type ?? 'svg', content ?? '');
    return db.prepare('SELECT id, document_id, name, type, created_at FROM document_attachments WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:attachments:update', (_e, { id, name, content }) => {
    db.prepare(
      `UPDATE document_attachments SET name = coalesce(?, name), content = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(name ?? null, content, id);
    return db.prepare('SELECT id, document_id, name, type, created_at FROM document_attachments WHERE id = ?').get(id);
  });

  ipcMain.handle('db:attachments:delete', (_e, id) => {
    db.prepare('UPDATE document_attachments SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('db:attachments:getContent', (_e, id) => {
    const row = db.prepare('SELECT content, name, type FROM document_attachments WHERE id = ?').get(id);
    return row ?? null;
  });

  // ----------------------------------------------------------------
  // draw.io — open in desktop app via temp file
  // ----------------------------------------------------------------
  ipcMain.handle('shell:openDrawio', async (_e, { id, name, content }) => {
    const dir  = path.join(os.tmpdir(), 'electron-ai-sdlc');
    fs.mkdirSync(dir, { recursive: true });
    const safe = name.replace(/[^a-z0-9_\-]/gi, '_');
    const file = path.join(dir, `${safe}_${id}.drawio`);
    fs.writeFileSync(file, content, 'utf8');
    await shell.openPath(file);
    return file;
  });

  ipcMain.handle('shell:readFile', (_e, filepath) => {
    try { return fs.readFileSync(filepath, 'utf8'); }
    catch { return null; }
  });
}

module.exports = { registerDbHandlers };
