import fs from 'node:fs/promises';

const [pkgRaw, bootstrap, main, installer, index, server, serviceWorker, manifestRaw] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/electron-bootstrap.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('build/installer.nsh', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('public/manifest.webmanifest', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const manifest = JSON.parse(manifestRaw);
const need = (ok, message) => { if (!ok) throw new Error(message); };

need(pkg.version === '1.24.12', `Expected 1.24.12, got ${pkg.version}`);
need(pkg.name === 'flight-deck-efb', 'Historical technical package identity changed.');
need(pkg.productName === 'FLYXORA', 'Visible productName must remain FLYXORA.');
need(pkg.build?.appId === 'de.checkner.flightdeckefb', 'Stable Windows appId changed.');
need(pkg.build?.win?.executableName === 'FLYXORA', 'Windows executable must remain FLYXORA.exe.');
need(pkg.build?.nsis?.createDesktopShortcut === true, 'Desktop shortcut creation is not enabled.');
need(pkg.build?.nsis?.createStartMenuShortcut === true, 'Start Menu shortcut creation is not enabled.');
need(pkg.build?.nsis?.shortcutName === 'FLYXORA', 'Windows shortcut must remain FLYXORA.');
need(pkg.build?.nsis?.runAfterFinish === true, 'Assisted installer no longer launches FLYXORA after setup.');
need(pkg.scripts?.['prepare:release'] === 'node scripts/prepare-release-1.24.12.mjs', '1.24.12 release orchestrator is not active.');

need(bootstrap.includes("import { app, dialog } from 'electron';"), 'Bootstrap cannot show pre-main startup failures.');
need(bootstrap.includes("dialog.showErrorBox('FLYXORA Startfehler'"), 'Bootstrap startup failure dialog is missing.');
need(bootstrap.includes('app.requestSingleInstanceLock()'), 'Bootstrap no longer owns the single-instance lock.');
need(!main.includes("import { createTaxiServer } from './server.mjs';"), 'Server stack is still imported before the visible startup window can exist.');
need(main.includes("const { createTaxiServer } = await import('./server.mjs');"), 'Server stack is not deferred into createWindow.');
need(main.includes('function createStartupWindow()'), 'Visible startup window helper regressed.');
need(main.includes('startupDocument({ failed: true'), 'Startup failure is not kept visible in FLYXORA.');
need(!main.includes('const hasSingleInstanceLock = app.requestSingleInstanceLock();'), 'electron-main duplicate single-instance lock returned.');

need(installer.includes('SetShellVarContext current'), 'Installer does not explicitly target the current Windows user shell.');
need(installer.includes('CreateShortCut "$DESKTOP\\FLYXORA.lnk" "$INSTDIR\\FLYXORA.exe"'), 'Explicit FLYXORA desktop shortcut repair is missing.');
need(installer.includes('CreateShortCut "$SMPROGRAMS\\FLYXORA.lnk" "$INSTDIR\\FLYXORA.exe"'), 'Explicit FLYXORA Start Menu shortcut repair is missing.');

need(index.includes('data-app-version="1.24.12"'), 'Web app version was not bumped to 1.24.12.');
need(server.includes("const APP_VERSION = '1.24.12';"), 'Server version was not bumped to 1.24.12.');
need(serviceWorker.includes('flyxora-v1.24.12-desktop-start-repair'), '1.24.12 service-worker cache key is missing.');
need(manifest.name === 'FLYXORA' && manifest.short_name === 'FLYXORA', 'PWA branding regressed.');

console.log('FLYXORA 1.24.12 desktop/startup repair regression passed.');
