'use strict';

const { BrowserWindow } = require('electron');
const path              = require('node:path');

let _win = null;

function openGenerateWorkflowsWindow({ projectId, modelConfig }) {
  if (_win && !_win.isDestroyed()) {
    _win.focus();
    _win.webContents.send('genWorkflows:init', { projectId, modelConfig });
    return;
  }

  _win = new BrowserWindow({
    width:  1280,
    height: 960,
    title:  'Generate Workflows',
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
