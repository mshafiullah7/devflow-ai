'use strict';

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

// Seeds a document using a title from the auto-select set so it is pre-checked on load.
async function seedDocument(window, projectId, title = 'Project Overview') {
  return window.evaluate(
    ([pid, t]) => window.db.documents.create({ project_id: pid, title: t, content: '# Project Overview' }),
    [projectId, title],
  );
}

async function seedExtractedStory(window, projectId, featureId, title = 'Extracted Story') {
  return window.evaluate(
    ([pid, fid, t]) => window.db.userStories.create({
      project_id: pid,
      feature_id: fid,
      title: t,
      description: 'Test description',
      acceptance_criteria: 'Given/When/Then',
      is_extracted: 1,
    }),
    [projectId, featureId, title],
  );
}

async function seedExistingStory(window, projectId, featureId, title = 'Existing Story') {
  return window.evaluate(
    ([pid, fid, t]) => window.db.userStories.create({
      project_id: pid,
      feature_id: fid,
      title: t,
      description: 'Existing description',
      acceptance_criteria: 'Given/When/Then',
      is_extracted: 0,
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
// Navigation from project home
// ----------------------------------------------------------------

test('Extract Stories nav item is visible on project home', async () => {
  await expect(window.locator('#navExtractStories')).toBeVisible();
});

test('clicking Extract Stories navigates away from project home', async () => {
  await window.locator('#navExtractStories').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('Extract Stories page renders the project-page container', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('.project-page')).toBeVisible();
});

test('Extract Stories page shows correct title', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('.project-page__title')).toHaveText('Extract User Stories');
});

test('Extract Stories page shows correct description', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('.project-page__desc')).toHaveText('Generate user stories from project documents');
});

// ----------------------------------------------------------------
// Header controls
// ----------------------------------------------------------------

test('back button is visible', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusBtnBack')).toBeVisible();
});

test('back button navigates to project home', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('Generate User Stories button is visible', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusBtnGenerate')).toBeVisible();
});

test('Generate User Stories button shows correct label', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusBtnGenerate')).toContainText('Generate User Stories');
});

test('folder selector shows Select folder by default', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#headerFolderText')).toHaveText('Select folder');
});

test('model picker is present in header', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusModelPicker')).toBeVisible();
});

test('model config button is visible in header', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#btnModelConfigs')).toBeVisible();
});

test('model config button navigates to settings', async () => {
  await navigateToExtractStories(window);
  await window.locator('#btnModelConfigs').click();
  await expect(window.locator('.project-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Sources panel — empty state
// ----------------------------------------------------------------

test('features section shows No features on fresh project', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusFeaturesList .project-related__empty')).toHaveText('No features');
});

test('features count badge shows 0 on fresh project', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusFeaturesCount')).toHaveText('0');
});

test('mockups section shows No mockups on fresh project', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusMockupsList .project-related__empty')).toHaveText('No mockups');
});

test('mockups count badge shows 0 on fresh project', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusMockupsCount')).toHaveText('0');
});

test('documents section shows No documents on fresh project', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusDocumentsList .project-related__empty')).toHaveText('No documents');
});

test('documents count badge shows 0 on fresh project', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusDocumentsCount')).toHaveText('0');
});

// ----------------------------------------------------------------
// Stories panel — empty state
// ----------------------------------------------------------------

test('existing stories section shows Select a feature with no feature selected', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExistingList .project-related__empty')).toHaveText('Select a feature');
});

test('existing stories count badge shows 0 on fresh project', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExistingCount')).toHaveText('0');
});

test('extracted stories section shows Select a feature with no feature selected', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExtractedList .project-related__empty')).toHaveText('Select a feature');
});

test('extracted stories count badge shows 0 on fresh project', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExtractedCount')).toHaveText('0');
});

// ----------------------------------------------------------------
// Story detail panel — initial state
// ----------------------------------------------------------------

test('story detail panel shows prompt text on load', async () => {
  await navigateToExtractStories(window);
  await expect(window.locator('#eusDetailContent')).toContainText('Select a story to view details');
});

// ----------------------------------------------------------------
// Sources panel — with seeded data
// ----------------------------------------------------------------

test('features list renders seeded feature', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Login Feature');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusFeaturesList .eus-src-item')).toHaveCount(1);
  await expect(window.locator('#eusFeaturesList .eus-src-item__title')).toHaveText('Login Feature');
});

