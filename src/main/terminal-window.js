'use strict';

const { BrowserWindow } = require('electron');
const path                      = require('node:path');

const APP_ICON_PATH = process.platform === 'win32'
  ? path.join(__dirname, '..', '..', 'assets', 'icon.ico')
  : path.join(__dirname, '..', '..', 'assets', 'icon.png');

let _win = null;

function openTerminalWindow(projectId) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('terminal-win:init', { projectId });
    return;
  }

  _win = new BrowserWindow({
    width:  1600,
    height: 1050,
    title:  'Terminal',
    icon:   APP_ICON_PATH,
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
