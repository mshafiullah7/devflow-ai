'use strict';

// Shared Electron launch/teardown helpers used by all E2E spec files.
// Each launch gets an isolated temp DB so tests don't share state.
//
// Set PW_SLOW_MO=<ms> to slow down every UI action (for watching tests run).
//   npm run test:watch  →  PW_SLOW_MO=800 automatically

const path = require('path');
const os   = require('os');
const fs   = require('fs');
const { _electron: electron } = require('@playwright/test');

const APP_ENTRY = path.join(__dirname, '../../../src/main/index.js');
const SLOW_MO   = process.env.PW_SLOW_MO ? parseInt(process.env.PW_SLOW_MO, 10) : 0;

// Methods on a Locator that actually perform UI actions (should be delayed).
const LOCATOR_ACTIONS = new Set([
  'click', 'dblclick', 'fill', 'type', 'clear', 'press', 'pressSequentially',
  'check', 'uncheck', 'selectOption', 'hover', 'tap', 'focus', 'blur',
  'dispatchEvent', 'dragTo',
]);

// Methods on a Locator that return another Locator (need to be re-wrapped).
const LOCATOR_BUILDERS = new Set([
  'locator', 'getByText', 'getByRole', 'getByLabel', 'getByPlaceholder',
  'getByTestId', 'getByAltText', 'getByTitle', 'first', 'last', 'nth', 'filter',
]);

function makeSlowLocator(locator) {
  return new Proxy(locator, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, target);

      if (LOCATOR_ACTIONS.has(prop) && typeof val === 'function') {
        return async (...args) => {
          await target.page().waitForTimeout(SLOW_MO);
          return val.apply(target, args);
        };
      }

      if (LOCATOR_BUILDERS.has(prop) && typeof val === 'function') {
        return (...args) => makeSlowLocator(val.apply(target, args));
      }

      return typeof val === 'function' ? val.bind(target) : val;
    },
  });
}

// Methods on a Page that return Locators (need slow-locator wrapping).
const PAGE_LOCATOR_BUILDERS = new Set([
  'locator', 'getByText', 'getByRole', 'getByLabel', 'getByPlaceholder',
  'getByTestId', 'getByAltText', 'getByTitle',
]);

function makeSlowPage(page) {
  return new Proxy(page, {
    get(target, prop) {
      const val = target[prop];

      if (PAGE_LOCATOR_BUILDERS.has(prop) && typeof val === 'function') {
        return (...args) => makeSlowLocator(val.apply(target, args));
      }

      return typeof val === 'function' ? val.bind(target) : val;
    },
  });
}

async function launchApp() {
  const dbPath = path.join(os.tmpdir(), `devflow-test-${Date.now()}-${process.pid}.db`);

  const app = await electron.launch({
    args: [APP_ENTRY],
    env: { ...process.env, TEST_DB_PATH: dbPath },
  });

  const rawWindow = await app.firstWindow();
  await rawWindow.waitForLoadState('domcontentloaded');
  const window = SLOW_MO ? makeSlowPage(rawWindow) : rawWindow;

  return { app, window, dbPath };
}

async function closeApp(app, dbPath) {
  await app.close();
  try { fs.unlinkSync(dbPath); } catch {}
}

module.exports = { launchApp, closeApp };