test('features count badge updates when features exist', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Feature A');
  await seedFeature(window, projectId, 'Feature B');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusFeaturesCount')).toHaveText('2');
});

test('first feature is auto-selected on load', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Auto Feature');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusFeaturesList .eus-src-item--active')).toHaveCount(1);
});

test('mockups list renders seeded mockup', async () => {
  const projectId = await getProjectId(window);
  await seedMockup(window, projectId, 'Dashboard Mockup');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusMockupsList .eus-src-item')).toHaveCount(1);
  await expect(window.locator('#eusMockupsList .eus-src-item__title')).toHaveText('Dashboard Mockup');
});

test('mockups count badge updates when mockups exist', async () => {
  const projectId = await getProjectId(window);
  await seedMockup(window, projectId, 'Mockup 1');
  await seedMockup(window, projectId, 'Mockup 2');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusMockupsCount')).toHaveText('2');
});

test('first mockup is auto-selected on load', async () => {
  const projectId = await getProjectId(window);
  await seedMockup(window, projectId, 'First Mockup');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusMockupsList .eus-src-item--active')).toHaveCount(1);
});

test('documents list renders seeded document', async () => {
  const projectId = await getProjectId(window);
  await seedDocument(window, projectId, 'My Doc');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusDocumentsList .eus-src-item')).toHaveCount(1);
  await expect(window.locator('#eusDocumentsList .eus-src-item__title')).toHaveText('My Doc');
});

test('documents count badge updates when documents exist', async () => {
  const projectId = await getProjectId(window);
  await seedDocument(window, projectId, 'Doc A');
  await seedDocument(window, projectId, 'Doc B');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusDocumentsCount')).toHaveText('2');
});

test('default-titled document is auto-checked on load', async () => {
  const projectId = await getProjectId(window);
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusDocumentsList .eus-src-item--active')).toHaveCount(1);
  await expect(window.locator('#eusDocumentsList .eus-src-checkbox--checked')).toHaveCount(1);
});

test('non-default document is not auto-checked on load', async () => {
  const projectId = await getProjectId(window);
  await seedDocument(window, projectId, 'Custom Doc');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusDocumentsList .eus-src-item--active')).toHaveCount(0);
  await expect(window.locator('#eusDocumentsList .eus-src-checkbox--checked')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Feature selection behavior
// ----------------------------------------------------------------

test('clicking an active feature deselects it', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Toggle Feature');
  await navigateToExtractStories(window);
  // First feature is auto-selected; click again to deselect
  await window.locator('#eusFeaturesList .eus-src-item--active').click();
  await expect(window.locator('#eusFeaturesList .eus-src-item--active')).toHaveCount(0);
});

test('deselecting feature resets stories panels to Select a feature', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Toggle Feature');
  await navigateToExtractStories(window);
  await window.locator('#eusFeaturesList .eus-src-item--active').click();
  await expect(window.locator('#eusExistingList .project-related__empty')).toHaveText('Select a feature');
  await expect(window.locator('#eusExtractedList .project-related__empty')).toHaveText('Select a feature');
});

test('clicking a different feature switches the active selection', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Feature Alpha');
  await seedFeature(window, projectId, 'Feature Beta');
  await navigateToExtractStories(window);
  // First is auto-selected; click second
  const items = window.locator('#eusFeaturesList .eus-src-item');
  await items.nth(1).click();
  await expect(items.nth(1)).toHaveClass(/eus-src-item--active/);
  await expect(items.nth(0)).not.toHaveClass(/eus-src-item--active/);
});

test('selecting a feature shows No user stories when none exist', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Empty Feature');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExistingList .project-related__empty')).toHaveText('No user stories');
  await expect(window.locator('#eusExtractedList .project-related__empty')).toHaveText('No stories extracted yet');
});

// ----------------------------------------------------------------
// Mockup selection behavior
// ----------------------------------------------------------------

test('clicking an active mockup deselects it', async () => {
  const projectId = await getProjectId(window);
  await seedMockup(window, projectId, 'Toggle Mockup');
  await navigateToExtractStories(window);
  await window.locator('#eusMockupsList .eus-src-item--active').click();
  await expect(window.locator('#eusMockupsList .eus-src-item--active')).toHaveCount(0);
});

