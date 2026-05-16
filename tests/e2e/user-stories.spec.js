'use strict';

// Functional tests for Project Home >> User Stories.
// Covers: header navigation, Add/Edit/Delete feature modal lifecycle,
// features panel collapse/expand, Add Story form, story card switching,
// story edit prefill and save, story deletion, and related panel toggle.
// Static labels, field visibility checks, and empty-state text omitted.

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
// Header navigation
// ----------------------------------------------------------------

test('clicking User Stories navigates away from project home', async () => {
  await window.locator('#navUserStories').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('back button navigates to project home', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('model config button navigates to settings', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnModelConfigs').click();
  await expect(window.locator('.project-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Add Feature modal — lifecycle
// ----------------------------------------------------------------

test('clicking Add Feature button opens the modal', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddFeature').click();
  await expect(window.locator('.fl-modal-overlay')).toBeVisible();
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
// Edit Feature modal
// ----------------------------------------------------------------

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
// Delete Feature
// ----------------------------------------------------------------

test('clicking the delete button shows a confirmation dialog', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Delete Feature');
  await navigateToUserStories(window);
  await window.locator('.fl-card__action--delete').click();
  await expect(window.locator('.fl-modal-overlay')).toBeVisible();
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
});

// ----------------------------------------------------------------
// Features panel — collapse / expand
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
// Add Story form
// ----------------------------------------------------------------

test('clicking Add story button with no feature selected does nothing', async () => {
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('#storyDetail .usl-add-form')).toHaveCount(0);
});

test('clicking Add story button after selecting a feature shows add form', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Story Feature');
  await navigateToUserStories(window);
  await window.locator('#btnAddStory').click();
  await expect(window.locator('#storyDetail .usl-add-form')).toBeVisible();
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
// Story card interaction
// ----------------------------------------------------------------

test('switching to a different feature loads its stories', async () => {
  const pid = await getProjectId(window);
  const featureA = await seedFeature(window, pid, 'Feature A');
  const featureB = await seedFeature(window, pid, 'Feature B');
  await seedStory(window, pid, featureA.id, 'Story for A');
  await seedStory(window, pid, featureB.id, 'Story for B');
  await navigateToUserStories(window);
  await window.locator('.fl-card').filter({ hasText: 'Feature B' }).click();
  await expect(window.locator('.usl-card__title')).toHaveText('Story for B');
});

test('clicking a second story card switches the active selection', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Story A');
  await seedStory(window, pid, feature.id, 'Story B');
  await navigateToUserStories(window);
  await window.locator('.usl-card').nth(1).click();
  await expect(window.locator('.usl-card').nth(1)).toHaveClass(/usl-card--active/);
  await expect(window.locator('.usl-card').nth(0)).not.toHaveClass(/usl-card--active/);
});

// ----------------------------------------------------------------
// Story detail — edit form
// ----------------------------------------------------------------

test('edit form title input is prefilled with the story title', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Prefilled Title');
  await navigateToUserStories(window);
  await expect(window.locator('#uslEditTitle')).toHaveValue('Prefilled Title');
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
// Story deletion
// ----------------------------------------------------------------

test('clicking the story delete button shows a confirmation dialog', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Story Feature');
  await seedStory(window, pid, feature.id, 'Delete Me');
  await navigateToUserStories(window);
  await window.locator('#storyDetailHeaderActions .usl-detail-hdr-btn--danger').click();
  await expect(window.locator('.usl-modal-overlay')).toBeVisible();
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
});

// ----------------------------------------------------------------
// Related panel
// ----------------------------------------------------------------

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
