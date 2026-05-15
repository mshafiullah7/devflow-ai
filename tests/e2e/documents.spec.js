'use strict';

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

// Opens the template picker and picks the "Empty Document" template.
async function createEmptyDocument(window) {
  await window.locator('#docAddBtn').click();
  await window.locator('.doc-tpl-picker').waitFor();
  await window.locator('.doc-tpl-item').filter({ hasText: 'Empty Document' }).click();
  await window.locator('.doc-editor-wrap').waitFor({ timeout: 5000 });
}

// Creates a document from a named template.
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
// Page structure
// ----------------------------------------------------------------
test('documents page renders with project name in title', async () => {
  await expect(window.locator('.documents-page__title')).toHaveText('E2E Test Project');
});

test('documents page subtitle reads Project Documents', async () => {
  await expect(window.locator('.documents-page__subtitle')).toHaveText('Project Documents');
});

test('documents page back button is visible', async () => {
  await expect(window.locator('#btnBack')).toBeVisible();
});

test('documents page back button navigates to project home', async () => {
  await window.locator('#btnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('folder selector shows Select folder by default', async () => {
  await expect(window.locator('#headerFolderText')).toHaveText('Select folder');
});

test('model config button is visible in header', async () => {
  await expect(window.locator('#docBtnModelConfigs')).toBeVisible();
});

test('git button is visible in header', async () => {
  await expect(window.locator('#docBtnGit')).toBeVisible();
});

// ----------------------------------------------------------------
// Empty state (fresh project)
// ----------------------------------------------------------------
test('sidebar shows No documents yet on fresh project', async () => {
  await expect(window.locator('.doc-sidebar__empty')).toHaveText('No documents yet');
});

test('sidebar list starts empty', async () => {
  await expect(window.locator('.doc-sidebar__item')).toHaveCount(0);
});

test('main panel shows empty state on fresh project', async () => {
  await expect(window.locator('.doc-panel__empty')).toBeVisible();
});

// ----------------------------------------------------------------
// Sidebar
// ----------------------------------------------------------------
test('New button is visible in sidebar', async () => {
  await expect(window.locator('#docAddBtn')).toBeVisible();
});

test('New button has correct label', async () => {
  await expect(window.locator('#docAddBtn')).toContainText('New');
});

// ----------------------------------------------------------------
// Template picker modal
// ----------------------------------------------------------------
test('clicking New opens the template picker', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-picker')).toBeVisible();
});

test('template picker shows Choose a Template title', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-title')).toHaveText('Choose a Template');
});

test('template picker lists all default templates', async () => {
  await window.locator('#docAddBtn').click();
  await window.locator('.doc-tpl-picker').waitFor();
  const items = window.locator('.doc-tpl-item');
  await expect(items).toHaveCount(6);
});

test('template picker includes Empty Document template', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-item').filter({ hasText: 'Empty Document' })).toBeVisible();
});

test('template picker includes Project Overview template', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-item').filter({ hasText: 'Project Overview' })).toBeVisible();
});

test('template picker includes Technical Specification template', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-item').filter({ hasText: 'Technical Specification' })).toBeVisible();
});

test('template picker includes Meeting Notes template', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-item').filter({ hasText: 'Meeting Notes' })).toBeVisible();
});

test('template picker includes Tasks template', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-item').filter({ hasText: 'Tasks' })).toBeVisible();
});

test('template picker includes Release Notes template', async () => {
  await window.locator('#docAddBtn').click();
  await expect(window.locator('.doc-tpl-item').filter({ hasText: 'Release Notes' })).toBeVisible();
});

test('template picker close button dismisses the modal', async () => {
  await window.locator('#docAddBtn').click();
  await window.locator('.doc-tpl-picker').waitFor();
  await window.locator('.doc-tpl-close').click();
  await expect(window.locator('.doc-tpl-picker')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Document creation
// ----------------------------------------------------------------
test('picking Empty Document creates a document and opens the editor', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-editor-wrap')).toBeVisible();
});

test('Empty Document template sets title to Untitled Document', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docTitleInput')).toHaveValue('Untitled Document');
});

test('created document appears in sidebar', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-sidebar__item')).toHaveCount(1);
});

