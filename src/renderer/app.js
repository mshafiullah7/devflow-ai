import { Router } from './shared/router.js';
import { LauncherPage } from './pages/launcher/launcher.js';

const router = new Router(document.getElementById('app'));

router.register('launcher', LauncherPage);
router.register('project', async () => {
  const { ProjectPage } = await import('./pages/project/project.js');
  return ProjectPage;
});

router.navigate('launcher');
