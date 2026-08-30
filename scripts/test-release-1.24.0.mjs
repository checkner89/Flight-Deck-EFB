import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (!['1.24.0', '1.24.1', '1.24.2'].includes(pkg.version)) throw new Error(`Expected package version 1.24.0, 1.24.1 or 1.24.2, got ${pkg.version}.`);

const [html, server, sw, app, runtime, css, changelog] = await Promise.all([
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('public/release-1.22.0.css', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
]);

const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

need(html, `data-app-version="${pkg.version}"`, `HTML version is not ${pkg.version}.`);
need(server, `const APP_VERSION = '${pkg.version}';`, `Server version is not ${pkg.version}.`);
const expectedCache = pkg.version === '1.24.2'
  ? 'flyxora-v1242-tracking-traffic'
  : pkg.version === '1.24.1'
    ? 'flight-deck-efb-v1241-tracking-layout'
    : 'flight-deck-efb-v1240-flighttracking';
need(sw, expectedCache, `${pkg.version} service-worker cache is missing.`);
need(html, `release-1.23.1-ui.css?v=${pkg.version}`, `UI compatibility CSS is not cache-busted for ${pkg.version}.`);
need(html, `release-1.23.1-ui.js?v=${pkg.version}`, `UI compatibility JS is not cache-busted for ${pkg.version}.`);
need(app, 'let openTrafficPopupId = null;', 'Persistent Live Traffic popup state is missing.');
if (pkg.version === '1.24.2') {
  need(app, 'selectedTrafficTrailId = key;', '1.24.2 Live Traffic selection behavior is missing.');
  need(app, 'openTrafficPopupId = key;', '1.24.2 persistent Traffic popup state is not wired.');
  need(app, 'function renderSelectedTrafficTrail(trail)', '1.24.2 selected Traffic route is missing.');
} else {
  need(app, "marker.on('click', () => { openTrafficPopupId = key; marker.openPopup(); });", 'Live Traffic click popup behavior is missing.');
}
reject(app, '  renderTrackingAltitudeProfile(record);\n  const stats = record?.stats || {};', 'Obsolete base altitude profile renderer is still active.');
if (pkg.version !== '1.24.2') {
  need(runtime, "['TAKEOFF', flight.estimatedOff, stats.takeoffAt]", 'Planned/actual Takeoff time pairing is missing.');
}
need(runtime, 'fd124-actual-segment', 'Altitude-coloured actual profile is missing.');
need(runtime, 'fd124-alt-axis', 'Readable altitude labels are missing.');
reject(runtime, 'Archiv: Originalplanung + tatsächliche Spur', 'Retired archive helper line is still present.');
need(css, '.tracking-profile-card>.section-title>span{display:none!important}', 'Obsolete profile subtitle is not hidden.');
need(css, '.tracking-traffic-icon.fd124-traffic-plane .fd124-traffic-aircraft{background:transparent!important', 'Traffic marker dark background override is missing.');
need(changelog, '## 1.24.0', '1.24.0 changelog section missing.');

console.log(`Flight Deck EFB 1.24.0 baseline regression passed for ${pkg.version}.`);