test('clicking a deselected mockup selects it', async () => {
  const projectId = await getProjectId(window);
  await seedMockup(window, projectId, 'Toggle Mockup');
  await navigateToExtractStories(window);
  // Deselect first
  await window.locator('#eusMockupsList .eus-src-item--active').click();
  // Re-select
  await window.locator('#eusMockupsList .eus-src-item').click();
  await expect(window.locator('#eusMockupsList .eus-src-item--active')).toHaveCount(1);
});

test('only one mockup can be active at a time', async () => {
  const projectId = await getProjectId(window);
  await seedMockup(window, projectId, 'Mockup A');
  await seedMockup(window, projectId, 'Mockup B');
  await navigateToExtractStories(window);
  // Click second mockup
  await window.locator('#eusMockupsList .eus-src-item').nth(1).click();
  await expect(window.locator('#eusMockupsList .eus-src-item--active')).toHaveCount(1);
  await expect(window.locator('#eusMockupsList .eus-src-item').nth(1)).toHaveClass(/eus-src-item--active/);
});

// ----------------------------------------------------------------
// Document toggle behavior
// ----------------------------------------------------------------

test('clicking an unchecked document checks it', async () => {
  const projectId = await getProjectId(window);
  await seedDocument(window, projectId, 'Custom Doc');
  await navigateToExtractStories(window);
  await window.locator('#eusDocumentsList .eus-src-item').click();
  await expect(window.locator('#eusDocumentsList .eus-src-item--active')).toHaveCount(1);
  await expect(window.locator('#eusDocumentsList .eus-src-checkbox--checked')).toHaveCount(1);
});

test('clicking a checked document unchecks it', async () => {
  const projectId = await getProjectId(window);
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  // Auto-checked; click to uncheck
  await window.locator('#eusDocumentsList .eus-src-item--active').click();
  await expect(window.locator('#eusDocumentsList .eus-src-item--active')).toHaveCount(0);
  await expect(window.locator('#eusDocumentsList .eus-src-checkbox--checked')).toHaveCount(0);
});

test('multiple documents can be checked simultaneously', async () => {
  const projectId = await getProjectId(window);
  await seedDocument(window, projectId, 'Doc One');
  await seedDocument(window, projectId, 'Doc Two');
  await navigateToExtractStories(window);
  const items = window.locator('#eusDocumentsList .eus-src-item');
  await items.nth(0).click();
  await items.nth(1).click();
  await expect(window.locator('#eusDocumentsList .eus-src-item--active')).toHaveCount(2);
});

// ----------------------------------------------------------------
// User stories panel — with seeded data
// ----------------------------------------------------------------

test('existing stories appear when feature is selected', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Story Feature');
  await seedExistingStory(window, projectId, feature.id, 'User can login');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExistingList .eus-src-item')).toHaveCount(1);
  await expect(window.locator('#eusExistingList .eus-src-item__title')).toHaveText('User can login');
});

test('existing stories count badge updates correctly', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Story Feature');
  await seedExistingStory(window, projectId, feature.id, 'Story A');
  await seedExistingStory(window, projectId, feature.id, 'Story B');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExistingCount')).toHaveText('2');
});

test('extracted stories appear when feature is selected', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Extract Feature');
  await seedExtractedStory(window, projectId, feature.id, 'AI Generated Story');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExtractedList .eus-src-item')).toHaveCount(1);
  await expect(window.locator('#eusExtractedList .eus-src-item__title')).toHaveText('AI Generated Story');
});

test('extracted stories count badge updates correctly', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Extract Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Extracted A');
  await seedExtractedStory(window, projectId, feature.id, 'Extracted B');
  await navigateToExtractStories(window);
  await expect(window.locator('#eusExtractedCount')).toHaveText('2');
});

test('extracted story rows show promote and delete action buttons', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Action Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Story with actions');
  await navigateToExtractStories(window);
  const row = window.locator('#eusExtractedList .eus-src-item');
  await expect(row.locator('[data-action="promote"]')).toBeVisible();
  await expect(row.locator('[data-action="delete"]')).toBeVisible();
});

