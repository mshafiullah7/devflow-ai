'use strict';

const { ipcMain, BrowserWindow } = require('electron');
const { shell } = require('electron');
const { safeHandle } = require('../../ipc-safe-handle');

function broadcastToAll(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}
const os        = require('os');
const fs        = require('fs');
const path      = require('path');
const { getDb } = require('../database');

function registerDbHandlers() {
  const db = getDb();

  // ----------------------------------------------------------------
  // status_master
  // ----------------------------------------------------------------
  safeHandle('db:status:list', () => {
    return db.prepare('SELECT * FROM status_master WHERE is_active = 1 ORDER BY sort_order').all();
  });

  // ----------------------------------------------------------------
  // projects
  // ----------------------------------------------------------------
  safeHandle('db:projects:list', () => {
    return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  });

  safeHandle('db:projects:get', (_e, id) => {
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  safeHandle('db:projects:create', (_e, { name, description }) => {
    const result = db
      .prepare('INSERT INTO projects (name, description) VALUES (?, ?)')
      .run(name, description ?? null);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:projects:update', (_e, { id, name, description, is_active, design_template, project_path }) => {
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

  safeHandle('db:projects:delete', (_e, id) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return { success: true };
  });

  safeHandle('db:projects:open', (_e, id) => {
    db.prepare(`UPDATE projects SET last_opened_at = datetime('now') WHERE id = ?`).run(id);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  safeHandle('db:projects:setPath', (_e, { id, project_path }) => {
    db.prepare(`UPDATE projects SET project_path = ?, updated_at = datetime('now') WHERE id = ?`).run(project_path, id);
    return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  });

  safeHandle('db:projects:recent', () => {
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
  // workflows
  // ----------------------------------------------------------------
  safeHandle('db:workflows:list', (_e, project_id) => {
    const sql = 'SELECT * FROM workflows WHERE is_active = 1 AND project_id = ? ORDER BY created_at ASC';
    return db.prepare(sql).all(project_id);
  });

  safeHandle('db:workflows:get', (_e, id) => {
    return db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  });

  safeHandle('db:workflows:create', (_e, { project_id, workflow_id, feature, description, screen_design_id, workflow_type }) => {
    const wfId = workflow_id || require('crypto').randomUUID();
    const result = db.prepare(
      'INSERT INTO workflows (project_id, workflow_id, feature, description, screen_design_id, workflow_type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(project_id, wfId, feature, description ?? null, screen_design_id ?? null, workflow_type ?? 'feature');
    const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(result.lastInsertRowid);
    broadcastToAll('workflow:workflowsChanged', { projectId: project_id });
    return wf;
  });

  safeHandle('db:workflows:update', (_e, args) => {
    const { id, workflow_id, feature, description, is_active } = args;
    // screen_design_id uses a flag so null can explicitly clear the link
    const hasPage = Object.prototype.hasOwnProperty.call(args, 'screen_design_id');
    const pageFlag = hasPage ? 1 : null;
    db.prepare(
      `UPDATE workflows
          SET workflow_id      = CASE WHEN ? IS NOT NULL THEN ? ELSE workflow_id END,
              feature          = CASE WHEN ? IS NOT NULL THEN ? ELSE feature END,
              description      = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
              screen_design_id = CASE WHEN ? IS NOT NULL THEN ? ELSE screen_design_id END,
              is_active        = CASE WHEN ? IS NOT NULL THEN ? ELSE is_active END,
              updated_at       = datetime('now')
        WHERE id = ?`
    ).run(
      workflow_id ?? null, workflow_id ?? null,
      feature     ?? null, feature     ?? null,
      description ?? null, description ?? null,
      pageFlag, args.screen_design_id ?? null,
      is_active   ?? null, is_active   ?? null,
      id
    );
    return db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
  });

  safeHandle('db:workflows:delete', (_e, id) => {
    db.prepare(`UPDATE workflows SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    return { success: true };
  });

  // open | in_progress | completed
  safeHandle('db:workflows:updateStatus', (_e, { id, status }) => {
    db.prepare(`UPDATE workflows SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(id);
    broadcastToAll('workflow:workflowsChanged', { projectId: wf?.project_id });
    return wf;
  });

  // ----------------------------------------------------------------
  // success_criteria
  // ----------------------------------------------------------------
  safeHandle('db:success_criteria:list', (_e, workflow_id) => {
    return db.prepare(
      'SELECT * FROM success_criteria WHERE workflow_id = ? AND is_active = 1 ORDER BY created_at ASC'
    ).all(workflow_id);
  });

  safeHandle('db:success_criteria:create', (_e, { workflow_id, description }) => {
    const result = db.prepare(
      'INSERT INTO success_criteria (workflow_id, description) VALUES (?, ?)'
    ).run(workflow_id, description);
    return db.prepare('SELECT * FROM success_criteria WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:success_criteria:update', (_e, { id, description }) => {
    db.prepare(
      `UPDATE success_criteria SET description = coalesce(?, description), updated_at = datetime('now') WHERE id = ?`
    ).run(description ?? null, id);
    return db.prepare('SELECT * FROM success_criteria WHERE id = ?').get(id);
  });

  safeHandle('db:success_criteria:delete', (_e, id) => {
    db.prepare(`UPDATE success_criteria SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // layers (workflow layers)
  // ----------------------------------------------------------------
  safeHandle('db:layers:list', (_e, workflow_id) => {
    return db.prepare(
      'SELECT * FROM layers WHERE workflow_id = ? AND is_active = 1 ORDER BY order_num ASC'
    ).all(workflow_id);
  });

  safeHandle('db:layers:get', (_e, id) => {
    return db.prepare('SELECT * FROM layers WHERE id = ?').get(id);
  });

  safeHandle('db:layers:create', (_e, { workflow_id, layer, order_num, purpose, inputs, outputs, prompt, project_layer_id }) => {
    const result = db.prepare(
      'INSERT INTO layers (workflow_id, project_layer_id, layer, order_num, purpose, inputs, outputs, prompt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      workflow_id, project_layer_id ?? null,
      layer, order_num ?? 1,
      purpose ?? null,
      inputs  != null ? JSON.stringify(Array.isArray(inputs)  ? inputs  : [inputs])  : null,
      outputs != null ? JSON.stringify(Array.isArray(outputs) ? outputs : [outputs]) : null,
      prompt  ?? null
    );
    return db.prepare('SELECT * FROM layers WHERE id = ?').get(result.lastInsertRowid);
  });

  // Recalculates and persists the workflow status based on its active layers.
  // completed: all layers are executed/needs_review (none open, none failed)
  // in_progress: at least one layer attempted (executed/needs_review/failed) but not all succeeded
  // open: all layers still open
  function recalcWorkflowStatus(workflowId) {
    const SUCCESS  = ['executed', 'needs_review'];
    const ATTEMPTED = ['executed', 'needs_review', 'failed'];
    const layers = db.prepare(`SELECT status FROM layers WHERE workflow_id = ? AND is_active = 1`).all(workflowId);
    if (!layers.length) return;
    const anyAttempted = layers.some(l => ATTEMPTED.includes(l.status));
    const allSucceeded = layers.every(l => SUCCESS.includes(l.status));
    const newStatus = allSucceeded ? 'completed' : anyAttempted ? 'in_progress' : 'open';
    const wf = db.prepare('SELECT * FROM workflows WHERE id = ?').get(workflowId);
    if (wf && wf.status !== newStatus) {
      db.prepare(`UPDATE workflows SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, workflowId);
      broadcastToAll('workflow:workflowsChanged', { projectId: wf.project_id });
    }
  }

  safeHandle('db:layers:update', (_e, args) => {
    const { id, layer, order_num, purpose, inputs, outputs, prompt, is_active, status } = args;
    const hasProjectLayer = Object.prototype.hasOwnProperty.call(args, 'project_layer_id');
    const plFlag = hasProjectLayer ? 1 : null;
    db.prepare(
      `UPDATE layers
          SET project_layer_id = CASE WHEN ? IS NOT NULL THEN ? ELSE project_layer_id END,
              layer     = CASE WHEN ? IS NOT NULL THEN ? ELSE layer END,
              order_num = CASE WHEN ? IS NOT NULL THEN ? ELSE order_num END,
              purpose   = CASE WHEN ? IS NOT NULL THEN ? ELSE purpose END,
              inputs    = CASE WHEN ? IS NOT NULL THEN ? ELSE inputs END,
              outputs   = CASE WHEN ? IS NOT NULL THEN ? ELSE outputs END,
              prompt    = CASE WHEN ? IS NOT NULL THEN ? ELSE prompt END,
              is_active = CASE WHEN ? IS NOT NULL THEN ? ELSE is_active END,
              status    = CASE WHEN ? IS NOT NULL THEN ? ELSE status END,
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(
      plFlag, args.project_layer_id ?? null,
      layer     ?? null, layer     ?? null,
      order_num ?? null, order_num ?? null,
      purpose   ?? null, purpose   ?? null,
      inputs  != null ? JSON.stringify(Array.isArray(inputs)  ? inputs  : [inputs])  : null,
      inputs  != null ? JSON.stringify(Array.isArray(inputs)  ? inputs  : [inputs])  : null,
      outputs != null ? JSON.stringify(Array.isArray(outputs) ? outputs : [outputs]) : null,
      outputs != null ? JSON.stringify(Array.isArray(outputs) ? outputs : [outputs]) : null,
      prompt    ?? null, prompt    ?? null,
      is_active ?? null, is_active ?? null,
      status    ?? null, status    ?? null,
      id
    );
    const updatedLayer = db.prepare('SELECT * FROM layers WHERE id = ?').get(id);
    // When status was explicitly included in the update, fire the same events as updateStatus
    if (status != null && updatedLayer?.workflow_id) {
      broadcastToAll('workflow:layerStatusChanged', { layerId: id, workflowId: updatedLayer.workflow_id, status: updatedLayer.status });
      recalcWorkflowStatus(updatedLayer.workflow_id);
    }
    return updatedLayer;
  });

  safeHandle('db:layers:delete', (_e, id) => {
    db.prepare(`UPDATE layers SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    return { success: true };
  });

  // open | executed | failed | needs_review
  safeHandle('db:layers:updateStatus', (_e, { id, status }) => {
    db.prepare(`UPDATE layers SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    const layer = db.prepare('SELECT * FROM layers WHERE id = ?').get(id);
    broadcastToAll('workflow:layerStatusChanged', { layerId: id, workflowId: layer?.workflow_id, status });
    if (layer?.workflow_id) recalcWorkflowStatus(layer.workflow_id);
    return layer;
  });

  // Returns { total, completed } across all workflow layers for a project
  safeHandle('db:layers:countByProject', (_e, project_id) => {
    const row = db.prepare(`
      SELECT
        COUNT(*)                                                AS total,
        SUM(CASE WHEN l.status = 'executed' THEN 1 ELSE 0 END) AS completed
      FROM layers l
      INNER JOIN workflows w ON l.workflow_id = w.id
      WHERE w.project_id = ? AND l.is_active = 1 AND w.is_active = 1
    `).get(project_id);
    return { total: row?.total ?? 0, completed: row?.completed ?? 0 };
  });

  // Returns [{ id, name, sort_order, total, open, running, executed, failed, needs_review }] — one row per project layer
  safeHandle('db:layers:statsByProjectLayer', (_e, project_id) => {
    return db.prepare(`
      SELECT
        pl.id,
        pl.name,
        pl.sort_order,
        COUNT(l.id)                                                              AS total,
        SUM(CASE WHEN l.id IS NOT NULL AND (l.status IS NULL OR l.status = 'open') THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN l.status = 'running'      THEN 1 ELSE 0 END)              AS running,
        SUM(CASE WHEN l.status = 'executed'     THEN 1 ELSE 0 END)              AS executed,
        SUM(CASE WHEN l.status = 'failed'       THEN 1 ELSE 0 END)              AS failed,
        SUM(CASE WHEN l.status = 'needs_review' THEN 1 ELSE 0 END)              AS needs_review
      FROM project_layers pl
      LEFT JOIN layers l
        ON  l.project_layer_id = pl.id
        AND l.is_active = 1
        AND l.workflow_id IN (
              SELECT id FROM workflows
               WHERE project_id = ? AND is_active = 1
            )
      WHERE pl.project_id = ? AND pl.is_active = 1
      GROUP BY pl.id, pl.name, pl.sort_order
      ORDER BY pl.sort_order ASC, pl.name ASC
    `).all(project_id, project_id);
  });

  // ----------------------------------------------------------------
  // screen_prompt_history
  // ----------------------------------------------------------------
  safeHandle('db:screen_prompt_history:list', (_e, { project_id, screen_design_id }) => {
    return db
      .prepare('SELECT * FROM screen_prompt_history WHERE project_id = ? AND screen_design_id = ? AND is_active = 1 ORDER BY executed_at DESC LIMIT 20')
      .all(project_id, screen_design_id);
  });

  safeHandle('db:screen_prompt_history:create', (_e, { project_id, screen_design_id, prompt }) => {
    const result = db
      .prepare('INSERT INTO screen_prompt_history (project_id, screen_design_id, prompt) VALUES (?, ?, ?)')
      .run(project_id, screen_design_id, prompt);
    return db.prepare('SELECT * FROM screen_prompt_history WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:screen_prompt_history:delete', (_e, id) => {
    db.prepare('UPDATE screen_prompt_history SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  safeHandle('db:screen_prompt_history:deleteAll', (_e, { project_id, screen_design_id }) => {
    db.prepare('UPDATE screen_prompt_history SET is_active = 0 WHERE project_id = ? AND screen_design_id = ?').run(project_id, screen_design_id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // workflow_layer_prompt_history
  // ----------------------------------------------------------------
  safeHandle('db:workflow_layer_prompt_history:list', (_e, { project_id, layer_id }) => {
    return db
      .prepare('SELECT * FROM workflow_layer_prompt_history WHERE project_id = ? AND layer_id = ? AND is_active = 1 ORDER BY executed_at DESC LIMIT 20')
      .all(project_id, layer_id);
  });

  safeHandle('db:workflow_layer_prompt_history:create', (_e, { project_id, layer_id, prompt }) => {
    const result = db
      .prepare('INSERT INTO workflow_layer_prompt_history (project_id, layer_id, prompt) VALUES (?, ?, ?)')
      .run(project_id, layer_id, prompt);
    return db.prepare('SELECT * FROM workflow_layer_prompt_history WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:workflow_layer_prompt_history:delete', (_e, id) => {
    db.prepare('UPDATE workflow_layer_prompt_history SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  safeHandle('db:workflow_layer_prompt_history:deleteAll', (_e, { project_id, layer_id }) => {
    db.prepare('UPDATE workflow_layer_prompt_history SET is_active = 0 WHERE project_id = ? AND layer_id = ?').run(project_id, layer_id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // test_run_history
  // ----------------------------------------------------------------
  safeHandle('testRunHistory:list', (_e, project_id) => {
    return db.prepare(
      `SELECT * FROM test_run_history WHERE project_id = ? ORDER BY ran_at DESC LIMIT 20`
    ).all(project_id);
  });

  safeHandle('testRunHistory:create', (_e, { project_id, framework, command, passed, failed, skipped, duration, output, exit_code, coverage, layer_id }) => {
    db.prepare(
      `INSERT INTO test_run_history (project_id, framework, command, passed, failed, skipped, duration, output, exit_code, coverage, layer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      project_id,
      framework  ?? null,
      command,
      passed     ?? null,
      failed     ?? null,
      skipped    ?? null,
      duration   ?? null,
      output     ?? null,
      exit_code  ?? 0,
      coverage   ?? null,
      layer_id   ?? null
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
  safeHandle('testRunner:detect', (_e, projectPath) => {
    if (!projectPath) return [];
    const exists   = (p) => { try { return fs.existsSync(p); } catch { return false; } };
    const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
    const listDir  = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
    const commands = [];

    // Flutter
    if (exists(path.join(projectPath, 'pubspec.yaml'))) {
      commands.push({ id: 'flutter-test',    label: 'flutter test',                    cmd: 'flutter test',                    framework: 'Flutter' });
      commands.push({ id: 'flutter-verbose', label: 'flutter test --reporter expanded', cmd: 'flutter test --reporter expanded', framework: 'Flutter' });
    }

    // Python / pytest
    const hasPyProject = exists(path.join(projectPath, 'pyproject.toml'));
    const hasPipfile   = exists(path.join(projectPath, 'Pipfile'));
    const hasReqs      = exists(path.join(projectPath, 'requirements.txt'));
    const hasSetupPy   = exists(path.join(projectPath, 'setup.py'));
    if (hasPyProject || hasPipfile || hasReqs || hasSetupPy) {
      commands.push({ id: 'pytest',         label: 'pytest',          cmd: 'pytest',         framework: 'pytest' });
      commands.push({ id: 'pytest-verbose', label: 'pytest -v',       cmd: 'pytest -v',      framework: 'pytest' });
      commands.push({ id: 'python-m-pytest',label: 'python -m pytest',cmd: 'python -m pytest', framework: 'pytest' });
    }

    // Go
    if (exists(path.join(projectPath, 'go.mod'))) {
      commands.push({ id: 'go-test',         label: 'go test ./...',        cmd: 'go test ./...',        framework: 'Go' });
      commands.push({ id: 'go-test-verbose', label: 'go test -v ./...',     cmd: 'go test -v ./...',     framework: 'Go' });
    }

    // Ruby / RSpec
    if (exists(path.join(projectPath, 'Gemfile'))) {
      commands.push({ id: 'rspec',    label: 'bundle exec rspec', cmd: 'bundle exec rspec', framework: 'RSpec' });
      commands.push({ id: 'rspec-f',  label: 'rspec --format doc', cmd: 'bundle exec rspec --format doc', framework: 'RSpec' });
    }

    // Node-based projects — walk up one level to find package.json if not in projectPath
    let pkgRoot = projectPath;
    let pkgPath = path.join(pkgRoot, 'package.json');
    if (!exists(pkgPath)) {
      const parent = path.dirname(pkgRoot);
      if (parent !== pkgRoot && exists(path.join(parent, 'package.json'))) {
        pkgRoot = parent;
        pkgPath = path.join(pkgRoot, 'package.json');
      }
    }

    if (exists(pkgPath)) {
      const pkg     = readJson(pkgPath) || {};
      const scripts = pkg.scripts || {};
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      const isAngular  = exists(path.join(pkgRoot, 'angular.json'));
      const isNuxt     = exists(path.join(pkgRoot, 'nuxt.config.js')) ||
                         exists(path.join(pkgRoot, 'nuxt.config.ts')) ||
                         exists(path.join(pkgRoot, 'nuxt.config.mjs'));
      const hasJest    = !!allDeps['jest'] || !!allDeps['@jest/core'];
      const hasVitest  = !!allDeps['vitest'] || !!allDeps['@vitest/ui'] ||
                         Object.values(scripts).some(s => /\bvitest\b/.test(s));

      const fwFor = (scriptVal) => {
        if (isAngular) return 'Angular / Karma';
        if (hasVitest || /\bvitest\b/.test(scriptVal || '')) return isNuxt ? 'Nuxt / Vitest' : 'Vitest';
        if (hasJest)   return 'Jest';
        return isNuxt ? 'Nuxt' : 'Node';
      };

      // Collect unit-test-ish script names (exclude e2e / cypress / playwright)
      const unitScriptNames = ['test', 'test:unit', 'test:run', 'unit', 'unit:test', 'vitest'];
      for (const name of unitScriptNames) {
        if (!scripts[name]) continue;
        const val = scripts[name];
        const isE2e = /cypress|playwright|e2e/i.test(val);
        if (isE2e) continue;
        const fw     = fwFor(val);
        const isVt   = hasVitest || /\bvitest\b/.test(val);
        const isJest = !isVt && hasJest;
        const suffix = isAngular ? ' --no-watch' : isJest ? ' -- --watchAll=false' : '';
        const cmd    = `npm run ${name}${suffix}`;
        commands.push({ id: `script-${name}`, label: `npm run ${name}`, cmd, framework: fw });
      }

      // Angular CLI
      if (isAngular)
        commands.push({ id: 'ng-test', label: 'ng test --no-watch', cmd: 'npx ng test --no-watch --browsers=ChromeHeadless', framework: 'Angular / Karma' });

      // Bare vitest if no script matched but vitest is installed
      if (hasVitest && !commands.some(c => /vitest/i.test(c.cmd))) {
        const fw = isNuxt ? 'Nuxt / Vitest' : 'Vitest';
        commands.push({ id: 'vitest-run',     label: 'npx vitest run',              cmd: 'npx vitest run',              framework: fw });
        commands.push({ id: 'vitest-verbose', label: 'npx vitest run --reporter verbose', cmd: 'npx vitest run --reporter verbose', framework: fw });
      }
    }

    // .NET (xUnit / NUnit / MSTest) — detected via .sln or any .csproj
    const hasSln    = listDir(projectPath).some(f => f.endsWith('.sln'));
    const hasCsproj = listDir(projectPath).some(f => f.endsWith('.csproj'));
    if (hasSln || hasCsproj) {
      commands.push({ id: 'dotnet-test',         label: 'dotnet test',               cmd: 'dotnet test',               framework: '.NET' });
      commands.push({ id: 'dotnet-test-verbose', label: 'dotnet test --verbosity n', cmd: 'dotnet test --verbosity n', framework: '.NET' });
    }

    return commands;
  });

  // ----------------------------------------------------------------
  // issues
  // ----------------------------------------------------------------
  safeHandle('db:issues:list', (_e, { project_id, status, severity } = {}) => {
    let sql = `
      SELECT i.*, pl.name AS layer_name
        FROM issues i
        LEFT JOIN project_layers pl ON i.layer_id = pl.id
       WHERE i.is_active = 1`;
    const params = [];
    if (project_id) { sql += ' AND i.project_id = ?'; params.push(project_id); }
    if (status)     { sql += ' AND i.status = ?';     params.push(status); }
    if (severity)   { sql += ' AND i.severity = ?';   params.push(severity); }
    sql += ' ORDER BY i.created_at DESC';
    return db.prepare(sql).all(...params);
  });

  safeHandle('db:issues:get', (_e, id) => {
    return db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
  });

  safeHandle('db:issues:create', (_e, { project_id, layer_id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, status, type }) => {
    const result = db.prepare(`
      INSERT INTO issues (project_id, layer_id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, status, type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      project_id,
      layer_id             ?? null,
      title,
      description          ?? null,
      steps_to_reproduce   ?? null,
      expected_behavior    ?? null,
      actual_behavior      ?? null,
      severity ?? 'medium',
      status   ?? 'open',
      type     ?? 'issue'
    );
    return db.prepare(`
      SELECT i.*, pl.name AS layer_name
        FROM issues i
        LEFT JOIN project_layers pl ON i.layer_id = pl.id
       WHERE i.id = ?
    `).get(result.lastInsertRowid);
  });

  safeHandle('db:issues:update', (_e, { id, layer_id, title, description, steps_to_reproduce, expected_behavior, actual_behavior, severity, status, is_active, type }) => {
    db.prepare(`
      UPDATE issues
         SET layer_id           = CASE WHEN ? IS NOT NULL THEN ? ELSE layer_id END,
             title              = coalesce(?, title),
             description        = coalesce(?, description),
             steps_to_reproduce = coalesce(?, steps_to_reproduce),
             expected_behavior  = coalesce(?, expected_behavior),
             actual_behavior    = ?,
             severity           = coalesce(?, severity),
             status             = coalesce(?, status),
             is_active          = coalesce(?, is_active),
             type               = CASE WHEN ? IS NOT NULL THEN ? ELSE type END,
             updated_at         = datetime('now')
       WHERE id = ?
    `).run(
      layer_id      ?? null, layer_id      ?? null,
      title               ?? null,
      description         ?? null,
      steps_to_reproduce  ?? null,
      expected_behavior   ?? null,
      actual_behavior     ?? null,
      severity  ?? null,
      status    ?? null,
      is_active ?? null,
      type      ?? null, type ?? null,
      id
    );
    return db.prepare(`
      SELECT i.*, pl.name AS layer_name
        FROM issues i
        LEFT JOIN project_layers pl ON i.layer_id = pl.id
       WHERE i.id = ?
    `).get(id);
  });

  safeHandle('db:issues:delete', (_e, id) => {
    db.prepare(`UPDATE issues SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    return { success: true };
  });

  safeHandle('db:issues:count', (_e, project_id) => {
    const total       = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND is_active = 1`).get(project_id)?.n ?? 0;
    const open        = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND is_active = 1 AND status = 'open'`).get(project_id)?.n ?? 0;
    const in_progress = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND is_active = 1 AND status = 'in_progress'`).get(project_id)?.n ?? 0;
    const resolved    = db.prepare(`SELECT COUNT(*) AS n FROM issues WHERE project_id = ? AND is_active = 1 AND status = 'resolved'`).get(project_id)?.n ?? 0;
    return { total, open, in_progress, resolved };
  });

  // ----------------------------------------------------------------
  // quick_commands
  // ----------------------------------------------------------------
  safeHandle('db:quick_commands:list', () => {
    return db.prepare('SELECT * FROM quick_commands WHERE is_active = 1 ORDER BY created_at ASC').all();
  });

  safeHandle('db:quick_commands:create', (_e, { command, description }) => {
    const result = db
      .prepare('INSERT INTO quick_commands (command, description) VALUES (?, ?)')
      .run(command, description ?? null);
    return db.prepare('SELECT * FROM quick_commands WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:quick_commands:update', (_e, { id, command, description }) => {
    db.prepare(
      `UPDATE quick_commands
          SET command = coalesce(?, command),
              description = coalesce(?, description),
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(command ?? null, description ?? null, id);
    return db.prepare('SELECT * FROM quick_commands WHERE id = ?').get(id);
  });

  safeHandle('db:quick_commands:delete', (_e, id) => {
    db.prepare('UPDATE quick_commands SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // model_configs
  // ----------------------------------------------------------------
  safeHandle('db:model_configs:list', () => {
    return db.prepare('SELECT * FROM model_configs WHERE is_active = 1 ORDER BY sort_order ASC, id ASC').all();
  });

  safeHandle('db:model_configs:get', (_e, id) => {
    return db.prepare('SELECT * FROM model_configs WHERE id = ?').get(id);
  });

  safeHandle('db:model_configs:create', (_e, data) => {
    const { label, type, executable, flags, input_mode, base_url, api_key, model_name, max_tokens, is_default, sort_order, use_devflow_agent } = data;
    // Clear existing default if setting new default
    if (is_default) db.prepare('UPDATE model_configs SET is_default = 0').run();
    const result = db.prepare(`
      INSERT INTO model_configs (label, type, executable, flags, input_mode, base_url, api_key, model_name, max_tokens, is_default, sort_order, use_devflow_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      label, type ?? 'cli',
      executable ?? null, flags ?? null, input_mode ?? 'pipe',
      base_url ?? null, api_key ?? null, model_name ?? null, max_tokens ?? null,
      is_default ? 1 : 0, sort_order ?? 0,
      use_devflow_agent ? 1 : 0
    );
    return db.prepare('SELECT * FROM model_configs WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:model_configs:update', (_e, data) => {
    const { id, label, type, executable, flags, input_mode, base_url, api_key, model_name, max_tokens, is_default, sort_order, use_devflow_agent } = data;
    if (is_default) db.prepare('UPDATE model_configs SET is_default = 0 WHERE id != ?').run(id);
    db.prepare(`
      UPDATE model_configs
         SET label             = coalesce(?, label),
             type              = coalesce(?, type),
             executable        = ?,
             flags             = ?,
             input_mode        = coalesce(?, input_mode),
             base_url          = ?,
             api_key           = ?,
             model_name        = ?,
             max_tokens        = ?,
             is_default        = coalesce(?, is_default),
             sort_order        = coalesce(?, sort_order),
             use_devflow_agent = coalesce(?, use_devflow_agent),
             updated_at        = datetime('now')
       WHERE id = ?
    `).run(
      label ?? null, type ?? null,
      executable ?? null, flags ?? null, input_mode ?? null,
      base_url ?? null, api_key ?? null, model_name ?? null, max_tokens ?? null,
      is_default != null ? (is_default ? 1 : 0) : null,
      sort_order ?? null,
      use_devflow_agent != null ? (use_devflow_agent ? 1 : 0) : null,
      id
    );
    return db.prepare('SELECT * FROM model_configs WHERE id = ?').get(id);
  });

  safeHandle('db:model_configs:delete', (_e, id) => {
    db.prepare('UPDATE model_configs SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  safeHandle('db:model_configs:setDefault', (_e, id) => {
    db.prepare('UPDATE model_configs SET is_default = 0').run();
    db.prepare('UPDATE model_configs SET is_default = 1 WHERE id = ?').run(id);
    return db.prepare('SELECT * FROM model_configs WHERE id = ?').get(id);
  });

  // ----------------------------------------------------------------
  // document_templates
  // ----------------------------------------------------------------
  safeHandle('db:document_templates:list', () => {
    return db
      .prepare('SELECT * FROM document_templates WHERE is_active = 1 ORDER BY group_name, sort_order, name ASC')
      .all();
  });

  safeHandle('db:document_templates:get', (_e, id) => {
    return db.prepare('SELECT * FROM document_templates WHERE id = ?').get(id);
  });

  safeHandle('db:document_templates:create', (_e, { group_name, name, description, template_text, sort_order }) => {
    const result = db
      .prepare('INSERT INTO document_templates (group_name, name, description, template_text, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(group_name ?? 'General', name, description ?? null, template_text ?? '', sort_order ?? 0);
    return db.prepare('SELECT * FROM document_templates WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:document_templates:update', (_e, { id, group_name, name, description, template_text, sort_order }) => {
    db.prepare(
      `UPDATE document_templates
          SET group_name    = coalesce(?, group_name),
              name          = coalesce(?, name),
              description   = ?,
              template_text = coalesce(?, template_text),
              sort_order    = coalesce(?, sort_order),
              updated_at    = datetime('now')
        WHERE id = ?`
    ).run(
      group_name ?? null,
      name ?? null,
      description ?? null,
      template_text ?? null,
      sort_order ?? null,
      id
    );
    return db.prepare('SELECT * FROM document_templates WHERE id = ?').get(id);
  });

  safeHandle('db:document_templates:delete', (_e, id) => {
    db.prepare('DELETE FROM document_templates WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // project_documents
  // ----------------------------------------------------------------
  safeHandle('db:documents:list', (_e, project_id) => {
    return db
      .prepare('SELECT * FROM project_documents WHERE project_id = ? AND is_active = 1 ORDER BY created_at ASC')
      .all(project_id);
  });

  safeHandle('db:documents:get', (_e, id) => {
    return db.prepare('SELECT * FROM project_documents WHERE id = ?').get(id);
  });

  safeHandle('db:documents:create', (_e, { project_id, title, content }) => {
    const result = db
      .prepare('INSERT INTO project_documents (project_id, title, content) VALUES (?, ?, ?)')
      .run(project_id, title, content ?? null);
    return db.prepare('SELECT * FROM project_documents WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:documents:update', (_e, { id, title, content }) => {
    db.prepare(
      `UPDATE project_documents
          SET title   = coalesce(?, title),
              content = ?,
              updated_at = datetime('now')
        WHERE id = ?`
    ).run(title ?? null, content ?? null, id);
    return db.prepare('SELECT * FROM project_documents WHERE id = ?').get(id);
  });

  safeHandle('db:documents:delete', (_e, id) => {
    db.prepare('UPDATE project_documents SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // document_attachments
  // ----------------------------------------------------------------
  safeHandle('db:attachments:list', (_e, document_id) => {
    return db
      .prepare('SELECT id, document_id, name, type, is_active, created_at FROM document_attachments WHERE document_id = ? AND is_active = 1 ORDER BY created_at ASC')
      .all(document_id);
  });

  safeHandle('db:attachments:get', (_e, id) => {
    return db.prepare('SELECT * FROM document_attachments WHERE id = ?').get(id);
  });

  safeHandle('db:attachments:create', (_e, { document_id, name, type, content }) => {
    const result = db
      .prepare('INSERT INTO document_attachments (document_id, name, type, content) VALUES (?, ?, ?, ?)')
      .run(document_id, name, type ?? 'svg', content ?? '');
    return db.prepare('SELECT id, document_id, name, type, created_at FROM document_attachments WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:attachments:update', (_e, { id, name, content }) => {
    db.prepare(
      `UPDATE document_attachments SET name = coalesce(?, name), content = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(name ?? null, content, id);
    return db.prepare('SELECT id, document_id, name, type, created_at FROM document_attachments WHERE id = ?').get(id);
  });

  safeHandle('db:attachments:delete', (_e, id) => {
    db.prepare('UPDATE document_attachments SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  safeHandle('db:attachments:getContent', (_e, id) => {
    const row = db.prepare('SELECT content, name, type FROM document_attachments WHERE id = ?').get(id);
    return row ?? null;
  });

  // ----------------------------------------------------------------
  // screen_designs
  // ----------------------------------------------------------------
  safeHandle('db:screen_designs:list', (_e, project_id) => {
    return db
      .prepare('SELECT * FROM screen_designs WHERE project_id = ? AND is_active = 1 ORDER BY created_at DESC')
      .all(project_id);
  });

  safeHandle('db:screen_designs:get', (_e, id) => {
    return db.prepare('SELECT * FROM screen_designs WHERE id = ?').get(id);
  });

  safeHandle('db:screen_designs:create', (_e, { project_id, title, description, tech_stack, html_content, queued, executed }) => {
    const result = db
      .prepare(`INSERT INTO screen_designs (project_id, title, description, tech_stack, html_content, queued, executed)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(project_id, title, description ?? null, tech_stack ?? 'html', html_content ?? '', queued ?? 0, executed ?? 0);
    return db.prepare('SELECT * FROM screen_designs WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:screen_designs:update', (_e, { id, title, description, tech_stack, html_content, queued, executed, style_valid, style_issues }) => {
    db.prepare(
      `UPDATE screen_designs
          SET title        = coalesce(?, title),
              description  = coalesce(?, description),
              tech_stack   = coalesce(?, tech_stack),
              html_content = coalesce(?, html_content),
              queued       = CASE WHEN ? IS NOT NULL THEN ? ELSE queued END,
              executed     = CASE WHEN ? IS NOT NULL THEN ? ELSE executed END,
              style_valid  = CASE WHEN ? IS NOT NULL THEN ? ELSE style_valid END,
              style_issues = CASE WHEN ? IS NOT NULL THEN ? ELSE style_issues END,
              updated_at   = datetime('now')
        WHERE id = ?`
    ).run(title ?? null, description ?? null, tech_stack ?? null, html_content ?? null,
          queued ?? null, queued ?? null, executed ?? null, executed ?? null,
          style_valid ?? null, style_valid ?? null, style_issues ?? null, style_issues ?? null, id);
    return db.prepare('SELECT * FROM screen_designs WHERE id = ?').get(id);
  });

  safeHandle('db:screen_designs:delete', (_e, id) => {
    db.prepare('UPDATE screen_designs SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  safeHandle('db:screen_designs:setDartFilePath', (_e, { id, dart_file_path }) => {
    db.prepare(`UPDATE screen_designs SET dart_file_path = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(dart_file_path ?? null, id);
    return db.prepare('SELECT * FROM screen_designs WHERE id = ?').get(id);
  });

  // ----------------------------------------------------------------
  // draw.io — open in desktop app via temp file
  // ----------------------------------------------------------------
  safeHandle('shell:openDrawio', async (_e, { id, name, content }) => {
    const dir  = path.join(os.tmpdir(), 'devflow-ai-sdlc');
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

  safeHandle('shell:readFile', (_e, filepath) => {
    try { return fs.readFileSync(filepath, 'utf8'); }
    catch { return null; }
  });

  safeHandle('shell:statFile', (_e, filepath) => {
    try {
      const s = fs.statSync(filepath);
      return { mtimeMs: s.mtimeMs };
    } catch { return null; }
  });

  safeHandle('shell:writeFile', (_e, { filepath, content }) => {
    try {
      fs.mkdirSync(path.dirname(filepath), { recursive: true });
      fs.writeFileSync(filepath, content, 'utf8');
      return true;
    } catch { return false; }
  });

  safeHandle('shell:notifyTestFileSaved', () => {
    broadcastToAll('testGen:fileSaved', {});
  });

  safeHandle('shell:listFiles', (_e, { dirPath, extensions }) => {
    try {
      const SKIP_DIRS = new Set([
        'node_modules', '.git', 'dist', 'build', 'out', '.dart_tool',
        '__pycache__', '.next', 'coverage', '.nuxt', '.angular', 'bin', 'obj',
        '__tests__', 'test', 'tests',
      ]);
      const results = [];
      const walk = (dir, depth) => {
        if (depth > 6) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          if (e.isDirectory()) {
            if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), depth + 1);
          } else if (e.isFile()) {
            const ext = path.extname(e.name).toLowerCase();
            if (extensions.includes(ext)) {
              results.push(path.relative(dirPath, path.join(dir, e.name)).replace(/\\/g, '/'));
            }
          }
        }
      };
      walk(dirPath, 0);
      results.sort();
      return results;
    } catch { return null; }
  });

  // ----------------------------------------------------------------
  // prompt_queue
  // ----------------------------------------------------------------
  safeHandle('db:prompt_queue:list', (_e, { project_id }) => {
    return db.prepare(`
      SELECT pq.*, pl.name AS layer_name, pl.folder_path AS layer_folder_path
        FROM prompt_queue pq
        LEFT JOIN project_layers pl ON pq.layer_id = pl.id
       WHERE pq.project_id = ?
       ORDER BY pq.sort_order ASC, pq.created_at ASC
    `).all(project_id);
  });

  safeHandle('db:prompt_queue:add', (_e, { project_id, user_story_id, story_title, prompt_id, tag, prompt_text, layer_id }) => {
    const max = db.prepare('SELECT MAX(sort_order) AS m FROM prompt_queue WHERE project_id = ?').get(project_id);
    const sort_order = (max?.m ?? -1) + 1;
    const result = db.prepare(`
      INSERT INTO prompt_queue (project_id, user_story_id, story_title, prompt_id, tag, prompt_text, sort_order, layer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(project_id, user_story_id ?? null, story_title ?? null, prompt_id ?? null, tag ?? null, prompt_text, sort_order, layer_id ?? null);

    return db.prepare('SELECT * FROM prompt_queue WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:prompt_queue:update', (_e, { id, status, output, exit_code, ran_at, model_label, commit_sha }) => {
    db.prepare(`
      UPDATE prompt_queue
         SET status      = CASE WHEN ? IS NOT NULL THEN ? ELSE status END,
             output      = CASE WHEN ? IS NOT NULL THEN ? ELSE output END,
             exit_code   = CASE WHEN ? IS NOT NULL THEN ? ELSE exit_code END,
             ran_at      = CASE WHEN ? IS NOT NULL THEN ? ELSE ran_at END,
             model_label = CASE WHEN ? IS NOT NULL THEN ? ELSE model_label END,
             commit_sha  = CASE WHEN ? IS NOT NULL THEN ? ELSE commit_sha END
       WHERE id = ?
    `).run(
      status      ?? null, status      ?? null,
      output      ?? null, output      ?? null,
      exit_code   ?? null, exit_code   ?? null,
      ran_at      ?? null, ran_at      ?? null,
      model_label ?? null, model_label ?? null,
      commit_sha  ?? null, commit_sha  ?? null,
      id
    );
    return db.prepare('SELECT * FROM prompt_queue WHERE id = ?').get(id);
  });

  safeHandle('db:prompt_queue:delete', (_e, id) => {
    db.prepare('DELETE FROM prompt_queue WHERE id = ?').run(id);
    return { success: true };
  });

  safeHandle('db:prompt_queue:clear_done', (_e, project_id) => {
    db.prepare(`DELETE FROM prompt_queue WHERE project_id = ? AND status IN ('done','failed','skipped')`).run(project_id);
    return { success: true };
  });

  safeHandle('db:prompt_queue:pending_count', (_e, project_id) => {
    return db.prepare(`SELECT COUNT(*) AS count FROM prompt_queue WHERE project_id = ? AND status = 'pending'`).get(project_id)?.count ?? 0;
  });

  // ----------------------------------------------------------------
  // prompt_queue_messages
  // ----------------------------------------------------------------
  safeHandle('db:pq_messages:list', (_e, queue_item_id) => {
    return db.prepare(
      'SELECT * FROM prompt_queue_messages WHERE queue_item_id = ? ORDER BY id ASC'
    ).all(queue_item_id);
  });

  safeHandle('db:pq_messages:add', (_e, { queue_item_id, role, content }) => {
    const res = db.prepare(
      'INSERT INTO prompt_queue_messages (queue_item_id, role, content) VALUES (?, ?, ?)'
    ).run(queue_item_id, role, content);
    return db.prepare('SELECT * FROM prompt_queue_messages WHERE id = ?').get(res.lastInsertRowid);
  });

  safeHandle('db:pq_messages:clear', (_e, queue_item_id) => {
    db.prepare('DELETE FROM prompt_queue_messages WHERE queue_item_id = ?').run(queue_item_id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // saved_themes (global library, shared across all projects)
  // ----------------------------------------------------------------
  safeHandle('db:saved_themes:list', () => {
    return db.prepare('SELECT * FROM saved_themes WHERE is_active = 1 ORDER BY created_at DESC').all();
  });

  safeHandle('db:saved_themes:create', (_e, { name, light, dark }) => {
    const result = db
      .prepare('INSERT INTO saved_themes (name, light, dark) VALUES (?, ?, ?)')
      .run(name, light ?? '', dark ?? '');
    return db.prepare('SELECT * FROM saved_themes WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:saved_themes:delete', (_e, id) => {
    db.prepare('UPDATE saved_themes SET is_active = 0 WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // model_mapping
  // ----------------------------------------------------------------
  safeHandle('db:model_mapping:get', (_e, pageKey) => {
    return db.prepare('SELECT model_config_id FROM model_mapping WHERE page_key = ?').get(pageKey) ?? null;
  });

  safeHandle('db:model_mapping:set', (_e, pageKey, modelConfigId) => {
    db.prepare(`
      INSERT INTO model_mapping (page_key, model_config_id, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(page_key) DO UPDATE
        SET model_config_id = excluded.model_config_id,
            updated_at = excluded.updated_at
    `).run(pageKey, modelConfigId || null);
  });

  // ----------------------------------------------------------------
  // project_layers
  // ----------------------------------------------------------------
  safeHandle('db:project_layers:list', (_e, project_id) => {
    return db
      .prepare('SELECT * FROM project_layers WHERE is_active = 1 AND project_id = ? ORDER BY sort_order ASC, created_at ASC')
      .all(project_id);
  });

  safeHandle('db:project_layers:get', (_e, id) => {
    return db.prepare('SELECT * FROM project_layers WHERE id = ?').get(id);
  });

  safeHandle('db:project_layers:create', (_e, { project_id, name, description, folder_path, setup_instructions, sort_order }) => {
    const result = db
      .prepare('INSERT INTO project_layers (project_id, name, description, folder_path, setup_instructions, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
      .run(project_id, name, description ?? null, folder_path ?? null, setup_instructions ?? null, sort_order ?? 0);
    return db.prepare('SELECT * FROM project_layers WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:project_layers:update', (_e, { id, name, description, folder_path, setup_instructions, sort_order }) => {
    db.prepare(
      `UPDATE project_layers
          SET name               = CASE WHEN ? IS NOT NULL THEN ? ELSE name END,
              description        = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
              folder_path        = CASE WHEN ? IS NOT NULL THEN ? ELSE folder_path END,
              setup_instructions = CASE WHEN ? IS NOT NULL THEN ? ELSE setup_instructions END,
              sort_order         = CASE WHEN ? IS NOT NULL THEN ? ELSE sort_order END,
              updated_at         = datetime('now')
        WHERE id = ?`
    ).run(
      name ?? null, name ?? null,
      description ?? null, description ?? null,
      folder_path ?? null, folder_path ?? null,
      setup_instructions ?? null, setup_instructions ?? null,
      sort_order ?? null, sort_order ?? null,
      id
    );
    return db.prepare('SELECT * FROM project_layers WHERE id = ?').get(id);
  });

  safeHandle('db:project_layers:delete', (_e, id) => {
    db.prepare('DELETE FROM project_layers WHERE id = ?').run(id);
    return { success: true };
  });

  // ----------------------------------------------------------------
  // screen_templates
  // ----------------------------------------------------------------
  safeHandle('db:screen_templates:list', () => {
    return db.prepare('SELECT * FROM screen_templates WHERE is_active = 1 ORDER BY group_name, sort_order, name').all();
  });

  safeHandle('db:screen_templates:get', (_e, id) => {
    return db.prepare('SELECT * FROM screen_templates WHERE id = ?').get(id);
  });

  safeHandle('db:screen_templates:create', (_e, { group_name, name, description, sort_order }) => {
    const result = db
      .prepare('INSERT INTO screen_templates (group_name, name, description, sort_order) VALUES (?, ?, ?, ?)')
      .run(group_name ?? 'General', name, description ?? '', sort_order ?? 0);
    return db.prepare('SELECT * FROM screen_templates WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('db:screen_templates:update', (_e, { id, group_name, name, description, sort_order }) => {
    db.prepare(
      `UPDATE screen_templates
          SET group_name  = CASE WHEN ? IS NOT NULL THEN ? ELSE group_name END,
              name        = CASE WHEN ? IS NOT NULL THEN ? ELSE name END,
              description = CASE WHEN ? IS NOT NULL THEN ? ELSE description END,
              sort_order  = CASE WHEN ? IS NOT NULL THEN ? ELSE sort_order END,
              updated_at  = datetime('now')
        WHERE id = ?`
    ).run(
      group_name ?? null, group_name ?? null,
      name ?? null, name ?? null,
      description ?? null, description ?? null,
      sort_order ?? null, sort_order ?? null,
      id
    );
    return db.prepare('SELECT * FROM screen_templates WHERE id = ?').get(id);
  });

  safeHandle('db:screen_templates:delete', (_e, id) => {
    db.prepare('DELETE FROM screen_templates WHERE id = ?').run(id);
    return { success: true };
  });

  safeHandle('db:screen_templates:seed', (_e, templates) => {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO screen_templates (group_name, name, description, sort_order) VALUES (?, ?, ?, ?)'
    );
    const insertMany = db.transaction((rows) => {
      rows.forEach((t, i) => insert.run(t.group, t.name, t.description, i));
    });
    insertMany(templates);
    return db.prepare('SELECT * FROM screen_templates WHERE is_active = 1 ORDER BY group_name, sort_order, name').all();
  });

  safeHandle('app:writeTempFiles', (_e, files) => {
    const base  = path.join(os.tmpdir(), 'devflow-ai-sdlc');
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    try {
      for (const entry of fs.readdirSync(base)) {
        const ts = Number(entry);
        if (ts && ts < cutoff) {
          fs.rmSync(path.join(base, entry), { recursive: true, force: true });
        }
      }
    } catch {}

    const dir = path.join(base, String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    return files.map(({ name, content }) => {
      const filepath = path.join(dir, name);
      fs.writeFileSync(filepath, content, 'utf8');
      return filepath;
    });
  });

  safeHandle('app:deleteTempDir', (_e, dirPath) => {
    try {
      if (dirPath && dirPath.includes('devflow-ai-sdlc')) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {}
  });

  // ----------------------------------------------------------------
  // AI Chat — read-only SELECT queries (project-scoped)
  // ----------------------------------------------------------------
  safeHandle('db:ai-query', (_e, { sql }) => {
    const trimmed = (sql || '').trim();

    if (!/^SELECT\b/i.test(trimmed)) {
      throw new Error('Only SELECT statements are permitted');
    }

    const blocked = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|REPLACE|ATTACH|DETACH|PRAGMA)\b/i;
    if (blocked.test(trimmed)) {
      throw new Error('Statement contains disallowed keywords');
    }

    try {
      const rows = db.prepare(trimmed).all();
      return rows.slice(0, 100);
    } catch (err) {
      throw new Error(`Query failed: ${err.message}`);
    }
  });
}

module.exports = { registerDbHandlers };
