// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

const invoke = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (result && typeof result === 'object' && '__error' in result) {
    window.dispatchEvent(new CustomEvent('app:ipc-error', {
      detail: { channel, message: result.__error },
    }));
    throw new Error(result.__error);
  }
  return result;
};

contextBridge.exposeInMainWorld('db', {
  status: {
    list: () => invoke('db:status:list'),
  },
  projects: {
    list:   ()       => invoke('db:projects:list'),
    get:    (id)     => invoke('db:projects:get', id),
    create: (data)   => invoke('db:projects:create', data),
    update: (data)   => invoke('db:projects:update', data),
    delete: (id)     => invoke('db:projects:delete', id),
    open:    (id)     => invoke('db:projects:open', id),
    recent:  ()       => invoke('db:projects:recent'),
    setPath: (data)   => invoke('db:projects:setPath', data),
  },
  workflows: {
    list:         (project_id) => invoke('db:workflows:list', project_id),
    get:          (id)         => invoke('db:workflows:get', id),
    create:       (data)       => invoke('db:workflows:create', data),
    update:       (data)       => invoke('db:workflows:update', data),
    delete:       (id)         => invoke('db:workflows:delete', id),
    updateStatus: (data)       => invoke('db:workflows:updateStatus', data),
  },
  successCriteria: {
    list:   (workflow_id) => invoke('db:success_criteria:list', workflow_id),
    create: (data)        => invoke('db:success_criteria:create', data),
    update: (data)        => invoke('db:success_criteria:update', data),
    delete: (id)          => invoke('db:success_criteria:delete', id),
  },
  layers: {
    list:                (workflow_id) => invoke('db:layers:list', workflow_id),
    get:                 (id)          => invoke('db:layers:get', id),
    create:              (data)        => invoke('db:layers:create', data),
    update:              (data)        => invoke('db:layers:update', data),
    delete:              (id)          => invoke('db:layers:delete', id),
    updateStatus:        (data)        => invoke('db:layers:updateStatus', data),
    countByProject:      (project_id)  => invoke('db:layers:countByProject', project_id),
    statsByProjectLayer: (project_id)  => invoke('db:layers:statsByProjectLayer', project_id),
  },
  documentTemplates: {
    list:   ()     => invoke('db:document_templates:list'),
    get:    (id)   => invoke('db:document_templates:get', id),
    create: (data) => invoke('db:document_templates:create', data),
    update: (data) => invoke('db:document_templates:update', data),
    delete: (id)   => invoke('db:document_templates:delete', id),
  },
  screenTemplates: {
    list:   ()         => invoke('db:screen_templates:list'),
    get:    (id)       => invoke('db:screen_templates:get', id),
    create: (data)     => invoke('db:screen_templates:create', data),
    update: (data)     => invoke('db:screen_templates:update', data),
    delete: (id)       => invoke('db:screen_templates:delete', id),
    seed:   (templates) => invoke('db:screen_templates:seed', templates),
  },
  documents: {
    list:   (project_id) => invoke('db:documents:list', project_id),
    get:    (id)         => invoke('db:documents:get', id),
    create: (data)       => invoke('db:documents:create', data),
    update: (data)       => invoke('db:documents:update', data),
    delete: (id)         => invoke('db:documents:delete', id),
  },
  modelConfigs: {
    list:       ()     => invoke('db:model_configs:list'),
    get:        (id)   => invoke('db:model_configs:get', id),
    create:     (data) => invoke('db:model_configs:create', data),
    update:     (data) => invoke('db:model_configs:update', data),
    delete:     (id)   => invoke('db:model_configs:delete', id),
    setDefault: (id)   => invoke('db:model_configs:setDefault', id),
  },
  quickCommands: {
    list:   ()     => invoke('db:quick_commands:list'),
    create: (data) => invoke('db:quick_commands:create', data),
    update: (data) => invoke('db:quick_commands:update', data),
    delete: (id)   => invoke('db:quick_commands:delete', id),
  },
  attachments: {
    list:       (document_id) => invoke('db:attachments:list', document_id),
    get:        (id)          => invoke('db:attachments:get', id),
    getContent: (id)          => invoke('db:attachments:getContent', id),
    create:     (data)        => invoke('db:attachments:create', data),
    update:     (data)        => invoke('db:attachments:update', data),
    delete:     (id)          => invoke('db:attachments:delete', id),
  },
  screenPromptHistory: {
    list:      (data) => invoke('db:screen_prompt_history:list', data),
    create:    (data) => invoke('db:screen_prompt_history:create', data),
    delete:    (id)   => invoke('db:screen_prompt_history:delete', id),
    deleteAll: (data) => invoke('db:screen_prompt_history:deleteAll', data),
  },
  workflowLayerPromptHistory: {
    list:      (data) => invoke('db:workflow_layer_prompt_history:list', data),
    create:    (data) => invoke('db:workflow_layer_prompt_history:create', data),
    delete:    (id)   => invoke('db:workflow_layer_prompt_history:delete', id),
    deleteAll: (data) => invoke('db:workflow_layer_prompt_history:deleteAll', data),
  },
  screenDesigns: {
    list:             (project_id) => invoke('db:screen_designs:list', project_id),
    get:              (id)         => invoke('db:screen_designs:get', id),
    create:           (data)       => invoke('db:screen_designs:create', data),
    update:           (data)       => invoke('db:screen_designs:update', data),
    delete:           (id)         => invoke('db:screen_designs:delete', id),
    setDartFilePath:  (data)       => invoke('db:screen_designs:setDartFilePath', data),
    setWorkflowOrder: (orderedIds) => invoke('db:screen_designs:setWorkflowOrder', orderedIds),
  },
  promptQueueMessages: {
    list:  (queue_item_id) => invoke('db:pq_messages:list', queue_item_id),
    add:   (data)          => invoke('db:pq_messages:add', data),
    clear: (queue_item_id) => invoke('db:pq_messages:clear', queue_item_id),
  },
  promptQueue: {
    list:            (data) => invoke('db:prompt_queue:list', data),
    add:             (data) => invoke('db:prompt_queue:add', data),
    update:          (data) => invoke('db:prompt_queue:update', data),
    delete:          (id)   => invoke('db:prompt_queue:delete', id),
    clearDone:       (pid)  => invoke('db:prompt_queue:clear_done', pid),
    pendingCount:    (pid)  => invoke('db:prompt_queue:pending_count', pid),
    run:             (data) => invoke('promptQueue:run', data),
    kill:            ()     => invoke('promptQueue:kill'),
    // Phase 2 — execute an approved plan
    approvePlan:     (data) => invoke('promptQueue:approvePlan', data),
    onData:          (cb)   => ipcRenderer.on('promptQueue:data',       (_e, p) => cb(p)),
    onDone:          (cb)   => ipcRenderer.on('promptQueue:done',       (_e, p) => cb(p)),
    // Planning events
    onPlan:          (cb)   => ipcRenderer.on('promptQueue:plan',       (_e, p) => cb(p)),
    onStep:          (cb)   => ipcRenderer.on('promptQueue:step',       (_e, p) => cb(p)),
    onRunSummary:    (cb)   => ipcRenderer.on('promptQueue:runSummary', (_e, p) => cb(p)),
    removeListeners: ()     => {
      ipcRenderer.removeAllListeners('promptQueue:data');
      ipcRenderer.removeAllListeners('promptQueue:done');
      ipcRenderer.removeAllListeners('promptQueue:plan');
      ipcRenderer.removeAllListeners('promptQueue:step');
      ipcRenderer.removeAllListeners('promptQueue:runSummary');
    },
  },
  testRunner: {
    detect:          (projectPath) => invoke('testRunner:detect', projectPath),
    run:             (data)        => invoke('testRunner:run', data),
    kill:            ()            => invoke('testRunner:kill'),
    saveTempOutput:  (text)        => invoke('testRunner:saveTempOutput', text),
    onData:          (cb)          => ipcRenderer.on('testRunner:data', (_e, p) => cb(p)),
    onDone:          (cb)          => ipcRenderer.on('testRunner:done', (_e, p) => cb(p)),
    removeListeners: ()            => {
      ipcRenderer.removeAllListeners('testRunner:data');
      ipcRenderer.removeAllListeners('testRunner:done');
    },
  },
  testRunHistory: {
    list:   (project_id) => invoke('testRunHistory:list', project_id),
    create: (data)       => invoke('testRunHistory:create', data),
  },
  securityScanner: {
    detect:          (projectPath) => invoke('securityScanner:detect', projectPath),
    run:             (data)        => invoke('securityScanner:run', data),
    kill:            ()            => invoke('securityScanner:kill'),
    saveTempOutput:  (text)        => invoke('securityScanner:saveTempOutput', text),
    onData:          (cb)          => ipcRenderer.on('securityScanner:data', (_e, p) => cb(p)),
    onDone:          (cb)          => ipcRenderer.on('securityScanner:done', (_e, p) => cb(p)),
    removeListeners: ()            => {
      ipcRenderer.removeAllListeners('securityScanner:data');
      ipcRenderer.removeAllListeners('securityScanner:done');
    },
  },
  securityScanHistory: {
    list:   (project_id) => invoke('securityScanHistory:list', project_id),
    create: (data)       => invoke('securityScanHistory:create', data),
  },
  issues: {
    list:   (filters)    => invoke('db:issues:list', filters),
    get:    (id)         => invoke('db:issues:get', id),
    create: (data)       => invoke('db:issues:create', data),
    update: (data)       => invoke('db:issues:update', data),
    delete: (id)         => invoke('db:issues:delete', id),
    count:  (project_id) => invoke('db:issues:count', project_id),
  },
  projectLayers: {
    list:   (project_id) => invoke('db:project_layers:list', project_id),
    get:    (id)         => invoke('db:project_layers:get', id),
    create: (data)       => invoke('db:project_layers:create', data),
    update: (data)       => invoke('db:project_layers:update', data),
    delete: (id)         => invoke('db:project_layers:delete', id),
  },
  modelMapping: {
    get: (pageKey)              => invoke('db:model_mapping:get', pageKey),
    set: (pageKey, modelConfigId) => invoke('db:model_mapping:set', pageKey, modelConfigId),
  },
  aiQuery: (sql) => invoke('db:ai-query', { sql }),
  aiSchema: () => invoke('db:ai-schema'),
  savedThemes: {
    list:   ()     => invoke('db:saved_themes:list'),
    create: (data) => invoke('db:saved_themes:create', data),
    delete: (id)   => invoke('db:saved_themes:delete', id),
  },
  dialog: {
    openFolder:   ()     => invoke('dialog:openFolder'),
    openJsonFile: ()     => invoke('dialog:openJsonFile'),
    openFile:     (opts) => invoke('dialog:openFile', opts),
    saveJsonFile: (data) => invoke('dialog:saveJsonFile', data),
  },
  window: {
    expand: () => invoke('window:expand'),
  },
  terminal: {
    homedir:      ()     => invoke('terminal:homedir'),
    exec:         (data) => invoke('terminal:exec', data),
    execStart:    (data) => invoke('terminal:exec-start', data),
    killActive:   ()     => invoke('terminal:kill-active'),
    openExternal: (data) => invoke('terminal:open-external', data),
    sendInput: (text) => invoke('terminal:stdin', text),
    onData: (cb) => ipcRenderer.on('terminal:data', (_e, p) => cb(p)),
    onDone: (cb) => ipcRenderer.on('terminal:done', (_e, p) => cb(p)),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('terminal:data');
      ipcRenderer.removeAllListeners('terminal:done');
    },
  },
});

