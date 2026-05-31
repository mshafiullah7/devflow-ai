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

  _win = new BrowserWindow({
    width:  920,
    height: 640,
    minWidth:  700,
    minHeight: 480,
    title:  'Generate Unit Tests',
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
