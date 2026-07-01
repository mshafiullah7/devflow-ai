'use strict';

const { BrowserWindow } = require('electron');
const path              = require('node:path');

let _win = null;

function openWorkflowWindow(data) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('workflow:init', data);
    return;
  }

  _win = new BrowserWindow({
    width:  1280,
    height: 960,
    title:  'Workflow Runner',
    icon:   path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  _win.loadFile(path.join(__dirname, '../renderer/workflow-runner.html'));

  _win.webContents.once('did-finish-load', () => {
    _win.webContents.send('workflow:init', data);
  });

  _win.on('closed', () => { _win = null; });
}

module.exports = { openWorkflowWindow };
