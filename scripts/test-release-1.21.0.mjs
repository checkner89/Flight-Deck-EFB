import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FlightMediaService } from '../src/flight-media-service.mjs';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`Expected package version 1.21.0, got ${pkg.version}.`);

const read = (file) => fs.readFile(file, 'utf8');
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const [server, engine, safety, planner, recorder, app, html, runtime, css, sw] = await Promise.all([
  read('src/server.mjs'), read('src/state-engine.mjs'), read('src/ground-safety-engine.mjs'), read('src/taxi-route-planner.mjs'),
  read('src/flight-recorder.mjs'), read('public/app.js'), read('public/index.html'), read('public/release-1.21.0.js'),
  read('public/release-1.21.0.css'), read('public/service-worker.js'),
]);

need(server, "const APP_VERSION = '1.21.0';", 'Server version is not 1.21.0.');
need(server, "FlightMediaService", 'Media service is not wired into server.');
need(server, "pathname === '/api/media/screenshot'", 'Screenshot persistence endpoint missing.');
need(server, '/api/media/recordings/', 'Recording endpoints missing.');
need(server, 'display-capture=(self)', 'Display capture permission policy missing.');

need(engine, "routes: { departure: null, arrival: null }", 'Separate departure/arrival taxi-route state missing.');
need(engine, 'taxiPositive', 'Strict taxi message classifier missing.');
need(engine, 'nonTaxi', 'Non-taxi ATC exclusion missing.');
need(engine, 'warningDelayMs: 6_000', 'Sustained taxi deviation delay missing.');
need(engine, "taxiSpeed < 3.5", 'Low-speed maneuvering suppression missing.');
need(safety, 'isOwnshipTraffic', 'Ownship traffic filtering missing.');
need(planner, 'runwayExitAnchor', 'Runway-exit anchor logic missing.');
need(planner, 'request.runwayExit', 'Runway-exit request is not used by planner.');
need(recorder, 'stable-parked-at-gate', 'Stable automatic flight completion missing.');
need(recorder, 'stable-parked-after-flight', 'No-gate stable completion fallback missing.');
need(recorder, 'sameRoute', 'Active flight identity stabilization missing.');
need(recorder, 'taxiRoutes = structuredClone', 'Taxi route archive persistence missing.');

need(app, 'window.__flightDeckTrackingMap = trackingMap', 'Tracking map bridge missing.');
need(app, 'window.__flightDeckTaxiMap = map', 'Taxi map bridge missing.');
need(app, 'runwayExit: window.__flightDeckArrivalExit || null', 'Selected runway exit is not sent by planner UI.');
need(runtime, 'ZIELFLUGHAFEN ÜBERNEHMEN', 'Arrival planning destination shortcut missing.');
need(runtime, 'fd121-aircraft-icon', 'Tracking traffic aircraft icons missing.');
need(runtime, 'tracking-manual-end', 'Manual flight-end fallback missing.');
need(runtime, 'tracking-takeoff-time', 'Planned/actual takeoff UI missing.');
need(runtime, 'AUFNAHME STARTEN', 'Media recording UI missing.');
need(runtime, 'SCREENSHOT', 'Screenshot UI missing.');
need(runtime, "data-app-id=\"media\"", 'Media application tile missing.');
need(css, '.fd121-media-page', 'Media UI styling missing.');
need(html, 'release-1.21.0.css?v=1.21.0', '1.21 stylesheet not wired.');
need(html, 'release-1.21.0.js?v=1.21.0', '1.21 runtime not wired.');
need(sw, "flight-deck-efb-v1210-backlog1", '1.21 service-worker cache missing.');

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'flight-deck-media-'));
try {
  const media = new FlightMediaService({ storageDirectory: temp });
  await media.start();
  const screenshot = await media.saveScreenshot(Buffer.from('png-test'), { flightId: 'flight-12345678', callsign: 'DLH123', contentType: 'image/png' });
  if (screenshot.kind !== 'screenshot') throw new Error('Screenshot metadata is invalid.');
  const recording = await media.beginRecording({ flightId: 'flight-12345678', callsign: 'DLH123', contentType: 'video/webm' });
  await media.appendRecordingChunk(recording.id, Buffer.from('chunk-one'));
  await media.appendRecordingChunk(recording.id, Buffer.from('chunk-two'));
  const video = await media.finishRecording(recording.id);
  if (video.kind !== 'recording' || video.size <= 0) throw new Error('Recording persistence is invalid.');
  const items = await media.list({ flightId: 'flight-12345678' });
  if (items.length !== 2) throw new Error(`Expected 2 persisted media items, got ${items.length}.`);
  const readback = await media.read(video.id);
  if (!readback.body.toString().includes('chunk-one')) throw new Error('Recording chunk data was not preserved.');
  await media.delete(screenshot.id);
  if ((await media.list({ flightId: 'flight-12345678' })).length !== 1) throw new Error('Media deletion failed.');
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}

console.log('Flight Deck EFB 1.21.0 lifecycle, taxi, traffic, media and navigation regression checks passed.');
