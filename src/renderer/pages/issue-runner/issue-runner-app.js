import { IssueRunnerPage } from './issue-runner-page.js';

const fakeRouter = { navigate: () => window.close() };

let page = null;

window.app.issueRunnerWindow.onInit(({ projectId }) => {
  if (page) { page.unmount(); page = null; }
  page = new IssueRunnerPage(document.getElementById('app'), { projectId }, fakeRouter);
  page.mount();
});
