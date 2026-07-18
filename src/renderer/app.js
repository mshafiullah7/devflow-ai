import { LauncherPage } from './pages/launcher/launcher.js';
import { showToast } from './utils/toast.js';
import { router } from './shared/app-nav.js';

window.showToast = showToast;

const FRIENDLY = {
  'db:':          'A data operation failed. Please try again.',
  'chat:':        'The AI request failed. Check your model settings.',
  'promptQueue:': 'Prompt execution failed.',
  'terminal:':    'Command execution failed.',
  'testRunner:':      'Test runner failed.',
  'securityScanner:': 'Security scan failed.',
  'dialog:':      'File operation failed.',
  'shell:':       'Shell operation failed.',
  'ollama:':      'Ollama request failed. Is the server running?',
};

window.addEventListener('app:ipc-error', (e) => {
  const { channel } = e.detail;
  const prefix = Object.keys(FRIENDLY).find(p => channel.startsWith(p));
  showToast(prefix ? FRIENDLY[prefix] : 'An unexpected error occurred.');
});

// The main process defers window close until we say it's safe — lets the
// current page (e.g. Documents' AI Assist) block quitting mid-request.
window.app.onCloseRequested(async () => {
  if (await router.canLeave()) window.app.confirmClose();
});

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
router.register('generate-workflows', async () => {
  const { GenerateWorkflowsPage } = await import('./pages/generate-workflows/generate-workflows-page.js');
  return GenerateWorkflowsPage;
});
router.register('security-scans', async () => {
  const { SecurityScansPage } = await import('./pages/security-scans/security-scans-page.js');
  return SecurityScansPage;
});
router.register('workflow-runner', async () => {
  const { WorkflowRunnerPage } = await import('./pages/workflow-runner/workflow-runner-page.js');
  return WorkflowRunnerPage;
});
router.register('issue-runner', async () => {
  const { IssueRunnerPage } = await import('./pages/issue-runner/issue-runner-page.js');
  return IssueRunnerPage;
});
router.register('terminal', async () => {
  const { TerminalPage } = await import('./pages/terminal/terminal-page.js');
  return TerminalPage;
});
router.navigate('launcher');
