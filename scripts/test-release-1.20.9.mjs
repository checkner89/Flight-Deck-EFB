import fs from 'node:fs/promises';
import { calculateFlightProgress } from '../public/flight-phases.js';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const app = await fs.readFile('public/app.js', 'utf8');
const html = await fs.readFile('public/index.html', 'utf8');
const css = await fs.readFile('public/release-1.20.9.css', 'utf8');
const recorder = await fs.readFile('src/flight-recorder.mjs', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

if (pkg.version !== '1.20.9') throw new Error(`Expected package version 1.20.9, got ${pkg.version}.`);
need(server, "const APP_VERSION = '1.20.9';", 'Server version was not materialized to 1.20.9.');
need(app, "let flightHubTab = 'tracking';", 'Flight Hub does not default to Tracking.');
need(app, "if (moduleName === 'flight' && !preserveFlightHubTab) flightHubTab = 'tracking';", 'Flight module still opens Operations.');
need(app, 'if (elements.trackingStart) elements.trackingStart.hidden', 'Tracking recorder null guard is missing.');
need(app, 'function trackingWaypointPoints(record)', 'Live route waypoint fallback is missing.');
need(app, 'function setTrackingWaypointsVisible(visible)', 'Waypoint visibility control is missing.');
need(app, 'async function deleteAllTrackedFlights()', 'Archive bulk delete is missing.');
need(app, "flight.id !== currentId && flight.status !== 'recording'", 'Bulk delete does not protect the current recording.');
need(html, 'id="tracking-waypoints-toggle"', 'Waypoint toggle markup is missing.');
need(html, 'id="tracking-archive-delete-all"', 'Archive bulk delete markup is missing.');
need(html, 'release-1.20.9.css?v=1.20.9', '1.20.9 tracking stylesheet is not wired.');
need(css, '.tracking-recorder-card', 'Recorder card is not hidden by the 1.20.9 stylesheet.');
need(css, '[data-flight-hub-tab="operations"]', 'Operations tab is not hidden by the 1.20.9 stylesheet.');
need(css, '#tracking-status-pill', 'Tracking recording status pill is not hidden.');
need(recorder, 'const preferSimBrief = Boolean(simbrief.imported', 'Recorder plan source priority is not explicit.');

const progress = calculateFlightProgress({
  aircraft: { lat: 47.82, lon: 10.86, groundSpeed: 320, fuelWeightPounds: 10_000 },
  flight: {
    originPosition: { lat: 48.3538, lon: 11.7861 },
    destinationPosition: { lat: 39.5517, lon: 2.7388 },
  },
  integrations: { simbrief: { flight: null } },
});
if (!(progress.completedPercent > 0 && progress.completedPercent < 50)) {
  throw new Error(`Expected an already departed EDDM-like route to have progress > 0 %, got ${progress.completedPercent}.`);
}
if (!(progress.remainingRouteNm < progress.totalRouteNm)) {
  throw new Error(`Remaining route should be shorter than total route after departure (${progress.remainingRouteNm}/${progress.totalRouteNm}).`);
}

console.log('Flight Deck EFB 1.20.9 tracking, route progress, waypoint and archive regression checks passed.');
