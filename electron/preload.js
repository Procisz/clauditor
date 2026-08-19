const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('clauditorFS', {
  paths: () => ipcRenderer.invoke('clauditor:paths'),
  list: (dirPath) => ipcRenderer.invoke('clauditor:list', dirPath),
  read: (filePath) => ipcRenderer.invoke('clauditor:read', filePath),
})
