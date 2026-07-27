'use strict';

const { app, BrowserWindow, Menu, ipcMain, session, screen, Notification } = require('electron');
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
const isWin = process.platform === 'win32';

const APP_ICON_PATH = isWin
  ? path.join(__dirname, '..', '..', 'assets', 'icon.ico')
  : path.join(__dirname, '..', '..', 'assets', 'icon.png');

// Default overlay colors match the dark theme (styles/app.css) until the
// renderer reports the user's actual stored theme via app:set-titlebar-overlay.
const DEFAULT_TITLEBAR_OVERLAY = { color: '#21252b', symbolColor: '#dcdfe4', height: 40 };

let mainWindow  = null;
let allowClose  = false;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 660,
    icon: APP_ICON_PATH,
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

  // Give the renderer a chance to block close (e.g. an in-flight AI request)
  // before the window actually goes away.
  mainWindow.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    mainWindow.webContents.send('app:close-requested');
  });

  mainWindow.on('closed', () => { mainWindow = null; });
};

app.whenReady().then(async () => {
  // Only pin the AppUserModelID when packaged: this ID has no matching
  // Start Menu shortcut in a dev/unpackaged run, so Windows can't resolve
  // an icon for it — once a second top-level window appears (e.g. a
  // Runner opened in "Separate window" mode), the taskbar groups by this
  // ID and falls back to Electron's default icon instead of the window's
  // own icon. Windows also caches that bad resolution at the shell level,
  // so it persists across restarts even after switching back to
  // "Integrated tab".
  if (process.platform === 'win32') {
    const appId = 'com.devflow.ai';
    app.setAppUserModelId(appId);

    // In a development/unpackaged run, programmatically create a Start Menu
    // shortcut for the running electron.exe, mapping it to the custom icon and the appId.
    // This allows Windows to resolve the icon for the taskbar group when multiple windows are open.
    if (!app.isPackaged) {
      const { shell } = require('electron');
      const shortcutPath = path.join(
        process.env.APPDATA,
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
        'DevFlow AI (Dev Mode).lnk'
      );
      try {
        shell.writeShortcutLink(shortcutPath, 'create', {
          target: process.execPath,
          args: `"${app.getAppPath()}"`,
          icon: APP_ICON_PATH,
          iconIndex: 0,
          appUserModelId: appId,
          description: 'DevFlow AI SDLC (Development Mode)',
        });
      } catch (err) {
        console.error('Failed to create dev shortcut:', err);
      }
    }
  }
  await session.defaultSession.clearCache();
  Menu.setApplicationMenu(null);
  registerHandlers();
  ipcMain.handle('app:agent-cli-path', () =>
    path.join(app.getAppPath(), 'agent-cli', 'index.js')
  );

  ipcMain.on('app:close-confirmed', () => {
    allowClose = true;
    mainWindow?.close();
  });

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
      icon:   APP_ICON_PATH,
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
  // Native OS notification — fires even while the app is minimized or
  // unfocused, since it's shown by the OS, not the renderer window.
  ipcMain.handle('app:showNotification', (e, { title, body } = {}) => {
    if (!Notification.isSupported()) return { ok: false, error: 'Notifications not supported on this system' };
    const notification = new Notification({
      title: title || 'DevFlow',
      body:  body  || '',
      icon:  APP_ICON_PATH,
    });
    notification.on('click', () => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });
    notification.show();
    return { ok: true };
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
