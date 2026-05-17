'use strict';

// Functional tests for Project Home >> Git Changes.
// Covers: header navigation, no-folder state, Quick Commands modal lifecycle
// (add / edit / delete / cancel), inline quick-command picker toggle,
// {{input}} prompt overlay, console Kill/Clear button states.
// Static labels, diff panel content, and file list rendering omitted.

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

let app, window, dbPath;

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

async function createAndOpenProject(window, name = 'E2E Test Project') {
  await window.locator('#btnNewProject').click();
  await window.locator('#inputName').fill(name);
  await window.locator('#btnCreate').click();
  await window.locator('.launcher__proj-row').waitFor();
  await window.locator('.launcher__proj-row').click();
  await window.locator('.project-home').waitFor({ timeout: 10000 });
}

async function navigateToGitChanges(window) {
  await window.locator('#navGitChanges').click();
  await window.locator('.git-page').waitFor({ timeout: 10000 });
}

async function seedQuickCommand(window, command, description = '') {
  return window.evaluate(
    ([cmd, desc]) => window.db.quickCommands.create({ command: cmd, description: desc || null }),
    [command, description],
  );
}

async function clearQuickCommands(window) {
  await window.evaluate(async () => {
    const items = await window.db.quickCommands.list();
    if (Array.isArray(items)) {
      for (const item of items) await window.db.quickCommands.delete(item.id);
    }
  });
}

// ----------------------------------------------------------------
// Setup / teardown
// ----------------------------------------------------------------

test.beforeEach(async () => {
  ({ app, window, dbPath } = await launchApp());
  await createAndOpenProject(window);
});

test.afterEach(async () => {
  await closeApp(app, dbPath);
});

// ----------------------------------------------------------------
// Header navigation
// ----------------------------------------------------------------

