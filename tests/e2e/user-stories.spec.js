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

async function navigateToUserStories(window) {
  await window.locator('#navUserStories').click();
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
      project_id: pid,
      feature_id: fid,
      title: t,
      description: 'Test description',
      acceptance_criteria: 'Given/When/Then',
      is_extracted: 0,
    }),
    [projectId, featureId, title],
  );
}

async function seedIssue(window, projectId, storyId, title = 'Test Issue') {
  return window.evaluate(
    ([pid, sid, t]) => window.db.issues.create({
      project_id: pid,
      user_story_id: sid,
      title: t,
      status: 'open',
      severity: 'medium',
    }),
    [projectId, storyId, title],
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

test('User Stories nav item is visible on project home', async () => {
  await expect(window.locator('#navUserStories')).toBeVisible();
});

test('clicking User Stories navigates away from project home', async () => {
  await window.locator('#navUserStories').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('User Stories page renders the project-page container', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('.project-page')).toBeVisible();
});

test('User Stories page shows project name in title', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('.project-page__title')).toHaveText('E2E Test Project');
});

test('User Stories page shows User Stories in description', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('.project-page__desc')).toHaveText('User Stories');
});

// ----------------------------------------------------------------
// Header controls
// ----------------------------------------------------------------

test('back button is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#btnBack')).toBeVisible();
});

test('back button navigates to project home', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('folder selector shows Select folder by default', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#headerFolderText')).toHaveText('Select folder');
});

test('model picker is present in header', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#usModelPicker')).toBeVisible();
});

test('model config button is visible in header', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#btnModelConfigs')).toBeVisible();
});

test('model config button navigates to settings', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnModelConfigs').click();
  await expect(window.locator('.project-page')).toBeHidden({ timeout: 8000 });
});

test('export project button is visible in header', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#btnExportProject')).toBeVisible();
});

// ----------------------------------------------------------------
// Features panel — structure
// ----------------------------------------------------------------

test('Features panel is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#panelFeatures')).toBeVisible();
});

test('Features panel shows Features title', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#panelFeatures .project-panel__title')).toHaveText('Features');
});

test('Add feature button is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#btnAddFeature')).toBeVisible();
});

test('Import feature button is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#btnImportFeature')).toBeVisible();
});

test('Toggle features button is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#btnToggleFeatures')).toBeVisible();
});

// ----------------------------------------------------------------
// Features panel — empty state
// ----------------------------------------------------------------

test('features list shows No features yet on a fresh project', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#featureList .fl-empty')).toBeVisible();
  await expect(window.locator('#featureList .fl-empty')).toContainText('No features yet');
});

// ----------------------------------------------------------------
// Features panel — Add Feature modal
// ----------------------------------------------------------------

test('clicking Add Feature button opens the modal', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await expect(window.locator('.fl-modal-overlay')).toBeVisible();
});

test('Add Feature modal shows Add Feature title', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await expect(window.locator('.fl-modal__title')).toHaveText('Add Feature');
});

test('Add Feature modal has a Name field', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await expect(window.locator('#flModalName')).toBeVisible();
});

test('Add Feature modal has a Description field', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await expect(window.locator('#flModalDesc')).toBeVisible();
});

test('Add Feature modal has a Status dropdown', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await expect(window.locator('#flModalStatus')).toBeVisible();
});

test('Add Feature modal X button dismisses the modal', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await window.locator('.fl-modal__close').click();
  await expect(window.locator('.fl-modal-overlay')).toHaveCount(0);
});

test('Add Feature modal Cancel button dismisses the modal', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await window.locator('.fl-modal__btn--cancel').click();
  await expect(window.locator('.fl-modal-overlay')).toHaveCount(0);
});

test('submitting Add Feature without a name shows validation error', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await window.locator('.fl-modal__btn--save').click();
  await expect(window.locator('#flModalName')).toHaveClass(/fl-modal__input--error/);
  await expect(window.locator('.fl-modal-overlay')).toBeVisible();
});

