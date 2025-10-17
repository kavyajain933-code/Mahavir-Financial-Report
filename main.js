const { app, BrowserWindow } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater'); // <-- ADD THIS LINE

// Function to create the main browser window.
const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // It's good practice to preload scripts, but for simplicity, we'll skip this.
      // For your app to work correctly, this is fine.
    }
  });

  // Load your index.html file into the window.
  win.loadFile('index.html');
};

// This method is called when Electron has finished initialization.
app.whenReady().then(() => {
  createWindow();

  autoUpdater.checkForUpdatesAndNotify(); // <-- ADD THIS LINE

  // Handle macOS behavior (optional, but good practice).
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit the app when all windows are closed (except on macOS).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
