const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// --- Configure Logging ---
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs/main.log');
log.info('App starting...');

// --- Auto-Updater Configuration ---
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // We will trigger download manually

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    fullscreen: true, // <-- THIS LINE MAKES THE APP FULLSCREEN
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  });

  // Load the index.html of the app.
  mainWindow.loadFile('index.html');

  // --- THIS IS THE NEW LINE TO REMOVE THE MENU BAR ---
  mainWindow.setMenu(null);
};

app.whenReady().then(() => {
  createWindow();

  log.info('Initial check for updates on startup...');
  autoUpdater.checkForUpdates();

  // Check for updates every hour
  setInterval(() => {
    log.info('Periodic check for updates...');
    autoUpdater.checkForUpdates();
  }, 3600000);

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

// --- Auto-Updater Event Handlers ---
autoUpdater.on('update-available', (info) => {
  log.info('Update available.', info);
  mainWindow.webContents.send('update_available', info);
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.', info);
  mainWindow.webContents.send('update_not_available');
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err);
  mainWindow.webContents.send('update_error', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  log.info(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
  mainWindow.webContents.send('download_progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded.', info);
  mainWindow.webContents.send('update_downloaded');
});

// --- IPC Handlers from Renderer ---
ipcMain.on('start-download', () => {
  log.info('User confirmed, starting download...');
  autoUpdater.downloadUpdate();
});

ipcMain.on('restart-app', () => {
  log.info('User requested restart. Quitting and installing...');
  autoUpdater.quitAndInstall();
});

ipcMain.on('check-for-update', () => {
    log.info('User manually triggered an update check...');
    autoUpdater.checkForUpdates();
});

