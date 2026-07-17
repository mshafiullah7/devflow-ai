import { IssueRunnerPage } from './issue-runner-page.js';

const fakeRouter = { navigate: () => window.close() };

let page = null;

window.app.issueRunnerWindow.onInit(({ projectId, modelConfig }) => {
  if (page) { page.unmount(); page = null; }
  page = new IssueRunnerPage(document.getElementById('app'), { projectId, modelConfig }, fakeRouter);
  page.mount();
});
