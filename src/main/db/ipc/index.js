'use strict';

const { registerDbHandlers }      = require('./db-handlers');
const { registerTerminalHandlers } = require('./terminal-handlers');
const { registerDialogHandlers }   = require('./dialog-handlers');
const { registerClaudeHandlers }   = require('./claude-handlers');

function registerHandlers() {
  registerDbHandlers();
  registerTerminalHandlers();
  registerDialogHandlers();
  registerClaudeHandlers();
}

module.exports = { registerHandlers };
