'use strict';

const { BrowserWindow, screen } = require('electron');
const path                      = require('node:path');

let _win = null;

function openWorkflowWindow(data) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('workflow:init', data);
    return;
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  _win = new BrowserWindow({
    width:  Math.max(900, Math.round(sw * 0.65)),
    height: Math.max(600, Math.round(sh * 0.80)),
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
