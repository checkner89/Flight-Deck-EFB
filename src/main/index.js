'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const { SimConnectClient, Protocol } = require('node-simconnect');

let mainWindow;
let simConnectClient = null;
let simConnectState = {
  status: 'disconnected',
  detail: 'Noch nicht verbunden'
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#08111f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.send('app:version', app.getVersion());
    mainWindow.webContents.send('simconnect:status', simConnectState);
  });
}

function publishSimConnectState(status, detail) {
  simConnectState = { status, detail };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('simconnect:status', simConnectState);
  }
}

async function connectSimConnect() {
  if (simConnectClient) return;

  publishSimConnectState('connecting', 'Verbindung zu Microsoft Flight Simulator wird aufgebaut …');

  try {
    const client = new SimConnectClient('Flight Deck EFB', Protocol.KittyHawk);
    simConnectClient = client;

    client.on('open', () => {
      publishSimConnectState('connected', 'MSFS über SimConnect verbunden');
    });

    client.on('quit', () => {
      simConnectClient = null;
      publishSimConnectState('disconnected', 'MSFS wurde beendet');
    });

    client.on('exception', (exception) => {
      log.warn('SimConnect exception', exception);
      publishSimConnectState('error', `SimConnect-Fehler: ${exception?.exception ?? 'unbekannt'}`);
    });

    client.on('error', (error) => {
      log.error('SimConnect error', error);
      simConnectClient = null;
      publishSimConnectState('error', error?.message || 'SimConnect-Verbindung fehlgeschlagen');
    });

    await client.connect();
  } catch (error) {
    log.error('Unable to connect to SimConnect', error);
    simConnectClient = null;
    publishSimConnectState('error', error?.message || 'SimConnect-Verbindung fehlgeschlagen');
  }
}

function configureAutoUpdater() {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update:status', { status: 'checking', detail: 'Suche nach Updates …' });
  });

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update:status', {
      status: 'available',
      detail: `Version ${info.version} wird heruntergeladen …`
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update:status', { status: 'current', detail: 'Flight Deck EFB ist aktuell.' });
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update:status', {
      status: 'downloading',
      detail: `Update ${Math.round(progress.percent)} %`
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update:status', {
      status: 'ready',
      detail: `Version ${info.version} ist bereit. Installation beim Beenden.`
    });
  });

  autoUpdater.on('error', (error) => {
    log.error('Auto updater error', error);
    mainWindow?.webContents.send('update:status', {
      status: 'error',
      detail: error?.message || 'Updateprüfung fehlgeschlagen'
    });
  });
}

app.whenReady().then(async () => {
  configureAutoUpdater();
  createWindow();

  ipcMain.handle('simconnect:retry', async () => {
    await connectSimConnect();
    return simConnectState;
  });

  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return { status: 'development', detail: 'Updateprüfung ist nur in der installierten App aktiv.' };
    }
    return autoUpdater.checkForUpdates();
  });

  await connectSimConnect();

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((error) => log.error(error));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
