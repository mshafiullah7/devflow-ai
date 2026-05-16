'use strict';

// Functional tests for Project Home >> Prompt Queue.
// Covers: header navigation, item list rendering, item selection, skip action,
// delete action, Clear Done toolbar action, summary counts, and detail panel
// content for pending and skipped items.
// Actual AI execution (Run This / Run All with a live model) is excluded.

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

async function navigateToPromptQueue(window) {
  await window.locator('#navPromptQueue').click();
  await window.locator('.pq-page').waitFor({ timeout: 10000 });
}

async function getProjectId(window) {
  const projects = await window.evaluate(() => window.db.projects.list());
  return projects[0]?.id;
}

async function seedQueueItem(window, projectId, promptText = 'Test prompt text', tag = '') {
  return window.evaluate(
    ([pid, pt, t]) => window.db.promptQueue.add({
      project_id: pid,
      prompt_text: pt,
      ...(t ? { tag: t } : {}),
    }),
    [projectId, promptText, tag],
  );
}

async function seedQueueItemWithStatus(window, projectId, promptText, status, tag = '') {
  const item = await seedQueueItem(window, projectId, promptText, tag);
  await window.evaluate(
    ([id, s]) => window.db.promptQueue.update({ id, status: s }),
    [item.id, status],
  );
  return item;
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

test('navPromptQueue click navigates to the prompt queue page', async () => {
  await window.locator('#navPromptQueue').click();
  await expect(window.locator('.pq-page')).toBeVisible({ timeout: 10000 });
});

test('back button navigates to project home', async () => {
  await navigateToPromptQueue(window);
  await window.locator('#pqBtnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('model config button navigates away from the prompt queue page', async () => {
  await navigateToPromptQueue(window);
  await window.locator('#pqBtnModelConfigs').click();
  await expect(window.locator('.pq-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Empty state
// ----------------------------------------------------------------

test('empty queue shows the no-prompts-queued message', async () => {
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqListPanel .pq-list-empty')).toBeVisible();
});

test('detail panel shows placeholder text when queue is empty', async () => {
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqDetailPanel .pq-detail-empty')).toBeVisible();
});

// ----------------------------------------------------------------
// Item list rendering
// ----------------------------------------------------------------

test('seeded pending item appears in the list', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Hello world prompt');
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqListPanel .pq-item')).toHaveCount(1);
});

test('item tag is shown as the list label', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Some prompt text', 'Auth Feature');
  await navigateToPromptQueue(window);
  await expect(window.locator('.pq-item__label')).toHaveText('Auth Feature');
});

test('item prompt first line is shown as the snippet', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'First line of prompt\nSecond line');
  await navigateToPromptQueue(window);
  await expect(window.locator('.pq-item__snippet')).toHaveText('First line of prompt');
});

test('multiple seeded items all appear in the list', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Prompt A');
  await seedQueueItem(window, pid, 'Prompt B');
  await seedQueueItem(window, pid, 'Prompt C');
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqListPanel .pq-item')).toHaveCount(3);
});

// ----------------------------------------------------------------
// Item selection
// ----------------------------------------------------------------

test('first item is auto-selected when the page loads with items', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Auto-selected prompt');
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqListPanel .pq-item--selected')).toHaveCount(1);
});

test('clicking a second item selects it and deselects the first', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'First prompt');
  await seedQueueItem(window, pid, 'Second prompt');
  await navigateToPromptQueue(window);
  await window.locator('#pqListPanel .pq-item').nth(1).click();
  await expect(window.locator('#pqListPanel .pq-item--selected')).toHaveCount(1);
  await expect(window.locator('#pqListPanel .pq-item--selected .pq-item__snippet')).toHaveText('Second prompt');
});

// ----------------------------------------------------------------
// Detail panel — pending item
// ----------------------------------------------------------------

test('selecting a pending item shows the detail panel', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Detail prompt');
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqDetailPanel .pq-detail')).toBeVisible();
});

test('pending item detail panel shows Run This button', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Runnable prompt');
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqBtnRunThis')).toBeVisible();
});

test('pending item detail panel shows pending status badge', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Status badge check');
  await navigateToPromptQueue(window);
  await expect(window.locator('.pq-detail__status--pending')).toBeVisible();
});

// ----------------------------------------------------------------
// Summary bar
// ----------------------------------------------------------------

test('summary shows correct pending count after seeding items', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Pending A');
  await seedQueueItem(window, pid, 'Pending B');
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqSummary')).toContainText('2 pending');
});

test('summary shows done count when done items are seeded', async () => {
  const pid = await getProjectId(window);
  await seedQueueItemWithStatus(window, pid, 'Done prompt', 'done');
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqSummary')).toContainText('1 done');
});

test('summary shows failed count when failed items exist', async () => {
  const pid = await getProjectId(window);
  await seedQueueItemWithStatus(window, pid, 'Failed prompt', 'failed');
  await navigateToPromptQueue(window);
  await expect(window.locator('#pqSummary')).toContainText('1 failed');
});

// ----------------------------------------------------------------
// Skip action
// ----------------------------------------------------------------

test('skip button changes the item status to skipped', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Skip me');
  await navigateToPromptQueue(window);
  await window.locator('.pq-item__skip').click();
  await expect(window.locator('#pqListPanel .pq-item--skipped')).toHaveCount(1);
});

