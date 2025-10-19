const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// --- Configure Logging ---
// This sets up a log file so you can debug the updater on an employee's computer.
log.transports.file.resolvePath = () => path.join(app.getPath('userData'), 'logs/main.log');
log.info('App starting...');

// --- Auto-Updater Configuration ---
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // We will trigger the download manually after the user confirms.

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // This preload script is the secure bridge between this file (main process)
      // and your script.js file (renderer process).
      preload: path.join(__dirname, 'preload.js'),
    }
  });
  mainWindow.loadFile('index.html');
};

// This method is called when Electron has finished initialization.
app.whenReady().then(() => {
  createWindow();

  log.info('Checking for updates on startup...');
  autoUpdater.checkForUpdates();

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
// These events are triggered by the autoUpdater and send messages to your UI.

autoUpdater.on('update-available', (info) => {
  log.info('Update available.', info);
  // Send a message to the renderer process (your script.js) to show the update prompt.
  mainWindow.webContents.send('update_available', info);
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.', info);
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err);
  mainWindow.webContents.send('update_error', err);
});

autoUpdater.on('download-progress', (progressObj) => {
  const log_message = `Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}% (${progressObj.transferred}/${progressObj.total})`;
  log.info(log_message);
  // Send the progress details to the renderer process to update the progress bar.
  mainWindow.webContents.send('download_progress', progressObj);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded.', info);
  // Tell the renderer process that the update is ready to be installed.
  mainWindow.webContents.send('update_downloaded');
});

// --- IPC Handlers from Renderer ---
// These events listen for messages sent from your script.js file.

// Triggered when the user clicks "Yes" on the update prompt.
ipcMain.on('start-download', () => {
  log.info('User confirmed download. Starting download...');
  autoUpdater.downloadUpdate();
});

// Triggered when the user clicks the "Restart & Install" button.
ipcMain.on('restart-app', () => {
  log.info('User requested restart. Quitting and installing update...');
  autoUpdater.quitAndInstall();
});

