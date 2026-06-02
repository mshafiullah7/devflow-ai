'use strict';

const { autoUpdater } = require('electron-updater');
const { dialog, BrowserWindow } = require('electron');
const { logError } = require('./logger');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  autoUpdater.on('error', (err) => {
    logError('autoUpdater', err);
  });

  autoUpdater.on('update-available', (info) => {
    const win = BrowserWindow.getFocusedWindow();
    dialog.showMessageBox(win, {
      type: 'info',
      title: 'Update Available',
      message: `DevFlow AI ${info.version} is available.`,
      detail: info.releaseNotes
        ? `What's new:\n${info.releaseNotes}`
        : 'A new version is ready to download.',
      buttons: ['Download Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-not-available', () => {
    // Silent — no popup needed for routine background checks
  });

  autoUpdater.on('download-progress', (progress) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.setProgressBar(progress.percent / 100);
      win.setTitle(`Downloading update… ${Math.round(progress.percent)}%`);
    }
  });

  autoUpdater.on('update-downloaded', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.setProgressBar(-1);
      win.setTitle('DevFlow AI');
    }
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded.',
      detail: 'Restart DevFlow AI now to apply the update, or it will install automatically on next launch.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  // Check on startup (after a short delay so the window is visible)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => logError('autoUpdater:check', err));
  }, 5000);
}

module.exports = { setupAutoUpdater };
