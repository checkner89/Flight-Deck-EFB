'use strict';

const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const { open, Protocol } = require('node-simconnect');

const SIMCONNECT_RETRY_MS = 5000;

let mainWindow;
let simConnectHandle = null;
let simConnectPromise = null;
let simConnectRetryTimer = null;
let simConnectAttempt = 0;
let simConnectState = {
  status: 'disconnected',
  detail: 'MSFS noch nicht verbunden.',
  technicalDetail: null,
  applicationName: null,
  attempt: 0,
  retryAt: null
};

let updateState = {
  status: 'idle',
  detail: 'Updateprüfung noch nicht gestartet.',
  version: null,
  percent: null
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 880,
    minHeight: 640,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function publishSimConnectState(status, detail, extra = {}) {
  simConnectState = {
    ...simConnectState,
    status,
    detail,
    ...extra
  };
  sendToRenderer('simconnect:status', simConnectState);
  return simConnectState;
}

function publishUpdateState(status, detail, extra = {}) {
  updateState = {
    ...updateState,
    status,
    detail,
    ...extra
  };
  sendToRenderer('update:status', updateState);
  return updateState;
}

function errorText(error) {
  if (!error) return 'Unbekannter Fehler';
  if (typeof error === 'string') return error;
  return error.message || error.code || String(error);
}

function clearSimConnectRetry() {
  if (simConnectRetryTimer) {
    clearTimeout(simConnectRetryTimer);
    simConnectRetryTimer = null;
  }
}

function scheduleSimConnectRetry() {
  clearSimConnectRetry();
  const retryAt = Date.now() + SIMCONNECT_RETRY_MS;
  publishSimConnectState(simConnectState.status, simConnectState.detail, { retryAt });

  simConnectRetryTimer = setTimeout(() => {
    simConnectRetryTimer = null;
    connectSimConnect({ manual: false }).catch((error) => log.error('Automatic SimConnect retry failed', error));
  }, SIMCONNECT_RETRY_MS);
}

function attachSimConnectEvents(handle) {
  handle.on('quit', () => {
    log.info('Simulator quit');
    simConnectHandle = null;
    publishSimConnectState(
      'disconnected',
      'Microsoft Flight Simulator wurde beendet.',
      { technicalDetail: null, applicationName: null, retryAt: null }
    );
    scheduleSimConnectRetry();
  });

  handle.on('close', () => {
    log.warn('SimConnect connection closed');
    simConnectHandle = null;
    publishSimConnectState(
      'disconnected',
      'SimConnect-Verbindung wurde getrennt.',
      { technicalDetail: null, applicationName: null, retryAt: null }
    );
    scheduleSimConnectRetry();
  });

  handle.on('exception', (exception) => {
    // A SimConnect protocol exception does not necessarily mean that the
    // transport connection itself is gone. Keep the connection state intact
    // and expose the information only as a technical diagnostic.
    log.warn('SimConnect protocol exception', exception);
    publishSimConnectState(
      'connected',
      simConnectState.detail,
      { technicalDetail: `SimConnect-Protokollhinweis: ${errorText(exception?.exception || exception)}` }
    );
  });
}

async function connectSimConnect({ manual = false } = {}) {
  if (simConnectHandle) return simConnectState;
  if (simConnectPromise) return simConnectPromise;

  clearSimConnectRetry();
  simConnectAttempt += 1;

  publishSimConnectState(
    'connecting',
    manual
      ? 'SimConnect-Verbindung wird erneut aufgebaut …'
      : 'Suche nach Microsoft Flight Simulator …',
    {
      technicalDetail: null,
      attempt: simConnectAttempt,
      retryAt: null
    }
  );

  simConnectPromise = open('Flight Deck EFB', Protocol.KittyHawk)
    .then(({ recvOpen, handle }) => {
      simConnectHandle = handle;
      attachSimConnectEvents(handle);

      const applicationName = recvOpen?.applicationName || 'Microsoft Flight Simulator';
      log.info('Connected to SimConnect', recvOpen);

      return publishSimConnectState(
        'connected',
        'MSFS ist über SimConnect verbunden.',
        {
          technicalDetail: null,
          applicationName,
          retryAt: null
        }
      );
    })
    .catch((error) => {
      const technicalDetail = errorText(error);
      log.warn('Unable to connect to SimConnect', technicalDetail);
      simConnectHandle = null;

      publishSimConnectState(
        'disconnected',
        'MSFS nicht erreichbar. Starte den Simulator und lade einen Flug.',
        {
          technicalDetail,
          applicationName: null,
          retryAt: null
        }
      );
      scheduleSimConnectRetry();
      return simConnectState;
    })
    .finally(() => {
      simConnectPromise = null;
    });

  return simConnectPromise;
}

function configureAutoUpdater() {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    publishUpdateState('checking', 'Suche nach einer neuen Version …', { percent: null });
  });

  autoUpdater.on('update-available', (info) => {
    publishUpdateState('available', `Version ${info.version} wird heruntergeladen …`, {
      version: info.version,
      percent: 0
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    publishUpdateState('current', 'Flight Deck EFB ist aktuell.', {
      version: info?.version || app.getVersion(),
      percent: null
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    publishUpdateState('downloading', `Update wird heruntergeladen: ${Math.round(progress.percent)} %`, {
      percent: Math.round(progress.percent)
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    publishUpdateState('ready', `Version ${info.version} ist bereit zur Installation.`, {
      version: info.version,
      percent: 100
    });
  });

  autoUpdater.on('error', (error) => {
    log.error('Auto updater error', error);
    publishUpdateState('error', 'Updateprüfung fehlgeschlagen.', {
      technicalDetail: errorText(error),
      percent: null
    });
  });
}

function registerIpcHandlers() {
  ipcMain.handle('simconnect:get-status', () => simConnectState);
  ipcMain.handle('simconnect:retry', () => connectSimConnect({ manual: true }));

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('update:get-status', () => updateState);
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return publishUpdateState(
        'development',
        'Updateprüfung ist nur in der installierten App aktiv.'
      );
    }

    await autoUpdater.checkForUpdates();
    return updateState;
  });

  ipcMain.handle('update:install', () => {
    if (updateState.status !== 'ready') {
      return { ok: false, reason: 'no-update-ready' };
    }

    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  });
}

app.whenReady().then(async () => {
  configureAutoUpdater();
  registerIpcHandlers();
  createWindow();

  await connectSimConnect();

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((error) => log.error('Initial update check failed', error));
  }
});

app.on('before-quit', () => {
  clearSimConnectRetry();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
