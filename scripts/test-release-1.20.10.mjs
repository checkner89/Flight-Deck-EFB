import fs from 'node:fs/promises';
import { summarizeSimBrief } from '../src/simbrief-client.mjs';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const app = await fs.readFile('public/app.js', 'utf8');
const html = await fs.readFile('public/index.html', 'utf8');
const css = await fs.readFile('public/release-1.20.10.css', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

if (pkg.version !== '1.20.10') throw new Error(`Expected package version 1.20.10, got ${pkg.version}.`);
need(server, "const APP_VERSION = '1.20.10';", 'Server version was not materialized to 1.20.10.');
need(app, "trackingMap.createPane('trackingSimbrief')", 'Dedicated SimBrief map pane is missing.');
need(app, 'trackingLayers.simbrief = L.layerGroup()', 'Dedicated SimBrief route layer is missing.');
need(app, 'function trackingSimBriefPoints()', 'SimBrief waypoint route helper is missing.');
need(app, "pane: 'trackingSimbrief'", 'Original SimBrief route is not rendered as a map polyline.');
need(app, "trackingPage?.querySelector('.tracking-sidebar')?.toggleAttribute('hidden', !archiveOnly)", 'Archive sidebar is not removed from live Tracking.');
need(app, "trackingPage?.classList.toggle('archive-only', archiveOnly)", 'Archive-only layout state is missing.');
need(app, "flightHubTab = 'tracking';\n  switchModule('flight', true);", 'Archive entries do not open the replay map.');
need(app, "['CALLSIGN', record?.flight?.callsign || '—']", 'Compact map flight context is missing.');
if (app.includes("['MAX ALT'") || app.includes("['MAX GS'") || app.includes("['AUTOMATIONS'")) {
  throw new Error('Removed duplicate Flight Detail metrics are still rendered.');
}

for (const id of [
  'tracking-context-callsign',
  'tracking-context-aircraft',
  'tracking-context-runways',
  'tracking-context-gate',
  'tracking-context-takeoff',
  'tracking-context-landing',
]) {
  need(html, `id="${id}"`, `Map-attached flight context field ${id} is missing.`);
}
need(html, '<i class="simbrief"></i><b>SimBrief Route</b>', 'SimBrief route legend entry is missing.');
need(html, 'release-1.20.10.css?v=1.20.10', '1.20.10 stylesheet is not wired.');
need(css, '[data-page="tracking"] .tracking-data-card', 'Duplicate lower Flight Data card is not hidden.');
need(css, 'grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;', 'Route/weather two-column layout is missing.');
need(css, '.tracking-sidebar[hidden]', 'Tracking archive sidebar responsive override is missing.');
need(css, '@media (max-width: 1500px)', 'Intermediate desktop header breakpoint is missing.');
need(css, '.tracking-flight-strip', 'Map-attached flight context styling is missing.');

const sample = summarizeSimBrief({
  fetch: { status: 'Success' },
  general: { callsign: 'DLH2DF', route: 'DCT TEST DCT DEMO' },
  origin: { icao_code: 'EDDM', pos_lat: '48.3538', pos_long: '11.7861' },
  destination: { icao_code: 'LEPA', pos_lat: '39.5517', pos_long: '2.7388' },
  aircraft: { icaocode: 'A320' },
  params: {},
  navlog: {
    navlog: {
      fixes: {
        first: { ident: 'TEST', latitude: '47.8', longitude: '10.1', altitude: '30000' },
        second: { ident: 'DEMO', position: { lat: '44.2', long: '6.4' }, altitude_feet: '35000' },
      },
    },
  },
}, 'test-user');

if (sample.flight.waypoints.length !== 2) {
  throw new Error(`Expected nested SimBrief navlog coordinates to produce 2 waypoints, got ${sample.flight.waypoints.length}.`);
}
if (sample.flight.waypoints[0].ident !== 'TEST' || sample.flight.waypoints[1].ident !== 'DEMO') {
  throw new Error('Nested SimBrief navlog waypoints were parsed in an unexpected shape.');
}

console.log('Flight Deck EFB 1.20.10 responsive tracking, SimBrief geometry and compact map details regression checks passed.');
