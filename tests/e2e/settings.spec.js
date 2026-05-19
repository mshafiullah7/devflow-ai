'use strict';

// Functional tests for Settings page.
// Covers: sidebar navigation and active-state switching, AI Config section
// (empty state, Add Model modal full lifecycle, type-toggle, validation,
// edit card, delete, set-default), Model Mapping selects, Telegram save,
// Cloud Sync provider switching and save, and Backup path save.

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

// Reach Settings via the Issues page model-config button.
async function navigateToSettings(window) {
  await window.locator('#navIssues').click();
  await window.locator('.project-page').waitFor({ timeout: 10000 });
  await window.locator('#isBtnModelConfigs').click();
  await window.locator('.settings-page').waitFor({ timeout: 10000 });
}

async function seedModelConfig(window, label = 'Test CLI', type = 'cli') {
  return window.evaluate(
    ([l, t]) => window.db.modelConfigs.create({
      label: l, type: t, executable: 'claude', is_default: 0, input_mode: 'pipe',
    }),
    [label, type],
  );
}

async function clearModelConfigs(window) {
  await window.evaluate(async () => {
    const items = await window.db.modelConfigs.list();
    if (Array.isArray(items)) {
      for (const item of items) await window.db.modelConfigs.delete(item.id);
    }
  });
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
// Page navigation
// ----------------------------------------------------------------

test('settings page renders when navigated to', async () => {
  await navigateToSettings(window);
  await expect(window.locator('.settings-page')).toBeVisible();
});

test('back button navigates away from the settings page', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnBack').click();
  await expect(window.locator('.settings-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Sidebar navigation — active state and content switching
// ----------------------------------------------------------------

test('AI Config nav item is active by default', async () => {
  await navigateToSettings(window);
  await expect(window.locator('#stNavAiConfig')).toHaveClass(/active/);
});

test('clicking Model Mapping activates that nav item', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavModelMapping').click();
  await expect(window.locator('#stNavModelMapping')).toHaveClass(/active/);
  await expect(window.locator('#stNavAiConfig')).not.toHaveClass(/active/);
});

test('clicking Telegram activates that nav item', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavTelegram').click();
  await expect(window.locator('#stNavTelegram')).toHaveClass(/active/);
});

test('clicking Cloud Sync activates that nav item', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavCloudSync').click();
  await expect(window.locator('#stNavCloudSync')).toHaveClass(/active/);
});

test('clicking Backup activates that nav item', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavBackupConfig').click();
  await expect(window.locator('#stNavBackupConfig')).toHaveClass(/active/);
});

test('clicking Model Mapping loads the model mapping content', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavModelMapping').click();
  await expect(window.locator('#stMainContent')).toContainText('Model Mapping');
});

test('clicking Telegram loads the notifications content', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavTelegram').click();
  await expect(window.locator('#stMainContent')).toContainText('Notifications');
});

test('clicking Cloud Sync loads the cloud sync content', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavCloudSync').click();
  await expect(window.locator('#stMainContent')).toContainText('Cloud Sync');
});

test('clicking Backup loads the backup content', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavBackupConfig').click();
  await expect(window.locator('#stMainContent')).toContainText('Backup');
});

// ----------------------------------------------------------------
// AI Config — empty state
// ----------------------------------------------------------------

test('AI Config shows the empty-state message when no models are configured', async () => {
  await clearModelConfigs(window);
  await navigateToSettings(window);
  await expect(window.locator('.st-model-empty')).toBeVisible();
});

test('Add Model button is visible in the AI Config section', async () => {
  await navigateToSettings(window);
  await expect(window.locator('#stBtnAddModel')).toBeVisible();
});

// ----------------------------------------------------------------
// Add Model modal — lifecycle
// ----------------------------------------------------------------

test('clicking Add Model opens the modal', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await expect(window.locator('.st-overlay')).toBeVisible();
});

test('Add Model modal title reads "Add Model"', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await expect(window.locator('.st-modal__title')).toHaveText('Add Model');
});

test('modal X button closes the modal', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('#stModalClose').click();
  await expect(window.locator('.st-overlay')).toHaveCount(0);
});

test('modal Cancel button closes the modal', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('#stFBtnCancel').click();
  await expect(window.locator('.st-overlay')).toHaveCount(0);
});