test('adding a feature creates a card and dismisses modal', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await window.locator('#flModalName').fill('My New Feature');
  await window.locator('.fl-modal__btn--save').click();
  await expect(window.locator('.fl-modal-overlay')).toHaveCount(0);
  await expect(window.locator('#featureList .fl-card')).toHaveCount(1);
  await expect(window.locator('.fl-card__name')).toHaveText('My New Feature');
});

test('newly added feature is auto-selected', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await window.locator('#flModalName').fill('Auto Select Feature');
  await window.locator('.fl-modal__btn--save').click();
  await expect(window.locator('.fl-card--active')).toHaveCount(1);
});

// ----------------------------------------------------------------
// Features panel — with seeded data
// ----------------------------------------------------------------

test('feature card renders the feature name', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Seeded Feature');
  await navigateToUserStories(window);
  await expect(window.locator('.fl-card__name')).toHaveText('Seeded Feature');
});

test('feature card shows an ID badge', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'ID Feature');
  await navigateToUserStories(window);
  await expect(window.locator('.fl-card__id')).toBeVisible();
  await expect(window.locator('.fl-card__id')).toContainText('#');
});

test('feature card shows edit action button', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Action Feature');
  await navigateToUserStories(window);
  await expect(window.locator('.fl-card__action--edit')).toBeVisible();
});

test('feature card shows delete action button', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Action Feature');
  await navigateToUserStories(window);
  await expect(window.locator('.fl-card__action--delete')).toBeVisible();
});

test('feature card shows export action button', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Action Feature');
  await navigateToUserStories(window);
  await expect(window.locator('.fl-card__action--export')).toBeVisible();
});

test('first feature is auto-selected on load', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'First Feature');
  await navigateToUserStories(window);
  await expect(window.locator('.fl-card--active')).toHaveCount(1);
});

test('multiple feature cards are rendered when multiple features exist', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Feature A');
  await seedFeature(window, pid, 'Feature B');
  await navigateToUserStories(window);
  await expect(window.locator('.fl-card')).toHaveCount(2);
});

test('clicking a feature card marks it active', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Feature A');
  await seedFeature(window, pid, 'Feature B');
  await navigateToUserStories(window);
  await window.locator('.fl-card').nth(1).click();
  await expect(window.locator('.fl-card').nth(1)).toHaveClass(/fl-card--active/);
});

test('clicking a different feature deactivates the previous one', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Feature A');
  await seedFeature(window, pid, 'Feature B');
  await navigateToUserStories(window);
  await window.locator('.fl-card').nth(1).click();
  await expect(window.locator('.fl-card').nth(0)).not.toHaveClass(/fl-card--active/);
});

// ----------------------------------------------------------------
// Features panel — Edit Feature modal
// ----------------------------------------------------------------

test('clicking the edit button opens the Edit Feature modal', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Editable Feature');
  await navigateToUserStories(window);
  await window.locator('.fl-card__action--edit').click();
  await expect(window.locator('.fl-modal-overlay')).toBeVisible();
  await expect(window.locator('.fl-modal__title')).toHaveText('Edit Feature');
});

test('Edit Feature modal is prefilled with the feature name', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Editable Feature');
  await navigateToUserStories(window);
  await window.locator('.fl-card__action--edit').click();
  await expect(window.locator('#flModalName')).toHaveValue('Editable Feature');
});

test('Edit Feature modal Save Changes button updates the card name', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Old Name');
  await navigateToUserStories(window);
  await window.locator('.fl-card__action--edit').click();
  await window.locator('#flModalName').fill('New Name');
  await window.locator('.fl-modal__btn--save').click();
  await expect(window.locator('.fl-modal-overlay')).toHaveCount(0);
  await expect(window.locator('.fl-card__name')).toHaveText('New Name');
});

// ----------------------------------------------------------------
// Features panel — Delete Feature
// ----------------------------------------------------------------

test('clicking the delete button shows a confirmation dialog', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Delete Feature');
  await navigateToUserStories(window);
  await window.locator('.fl-card__action--delete').click();
  await expect(window.locator('.fl-modal-overlay')).toBeVisible();
  await expect(window.locator('.fl-modal__title')).toHaveText('Delete Feature?');
});

