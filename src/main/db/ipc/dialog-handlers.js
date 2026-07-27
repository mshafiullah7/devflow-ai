'use strict';

const { ipcMain, dialog, BrowserWindow } = require('electron');
const { safeHandle } = require('../../ipc-safe-handle');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { spawn } = require('node:child_process');

// Loads `html` in a hidden window, hides off-screen/invisible elements (see
// note in app:export-pdf below), resizes to the content's natural height so
// the whole screen is captured in one shot (no scrolling/pagination), and
// returns a PNG buffer.
async function captureHtmlAsPng(html, width) {
  const os   = require('node:os');
  const path = require('node:path');
  const tmpFile = path.join(os.tmpdir(), `_png_export_${Date.now()}_${Math.random().toString(36).slice(2)}.html`);
  await fs.writeFile(tmpFile, html, 'utf-8');

  const hidden = new BrowserWindow({
    show: false,
    width,
    height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  await hidden.loadFile(tmpFile);
  await hidden.webContents.executeJavaScript(`
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.opacity === '0' || cs.visibility === 'hidden') {
        el.style.setProperty('display', 'none', 'important');
        return;
      }
      if (cs.position === 'fixed' || cs.position === 'absolute') {
        const r = el.getBoundingClientRect();
        const offscreen = r.width > 0 && r.height > 0 &&
          (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth);
        if (offscreen) el.style.setProperty('display', 'none', 'important');
      }
    });
    true;
  `);

  const fullHeight = await hidden.webContents.executeJavaScript(
    'Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)'
  );
  hidden.setContentSize(width, Math.max(200, Math.min(Math.ceil(fullHeight), 20000)));
  // Give layout a moment to settle at the new size before capturing.
  await new Promise(r => setTimeout(r, 80));

  const image = await hidden.webContents.capturePage();
  hidden.close();
  try { await fs.unlink(tmpFile); } catch {}
  return image.toPNG();
}

function registerDialogHandlers() {
  safeHandle('dialog:openFolder', async (event, { defaultPath } = {}) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const opts = {
      properties: ['openDirectory'],
      title: 'Select Folder',
    };
    if (defaultPath) opts.defaultPath = defaultPath;
    const result = await dialog.showOpenDialog(win, opts);
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
    // Dismissible modals/sheets/drawers in generated screens are usually kept
    // out of view with opacity:0 or a transform pushing them past the
    // viewport edge, not display:none. Chromium's print pagination renders
    // the full document height rather than clipping to the viewport, so
    // those "closed" elements can reappear as extra content near the bottom
    // of the PDF. Hide anything that's invisible or fully off-screen before
    // printing, mirroring what the live viewport already hides visually.
    await hidden.webContents.executeJavaScript(`
      document.querySelectorAll('body *').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.opacity === '0' || cs.visibility === 'hidden') {
          el.style.setProperty('display', 'none', 'important');
          return;
        }
        if (cs.position === 'fixed' || cs.position === 'absolute') {
          const r = el.getBoundingClientRect();
          const offscreen = r.width > 0 && r.height > 0 &&
            (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth);
          if (offscreen) el.style.setProperty('display', 'none', 'important');
        }
      });
      true;
    `);
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

  safeHandle('app:export-png', async (event, { html, filename, platform }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'Export to PNG',
      defaultPath: `${filename || 'screen'}.png`,
      filters: [{ name: 'PNG Images', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { success: false };

    const width = (platform === 'flutter' || platform === 'android') ? 430 : 1280;
    const png = await captureHtmlAsPng(html, width);
    await fs.writeFile(result.filePath, png);
    return { success: true };
  });

  safeHandle('app:export-png-batch', async (event, { screens, platform }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: 'Choose Folder for Exported Screens',
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false };

    const path   = require('node:path');
    const folder = result.filePaths[0];
    const width  = (platform === 'flutter' || platform === 'android') ? 430 : 1280;
    for (const s of screens) {
      const png = await captureHtmlAsPng(s.html, width);
      await fs.writeFile(path.join(folder, `${s.filename}.png`), png);
    }
    return { success: true, folder, count: screens.length };
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
