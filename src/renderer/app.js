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
router.register('project', async () => {
  const { ProjectPage } = await import('./pages/project/project.js');
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

router.navigate('launcher');
