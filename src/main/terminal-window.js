'use strict';

const { BrowserWindow } = require('electron');
const path              = require('node:path');

let _win = null;

function openTerminalWindow(projectId) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('terminal-win:init', { projectId });
    return;
  }

  _win = new BrowserWindow({
    width:  1280,
    height: 960,
    title:  'Terminal',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  _win.loadFile(path.join(__dirname, '../renderer/terminal.html'));

  _win.webContents.once('did-finish-load', () => {
    _win.webContents.send('terminal-win:init', { projectId });
  });

  _win.on('closed', () => { _win = null; });
}

module.exports = { openTerminalWindow };
