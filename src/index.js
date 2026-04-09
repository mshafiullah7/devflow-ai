const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');
const { registerHandlers } = require('./db/ipc-handlers');
const { closeDb } = require('./db/database');
const { runBackup } = require('./db/backup');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
const { ipcMain, screen } = require('electron');

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerHandlers();
  runBackup();
  createWindow();

  ipcMain.handle('window:expand', (event) => {
    const win = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = Math.round(sw * 0.8);
    const h = Math.round(sh * 0.85);
    win.setSize(w, h);
    win.center();
  });

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  closeDb();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