contextBridge.exposeInMainWorld('app', {
  agentCliPath:        () => invoke('app:agent-cli-path'),
  setTitleBarOverlay:  (colors) => invoke('app:set-titlebar-overlay', colors),
  onCloseRequested:    (cb) => ipcRenderer.on('app:close-requested', () => cb()),
  offCloseRequested:   ()   => ipcRenderer.removeAllListeners('app:close-requested'),
  confirmClose:        ()   => ipcRenderer.send('app:close-confirmed'),
  config: {
    get: (key)        => invoke('app:config:get', key),
    set: (key, value) => invoke('app:config:set', key, value),
  },
  cloudSync: {
    get: ()     => invoke('app:cloudsync:get'),
    set: (data) => invoke('app:cloudsync:set', data),
  },
  telegram: {
    get:  ()       => invoke('app:telegram:get'),
    set:  (data)   => invoke('app:telegram:set', data),
    test: ()       => invoke('app:telegram:test'),
    send: (text)   => invoke('app:telegram:send', text),
  },
  db: {
    export:  () => invoke('app:db:export'),
    restore: () => invoke('app:db:restore'),
  },
  backupDefaultPath: () => invoke('app:backup-default-path'),
  logs: {
    list: () => invoke('app:logs:list'),
  },
  screensDir:       (projectName) => invoke('app:screens-dir', projectName),
  prepareScreenRef: (data)        => invoke('app:prepare-screen-ref', data),
  writeTempFiles:   (files)       => invoke('app:writeTempFiles', files),
  deleteTempDir:    (dirPath)     => invoke('app:deleteTempDir', dirPath),
  exportPdf:        (data)        => invoke('app:export-pdf', data),
  exportPng:        (data)        => invoke('app:export-png', data),
  exportPngBatch:   (data)        => invoke('app:export-png-batch', data),
  chat: {
    generate: (data) => ipcRenderer.invoke('chat:generate', data),
    cancel:   ()     => ipcRenderer.invoke('chat:cancel'),
    onToken:  (cb)   => ipcRenderer.on('chat:token', (_e, p) => cb(p)),
    onDone:   (cb)   => ipcRenderer.on('chat:done',  (_e, p) => cb(p)),
    offAll:   ()     => {
      ipcRenderer.removeAllListeners('chat:token');
      ipcRenderer.removeAllListeners('chat:done');
    },
  },
  openIssueRunnerWindow: (data) => ipcRenderer.invoke('app:openIssueRunnerWindow', data),
  issueRunnerWindow: {
    onInit: (cb) => ipcRenderer.on('issueRunner:init', (_e, p) => cb(p)),
  },
  // Separate AI channel for the detached workflow runner window.
  workflowChat: {
    generate: (data) => ipcRenderer.invoke('workflowChat:generate', data),
    cancel:   ()     => ipcRenderer.invoke('workflowChat:cancel'),
    onToken:  (cb)   => ipcRenderer.on('workflowChat:token', (_e, p) => cb(p)),
    onDone:   (cb)   => ipcRenderer.on('workflowChat:done',  (_e, p) => cb(p)),
    offAll:   ()     => {
      ipcRenderer.removeAllListeners('workflowChat:token');
      ipcRenderer.removeAllListeners('workflowChat:done');
    },
  },
  openMockupPreview:  (data) => invoke('app:openMockupPreview', data),
  openWorkflowWindow: (data) => ipcRenderer.invoke('app:openWorkflowWindow', data),
  workflowWindow: {
    onInit: (cb) => ipcRenderer.on('workflow:init', (_e, p) => cb(p)),
  },
  // PTY-backed terminal for the workflow runner window
  wfrPty: {
    write:          (data) => ipcRenderer.invoke('wfrPty:write', data),
    spawnShell:     (data) => ipcRenderer.invoke('wfrPty:spawnShell', data),
    resize:         (data) => ipcRenderer.invoke('wfrPty:resize', data),
    kill:           ()     => ipcRenderer.invoke('wfrPty:kill'),
    isBusy:         ()     => ipcRenderer.invoke('wfrPty:isBusy'),
    runLayer:       (data) => ipcRenderer.invoke('wfrPty:runLayer', data),
    runInShell:     (data) => ipcRenderer.invoke('wfrPty:runInShell', data),
    runUsage:       (data) => ipcRenderer.invoke('wfrPty:runUsage', data),
    openInTerminal: (data) => ipcRenderer.invoke('wfrPty:openInTerminal', data),
    onData:       (cb)    => ipcRenderer.on('wfrPty:data',       (_e, p) => cb(p)),
    onLayerDone:  (cb)    => ipcRenderer.on('wfrPty:layerDone',  (_e, p) => cb(p)),
    onTokenStats: (cb)    => ipcRenderer.on('wfrPty:tokenStats', (_e, p) => cb(p)),
    offAll:       ()      => {
      ipcRenderer.removeAllListeners('wfrPty:data');
      ipcRenderer.removeAllListeners('wfrPty:layerDone');
      ipcRenderer.removeAllListeners('wfrPty:tokenStats');
    },
  },
  // PTY-backed terminal for the issue runner window (independent from wfrPty)
  irPty: {
    write:      (data) => ipcRenderer.invoke('irPty:write', data),
    spawnShell: (data) => ipcRenderer.invoke('irPty:spawnShell', data),
    resize:     (data) => ipcRenderer.invoke('irPty:resize', data),
    kill:       ()     => ipcRenderer.invoke('irPty:kill'),
    isBusy:     ()     => ipcRenderer.invoke('irPty:isBusy'),
    runInShell: (data) => ipcRenderer.invoke('irPty:runInShell', data),
    onData:      (cb)  => ipcRenderer.on('irPty:data',      (_e, p) => cb(p)),
    onLayerDone: (cb)  => ipcRenderer.on('irPty:layerDone', (_e, p) => cb(p)),
    offAll:      ()    => {
      ipcRenderer.removeAllListeners('irPty:data');
      ipcRenderer.removeAllListeners('irPty:layerDone');
    },
  },
  // PTY-backed terminal for the standalone terminal window (independent from wfrPty)
  termPty: {
    write:      (data) => ipcRenderer.invoke('termPty:write', data),
    spawnShell: (data) => ipcRenderer.invoke('termPty:spawnShell', data),
    resize:     (data) => ipcRenderer.invoke('termPty:resize', data),
    kill:       ()     => ipcRenderer.invoke('termPty:kill'),
    onData:      (cb)  => ipcRenderer.on('termPty:data',      (_e, p) => cb(p)),
    onLayerDone: (cb)  => ipcRenderer.on('termPty:layerDone', (_e, p) => cb(p)),
    offAll:      ()    => {
      ipcRenderer.removeAllListeners('termPty:data');
      ipcRenderer.removeAllListeners('termPty:layerDone');
    },
  },
  // PTY-backed terminal for the Project Layers "run setup instructions" modal
  // (independent from termPty so it doesn't collide with the standalone Terminal window/page)
  plPty: {
    write:      (data) => ipcRenderer.invoke('plPty:write', data),
    spawnShell: (data) => ipcRenderer.invoke('plPty:spawnShell', data),
    resize:     (data) => ipcRenderer.invoke('plPty:resize', data),
    kill:       ()     => ipcRenderer.invoke('plPty:kill'),
    runInShell: (data) => ipcRenderer.invoke('plPty:runInShell', data),
    onData:      (cb)  => ipcRenderer.on('plPty:data',      (_e, p) => cb(p)),
    onLayerDone: (cb)  => ipcRenderer.on('plPty:layerDone', (_e, p) => cb(p)),
    offAll:      ()    => {
      ipcRenderer.removeAllListeners('plPty:data');
      ipcRenderer.removeAllListeners('plPty:layerDone');
    },
  },
  // Separate AI channel for the generate-workflows window.
  genWorkflowChat: {
    generate: (data) => ipcRenderer.invoke('genWorkflowChat:generate', data),
    cancel:   ()     => ipcRenderer.invoke('genWorkflowChat:cancel'),
    onToken:  (cb)   => ipcRenderer.on('genWorkflowChat:token', (_e, p) => cb(p)),
    onDone:   (cb)   => ipcRenderer.on('genWorkflowChat:done',  (_e, p) => cb(p)),
    offAll:   ()     => {
      ipcRenderer.removeAllListeners('genWorkflowChat:token');
      ipcRenderer.removeAllListeners('genWorkflowChat:done');
    },
  },
  // Separate AI channel for the test generation window.
  testGenChat: {
    generate: (data) => ipcRenderer.invoke('testGenChat:generate', data),
    cancel:   ()     => ipcRenderer.invoke('testGenChat:cancel'),
    onToken:  (cb)   => ipcRenderer.on('testGenChat:token', (_e, p) => cb(p)),
    onDone:   (cb)   => ipcRenderer.on('testGenChat:done',  (_e, p) => cb(p)),
    offAll:   ()     => {
      ipcRenderer.removeAllListeners('testGenChat:token');
      ipcRenderer.removeAllListeners('testGenChat:done');
    },
  },
  testGenerationWindow: {
    onFileSaved:    (cb) => ipcRenderer.on('testGen:fileSaved', (_e, p) => cb(p)),
    offFileSaved:   ()   => ipcRenderer.removeAllListeners('testGen:fileSaved'),
  },
  openTerminalWindow: (projectId) => ipcRenderer.invoke('app:openTerminalWindow', projectId),
  terminalWindow: {
    onInit: (cb) => ipcRenderer.on('terminal-win:init', (_e, p) => cb(p)),
  },
  workflowEvents: {
    onLayerStatusChanged: (cb) => ipcRenderer.on('workflow:layerStatusChanged', (_e, p) => cb(p)),
    onWorkflowsChanged:   (cb) => ipcRenderer.on('workflow:workflowsChanged',   (_e, p) => cb(p)),
    offAll: () => {
      ipcRenderer.removeAllListeners('workflow:layerStatusChanged');
      ipcRenderer.removeAllListeners('workflow:workflowsChanged');
    },
  },
});


contextBridge.exposeInMainWorld('ollama', {
  listModels: (host) => invoke('ollama:list-models', { host }),
});

contextBridge.exposeInMainWorld('agent', {
  checkInstalled: ()   => invoke('agent:checkInstalled'),
  install:        ()   => invoke('agent:install'),
  onInstallLog:   (cb) => ipcRenderer.on('agent:installLog', (_e, p) => cb(p)),
  offInstallLog:  ()   => ipcRenderer.removeAllListeners('agent:installLog'),
});

contextBridge.exposeInMainWorld('shell', {
  openDrawio: (data)              => invoke('shell:openDrawio', data),
  readFile:            (filepath)          => invoke('shell:readFile', filepath),
  writeFile:           (filepath, content) => invoke('shell:writeFile', { filepath, content }),
  statFile:            (filepath)          => invoke('shell:statFile', filepath),
  notifyTestFileSaved: ()                  => invoke('shell:notifyTestFileSaved'),
  openVSCode:     (folderPath) => invoke('shell:openVSCode', folderPath),
  openPowerShell: (folderPath) => invoke('shell:openPowerShell', folderPath),
  listFiles:      (dirPath, extensions) => invoke('shell:listFiles', { dirPath, extensions }),
});
