import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.23.0') throw new Error(`Expected package version 1.23.0, got ${pkg.version}.`);

const [html, server, state, recorder, sw, bootstrap, main, journey, journeyService, readiness, readinessService, changelog] = await Promise.all([
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('src/state-engine.mjs', 'utf8'),
  fs.readFile('src/flight-recorder.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('src/electron-bootstrap.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('src/flight-journey-engine.mjs', 'utf8'),
  fs.readFile('src/flight-journey-service.mjs', 'utf8'),
  fs.readFile('src/briefing-readiness-engine.mjs', 'utf8'),
  fs.readFile('src/briefing-readiness-service.mjs', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
]);

const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };

need(html, 'data-app-version="1.23.0"', 'HTML version is not 1.23.0.');
need(html, 'release-1.22.1.css?v=1.23.0', '1.22.1 UI baseline is not carried forward with 1.23 cache busting.');
need(html, 'release-1.22.1-ux.js?v=1.23.0', '1.22.1 UX baseline is not carried forward with 1.23 cache busting.');
need(server, "const APP_VERSION = '1.23.0';", 'Server version is not 1.23.0.');
need(sw, 'flight-deck-efb-v1230-journey1', '1.23 service-worker cache name missing.');
need(sw, '?v=1.23.0', '1.23 service-worker assets are not cache-busted.');
need(bootstrap, 'app.requestSingleInstanceLock()', 'Electron bootstrap does not own the single-instance lock.');
if (main.includes('requestSingleInstanceLock()')) throw new Error('electron-main must not acquire a second single-instance lock.');
need(journey, 'JOURNEY_PHASES', 'Gate-to-gate journey phase model missing.');
need(journeyService, "setIntegration('flightJourney'", 'Flight Journey service does not publish central state.');
need(readiness, 'evaluateBriefingReadiness', 'Briefing Readiness evaluator missing.');
need(readinessService, "setIntegration('briefingReadiness'", 'Briefing Readiness service does not publish central state.');
need(server, 'FlightJourneyService', 'Flight Journey service is not wired into the server.');
need(server, 'BriefingReadinessService', 'Briefing Readiness service is not wired into the server.');
need(state, "'planning'", 'Expanded manual journey phase support missing.');
need(state, "'boarding'", 'Boarding journey phase support missing.');
need(state, "'pushback'", 'Pushback journey phase support missing.');
need(recorder, 'journeyCompletion', 'Recorder is not linked to journey completion.');
need(recorder, 'journey-complete-at-gate', 'Journey completion reason missing from recorder.');
need(recorder, 'stable-parked-after-flight', 'Safe legacy recorder fallback missing.');
need(changelog, '## 1.23.0', '1.23.0 changelog section missing.');

console.log('Flight Deck EFB 1.23.0 gate-to-gate intelligence release regression checks passed.');
