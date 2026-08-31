import fs from 'node:fs/promises';

const [pkgSource, electronMain, materializer, releaseOrchestrator, finalReleaseWrapper] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('scripts/apply-feature-1.23.2-update-persistence.mjs', 'utf8'),
  fs.readFile('scripts/prepare-release.mjs', 'utf8').catch(() => ''),
  fs.readFile('scripts/prepare-release-1.24.9.mjs', 'utf8').catch(() => ''),
]);
const pkg = JSON.parse(pkgSource);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };

const prepareRelease = pkg.scripts['prepare:release'] || '';
if (prepareRelease.includes('prepare-release-1.24.9.mjs')) {
  need(finalReleaseWrapper, "'scripts/prepare-release.mjs'", '1.24.9 final release wrapper does not invoke the release orchestrator.');
  need(releaseOrchestrator, 'scripts/apply-feature-1.23.2-update-persistence.mjs', 'Update persistence materializer is not wired into the release orchestrator.');
} else if (prepareRelease.includes('prepare-release.mjs')) {
  need(releaseOrchestrator, 'scripts/apply-feature-1.23.2-update-persistence.mjs', 'Update persistence materializer is not wired into the release orchestrator.');
} else {
  need(prepareRelease, 'apply-feature-1.23.2-update-persistence.mjs', 'Update persistence materializer is not wired into prepare:release.');
}
need(electronMain, "const BROWSER_STATE_BACKUP_FILE = 'browser-state-backup.json';", 'Browser state backup path is missing.');
need(electronMain, "app.getPath('userData')", 'Browser state backup is not stored in update-safe userData.');
need(electronMain, 'window.webContents.session.flushStorageData()', 'Chromium storage is not flushed before persistence.');
need(electronMain, "persistBrowserStateSnapshot({ reason: 'update', restoreAll: true })", 'Updater does not snapshot current browser state before install.');
need(electronMain, 'restoreBrowserStateSnapshot(mainWindow)', 'Browser state is not restored on startup.');
need(electronMain, 'if (browserStateRestored) await mainWindow.loadURL', 'Renderer is not reloaded after restoring state.');
need(electronMain, "persistBrowserStateSnapshot({ reason: 'startup-migration', restoreAll: false })", 'Existing browser state is not seeded into the update-safe backup on upgraded startup.');
need(electronMain, "persistBrowserStateSnapshot({ reason: 'shutdown', restoreAll: false })", 'Normal shutdown does not preserve a fallback browser snapshot.');
need(electronMain, "TRANSIENT_BROWSER_STORAGE_KEYS = new Set(['si-taxi-token'])", 'Transient pairing token exclusion is missing.');
need(materializer, 'restoreAll: Boolean(restoreAll)', 'Update restore mode is not persisted in snapshot metadata.');

console.log('Update-safe local browser state persistence regression passed.');
