'use strict';

const { ipcMain, dialog, BrowserWindow } = require('electron');
const { safeHandle } = require('../../ipc-safe-handle');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { spawn } = require('node:child_process');

function registerDialogHandlers() {
  safeHandle('dialog:openFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Select Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  safeHandle('dialog:openJsonFile', async (event) => {
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

  safeHandle('dialog:openFile', async (event, { title, extensions, defaultPath } = {}) => {
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

  safeHandle('window:expand', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    win.setSize(1600, 1050);
    win.center();
  });

  safeHandle('dialog:saveJsonFile', async (event, { data, filename }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'Export to JSON',
      defaultPath: `${filename || 'export'}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };
    await fs.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, filePath: result.filePath };
  });

  safeHandle('app:export-pdf', async (event, { html, filename }) => {
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

  safeHandle('shell:openVSCode', (_e, folderPath) => {
    if (!folderPath) return;
    // Use `code .` with cwd so the path is handled by the shell, not as a CLI arg.
    // Fall back to process.cwd() if the folder doesn't exist on disk.
    const cwd = (folderPath && fsSync.existsSync(folderPath)) ? folderPath : process.cwd();
    const proc = spawn('cmd.exe', ['/c', 'code', '.'], { cwd, detached: true, stdio: 'ignore' });
    proc.unref();
  });

  safeHandle('shell:openPowerShell', (_e, folderPath) => {
    if (!folderPath) return;
    // Fall back to cwd if the layer path doesn't exist on disk.
    const cwd = (folderPath && fsSync.existsSync(folderPath)) ? folderPath : process.cwd();
    const proc = spawn(
      'cmd.exe',
      ['/c', 'start', 'powershell.exe', '-NoExit', '-NoLogo'],
      { cwd, detached: true, stdio: 'ignore' }
    );
    proc.unref();
  });
}

module.exports = { registerDialogHandlers };
