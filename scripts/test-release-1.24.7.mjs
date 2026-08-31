import fs from 'node:fs/promises';

const [pkgRaw, orchestrator, materializer, app, html, css, profile, electronMain, changelog] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('scripts/prepare-release.mjs', 'utf8'),
  fs.readFile('scripts/apply-release-1.24.7.mjs', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/release-1.24.7.css', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

if (pkg.version !== '1.24.7') throw new Error(`Expected package version 1.24.7, got ${pkg.version}.`);
need(orchestrator, "runScript('scripts/apply-release-1.24.7.mjs')", '1.24.7 materializer is not wired into release orchestration.');
need(pkg.scripts.dist, 'test-release-1.24.7.mjs', '1.24.7 regression is missing from dist.');
need(pkg.scripts['test:ui'], 'test-release-1.24.7.mjs', '1.24.7 regression is missing from UI tests.');
need(materializer, 'persistent Traffic markers', '1.24.7 materializer does not define persistent Traffic markers.');
need(materializer, 'cached actual route rendering', '1.24.7 materializer does not define cached flown-route rendering.');
need(materializer, 'persistent ownship marker', '1.24.7 materializer does not define persistent ownship rendering.');

need(html, 'data-app-version="1.24.7"', 'HTML app version is not 1.24.7.');
need(html, '/release-1.24.7.css?v=1.24.7', '1.24.7 stylesheet is not loaded.');
reject(html, '<small>LIVE FLIGHT OPERATIONS</small>', 'Redundant Tracking eyebrow is still present.');
reject(html, 'data-i18n="trackingIntro"', 'Redundant Tracking intro paragraph is still present.');

need(css, '.efb-pages:has(.tracking-page:not([hidden]))', 'Tracking page is not pulled toward the top.');
need(css, 'min-width: 240px !important', 'Flight-plan context is not protected from Gate overlap.');
need(css, '.fd122-profile-toolbar', 'Flight Profile compaction rules are missing.');
need(css, 'min-height: 258px !important', 'Flight Profile chart height is not compacted.');

need(app, 'const trackingTrafficMarkers = new Map();', 'Traffic marker cache is missing.');
need(app, 'function trackingTrafficFingerprint(', 'Traffic render fingerprint is missing.');
need(app, 'marker.setLatLng([lat, lon]);', 'Traffic markers are not updated in place.');
need(app, 'trackingLayers.aircraft.setLatLng([aircraft.lat, aircraft.lon]);', 'Ownship marker is not updated in place.');
need(app, 'let trackingActualRenderKey =', 'Flown-route render cache is missing.');
need(app, 'trackingDisplayPoints(actualPoints, trackingSelectedId ? 3_000 : 1_200)', 'Live flown-route point budget is not reduced.');
need(app, 'drift > 90', 'Follow mode is not guarded by viewport drift.');
need(app, 'zoomAnimation: false', 'Tracking map zoom animation is still enabled.');
need(app, 'fadeAnimation: false', 'Tracking map fade animation is still enabled.');

need(profile, "profileRenderKey: ''", 'Flight Profile render cache is missing.');
need(profile, "record?.status === 'recording' ? 500 : 1_200", 'Live Flight Profile point budget is not reduced.');
need(electronMain, "title: 'FLYXORA 1.24.7'", 'Windows title does not identify FLYXORA 1.24.7.');
need(changelog, '## 1.24.7 — Tracking Density & Map Performance', '1.24.7 changelog section is missing.');

// The root-cause desktop startup correction must survive this performance release.
need(app, 'function connectEvents()', '1.24.6 SSE event bridge was lost.');
need(app, "eventSource = new EventSource(authenticatedUrl('/api/events'));", '1.24.6 authenticated SSE event bridge was lost.');
need(electronMain, '#pair-overlay{display:none!important;pointer-events:none!important}', '1.24.6 native overlay guard was lost.');

console.log('FLYXORA 1.24.7 tracking density + map performance regression passed.');
