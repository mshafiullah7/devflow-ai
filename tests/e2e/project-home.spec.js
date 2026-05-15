'use strict';

const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron');

let app, window, dbPath;

// Helper: land on the project-home page for a freshly created project
async function createAndOpenProject(window, name = 'E2E Test Project') {
  await window.locator('#btnNewProject').click();
  await window.locator('#inputName').fill(name);
  await window.locator('#btnCreate').click();
  await window.locator('.launcher__proj-row').waitFor();
  await window.locator('.launcher__proj-row').click();
  await window.locator('.project-home').waitFor({ timeout: 10000 });
}

test.beforeEach(async () => {
  ({ app, window, dbPath } = await launchApp());
  await createAndOpenProject(window);
});

test.afterEach(async () => {
  await closeApp(app, dbPath);
});

// ----------------------------------------------------------------
// Page structure
// ----------------------------------------------------------------
test('project home renders with correct project name in badge', async () => {
  await expect(window.locator('.project-home__badge-name')).toHaveText('E2E Test Project');
});

test('project home initial letter shows in badge', async () => {
  await expect(window.locator('.project-home__badge-initial')).toHaveText('E');
});

test('Dashboard content area shows correct title and project name', async () => {
  await expect(window.locator('.ph-content-title')).toHaveText('Dashboard');
  await expect(window.locator('.ph-content-sub')).toHaveText('E2E Test Project');
});

test('Dashboard nav item is active by default', async () => {
  await expect(window.locator('#navDashboard')).toHaveClass(/active/);
});

// ----------------------------------------------------------------
// Stats strip (fresh project → all zeros)
// ----------------------------------------------------------------
test('stats strip shows three stat boxes', async () => {
  await expect(window.locator('.ph-stat-box')).toHaveCount(3);
});

test('Open Stories stat is 0 on a fresh project', async () => {
  const box = window.locator('.ph-stat-box').first();
  await expect(box.locator('.ph-stat-box__value')).toHaveText('0');
  await expect(box.locator('.ph-stat-box__label')).toHaveText('Open Stories');
  await expect(box.locator('.ph-stat-box__total')).toHaveText('of 0 total');
});

test('Open Features stat is 0 on a fresh project', async () => {
  const box = window.locator('.ph-stat-box').nth(1);
  await expect(box.locator('.ph-stat-box__value')).toHaveText('0');
  await expect(box.locator('.ph-stat-box__label')).toHaveText('Open Features');
});

test('Open Issues stat is 0 on a fresh project', async () => {
  const box = window.locator('.ph-stat-box').nth(2);
  await expect(box.locator('.ph-stat-box__value')).toHaveText('0');
  await expect(box.locator('.ph-stat-box__label')).toHaveText('Open Issues');
});

// ----------------------------------------------------------------
// Quick links (all "Not set" on fresh project)
// ----------------------------------------------------------------
test('all four quick links are present', async () => {
  await expect(window.locator('.ph-qlink')).toHaveCount(4);
  await expect(window.locator('#phlOverview')).toBeVisible();
  await expect(window.locator('#phlStyleGuide')).toBeVisible();
  await expect(window.locator('#phlArchitecture')).toBeVisible();
  await expect(window.locator('#phlTechStack')).toBeVisible();
});

test('quick links show Not set badge on fresh project', async () => {
  const badges = window.locator('.ph-qlink__badge--unset');
  await expect(badges).toHaveCount(4);
});

// ----------------------------------------------------------------
// Metrics section (empty state)
// ----------------------------------------------------------------
test('burndown shows No hours tracked yet on fresh project', async () => {
  await expect(window.locator('.ph-bd-stat')).toHaveText('No hours tracked yet');
});

test('burndown fill is at 0% on fresh project', async () => {
  await expect(window.locator('.ph-bd-pct')).toHaveText('0%');
});

test('priority distribution donut shows 0 stories', async () => {
  await expect(window.locator('.ph-donut-num')).toHaveText('0');
});

test('stories by status shows No stories yet', async () => {
  await expect(window.locator('.ph-hrows--grid')).toContainText('No stories yet');
});

// ----------------------------------------------------------------
// Sidebar navigation
// ----------------------------------------------------------------
test('clicking User Stories navigates to user stories page', async () => {
  await window.locator('#navUserStories').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('clicking Documents navigates to documents page', async () => {
  await window.locator('#navDocuments').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('clicking Issues navigates to issues page', async () => {
  await window.locator('#navIssues').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('clicking Test Runner navigates to test runner page', async () => {
  await window.locator('#navTestRunner').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('clicking Settings navigates to settings page', async () => {
  await window.locator('#navSettings').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('clicking AI Chat navigates to AI console', async () => {
  await window.locator('#navAiConsole').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('clicking Prompt Queue navigates away', async () => {
  await window.locator('#navPromptQueue').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('clicking Mockups navigates to mockups page', async () => {
  await window.locator('#navMockups').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

test('clicking Git Changes navigates to git changes page', async () => {
  await window.locator('#navGitChanges').click();
  await expect(window.locator('.project-home')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Header controls
// ----------------------------------------------------------------
test('back button navigates back to launcher', async () => {
  await window.locator('#btnBack').click();
  await expect(window.locator('.launcher')).toBeVisible({ timeout: 8000 });
});

test('folder selector shows Select folder by default', async () => {
  await expect(window.locator('#headerFolderText')).toHaveText('Select folder');
});

test('Open VS Code button is disabled without a folder path', async () => {
  await expect(window.locator('#navOpenVSCode')).toBeDisabled();
});

test('git button is visible in the header', async () => {
  await expect(window.locator('#phBtnGit')).toBeVisible();
});
