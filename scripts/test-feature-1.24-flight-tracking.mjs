import fs from 'node:fs/promises';

const [pkgRaw, app, runtime, css] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('public/release-1.22.0.css', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };
const modernTraffic = ['1.24.2', '1.24.3'].includes(pkg.version);

need(app, 'let openTrafficPopupId = null;', 'Sticky traffic popup state is missing.');
if (modernTraffic) {
  if (!app.includes('fd1242-traffic-popup')) {
    const start = app.indexOf('function renderTrackingTraffic');
    const snippet = start >= 0 ? app.slice(start, start + 5000) : app.slice(Math.max(0, app.indexOf('function updateTrafficTrails')), Math.max(0, app.indexOf('function updateTrafficTrails')) + 5000);
    throw new Error(`Modern sticky traffic popup handling is missing. Generated traffic block:\n${snippet}`);
  }
  need(app, 'selectedTrafficTrailId = key;', 'Selected traffic trail handling is missing.');
  need(app, 'openTrafficPopupId = key;', 'Traffic click does not persist the detail popup.');
} else {
  need(app, 'fd124-sticky-traffic', 'Sticky traffic marker handling is missing.');
  need(app, "marker.on('click', () => { openTrafficPopupId = key; marker.openPopup(); });", 'Traffic click does not keep the detail popup open.');
}
reject(app, '  renderTrackingAltitudeProfile(record);\n  const stats = record?.stats || {};', 'Legacy altitude profile renderer is still active behind the enhanced profile.');
need(runtime, 'function renderFlightTimeStrip(record)', 'Planned/actual flight time strip capability is missing.');
need(runtime, "['TAKEOFF', flight.estimatedOff, stats.takeoffAt]", 'Planned and actual takeoff times are not paired.');
need(runtime, 'fd124-actual-segment', 'Altitude-coloured actual profile segments are missing.');
need(runtime, 'fd124-alt-axis', 'Readable altitude axis labels are missing.');
reject(runtime, 'Archiv: Originalplanung + tatsächliche Spur', 'Retired archive helper line is still visible.');
need(css, '/* 1.24 flight tracking polish */', '1.24 tracking CSS is missing.');
need(css, '.tracking-profile-card>.section-title>span{display:none!important}', 'Obsolete profile subtitle is still visible.');
need(css, '.fd124-time-strip', 'Flight time strip styling is missing.');
need(css, '.fd124-actual-segment', 'Altitude profile segment styling is missing.');
need(css, 'background:transparent!important', 'Traffic aircraft still has a forced dark marker background.');

console.log(`Flight Deck EFB ${pkg.version} flight tracking regression passed.`);
