import fs from 'node:fs/promises';

const [pkgRaw, bootstrap, main, installer, index, server, serviceWorker] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/electron-bootstrap.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('build/installer.nsh', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const need = (ok, message) => { if (!ok) throw new Error(message); };

need(pkg.version === '1.24.10', `Expected 1.24.10, got ${pkg.version}`);
need(pkg.name === 'flight-deck-efb', 'Historical technical package identity was not restored.');
need(pkg.productName === 'FLYXORA', 'Visible productName must remain FLYXORA.');
need(pkg.build?.appId === 'de.checkner.flightdeckefb', 'Stable Windows appId changed.');
need(pkg.build?.win?.executableName === 'FLYXORA', 'Windows executable must remain FLYXORA.exe.');
need(pkg.build?.nsis?.shortcutName === 'FLYXORA', 'Windows shortcut must remain FLYXORA.');
need(pkg.scripts?.['prepare:release'] === 'node scripts/prepare-release-1.24.10.mjs', '1.24.10 release orchestrator is not active.');

need(bootstrap.includes('app.requestSingleInstanceLock()'), 'Bootstrap no longer acquires the single-instance lock.');
need(!main.includes('app.requestSingleInstanceLock()'), 'electron-main still acquires a duplicate single-instance lock.');
need(main.includes('autoUpdater.quitAndInstall(true, true)'), 'Updater is not using silent install + forced relaunch.');

need(installer.includes('/IM "FLYXORA.exe"'), 'Installer does not terminate current FLYXORA process.');
need(installer.includes('/IM "flight-deck-efb.exe"'), 'Installer does not terminate legacy technical executable name.');
need(!installer.includes('Flight Deck EFB öffnen'), 'Installer still exposes the retired product name.');

need(index.includes('data-app-version="1.24.10"'), 'Web app version was not bumped to 1.24.10.');
need(server.includes("const APP_VERSION = '1.24.10';"), 'Server version was not bumped to 1.24.10.');
need(serviceWorker.includes("flyxora-v1.24.10-recovery"), 'Recovery service-worker cache key is missing.');

console.log('FLYXORA 1.24.10 Windows startup/updater recovery regression passed.');
