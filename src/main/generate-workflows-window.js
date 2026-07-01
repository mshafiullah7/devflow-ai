'use strict';

const { BrowserWindow, screen } = require('electron');
const path                      = require('node:path');

let _win = null;

function openGenerateWorkflowsWindow({ projectId, modelConfig }) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('genWorkflows:init', { projectId, modelConfig });
    return;
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  _win = new BrowserWindow({
    width:  Math.max(900, Math.round(sw * 0.65)),
    height: Math.max(600, Math.round(sh * 0.80)),
    title:  'Generate Workflows',
    icon:   path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  _win.loadFile(path.join(__dirname, '../renderer/generate-workflows.html'));

  _win.webContents.once('did-finish-load', () => {
    _win.webContents.send('genWorkflows:init', { projectId, modelConfig });
  });

  _win.on('closed', () => { _win = null; });
}

module.exports = { openGenerateWorkflowsWindow };
