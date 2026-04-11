// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

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
    open:   (id)     => invoke('db:projects:open', id),
    recent: ()       => invoke('db:projects:recent'),
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
  dialog: {
    openFolder:   () => invoke('dialog:openFolder'),
    openJsonFile: () => invoke('dialog:openJsonFile'),
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
  ollama: {
    listModels: (opts)              => invoke('ollama:list-models', opts || {}),
    chat:       (opts)              => invoke('ollama:chat', opts),
    cancel:     ()                  => invoke('ollama:cancel'),
    onToken:    (cb) => ipcRenderer.on('ollama:token', (_e, p) => cb(p)),
    onDone:     (cb) => ipcRenderer.on('ollama:done',  (_e, p) => cb(p)),
    onError:    (cb) => ipcRenderer.on('ollama:error', (_e, p) => cb(p)),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('ollama:token');
      ipcRenderer.removeAllListeners('ollama:done');
      ipcRenderer.removeAllListeners('ollama:error');
    },
  },
});

contextBridge.exposeInMainWorld('app', {
  agentCliPath: () => invoke('app:agent-cli-path'),
});

contextBridge.exposeInMainWorld('shell', {
  openDrawio: (data)     => invoke('shell:openDrawio', data),
  readFile:   (filepath) => invoke('shell:readFile', filepath),
});
