'use strict';

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
test('app launches and renders the launcher page', async () => {
  await expect(window.locator('.launcher')).toBeVisible();
  await expect(window.locator('.launcher__title')).toHaveText('Welcome back');
  await expect(window.locator('.launcher__subtitle')).toHaveText('Select a project or start a new one');
});

test('app name shows DevFlow AI in the header', async () => {
  await expect(window.locator('.launcher__app-name')).toHaveText('DevFlow AI');
});

// ----------------------------------------------------------------
// New project modal
// ----------------------------------------------------------------
test('clicking New Project opens the modal', async () => {
  await window.locator('#btnNewProject').click();
  await expect(window.locator('#modalOverlay')).toBeVisible();
  await expect(window.locator('#modalTitle')).toHaveText('New Project');
});

test('modal closes when Cancel is clicked', async () => {
  await window.locator('#btnNewProject').click();
  await window.locator('#btnCancel').click();
  await expect(window.locator('#modalOverlay')).toBeHidden();
});

test('modal closes when the X button is clicked', async () => {
  await window.locator('#btnNewProject').click();
  await window.locator('#btnModalClose').click();
  await expect(window.locator('#modalOverlay')).toBeHidden();
});

test('Create button is disabled-like without a project name', async () => {
  await window.locator('#btnNewProject').click();
  // Clicking Create without a name should show the form error, not navigate away
  await window.locator('#btnCreate').click();
  await expect(window.locator('#formError')).toBeVisible();
  await expect(window.locator('.launcher')).toBeVisible(); // still on launcher
});

// ----------------------------------------------------------------
// Create a project
// ----------------------------------------------------------------
test('creates a new project and shows it in the recent list', async () => {
  await window.locator('#btnNewProject').click();
  await window.locator('#inputName').fill('Test Project');
  await window.locator('#inputDesc').fill('Created by Playwright E2E');
  await window.locator('#btnCreate').click();

  // Modal closes and the new project appears in the recent list
  await expect(window.locator('#modalOverlay')).toBeHidden();
  await expect(window.locator('.launcher__proj-row')).toBeVisible({ timeout: 5000 });
  await expect(window.locator('.launcher__proj-name')).toHaveText('Test Project');
});

test('clicking a project in the recent list navigates to project home', async () => {
  // Create a project first
  await window.locator('#btnNewProject').click();
  await window.locator('#inputName').fill('Nav Test Project');
  await window.locator('#btnCreate').click();
  await expect(window.locator('.launcher__proj-row')).toBeVisible({ timeout: 5000 });

  // Click the project row to open it
  await window.locator('.launcher__proj-row').click();
  await expect(window.locator('.launcher')).toBeHidden({ timeout: 10000 });
});

// ----------------------------------------------------------------
// Theme switcher
// ----------------------------------------------------------------
test('theme buttons are present and one is active', async () => {
  const btns = window.locator('.launcher__theme-btn');
  await expect(btns).toHaveCount(3);
  // Exactly one should have the active class
  const activeCount = await window.locator('.launcher__theme-btn.active').count();
  expect(activeCount).toBe(1);
});

test('clicking a theme button marks it active', async () => {
  await window.locator('.launcher__theme-btn[data-theme="dark"]').click();
  await expect(window.locator('.launcher__theme-btn[data-theme="dark"]')).toHaveClass(/active/);
});

// ----------------------------------------------------------------
// Empty state
// ----------------------------------------------------------------
test('empty state is visible when there are no recent projects', async () => {
  // On a fresh DB (unique per launch) there should be no recent projects
  await expect(window.locator('#emptyState')).toBeVisible();
  await expect(window.locator('#emptyState p')).toHaveText('No recent projects yet');
});
