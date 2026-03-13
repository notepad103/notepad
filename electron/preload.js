const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notepad', {
  platform: process.platform,
  notes: {
    list: () => ipcRenderer.invoke('notes:list'),
    create: (payload) => ipcRenderer.invoke('notes:create', payload),
    update: (payload) => ipcRenderer.invoke('notes:update', payload),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
    storagePath: () => ipcRenderer.invoke('notes:storage-path')
  },
  sections: {
    list: () => ipcRenderer.invoke('sections:list'),
    create: (payload) => ipcRenderer.invoke('sections:create', payload),
    update: (payload) => ipcRenderer.invoke('sections:update', payload),
    delete: (id) => ipcRenderer.invoke('sections:delete', id)
  },
  showNotification: (opts) => ipcRenderer.invoke('show-notification', opts)
});
