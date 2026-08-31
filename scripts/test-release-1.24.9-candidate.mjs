import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const [pkgRaw, app, css, materializer] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.24.7.css', 'utf8'),
  fs.readFile('scripts/apply-release-1.24.9-candidate.mjs', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

assert.equal(pkg.version, '1.24.8', '1.24.9 candidate stays on the last published package version until explicit release.');
need(pkg.scripts['prepare:release'], 'apply-release-1.24.9-candidate.mjs', '1.24.9 candidate materializer is not wired into prepare:release.');
need(pkg.scripts['test:ui'], 'test-release-1.24.9-candidate.mjs', '1.24.9 candidate regression is not wired into UI tests.');

// Dedicated SimBrief geometry must survive the 1.24.7 performance renderer.
need(app, 'function trackingSimBriefPoints(record = null)', 'SimBrief route helper is not restored.');
need(app, 'const simbriefPoints = trackingSimBriefPoints(record);', 'Tracking map does not resolve SimBrief geometry.');
need(app, "trackingMap.createPane('trackingSimbrief')", 'Dedicated SimBrief pane is missing.');
need(app, 'trackingLayers.simbrief = L.layerGroup()', 'Dedicated SimBrief layer is missing.');
need(app, "pane: 'trackingSimbrief'", 'SimBrief polyline is not rendered on the map.');
need(app, 'const candidates = [origin, ...waypoints, destination];', 'SimBrief route does not include airport endpoints.');

// Route text stays on the map; the strip is only DEP/ARR.
const routeStart = app.indexOf('function trackingRouteContext1248(record) {');
const routeEnd = app.indexOf('function fd1249TrafficCallsign', routeStart);
assert.ok(routeStart >= 0 && routeEnd > routeStart, 'Tracking route context block is missing.');
const routeContext = app.slice(routeStart, routeEnd);
need(routeContext, 'fd1248-route-endpoints', 'DEP/ARR route context is missing.');
reject(routeContext, 'fd1248-route-main', 'Full route text is still rendered under the map.');
reject(routeContext, '<small>ROUTE</small>', 'Route label is still rendered under the map.');

// Popup remains, but the history footer is gone.
need(app, 'function trafficPopupMarkup(', 'Traffic popup renderer is missing.');
reject(app, 'class="fd1242-traffic-history"', 'Traffic popup still renders a history footer.');

// All Traffic uses one marker renderer and overlapping simulator/network targets are deduplicated.
need(app, 'function fd1249DedupeTraffic(entries = [])', 'Traffic spatial deduplication is missing.');
need(app, 'fd1249DedupeTraffic(fd1248TrafficEntries(state)).slice(0, 120)', 'Traffic renderer does not consume deduplicated entries.');
need(app, 'fd1249WeakTrafficIdentity', 'Traffic duplicate detection does not handle weak simulator identities.');
need(app, 'exactOverlay = distance <= (bothGround ? 7 : 55)', 'Traffic duplicate detection lacks the safe tight overlay threshold.');
need(app, 'fd1249-traffic-marker', 'Unified Traffic marker class is missing.');
need(app, 'fd1249-traffic-badge', 'Unified Traffic badge is missing.');
need(app, 'fd1249-traffic-aircraft', 'Unified heading-aware Traffic aircraft glyph is missing.');
reject(app, "querySelector('.fd124-traffic-aircraft')", 'Traffic updates still target the legacy aircraft marker.');

need(css, '/* FLYXORA 1.24.9 candidate · unified Traffic markers */', '1.24.9 Traffic marker CSS is missing.');
need(css, '.fd1249-traffic-badge', 'Unified circular Traffic badge styling is missing.');
need(css, 'rotate(calc(var(--fd1249-heading, 0deg) - 45deg))', 'Traffic heading normalization is missing.');
need(css, '.fd1242-traffic-history { display: none !important; }', 'Traffic history fallback is not hidden.');
need(css, '.fd1248-route-main { display: none !important; }', 'Legacy route text fallback is not hidden.');
need(materializer, '1.24.7\'s performance renderer accidentally removed this declaration', 'Root-cause SimBrief regression is not documented in the candidate patch.');

console.log('FLYXORA 1.24.9 candidate Traffic + SimBrief route regression passed.');
