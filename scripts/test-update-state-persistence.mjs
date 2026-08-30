import fs from 'node:fs/promises';

const [pkgSource, electronMain, materializer] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('scripts/apply-feature-1.23.2-update-persistence.mjs', 'utf8'),
]);
const pkg = JSON.parse(pkgSource);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };

need(pkg.scripts['prepare:release'] || '', 'apply-feature-1.23.2-update-persistence.mjs', 'Update persistence materializer is not wired into prepare:release.');
need(electronMain, "const BROWSER_STATE_BACKUP_FILE = 'browser-state-backup.json';", 'Browser state backup path is missing.');
need(electronMain, "app.getPath('userData')", 'Browser state backup is not stored in update-safe userData.');
need(electronMain, 'window.webContents.session.flushStorageData()', 'Chromium storage is not flushed before persistence.');
need(electronMain, "persistBrowserStateSnapshot({ reason: 'update', restoreAll: true })", 'Updater does not snapshot current browser state before install.');
need(electronMain, 'restoreBrowserStateSnapshot(mainWindow)', 'Browser state is not restored on startup.');
need(electronMain, 'if (browserStateRestored) await mainWindow.loadURL', 'Renderer is not reloaded after restoring state.');
need(electronMain, "persistBrowserStateSnapshot({ reason: 'shutdown', restoreAll: false })", 'Normal shutdown does not preserve a fallback browser snapshot.');
need(electronMain, "TRANSIENT_BROWSER_STORAGE_KEYS = new Set(['si-taxi-token'])", 'Transient pairing token exclusion is missing.');
need(materializer, 'restoreAll: Boolean(restoreAll)', 'Update restore mode is not persisted in snapshot metadata.');

console.log('Update-safe local browser state persistence regression passed.');
