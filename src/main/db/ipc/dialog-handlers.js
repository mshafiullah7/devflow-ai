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

  ipcMain.handle('dialog:openFile', async (event, { title, extensions, defaultPath } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      properties: ['openFile'],
      title: title || 'Open File',
      filters: extensions
        ? [{ name: 'Files', extensions }]
        : [{ name: 'All Files', extensions: ['*'] }],
    };
    if (defaultPath) opts.defaultPath = defaultPath;
    const result = await dialog.showOpenDialog(win, opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    const content = await fs.readFile(result.filePaths[0], 'utf-8');
    return { path: result.filePaths[0], content };
  });

  ipcMain.handle('window:expand', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
    const w = Math.round(sw * 0.75);
    const h = Math.round(sh * 0.85);
    win.setSize(w, h);
    win.center();
  });

  ipcMain.handle('app:export-pdf', async (event, { html, filename }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'Export to PDF',
      defaultPath: `${filename || 'document'}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };

    const os   = require('node:os');
    const path = require('node:path');
    const tmpFile = path.join(os.tmpdir(), `_pdf_export_${Date.now()}.html`);
    await fs.writeFile(tmpFile, html, 'utf-8');

    const hidden = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    await hidden.loadFile(tmpFile);
    const pdfData = await hidden.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
    });
    hidden.close();
    try { await fs.unlink(tmpFile); } catch {}
    await fs.writeFile(result.filePath, pdfData);
    return { success: true };
  });
}

module.exports = { registerDialogHandlers };
