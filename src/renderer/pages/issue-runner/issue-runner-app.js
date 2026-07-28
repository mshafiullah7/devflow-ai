import { IssueRunnerPage } from './issue-runner-page.js';

let page = null;

window.app.issueRunnerWindow.onInit(({ projectId, modelConfig, itemId, autoRun }) => {
  if (page) { page.unmount(); page = null; }
  page = new IssueRunnerPage(document.getElementById('app'), { projectId, modelConfig, itemId, autoRun });
  page.mount();
});
