import { PromptQueuePage } from '../prompt-queue/prompt-queue-page.js';

// Stub router — back/settings buttons close the window instead of navigating
const fakeRouter = { navigate: () => window.close() };

let page = null;

window.app.taskQueueWindow.onInit(({ projectId }) => {
  if (page) {
    page.unmount();
    page = null;
  }
  page = new PromptQueuePage(document.getElementById('app'), { projectId, from: 'issues' }, fakeRouter);
  page.mount();
});
