'use strict';

const { BrowserWindow } = require('electron');
const path              = require('node:path');

let _win = null;

function openWorkflowAiEditWindow(data) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('workflowAiEdit:init', data);
    return;
  }

  _win = new BrowserWindow({
    width:    1280,
    height:   960,
    minWidth:  800,
    minHeight: 600,
    title:    'AI Edit — Layer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  _win.loadFile(path.join(__dirname, '../renderer/workflow-ai-edit.html'));

  _win.webContents.once('did-finish-load', () => {
    _win.webContents.send('workflowAiEdit:init', data);
  });

  _win.on('closed', () => { _win = null; });
}

module.exports = { openWorkflowAiEditWindow };
