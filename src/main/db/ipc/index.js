'use strict';

const { registerDbHandlers }       = require('./db-handlers');
const { registerTerminalHandlers } = require('./terminal-handlers');
const { registerDialogHandlers }   = require('./dialog-handlers');
const { registerChatHandlers }     = require('./chat-handlers');
const { registerQueueHandlers }    = require('./queue-handlers');
const { registerOllamaHandlers }   = require('./ollama-handlers');
const { registerAgentHandlers }    = require('./agent-handlers');
const { registerWfrPtyHandlers }   = require('../../wfr-pty-handlers');

function registerHandlers() {
  registerDbHandlers();
  registerTerminalHandlers();
  registerDialogHandlers();
  registerChatHandlers();
  registerQueueHandlers();
  registerOllamaHandlers();
  registerAgentHandlers();
  registerWfrPtyHandlers();
}

module.exports = { registerHandlers };
