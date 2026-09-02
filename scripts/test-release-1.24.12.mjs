import fs from 'node:fs/promises';

const [pkgRaw, bootstrap, main, simconnect, installer, index, server, serviceWorker, app, css, manifestRaw, nativeApp] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/electron-bootstrap.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('src/simconnect-client.mjs', 'utf8'),
  fs.readFile('build/installer.nsh', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.24.7.css', 'utf8'),
  fs.readFile('public/manifest.webmanifest', 'utf8'),
  fs.readFile('MSFS-2024-EFB-App/src/FlightDeckEFB.tsx', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const manifest = JSON.parse(manifestRaw);
const need = (ok, message) => { if (!ok) throw new Error(message); };

need(pkg.version === '1.24.12', `Expected 1.24.12, got ${pkg.version}`);
need(pkg.name === 'flight-deck-efb', 'Historical technical package identity changed.');
need(pkg.productName === 'FLYXORA', 'Visible productName must remain FLYXORA.');
need(pkg.main === 'src/electron-bootstrap.mjs', 'Electron bootstrap entrypoint changed.');
need(pkg.build?.appId === 'de.checkner.flightdeckefb', 'Stable Windows appId changed.');
need(pkg.build?.win?.executableName === 'FLYXORA', 'Windows executable must remain FLYXORA.exe.');
need(pkg.build?.nsis?.shortcutName === 'FLYXORA', 'Windows shortcut must remain FLYXORA.');
need(pkg.build?.nsis?.createDesktopShortcut === true, 'Desktop shortcut must be enabled.');
need(pkg.build?.nsis?.createStartMenuShortcut === true, 'Start Menu shortcut must be enabled.');
need(pkg.build?.nsis?.runAfterFinish === true, 'Assisted installer must launch FLYXORA after setup.');
need(pkg.scripts?.['prepare:release'] === 'node scripts/prepare-release-1.24.12.mjs', '1.24.12 release orchestrator is not active.');

need(bootstrap.includes('app.requestSingleInstanceLock()'), 'Bootstrap no longer owns the single-instance lock.');
need(bootstrap.includes('showBootstrapFailure'), 'Bootstrap-level visible failure recovery is missing.');
need(bootstrap.includes('startup-error.log'), 'Bootstrap startup failure log is missing.');
need(bootstrap.includes("new BrowserWindow({"), 'Bootstrap cannot show an import-time failure window.');
need(bootstrap.includes("await import('./electron-main.mjs')"), 'Electron main lifecycle is no longer dynamically guarded.');
need(!main.includes('const hasSingleInstanceLock = app.requestSingleInstanceLock();'), 'electron-main still contains the redundant single-instance lock.');
need(main.includes('function createStartupWindow()'), 'Normal visible startup window helper regressed.');
need(main.includes('startupDocument({ failed: true'), 'Normal startup failure UI regressed.');

need(!simconnect.includes("from 'node-simconnect';"), 'node-simconnect is still loaded at module import time.');
need(simconnect.includes("import('node-simconnect')"), 'Lazy node-simconnect runtime import is missing.');
need(simconnect.includes('async function ensureSimConnectRuntime()'), 'Lazy SimConnect loader helper is missing.');
need(simconnect.includes('await ensureSimConnectRuntime();'), 'SimConnect runtime is not loaded inside the guarded connection attempt.');

need(installer.includes('CreateShortCut "$DESKTOP\\FLYXORA.lnk" "$INSTDIR\\FLYXORA.exe"'), 'Installer does not explicitly recreate the desktop shortcut.');
need(installer.includes('CreateShortCut "$SMPROGRAMS\\FLYXORA.lnk" "$INSTDIR\\FLYXORA.exe"'), 'Installer does not explicitly recreate the Start Menu shortcut.');
need(installer.includes('/IM "FLYXORA.exe"'), 'Installer does not stop the current FLYXORA process before repair.');
need(installer.includes('/IM "flight-deck-efb.exe"') || installer.includes('/IM "Flight Deck EFB.exe"'), 'Installer does not stop a legacy executable before repair.');

need(index.includes('data-app-version="1.24.12"'), 'Web app version was not bumped to 1.24.12.');
need(server.includes("const APP_VERSION = '1.24.12';"), 'Server version was not bumped to 1.24.12.');
need(serviceWorker.includes('flyxora-v1.24.12-installed-startup-recovery'), '1.24.12 service-worker cache key is missing.');
need(manifest.name === 'FLYXORA' && manifest.short_name === 'FLYXORA', 'PWA branding regressed.');
need(nativeApp.includes('return "FLYXORA";'), 'Native MSFS EFB branding regressed.');

need(app.includes('function trackingSimBriefPoints(record = null)'), 'SimBrief route helper is missing.');
need(app.includes('function fd1249DedupeTraffic(entries = [])'), 'Traffic spatial deduplication is missing.');
need(app.includes('fd1249-traffic-marker'), 'Unified Traffic marker is missing.');
need(css.includes('.fd1248-route-main { display: none !important; }'), 'Tracking polish regressed.');

console.log('FLYXORA 1.24.12 installed startup and shortcut recovery regression passed.');
