'use strict';

const { registerDbHandlers }       = require('./db-handlers');
const { registerTerminalHandlers } = require('./terminal-handlers');
const { registerDialogHandlers }   = require('./dialog-handlers');
const { registerChatHandlers }     = require('./chat-handlers');
const { registerPtyHandlers }      = require('./pty-handlers');

function registerHandlers() {
  registerDbHandlers();
  registerTerminalHandlers();
  registerDialogHandlers();
  registerChatHandlers();
  registerPtyHandlers();
}

module.exports = { registerHandlers };
