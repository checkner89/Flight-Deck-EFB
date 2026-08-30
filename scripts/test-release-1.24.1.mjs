import fs from 'node:fs/promises';

const [html, app, tracking, lifecycle, css] = await Promise.all([
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('public/release-1.21.0.js', 'utf8'),
  fs.readFile('public/release-1.22.0.css', 'utf8'),
]);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };

need(html, 'id="tracking-basemap-select"', 'Compact map-style selector is missing.');
need(html, '<strong>FLYXORA</strong>', 'FLYXORA wordmark is missing.');
need(html, '/assets/flyxora-mark.svg', 'FLYXORA brand mark is missing.');
need(html, 'SIMULATION EFB', 'FLYXORA product descriptor is missing.');
need(html, 'fd1241-layer-menu', 'Layer dropdown is missing.');
need(html, 'id="tracking-weather-toggle"', 'Native weather-overlay control was removed.');
need(html, 'id="tracking-waypoints-toggle"', 'Native waypoint control was removed.');
need(html, 'fd1241-time-value', 'Top Take-off/Landing PLAN/IST layout is missing.');
need(app, '<em>PLAN</em>', 'Planned Take-off/Landing values are not rendered in the top strip.');
need(app, 'if (index >= 4) node.innerHTML = value', 'Top Take-off/Landing markup is escaped instead of rendered.');
need(tracking, "popover.append(bar)", 'Map layers are not moved into the dropdown.');
need(tracking, 'function bindCompactMapControls()', 'Compact map selector is not wired.');
need(lifecycle, "document.querySelector('#tracking-schedule-card')?.remove();", 'Redundant schedule card is still created.');
need(css, '/* 1.24.1 tracking layout */', '1.24.1 layout CSS is missing.');
need(css, '.tracking-legend{top:88px!important;bottom:auto!important', 'Map legend can still overlap the data strips.');
need(css, '.tracking-profile-card{padding:22px!important}', 'Flight profile spacing was not relaxed.');
need(css, '.brand-mark img{display:block', 'FLYXORA vector mark styling is missing.');

console.log('Flight Deck EFB 1.24.1 tracking layout regression passed.');
