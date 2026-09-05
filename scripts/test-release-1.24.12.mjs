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
const fileExists = async (filename) => fs.access(filename).then(() => true).catch(() => false);

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

need(!/mainWindow\.on\('close'[\s\S]{0,240}event\.preventDefault\(\)/.test(main), 'Closing X is still intercepted by close-to-tray logic.');
need(main.includes("app.on('window-all-closed', () => {\n  app.quit();\n});"), 'Closing the last window no longer quits FLYXORA.');
need(!main.includes('notifyFlightDeckNews('), 'News notification integration remains in electron-main.');
need(!main.includes('newsStorageDirectory:'), 'News storage integration remains in electron-main.');
need(!main.includes('newsNotificationHandler:'), 'News notification server option remains in electron-main.');

need(installer.includes('SetShellVarContext current'), 'Installer does not explicitly target the current Windows user shell.');
need(installer.includes('CreateShortCut "$DESKTOP\\FLYXORA.lnk" "$INSTDIR\\FLYXORA.exe"'), 'Explicit FLYXORA desktop shortcut repair is missing.');
need(installer.includes('CreateShortCut "$SMPROGRAMS\\FLYXORA.lnk" "$INSTDIR\\FLYXORA.exe"'), 'Explicit FLYXORA Start Menu shortcut repair is missing.');

need(index.includes('data-app-version="1.24.12"'), 'Web app version was not bumped to 1.24.12.');
need(!/news-app\.(?:js|css)/i.test(index), 'News frontend asset is still loaded by index.html.');
need(server.includes("const APP_VERSION = '1.24.12';"), 'Server version was not bumped to 1.24.12.');
need(!server.includes("from './news-feed-service.mjs'"), 'News backend service is still imported.');
need(!server.includes('/api/news/'), 'News API routes are still registered.');
need(!server.includes('newsService'), 'News backend service lifecycle remains registered.');
need(serviceWorker.includes('flyxora-v1.24.12-desktop-start-repair'), '1.24.12 service-worker cache key is missing.');
need(!/news-app\.(?:js|css)/i.test(serviceWorker), 'News frontend assets remain in the service-worker cache list.');
need(!(await fileExists('public/news-app.js')), 'public/news-app.js still exists after release preparation.');
need(!(await fileExists('public/news-app.css')), 'public/news-app.css still exists after release preparation.');
need(!(await fileExists('src/news-feed-service.mjs')), 'src/news-feed-service.mjs still exists after release preparation.');
need(manifest.name === 'FLYXORA' && manifest.short_name === 'FLYXORA', 'PWA branding regressed.');

console.log('FLYXORA 1.24.12 desktop/startup + News removal regression passed.');