test('existing story rows do not show action buttons', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Story Feature');
  await seedExistingStory(window, projectId, feature.id, 'Plain Story');
  await navigateToExtractStories(window);
  const row = window.locator('#eusExistingList .eus-src-item');
  await expect(row.locator('[data-action]')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Story detail panel — click behavior
// ----------------------------------------------------------------

test('clicking an existing story opens the detail form', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Detail Feature');
  await seedExistingStory(window, projectId, feature.id, 'Detail Story');
  await navigateToExtractStories(window);
  // First existing story is auto-focused on page load when a feature is auto-selected
  await expect(window.locator('#eusDetailContent')).not.toContainText('Select a story to view details');
});

test('clicking an extracted story opens the detail form', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Detail Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Extracted Detail Story');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList .eus-src-item').click();
  await expect(window.locator('#eusDetailContent')).not.toContainText('Select a story to view details');
});

test('clicking an existing story marks it active', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Active Feature');
  await seedExistingStory(window, projectId, feature.id, 'Story One');
  await seedExistingStory(window, projectId, feature.id, 'Story Two');
  await navigateToExtractStories(window);
  await window.locator('#eusExistingList .eus-src-item').nth(1).click();
  await expect(window.locator('#eusExistingList .eus-src-item').nth(1)).toHaveClass(/eus-src-item--active/);
});

// ----------------------------------------------------------------
// Generate — validation (missing selections)
// ----------------------------------------------------------------

test('clicking Generate with nothing selected shows error dialog', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await expect(window.locator('.usl-confirm-overlay')).toBeVisible();
});

test('generate error dialog mentions Feature when no feature is selected', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await expect(window.locator('.usl-confirm-msg')).toContainText('Feature');
});

test('generate error dialog mentions Mockup when no mockup is selected', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await expect(window.locator('.usl-confirm-msg')).toContainText('Mockup');
});

test('generate error dialog mentions Document when no document is selected', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await expect(window.locator('.usl-confirm-msg')).toContainText('Document');
});

test('generate error dialog OK button dismisses the dialog', async () => {
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.usl-confirm-btn--ok').click();
  await expect(window.locator('.usl-confirm-overlay')).toHaveCount(0);
});

test('generate error shows only Feature when only feature is missing', async () => {
  const projectId = await getProjectId(window);
  await seedMockup(window, projectId, 'Some Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  // No feature seeded — none auto-selected
  await window.locator('#eusBtnGenerate').click();
  const msg = window.locator('.usl-confirm-msg');
  await expect(msg).toContainText('Feature');
  await expect(msg).not.toContainText('Mockup');
  await expect(msg).not.toContainText('Document');
});

test('generate error shows only Mockup when mockup is deselected', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Some Feature');
  await seedMockup(window, projectId, 'Deselect Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  // Deselect the auto-selected mockup
  await window.locator('#eusMockupsList .eus-src-item--active').click();
  await window.locator('#eusBtnGenerate').click();
  const msg = window.locator('.usl-confirm-msg');
  await expect(msg).not.toContainText('Feature');
  await expect(msg).toContainText('Mockup');
  await expect(msg).not.toContainText('Document');
});

// ----------------------------------------------------------------
// Generate modal — structure
// ----------------------------------------------------------------

test('Generate modal opens when feature, mockup, and document are all selected', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Modal Feature');
  await seedMockup(window, projectId, 'Modal Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await expect(window.locator('.eus-gen-overlay')).toBeVisible({ timeout: 5000 });
});

test('Generate modal shows Generate User Stories title', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Modal Feature');
  await seedMockup(window, projectId, 'Modal Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await expect(window.locator('.eus-gen-title')).toHaveText('Generate User Stories');
});

test('Generate modal shows selected feature name in sources', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Login Feature');
  await seedMockup(window, projectId, 'Login Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  const featureRow = window.locator('.eus-gen-source-row').filter({ hasText: 'Feature' });
  await expect(featureRow.locator('.eus-gen-source-value')).toHaveText('Login Feature');
});

test('Generate modal shows selected mockup name in sources', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Login Feature');
  await seedMockup(window, projectId, 'Login Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  const mockupRow = window.locator('.eus-gen-source-row').filter({ hasText: 'Mockup' });
  await expect(mockupRow.locator('.eus-gen-source-value')).toHaveText('Login Mockup');
});

test('Generate modal shows selected document name in sources', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Login Feature');
  await seedMockup(window, projectId, 'Login Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  const docsRow = window.locator('.eus-gen-source-row').filter({ hasText: 'Documents' });
  await expect(docsRow.locator('.eus-gen-source-value')).toContainText('Project Overview');
});

test('Generate modal Run button is initially disabled', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Modal Feature');
  await seedMockup(window, projectId, 'Modal Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await expect(window.locator('.eus-gen-btn--run')).toBeDisabled();
});

test('Generate modal Load JSON from Disk button is visible', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Modal Feature');
  await seedMockup(window, projectId, 'Modal Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await expect(window.locator('#eusLoadJsonBtn')).toBeVisible();
});

test('Generate modal Load to DB button is initially disabled', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Modal Feature');
  await seedMockup(window, projectId, 'Modal Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await expect(window.locator('#eusLoadToDbBtn')).toBeDisabled();
});

test('Generate modal X button dismisses the modal', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Modal Feature');
  await seedMockup(window, projectId, 'Modal Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await window.locator('.eus-gen-close').click();
  await expect(window.locator('.eus-gen-overlay')).toHaveCount(0);
});

test('Generate modal Close button in footer dismisses the modal', async () => {
  const projectId = await getProjectId(window);
  await seedFeature(window, projectId, 'Modal Feature');
  await seedMockup(window, projectId, 'Modal Mockup');
  await seedDocument(window, projectId, 'Project Overview');
  await navigateToExtractStories(window);
  await window.locator('#eusBtnGenerate').click();
  await window.locator('.eus-gen-overlay').waitFor({ timeout: 5000 });
  await window.locator('.eus-gen-btn--close').click();
  await expect(window.locator('.eus-gen-overlay')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Story promotion
// ----------------------------------------------------------------

test('clicking promote moves extracted story to existing list', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Promote Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Promote Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="promote"]').click();
  await expect(window.locator('#eusExistingList .eus-src-item__title')).toHaveText('Promote Me');
});

test('promoting a story removes it from extracted list', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Promote Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Promote Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="promote"]').click();
  await expect(window.locator('#eusExtractedList .eus-src-item')).toHaveCount(0);
  await expect(window.locator('#eusExtractedList .project-related__empty')).toHaveText('No stories extracted yet');
});

