const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe, limited version of ipcRenderer to the renderer process (your script.js)
contextBridge.exposeInMainWorld('electronAPI', {
  // Functions to send messages from renderer to main
  startDownload: () => ipcRenderer.send('start-download'),
  restartApp: () => ipcRenderer.send('restart-app'),
  checkForUpdate: () => ipcRenderer.send('check-for-update'),

  // Functions to listen for messages from main to renderer
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (event, ...args) => callback(...args)),
  onDownloadProgress: (callback) => ipcRenderer.on('download_progress', (event, ...args) => callback(...args)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (event, ...args) => callback(...args)),
  onUpdateError: (callback) => ipcRenderer.on('update_error', (event, ...args) => callback(...args)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update_not_available', (event, ...args) => callback(...args)),
});

