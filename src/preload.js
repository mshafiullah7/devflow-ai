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
    list:   (user_story_id) => invoke('db:prompt_history:list', user_story_id),
    create: (data)          => invoke('db:prompt_history:create', data),
  },
  dialog: {
    openFolder: () => invoke('dialog:openFolder'),
  },
  terminal: {
    homedir:     ()     => invoke('terminal:homedir'),
    exec:        (data) => invoke('terminal:exec', data),
    execStart:   (data) => invoke('terminal:exec-start', data),
    killActive:  ()     => invoke('terminal:kill-active'),
    onData: (cb) => ipcRenderer.on('terminal:data', (_e, p) => cb(p)),
    onDone: (cb) => ipcRenderer.on('terminal:done', (_e, p) => cb(p)),
    removeListeners: () => {
      ipcRenderer.removeAllListeners('terminal:data');
      ipcRenderer.removeAllListeners('terminal:done');
    },
  },
});
