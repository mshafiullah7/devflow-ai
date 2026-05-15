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

  ipcMain.handle('db:projects:update', (_e, { id, name, description, is_active, design_template, project_path }) => {
    db.prepare(
      `UPDATE projects
          SET name = coalesce(?, name),
              description = coalesce(?, description),
              is_active = coalesce(?, is_active),
              design_template = CASE WHEN ? IS NOT NULL THEN ? ELSE design_template END,
              project_path = CASE WHEN ? IS NOT NULL THEN ? ELSE project_path END,
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(
      name ?? null,
      description ?? null,
      is_active ?? null,
      design_template ?? null, design_template ?? null,
      project_path ?? null, project_path ?? null,
      id
    );
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

  ipcMain.handle('db:projects:setPath', (_e, { id, project_path }) => {
    db.prepare(`UPDATE projects SET project_path = ?, updated_at = datetime('now') WHERE id = ?`).run(project_path, id);
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
  ipcMain.handle('db:user_stories:list', (_e, { feature_id, project_id, include_extracted = false } = {}) => {
    const base = `
      SELECT us.*, sm.name AS status_name
      FROM user_stories us
      LEFT JOIN status_master sm ON us.status_id = sm.id
      WHERE us.is_active = 1${include_extracted ? '' : ' AND us.is_extracted = 0'}`;
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
    (_e, { feature_id, project_id, title, description, acceptance_criteria, status_id, is_extracted = 0, priority, estimated_hours, remaining_hours, target_date }) => {
      const result = db
        .prepare(
          `INSERT INTO user_stories
            (feature_id, project_id, title, description, acceptance_criteria, status_id, is_extracted, priority, estimated_hours, remaining_hours, target_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          feature_id, project_id, title,
          description ?? null, acceptance_criteria ?? null,
          status_id ?? null, is_extracted,
          priority ?? 'medium',
          estimated_hours ?? null, remaining_hours ?? null, target_date ?? null
        );
      return db.prepare('SELECT * FROM user_stories WHERE id = ?').get(result.lastInsertRowid);
    }
  );

  ipcMain.handle(
    'db:user_stories:update',
    (_e, data) => {
      const { id, title, description, acceptance_criteria, status_id, is_active, is_extracted,
              priority, estimated_hours, remaining_hours, target_date } = data;
      const sets = ["updated_at = datetime('now')"];
      const params = [];
      if (title             !== undefined) { sets.push('title = ?');               params.push(title ?? null); }
      if ('description'     in data)       { sets.push('description = ?');          params.push(description ?? null); }
      if ('acceptance_criteria' in data)   { sets.push('acceptance_criteria = ?');  params.push(acceptance_criteria ?? null); }
      if (status_id         !== undefined) { sets.push('status_id = ?');            params.push(status_id ?? null); }
      if (is_active         !== undefined) { sets.push('is_active = ?');            params.push(is_active ?? null); }
      if (is_extracted      !== undefined) { sets.push('is_extracted = ?');         params.push(is_extracted ?? null); }
      if (priority          !== undefined) { sets.push('priority = ?');             params.push(priority ?? 'medium'); }
      if ('estimated_hours' in data)       { sets.push('estimated_hours = ?');      params.push(estimated_hours ?? null); }
      if ('remaining_hours' in data)       { sets.push('remaining_hours = ?');      params.push(remaining_hours ?? null); }
      if ('target_date'     in data)       { sets.push('target_date = ?');          params.push(target_date ?? null); }
      params.push(id);
      db.prepare(`UPDATE user_stories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
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
  // screen_prompt_history
  // ----------------------------------------------------------------
  ipcMain.handle('db:screen_prompt_history:list', (_e, { project_id, screen_design_id }) => {
    return db
      .prepare('SELECT * FROM screen_prompt_history WHERE project_id = ? AND screen_design_id = ? AND is_active = 1 ORDER BY executed_at DESC LIMIT 20')
      .all(project_id, screen_design_id);
  });

  ipcMain.handle('db:screen_prompt_history:create', (_e, { project_id, screen_design_id, prompt }) => {
    const result = db
      .prepare('INSERT INTO screen_prompt_history (project_id, screen_design_id, prompt) VALUES (?, ?, ?)')
      .run(project_id, screen_design_id, prompt);
    return db.prepare('SELECT * FROM screen_prompt_history WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:screen_prompt_history:delete', (_e, id) => {
    db.prepare('UPDATE screen_prompt_history SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('db:screen_prompt_history:deleteAll', (_e, { project_id, screen_design_id }) => {
    db.prepare('UPDATE screen_prompt_history SET is_active = 0 WHERE project_id = ? AND screen_design_id = ?').run(project_id, screen_design_id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // prompts
  // ----------------------------------------------------------------
  ipcMain.handle('db:prompts:list', (_e, user_story_id) => {
    return db.prepare(
      'SELECT * FROM prompts WHERE user_story_id = ? AND is_active = 1 ORDER BY created_at ASC'
    ).all(user_story_id);
  });

  ipcMain.handle('db:prompts:create', (_e, { user_story_id, tag, prompt }) => {
    const result = db.prepare(
      'INSERT INTO prompts (user_story_id, tag, prompt) VALUES (?, ?, ?)'
    ).run(user_story_id, tag ?? null, prompt);
    return db.prepare('SELECT * FROM prompts WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:prompts:update', (_e, { id, tag, prompt, is_executed }) => {
    db.prepare(
      `UPDATE prompts SET tag = coalesce(?, tag), prompt = coalesce(?, prompt),
       is_executed = CASE WHEN ? IS NOT NULL THEN ? ELSE is_executed END,
       updated_at = datetime('now') WHERE id = ?`
    ).run(tag ?? null, prompt ?? null, is_executed ?? null, is_executed ?? null, id);
    return db.prepare('SELECT * FROM prompts WHERE id = ?').get(id);
  });

  ipcMain.handle('db:prompts:delete', (_e, id) => {
    db.prepare(`UPDATE prompts SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // test_run_history
  // ----------------------------------------------------------------
  ipcMain.handle('testRunHistory:list', (_e, project_id) => {
    return db.prepare(
      `SELECT * FROM test_run_history WHERE project_id = ? ORDER BY ran_at DESC LIMIT 20`
    ).all(project_id);
  });

  ipcMain.handle('testRunHistory:create', (_e, { project_id, framework, command, passed, failed, skipped, duration, output, exit_code }) => {
    db.prepare(
      `INSERT INTO test_run_history (project_id, framework, command, passed, failed, skipped, duration, output, exit_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      project_id,
      framework  ?? null,
      command,
      passed     ?? null,
      failed     ?? null,
      skipped    ?? null,
      duration   ?? null,
      output     ?? null,
      exit_code  ?? 0
    );
    // Keep only the latest 20 runs per project
    db.prepare(
      `DELETE FROM test_run_history
        WHERE project_id = ?
          AND id NOT IN (
            SELECT id FROM test_run_history
             WHERE project_id = ?
             ORDER BY ran_at DESC
             LIMIT 20
          )`
    ).run(project_id, project_id);
  });

  // ----------------------------------------------------------------
  // testRunner — framework detection
  // ----------------------------------------------------------------
  ipcMain.handle('testRunner:detect', (_e, projectPath) => {
    if (!projectPath) return [];
    const exists  = (p) => { try { return fs.existsSync(p); } catch { return false; } };
    const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
    const commands = [];

    // Flutter
    if (exists(path.join(projectPath, 'pubspec.yaml'))) {
      commands.push({ id: 'flutter-test',    label: 'flutter test',                   cmd: 'flutter test',                   framework: 'Flutter' });
      commands.push({ id: 'flutter-verbose', label: 'flutter test --reporter expanded', cmd: 'flutter test --reporter expanded', framework: 'Flutter' });
    }

    // Node-based projects
    const pkgPath = path.join(projectPath, 'package.json');
    if (exists(pkgPath)) {
      const pkg     = readJson(pkgPath) || {};
      const scripts = pkg.scripts || {};
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      const isAngular    = exists(path.join(projectPath, 'angular.json'));
      const hasCypress   = !!allDeps['cypress'] ||
                           exists(path.join(projectPath, 'cypress.json')) ||
                           exists(path.join(projectPath, 'cypress.config.js')) ||
                           exists(path.join(projectPath, 'cypress.config.ts')) ||
                           exists(path.join(projectPath, 'cypress.config.mjs'));
      const hasPlaywright = !!allDeps['@playwright/test'] || !!allDeps['playwright'];
      const hasJest       = !!allDeps['jest'] || !!allDeps['@jest/core'];
      const fwLabel       = isAngular ? 'Angular' : 'Node';

      // Cypress
      if (hasCypress) {
        if (scripts['e2e'])      commands.push({ id: 'e2e',      label: 'npm run e2e',      cmd: 'npm run e2e',      framework: `${fwLabel} / Cypress` });
        if (scripts['cy:run'])   commands.push({ id: 'cy-run',   label: 'npm run cy:run',   cmd: 'npm run cy:run',   framework: `${fwLabel} / Cypress` });
        if (scripts['test:e2e']) commands.push({ id: 'test-e2e', label: 'npm run test:e2e', cmd: 'npm run test:e2e', framework: `${fwLabel} / Cypress` });
        if (!scripts['e2e'] && !scripts['cy:run'] && !scripts['test:e2e'])
          commands.push({ id: 'cypress-run', label: 'npx cypress run', cmd: 'npx cypress run', framework: `${fwLabel} / Cypress` });
      }

      // Playwright
      if (hasPlaywright) {
        if (scripts['test:e2e']) commands.push({ id: 'pw-e2e',    label: 'npm run test:e2e',    cmd: 'npm run test:e2e',    framework: 'Playwright' });
        else                     commands.push({ id: 'playwright', label: 'npx playwright test', cmd: 'npx playwright test', framework: 'Playwright' });
      }

      // Unit tests
      if (scripts['test']) {
        const fw     = isAngular ? 'Angular / Karma' : hasJest ? 'Jest' : fwLabel;
        const suffix = isAngular ? ' --no-watch' : hasJest ? ' -- --watchAll=false' : '';
        commands.push({ id: 'test', label: 'npm test', cmd: `npm test${suffix}`, framework: fw });
      }
      if (scripts['test:unit']) commands.push({ id: 'test-unit', label: 'npm run test:unit', cmd: 'npm run test:unit', framework: hasJest ? 'Jest' : fwLabel });

      // Angular CLI
      if (isAngular)
        commands.push({ id: 'ng-test', label: 'ng test --no-watch', cmd: 'npx ng test --no-watch --browsers=ChromeHeadless', framework: 'Angular / Karma' });
    }

    return commands;
  });

  // ----------------------------------------------------------------
  // issues
  // ----------------------------------------------------------------
  ipcMain.handle('db:issues:list', (_e, { project_id, feature_id, user_story_id, status, severity } = {}) => {
    let sql = `
      SELECT i.*,
             us.title AS story_title,
             f.name   AS feature_name
        FROM issues i
        LEFT JOIN user_stories us ON i.user_story_id = us.id
        LEFT JOIN features f      ON i.feature_id = f.id
       WHERE i.is_active = 1`;
    const params = [];
    if (project_id)    { sql += ' AND i.project_id = ?';     params.push(project_id); }
    if (feature_id)    { sql += ' AND i.feature_id = ?';     params.push(feature_id); }
    if (user_story_id) { sql += ' AND i.user_story_id = ?';  params.push(user_story_id); }
    if (status)        { sql += ' AND i.status = ?';         params.push(status); }
    if (severity)      { sql += ' AND i.severity = ?';       params.push(severity); }
    sql += ' ORDER BY i.created_at DESC';
    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('db:issues:get', (_e, id) => {
    return db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  });

  ipcMain.handle('db:issues:create', (_e, { project_id, feature_id, user_story_id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, status }) => {
    const result = db.prepare(`
      INSERT INTO issues (project_id, feature_id, user_story_id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project_id,
      feature_id      ?? null,
      user_story_id   ?? null,
      title,
      description          ?? null,
      steps_to_reproduce   ?? null,
      expected_behavior    ?? null,
      actual_behavior      ?? null,
      severity ?? 'medium',
      status   ?? 'open'
    );
    return db.prepare(`
      SELECT i.*, us.title AS story_title, f.name AS feature_name
        FROM issues i
        LEFT JOIN user_stories us ON i.user_story_id = us.id
        LEFT JOIN features f      ON i.feature_id = f.id
       WHERE i.id = ?
    `).get(result.lastInsertRowid);
  });

  ipcMain.handle('db:issues:update', (_e, { id, feature_id, user_story_id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, status, is_active }) => {
    db.prepare(`
      UPDATE issues
         SET feature_id         = CASE WHEN ? IS NOT NULL THEN ? ELSE feature_id END,
             user_story_id      = CASE WHEN ? IS NOT NULL THEN ? ELSE user_story_id END,
             title              = coalesce(?, title),
             description        = coalesce(?, description),
             steps_to_reproduce = coalesce(?, steps_to_reproduce),
             expected_behavior  = coalesce(?, expected_behavior),
             actual_behavior    = ?,
             severity           = coalesce(?, severity),
             status             = coalesce(?, status),
             is_active          = coalesce(?, is_active),
             updated_at         = datetime('now')
       WHERE id = ?
    `).run(
      feature_id    ?? null, feature_id    ?? null,
      user_story_id ?? null, user_story_id ?? null,
      title               ?? null,
      description         ?? null,
      steps_to_reproduce  ?? null,
      expected_behavior   ?? null,
      actual_behavior     ?? null,
      severity  ?? null,
      status    ?? null,
      is_active ?? null,
      id
    );
    return db.prepare(`
      SELECT i.*, us.title AS story_title, f.name AS feature_name
        FROM issues i
        LEFT JOIN user_stories us ON i.user_story_id = us.id
        LEFT JOIN features f      ON i.feature_id = f.id
       WHERE i.id = ?
    `).get(id);
  });

  ipcMain.handle('db:issues:delete', (_e, id) => {
    db.prepare(`UPDATE issues SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    return { success: true };
  });

  ipcMain.handle('db:issues:count', (_e, project_id) => {
    const total    = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND is_active = 1`).get(project_id)?.n ?? 0;
    const open     = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND is_active = 1 AND status = 'open'`).get(project_id)?.n ?? 0;
    const resolved = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND is_active = 1 AND status = 'resolved'`).get(project_id)?.n ?? 0;
    return { total, open, resolved };
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
  // model_configs
  // ----------------------------------------------------------------
  ipcMain.handle('db:model_configs:list', () => {
    return db.prepare('SELECT * FROM model_configs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
  });

  ipcMain.handle('db:model_configs:get', (_e, id) => {
    return db.prepare('SELECT * FROM model_configs WHERE id = ?').get(id);
  });

  ipcMain.handle('db:model_configs:create', (_e, data) => {
    const { label, type, executable, flags, input_mode, base_url, api_key, model_name, max_tokens, is_default, sort_order, gemini_api_key, claude_api_key, fallback_preference } = data;
    // Clear existing default if setting new default
    if (is_default) db.prepare('UPDATE model_configs SET is_default = 0').run();
    const result = db.prepare(`
      INSERT INTO model_configs (label, type, executable, flags, input_mode, base_url, api_key, model_name, max_tokens, is_default, sort_order, gemini_api_key, claude_api_key, fallback_preference)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      label, type ?? 'cli',
      executable ?? null, flags ?? null, input_mode ?? 'pipe',
      base_url ?? null, api_key ?? null, model_name ?? null, max_tokens ?? null,
      is_default ? 1 : 0, sort_order ?? 0,
      gemini_api_key ?? null, claude_api_key ?? null, fallback_preference ?? 'auto'
    );
    return db.prepare('SELECT * FROM model_configs WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:model_configs:update', (_e, data) => {
    const { id, label, type, executable, flags, input_mode, base_url, api_key, model_name, max_tokens, is_default, sort_order, gemini_api_key, claude_api_key, fallback_preference } = data;
    if (is_default) db.prepare('UPDATE model_configs SET is_default = 0 WHERE id != ?').run(id);
    db.prepare(`
      UPDATE model_configs
         SET label              = coalesce(?, label),
             type               = coalesce(?, type),
             executable         = ?,
             flags              = ?,
             input_mode         = coalesce(?, input_mode),
             base_url           = ?,
             api_key            = ?,
             model_name         = ?,
             max_tokens         = ?,
             is_default         = coalesce(?, is_default),
             sort_order         = coalesce(?, sort_order),
             gemini_api_key     = ?,
             claude_api_key     = ?,
             fallback_preference = coalesce(?, fallback_preference),
             updated_at         = datetime('now')
       WHERE id = ?
    `).run(
      label ?? null, type ?? null,
      executable ?? null, flags ?? null, input_mode ?? null,
      base_url ?? null, api_key ?? null, model_name ?? null, max_tokens ?? null,
      is_default != null ? (is_default ? 1 : 0) : null,
      sort_order ?? null,
      gemini_api_key ?? null, claude_api_key ?? null, fallback_preference ?? null,
      id
    );
    return db.prepare('SELECT * FROM model_configs WHERE id = ?').get(id);
  });

  ipcMain.handle('db:model_configs:delete', (_e, id) => {
    db.prepare('UPDATE model_configs SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('db:model_configs:setDefault', (_e, id) => {
    db.prepare('UPDATE model_configs SET is_default = 0').run();
    db.prepare('UPDATE model_configs SET is_default = 1 WHERE id = ?').run(id);
    return db.prepare('SELECT * FROM model_configs WHERE id = ?').get(id);
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
  // screen_designs
  // ----------------------------------------------------------------
  ipcMain.handle('db:screen_designs:list', (_e, project_id) => {
    return db
      .prepare('SELECT * FROM screen_designs WHERE project_id = ? AND is_active = 1 ORDER BY created_at DESC')
      .all(project_id);
  });

  ipcMain.handle('db:screen_designs:get', (_e, id) => {
    return db.prepare('SELECT * FROM screen_designs WHERE id = ?').get(id);
  });

  ipcMain.handle('db:screen_designs:create', (_e, { project_id, title, description, tech_stack, html_content, prompt_used, model_used }) => {
    const result = db
      .prepare(`INSERT INTO screen_designs (project_id, title, description, tech_stack, html_content, prompt_used, model_used)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(project_id, title, description ?? null, tech_stack ?? 'html', html_content ?? '', prompt_used ?? null, model_used ?? null);
    return db.prepare('SELECT * FROM screen_designs WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:screen_designs:update', (_e, { id, title, description, tech_stack, html_content, prompt_used, model_used }) => {
    db.prepare(
      `UPDATE screen_designs
          SET title        = coalesce(?, title),
              description  = coalesce(?, description),
              tech_stack   = coalesce(?, tech_stack),
              html_content = coalesce(?, html_content),
              prompt_used  = coalesce(?, prompt_used),
              model_used   = coalesce(?, model_used),
              updated_at   = datetime('now')
        WHERE id = ?`
    ).run(title ?? null, description ?? null, tech_stack ?? null, html_content ?? null, prompt_used ?? null, model_used ?? null, id);
    return db.prepare('SELECT * FROM screen_designs WHERE id = ?').get(id);
  });

  ipcMain.handle('db:screen_designs:delete', (_e, id) => {
    db.prepare('UPDATE screen_designs SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
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
    const err = await shell.openPath(file);
    if (err) {
      return { file, error: err };
    }
    return { file };
  });

  ipcMain.handle('shell:readFile', (_e, filepath) => {
    try { return fs.readFileSync(filepath, 'utf8'); }
    catch { return null; }
  });

  ipcMain.handle('shell:writeFile', (_e, { filepath, content }) => {
    try {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, content, 'utf8');
      return true;
    } catch { return false; }
  });

  // ----------------------------------------------------------------
  // prompt_queue
  // ----------------------------------------------------------------
  ipcMain.handle('db:prompt_queue:list', (_e, { project_id }) => {
    return db.prepare(`
      SELECT * FROM prompt_queue
      WHERE project_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `).all(project_id);
  });

  ipcMain.handle('db:prompt_queue:add', (_e, { project_id, user_story_id, story_title, prompt_id, tag, prompt_text }) => {
    const max = db.prepare('SELECT MAX(sort_order) AS m FROM prompt_queue WHERE project_id = ?').get(project_id);
    const sort_order = (max?.m ?? -1) + 1;
    const result = db.prepare(`
      INSERT INTO prompt_queue (project_id, user_story_id, story_title, prompt_id, tag, prompt_text, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, user_story_id ?? null, story_title ?? null, prompt_id ?? null, tag ?? null, prompt_text, sort_order);
    return db.prepare('SELECT * FROM prompt_queue WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:prompt_queue:update', (_e, { id, status, output, exit_code, ran_at, model_label }) => {
    db.prepare(`
      UPDATE prompt_queue
         SET status      = CASE WHEN ? IS NOT NULL THEN ? ELSE status END,
             output      = CASE WHEN ? IS NOT NULL THEN ? ELSE output END,
             exit_code   = CASE WHEN ? IS NOT NULL THEN ? ELSE exit_code END,
             ran_at      = CASE WHEN ? IS NOT NULL THEN ? ELSE ran_at END,
             model_label = CASE WHEN ? IS NOT NULL THEN ? ELSE model_label END
       WHERE id = ?
    `).run(
      status      ?? null, status      ?? null,
      output      ?? null, output      ?? null,
      exit_code   ?? null, exit_code   ?? null,
      ran_at      ?? null, ran_at      ?? null,
      model_label ?? null, model_label ?? null,
      id
    );
    return db.prepare('SELECT * FROM prompt_queue WHERE id = ?').get(id);
  });

  ipcMain.handle('db:prompt_queue:delete', (_e, id) => {
    db.prepare('DELETE FROM prompt_queue WHERE id = ?').run(id);
    return { success: true };
  });

  ipcMain.handle('db:prompt_queue:clear_done', (_e, project_id) => {
    db.prepare(`DELETE FROM prompt_queue WHERE project_id = ? AND status IN ('done','failed','skipped')`).run(project_id);
    return { success: true };
  });

  ipcMain.handle('db:prompt_queue:pending_count', (_e, project_id) => {
    return db.prepare(`SELECT COUNT(*) AS count FROM prompt_queue WHERE project_id = ? AND status = 'pending'`).get(project_id)?.count ?? 0;
  });

  // ----------------------------------------------------------------
  // prompt_queue_messages
  // ----------------------------------------------------------------
  ipcMain.handle('db:pq_messages:list', (_e, queue_item_id) => {
    return db.prepare(
      'SELECT * FROM prompt_queue_messages WHERE queue_item_id = ? ORDER BY id ASC'
    ).all(queue_item_id);
  });

  ipcMain.handle('db:pq_messages:add', (_e, { queue_item_id, role, content }) => {
    const res = db.prepare(
      'INSERT INTO prompt_queue_messages (queue_item_id, role, content) VALUES (?, ?, ?)'
    ).run(queue_item_id, role, content);
    return db.prepare('SELECT * FROM prompt_queue_messages WHERE id = ?').get(res.lastInsertRowid);
  });

  ipcMain.handle('db:pq_messages:clear', (_e, queue_item_id) => {
    db.prepare('DELETE FROM prompt_queue_messages WHERE queue_item_id = ?').run(queue_item_id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // saved_themes (global library, shared across all projects)
  // ----------------------------------------------------------------
  ipcMain.handle('db:saved_themes:list', () => {
    return db.prepare('SELECT * FROM saved_themes WHERE is_active = 1 ORDER BY created_at DESC').all();
  });

  ipcMain.handle('db:saved_themes:create', (_e, { name, light, dark }) => {
    const result = db
      .prepare('INSERT INTO saved_themes (name, light, dark) VALUES (?, ?, ?)')
      .run(name, light ?? '', dark ?? '');
    return db.prepare('SELECT * FROM saved_themes WHERE id = ?').get(result.lastInsertRowid);
  });

  ipcMain.handle('db:saved_themes:delete', (_e, id) => {
    db.prepare('UPDATE saved_themes SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // model_mapping
  // ----------------------------------------------------------------
  ipcMain.handle('db:model_mapping:get', (_e, pageKey) => {
    return db.prepare('SELECT model_config_id FROM model_mapping WHERE page_key = ?').get(pageKey) ?? null;
  });

  ipcMain.handle('db:model_mapping:set', (_e, pageKey, modelConfigId) => {
    db.prepare(`
      INSERT INTO model_mapping (page_key, model_config_id, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(page_key) DO UPDATE
        SET model_config_id = excluded.model_config_id,
            updated_at = excluded.updated_at
    `).run(pageKey, modelConfigId || null);
  });

  ipcMain.handle('app:writeTempFiles', (_e, files) => {
    const dir = path.join(os.tmpdir(), 'electron-ai-sdlc');
    fs.mkdirSync(dir, { recursive: true });
    const ts = Date.now();
    return files.map(({ name, content }) => {
      const filepath = path.join(dir, `${name}-${ts}`);
      fs.writeFileSync(filepath, content, 'utf8');
      return filepath;
    });
  });
}

module.exports = { registerDbHandlers };
