import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [pkgRaw, app, html, manifestRaw, css, server, electronMain, sw, nativeApp, changelog] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/manifest.webmanifest', 'utf8'),
  fs.readFile('public/release-1.24.7.css', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('MSFS-2024-EFB-App/src/FlightDeckEFB.tsx', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const manifest = JSON.parse(manifestRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

assert.equal(pkg.version, '1.24.9');
assert.equal(pkg.name, 'flyxora');
assert.equal(pkg.productName, 'FLYXORA');
assert.equal(pkg.build?.productName, 'FLYXORA');
assert.equal(pkg.build?.artifactName, 'FLYXORA-Setup-${version}.${ext}');
assert.equal(pkg.build?.win?.executableName, 'FLYXORA');
assert.equal(pkg.build?.nsis?.shortcutName, 'FLYXORA');
assert.equal(pkg.build?.nsis?.uninstallDisplayName, 'FLYXORA');
// Keep the established Windows/update identity stable for in-place upgrades.
assert.equal(pkg.build?.appId, 'de.checkner.flightdeckefb');

need(html, 'data-app-version="1.24.9"', 'HTML version is not 1.24.9.');
need(html, '<title>FLYXORA</title>', 'Browser/app title is not FLYXORA.');
need(html, 'apple-mobile-web-app-title" content="FLYXORA"', 'Apple web app title is not FLYXORA.');
need(html, 'aria-label="FLYXORA"', 'Top-level brand label is not FLYXORA.');
need(html, '<strong>FLYXORA</strong>', 'Visible topbar brand is not FLYXORA.');
assert.equal(manifest.name, 'FLYXORA');
assert.equal(manifest.short_name, 'FLYXORA');
need(server, "const APP_VERSION = '1.24.9';", 'Server version is not 1.24.9.');
need(electronMain, "title: 'FLYXORA 1.24.9'", 'Windows title is not FLYXORA 1.24.9.');
need(sw, 'flyxora-v1.24.9-traffic-simbrief-brand', '1.24.9 service-worker cache marker is missing.');

// 1.24.9 Traffic + Tracking fixes.
need(app, 'function trackingSimBriefPoints(record = null)', 'SimBrief route helper is missing.');
need(app, 'const simbriefPoints = trackingSimBriefPoints(record);', 'SimBrief geometry is not wired into the Tracking renderer.');
need(app, "trackingMap.createPane('trackingSimbrief')", 'Dedicated SimBrief map pane is missing.');
need(app, "pane: 'trackingSimbrief'", 'SimBrief route is not drawn on the map.');
need(app, 'function fd1249DedupeTraffic(entries = [])', 'Traffic spatial deduplication is missing.');
need(app, 'return fd1249DedupeTraffic(values).slice(0, 160);', 'Merged Traffic is not spatially deduplicated.');
need(app, 'fd1249-traffic-marker', 'Unified Traffic marker is missing.');
need(app, 'fd1249-traffic-aircraft', 'Heading-aware Traffic aircraft glyph is missing.');
reject(app, 'class="fd1242-traffic-history"', 'Traffic history footer is still rendered.');
need(css, '.fd1242-traffic-history { display: none !important; }', 'Traffic history fallback is not hidden.');
need(css, '.fd1248-route-main { display: none !important; }', 'Legacy route text below the map is not hidden.');

// Native MSFS EFB must expose the new product name as well.
need(nativeApp, 'return "FLYXORA";', 'Native MSFS EFB app name is not FLYXORA.');
need(nativeApp, 'title="FLYXORA"', 'Native MSFS EFB iframe title is not FLYXORA.');
reject(nativeApp, 'Flight Deck', 'Native MSFS EFB still contains visible legacy branding.');

// Scan all shipped text surfaces. Technical identifiers such as flight-deck-* CSS/DOM
// ids and the stable appId are intentionally lower-case/hyphenated and are not display branding.
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs', '.nsh', '.scss', '.ts', '.tsx', '.txt', '.webmanifest', '.xml', '.yaml', '.yml']);
const legacyBrand = /(?:Flight Deck EFB|FLIGHT DECK EFB|Flight Deck|FLIGHT DECK)/;
async function scan(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await scan(filename);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const source = await fs.readFile(filename, 'utf8');
    if (legacyBrand.test(source)) throw new Error(`Visible legacy branding remains in ${filename}.`);
  }
}
for (const root of ['public', 'src', 'MSFS-2024-EFB-App', 'build']) await scan(root);
for (const filename of ['README.md', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md']) {
  try {
    const source = await fs.readFile(filename, 'utf8');
    if (legacyBrand.test(source)) throw new Error(`Visible legacy branding remains in ${filename}.`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

need(changelog, '# FLYXORA changelog', 'Changelog heading is not branded FLYXORA.');
need(changelog, '## 1.24.9 — Traffic Consistency, SimBrief Route & FLYXORA Branding', '1.24.9 changelog section is missing.');

console.log('FLYXORA 1.24.9 release regression passed.');
