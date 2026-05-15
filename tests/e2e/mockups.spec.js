'use strict';

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

async function navigateToMockups(window) {
  await window.locator('#navMockups').click();
  await window.locator('.mockups-page').waitFor({ timeout: 10000 });
}

async function createScreenViaModal(window, title, description = '') {
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsTitle').fill(title);
  if (description) await window.locator('#scrNsDesc').fill(description);
  await window.locator('#scrNsSave').click();
  await window.locator('.scr-viewer').waitFor({ timeout: 5000 });
}

test.beforeEach(async () => {
  ({ app, window, dbPath } = await launchApp());
  await createAndOpenProject(window);
  await navigateToMockups(window);
});

test.afterEach(async () => {
  await closeApp(app, dbPath);
});

// ----------------------------------------------------------------
// Page structure
// ----------------------------------------------------------------
test('mockups page renders with project name in title', async () => {
  await expect(window.locator('.mockups-page__title')).toHaveText('E2E Test Project');
});

test('mockups page subtitle reads Project Mockups', async () => {
  await expect(window.locator('.mockups-page__subtitle')).toHaveText('Project Mockups');
});

test('mockups page back button is visible', async () => {
  await expect(window.locator('#btnBack')).toBeVisible();
});

test('mockups page back button navigates to project home', async () => {
  await window.locator('#btnBack').click();
  await expect(window.locator('.project-home')).toBeVisible({ timeout: 8000 });
});

test('folder selector shows Select folder by default', async () => {
  await expect(window.locator('#headerFolderText')).toHaveText('Select folder');
});

test('model config button is visible in header', async () => {
  await expect(window.locator('#mockupsBtnModelConfigs')).toBeVisible();
});

test('git button is visible in header', async () => {
  await expect(window.locator('#mockupsBtnGit')).toBeVisible();
});

test('styles button is visible in header', async () => {
  await expect(window.locator('#scrStyleGuideBtn')).toBeVisible();
});

test('styles button navigates to style guide page', async () => {
  await window.locator('#scrStyleGuideBtn').click();
  await expect(window.locator('.mockups-page')).toBeHidden({ timeout: 8000 });
});

test('model config button navigates to settings page', async () => {
  await window.locator('#mockupsBtnModelConfigs').click();
  await expect(window.locator('.mockups-page')).toBeHidden({ timeout: 8000 });
});

// ----------------------------------------------------------------
// Empty state (fresh project)
// ----------------------------------------------------------------
test('sidebar shows No screens yet on fresh project', async () => {
  await expect(window.locator('.scr-sidebar__empty')).toHaveText('No screens yet');
});

test('main area shows empty state on fresh project', async () => {
  await expect(window.locator('.scr-empty-state')).toBeVisible();
});

test('empty state title reads No screens yet', async () => {
  await expect(window.locator('.scr-empty-state__title')).toHaveText('No screens yet');
});

test('empty state subtitle mentions New Screen', async () => {
  await expect(window.locator('.scr-empty-state__sub')).toContainText('New Screen');
});

// ----------------------------------------------------------------
// Sidebar
// ----------------------------------------------------------------
test('New Screen button is visible in sidebar', async () => {
  await expect(window.locator('#scrNewBtn')).toBeVisible();
});

test('New Screen button has correct label', async () => {
  await expect(window.locator('#scrNewBtn')).toContainText('New Screen');
});

test('sidebar list starts empty', async () => {
  await expect(window.locator('.scr-sidebar__item')).toHaveCount(0);
});

// ----------------------------------------------------------------
// New Screen modal
// ----------------------------------------------------------------
test('clicking New Screen opens the new screen modal', async () => {
  await window.locator('#scrNewBtn').click();
  await expect(window.locator('.scr-ns-dialog')).toBeVisible();
});

test('new screen modal has a title input', async () => {
  await window.locator('#scrNewBtn').click();
  await expect(window.locator('#scrNsTitle')).toBeVisible();
});

test('new screen modal has a description textarea', async () => {
  await window.locator('#scrNewBtn').click();
  await expect(window.locator('#scrNsDesc')).toBeVisible();
});

test('new screen modal Cancel button closes the modal', async () => {
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsCancel').click();
  await expect(window.locator('.scr-ns-dialog')).toHaveCount(0);
});

test('new screen modal close (×) button closes the modal', async () => {
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsClose').click();
  await expect(window.locator('.scr-ns-dialog')).toHaveCount(0);
});

test('new screen modal Save & Open button is disabled when title is empty', async () => {
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  // clicking save without filling title should keep modal open
  await window.locator('#scrNsSave').click();
  await expect(window.locator('.scr-ns-dialog')).toBeVisible();
});

test('creating a new screen closes the modal and shows the viewer', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-ns-dialog')).toHaveCount(0);
  await expect(window.locator('.scr-viewer')).toBeVisible();
});

test('created screen appears in sidebar', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-sidebar__item')).toHaveCount(1);
});

test('created screen title appears in sidebar', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-sidebar__item-title')).toHaveText('Login Screen');
});

test('sidebar empty state is removed after first screen is created', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-sidebar__empty')).toHaveCount(0);
});

test('sidebar item is active after creation', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-sidebar__item')).toHaveClass(/scr-sidebar__item--active/);
});

// ----------------------------------------------------------------
// Screen viewer
// ----------------------------------------------------------------
test('screen viewer shows the screen title', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-viewer__title')).toHaveText('Login Screen');
});

test('screen viewer shows the tech badge Plain HTML / CSS', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-viewer__tech-badge')).toHaveText('Plain HTML / CSS');
});

test('screen viewer shows edit details button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrEditDetailsBtn')).toBeVisible();
});

