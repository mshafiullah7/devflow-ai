'use strict';

const { BrowserWindow, screen } = require('electron');
const path                      = require('node:path');

let _win = null;

function openTestGenerationWindow(data) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('testGen:init', data);
    return;
  }

  const title = data?.mode === 'e2e' ? 'Generate E2E Tests' : 'Generate Unit Tests';

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  _win = new BrowserWindow({
    width:     Math.max(900, Math.round(sw * 0.65)),
    height:    Math.max(600, Math.round(sh * 0.80)),
    minWidth:  720,
    minHeight: 500,
    title,
    icon:      path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  _win.loadFile(path.join(__dirname, '../renderer/test-generation.html'));

  _win.webContents.once('did-finish-load', () => {
    _win.webContents.send('testGen:init', data);
  });

  _win.on('closed', () => { _win = null; });
}

module.exports = { openTestGenerationWindow };
