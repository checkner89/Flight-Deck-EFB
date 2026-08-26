import { app, BrowserWindow, dialog, Menu, nativeImage, screen, shell, Tray } from 'electron';
import updaterPackage from 'electron-updater';
import { createTaxiServer } from './server.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { autoUpdater } = updaterPackage;

let mainWindow;
let taxiServer;
let tray;
let shutdownStarted = false;
let isQuitting = false;
let updateService;

function decodeReleaseEntities(value = '') {
  return String(value)
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      return Number.isInteger(value) && value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : _;
    });
}

function normalizeReleaseNotes(value) {
  const source = typeof value === 'string'
    ? value
    : Array.isArray(value)
      ? value.map((entry) => typeof entry === 'string' ? entry : entry?.note || '').filter(Boolean).join('\n')
      : '';
  if (!source) return '';
  return decodeReleaseEntities(source
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(?:ul|ol)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    .replace(/<h([1-6])[^>]*>/gi, (_, level) => `\n${'#'.repeat(Math.min(4, Number(level) || 2))} `)
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 12000);
}

async function fetchGitHubReleaseNotes(version) {
  const normalized = String(version || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) return '';
  try {
    const response = await fetch(`https://api.github.com/repos/checkner89/Flight-Deck-EFB/releases/tags/v${normalized}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Flight-Deck-EFB-Updater' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return '';
    const body = await response.json();
    return normalizeReleaseNotes(body?.body || '');
  } catch {
    return '';
  }
}

function createUpdateService() {
  const currentVersion = app.getVersion();
  let value = app.isPackaged && process.platform === 'win32'
    ? { state: 'idle', currentVersion, configured: true, detail: 'GitHub-Updatekanal ist bereit.' }
    : { state: 'manual', currentVersion, configured: false, detail: 'Updateprüfung ist nur in der installierten Windows-App aktiv.' };
  const set = (patch) => { value = { ...value, ...patch, currentVersion, updatedAt: new Date().toISOString() }; };

  if (app.isPackaged && process.platform === 'win32') {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('checking-for-update', () => set({ state: 'checking', percent: 0, detail: 'GitHub Release wird geprüft.' }));
    autoUpdater.on('update-available', (info) => {
      const releaseName = info?.version || null;
      const releaseNotes = normalizeReleaseNotes(info?.releaseNotes);
      set({ state: 'available', percent: 0, releaseName, releaseNotes, detail: `Version ${releaseName || ''} ist verfügbar.`.replace(/\s+/g, ' ').trim() });
      if (!releaseNotes && releaseName) fetchGitHubReleaseNotes(releaseName).then((notes) => {
        if (notes && value.releaseName === releaseName) set({ releaseNotes: notes });
      });
    });
    autoUpdater.on('update-not-available', (info) => set({ state: 'current', percent: 0, releaseName: info?.version || currentVersion, detail: 'Flight Deck EFB ist aktuell.' }));
    autoUpdater.on('download-progress', (progress) => set({ state: 'downloading', percent: Math.round(progress.percent || 0), detail: `Update wird heruntergeladen: ${Math.round(progress.percent || 0)} %` }));
    autoUpdater.on('update-downloaded', (info) => set({ state: 'downloaded', percent: 100, releaseName: info?.version || null, releaseNotes: normalizeReleaseNotes(info?.releaseNotes) || value.releaseNotes || '', detail: `Version ${info?.version || ''} ist bereit. Neustart zum Installieren.`.replace(/\s+/g, ' ').trim() }));
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
    async download() {
      if (!app.isPackaged || process.platform !== 'win32') return { ...value };
      if (!['available', 'error'].includes(value.state)) return { ...value };
      set({ state: 'downloading', percent: 0, detail: 'Update wird heruntergeladen.' });
      await autoUpdater.downloadUpdate();
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

async function clearDirectoryContents(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { directory, removed: 0, skipped: true, failures: [] };
    return { directory, removed: 0, skipped: false, failures: [error.message] };
  }
  let removed = 0;
  const failures = [];
  for (const entry of entries) {
    try {
      await fs.rm(path.join(directory, entry.name), { recursive: true, force: true, maxRetries: 2, retryDelay: 120 });
      removed += 1;
    } catch (error) {
      failures.push(`${entry.name}: ${error.message}`);
    }
  }
  return { directory, removed, skipped: false, failures };
}

async function clearMsfsGraphicsCaches() {
  if (process.platform !== 'win32') {
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'MSFS 2024 Grafikcache',
      message: 'Dieses Wartungstool ist nur unter Windows verfügbar.',
    });
    return;
  }
  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'MSFS 2024 Grafik-/Shadercache leeren',
    message: 'Microsoft Flight Simulator 2024 sollte vollständig geschlossen sein.',
    detail: 'Flight Deck leert NVIDIA GLCache, DXCache, ComputeCache und den Windows D3DSCache. Der MSFS-Rolling-Cache und deine Simulator-Einstellungen bleiben unangetastet. Einige aktuell gesperrte Dateien können übersprungen werden.',
    buttons: ['ABBRECHEN', 'CACHE LEEREN'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  if (confirmation.response !== 1) return;

  const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  const roamingAppData = process.env.APPDATA || path.join(app.getPath('home'), 'AppData', 'Roaming');
  const targets = [
    path.join(localAppData, 'NVIDIA', 'GLCache'),
    path.join(localAppData, 'NVIDIA', 'DXCache'),
    path.join(roamingAppData, 'NVIDIA', 'ComputeCache'),
    path.join(localAppData, 'D3DSCache'),
  ];
  const results = await Promise.all(targets.map(clearDirectoryContents));
  const removed = results.reduce((sum, result) => sum + result.removed, 0);
  const failures = results.flatMap((result) => result.failures);
  await dialog.showMessageBox(mainWindow, {
    type: failures.length ? 'warning' : 'info',
    title: 'MSFS 2024 Grafikcache',
    message: failures.length ? 'Cache wurde teilweise geleert.' : 'Grafik-/Shadercache wurde geleert.',
    detail: failures.length
      ? `${removed} Cache-Einträge entfernt. ${failures.length} Eintrag/Einträge waren gesperrt oder konnten nicht gelöscht werden. Starte Windows bei Bedarf neu und versuche es erneut.`
      : `${removed} Cache-Einträge entfernt. Beim nächsten Start bauen Windows/NVIDIA die benötigten Shaderdaten neu auf.`,
  });
}

function handleFlightDeckAction(url) {
  const normalized = String(url || '').replace(/\/$/, '');
  if (normalized === 'flightdeck://clear-msfs-cache') {
    clearMsfsGraphicsCaches().catch((error) => dialog.showErrorBox('Flight Deck EFB', `Der Grafikcache konnte nicht geleert werden.\n\n${error.message}`));
    return true;
  }
  return false;
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
    msfsEfbBuilderStorageDirectory: path.join(app.getPath('userData'), 'msfs-efb-builder'),
    updateService,
  });
  const { workAreaSize } = screen.getPrimaryDisplay();
  const initialWidth = Math.min(workAreaSize.width, Math.max(1320, Math.round(workAreaSize.width * 0.96)));
  const initialHeight = Math.min(workAreaSize.height, Math.max(820, Math.round(workAreaSize.height * 0.94)));
  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: 1180,
    minHeight: 720,
    show: false,
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
    if (handleFlightDeckAction(url)) return { action: 'deny' };
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (handleFlightDeckAction(url)) {
      event.preventDefault();
      return;
    }
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
  mainWindow.maximize();
  mainWindow.show();
  mainWindow.focus();
  createTray();
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
