'use strict';

// Functional tests for Project Home >> AI Chat (AI Console).
// Covers: header navigation, page initialisation after data load, context slice
// checkboxes, Build Context button, context preview expand/collapse, token count,
// template picker open/select/close, send validation, Enter/Shift+Enter behaviour,
// and Clear conversation.
// Actual AI streaming (requires a configured model) is excluded.

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

async function navigateToAiConsole(window) {
  await window.locator('#navAiConsole').click();
  await window.locator('.aic-page').waitFor({ timeout: 10000 });
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

async function seedIssue(window, projectId, title = 'Test Issue', status = 'open', severity = 'medium') {
  return window.evaluate(
    ([pid, t, s, sv]) => window.db.issues.create({ project_id: pid, title: t, status: s, severity: sv }),
    [projectId, title, status, severity],
  );
}

// Wait for the data-load welcome message to appear in the thread.
async function waitForDataLoad(window) {
  await expect(window.locator('#aicThread')).toContainText('Ready to help', { timeout: 8000 });
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

test('navAiConsole click navigates to the AI chat page', async () => {
  await window.locator('#navAiConsole').click();
  await expect(window.locator('.aic-page')).toBeVisible({ timeout: 10000 });
});

test('back button navigates to project home', async () => {
  await navigateToAiConsole(window);
  await window.locator('#aicBtnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('model config button navigates away from the AI chat page', async () => {
  await navigateToAiConsole(window);
  await window.locator('#aicBtnModelConfigs').click();
  await expect(window.locator('.aic-page')).toBeHidden({ timeout: 8000 });
});

test('git button navigates away from the AI chat page', async () => {
  await navigateToAiConsole(window);
  await window.locator('#aicBtnGit').click();
  await expect(window.locator('.aic-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Page initialisation — UI enabled after data load
// ----------------------------------------------------------------

test('welcome message appears in the thread after data loads', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicThread')).toContainText('Ready to help');
});

test('input textarea is enabled after data loads', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicInput')).not.toBeDisabled();
});

test('send button is enabled after data loads', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicBtnSend')).not.toBeDisabled();
});

test('Clear button is enabled after data loads', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicBtnClear')).not.toBeDisabled();
});

test('Build Context button is enabled after data loads', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicBtnBuildCtx')).not.toBeDisabled();
});

test('context slice checkboxes are enabled after data loads', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('.aic-slice__check[data-slice="features"]')).not.toBeDisabled();
  await expect(window.locator('.aic-slice__check[data-slice="stories"]')).not.toBeDisabled();
  await expect(window.locator('.aic-slice__check[data-slice="issues"]')).not.toBeDisabled();
});

// ----------------------------------------------------------------
// Context counts
// ----------------------------------------------------------------

test('features count shows 0 features when none are seeded', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicCtxFeatures')).toHaveText('0 features');
});

test('features count shows singular form after seeding one feature', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Auth Feature');
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicCtxFeatures')).toHaveText('1 feature');
});

test('issues count shows open issues only', async () => {
  const pid = await getProjectId(window);
  await seedIssue(window, pid, 'Open Issue',     'open');
  await seedIssue(window, pid, 'Resolved Issue', 'resolved');
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicCtxIssues')).toHaveText('1 open');
});

// ----------------------------------------------------------------
// Documents section
// ----------------------------------------------------------------

test('documents section shows "No documents" when none are seeded', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await expect(window.locator('#aicDocsSlices')).toContainText('No documents');
});

// ----------------------------------------------------------------
// Context slice checkboxes
// ----------------------------------------------------------------

test('features checkbox can be checked and stays checked', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('.aic-slice__check[data-slice="features"]').check();
  await expect(window.locator('.aic-slice__check[data-slice="features"]')).toBeChecked();
});

test('multiple context checkboxes can be checked independently', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('.aic-slice__check[data-slice="features"]').check();
  await window.locator('.aic-slice__check[data-slice="issues"]').check();
  await expect(window.locator('.aic-slice__check[data-slice="features"]')).toBeChecked();
  await expect(window.locator('.aic-slice__check[data-slice="stories"]')).not.toBeChecked();
  await expect(window.locator('.aic-slice__check[data-slice="issues"]')).toBeChecked();
});

// ----------------------------------------------------------------
// Build Context button
// ----------------------------------------------------------------

test('Build Context with no slices checked keeps context preview wrapper hidden', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicBtnBuildCtx').click();
  await expect(window.locator('#aicCtxPreviewWrap')).toBeHidden();
});

test('Build Context button flashes "Context ready" immediately after clicking', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicBtnBuildCtx').click();
  await expect(window.locator('#aicBtnBuildCtx')).toContainText('Context ready');
});

test('Build Context with features slice checked shows the context preview wrapper', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Login Feature');
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('.aic-slice__check[data-slice="features"]').check();
  await window.locator('#aicBtnBuildCtx').click();
  await expect(window.locator('#aicCtxPreviewWrap')).toBeVisible();
});

test('token count updates from zero after building context with a slice', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Payment Feature');
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('.aic-slice__check[data-slice="features"]').check();
  await window.locator('#aicBtnBuildCtx').click();
  await expect(window.locator('#aicTokenCount')).toContainText('tokens in context');
});

test('token count stays at zero when Build Context produces no output', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicBtnBuildCtx').click();
  await expect(window.locator('#aicTokenCount')).toHaveText('~0 tokens estimated');
});

