// Exposes a minimal read-only filesystem bridge to the renderer. The main
// process restricts every call to the two Claude data roots, so the page can
// auto-load usage data without pickers but cannot read anything else.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('clauditorFS', {
  paths: () => ipcRenderer.invoke('clauditor:paths'),
  list: (dirPath) => ipcRenderer.invoke('clauditor:list', dirPath),
  read: (filePath) => ipcRenderer.invoke('clauditor:read', filePath),
})
