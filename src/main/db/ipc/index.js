'use strict';

const { registerDbHandlers }       = require('./db-handlers');
const { registerTerminalHandlers } = require('./terminal-handlers');
const { registerDialogHandlers }   = require('./dialog-handlers');
const { registerChatHandlers }     = require('./chat-handlers');
const { registerQueueHandlers }    = require('./queue-handlers');

function registerHandlers() {
  registerDbHandlers();
  registerTerminalHandlers();
  registerDialogHandlers();
  registerChatHandlers();
  registerQueueHandlers();
}

module.exports = { registerHandlers };
