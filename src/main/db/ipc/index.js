'use strict';

const { registerDbHandlers }       = require('./db-handlers');
const { registerTerminalHandlers } = require('./terminal-handlers');
const { registerDialogHandlers }   = require('./dialog-handlers');

function registerHandlers() {
  registerDbHandlers();
  registerTerminalHandlers();
  registerDialogHandlers();
}

module.exports = { registerHandlers };