test('sidebar empty state is removed after first document is created', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-sidebar__empty')).toHaveCount(0);
});

test('sidebar item is active after creation', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-sidebar__item')).toHaveClass(/doc-sidebar__item--active/);
});

test('Project Overview template pre-fills content in textarea', async () => {
  await createDocumentFromTemplate(window, 'Project Overview');
  const content = await window.locator('#docContentTA').inputValue();
  await expect(content).toContain('# Project Overview');
});

test('Technical Specification template pre-fills content in textarea', async () => {
  await createDocumentFromTemplate(window, 'Technical Specification');
  const content = await window.locator('#docContentTA').inputValue();
  await expect(content).toContain('# Technical Specification');
});

test('Meeting Notes template pre-fills content in textarea', async () => {
  await createDocumentFromTemplate(window, 'Meeting Notes');
  const content = await window.locator('#docContentTA').inputValue();
  await expect(content).toContain('# Meeting Notes');
});

test('Tasks template pre-fills content with checkboxes', async () => {
  await createDocumentFromTemplate(window, 'Tasks');
  const content = await window.locator('#docContentTA').inputValue();
  await expect(content).toContain('# Tasks');
});

test('Release Notes template pre-fills content in textarea', async () => {
  await createDocumentFromTemplate(window, 'Release Notes');
  const content = await window.locator('#docContentTA').inputValue();
  await expect(content).toContain('# Release Notes');
});

// ----------------------------------------------------------------
// Editor
// ----------------------------------------------------------------
test('editor shows title input', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docTitleInput')).toBeVisible();
});

test('editor shows content textarea in edit tab', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docContentTA')).toBeVisible();
});

test('editor shows Edit tab button', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-editor__tab[data-tab="edit"]')).toBeVisible();
});

test('editor shows Preview tab button', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-editor__tab[data-tab="preview"]')).toBeVisible();
});

test('Edit tab is active by default', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-editor__tab[data-tab="edit"]')).toHaveClass(/doc-editor__tab--active/);
});

test('editor shows Save button', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docSaveBtn')).toBeVisible();
});

test('editor shows Export PDF button', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docExportPdfBtn')).toBeVisible();
});

test('title input accepts text input', async () => {
  await createEmptyDocument(window);
  await window.locator('#docTitleInput').fill('My Test Document');
  await expect(window.locator('#docTitleInput')).toHaveValue('My Test Document');
});

test('content textarea accepts text input', async () => {
  await createEmptyDocument(window);
  await window.locator('#docContentTA').fill('# Hello World');
  await expect(window.locator('#docContentTA')).toHaveValue('# Hello World');
});

// ----------------------------------------------------------------
// Edit / Preview tabs
// ----------------------------------------------------------------
test('switching to Preview tab hides the textarea', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-editor__tab[data-tab="preview"]').click();
  await expect(window.locator('[data-pane="edit"]')).toHaveClass(/doc-editor__pane--hidden/);
});

test('switching to Preview tab shows the preview pane', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-editor__tab[data-tab="preview"]').click();
  await expect(window.locator('[data-pane="preview"]')).not.toHaveClass(/doc-editor__pane--hidden/);
});

test('switching to Preview tab marks Preview tab as active', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-editor__tab[data-tab="preview"]').click();
  await expect(window.locator('.doc-editor__tab[data-tab="preview"]')).toHaveClass(/doc-editor__tab--active/);
});

test('switching back to Edit tab shows the textarea again', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-editor__tab[data-tab="preview"]').click();
  await window.locator('.doc-editor__tab[data-tab="edit"]').click();
  await expect(window.locator('[data-pane="edit"]')).not.toHaveClass(/doc-editor__pane--hidden/);
});

test('Save button is disabled in Preview tab', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-editor__tab[data-tab="preview"]').click();
  await expect(window.locator('#docSaveBtn')).toBeDisabled();
});

// ----------------------------------------------------------------
// AI panel
// ----------------------------------------------------------------
test('AI card is visible in the editor', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docAiCard')).toBeVisible();
});

test('AI card shows welcome message on a new document', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-ai-card__welcome')).toBeVisible();
});

test('AI card shows input textarea', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docAiInput')).toBeVisible();
});

