import { Router } from './shared/router.js';
import { LauncherPage } from './pages/launcher/launcher.js';

const router = new Router(document.getElementById('app'));

router.register('launcher', LauncherPage);
// Future pages registered here:
// router.register('dashboard', DashboardPage);

router.navigate('launcher');
