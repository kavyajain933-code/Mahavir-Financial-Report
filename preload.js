const { contextBridge, ipcRenderer } = require('electron');

// Expose a secure, limited API to the renderer process (your script.js)
// This is the modern and recommended way to handle communication in Electron.
contextBridge.exposeInMainWorld('electronAPI', {
  // --- Functions to receive messages from the main process ---

  // Listens for the 'update_available' message from main.js
  onUpdateAvailable: (callback) => ipcRenderer.on('update_available', (event, ...args) => callback(...args)),
  
  // Listens for 'download_progress' messages to update the progress bar
  onDownloadProgress: (callback) => ipcRenderer.on('download_progress', (event, ...args) => callback(...args)),

  // Listens for the 'update_downloaded' message when the download is complete
  onUpdateDownloaded: (callback) => ipcRenderer.on('update_downloaded', (event, ...args) => callback(...args)),

  // Listens for any errors during the update process
  onUpdateError: (callback) => ipcRenderer.on('update_error', (event, ...args) => callback(...args)),

  // --- Functions to send messages to the main process ---

  // Sends a message to start the download when the user clicks "Yes"
  startDownload: () => ipcRenderer.send('start-download'),

  // Sends a message to restart the app when the user clicks "Restart & Install"
  restartApp: () => ipcRenderer.send('restart-app'),
});

