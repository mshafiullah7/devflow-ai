'use strict';

// Functional tests for Project Home >> Test Runner.
//
// Scope: button clicks and their outcomes, modal open/close/validate/save,
// history panel interactions, and feature→story cascade inside the modal.
//
// Out of scope: static structure labels, CSS classes, and anything that
// requires an actual test framework to be installed in a project folder
// (live Run / Stop cycle cannot be triggered in this isolated environment).

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

async function navigateToTestRunner(window) {
  await window.locator('#navTestRunner').click();
  await window.locator('.project-page').waitFor({ timeout: 10000 });
}

async function getProjectId(window) {
  const projects = await window.evaluate(() => window.db.projects.list());
  return projects[0]?.id;
}

// Seeds a test-run history entry and returns it.
async function seedRunHistory(window, projectId, {
  framework = 'Jest',
  command   = 'npm test',
  passed    = 10,
  failed    = 0,
  skipped   = 0,
  duration  = '4s',
  output    = 'Tests: 10 passed, 10 total',
  exitCode  = 0,
} = {}) {
  return window.evaluate(
    ([pid, data]) => window.db.testRunHistory.create({
      project_id: pid,
      framework:  data.framework,
      command:    data.command,
      passed:     data.passed,
      failed:     data.failed,
      skipped:    data.skipped,
      duration:   data.duration,
      output:     data.output,
      exit_code:  data.exitCode,
    }),
    [projectId, { framework, command, passed, failed, skipped, duration, output, exitCode }],
  );
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
      project_id: pid, feature_id: fid, title: t, is_extracted: 0,
    }),
    [projectId, featureId, title],
  );
}

// Opens the Log as Issue modal via the history panel's "Log Issue" button.
// Requires a failed run to have been seeded beforehand.
async function openLogIssueModalFromHistory(window) {
  await window.locator('#trLastRunIssueBtn').click();
  await window.locator('.tr-modal-overlay').waitFor({ timeout: 5000 });
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
// Navigation
// ----------------------------------------------------------------

test('back button navigates to project home', async () => {
  await navigateToTestRunner(window);
  await window.locator('#trBtnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('git button navigates to git-changes page', async () => {
  await navigateToTestRunner(window);
  await window.locator('#trBtnGit').click();
  await expect(window.locator('.project-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Run button — state without a folder
// ----------------------------------------------------------------

test('Run Tests button is disabled when no project folder is set', async () => {
  await navigateToTestRunner(window);
  await expect(window.locator('#trRunBtn')).toBeDisabled();
});

test('Stop button is hidden on initial page load', async () => {
  await navigateToTestRunner(window);
  await expect(window.locator('#trStopBtn')).toBeHidden();
});

test('empty output area shows prompt to select a project folder', async () => {
  await navigateToTestRunner(window);
  await expect(window.locator('#trOutputEmptyMsg')).toContainText('Select a project folder');
});

// ----------------------------------------------------------------
// History panel — empty state
// ----------------------------------------------------------------

test('history panel shows No runs yet when there is no history', async () => {
  await navigateToTestRunner(window);
  await expect(window.locator('#trLastRunSection')).toContainText('No runs yet');
});

test('previous runs section is hidden when there is no history', async () => {
  await navigateToTestRunner(window);
  await expect(window.locator('#trPrevRunsSection')).toBeHidden();
});

// ----------------------------------------------------------------
// History panel — with seeded data
// ----------------------------------------------------------------

test('seeded successful run appears in the Last Run section', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { framework: 'Jest', command: 'npm test', passed: 10, failed: 0, exitCode: 0 });
  await navigateToTestRunner(window);
  await expect(window.locator('#trLastRunSection .tr-hcard')).toBeVisible();
  await expect(window.locator('#trLastRunSection .tr-hcard__cmd')).toHaveText('npm test');
});

test('seeded successful run does not show a Log Issue button', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { passed: 10, failed: 0, exitCode: 0 });
  await navigateToTestRunner(window);
  await expect(window.locator('#trLastRunIssueBtn')).toHaveCount(0);
});

test('seeded failed run shows a Log Issue button in the Last Run section', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { passed: 5, failed: 2, exitCode: 1 });
  await navigateToTestRunner(window);
  await expect(window.locator('#trLastRunIssueBtn')).toBeVisible();
});

test('second seeded run moves the first to the Previous Runs section', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { command: 'npm test',        exitCode: 0 });
  await seedRunHistory(window, pid, { command: 'npm run test:e2e', exitCode: 0 });
  await navigateToTestRunner(window);
  await expect(window.locator('#trPrevRunsSection')).toBeVisible();
  await expect(window.locator('#trPrevRunsSection .tr-hcard')).toHaveCount(1);
});