test('skipping an item removes its skip button', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Skip me');
  await navigateToPromptQueue(window);
  await window.locator('.pq-item__skip').click();
  await expect(window.locator('.pq-item__skip')).toHaveCount(0);
});

test('skipping an item updates the summary pending count', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Will be skipped');
  await navigateToPromptQueue(window);
  await window.locator('.pq-item__skip').click();
  await expect(window.locator('#pqSummary')).toContainText('0 pending');
});

test('skipped item detail does not show Run This button', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Skip to check detail');
  await navigateToPromptQueue(window);
  await window.locator('.pq-item__skip').click();
  await window.locator('#pqListPanel .pq-item').click();
  await expect(window.locator('#pqBtnRunThis')).toHaveCount(0);
});

test('skipped item detail shows skipped status badge', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Skip badge check');
  await navigateToPromptQueue(window);
  await window.locator('.pq-item__skip').click();
  await window.locator('#pqListPanel .pq-item').click();
  await expect(window.locator('.pq-detail__status--skipped')).toBeVisible();
});

// ----------------------------------------------------------------
// Delete action
// ----------------------------------------------------------------

test('delete button removes the item from the list', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Delete me');
  await navigateToPromptQueue(window);
  await window.locator('.pq-item__delete').click();
  await expect(window.locator('#pqListPanel .pq-item')).toHaveCount(0);
});

test('deleting the last item shows the empty state', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Last item');
  await navigateToPromptQueue(window);
  await window.locator('.pq-item__delete').click();
  await expect(window.locator('#pqListPanel .pq-list-empty')).toBeVisible();
});

test('deleting the selected item clears the detail panel', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Selected, then deleted');
  await navigateToPromptQueue(window);
  await window.locator('.pq-item__delete').click();
  await expect(window.locator('#pqDetailPanel .pq-detail-empty')).toBeVisible();
});

test('deleting one item from two keeps the remaining item', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Keep me', 'Keeper');
  await seedQueueItem(window, pid, 'Delete me', 'Deleter');
  await navigateToPromptQueue(window);
  await window.locator('#pqListPanel .pq-item').nth(1).locator('.pq-item__delete').click();
  await expect(window.locator('#pqListPanel .pq-item')).toHaveCount(1);
  await expect(window.locator('.pq-item__label')).toHaveText('Keeper');
});

// ----------------------------------------------------------------
// Clear Done toolbar action
// ----------------------------------------------------------------

test('Clear Done removes a done item from the list', async () => {
  const pid = await getProjectId(window);
  await seedQueueItemWithStatus(window, pid, 'Finished prompt', 'done');
  await navigateToPromptQueue(window);
  await window.locator('#pqBtnClearDone').click();
  await expect(window.locator('#pqListPanel .pq-item')).toHaveCount(0);
});

test('Clear Done removes failed items from the list', async () => {
  const pid = await getProjectId(window);
  await seedQueueItemWithStatus(window, pid, 'Failed prompt', 'failed');
  await navigateToPromptQueue(window);
  await window.locator('#pqBtnClearDone').click();
  await expect(window.locator('#pqListPanel .pq-item')).toHaveCount(0);
});

test('Clear Done removes skipped items from the list', async () => {
  const pid = await getProjectId(window);
  await seedQueueItemWithStatus(window, pid, 'Skipped prompt', 'skipped');
  await navigateToPromptQueue(window);
  await window.locator('#pqBtnClearDone').click();
  await expect(window.locator('#pqListPanel .pq-item')).toHaveCount(0);
});

test('Clear Done keeps pending items in the list', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Still pending A');
  await seedQueueItem(window, pid, 'Still pending B');
  await seedQueueItemWithStatus(window, pid, 'Done item', 'done');
  await navigateToPromptQueue(window);
  await window.locator('#pqBtnClearDone').click();
  await expect(window.locator('#pqListPanel .pq-item')).toHaveCount(2);
});

test('Clear Done clears the detail panel when the selected item is removed', async () => {
  const pid = await getProjectId(window);
  await seedQueueItemWithStatus(window, pid, 'Done and selected', 'done');
  await navigateToPromptQueue(window);
  await window.locator('#pqListPanel .pq-item').click();
  await window.locator('#pqBtnClearDone').click();
  await expect(window.locator('#pqDetailPanel .pq-detail-empty')).toBeVisible();
});

test('Clear Done updates the summary to show zero done', async () => {
  const pid = await getProjectId(window);
  await seedQueueItem(window, pid, 'Pending survivor');
  await seedQueueItemWithStatus(window, pid, 'Done removed', 'done');
  await navigateToPromptQueue(window);
  await window.locator('#pqBtnClearDone').click();
  await expect(window.locator('#pqSummary')).toContainText('0 done');
  await expect(window.locator('#pqSummary')).toContainText('1 pending');
});

// ----------------------------------------------------------------
// Run All — no pending items (no-op guard)
// ----------------------------------------------------------------

test('Run All with no pending items leaves the toolbar unchanged', async () => {
  const pid = await getProjectId(window);
  await seedQueueItemWithStatus(window, pid, 'Already done', 'done');
  await navigateToPromptQueue(window);
  await window.locator('#pqBtnRunAll').click();
  await expect(window.locator('#pqBtnRunAll')).toBeVisible();
  await expect(window.locator('#pqBtnStop')).toBeHidden();
});
