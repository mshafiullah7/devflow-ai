'use strict';

const { registerDbHandlers }       = require('./db-handlers');
const { registerTerminalHandlers } = require('./terminal-handlers');
const { registerDialogHandlers }   = require('./dialog-handlers');
const { registerChatHandlers }     = require('./chat-handlers');
const { registerQueueHandlers }    = require('./queue-handlers');
const { registerOllamaHandlers }   = require('./ollama-handlers');
const { registerWfrPtyHandlers }   = require('../../wfr-pty-handlers');

function registerHandlers() {
  registerDbHandlers();
  registerTerminalHandlers();
  registerDialogHandlers();
  registerChatHandlers();
  registerQueueHandlers();
  registerOllamaHandlers();
  registerWfrPtyHandlers();
}

module.exports = { registerHandlers };