test('last run section shows the output captured during the run', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { output: 'Tests: 8 passed, 8 total', exitCode: 0 });
  await navigateToTestRunner(window);
  await expect(window.locator('.tr-last-run-output__pre')).toContainText('Tests: 8 passed, 8 total');
});

// ----------------------------------------------------------------
// Log as Issue modal — open / close
// ----------------------------------------------------------------

test('clicking Log Issue from history opens the modal', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { framework: 'Jest', failed: 3, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await expect(window.locator('.tr-modal-overlay')).toBeVisible();
  await expect(window.locator('.tr-modal__title')).toHaveText('Log as Issue');
});

test('modal prefills title with the framework name from the history entry', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { framework: 'Playwright', failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await expect(window.locator('#trMTitle')).toHaveValue('Playwright test failure');
});

test('modal X button dismisses the modal', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await window.locator('#trModalClose').click();
  await expect(window.locator('.tr-modal-overlay')).toHaveCount(0);
});

test('modal Cancel button dismisses the modal', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await window.locator('#trModalCancel').click();
  await expect(window.locator('.tr-modal-overlay')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Log as Issue modal — validation
// ----------------------------------------------------------------

test('saving the modal with an empty title marks the title field as invalid', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await window.locator('#trMTitle').fill('');
  await window.locator('#trModalSave').click();
  await expect(window.locator('#trMTitle')).toHaveClass(/tr-modal__input--error/);
  await expect(window.locator('.tr-modal-overlay')).toBeVisible(); // modal stays open
});

// ----------------------------------------------------------------
// Log as Issue modal — feature → story cascade
// ----------------------------------------------------------------

test('User Story dropdown is disabled before a feature is selected', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await expect(window.locator('#trMStory')).toBeDisabled();
});

test('selecting a feature enables and populates the User Story dropdown', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Auth Feature');
  await seedStory(window, pid, feature.id, 'User can log in');
  await seedRunHistory(window, pid, { failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await window.locator('#trMFeature').selectOption({ label: 'Auth Feature' });
  await expect(window.locator('#trMStory')).not.toBeDisabled();
  await expect(window.locator('#trMStory option').filter({ hasText: 'User can log in' })).toHaveCount(1);
});

test('re-selecting the blank feature disables the User Story dropdown again', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Auth Feature');
  await seedStory(window, pid, feature.id, 'User can log in');
  await seedRunHistory(window, pid, { failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await window.locator('#trMFeature').selectOption({ label: 'Auth Feature' });
  await window.locator('#trMFeature').selectOption({ value: '' });
  await expect(window.locator('#trMStory')).toBeDisabled();
});

// ----------------------------------------------------------------
// Log as Issue modal — save creates the issue
// ----------------------------------------------------------------

test('saving the modal with a valid title closes the modal and creates an issue', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { framework: 'Jest', failed: 2, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await window.locator('#trMTitle').fill('Login tests failing');
  await window.locator('#trModalSave').click();
  await expect(window.locator('.tr-modal-overlay')).toHaveCount(0);

  // Verify the issue was actually written to the DB
  const issues = await window.evaluate(([pid]) => window.db.issues.list({ project_id: pid }), [pid]);
  expect(issues.length).toBe(1);
  expect(issues[0].title).toBe('Login tests failing');
});

test('saved issue inherits the severity selected in the modal', async () => {
  const pid = await getProjectId(window);
  await seedRunHistory(window, pid, { failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await window.locator('#trMSeverity').selectOption('critical');
  await window.locator('#trModalSave').click();
  await expect(window.locator('.tr-modal-overlay')).toHaveCount(0);
  const issues = await window.evaluate(([pid]) => window.db.issues.list({ project_id: pid }), [pid]);
  expect(issues[0].severity).toBe('critical');
});

test('saved issue is linked to the feature and story chosen in the modal', async () => {
  const pid = await getProjectId(window);
  const feature = await seedFeature(window, pid, 'Auth Feature');
  const story   = await seedStory(window, pid, feature.id, 'User can log in');
  await seedRunHistory(window, pid, { failed: 1, exitCode: 1 });
  await navigateToTestRunner(window);
  await openLogIssueModalFromHistory(window);
  await window.locator('#trMFeature').selectOption({ label: 'Auth Feature' });
  await window.locator('#trMStory').selectOption({ label: 'User can log in' });
  await window.locator('#trModalSave').click();
  const issues = await window.evaluate(([pid]) => window.db.issues.list({ project_id: pid }), [pid]);
  expect(issues[0].feature_id).toBe(feature.id);
  expect(issues[0].user_story_id).toBe(story.id);
});
