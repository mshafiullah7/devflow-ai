'use strict';

// Functional tests for the Launcher page.
// Covers: modal lifecycle, form validation, project creation outcome,
// project navigation, and theme switching. Static labels omitted.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

let app, window, dbPath;

test.beforeEach(async () => {
  ({ app, window, dbPath } = await launchApp());
});

test.afterEach(async () => {
  await closeApp(app, dbPath);
});

// ----------------------------------------------------------------
// App launch
// ----------------------------------------------------------------

test('app launches and shows the launcher', async () => {
  await expect(window.locator('.launcher')).toBeVisible();
});

// ----------------------------------------------------------------
// New Project modal — lifecycle
// ----------------------------------------------------------------

test('clicking New Project opens the modal', async () => {
  await window.locator('#btnNewProject').click();
  await expect(window.locator('#modalOverlay')).toBeVisible();
});

test('Cancel button closes the modal', async () => {
  await window.locator('#btnNewProject').click();
  await window.locator('#btnCancel').click();
  await expect(window.locator('#modalOverlay')).toBeHidden();
});

test('X button closes the modal', async () => {
  await window.locator('#btnNewProject').click();
  await window.locator('#btnModalClose').click();
  await expect(window.locator('#modalOverlay')).toBeHidden();
});

// ----------------------------------------------------------------
// New Project modal — validation & creation
// ----------------------------------------------------------------

test('submitting without a name shows a form error and keeps the modal open', async () => {
  await window.locator('#btnNewProject').click();
  await window.locator('#btnCreate').click();
  await expect(window.locator('#formError')).toBeVisible();
  await expect(window.locator('#modalOverlay')).toBeVisible();
});

test('creating a project closes the modal and adds it to the recent list', async () => {
  await window.locator('#btnNewProject').click();
  await window.locator('#inputName').fill('My Project');
  await window.locator('#btnCreate').click();
  await expect(window.locator('#modalOverlay')).toBeHidden();
  await expect(window.locator('.launcher__proj-name')).toHaveText('My Project');
});

test('clicking a project row navigates away from the launcher', async () => {
  await window.locator('#btnNewProject').click();
  await window.locator('#inputName').fill('Nav Project');
  await window.locator('#btnCreate').click();
  await window.locator('.launcher__proj-row').waitFor();
  await window.locator('.launcher__proj-row').click();
  await expect(window.locator('.launcher')).toBeHidden({ timeout: 10000 });
});

// ----------------------------------------------------------------
// Theme switcher
// ----------------------------------------------------------------

test('clicking a theme button marks it active', async () => {
  await window.locator('.launcher__theme-btn[data-theme="dark"]').click();
  await expect(window.locator('.launcher__theme-btn[data-theme="dark"]')).toHaveClass(/active/);
});
