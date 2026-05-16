'use strict';

// Functional tests for Project Home >> Documents.
// Covers: header navigation, template picker lifecycle, document creation
// outcomes, editor tab switching, attachments panel toggle, save, and deletion.
// Static label/visibility checks and AI panel field enumeration omitted.

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

async function navigateToDocuments(window) {
  await window.locator('#navDocuments').click();
  await window.locator('.documents-page').waitFor({ timeout: 10000 });
}

async function createEmptyDocument(window) {
  await window.locator('#docAddBtn').click();
  await window.locator('.doc-tpl-picker').waitFor();
  await window.locator('.doc-tpl-item').filter({ hasText: 'Empty Document' }).click();
  await window.locator('.doc-editor-wrap').waitFor({ timeout: 5000 });
}

async function createDocumentFromTemplate(window, templateName) {
  await window.locator('#docAddBtn').click();
  await window.locator('.doc-tpl-picker').waitFor();
  await window.locator('.doc-tpl-item').filter({ hasText: templateName }).click();
  await window.locator('.doc-editor-wrap').waitFor({ timeout: 5000 });
}

test.beforeEach(async () => {
  ({ app, window, dbPath } = await launchApp());
  await createAndOpenProject(window);
  await navigateToDocuments(window);
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

// ----------------------------------------------------------------
// Template picker — lifecycle
// ----------------------------------------------------------------

test('clicking New opens the template picker', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-picker')).toBeVisible();
});

test('template picker close button dismisses the picker', async () => {
  await window.locator('#docAddBtn').click();
  await window.locator('.doc-tpl-picker').waitFor();
  await window.locator('.doc-tpl-close').click();
  await expect(window.locator('.doc-tpl-picker')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Document creation — outcome per template
// ----------------------------------------------------------------

test('picking Empty Document opens the editor', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-editor-wrap')).toBeVisible();
  await expect(window.locator('#docTitleInput')).toHaveValue('Untitled Document');
});

test('created document appears as the active item in the sidebar', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-sidebar__item')).toHaveCount(1);
  await expect(window.locator('.doc-sidebar__item')).toHaveClass(/doc-sidebar__item--active/);
});

test('Project Overview template pre-fills content', async () => {
  await createDocumentFromTemplate(window, 'Project Overview');
  await expect(await window.locator('#docContentTA').inputValue()).toContain('# Project Overview');
});

test('Technical Specification template pre-fills content', async () => {
  await createDocumentFromTemplate(window, 'Technical Specification');
  await expect(await window.locator('#docContentTA').inputValue()).toContain('# Technical Specification');
});

test('Meeting Notes template pre-fills content', async () => {
  await createDocumentFromTemplate(window, 'Meeting Notes');
  await expect(await window.locator('#docContentTA').inputValue()).toContain('# Meeting Notes');
});

test('Tasks template pre-fills content', async () => {
  await createDocumentFromTemplate(window, 'Tasks');
  await expect(await window.locator('#docContentTA').inputValue()).toContain('# Tasks');
});

test('Release Notes template pre-fills content', async () => {
  await createDocumentFromTemplate(window, 'Release Notes');
  await expect(await window.locator('#docContentTA').inputValue()).toContain('# Release Notes');
});

// ----------------------------------------------------------------
// Editor — Edit / Preview tab switching
// ----------------------------------------------------------------

test('switching to Preview tab hides the textarea and shows the preview pane', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-editor__tab[data-tab="preview"]').click();
  await expect(window.locator('[data-pane="edit"]')).toHaveClass(/doc-editor__pane--hidden/);
  await expect(window.locator('[data-pane="preview"]')).not.toHaveClass(/doc-editor__pane--hidden/);
});

test('switching back to Edit tab shows the textarea again', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-editor__tab[data-tab="preview"]').click();
  await window.locator('.doc-editor__tab[data-tab="edit"]').click();
  await expect(window.locator('[data-pane="edit"]')).not.toHaveClass(/doc-editor__pane--hidden/);
});

test('Save button is disabled while in the Preview tab', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-editor__tab[data-tab="preview"]').click();
  await expect(window.locator('#docSaveBtn')).toBeDisabled();
});

// ----------------------------------------------------------------
// Attachments bar toggle
// ----------------------------------------------------------------

test('clicking the attachments toggle expands the bar', async () => {
  await createEmptyDocument(window);
  await window.locator('#docAttachToggle').click();
  await expect(window.locator('#docAttachBody')).toHaveClass(/doc-attach-bar__body--open/);
});

test('clicking the attachments toggle again collapses the bar', async () => {
  await createEmptyDocument(window);
  await window.locator('#docAttachToggle').click();
  await window.locator('#docAttachToggle').click();
  await expect(window.locator('#docAttachBody')).not.toHaveClass(/doc-attach-bar__body--open/);
});

// ----------------------------------------------------------------
// Saving
// ----------------------------------------------------------------

test('saving a document updates its title in the sidebar', async () => {
  await createEmptyDocument(window);
  await window.locator('#docTitleInput').fill('Architecture Notes');
  await window.locator('#docSaveBtn').click();
  await expect(window.locator('.doc-sidebar__item-title')).toHaveText('Architecture Notes');
});

// ----------------------------------------------------------------
// Deletion
// ----------------------------------------------------------------

test('clicking delete removes the document and restores the empty state', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-sidebar__item-del').click();
  await expect(window.locator('.doc-sidebar__item')).toHaveCount(0);
  await expect(window.locator('.doc-panel__empty')).toBeVisible({ timeout: 5000 });
});

// ----------------------------------------------------------------
// Multiple documents — sidebar switching
// ----------------------------------------------------------------

test('clicking a sidebar item switches the active document', async () => {
  await createEmptyDocument(window);
  await window.locator('#docTitleInput').fill('First Doc');
  await window.locator('#docSaveBtn').click();
  await createDocumentFromTemplate(window, 'Meeting Notes');
  await window.locator('.doc-sidebar__item').first().click();
  await expect(window.locator('#docTitleInput')).toHaveValue('First Doc');
});
