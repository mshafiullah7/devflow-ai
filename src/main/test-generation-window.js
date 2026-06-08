'use strict';

const { BrowserWindow } = require('electron');
const path              = require('node:path');

let _win = null;

function openTestGenerationWindow(data) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('testGen:init', data);
    return;
  }

  const title = data?.mode === 'e2e' ? 'Generate E2E Tests' : 'Generate Unit Tests';

  _win = new BrowserWindow({
    width:     980,
    height:    680,
    minWidth:  720,
    minHeight: 500,
    title,
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