test('cancel button keeps the feature in the list', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Delete Feature');
  await navigateToUserStories(window);
  await window.locator('.fl-card__action--delete').click();
  await window.locator('.fl-modal__btn--cancel').click();
  await expect(window.locator('.fl-card')).toHaveCount(1);
});

test('confirming deletion removes the feature from the list', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Delete Feature');
  await navigateToUserStories(window);
  await window.locator('.fl-card__action--delete').click();
  await window.locator('.fl-modal__btn--danger').click();
  await expect(window.locator('.fl-card')).toHaveCount(0);
  await expect(window.locator('#featureList .fl-empty')).toBeVisible();
});

// ----------------------------------------------------------------
// Features panel — Collapse / expand toggle
// ----------------------------------------------------------------

test('clicking the toggle button collapses the features panel', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnToggleFeatures').click();
  await expect(window.locator('#panelFeatures')).toHaveClass(/project-panel--collapsed/);
});

test('clicking the toggle button again expands the features panel', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnToggleFeatures').click();
  await window.locator('#btnToggleFeatures').click();
  await expect(window.locator('#panelFeatures')).not.toHaveClass(/project-panel--collapsed/);
});

// ----------------------------------------------------------------
// User Stories panel — structure
// ----------------------------------------------------------------

test('User Stories panel is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#panelStories')).toBeVisible();
});

test('User Stories panel shows User Stories title', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#panelStories .project-panel__title')).toHaveText('User Stories');
});

test('Add story button is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#btnAddStory')).toBeVisible();
});

test('Import story button is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#btnImportStory')).toBeVisible();
});

// ----------------------------------------------------------------
// User Stories panel — empty state
// ----------------------------------------------------------------

test('story list shows Select a feature before any feature is selected', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#storyList .usl-empty')).toContainText('Select a feature');
});

test('story list shows No user stories yet when selected feature has none', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Empty Feature');
  await navigateToUserStories(window);
  // Feature is auto-selected, story list should show empty state for the feature
  await expect(window.locator('#storyList .usl-empty')).toContainText('No user stories yet');
});

// ----------------------------------------------------------------
// User Stories panel — Add Story (via UI)
// ----------------------------------------------------------------

test('clicking Add story button with no feature selected does nothing', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  // Detail panel should still show the initial empty state, not the add form
  await expect(window.locator('#storyDetail .usl-add-form')).toHaveCount(0);
});

test('clicking Add story button after selecting a feature shows add form', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('#storyDetail .usl-add-form')).toBeVisible();
});

test('Add story form shows Add User Story title', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('.usl-add-form__title')).toHaveText('Add User Story');
});

test('Add story form shows title input', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('#uslAddTitle')).toBeVisible();
});

test('Add story form shows description textarea', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('#uslAddDesc')).toBeVisible();
});

test('Add story form shows acceptance criteria textarea', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('#uslAddAC')).toBeVisible();
});

test('Add story form shows status dropdown', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('#uslAddStatus')).toBeVisible();
});

test('Add story form shows priority dropdown', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('#uslAddPriority')).toBeVisible();
});

test('Add story form shows Add User Story save button', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('.usl-add-form__btn--save')).toHaveText('Add User Story');
});

test('submitting the add form without a title shows a validation error', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await window.locator('.usl-add-form__btn--save').click();
  await expect(window.locator('#uslAddTitle')).toHaveClass(/usl-add-form__input--error/);
});

test('saving a new story adds a card to the story list', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await window.locator('#uslAddTitle').fill('New User Story');
  await window.locator('.usl-add-form__btn--save').click();
  await expect(window.locator('#storyList .usl-card')).toHaveCount(1);
  await expect(window.locator('.usl-card__title')).toHaveText('New User Story');
});

// ----------------------------------------------------------------
// User Stories panel — with seeded stories
// ----------------------------------------------------------------

test('story card renders the story title', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'User can log in');
  await navigateToUserStories(window);
  await expect(window.locator('.usl-card__title')).toHaveText('User can log in');
});

test('story card shows an ID badge', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Story with ID');
  await navigateToUserStories(window);
  await expect(window.locator('.usl-card__id')).toContainText('#');
});

