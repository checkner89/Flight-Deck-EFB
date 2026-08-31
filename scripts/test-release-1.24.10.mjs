import fs from 'node:fs/promises';

const [pkgRaw, bootstrap, main, installer, index, server, serviceWorker, app, css, manifestRaw, nativeApp] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/electron-bootstrap.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
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

need(pkg.version === '1.24.10', `Expected 1.24.10, got ${pkg.version}`);
need(pkg.name === 'flight-deck-efb', 'Historical technical package identity was not restored.');
need(pkg.productName === 'FLYXORA', 'Visible productName must remain FLYXORA.');
need(pkg.build?.appId === 'de.checkner.flightdeckefb', 'Stable Windows appId changed.');
need(pkg.build?.win?.executableName === 'FLYXORA', 'Windows executable must remain FLYXORA.exe.');
need(pkg.build?.nsis?.shortcutName === 'FLYXORA', 'Windows shortcut must remain FLYXORA.');
need(pkg.build?.nsis?.uninstallDisplayName === 'FLYXORA', 'Windows uninstall name must remain FLYXORA.');
need(pkg.scripts?.['prepare:release'] === 'node scripts/prepare-release-1.24.10.mjs', '1.24.10 release orchestrator is not active.');

need(bootstrap.includes('app.requestSingleInstanceLock()'), 'Bootstrap no longer acquires the single-instance lock.');
need(!main.includes('app.requestSingleInstanceLock()'), 'electron-main still acquires a duplicate single-instance lock.');
need(main.includes('autoUpdater.quitAndInstall(true, true)'), 'Updater is not using silent install + forced relaunch.');

need(installer.includes('/IM "FLYXORA.exe"'), 'Installer does not terminate current FLYXORA process.');
need(installer.includes('/IM "flight-deck-efb.exe"'), 'Installer does not terminate legacy technical executable name.');
need(!installer.includes('Flight Deck EFB öffnen'), 'Installer still exposes the retired product name.');

need(index.includes('data-app-version="1.24.10"'), 'Web app version was not bumped to 1.24.10.');
need(index.includes('<title>FLYXORA</title>'), 'Visible browser title is not FLYXORA.');
need(server.includes("const APP_VERSION = '1.24.10';"), 'Server version was not bumped to 1.24.10.');
need(serviceWorker.includes("flyxora-v1.24.10-recovery"), 'Recovery service-worker cache key is missing.');
need(manifest.name === 'FLYXORA' && manifest.short_name === 'FLYXORA', 'PWA branding regressed.');
need(nativeApp.includes('return "FLYXORA";'), 'Native MSFS EFB branding regressed.');

// Preserve all 1.24.9 Traffic + SimBrief functionality in the recovery build.
need(app.includes('function trackingSimBriefPoints(record = null)'), 'SimBrief route helper is missing.');
need(app.includes('const simbriefPoints = trackingSimBriefPoints(record);'), 'SimBrief geometry is not wired into Tracking.');
need(app.includes("trackingMap.createPane('trackingSimbrief')"), 'Dedicated SimBrief map pane is missing.');
need(app.includes("pane: 'trackingSimbrief'"), 'SimBrief route is not drawn on the map.');
need(app.includes('function fd1249DedupeTraffic(entries = [])'), 'Traffic spatial deduplication is missing.');
need(app.includes('return fd1249DedupeTraffic(values).slice(0, 160);'), 'Merged Traffic is not spatially deduplicated.');
need(app.includes('fd1249-traffic-marker'), 'Unified Traffic marker is missing.');
need(app.includes('fd1249-traffic-aircraft'), 'Heading-aware Traffic aircraft glyph is missing.');
need(!app.includes('class="fd1242-traffic-history"'), 'Traffic history footer returned.');
need(css.includes('.fd1242-traffic-history { display: none !important; }'), 'Traffic history fallback is not hidden.');
need(css.includes('.fd1248-route-main { display: none !important; }'), 'Legacy lower route text is no longer suppressed.');

console.log('FLYXORA 1.24.10 Windows startup/updater recovery regression passed.');
