'use strict';

// Functional tests for Project Home >> Mockups.
// Covers: header navigation, new-screen modal lifecycle, edit-details modal,
// actions dropdown, delete confirmation, and multi-screen sidebar switching.
// Static visibility checks and empty-state labels omitted.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

let app, window, dbPath;

async function createAndOpenProject(window, name = 'E2E Test Project') {
  await window.locator('#btnNewProject').click();
  await window.locator('#inputName').fill(name);
  await window.locator('#btnCreate').click();
  await window.locator('.launcher__proj-row').waitFor();
  await window.locator('.launcher__proj-row').click();
  await window.locator('.project-home').waitFor({ timeout: 10000 });
}

async function navigateToMockups(window) {
  await window.locator('#navMockups').click();
  await window.locator('.mockups-page').waitFor({ timeout: 10000 });
}

async function createScreen(window, title) {
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsTitle').fill(title);
  await window.locator('#scrNsSave').click();
  await window.locator('.scr-viewer').waitFor({ timeout: 5000 });
}

test.beforeEach(async () => {
  ({ app, window, dbPath } = await launchApp());
  await createAndOpenProject(window);
  await navigateToMockups(window);
});

test.afterEach(async () => {
  await closeApp(app, dbPath);
});

// ----------------------------------------------------------------
// Header navigation
// ----------------------------------------------------------------

test('back button navigates to project home', async () => {
  await window.locator('#btnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('model config button navigates to settings', async () => {
  await window.locator('#mockupsBtnModelConfigs').click();
  await expect(window.locator('.mockups-page')).toBeHidden({ timeout: 8000 });
});

test('styles button navigates away from mockups', async () => {
  await window.locator('#scrStyleGuideBtn').click();
  await expect(window.locator('.mockups-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// New Screen modal — lifecycle
// ----------------------------------------------------------------

test('clicking New Screen opens the modal', async () => {
  await window.locator('#scrNewBtn').click();
  await expect(window.locator('.scr-ns-dialog')).toBeVisible();
});

test('Cancel button closes the new screen modal', async () => {
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsCancel').click();
  await expect(window.locator('.scr-ns-dialog')).toHaveCount(0);
});

test('X button closes the new screen modal', async () => {
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsClose').click();
  await expect(window.locator('.scr-ns-dialog')).toHaveCount(0);
});

test('saving without a title keeps the modal open', async () => {
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsSave').click();
  await expect(window.locator('.scr-ns-dialog')).toBeVisible();
});

test('creating a screen closes the modal and opens the viewer', async () => {
  await createScreen(window, 'Login Screen');
  await expect(window.locator('.scr-ns-dialog')).toHaveCount(0);
  await expect(window.locator('.scr-viewer')).toBeVisible();
});

test('created screen appears in the sidebar', async () => {
  await createScreen(window, 'Login Screen');
  await expect(window.locator('.scr-sidebar__item')).toHaveCount(1);
  await expect(window.locator('.scr-sidebar__item-title')).toHaveText('Login Screen');
});

// ----------------------------------------------------------------
// Edit screen details modal
// ----------------------------------------------------------------

test('Edit Details button opens the edit modal prefilled with the screen title', async () => {
  await createScreen(window, 'Login Screen');
  await window.locator('#scrEditDetailsBtn').click();
  await expect(window.locator('#scrEditTitle')).toHaveValue('Login Screen');
});

test('Cancel in edit modal closes without changing the title', async () => {
  await createScreen(window, 'Login Screen');
  await window.locator('#scrEditDetailsBtn').click();
  await window.locator('#scrEditTitle').waitFor();
  await window.locator('#scrEditCancel').click();
  await expect(window.locator('.scr-viewer__title')).toHaveText('Login Screen');
});

test('saving edit details updates the title in the viewer and sidebar', async () => {
  await createScreen(window, 'Login Screen');
  await window.locator('#scrEditDetailsBtn').click();
  await window.locator('#scrEditTitle').fill('Dashboard Screen');
  await window.locator('#scrEditSave').click();
  await expect(window.locator('.scr-viewer__title')).toHaveText('Dashboard Screen');
  await expect(window.locator('.scr-sidebar__item-title')).toHaveText('Dashboard Screen');
});

// ----------------------------------------------------------------
// Actions dropdown
// ----------------------------------------------------------------

test('clicking Actions button shows the dropdown', async () => {
  await createScreen(window, 'Login Screen');
  await window.locator('#scrActionsMenuTrigger').click();
  await expect(window.locator('#scrActionsDropdown')).toBeVisible();
});

// ----------------------------------------------------------------
// Screen deletion
// ----------------------------------------------------------------

test('delete button shows a confirmation dialog', async () => {
  await createScreen(window, 'Login Screen');
  await window.locator('#scrDeleteBtn').click();
  await expect(window.locator('.scr-unsaved-overlay')).toBeVisible();
});

test('cancelling the delete dialog keeps the screen in the sidebar', async () => {
  await createScreen(window, 'Login Screen');
  await window.locator('#scrDeleteBtn').click();
  await window.locator('#dlgDeleteCancel').click();
  await expect(window.locator('.scr-sidebar__item')).toHaveCount(1);
});

test('confirming delete removes the screen and restores the empty state', async () => {
  await createScreen(window, 'Login Screen');
  await window.locator('#scrDeleteBtn').click();
  await window.locator('#dlgDeleteConfirm').click();
  await expect(window.locator('.scr-sidebar__item')).toHaveCount(0);
  await expect(window.locator('.scr-empty-state')).toBeVisible({ timeout: 5000 });
});

// ----------------------------------------------------------------
// Multiple screens — sidebar switching
// ----------------------------------------------------------------

test('clicking a sidebar item switches the active screen', async () => {
  await createScreen(window, 'Login Screen');
  await createScreen(window, 'Dashboard Screen');
  await window.locator('.scr-sidebar__item').first().click();
  await expect(window.locator('.scr-viewer__title')).toHaveText('Login Screen');
});
