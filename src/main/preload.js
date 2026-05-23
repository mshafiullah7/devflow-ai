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
  features: {
    list:   (project_id) => invoke('db:features:list', project_id),
    get:    (id)         => invoke('db:features:get', id),
    create: (data)       => invoke('db:features:create', data),
    update: (data)       => invoke('db:features:update', data),
    delete: (id)         => invoke('db:features:delete', id),
  },
  userStories: {
    list:   (filters) => invoke('db:user_stories:list', filters),
    get:    (id)      => invoke('db:user_stories:get', id),
    create: (data)    => invoke('db:user_stories:create', data),
    update: (data)    => invoke('db:user_stories:update', data),
    delete: (id)      => invoke('db:user_stories:delete', id),
  },
  promptHistory: {
    list:      (user_story_id) => invoke('db:prompt_history:list', user_story_id),
    create:    (data)          => invoke('db:prompt_history:create', data),
    delete:    (id)            => invoke('db:prompt_history:delete', id),
    deleteAll: (user_story_id) => invoke('db:prompt_history:deleteAll', user_story_id),
  },
  prompts: {
    list:   (user_story_id) => invoke('db:prompts:list', user_story_id),
    create: (data)          => invoke('db:prompts:create', data),
    update: (data)          => invoke('db:prompts:update', data),
    delete: (id)            => invoke('db:prompts:delete', id),
  },
  acceptanceCriteria: {
    list:   (user_story_id) => invoke('db:acceptance_criteria:list', user_story_id),
    create: (data)          => invoke('db:acceptance_criteria:create', data),
    update: (data)          => invoke('db:acceptance_criteria:update', data),
    delete: (id)            => invoke('db:acceptance_criteria:delete', id),
  },
  documentTemplates: {
    list: () => invoke('db:document_templates:list'),
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
  screenDesigns: {
    list:   (project_id) => invoke('db:screen_designs:list', project_id),
    get:    (id)         => invoke('db:screen_designs:get', id),
    create: (data)       => invoke('db:screen_designs:create', data),
    update: (data)       => invoke('db:screen_designs:update', data),
    delete: (id)         => invoke('db:screen_designs:delete', id),
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
  agentCliPath:     () => invoke('app:agent-cli-path'),
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
  exportPdf:        (data)        => invoke('app:export-pdf', data),
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
});


contextBridge.exposeInMainWorld('ollama', {
  listModels: (host) => invoke('ollama:list-models', { host }),
});

contextBridge.exposeInMainWorld('shell', {
  openDrawio: (data)              => invoke('shell:openDrawio', data),
  readFile:   (filepath)          => invoke('shell:readFile', filepath),
  writeFile:  (filepath, content) => invoke('shell:writeFile', { filepath, content }),
  statFile:   (filepath)          => invoke('shell:statFile', filepath),
  openVSCode: (folderPath)        => invoke('shell:openVSCode', folderPath),
});