test('pressing Escape closes the modal', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await expect(window.locator('.st-overlay')).toBeVisible();
  await window.locator('#stFLabel').press('Escape');
  await expect(window.locator('.st-overlay')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Add Model modal — type toggle (CLI / Ollama)
// ----------------------------------------------------------------

test('CLI fields are visible by default in the Add Model modal', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await expect(window.locator('#stFFieldsCli')).toBeVisible();
  await expect(window.locator('#stFFieldsOllama')).toBeHidden();
});

test('clicking Ollama type button shows Ollama fields and hides CLI fields', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('.st-type-btn[data-type="ollama"]').click();
  await expect(window.locator('#stFFieldsOllama')).toBeVisible();
  await expect(window.locator('#stFFieldsCli')).toBeHidden();
});

test('clicking CLI type button again shows CLI fields and hides Ollama fields', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('.st-type-btn[data-type="ollama"]').click();
  await window.locator('.st-type-btn[data-type="cli"]').click();
  await expect(window.locator('#stFFieldsCli')).toBeVisible();
  await expect(window.locator('#stFFieldsOllama')).toBeHidden();
});

test('Ollama type button gains active class when selected', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('.st-type-btn[data-type="ollama"]').click();
  await expect(window.locator('.st-type-btn[data-type="ollama"]')).toHaveClass(/active/);
  await expect(window.locator('.st-type-btn[data-type="cli"]')).not.toHaveClass(/active/);
});

// ----------------------------------------------------------------
// Add Model modal — form validation and save
// ----------------------------------------------------------------

test('submitting the form with an empty label keeps the modal open', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('#stFLabel').clear();
  await window.locator('#stModalForm button[type="submit"]').click();
  await expect(window.locator('.st-overlay')).toBeVisible();
});

test('filling the label and submitting adds the model and closes the modal', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('#stFLabel').fill('My Claude CLI');
  await window.locator('#stFCliModel').fill('claude-sonnet-4-6');
  await window.locator('#stModalForm button[type="submit"]').click();
  await expect(window.locator('.st-overlay')).toHaveCount(0);
});

test('newly added model label appears in the model list', async () => {
  await clearModelConfigs(window);
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('#stFLabel').fill('New Test Model');
  await window.locator('#stFCliModel').fill('claude-sonnet-4-6');
  await window.locator('#stModalForm button[type="submit"]').click();
  await expect(window.locator('.st-model-item__label')).toHaveText('New Test Model');
});

test('adding a model removes the empty-state message', async () => {
  await navigateToSettings(window);
  await window.locator('#stBtnAddModel').click();
  await window.locator('#stFLabel').fill('Remove Empty State');
  await window.locator('#stFCliModel').fill('claude-sonnet-4-6');
  await window.locator('#stModalForm button[type="submit"]').click();
  await expect(window.locator('.st-model-empty')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Model list — edit actions
// ----------------------------------------------------------------

test('clicking a model card opens the Edit modal', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'Editable Model');
  await navigateToSettings(window);
  await window.locator('.st-model-item--clickable').click();
  await expect(window.locator('.st-overlay')).toBeVisible();
});

test('Edit modal title reads "Edit Model"', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'Edit Title Check');
  await navigateToSettings(window);
  await window.locator('.st-model-item--clickable').click();
  await expect(window.locator('.st-modal__title')).toHaveText('Edit Model');
});

test('Edit modal pre-fills the label with the existing model label', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'Pre-filled Label');
  await navigateToSettings(window);
  await window.locator('[data-action="edit"]').click();
  await expect(window.locator('#stFLabel')).toHaveValue('Pre-filled Label');
});

test('Edit modal shows the model type as read-only text', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'CLI Type Check', 'cli');
  await navigateToSettings(window);
  await window.locator('[data-action="edit"]').click();
  await expect(window.locator('.st-type-readonly')).toHaveText('CLI');
});

// ----------------------------------------------------------------
// Model list — delete action
// ----------------------------------------------------------------

test('delete button removes the model from the list', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'Delete Me');
  await navigateToSettings(window);
  await window.locator('[data-action="delete"]').click();
  await expect(window.locator('.st-model-item')).toHaveCount(0);
});

test('deleting the only model restores the empty-state message', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'Last Model');
  await navigateToSettings(window);
  await window.locator('[data-action="delete"]').click();
  await expect(window.locator('.st-model-empty')).toBeVisible();
});

// ----------------------------------------------------------------
// Model list — set-default action
// ----------------------------------------------------------------

test('non-default model shows the set-default star button', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'Not Default');
  await navigateToSettings(window);
  await expect(window.locator('[data-action="default"]')).toBeVisible();
});

test('clicking the star button marks the model as default', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'Promote to Default');
  await navigateToSettings(window);
  await window.locator('[data-action="default"]').click();
  await expect(window.locator('.st-model-item__badge--default')).toBeVisible();
});

