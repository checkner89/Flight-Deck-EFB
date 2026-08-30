import fs from 'node:fs/promises';

const [pkgRaw, html, app, profile, traffic, i18n, css, sw] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('public/live-traffic.js', 'utf8'),
  fs.readFile('public/i18n.js', 'utf8'),
  fs.readFile('public/release-1.24.2.css', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
]);
const pkg = JSON.parse(pkgRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

if (pkg.version !== '1.24.2') throw new Error(`Expected package version 1.24.2, got ${pkg.version}.`);
need(pkg.scripts['prepare:release'], 'apply-release-1.24.2.mjs', '1.24.2 materializer is missing from prepare:release.');
need(pkg.scripts.dist, 'test-release-1.24.2.mjs', '1.24.2 regression test is missing from dist.');

need(html, '/release-1.24.2.css?v=1.24.2', '1.24.2 CSS is not loaded.');
need(html, 'id="tracking-context-gate"', 'Gate is missing from the tracking context.');
need(html, 'id="tracking-context-departure"', 'Planned/actual Departure is missing.');
need(html, 'id="tracking-context-takeoff"', 'Planned/actual Take-off is missing.');
need(html, 'id="tracking-context-landing"', 'Planned/actual Landing is missing.');
need(html, 'id="tracking-context-arrival"', 'Planned/actual Arrival is missing.');
need(html, 'id="tracking-context-route"', 'Departure/arrival runway context is missing.');
need(html, '<b>Traffic</b>', 'Traffic legend label is not simplified.');

need(app, "elements.appToolbar.hidden = homeActive || activeModule === 'flight';", 'Flug & Tracking app toolbar is still visible.');
need(app, 'historyWindowMs = 15 * 60_000', 'Traffic history is not buffered for 15 minutes.');
need(app, 'function renderSelectedTrafficTrail(trail)', 'Selected traffic route renderer is missing.');
need(app, "color: '#4aa3ff'", 'Selected traffic route does not have its own color.');
need(app, 'selectedTrafficTrailId = key;', 'Clicking traffic does not select its historical route.');
need(app, 'openTrafficPopupId = key;', 'Traffic popup selection is not persisted.');
need(app, 'fd1242-traffic-popup', 'Modern traffic popup is missing.');
need(app, 'trafficPopupMarkup(entry, flightLabel, trail)', 'Traffic popup renderer is missing.');
need(app, 'tracking-ownship-icon', 'Ownship is not rendered as a dedicated aircraft icon.');
need(app, 'fd1242-ownship-plane', 'Ownship red-aircraft visual is missing.');
need(app, 'function trackingScheduleTime(value)', 'SimBrief epoch schedule formatter is missing.');
need(app, 'trackingScheduleMarkup(flight.estimatedOut', 'SimBrief planned Departure is not rendered.');
need(app, 'trackingScheduleMarkup(flight.estimatedOff', 'SimBrief planned Take-off is not rendered.');
need(app, 'trackingScheduleMarkup(flight.estimatedOn', 'SimBrief planned Landing is not rendered.');
need(app, 'trackingScheduleMarkup(flight.estimatedIn', 'SimBrief planned Arrival is not rendered.');
reject(app, '<small>Quelle', 'Traffic popup still exposes a source label.');

need(profile, 'altitudeColors: true,', 'Altitude colouring is not always enabled.');
need(profile, 'fd1242-profile-controls', 'Simplified Flight Profile controls are missing.');
need(profile, 'PROFIL NACH', 'Flight Profile still uses technical X-axis terminology.');
reject(profile, 'renderFlightTimeStrip(record);', 'Schedule times are still duplicated in Flight Profile.');
need(profile, 'Tatsächliche Route', 'Layer control still calls the actual route a flight track.');

need(traffic, "return 'A320-200';", 'A320 traffic type normalization is missing.');
need(traffic, "return 'A320neo';", 'A320neo traffic type normalization is missing.');
need(traffic, "return 'B737-800';", 'B737-800 traffic type normalization is missing.');
need(i18n, "actualTrack: 'Tatsächliche Route'", 'German actual-route label is not updated.');
need(i18n, "actualTrack: 'Actual route'", 'English actual-route label is not updated.');

need(css, '.tracking-legend i.traffic { background: #4aa3ff', 'Traffic legend color is not distinct.');
need(css, '.tracking-legend i.actual { background: linear-gradient', 'Actual-route legend does not communicate altitude colours.');
need(css, '.fd124-time-strip { display: none !important; }', 'Duplicate Flight Profile schedule strip is not hidden.');
need(css, '#fd122-alt-colors,', 'Altitude colour controls are not hidden.');
need(css, 'color: #e33d49;', 'Ownship is not styled red.');
need(css, '.fd1242-traffic-card', 'Modern Traffic popup styling is missing.');
need(sw, "'/release-1.24.2.css?v=1.24.2'", '1.24.2 CSS is missing from the service-worker cache.');

console.log('FLYXORA 1.24.2 tracking schedule + traffic regression passed.');
