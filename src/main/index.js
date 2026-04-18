'use strict';

const { app, BrowserWindow, Menu, ipcMain } = require('electron');
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
};

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerHandlers();
  ipcMain.handle('app:agent-cli-path', () =>
    path.join(app.getAppPath(), 'agent-cli', 'index.js')
  );

  ipcMain.handle('app:screens-dir', () => {
    const base = app.isPackaged
      ? app.getPath('userData')
      : app.getAppPath();
    const dir = path.join(base, 'screens');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
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
