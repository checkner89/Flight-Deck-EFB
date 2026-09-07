import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/electron-main.mjs', (source) => {
  let next = source;

  if (!next.includes('let updateInstallPending = false;')) {
    const anchor = 'let updateService;';
    if (!next.includes(anchor)) throw new Error('1.23.2 update persistence anchor missing: update service state');
    next = next.replace(anchor, `${anchor}\nlet updateInstallPending = false;`);
  }

  // A failed update check does not leave a valid UpdateInfoAndProvider behind. Calling
  // downloadUpdate() from the generic error state only turns the original failure into a
  // second, misleading updater error. Require a positively detected release instead.
  next = next.replace(
    "      if (!['available', 'error'].includes(value.state)) return { ...value };",
    "      if (value.state !== 'available') return { ...value };",
  );

  if (!next.includes("const BROWSER_STATE_BACKUP_FILE = 'browser-state-backup.json';")) {
    const anchor = 'function createUpdateService() {';
    if (!next.includes(anchor)) throw new Error('1.23.2 update persistence anchor missing: update service');
    next = next.replace(anchor, `const BROWSER_STATE_BACKUP_FILE = 'browser-state-backup.json';
const BROWSER_STATE_BACKUP_VERSION = 1;
const TRANSIENT_BROWSER_STORAGE_KEYS = new Set(['si-taxi-token']);

function browserStateBackupPath() {
  return path.join(app.getPath('userData'), BROWSER_STATE_BACKUP_FILE);
}

async function persistBrowserStateSnapshot({ reason = 'shutdown', restoreAll = false } = {}) {
  const window = mainWindow;
  if (!window || window.isDestroyed()) return false;
  try {
    const values = await window.webContents.executeJavaScript(\`(() => {
      const values = {};
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key || key === 'si-taxi-token') continue;
        values[key] = localStorage.getItem(key);
      }
      return values;
    })()\`, true);
    if (!values || typeof values !== 'object') return false;
    await window.webContents.session.flushStorageData();
    const target = browserStateBackupPath();
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, JSON.stringify({
      version: BROWSER_STATE_BACKUP_VERSION,
      capturedAt: new Date().toISOString(),
      appVersion: app.getVersion(),
      reason,
      restoreAll: Boolean(restoreAll),
      values,
    }), 'utf8');
    return true;
  } catch (error) {
    console.warn('[Flight Deck EFB] Browser state snapshot failed:', error?.message || error);
    return false;
  }
}

async function restoreBrowserStateSnapshot(window) {
  if (!window || window.isDestroyed()) return false;
  let payload;
  const target = browserStateBackupPath();
  try {
    payload = JSON.parse(await fs.readFile(target, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('[Flight Deck EFB] Browser state backup could not be read:', error?.message || error);
    return false;
  }
  if (payload?.version !== BROWSER_STATE_BACKUP_VERSION || !payload.values || typeof payload.values !== 'object') return false;
  const values = Object.fromEntries(Object.entries(payload.values)
    .filter(([key, value]) => !TRANSIENT_BROWSER_STORAGE_KEYS.has(key) && typeof value === 'string'));
  if (!Object.keys(values).length) return false;
  const restoreAll = payload.restoreAll === true;
  try {
    const changed = await window.webContents.executeJavaScript(\`(() => {
      const snapshot = \${JSON.stringify(values)};
      const restoreAll = \${JSON.stringify(restoreAll)};
      let changed = 0;
      for (const [key, value] of Object.entries(snapshot)) {
        const current = localStorage.getItem(key);
        if ((restoreAll && current !== value) || (!restoreAll && current === null)) {
          localStorage.setItem(key, value);
          changed += 1;
        }
      }
      return changed;
    })()\`, true);
    if (restoreAll) {
      await fs.writeFile(target, JSON.stringify({ ...payload, restoreAll: false, restoredAt: new Date().toISOString() }), 'utf8');
    }
    return Number(changed) > 0;
  } catch (error) {
    console.warn('[Flight Deck EFB] Browser state restore failed:', error?.message || error);
    return false;
  }
}

${anchor}`);
  }

  if (!next.includes("persistBrowserStateSnapshot({ reason: 'update', restoreAll: true })")) {
    const anchor = "      set({ state: 'downloaded', detail: 'Flight Deck EFB wird neu gestartet und aktualisiert.' });\n      setTimeout(() => autoUpdater.quitAndInstall(false, true), 650);";
    if (!next.includes(anchor)) throw new Error('1.23.2 update persistence anchor missing: updater install');
    next = next.replace(anchor, "      set({ state: 'downloaded', detail: 'Flight Deck EFB wird neu gestartet und aktualisiert.' });\n      const updateSnapshotPersisted = await persistBrowserStateSnapshot({ reason: 'update', restoreAll: true });\n      updateInstallPending = updateSnapshotPersisted;\n      setTimeout(() => autoUpdater.quitAndInstall(false, true), 650);");
  } else if (!next.includes('updateInstallPending = updateSnapshotPersisted;')) {
    const anchor = "      await persistBrowserStateSnapshot({ reason: 'update', restoreAll: true });\n      setTimeout(() => autoUpdater.quitAndInstall(false, true), 650);";
    if (!next.includes(anchor)) throw new Error('1.23.2 update persistence anchor missing: existing updater snapshot');
    next = next.replace(anchor, "      const updateSnapshotPersisted = await persistBrowserStateSnapshot({ reason: 'update', restoreAll: true });\n      updateInstallPending = updateSnapshotPersisted;\n      setTimeout(() => autoUpdater.quitAndInstall(false, true), 650);");
  }

  if (!next.includes('const browserStateRestored = await restoreBrowserStateSnapshot(mainWindow);')) {
    const anchor = '  await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);\n  mainWindow.maximize();';
    if (!next.includes(anchor)) throw new Error('1.23.2 update persistence anchor missing: first window load');
    next = next.replace(anchor, "  await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);\n  const browserStateRestored = await restoreBrowserStateSnapshot(mainWindow);\n  if (browserStateRestored) await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);\n  await persistBrowserStateSnapshot({ reason: 'startup-migration', restoreAll: false });\n  mainWindow.maximize();");
  } else if (!next.includes("persistBrowserStateSnapshot({ reason: 'startup-migration', restoreAll: false })")) {
    const anchor = '  if (browserStateRestored) await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);';
    if (!next.includes(anchor)) throw new Error('1.23.2 update persistence anchor missing: restored renderer reload');
    next = next.replace(anchor, `${anchor}\n  await persistBrowserStateSnapshot({ reason: 'startup-migration', restoreAll: false });`);
  }

  if (!next.includes("persistBrowserStateSnapshot({ reason: 'shutdown', restoreAll: false })")) {
    const anchor = "  shutdownStarted = true;\n  taxiServer.close().finally(() => {\n    taxiServer = null;\n    tray?.destroy();\n    tray = null;\n    app.quit();\n  });";
    if (!next.includes(anchor)) throw new Error('1.23.2 update persistence anchor missing: shutdown');
    next = next.replace(anchor, "  shutdownStarted = true;\n  Promise.resolve()\n    .then(() => updateInstallPending ? true : persistBrowserStateSnapshot({ reason: 'shutdown', restoreAll: false }))\n    .catch(() => false)\n    .then(() => taxiServer.close())\n    .finally(() => {\n      taxiServer = null;\n      tray?.destroy();\n      tray = null;\n      app.quit();\n    });");
  } else {
    next = next.replace(
      ".then(() => persistBrowserStateSnapshot({ reason: 'shutdown', restoreAll: false }))",
      ".then(() => updateInstallPending ? true : persistBrowserStateSnapshot({ reason: 'shutdown', restoreAll: false }))",
    );
  }

  if (!next.includes("if (value.state !== 'available') return { ...value };")) {
    throw new Error('Updater download guard still allows a non-available state.');
  }
  if (!next.includes('updateInstallPending = updateSnapshotPersisted;')) {
    throw new Error('Update-install snapshot is not marked as pending.');
  }
  if (!next.includes("updateInstallPending ? true : persistBrowserStateSnapshot({ reason: 'shutdown', restoreAll: false })")) {
    throw new Error('Normal shutdown can still overwrite the update restore snapshot.');
  }

  return next;
});

console.log('Flight Deck EFB update-safe browser state persistence materialized.');
