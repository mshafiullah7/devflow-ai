'use strict';

const { BrowserWindow } = require('electron');
const path              = require('node:path');

let _win = null;

function openQueueWindow(projectId) {
  // Re-focus and re-init if already open
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('queue:init', { projectId });
    return;
  }

  _win = new BrowserWindow({
    width:  1280,
    height: 960,
    title:  'Task Queue',
    icon:   path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  _win.loadFile(path.join(__dirname, '../renderer/queue-runner.html'));

  _win.webContents.once('did-finish-load', () => {
    _win.webContents.send('queue:init', { projectId });
  });

  _win.on('closed', () => { _win = null; });
}

module.exports = { openQueueWindow };
