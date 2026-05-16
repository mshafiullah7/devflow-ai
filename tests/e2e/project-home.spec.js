'use strict';

// Functional tests for Project Home dashboard.
// Covers: sidebar navigation clicks and header control actions.
// Static labels, stat values, and metric widgets omitted.

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

test.beforeEach(async () => {
  ({ app, window, dbPath } = await launchApp());
  await createAndOpenProject(window);
});

test.afterEach(async () => {
  await closeApp(app, dbPath);
});

// ----------------------------------------------------------------
// Header controls
// ----------------------------------------------------------------

test('back button navigates to the launcher', async () => {
  await window.locator('#btnBack').click();
  await expect(window.locator('.launcher')).toBeVisible({ timeout: 8000 });
});

test('Open VS Code button is disabled when no folder is set', async () => {
  await expect(window.locator('#navOpenVSCode')).toBeDisabled();
});

// ----------------------------------------------------------------
// Sidebar navigation — each item routes away from project home
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