test('AI card shows Send button', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docAiSend')).toBeVisible();
});

test('AI card shows clear conversation button', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docAiClear')).toBeVisible();
});

test('AI input accepts text', async () => {
  await createEmptyDocument(window);
  await window.locator('#docAiInput').fill('Add an introduction section');
  await expect(window.locator('#docAiInput')).toHaveValue('Add an introduction section');
});

// ----------------------------------------------------------------
// Attachments bar
// ----------------------------------------------------------------
test('attachments bar toggle is visible', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docAttachToggle')).toBeVisible();
});

test('attachments bar body is collapsed by default', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('#docAttachBody')).not.toHaveClass(/doc-attach-bar__body--open/);
});

test('clicking attachments toggle expands the attachments bar', async () => {
  await createEmptyDocument(window);
  await window.locator('#docAttachToggle').click();
  await expect(window.locator('#docAttachBody')).toHaveClass(/doc-attach-bar__body--open/);
});

test('expanded attachments bar shows Add SVG button', async () => {
  await createEmptyDocument(window);
  await window.locator('#docAttachToggle').click();
  await expect(window.locator('#docAddSvg')).toBeVisible();
});

test('expanded attachments bar shows Add draw.io button', async () => {
  await createEmptyDocument(window);
  await window.locator('#docAttachToggle').click();
  await expect(window.locator('#docAddDrawio')).toBeVisible();
});

test('expanded attachments bar shows empty state when no attachments', async () => {
  await createEmptyDocument(window);
  await window.locator('#docAttachToggle').click();
  await expect(window.locator('.doc-attach-empty')).toBeVisible();
});

test('clicking attachments toggle again collapses the bar', async () => {
  await createEmptyDocument(window);
  await window.locator('#docAttachToggle').click();
  await window.locator('#docAttachToggle').click();
  await expect(window.locator('#docAttachBody')).not.toHaveClass(/doc-attach-bar__body--open/);
});

// ----------------------------------------------------------------
// Saving a document
// ----------------------------------------------------------------
test('saving updates the sidebar title', async () => {
  await createEmptyDocument(window);
  await window.locator('#docTitleInput').fill('Architecture Notes');
  await window.locator('#docSaveBtn').click();
  await expect(window.locator('.doc-sidebar__item-title')).toHaveText('Architecture Notes');
});

// ----------------------------------------------------------------
// Document deletion
// ----------------------------------------------------------------
test('sidebar item shows a delete button', async () => {
  await createEmptyDocument(window);
  await expect(window.locator('.doc-sidebar__item-del')).toBeVisible();
});

test('clicking delete removes the document from sidebar', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-sidebar__item-del').click();
  await expect(window.locator('.doc-sidebar__item')).toHaveCount(0);
});

test('deleting the only document restores the empty state', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-sidebar__item-del').click();
  await expect(window.locator('.doc-panel__empty')).toBeVisible({ timeout: 5000 });
});

test('deleting the only document restores No documents yet in sidebar', async () => {
  await createEmptyDocument(window);
  await window.locator('.doc-sidebar__item-del').click();
  await expect(window.locator('.doc-sidebar__empty')).toHaveText('No documents yet');
});

// ----------------------------------------------------------------
// Multiple documents
// ----------------------------------------------------------------
test('creating two documents shows both in sidebar', async () => {
  await createEmptyDocument(window);
  await createDocumentFromTemplate(window, 'Meeting Notes');
  await expect(window.locator('.doc-sidebar__item')).toHaveCount(2);
});

test('clicking a sidebar item switches the active document', async () => {
  await createEmptyDocument(window);
  await window.locator('#docTitleInput').fill('First Doc');
  await window.locator('#docSaveBtn').click();
  await createDocumentFromTemplate(window, 'Meeting Notes');
  // click the first sidebar item
  await window.locator('.doc-sidebar__item').first().click();
  await expect(window.locator('#docTitleInput')).toHaveValue('First Doc');
});

test('active sidebar item has active class', async () => {
  await createEmptyDocument(window);
  await createDocumentFromTemplate(window, 'Meeting Notes');
  // last created document should be active
  await expect(window.locator('.doc-sidebar__item').last()).toHaveClass(/doc-sidebar__item--active/);
});