test('screen viewer shows Actions button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrActionsMenuTrigger')).toBeVisible();
});

test('screen viewer shows delete button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrDeleteBtn')).toBeVisible();
});

test('screen viewer shows preview pane', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrPreviewPane')).toBeVisible();
});

test('screen viewer shows preview iframe', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrPreviewFrame')).toBeVisible();
});

test('screen viewer shows Refresh button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrRefreshBtn')).toBeVisible();
});

test('screen viewer shows chat pane', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-chat-pane')).toBeVisible();
});

test('screen viewer chat pane shows description textarea', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrDescription')).toBeVisible();
});

test('screen viewer chat pane shows Send button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrSendBtn')).toBeVisible();
});

test('chat pane shows empty state message on a new screen', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('.scr-chat-empty')).toBeVisible();
});

test('chat pane shows history button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrChatHistoryBtn')).toBeVisible();
});

test('chat pane shows load description button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrLoadDescBtn')).toBeVisible();
});

// ----------------------------------------------------------------
// Edit screen details modal
// ----------------------------------------------------------------
test('clicking Edit Details opens the edit screen modal', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrEditDetailsBtn').click();
  await expect(window.locator('#scrEditTitle')).toBeVisible();
});

test('edit screen modal is prepopulated with the screen title', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrEditDetailsBtn').click();
  await expect(window.locator('#scrEditTitle')).toHaveValue('Login Screen');
});

test('edit screen modal Cancel closes without changes', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrEditDetailsBtn').click();
  await window.locator('#scrEditTitle').waitFor();
  await window.locator('#scrEditCancel').click();
  await expect(window.locator('#scrEditTitle')).toHaveCount(0);
  await expect(window.locator('.scr-viewer__title')).toHaveText('Login Screen');
});

test('saving edit details updates the title in the viewer', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrEditDetailsBtn').click();
  await window.locator('#scrEditTitle').fill('Dashboard Screen');
  await window.locator('#scrEditSave').click();
  await expect(window.locator('.scr-viewer__title')).toHaveText('Dashboard Screen');
});

test('saving edit details updates the title in the sidebar', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrEditDetailsBtn').click();
  await window.locator('#scrEditTitle').fill('Dashboard Screen');
  await window.locator('#scrEditSave').click();
  await expect(window.locator('.scr-sidebar__item-title')).toHaveText('Dashboard Screen');
});

// ----------------------------------------------------------------
// Actions menu
// ----------------------------------------------------------------
test('Actions dropdown is hidden by default', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await expect(window.locator('#scrActionsDropdown')).toBeHidden();
});

test('clicking Actions button shows the dropdown', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrActionsMenuTrigger').click();
  await expect(window.locator('#scrActionsDropdown')).toBeVisible();
});

test('actions dropdown contains Export HTML button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrActionsMenuTrigger').click();
  await expect(window.locator('#scrExportHtmlBtn')).toBeVisible();
});

test('actions dropdown contains Choose File button', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrActionsMenuTrigger').click();
  await expect(window.locator('#scrChooseFileBtn')).toBeVisible();
});

// ----------------------------------------------------------------
// Screen deletion
// ----------------------------------------------------------------
test('clicking delete button shows confirmation dialog', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrDeleteBtn').click();
  await expect(window.locator('.scr-unsaved-overlay')).toBeVisible();
});

test('delete confirmation dialog has Delete and Cancel buttons', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrDeleteBtn').click();
  await expect(window.locator('#dlgDeleteConfirm')).toBeVisible();
  await expect(window.locator('#dlgDeleteCancel')).toBeVisible();
});

test('cancelling delete dialog keeps the screen', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrDeleteBtn').click();
  await window.locator('#dlgDeleteCancel').click();
  await expect(window.locator('.scr-unsaved-overlay')).toHaveCount(0);
  await expect(window.locator('.scr-viewer')).toBeVisible();
});

test('confirming delete removes the screen from sidebar', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrDeleteBtn').click();
  await window.locator('#dlgDeleteConfirm').click();
  await expect(window.locator('.scr-sidebar__item')).toHaveCount(0);
});

test('confirming delete shows empty state', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrDeleteBtn').click();
  await window.locator('#dlgDeleteConfirm').click();
  await expect(window.locator('.scr-empty-state')).toBeVisible({ timeout: 5000 });
});

// ----------------------------------------------------------------
// Multiple screens
// ----------------------------------------------------------------
test('creating two screens shows both in sidebar', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsTitle').fill('Dashboard Screen');
  await window.locator('#scrNsSave').click();
  await window.locator('.scr-viewer').waitFor({ timeout: 5000 });
  await expect(window.locator('.scr-sidebar__item')).toHaveCount(2);
});

test('clicking a sidebar item switches the active screen', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsTitle').fill('Dashboard Screen');
  await window.locator('#scrNsSave').click();
  await window.locator('.scr-viewer').waitFor({ timeout: 5000 });

  // click first sidebar item (Login Screen)
  await window.locator('.scr-sidebar__item').first().click();
  await expect(window.locator('.scr-viewer__title')).toHaveText('Login Screen');
});

test('active sidebar item has active class', async () => {
  await createScreenViaModal(window, 'Login Screen');
  await window.locator('#scrNewBtn').click();
  await window.locator('#scrNsTitle').waitFor();
  await window.locator('#scrNsTitle').fill('Dashboard Screen');
  await window.locator('#scrNsSave').click();
  await window.locator('.scr-viewer').waitFor({ timeout: 5000 });

  // the second item (Dashboard) should be active after creation
  await expect(window.locator('.scr-sidebar__item').nth(1)).toHaveClass(/scr-sidebar__item--active/);
});
