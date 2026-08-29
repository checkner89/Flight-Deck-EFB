import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const simconnect = await fs.readFile('src/simconnect-client.mjs', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');
const weatherClient = await fs.readFile('src/aviation-weather-client.mjs', 'utf8');
const recorder = await fs.readFile('src/flight-recorder.mjs', 'utf8');
const app = await fs.readFile('public/app.js', 'utf8');
const overlay = await fs.readFile('public/flight-overlay.js', 'utf8');
const html = await fs.readFile('public/index.html', 'utf8');
const css = await fs.readFile('public/release-1.20.11.css', 'utf8');
const serviceWorker = await fs.readFile('public/service-worker.js', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

if (pkg.version !== '1.20.11') throw new Error(`Expected package version 1.20.11, got ${pkg.version}.`);
need(server, "const APP_VERSION = '1.20.11';", 'Server version was not materialized to 1.20.11.');

// Barometric altitude must be the pilot-facing altitude.
need(simconnect, "addFloat('INDICATED ALTITUDE', 'feet');", 'INDICATED ALTITUDE SimVar is missing.');
need(simconnect, "addFloat('KOHLSMAN SETTING MB:1', 'millibars');", 'Altimeter QNH/STD pressure setting is missing.');
need(simconnect, "addInt('KOHLSMAN SETTING STD:1', 'bool');", 'Altimeter STD-mode flag is missing.');
need(simconnect, 'trueAltitudeFeet: received.data.readFloat64(),', 'True/geometric altitude is not retained separately.');
need(simconnect, 'altitudeFeet: received.data.readFloat64(),', 'Primary altitude does not map to indicated altitude.');
need(simconnect, 'altimeterSettingHpa: received.data.readFloat64(),', 'Altimeter pressure setting is not exposed.');
need(simconnect, 'altimeterStandard: received.data.readInt32() === 1,', 'Altimeter STD state is not exposed.');
const trueIndex = simconnect.indexOf('trueAltitudeFeet: received.data.readFloat64()');
const indicatedIndex = simconnect.indexOf('altitudeFeet: received.data.readFloat64()', trueIndex + 1);
if (trueIndex < 0 || indicatedIndex <= trueIndex) throw new Error('Telemetry read order does not preserve PLANE ALTITUDE followed by INDICATED ALTITUDE.');

// Official current weather must include coordinates and map-useful fields.
for (const token of ['lat:', 'lon:', 'windGust:', 'visibilitySm:', 'altimeterHpa:', 'temperatureC:', 'dewpointC:', 'weatherString:']) {
  need(weatherClient, token, `AviationWeather overlay field is missing: ${token}`);
}
need(weatherClient, 'state.flight?.alternate, simbrief.alternate', 'Alternate airport is missing from automatic weather refresh.');

// Tracking weather overlay and controls.
need(app, "trackingWeatherToggle: $('#tracking-weather-toggle')", 'Weather overlay control is not wired.');
need(app, "trackingMap.createPane('trackingWeather')", 'Weather overlay pane is missing.');
need(app, 'function setTrackingWeatherVisible(visible)', 'Weather overlay toggle implementation is missing.');
need(app, 'function renderTrackingWeatherOverlay(record, weather)', 'Weather overlay renderer is missing.');
need(app, "className: 'tracking-weather-map-icon wx-' + categoryClass", 'Weather station markers are missing.');
need(app, "elements.trackingWaypointList.hidden = true", 'Route Details still exposes the waypoint list.');
const waypointRenderStart = app.indexOf('function renderTrackingWaypoints(record) {');
const weatherRenderStart = app.indexOf('function renderTrackingWeather(record) {', waypointRenderStart);
if (waypointRenderStart < 0 || weatherRenderStart < 0) throw new Error('Tracking route/weather render functions are missing.');
const waypointRender = app.slice(waypointRenderStart, weatherRenderStart);
if (waypointRender.includes('tracking-waypoint-row')) throw new Error('Individual waypoint rows are still rendered below Route Details.');

need(html, 'id="tracking-weather-toggle"', 'WETTER map toggle is missing.');
need(html, '<i class="weather"></i><b>METAR / Wetter</b>', 'Weather overlay legend is missing.');
need(html, 'release-1.20.11.css?v=1.20.11', '1.20.11 stylesheet is not wired.');
if (html.includes('tracking-basemap-selector')) throw new Error('MAP/SATELLITE still use the redundant framed selector.');
need(css, '.tracking-weather-map-icon', 'Weather marker styling is missing.');
need(css, '[data-page="tracking"] #tracking-waypoint-list', 'Waypoint list hide rule is missing.');

// UTC / local clock must be two readable labeled values.
need(overlay, "className: 'flight-overlay-clock-item'", 'Readable dual-clock markup is missing.');
need(overlay, "overlaySet('flight-overlay-utc', utc);", 'UTC clock still contains legacy suffix formatting.');
need(overlay, "overlaySet('flight-overlay-local', local);", 'Local clock still contains legacy suffix formatting.');
need(css, '.flight-overlay-clock-item small', 'Dual-clock label styling is missing.');
need(css, '.flight-overlay-clock-item strong', 'Dual-clock value styling is missing.');

// Actual track, altitude profile and touchdown analytics.
need(app, "pane: 'trackingActual', color: '#ffb347'", 'Actual flown track does not use its distinct amber styling.');
need(app, 'function renderTrackingAltitudeProfile(record)', 'Altitude/time profile renderer is missing.');
need(app, "trackingProfileChart: $('#tracking-profile-chart')", 'Altitude profile DOM wiring is missing.');
need(app, 'renderTrackingAltitudeProfile(record);', 'Altitude profile is not refreshed with tracking details.');
need(html, 'id="tracking-profile-chart"', 'Flight profile card is missing from Tracking.');
need(html, 'id="tracking-landing-rate"', 'Landing-rate metric is missing from the flight profile.');
need(html, 'id="tracking-touchdown-speed"', 'Touchdown ground-speed metric is missing from the flight profile.');
need(css, '.tracking-profile-line', 'Altitude profile styling is missing.');
need(css, '.tracking-legend i.actual', 'Actual-track legend styling is missing.');
need(recorder, 'let landingRateFpm = finite(record.stats?.landingRateFpm);', 'Landing-rate stats are not persisted/recalculated.');
need(recorder, 'const touchdownCandidates = [current, ...airborneWindow]', 'Touchdown vertical-speed sampling is missing.');
need(recorder, 'touchdownGroundSpeedKnots', 'Touchdown ground speed is not recorded.');
need(serviceWorker, "flight-deck-efb-v12011-profile-landing1", 'Service-worker cache was not bumped for flight-profile assets.');

console.log('Flight Deck EFB 1.20.11 QNH altitude, weather overlay, flight profile and landing-rate regression checks passed.');
