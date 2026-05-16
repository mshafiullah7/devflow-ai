'use strict';

// Functional tests for Project Home >> Extract Stories.
// Covers: header navigation, feature/mockup/document selection toggles,
// story detail activation, generate validation dialog, generate modal
// lifecycle, story promotion, and story deletion.
// Static structure labels, count badges, and empty-state text omitted.

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

async function navigateToExtractStories(window) {
  await window.locator('#navExtractStories').click();
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

async function seedMockup(window, projectId, title = 'Test Mockup') {
  return window.evaluate(
    ([pid, t]) => window.db.screenDesigns.create({ project_id: pid, title: t, html_content: '<p>mockup</p>' }),
    [projectId, title],
  );
}

// Seeds a document with a default-set title so it is auto-checked on page load.
async function seedDocument(window, projectId, title = 'Project Overview') {
  return window.evaluate(
    ([pid, t]) => window.db.documents.create({ project_id: pid, title: t, content: '# Overview' }),
    [projectId, title],
  );
}

async function seedExtractedStory(window, projectId, featureId, title = 'Extracted Story') {
  return window.evaluate(
    ([pid, fid, t]) => window.db.userStories.create({
      project_id: pid, feature_id: fid, title: t,
      description: 'desc', acceptance_criteria: 'AC', is_extracted: 1,
    }),
    [projectId, featureId, title],
  );
}

async function seedExistingStory(window, projectId, featureId, title = 'Existing Story') {
  return window.evaluate(
    ([pid, fid, t]) => window.db.userStories.create({
      project_id: pid, feature_id: fid, title: t,
      description: 'desc', acceptance_criteria: 'AC', is_extracted: 0,
    }),
    [projectId, featureId, title],
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
  await navigateToExtractStories(window);
  await window.locator('#eusBtnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('model config button navigates to settings', async () => {
  await navigateToExtractStories(window);
  await window.locator('#btnModelConfigs').click();
  await expect(window.locator('.project-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Feature selection toggle
// ----------------------------------------------------------------

test('clicking an active feature deselects it and resets the stories panels', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Toggle Feature');
  await navigateToExtractStories(window);
  await window.locator('#eusFeaturesList .eus-src-item--active').click();
  await expect(window.locator('#eusFeaturesList .eus-src-item--active')).toHaveCount(0);
  await expect(window.locator('#eusExistingList .project-related__empty')).toHaveText('Select a feature');
  await expect(window.locator('#eusExtractedList .project-related__empty')).toHaveText('Select a feature');
});

test('clicking a different feature switches the active selection', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Feature A');
  await seedFeature(window, pid, 'Feature B');
  await navigateToExtractStories(window);
  await window.locator('#eusFeaturesList .eus-src-item').nth(1).click();
  await expect(window.locator('#eusFeaturesList .eus-src-item').nth(1)).toHaveClass(/eus-src-item--active/);
  await expect(window.locator('#eusFeaturesList .eus-src-item').nth(0)).not.toHaveClass(/eus-src-item--active/);
});

// ----------------------------------------------------------------
// Mockup selection toggle
// ----------------------------------------------------------------

test('clicking an active mockup deselects it', async () => {
  const pid = await getProjectId(window);
  await seedMockup(window, pid, 'Toggle Mockup');
  await navigateToExtractStories(window);
  await window.locator('#eusMockupsList .eus-src-item--active').click();
  await expect(window.locator('#eusMockupsList .eus-src-item--active')).toHaveCount(0);
});

test('only one mockup can be active at a time', async () => {
  const pid = await getProjectId(window);
  await seedMockup(window, pid, 'Mockup A');
  await seedMockup(window, pid, 'Mockup B');
  await navigateToExtractStories(window);
  await window.locator('#eusMockupsList .eus-src-item').nth(1).click();
  await expect(window.locator('#eusMockupsList .eus-src-item--active')).toHaveCount(1);
  await expect(window.locator('#eusMockupsList .eus-src-item').nth(1)).toHaveClass(/eus-src-item--active/);
});

// ----------------------------------------------------------------
// Document toggle
// ----------------------------------------------------------------

test('clicking an unchecked document checks it', async () => {
  const pid = await getProjectId(window);
  await seedDocument(window, pid, 'Custom Doc');
  await navigateToExtractStories(window);
  await window.locator('#eusDocumentsList .eus-src-item').click();
  await expect(window.locator('#eusDocumentsList .eus-src-checkbox--checked')).toHaveCount(1);
});

test('clicking a checked document unchecks it', async () => {
  const pid = await getProjectId(window);
  await seedDocument(window, pid, 'Project Overview'); // auto-checked
  await navigateToExtractStories(window);
  await window.locator('#eusDocumentsList .eus-src-item--active').click();
  await expect(window.locator('#eusDocumentsList .eus-src-checkbox--checked')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Story detail activation
// ----------------------------------------------------------------

test('clicking an existing story opens the detail form', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Detail Feature');
  await seedExistingStory(window, pid, feature.id, 'Clickable Story');
  await navigateToExtractStories(window);
  // first story is auto-focused when feature auto-selects
  await expect(window.locator('#eusDetailContent')).not.toContainText('Select a story to view details');
});

test('clicking an extracted story opens the detail form', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Detail Feature');
  await seedExtractedStory(window, pid, feature.id, 'Extracted Detail');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList .eus-src-item').click();
  await expect(window.locator('#eusDetailContent')).not.toContainText('Select a story to view details');
});

// ----------------------------------------------------------------
// Generate — validation error dialog
// ----------------------------------------------------------------

test('clicking Generate with nothing selected shows an error dialog', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await expect(window.locator('.usl-confirm-overlay')).toBeVisible();
});

test('error dialog lists all three missing items when nothing is selected', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  const msg = window.locator('.usl-confirm-msg');
  await expect(msg).toContainText('Feature');
  await expect(msg).toContainText('Mockup');
  await expect(msg).toContainText('Document');
});

test('error dialog OK button dismisses it', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.usl-confirm-btn--ok').click();
  await expect(window.locator('.usl-confirm-overlay')).toHaveCount(0);
});

test('error lists only Mockup when feature and document are present but mockup is deselected', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Some Feature');
  await seedMockup(window, pid, 'Deselect Mockup');
  await seedDocument(window, pid, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusMockupsList .eus-src-item--active').click(); // deselect
  await window.locator('#eusBtnGenerate').click();
  const msg = window.locator('.usl-confirm-msg');
  await expect(msg).not.toContainText('Feature');
  await expect(msg).toContainText('Mockup');
  await expect(msg).not.toContainText('Document');
});

// ----------------------------------------------------------------
// Generate modal — open and close
// ----------------------------------------------------------------

test('Generate modal opens when feature, mockup, and document are all selected', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Modal Feature');
  await seedMockup(window, pid, 'Modal Mockup');
  await seedDocument(window, pid, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await expect(window.locator('.eus-gen-overlay')).toBeVisible({ timeout: 5000 });
  await expect(window.locator('.eus-gen-title')).toHaveText('Generate User Stories');
});

test('Generate modal shows selected source names in the summary', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Login Feature');
  await seedMockup(window, pid, 'Login Mockup');
  await seedDocument(window, pid, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await expect(window.locator('.eus-gen-source-row').filter({ hasText: 'Feature' }).locator('.eus-gen-source-value')).toHaveText('Login Feature');
  await expect(window.locator('.eus-gen-source-row').filter({ hasText: 'Mockup' }).locator('.eus-gen-source-value')).toHaveText('Login Mockup');
});

test('Generate modal X button dismisses the modal', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Modal Feature');
  await seedMockup(window, pid, 'Modal Mockup');
  await seedDocument(window, pid, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await window.locator('.eus-gen-close').click();
  await expect(window.locator('.eus-gen-overlay')).toHaveCount(0);
});

test('Generate modal footer Close button dismisses the modal', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Modal Feature');
  await seedMockup(window, pid, 'Modal Mockup');
  await seedDocument(window, pid, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await window.locator('.eus-gen-btn--close').click();
  await expect(window.locator('.eus-gen-overlay')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Story promotion
// ----------------------------------------------------------------

test('promoting an extracted story moves it to the Existing list', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Promote Feature');
  await seedExtractedStory(window, pid, feature.id, 'Promote Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="promote"]').click();
  await expect(window.locator('#eusExistingList .eus-src-item__title')).toHaveText('Promote Me');
  await expect(window.locator('#eusExtractedList .eus-src-item')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Story deletion
// ----------------------------------------------------------------

test('delete button shows a confirmation dialog', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Delete Feature');
  await seedExtractedStory(window, pid, feature.id, 'Delete Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="delete"]').click();
  await expect(window.locator('.usl-confirm-overlay')).toBeVisible();
});

test('cancelling deletion keeps the story in the Extracted list', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Delete Feature');
  await seedExtractedStory(window, pid, feature.id, 'Keep Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="delete"]').click();
  await window.locator('.usl-confirm-btn--cancel').click();
  await expect(window.locator('#eusExtractedList .eus-src-item')).toHaveCount(1);
});

test('confirming deletion removes the story from the Extracted list', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Delete Feature');
  await seedExtractedStory(window, pid, feature.id, 'Delete Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="delete"]').click();
  await window.locator('.usl-confirm-btn--danger').click();
  await expect(window.locator('#eusExtractedList .eus-src-item')).toHaveCount(0);
});