test('promoting a story updates extracted count badge', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Promote Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Story A');
  await seedExtractedStory(window, projectId, feature.id, 'Story B');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="promote"]').first().click();
  await expect(window.locator('#eusExtractedCount')).toHaveText('1');
});

test('promoting a story updates existing count badge', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Promote Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Promote Me');
  await navigateToExtractStories(window);
  const beforeCount = await window.locator('#eusExistingCount').textContent();
  await window.locator('#eusExtractedList [data-action="promote"]').click();
  const afterCount = await window.locator('#eusExistingCount').textContent();
  await expect(parseInt(afterCount)).toBeGreaterThan(parseInt(beforeCount));
});

// ----------------------------------------------------------------
// Story deletion
// ----------------------------------------------------------------

test('clicking delete shows a confirmation dialog', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Delete Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Delete Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="delete"]').click();
  await expect(window.locator('.usl-confirm-overlay')).toBeVisible();
});

test('delete confirmation dialog mentions the action', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Delete Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Delete Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="delete"]').click();
  await expect(window.locator('.usl-confirm-msg')).toContainText('Delete');
});

test('cancelling deletion keeps the story in extracted list', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Delete Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Keep Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="delete"]').click();
  await window.locator('.usl-confirm-btn--cancel').click();
  await expect(window.locator('#eusExtractedList .eus-src-item')).toHaveCount(1);
});

test('confirming deletion removes the story from extracted list', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Delete Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Delete Me');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="delete"]').click();
  await window.locator('.usl-confirm-btn--danger').click();
  await expect(window.locator('#eusExtractedList .eus-src-item')).toHaveCount(0);
  await expect(window.locator('#eusExtractedList .project-related__empty')).toHaveText('No stories extracted yet');
});

test('confirming deletion updates extracted count badge', async () => {
  const projectId = await getProjectId(window);
  const feature = await seedFeature(window, projectId, 'Delete Feature');
  await seedExtractedStory(window, projectId, feature.id, 'Story A');
  await seedExtractedStory(window, projectId, feature.id, 'Story B');
  await navigateToExtractStories(window);
  await window.locator('#eusExtractedList [data-action="delete"]').first().click();
  await window.locator('.usl-confirm-btn--danger').click();
  await expect(window.locator('#eusExtractedCount')).toHaveText('1');
});
