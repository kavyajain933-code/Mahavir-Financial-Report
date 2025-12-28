const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const isDev = !app.isPackaged;

// --- SETUP AUTO UPDATER ---
// This tells the updater to log what it's doing to a file named 'main.log'
const log = require('electron-log');
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Security: Keep true context isolation
      contextIsolation: true, // Security: Protect the app
    },
    // Icon for the window (optional, looks for icon.ico in root)
    icon: path.join(__dirname, 'icon.ico') 
  });

  mainWindow.loadFile('index.html');

  // Open DevTools only if in development mode
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }

  // Check for updates once the window is ready
  mainWindow.once('ready-to-show', () => {
    // Only check for updates in the installed version (not npm start)
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- UPDATE EVENT LISTENERS ---
// These send messages from the "Invisible Engine" to your "Visible Screen"

// 1. Update Found
autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('update_available', info);
});

// 2. Update Not Found (or user is on latest)
autoUpdater.on('update-not-available', (info) => {
  mainWindow.webContents.send('update_not_available', info);
});

// 3. Error
autoUpdater.on('error', (err) => {
  mainWindow.webContents.send('update_error', err.toString());
});

// 4. Progress (Moving the blue bar)
autoUpdater.on('download-progress', (progressObj) => {
  mainWindow.webContents.send('download_progress', progressObj);
});

// 5. Download Complete (Ready to install)
autoUpdater.on('update-downloaded', (info) => {
  mainWindow.webContents.send('update_downloaded', info);
});

// --- IPC HANDLERS (The Bridge Controls) ---

// Trigger a manual check when user clicks button in Settings
ipcMain.on('check-for-update', () => {
    if (!isDev) {
        autoUpdater.checkForUpdates();
    } else {
        // Mock response for dev mode so button does something
        mainWindow.webContents.send('update_not_available', { version: 'Dev' });
    }
});

// Start downloading (if auto-download didn't happen)
ipcMain.on('start-download', () => {
    autoUpdater.downloadUpdate();
});

// Restart the app to install the new version
ipcMain.on('restart-app', () => {
    autoUpdater.quitAndInstall();
});

// --- NEW: VERSION HANDLER ---
// This answers the question: "What version am I?"
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});