test('first story is auto-selected when a feature is loaded', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Auto Story');
  await navigateToUserStories(window);
  await expect(window.locator('.usl-card--active')).toHaveCount(1);
});

test('multiple story cards are rendered when multiple stories exist', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Story A');
  await seedStory(window, pid, feature.id, 'Story B');
  await navigateToUserStories(window);
  await expect(window.locator('.usl-card')).toHaveCount(2);
});

test('clicking a story card marks it active', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Story A');
  await seedStory(window, pid, feature.id, 'Story B');
  await navigateToUserStories(window);
  await window.locator('.usl-card').nth(1).click();
  await expect(window.locator('.usl-card').nth(1)).toHaveClass(/usl-card--active/);
});

test('clicking a different story deactivates the previous one', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Story A');
  await seedStory(window, pid, feature.id, 'Story B');
  await navigateToUserStories(window);
  await window.locator('.usl-card').nth(1).click();
  await expect(window.locator('.usl-card').nth(0)).not.toHaveClass(/usl-card--active/);
});

test('switching to a different feature loads its stories', async () => {
  const pid = await getProjectId(window);
  const featureA = await seedFeature(window, pid, 'Feature A');
  const featureB = await seedFeature(window, pid, 'Feature B');
  await seedStory(window, pid, featureA.id, 'Story for A');
  await seedStory(window, pid, featureB.id, 'Story for B');
  await navigateToUserStories(window);
  // Feature A is auto-selected; click Feature B
  await window.locator('.fl-card').filter({ hasText: 'Feature B' }).click();
  await expect(window.locator('.usl-card__title')).toHaveText('Story for B');
});

// ----------------------------------------------------------------
// Story detail panel — initial state
// ----------------------------------------------------------------

test('story detail panel shows Select a user story initially', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#storyDetail')).toContainText('Select a user story');
});

test('story detail panel shows select message even after feature selected with no stories', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Empty Feature');
  await navigateToUserStories(window);
  await expect(window.locator('#storyDetail')).toContainText('Select a user story');
});

// ----------------------------------------------------------------
// Story detail panel — edit form
// ----------------------------------------------------------------

test('clicking a story card opens the edit form in detail panel', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Clickable Story');
  await navigateToUserStories(window);
  // First story is auto-selected so edit form already shown
  await expect(window.locator('#storyDetail .usl-add-form')).toBeVisible();
});

test('edit form shows User Story title heading', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Edit Story');
  await navigateToUserStories(window);
  await expect(window.locator('.usl-add-form__title')).toHaveText('User Story');
});

test('edit form title input is prefilled with the story title', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Prefilled Title');
  await navigateToUserStories(window);
  await expect(window.locator('#uslEditTitle')).toHaveValue('Prefilled Title');
});

test('edit form shows description textarea', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Edit Story');
  await navigateToUserStories(window);
  await expect(window.locator('#uslEditDesc')).toBeVisible();
});

test('edit form description textarea is prefilled', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Edit Story');
  await navigateToUserStories(window);
  await expect(window.locator('#uslEditDesc')).toHaveValue('Test description');
});

test('edit form shows acceptance criteria textarea', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Edit Story');
  await navigateToUserStories(window);
  await expect(window.locator('#uslEditAC')).toBeVisible();
});

test('edit form shows status select', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Edit Story');
  await navigateToUserStories(window);
  await expect(window.locator('#uslEditStatus')).toBeVisible();
});

test('edit form shows priority select', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Edit Story');
  await navigateToUserStories(window);
  await expect(window.locator('#uslEditPriority')).toBeVisible();
});

test('edit form shows Save Changes button in header actions', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Save Story');
  await navigateToUserStories(window);
  await expect(window.locator('#storyDetailHeaderActions .usl-add-form__btn--save')).toHaveText('Save Changes');
});

test('edit form shows delete button in header actions', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Delete Story');
  await navigateToUserStories(window);
  await expect(window.locator('#storyDetailHeaderActions .usl-detail-hdr-btn--danger')).toBeVisible();
});

