'use strict';

// Shared Electron launch/teardown helpers used by all E2E spec files.
// Each launch gets an isolated in-memory-style temp DB so tests don't share state.

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { _electron: electron } = require('@playwright/test');

const APP_ENTRY = path.join(__dirname, '../../../src/main/index.js');

async function launchApp() {
  // Give each test launch its own throwaway DB file inside the OS temp dir
  const dbPath = path.join(os.tmpdir(), `devflow-test-${Date.now()}-${process.pid}.db`);

  const app = await electron.launch({
    args: [APP_ENTRY],
    env: { ...process.env, TEST_DB_PATH: dbPath },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');

  return { app, window, dbPath };
}

async function closeApp(app, dbPath) {
  await app.close();
  // Clean up the temp DB file
  try { fs.unlinkSync(dbPath); } catch {}
}

module.exports = { launchApp, closeApp };
