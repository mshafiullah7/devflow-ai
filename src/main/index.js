'use strict';

const { app, BrowserWindow, Menu, ipcMain, session, screen } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');
const { registerHandlers } = require('./db/ipc');
const { closeDb } = require('./db/database');
const { openWorkflowWindow }          = require('./workflow-window');
const { openIssueRunnerWindow }       = require('./issue-runner-window');
const { openTerminalWindow }          = require('./terminal-window');
const { runBackup, exportDb, restoreDb } = require('./db/backup');
const { getConfigValue, setConfigValue, getCloudSyncConfig, setCloudSyncConfig, getTelegramConfig, setTelegramConfig } = require('./app-config');
const { sendMessage: telegramSend } = require('./telegram');
const { logError } = require('./logger');
const { setupAutoUpdater } = require('./updater');

process.on('uncaughtException',   (err)    => logError('uncaughtException', err));
process.on('unhandledRejection',  (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logError('unhandledRejection', err);
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const isMac = process.platform === 'darwin';

// Default overlay colors match the dark theme (styles/app.css) until the
// renderer reports the user's actual stored theme via app:set-titlebar-overlay.
const DEFAULT_TITLEBAR_OVERLAY = { color: '#21252b', symbolColor: '#dcdfe4', height: 40 };

let mainWindow = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 660,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: DEFAULT_TITLEBAR_OVERLAY }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
};

app.whenReady().then(async () => {
  await session.defaultSession.clearCache();
  Menu.setApplicationMenu(null);
  registerHandlers();
  ipcMain.handle('app:agent-cli-path', () =>
    path.join(app.getAppPath(), 'agent-cli', 'index.js')
  );

  ipcMain.handle('app:set-titlebar-overlay', (_e, { color, symbolColor }) => {
    if (isMac || !mainWindow) return { ok: false };
    mainWindow.setTitleBarOverlay({ color, symbolColor, height: 40 });
    return { ok: true };
  });

  ipcMain.handle('app:openIssueRunnerWindow', (_e, data) => {
    openIssueRunnerWindow(data);
    return { ok: true };
  });

  ipcMain.handle('app:openWorkflowWindow', (_e, data) => {
    openWorkflowWindow(data);
    return { ok: true };
  });

  ipcMain.handle('app:openTerminalWindow', (_e, projectId) => {
    openTerminalWindow(projectId);
    return { ok: true };
  });

  ipcMain.handle('app:openMockupPreview', (_e, { title, htmlContent }) => {
    const os      = require('os');
    const tmpFile = path.join(os.tmpdir(), `devflow-mockup-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, htmlContent, 'utf8');
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const win = new BrowserWindow({
      width:  Math.max(900, Math.round(sw * 0.65)),
      height: Math.max(600, Math.round(sh * 0.80)),
      title:  title ? `Mockup — ${title}` : 'Mockup Preview',
      webPreferences: { contextIsolation: true },
    });
    win.loadFile(tmpFile);
    win.on('closed', () => { try { fs.unlinkSync(tmpFile); } catch {} });
    return { ok: true };
  });

  ipcMain.handle('app:config:get', (_e, key) => getConfigValue(key));
  ipcMain.handle('app:config:set', (_e, key, value) => { setConfigValue(key, value); });
  ipcMain.handle('app:cloudsync:get', () => getCloudSyncConfig());
  ipcMain.handle('app:cloudsync:set', (_e, data) => { setCloudSyncConfig(data); });
  ipcMain.handle('app:telegram:get', () => getTelegramConfig());
  ipcMain.handle('app:telegram:set', (_e, data) => { setTelegramConfig(data); });
  ipcMain.handle('app:telegram:send', async (_e, text) => {
    const cfg = getTelegramConfig();
    if (!cfg.botToken || !cfg.chatId) return { ok: false, error: 'Not configured.' };
    try {
      await telegramSend(cfg.botToken, cfg.chatId, text);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('app:telegram:test', async () => {
    const cfg = getTelegramConfig();
    if (!cfg.botToken || !cfg.chatId) return { ok: false, error: 'Bot token and Chat ID are not configured.' };
    try {
      await telegramSend(cfg.botToken, cfg.chatId, 'Hello from DevFlow! ✅');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  ipcMain.handle('app:logs:list', () => {
    const { getDb } = require('./db/database');
    return getDb().prepare(
      'SELECT id, source, message, stack, created_at FROM error_logs ORDER BY created_at DESC LIMIT 200'
    ).all();
  });

  ipcMain.handle('app:db:export',  (e)    => exportDb(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('app:db:restore', (e)    => restoreDb(BrowserWindow.fromWebContents(e.sender)));
  ipcMain.handle('app:backup-default-path', () => path.join(app.getPath('userData'), 'backup'));

  ipcMain.handle('app:screens-dir', (event, projectName) => {
    const base = app.isPackaged
      ? app.getPath('userData')
      : app.getAppPath();
    const root = path.join(base, 'screens');
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
    if (projectName) {
      const safe = projectName.replace(/[^a-z0-9_\-]/gi, '_');
      const dir  = path.join(root, safe);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return dir;
    }
    return root;
  });

  // Returns a file path for the screen's HTML — the canonical file if it exists
  // in screensDir, otherwise a fresh temp file. Cleans up previous temp files first.
  ipcMain.handle('app:prepare-screen-ref', (_e, { screensDir, safeTitle, htmlContent }) => {
    // Clean up any leftover temp files from previous runs
    try {
      fs.readdirSync(screensDir)
        .filter(f => f.startsWith('_tmp_') && f.endsWith('.html'))
        .forEach(f => {
          try { fs.unlinkSync(path.join(screensDir, f)); } catch {}
        });
    } catch {}

    const canonical = path.join(screensDir, `${safeTitle}.html`);
    if (fs.existsSync(canonical)) return canonical;

    const tmpPath = path.join(screensDir, `_tmp_${safeTitle}.html`);
    fs.writeFileSync(tmpPath, htmlContent, 'utf8');
    return tmpPath;
  });
  createWindow();
  setImmediate(() => runBackup());
  if (app.isPackaged) setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  closeDb();
});
