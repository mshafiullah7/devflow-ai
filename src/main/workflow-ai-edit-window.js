'use strict';

const { BrowserWindow, screen } = require('electron');
const path                      = require('node:path');

let _win = null;

function openWorkflowAiEditWindow(data) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('workflowAiEdit:init', data);
    return;
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  _win = new BrowserWindow({
    width:     Math.max(900, Math.round(sw * 0.65)),
    height:    Math.max(600, Math.round(sh * 0.80)),
    minWidth:  800,
    minHeight: 600,
    title:    'AI Edit — Layer',
    icon:     path.join(__dirname, '..', '..', 'assets', 'icon.png'),
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
