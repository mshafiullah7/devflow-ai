import { Router } from './shared/router.js';
import { LauncherPage } from './pages/launcher/launcher.js';
import { showToast } from './utils/toast.js';

window.showToast = showToast;

const FRIENDLY = {
  'db:':          'A data operation failed. Please try again.',
  'chat:':        'The AI request failed. Check your model settings.',
  'promptQueue:': 'Prompt execution failed.',
  'terminal:':    'Command execution failed.',
  'testRunner:':  'Test runner failed.',
  'dialog:':      'File operation failed.',
  'shell:':       'Shell operation failed.',
  'ollama:':      'Ollama request failed. Is the server running?',
};

window.addEventListener('app:ipc-error', (e) => {
  const { channel } = e.detail;
  const prefix = Object.keys(FRIENDLY).find(p => channel.startsWith(p));
  showToast(prefix ? FRIENDLY[prefix] : 'An unexpected error occurred.');
});

const router = new Router(document.getElementById('app'));

router.register('launcher', LauncherPage);
router.register('project-home', async () => {
  const { ProjectHomePage } = await import('./pages/project-home/project-home.js');
  return ProjectHomePage;
});
router.register('mockups', async () => {
  const { MockupsPage } = await import('./pages/mockups/mockups-page.js');
  return MockupsPage;
});
router.register('documents', async () => {
  const { DocumentsPage } = await import('./pages/documents/documents-page.js');
  return DocumentsPage;
});
router.register('project-layers', async () => {
  const { ProjectLayersPage } = await import('./pages/project-layers/project-layers-page.js');
  return ProjectLayersPage;
});
router.register('style-guide', async () => {
  const { StyleGuidePage } = await import('./pages/style-guide/style-guide-page.js');
  return StyleGuidePage;
});
router.register('issues', async () => {
  const { IssuesPage } = await import('./pages/issues/issues-page.js');
  return IssuesPage;
});
router.register('git-changes', async () => {
  const { GitChangesPage } = await import('./pages/git-changes/git-changes-page.js');
  return GitChangesPage;
});
router.register('prompt-queue', async () => {
  const { PromptQueuePage } = await import('./pages/prompt-queue/prompt-queue-page.js');
  return PromptQueuePage;
});
router.register('settings', async () => {
  const { SettingsPage } = await import('./pages/settings/settings-page.js');
  return SettingsPage;
});
router.register('ai-console', async () => {
  const { AiConsolePage } = await import('./pages/ai-console/ai-console-page.js');
  return AiConsolePage;
});
router.register('workflows', async () => {
  const { WorkflowsPage } = await import('./pages/workflows/workflows-page.js');
  return WorkflowsPage;
});
router.register('test-generator', async () => {
  const { TestGeneratorPage } = await import('./pages/test-generator/test-generator-page.js');
  return TestGeneratorPage;
});
router.navigate('launcher');
