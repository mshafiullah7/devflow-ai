'use strict';

const { BrowserWindow } = require('electron');
const path              = require('node:path');

let _win = null;

function openTestRunnerWindow(data) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('testRunnerWin:init', data);
    return;
  }

  _win = new BrowserWindow({
    width:     1400,
    height:    900,
    minWidth:  900,
    minHeight: 600,
    title:     'Test Runner',
    icon:      path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  _win.loadFile(path.join(__dirname, '../renderer/test-runner-window.html'));

  _win.webContents.once('did-finish-load', () => {
    _win.webContents.send('testRunnerWin:init', data);
  });

  _win.on('closed', () => { _win = null; });
}

module.exports = { openTestRunnerWindow };
