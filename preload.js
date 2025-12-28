const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // --- UPDATER COMMANDS ---
  // These allow buttons in your UI to trigger system actions
  startDownload: () => ipcRenderer.send('start-download'),
  restartApp: () => ipcRenderer.send('restart-app'),
  checkForUpdate: () => ipcRenderer.send('check-for-update'),

  // --- NEW: VERSION CHECK ---
  // This asks main.js "What version is this?"
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // --- LISTENERS ---
  // These let the UI know when the system has news (like "Update Found!")
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (event, ...args) => callback(...args)),
  onDownloadProgress: (callback) => ipcRenderer.on('download_progress', (event, ...args) => callback(...args)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (event, ...args) => callback(...args)),
  onUpdateError: (callback) => ipcRenderer.on('update_error', (event, ...args) => callback(...args)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update_not_available', (event, ...args) => callback(...args)),
});