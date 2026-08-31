import fs from 'node:fs/promises';

const [pkgRaw, bootstrap, main, index, server, serviceWorker, app, css, manifestRaw, nativeApp] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/electron-bootstrap.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
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

need(pkg.version === '1.24.11', `Expected 1.24.11, got ${pkg.version}`);
need(pkg.name === 'flight-deck-efb', 'Historical technical package identity changed.');
need(pkg.productName === 'FLYXORA', 'Visible productName must remain FLYXORA.');
need(pkg.build?.appId === 'de.checkner.flightdeckefb', 'Stable Windows appId changed.');
need(pkg.build?.win?.executableName === 'FLYXORA', 'Windows executable must remain FLYXORA.exe.');
need(pkg.build?.nsis?.shortcutName === 'FLYXORA', 'Windows shortcut must remain FLYXORA.');
need(pkg.scripts?.['prepare:release'] === 'node scripts/prepare-release-1.24.11.mjs', '1.24.11 release orchestrator is not active.');

need(bootstrap.includes('app.requestSingleInstanceLock()'), 'Bootstrap no longer owns the single-instance lock.');
need(!main.includes('const hasSingleInstanceLock = app.requestSingleInstanceLock();'), 'electron-main still contains the redundant single-instance lock.');
need(main.includes('let startupWindow;'), 'Startup window state is missing.');
need(main.includes('function createStartupWindow()'), 'Visible startup window helper is missing.');
need(main.includes("title: 'FLYXORA'"), 'Desktop startup window is not branded FLYXORA.');
need(main.includes('show: true'), 'Desktop BrowserWindow is still hidden during startup.');
need(main.includes('startupDocument({ failed: true'), 'Startup failure is not kept visible in the app window.');
need(main.includes('startupWindow && !startupWindow.isDestroyed()'), 'Second-instance foreground recovery does not include the startup window.');
need(main.includes('startupWindow.destroy()'), 'Startup window is not cleaned up after the real app becomes visible.');

need(index.includes('data-app-version="1.24.11"'), 'Web app version was not bumped to 1.24.11.');
need(server.includes("const APP_VERSION = '1.24.11';"), 'Server version was not bumped to 1.24.11.');
need(serviceWorker.includes('flyxora-v1.24.11-foreground-recovery'), '1.24.11 service-worker cache key is missing.');
need(manifest.name === 'FLYXORA' && manifest.short_name === 'FLYXORA', 'PWA branding regressed.');
need(nativeApp.includes('return "FLYXORA";'), 'Native MSFS EFB branding regressed.');

// Keep the Traffic + SimBrief fixes from 1.24.9/1.24.10 intact.
need(app.includes('function trackingSimBriefPoints(record = null)'), 'SimBrief route helper is missing.');
need(app.includes('const simbriefPoints = trackingSimBriefPoints(record);'), 'SimBrief geometry is not wired into Tracking.');
need(app.includes("trackingMap.createPane('trackingSimbrief')"), 'Dedicated SimBrief map pane is missing.');
need(app.includes('function fd1249DedupeTraffic(entries = [])'), 'Traffic spatial deduplication is missing.');
need(app.includes('fd1249-traffic-marker'), 'Unified Traffic marker is missing.');
need(!app.includes('class="fd1242-traffic-history"'), 'Traffic history footer returned.');
need(css.includes('.fd1248-route-main { display: none !important; }'), 'Legacy lower route text is no longer suppressed.');

console.log('FLYXORA 1.24.11 foreground startup recovery regression passed.');
