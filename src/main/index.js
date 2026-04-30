'use strict';

const { app, BrowserWindow, Menu, ipcMain, session } = require('electron');
const path = require('node:path');
const fs   = require('node:fs');
const { registerHandlers } = require('./db/ipc');
const { closeDb } = require('./db/database');
const { runBackup } = require('./db/backup');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
};

app.whenReady().then(async () => {
  await session.defaultSession.clearCache();
  Menu.setApplicationMenu(null);
  registerHandlers();
  ipcMain.handle('app:agent-cli-path', () =>
    path.join(app.getAppPath(), 'agent-cli', 'index.js')
  );

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