test('back button navigates to project home', async () => {
  await navigateToGitChanges(window);
  await window.locator('#gitPageBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('VS Code button is disabled when no project folder is set', async () => {
  await navigateToGitChanges(window);
  await expect(window.locator('#gitPageVSCode')).toBeDisabled();
});

// ----------------------------------------------------------------
// No-folder state
// ----------------------------------------------------------------

test('file list shows empty state when no project folder is set', async () => {
  await navigateToGitChanges(window);
  await expect(window.locator('#gitFileList .git-page__empty')).toBeVisible();
});

// ----------------------------------------------------------------
// Quick Commands modal — lifecycle
// ----------------------------------------------------------------

test('Quick Commands button opens the modal', async () => {
  await navigateToGitChanges(window);
  await window.locator('#gitPageQcmd').click();
  await expect(window.locator('.qcmd-overlay')).toBeVisible();
});

test('Quick Commands modal X button closes it', async () => {
  await navigateToGitChanges(window);
  await window.locator('#gitPageQcmd').click();
  await window.locator('.qcmd-overlay').waitFor();
  await window.locator('.qcmd-close').click();
  await expect(window.locator('.qcmd-overlay')).toHaveCount(0);
});

test('clicking + Add opens the add command form', async () => {
  await navigateToGitChanges(window);
  await window.locator('#gitPageQcmd').click();
  await window.locator('.qcmd-overlay').waitFor();
  await window.locator('#btnQcmdAdd').click();
  await expect(window.locator('#qcmdInputCmd')).toBeVisible();
});

test('saving the add form without a command marks the command field invalid', async () => {
  await navigateToGitChanges(window);
  await window.locator('#gitPageQcmd').click();
  await window.locator('.qcmd-overlay').waitFor();
  await window.locator('#btnQcmdAdd').click();
  await window.locator('.qcmd-form__btn--save').click();
  // field gets a red outline style when empty
  const outline = await window.locator('#qcmdInputCmd').evaluate(el => el.style.outline);
  expect(outline).toMatch(/ef4444|rgb\(239,\s*68,\s*68\)/);
});

test('saving the add form with a command adds it to the list', async () => {
  await clearQuickCommands(window);
  await navigateToGitChanges(window);
  await window.locator('#gitPageQcmd').click();
  await window.locator('.qcmd-overlay').waitFor();
  await window.locator('#btnQcmdAdd').click();
  await window.locator('#qcmdInputCmd').fill('git log --oneline');
  await window.locator('.qcmd-form__btn--save').click();
  await expect(window.locator('.qcmd-item')).toHaveCount(1);
  await expect(window.locator('.qcmd-item__cmd')).toHaveText('git log --oneline');
});

test('edit button opens the form prefilled with the command text', async () => {
  await clearQuickCommands(window);
  await seedQuickCommand(window, 'git status');
  await navigateToGitChanges(window);
  await window.locator('#gitPageQcmd').click();
  await window.locator('.qcmd-item__btn--edit').waitFor();
  await window.locator('.qcmd-item__btn--edit').click();
  await expect(window.locator('#qcmdInputCmd')).toHaveValue('git status');
});

test('cancel in the edit form returns to the list view', async () => {
  await clearQuickCommands(window);
  await seedQuickCommand(window, 'git status');
  await navigateToGitChanges(window);
  await window.locator('#gitPageQcmd').click();
  await window.locator('.qcmd-item__btn--edit').waitFor();
  await window.locator('.qcmd-item__btn--edit').click();
  await window.locator('.qcmd-form__btn--cancel').click();
  await expect(window.locator('.qcmd-item')).toHaveCount(1);
  await expect(window.locator('#qcmdInputCmd')).toHaveCount(0);
});

test('delete button removes the command from the list', async () => {
  await clearQuickCommands(window);
  await seedQuickCommand(window, 'git status');
  await navigateToGitChanges(window);
  await window.locator('#gitPageQcmd').click();
  await window.locator('.qcmd-item__btn--delete').waitFor();
  await window.locator('.qcmd-item__btn--delete').click();
  await expect(window.locator('.qcmd-item')).toHaveCount(0);
  await expect(window.locator('.qcmd-empty')).toBeVisible();
});

// ----------------------------------------------------------------
// Inline quick-command picker
// ----------------------------------------------------------------

test('picker button shows the dropdown menu', async () => {
  await navigateToGitChanges(window);
  await window.locator('#gitQcmdPickerBtn').click();
  await expect(window.locator('#gitQcmdMenu')).toBeVisible();
});

test('clicking the picker button again closes the dropdown', async () => {
  await navigateToGitChanges(window);
  await window.locator('#gitQcmdPickerBtn').click();
  await window.locator('#gitQcmdMenu').waitFor();
  await window.locator('#gitQcmdPickerBtn').click();
  await expect(window.locator('#gitQcmdMenu')).toBeHidden();
});

// ----------------------------------------------------------------
// {{input}} prompt overlay
// ----------------------------------------------------------------

test('selecting a {{input}} command from the picker shows the input prompt', async () => {
  await clearQuickCommands(window);
  await seedQuickCommand(window, 'git checkout {{input}}');
  await navigateToGitChanges(window);
  await window.locator('#gitQcmdPickerBtn').click();
  await window.locator('.git-page__qcmd-menu-item').waitFor();
  await window.locator('.git-page__qcmd-menu-item').click();
  await expect(window.locator('.git-input-prompt-overlay')).toBeVisible();
});

test('input prompt Cancel button closes the overlay', async () => {
  await clearQuickCommands(window);
  await seedQuickCommand(window, 'git checkout {{input}}');
  await navigateToGitChanges(window);
  await window.locator('#gitQcmdPickerBtn').click();
  await window.locator('.git-page__qcmd-menu-item').waitFor();
  await window.locator('.git-page__qcmd-menu-item').click();
  await window.locator('#gitInputPromptCancel').click();
  await expect(window.locator('.git-input-prompt-overlay')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Console panel
// ----------------------------------------------------------------

test('Kill button is disabled on initial page load', async () => {
  await navigateToGitChanges(window);
  await expect(window.locator('#gitConsoleKill')).toBeDisabled();
});

test('clicking Clear removes the console output', async () => {
  await navigateToGitChanges(window);
  await expect(window.locator('.git-page__console-hint')).toBeVisible();
  await window.locator('#gitConsoleClear').click();
  await expect(window.locator('.git-page__console-hint')).toHaveCount(0);
});
