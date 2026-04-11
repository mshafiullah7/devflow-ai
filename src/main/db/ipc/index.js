'use strict';

const { registerDbHandlers }       = require('./db-handlers');
const { registerTerminalHandlers } = require('./terminal-handlers');
const { registerDialogHandlers }   = require('./dialog-handlers');
const { registerOllamaHandlers }   = require('./ollama-handlers');

function registerHandlers() {
  registerDbHandlers();
  registerTerminalHandlers();
  registerDialogHandlers();
  registerOllamaHandlers();
}

module.exports = { registerHandlers };
