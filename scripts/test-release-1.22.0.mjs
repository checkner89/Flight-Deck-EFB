import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (!['1.22.0', '1.22.1'].includes(pkg.version)) throw new Error(`Expected package version 1.22.0+, got ${pkg.version}.`);
const expectedVersion = pkg.version;

const [html, app, runtime, css, recorder, server, sw] = await Promise.all([
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('public/release-1.22.0.css', 'utf8'),
  fs.readFile('src/flight-recorder.mjs', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
]);

const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
need(html, `data-app-version="${expectedVersion}"`, 'HTML version not materialized.');
need(html, `release-1.22.0.css?v=${expectedVersion}`, '1.22 stylesheet not wired.');
need(html, `release-1.22.0.js?v=${expectedVersion}`, '1.22 runtime not wired.');
need(server, `const APP_VERSION = '${expectedVersion}';`, 'Server version not materialized.');
if (!sw.includes('flight-deck-efb-v1220-pilotops1') && !sw.includes('flight-deck-efb-v1221-ui1')) throw new Error('Service-worker cache not compatible with 1.22 pilot workflows.');
need(app, 'button.dataset.flightId = flight.id;', 'Archive buttons do not expose stable flight IDs.');
need(recorder, 'originalPlan: structuredClone(initialPlan)', 'Original planned route is not preserved.');
need(recorder, 'planHistory.push({ capturedAt:', 'Plan-change history is not persisted.');
need(recorder, 'groundEvents: []', 'Ground-service events are not recorded.');
need(runtime, 'fd122-profile-axis', 'Flight-profile axis selector missing.');
need(runtime, 'fd122-alt-colors', 'Altitude-colour route mode missing.');
need(runtime, 'highlightMapPoint', 'Map/profile synchronization missing.');
need(runtime, 'fd122-scratch-canvas', 'Scratchpad canvas missing.');
need(runtime, 'Departure Clearance', 'Operational scratchpad templates missing.');
need(runtime, 'BRIEF_STEPS', 'Guided briefing workflow missing.');
need(runtime, "['Flugübersicht','Route & Luftraum','Wetter','NOTAMs','Flughäfen & Runways','Fuel','Masse & Schwerpunkt','Performance','Charts & Verfahren','Risiken & Abschluss']", 'Ten-step briefing sequence missing.');
need(runtime, 'Flight Deck berechnet keine erfundenen Performance-Daten.', 'Performance-source guard missing.');
need(runtime, 'SERVICE_DEFS', 'Ground-services redesign missing.');
need(css, "html[data-theme='light']", 'Dedicated Light Mode contrast rules missing.');
need(css, '--fd122-accent-strong: #07535b', 'Dark Light-Mode accent token missing.');

console.log(`Flight Deck EFB ${expectedVersion} 1.22 pilot workflow regression checks passed.`);
