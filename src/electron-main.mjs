import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import { createTaxiServer } from './server.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let mainWindow;
let taxiServer;
let tray;
let shutdownStarted = false;
let isQuitting = false;
let updateService;

function createUpdateService() {
  const currentVersion = app.getVersion();
  let value = app.isPackaged && process.platform === 'win32'
    ? { state: 'idle', currentVersion, configured: true, detail: 'GitHub-Updatekanal ist bereit.' }
    : { state: 'manual', currentVersion, configured: false, detail: 'Updateprüfung ist nur in der installierten Windows-App aktiv.' };
  const set = (patch) => { value = { ...value, ...patch, currentVersion, updatedAt: new Date().toISOString() }; };

  if (app.isPackaged && process.platform === 'win32') {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => set({ state: 'checking', percent: 0, detail: 'GitHub Release wird geprüft.' }));
    autoUpdater.on('update-available', (info) => set({ state: 'downloading', percent: 0, releaseName: info?.version || null, detail: `Version ${info?.version || ''} wird heruntergeladen.`.replace(/\s+/g, ' ').trim() }));
    autoUpdater.on('update-not-available', (info) => set({ state: 'current', percent: 0, releaseName: info?.version || currentVersion, detail: 'Flight Deck EFB ist aktuell.' }));
    autoUpdater.on('download-progress', (progress) => set({ state: 'downloading', percent: Math.round(progress.percent || 0), detail: `Update wird heruntergeladen: ${Math.round(progress.percent || 0)} %` }));
    autoUpdater.on('update-downloaded', (info) => set({ state: 'downloaded', percent: 100, releaseName: info?.version || null, detail: `Version ${info?.version || ''} ist bereit. Neustart zum Installieren.`.replace(/\s+/g, ' ').trim() }));
    autoUpdater.on('error', (error) => set({ state: 'error', percent: 0, detail: `Update-Prüfung fehlgeschlagen: ${error.message}` }));
  }

  return {
    status: () => ({ ...value }),
    async check() {
      if (!app.isPackaged || process.platform !== 'win32') return { ...value };
      set({ state: 'checking', detail: 'GitHub Release wird geprüft.' });
      await autoUpdater.checkForUpdates();
      return { ...value };
    },
    async install() {
      if (value.state !== 'downloaded') throw new Error('Noch kein heruntergeladenes Update verfügbar.');
      set({ state: 'downloaded', detail: 'Flight Deck EFB wird neu gestartet und aktualisiert.' });
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 650);
      return { ...value };
    },
  };
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  if (tray) return;
  const source = nativeImage.createFromPath(fileURLToPath(new URL('../public/assets/app-icon-512.png', import.meta.url)));
  tray = new Tray(source.resize({ width: 20, height: 20 }));
  tray.setToolTip('Flight Deck EFB · Tablet host active');
  const rebuildMenu = () => {
    let startsWithWindows = false;
    try {
      startsWithWindows = Boolean(app.getLoginItemSettings().openAtLogin);
    } catch {
      // Portable builds can run before Windows has registered the executable.
    }
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Flight Deck EFB öffnen', click: showMainWindow },
      { label: 'Im Browser öffnen', click: () => shell.openExternal(taxiServer?.authenticatedLocalUrl || 'http://localhost/') },
      { type: 'separator' },
      {
        label: 'Mit Windows starten', type: 'checkbox', checked: startsWithWindows,
        click: (item) => {
          try {
            app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath });
          } catch (error) {
            dialog.showErrorBox('Flight Deck EFB', `Der Windows-Autostart konnte nicht geändert werden.\n\n${error.message}`);
          }
          rebuildMenu();
        },
      },
      { type: 'separator' },
      { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } },
    ]));
  };
  rebuildMenu();
  tray.on('click', showMainWindow);
}

async function createWindow() {
  const demo = process.env.SI_TAXI_DEMO === '1' || process.argv.includes('--demo');
  updateService ||= createUpdateService();
  taxiServer = await createTaxiServer({
    demo,
    mapCacheDirectory: path.join(app.getPath('userData'), 'maps'),
    flightStorageDirectory: path.join(app.getPath('userData'), 'flights'),
    automationStorageDirectory: path.join(app.getPath('userData'), 'automations'),
    accessStorageDirectory: path.join(app.getPath('userData'), 'access'),
    updateService,
  });
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#07121c',
    icon: fileURLToPath(new URL('../public/assets/app-icon-512.png', import.meta.url)),
    title: 'Flight Deck EFB',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin === new URL(taxiServer.localhostUrl).origin) return;
    } catch {
      // An invalid navigation is blocked below.
    }
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  try {
    await mainWindow.webContents.session.clearStorageData({
      storages: ['serviceworkers'],
    });
  } catch {
    // Versioned app assets still prevent mixed releases if storage cleanup is unavailable.
  }
  await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);
  createTray();
  setTimeout(() => updateService.check().catch(() => {}), 15_000);
}

app.setAppUserModelId('de.checkner.flightdeckefb');
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

app.on('second-instance', () => {
  showMainWindow();
});

app.whenReady().then(createWindow).catch((error) => {
  dialog.showErrorBox('Flight Deck EFB', `Die Anwendung konnte nicht gestartet werden.\n\n${error.message}`);
  app.quit();
});

app.on('window-all-closed', () => {
  // The local server stays active for iPad, Android and second-monitor access.
});

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  else showMainWindow();
});

app.on('before-quit', (event) => {
  isQuitting = true;
  if (!taxiServer || shutdownStarted) return;
  event.preventDefault();
  shutdownStarted = true;
  taxiServer.close().finally(() => {
    taxiServer = null;
    tray?.destroy();
    tray = null;
    app.quit();
  });
});