// ----------------------------------------------------------------
// Context preview expand / collapse
// ----------------------------------------------------------------

test('clicking the context preview header expands the preview pre', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Preview Feature');
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('.aic-slice__check[data-slice="features"]').check();
  await window.locator('#aicBtnBuildCtx').click();
  await window.locator('#aicCtxPreviewToggle').click();
  await expect(window.locator('#aicCtxPreview')).toBeVisible();
});

test('clicking the context preview header again collapses the preview pre', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Preview Feature');
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('.aic-slice__check[data-slice="features"]').check();
  await window.locator('#aicBtnBuildCtx').click();
  await window.locator('#aicCtxPreviewToggle').click();
  await window.locator('#aicCtxPreviewToggle').click();
  await expect(window.locator('#aicCtxPreview')).toBeHidden();
});

// ----------------------------------------------------------------
// Template picker
// ----------------------------------------------------------------

test('clicking Templates… trigger opens the template menu', async () => {
  await navigateToAiConsole(window);
  await window.locator('#aicTplPicker .mp-trigger').click();
  await expect(window.locator('#aicTplPicker .mp-menu')).toBeVisible();
});

test('selecting a template fills the empty textarea with the template prompt', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicTplPicker .mp-trigger').click();
  await window.locator('#aicTplPicker [data-tpl-id="refine-stories"]').click();
  await expect(window.locator('#aicInput')).not.toHaveValue('');
});

test('selecting Custom prompt… does not fill the textarea', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicTplPicker .mp-trigger').click();
  await window.locator('#aicTplPicker [data-tpl-id="custom"]').click();
  await expect(window.locator('#aicInput')).toHaveValue('');
});

test('the template menu closes after a template is selected', async () => {
  await navigateToAiConsole(window);
  await window.locator('#aicTplPicker .mp-trigger').click();
  await window.locator('#aicTplPicker [data-tpl-id="triage-issues"]').click();
  await expect(window.locator('#aicTplPicker .mp-menu')).toHaveCount(0);
});

test('selecting a template does not overwrite existing textarea content', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicInput').fill('My own prompt text');
  await window.locator('#aicTplPicker .mp-trigger').click();
  await window.locator('#aicTplPicker [data-tpl-id="refine-stories"]').click();
  await expect(window.locator('#aicInput')).toHaveValue('My own prompt text');
});

test('clicking outside the template menu closes it', async () => {
  await navigateToAiConsole(window);
  await window.locator('#aicTplPicker .mp-trigger').click();
  await expect(window.locator('#aicTplPicker .mp-menu')).toBeVisible();
  await window.locator('#aicThread').click();
  await expect(window.locator('#aicTplPicker .mp-menu')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Send validation
// ----------------------------------------------------------------

test('clicking Send with an empty textarea does nothing', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicBtnSend').click();
  await expect(window.locator('#aicThread .aic-error-msg')).toHaveCount(0);
});

test('clicking Send with text but no model shows a model-missing error', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicInput').fill('Tell me about this project');
  await window.locator('#aicBtnSend').click();
  await expect(window.locator('#aicThread .aic-error-msg')).toBeVisible();
  await expect(window.locator('#aicThread .aic-error-msg')).toContainText('select a model');
});

// ----------------------------------------------------------------
// Enter / Shift+Enter behaviour
// ----------------------------------------------------------------

test('pressing Enter in the textarea with text triggers send (shows model error)', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicInput').fill('Hello');
  await window.locator('#aicInput').press('Enter');
  await expect(window.locator('#aicThread .aic-error-msg')).toBeVisible();
});

test('pressing Shift+Enter in the textarea does not trigger send', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('#aicInput').fill('Hello');
  await window.locator('#aicInput').press('Shift+Enter');
  await expect(window.locator('#aicThread .aic-error-msg')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Clear conversation
// ----------------------------------------------------------------

test('Clear resets the thread to the welcome message', async () => {
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  // Trigger error message so thread has more than just the welcome text
  await window.locator('#aicInput').fill('Some question');
  await window.locator('#aicBtnSend').click();
  await expect(window.locator('#aicThread .aic-error-msg')).toBeVisible();
  // Now clear
  await window.locator('#aicBtnClear').click();
  await expect(window.locator('#aicThread .aic-error-msg')).toHaveCount(0);
  await expect(window.locator('#aicThread')).toContainText('Ready to help');
});

test('Clear resets the token count back to zero', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Clear Test Feature');
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('.aic-slice__check[data-slice="features"]').check();
  await window.locator('#aicBtnBuildCtx').click();
  await expect(window.locator('#aicTokenCount')).toContainText('tokens in context');
  await window.locator('#aicBtnClear').click();
  await expect(window.locator('#aicTokenCount')).toHaveText('~0 tokens estimated');
});

test('Clear hides the context preview wrapper', async () => {
  const pid = await getProjectId(window);
  await seedFeature(window, pid, 'Clear Preview Feature');
  await navigateToAiConsole(window);
  await waitForDataLoad(window);
  await window.locator('.aic-slice__check[data-slice="features"]').check();
  await window.locator('#aicBtnBuildCtx').click();
  await expect(window.locator('#aicCtxPreviewWrap')).toBeVisible();
  await window.locator('#aicBtnClear').click();
  await expect(window.locator('#aicCtxPreviewWrap')).toBeHidden();
});