test('saving the edit form updates the story card title', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Old Title');
  await navigateToUserStories(window);
  await window.locator('#uslEditTitle').fill('Updated Title');
  await window.locator('#storyDetailHeaderActions .usl-add-form__btn--save').click();
  await expect(window.locator('.usl-card__title')).toHaveText('Updated Title');
});

// ----------------------------------------------------------------
// Story deletion (from detail header)
// ----------------------------------------------------------------

test('clicking the story delete button shows a confirmation dialog', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Delete Me');
  await navigateToUserStories(window);
  await window.locator('#storyDetailHeaderActions .usl-detail-hdr-btn--danger').click();
  await expect(window.locator('.usl-modal-overlay')).toBeVisible();
  await expect(window.locator('.usl-modal__title')).toHaveText('Delete Story?');
});

test('cancelling story deletion keeps the story in the list', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Keep Me');
  await navigateToUserStories(window);
  await window.locator('#storyDetailHeaderActions .usl-detail-hdr-btn--danger').click();
  await window.locator('.usl-modal__btn--cancel').click();
  await expect(window.locator('.usl-card')).toHaveCount(1);
});

test('confirming story deletion removes the story from the list', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Delete Me');
  await navigateToUserStories(window);
  await window.locator('#storyDetailHeaderActions .usl-detail-hdr-btn--danger').click();
  await window.locator('.usl-modal__btn--danger').click();
  await expect(window.locator('.usl-card')).toHaveCount(0);
  await expect(window.locator('#storyList .usl-empty')).toContainText('No user stories yet');
});

// ----------------------------------------------------------------
// Related panel
// ----------------------------------------------------------------

test('related panel is visible', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#projectRelated')).toBeVisible();
});

test('related panel starts collapsed', async () => {
  await navigateToUserStories(window);
  await expect(window.locator('#projectRelated')).toHaveClass(/project-related--collapsed/);
});

test('clicking the toggle button expands the related panel', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnRelatedToggle').click();
  await expect(window.locator('#projectRelated')).not.toHaveClass(/project-related--collapsed/);
});

test('clicking the toggle button again collapses the related panel', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnRelatedToggle').click();
  await window.locator('#btnRelatedToggle').click();
  await expect(window.locator('#projectRelated')).toHaveClass(/project-related--collapsed/);
});

test('expanded related panel shows the Issues section', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnRelatedToggle').click();
  await expect(window.locator('#relatedIssuesSection')).toBeVisible();
});

test('issues section shows Select a story before any story is selected', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnRelatedToggle').click();
  await expect(window.locator('#relatedIssuesList')).toContainText('Select a story');
});

test('issues section shows No issues for this story when selected story has none', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Issue-free Story');
  await navigateToUserStories(window);
  await window.locator('#btnRelatedToggle').click();
  // First story is auto-selected
  await expect(window.locator('#relatedIssuesList')).toContainText('No issues for this story');
});

test('issues count badge is hidden when selected story has no issues', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'No Issue Story');
  await navigateToUserStories(window);
  await window.locator('#btnRelatedToggle').click();
  await expect(window.locator('#relatedIssuesCount')).toBeHidden();
});

test('issues section renders issue cards when issues exist for the selected story', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  const story = await seedStory(window, pid, feature.id, 'Story with Issue');
  await seedIssue(window, pid, story.id, 'Bug in login');
  await navigateToUserStories(window);
  await window.locator('#btnRelatedToggle').click();
  await expect(window.locator('#relatedIssuesList .related-item')).toHaveCount(1);
  await expect(window.locator('.related-item__title')).toHaveText('Bug in login');
});

test('issues count badge shows the correct count when issues exist', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  const story = await seedStory(window, pid, feature.id, 'Story with Issues');
  await seedIssue(window, pid, story.id, 'Issue A');
  await seedIssue(window, pid, story.id, 'Issue B');
  await navigateToUserStories(window);
  await window.locator('#btnRelatedToggle').click();
  await expect(window.locator('#relatedIssuesCount')).toBeVisible();
  await expect(window.locator('#relatedIssuesCount')).toHaveText('2');
});
