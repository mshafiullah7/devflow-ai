import { Router } from './shared/router.js';
import { LauncherPage } from './pages/launcher/launcher.js';
import { ProjectPage } from './pages/project/project.js';

const router = new Router(document.getElementById('app'));

router.register('launcher', LauncherPage);
router.register('project', ProjectPage);

router.navigate('launcher');
