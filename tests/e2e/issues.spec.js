'use strict';

// Functional tests for Project Home >> Issues.
// Covers: header navigation, add issue form lifecycle, edit form prefill
// and save, delete confirmation, status filter, accordion group toggle,
// feature→story dropdown linkage, and expand overlay lifecycle.
// Static labels, field visibility, and empty-state text omitted.

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

async function navigateToIssues(window) {
  await window.locator('#navIssues').click();
  await window.locator('.project-page').waitFor({ timeout: 10000 });
}

async function getProjectId(window) {
  const projects = await window.evaluate(() => window.db.projects.list());
  return projects[0]?.id;
}

async function seedFeature(window, projectId, name = 'Test Feature') {
  return window.evaluate(
    ([pid, n]) => window.db.features.create({ project_id: pid, name: n, description: '' }),
    [projectId, name],
  );
}

async function seedStory(window, projectId, featureId, title = 'Test Story') {
  return window.evaluate(
    ([pid, fid, t]) => window.db.userStories.create({
      project_id: pid, feature_id: fid, title: t,
      description: '', acceptance_criteria: '', is_extracted: 0,
    }),
    [projectId, featureId, title],
  );
}

async function seedIssue(window, projectId, title = 'Test Issue', status = 'open', severity = 'medium') {
  return window.evaluate(
    ([pid, t, s, sv]) => window.db.issues.create({ project_id: pid, title: t, status: s, severity: sv }),
    [projectId, title, status, severity],
  );
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
  await navigateToIssues(window);
  await window.locator('#isBtnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('model config button navigates to settings', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnModelConfigs').click();
  await expect(window.locator('.project-page')).toBeHidden({ timeout: 8000 });
});

test('git button navigates to git-changes page', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnGit').click();
  await expect(window.locator('.project-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Add Issue form
// ----------------------------------------------------------------

test('clicking Add opens the add issue form', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await expect(window.locator('#isFormTitle')).toBeVisible();
});

test('saving the add form without a title marks the title field as invalid', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await window.locator('#isFormSave').click();
  await expect(window.locator('#isFormTitle')).toHaveClass(/is-form__input--error/);
});

test('saving a new issue with a title adds it to the list', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await window.locator('#isFormTitle').fill('Login bug');
  await window.locator('#isFormSave').click();
  await expect(window.locator('#isIssuesList .eus-src-item__title')).toHaveText('Login bug');
});

test('newly created issue is auto-selected', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await window.locator('#isFormTitle').fill('Auto-select Issue');
  await window.locator('#isFormSave').click();
  await expect(window.locator('#isIssuesList .eus-src-item--active')).toHaveCount(1);
});

// ----------------------------------------------------------------
// Edit form — prefill and save
// ----------------------------------------------------------------

test('seeded issue auto-opens the edit form prefilled with its title', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Prefilled Issue');
  await navigateToIssues(window);
  await expect(window.locator('#isFormTitle')).toHaveValue('Prefilled Issue');
});

test('saving the edit form updates the issue title in the list', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Old Title');
  await navigateToIssues(window);
  await window.locator('#isFormTitle').fill('New Title');
  await window.locator('#isFormSave').click();
  await expect(window.locator('#isIssuesList .eus-src-item__title')).toHaveText('New Title');
});

// ----------------------------------------------------------------
// Delete issue
// ----------------------------------------------------------------

test('delete button shows a confirmation dialog', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Delete Me');
  await navigateToIssues(window);
  await window.locator('.eus-story-action--delete').click();
  await expect(window.locator('.is-confirm-overlay')).toBeVisible();
});

test('cancelling deletion keeps the issue in the list', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Keep Me');
  await navigateToIssues(window);
  await window.locator('.eus-story-action--delete').click();
  await window.locator('.is-confirm-btn--cancel').click();
  await expect(window.locator('#isIssuesList .eus-src-item')).toHaveCount(1);
});

test('confirming deletion removes the issue from the list', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Delete Me');
  await navigateToIssues(window);
  await window.locator('.eus-story-action--delete').click();
  await window.locator('.is-confirm-btn--ok').click();
  await expect(window.locator('#isIssuesList .eus-src-item')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Status filter
// ----------------------------------------------------------------

test('selecting a status filter shows only matching issues', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Open Issue', 'open');
  await seedIssue(window, pid, 'Resolved Issue', 'resolved');
  await navigateToIssues(window);
  await window.locator('#isStatusFilter').selectOption('open');
  await expect(window.locator('#isIssuesList .eus-src-item')).toHaveCount(1);
  await expect(window.locator('#isIssuesList .eus-src-item__title')).toHaveText('Open Issue');
});

// ----------------------------------------------------------------
// Accordion group toggle
// ----------------------------------------------------------------

test('clicking a status group header collapses that group', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Open Issue', 'open');
  await navigateToIssues(window);
  await window.locator('.is-acc__hd[data-status="open"]').click();
  await expect(window.locator('.is-acc[data-status="open"] .is-acc__body')).toHaveClass(/is-acc__body--collapsed/);
});

test('clicking a collapsed status group header expands it', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Open Issue', 'open');
  await navigateToIssues(window);
  await window.locator('.is-acc__hd[data-status="open"]').click();
  await window.locator('.is-acc__hd[data-status="open"]').click();
  await expect(window.locator('.is-acc[data-status="open"] .is-acc__body')).not.toHaveClass(/is-acc__body--collapsed/);
});

// ----------------------------------------------------------------
// Feature → User Story dropdown linkage
// ----------------------------------------------------------------

test('User Story dropdown is disabled when no feature is selected', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await expect(window.locator('#isFormStoryLink')).toBeDisabled();
});

test('selecting a feature enables and populates the User Story dropdown', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Auth Feature');
  await seedStory(window, pid, feature.id, 'Login Story');
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await window.locator('#isFormFeature').selectOption(String(feature.id));
  await expect(window.locator('#isFormStoryLink')).not.toBeDisabled();
});

// ----------------------------------------------------------------
// Expand overlay
// ----------------------------------------------------------------

test('clicking Expand opens the expand overlay', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await window.locator('#isDescExpandBtn').click();
  await expect(window.locator('.is-expand-overlay')).toBeVisible();
});

test('expand overlay X button closes it', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await window.locator('#isDescExpandBtn').click();
  await window.locator('#isExpandClose').click();
  await expect(window.locator('.is-expand-overlay')).toHaveCount(0);
});

test('expand overlay Done button closes it', async () => {
  await navigateToIssues(window);
  await window.locator('#isBtnAdd').click();
  await window.locator('#isDescExpandBtn').click();
  await window.locator('#isExpandDone').click();
  await expect(window.locator('.is-expand-overlay')).toHaveCount(0);
});
