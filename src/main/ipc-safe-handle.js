'use strict';

const { ipcMain } = require('electron');
const { logError } = require('./logger');

// Drop-in replacement for ipcMain.handle that catches any thrown error,
// logs it to the error_logs table, and returns { __error: message } so the
// renderer can display a user-friendly toast without crashing.
function safeHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (err) {
      logError(channel, err);
      return { __error: err.message };
    }
  });
}

module.exports = { safeHandle };
