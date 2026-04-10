'use strict';

const { ipcMain, dialog, BrowserWindow, screen } = require('electron');
const fs = require('node:fs/promises');

function registerDialogHandlers() {
  ipcMain.handle('dialog:openFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('dialog:openJsonFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      title: 'Import User Stories',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    // Non-blocking async read — never blocks the main-process event loop
    return fs.readFile(result.filePaths[0], 'utf-8');
  });

  ipcMain.handle('window:expand', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = Math.round(sw * 0.8);
    const h = Math.round(sh * 0.85);
    win.setSize(w, h);
    win.center();
  });
}

module.exports = { registerDialogHandlers };
