import fs from 'node:fs/promises';

const [app, runtime, css] = await Promise.all([
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('public/release-1.22.0.css', 'utf8'),
]);

const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

need(app, 'let openTrafficPopupId = null;', 'Sticky traffic popup state is missing.');
need(app, 'fd124-sticky-traffic', 'Sticky traffic marker handling is missing.');
need(app, "marker.on('click', () => { openTrafficPopupId = key; marker.openPopup(); });", 'Traffic click does not keep the detail popup open.');
need(runtime, 'function renderFlightTimeStrip(record)', 'Planned/actual flight time strip is missing.');
need(runtime, "['TAKEOFF', flight.estimatedOff, stats.takeoffAt]", 'Planned and actual takeoff times are not paired.');
need(runtime, 'fd124-actual-segment', 'Altitude-coloured actual profile segments are missing.');
need(runtime, 'fd124-alt-axis', 'Readable altitude axis labels are missing.');
reject(runtime, 'Archiv: Originalplanung + tatsächliche Spur', 'Retired archive helper line is still visible.');
need(css, '/* 1.24 flight tracking polish */', '1.24 tracking CSS is missing.');
need(css, '.fd124-time-strip', 'Flight time strip styling is missing.');
need(css, '.fd124-actual-segment', 'Altitude profile segment styling is missing.');
need(css, 'background:transparent!important', 'Traffic aircraft still has a forced dark marker background.');

console.log('Flight Deck EFB 1.24 flight tracking regression passed.');
