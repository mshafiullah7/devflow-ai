import { applyStoredTheme }   from '../../shared/theme-manager.js';
import { TestGeneratorPage }   from '../test-generator/test-generator-page.js';

applyStoredTheme();

const container = document.getElementById('app');
let page        = null;

// Stub router: back button closes this window; git-changes is a no-op in standalone
const router = {
  navigate: (route) => {
    if (route === 'project-home') window.close();
  },
};

window.app.unitTestsWindow.onInit(({ projectId }) => {
  if (page) { page.unmount(); container.innerHTML = ''; page = null; }
  page = new TestGeneratorPage(container, { projectId }, router);
  page.mount();
});