test('default model does not show the star button', async () => {
  await clearModelConfigs(window);
  await seedModelConfig(window, 'Promote to Default');
  await navigateToSettings(window);
  await window.locator('[data-action="default"]').click();
  await expect(window.locator('[data-action="default"]')).toHaveCount(0);
});

// ----------------------------------------------------------------
// Model Mapping
// ----------------------------------------------------------------

test('Model Mapping page shows section rows for each feature', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavModelMapping').click();
  await expect(window.locator('.st-mapping-row')).not.toHaveCount(0);
});

test('all mapping selects are disabled when no models are configured', async () => {
  await clearModelConfigs(window);
  await navigateToSettings(window);
  await window.locator('#stNavModelMapping').click();
  // Every select should be disabled when no models are configured
  const count = await window.locator('.st-mapping-row__select').count();
  const disabledCount = await window.locator('.st-mapping-row__select[disabled]').count();
  expect(disabledCount).toBe(count);
});

test('after adding a model, its label appears as an option in mapping selects', async () => {
  await seedModelConfig(window, 'Mapping Model');
  await navigateToSettings(window);
  await window.locator('#stNavModelMapping').click();
  // At least one enabled select should contain the model label
  await expect(window.locator('.st-mapping-row__select option[value]:not([value=""])')).not.toHaveCount(0);
});

// ----------------------------------------------------------------
// Telegram
// ----------------------------------------------------------------

test('Telegram page shows Bot Token and Chat ID fields', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavTelegram').click();
  await expect(window.locator('#tgBotToken')).toBeVisible();
  await expect(window.locator('#tgChatId')).toBeVisible();
});

test('Telegram Save button shows "Saved" hint after clicking', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavTelegram').click();
  await window.locator('#tgBtnSave').click();
  await expect(window.locator('#tgHint')).toHaveText('Saved', { timeout: 5000 });
});

test('Telegram chat ID field accepts typed text', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavTelegram').click();
  await window.locator('#tgChatId').fill('-100123456789');
  await expect(window.locator('#tgChatId')).toHaveValue('-100123456789');
});

// ----------------------------------------------------------------
// Cloud Sync
// ----------------------------------------------------------------

test('Cloud Sync defaults to Neon provider with Neon fields visible', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavCloudSync').click();
  await expect(window.locator('#csFieldsNeon')).toBeVisible();
  await expect(window.locator('#csFieldsPostgres')).toBeHidden();
});

test('switching provider to PostgreSQL shows postgres-specific fields', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavCloudSync').click();
  await window.locator('#csProvider').selectOption('postgres');
  await expect(window.locator('#csFieldsPostgres')).toBeVisible();
  await expect(window.locator('#csFieldsNeon')).toBeHidden();
});

test('switching provider back to Neon re-shows Neon fields', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavCloudSync').click();
  await window.locator('#csProvider').selectOption('postgres');
  await window.locator('#csProvider').selectOption('neon');
  await expect(window.locator('#csFieldsNeon')).toBeVisible();
  await expect(window.locator('#csFieldsPostgres')).toBeHidden();
});

test('Cloud Sync Save button shows "Saved" hint after clicking', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavCloudSync').click();
  await window.locator('#csBtnSave').click();
  await expect(window.locator('#csSaveHint')).toHaveText('Saved', { timeout: 5000 });
});

// ----------------------------------------------------------------
// Backup & Restore
// ----------------------------------------------------------------

test('Backup page shows Export and Restore action cards', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavBackupConfig').click();
  await expect(window.locator('#stBtnExport')).toBeVisible();
  await expect(window.locator('#stBtnRestore')).toBeVisible();
});

test('Backup path input accepts typed text', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavBackupConfig').click();
  await window.locator('#stBackupPathInput').fill('C:\\MyBackups');
  await expect(window.locator('#stBackupPathInput')).toHaveValue('C:\\MyBackups');
});

test('Save backup path shows "Saved" hint and updates the secondary path display', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavBackupConfig').click();
  await window.locator('#stBackupPathInput').fill('C:\\TestBackupDir');
  await window.locator('#stBtnSaveBackup').click();
  await expect(window.locator('#stBackupHint')).toHaveText('Saved', { timeout: 5000 });
  await expect(window.locator('#stSecondaryPathDisplay')).toContainText('C:\\TestBackupDir');
});

test('saving an empty backup path updates the secondary display to "Not set"', async () => {
  await navigateToSettings(window);
  await window.locator('#stNavBackupConfig').click();
  await window.locator('#stBackupPathInput').clear();
  await window.locator('#stBtnSaveBackup').click();
  await expect(window.locator('#stSecondaryPathDisplay')).toHaveText('Not set', { timeout: 5000 });
});
