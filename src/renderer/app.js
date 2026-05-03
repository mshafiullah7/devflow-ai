import { Router } from './shared/router.js';
import { LauncherPage } from './pages/launcher/launcher.js';

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
router.register('extract-user-stories', async () => {
  const { ExtractUserStoriesPage } = await import('./pages/extract-user-stories/extract-user-stories-page.js');
  return ExtractUserStoriesPage;
});
router.register('user-stories', async () => {
  const { ProjectPage } = await import('./pages/user-stories/user-stories.js');
  return ProjectPage;
});
router.register('test-cases', async () => {
  const { TestCasesPage } = await import('./pages/test-cases/test-cases-page.js');
  return TestCasesPage;
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
router.navigate('launcher');
