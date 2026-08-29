import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.11');
if (version !== '1.20.11') throw new Error(`1.20.11 flight-profile materializer requires package version 1.20.11, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`1.20.11 flight-profile patch anchor missing: ${label}`);
  return source.replace(from, to);
}

/* Derive the touchdown vertical speed from the forced on-ground transition sample.
   The current sample is preferred when MSFS still reports a negative VS at contact;
   otherwise the nearest airborne sample is used. This keeps the result close to the
   actual touchdown without increasing the normal recorder sampling rate. */
await update('src/flight-recorder.mjs', (source) => {
  let next = source;
  if (!next.includes('let landingRateFpm = finite(record.stats?.landingRateFpm);')) {
    next = replaceRequired(
      next,
      "  let takeoffAt = record.stats?.takeoffAt || null;\n  let landedAt = record.stats?.landedAt || null;",
      "  let takeoffAt = record.stats?.takeoffAt || null;\n  let landedAt = record.stats?.landedAt || null;\n  let landingRateFpm = finite(record.stats?.landingRateFpm);\n  let touchdownGroundSpeedKnots = finite(record.stats?.touchdownGroundSpeedKnots);",
      'landing stat state',
    );
  }
  if (!next.includes('const touchdownCandidates = [current, ...airborneWindow]')) {
    next = replaceRequired(
      next,
      "    if (!previous.onGround && current.onGround) landedAt = current.time;",
      "    if (!previous.onGround && current.onGround) {\n      landedAt = current.time;\n      const airborneWindow = track.slice(Math.max(0, index - 4), index).reverse().filter((entry) => !entry.onGround);\n      const touchdownCandidates = [current, ...airborneWindow]\n        .map((entry) => finite(entry?.verticalSpeedFpm))\n        .filter((value) => value !== null);\n      const negativeRate = touchdownCandidates.find((value) => value < 0);\n      const touchdownRate = negativeRate ?? touchdownCandidates[0] ?? null;\n      landingRateFpm = touchdownRate === null ? null : Math.round(touchdownRate);\n      const touchdownSpeed = finite(current.groundSpeedKnots ?? current.groundSpeed)\n        ?? finite(previous.groundSpeedKnots ?? previous.groundSpeed);\n      touchdownGroundSpeedKnots = touchdownSpeed === null ? null : Math.round(touchdownSpeed);\n    }",
      'touchdown transition statistics',
    );
  }
  if (!next.includes('    landingRateFpm,\n    touchdownGroundSpeedKnots,')) {
    next = replaceRequired(
      next,
      "    fuelUsedPounds: fuelStart !== null && fuelEnd !== null ? Math.max(0, Math.round(fuelStart - fuelEnd)) : null,\n    takeoffAt,\n    landedAt,",
      "    fuelUsedPounds: fuelStart !== null && fuelEnd !== null ? Math.max(0, Math.round(fuelStart - fuelEnd)) : null,\n    landingRateFpm,\n    touchdownGroundSpeedKnots,\n    takeoffAt,\n    landedAt,",
      'landing stats return values',
    );
  }
  return next;
});

await update('public/app.js', (source) => {
  let app = source;

  if (!app.includes("trackingProfileChart: $('#tracking-profile-chart')")) {
    app = replaceRequired(
      app,
      "  trackingFuel: $('#tracking-fuel'),",
      "  trackingFuel: $('#tracking-fuel'),\n  trackingProfileChart: $('#tracking-profile-chart'),\n  trackingProfileMax: $('#tracking-profile-max'),\n  trackingLandingRate: $('#tracking-landing-rate'),\n  trackingTouchdownSpeed: $('#tracking-touchdown-speed'),",
      'flight-profile DOM references',
    );
  }

  // Make the flown track unmistakably different from the planned route on both map styles.
  app = app.replace(
    "pane: 'trackingActual', color: '#19e4d5', opacity: 0.96, weight: 4, lineCap: 'round', lineJoin: 'round', interactive: false,",
    "pane: 'trackingActual', color: '#ffb347', opacity: 0.98, weight: 4.5, lineCap: 'round', lineJoin: 'round', interactive: false,",
  );

  if (!app.includes('function renderTrackingAltitudeProfile(record)')) {
    const profileRenderer = `function trackingProfileTimeLabel(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat(localeFor(currentLanguage), {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function renderTrackingAltitudeProfile(record) {
  const chart = elements.trackingProfileChart;
  if (!chart) return;
  const stats = record?.stats || {};
  const track = (record?.track || []).filter((entry) => Number.isFinite(Number(entry?.altitudeFeet)));
  const observedMax = track.length ? Math.max(...track.map((entry) => Math.max(0, Number(entry.altitudeFeet)))) : null;
  const maximumAltitude = Number.isFinite(Number(stats.maxAltitudeFeet)) ? Number(stats.maxAltitudeFeet) : observedMax;
  if (elements.trackingProfileMax) {
    elements.trackingProfileMax.textContent = Number.isFinite(maximumAltitude)
      ? Math.round(maximumAltitude).toLocaleString(localeFor(currentLanguage)) + ' ft'
      : '—';
  }
  const landingRate = Number(stats.landingRateFpm);
  if (elements.trackingLandingRate) {
    elements.trackingLandingRate.textContent = Number.isFinite(landingRate) ? Math.round(landingRate) + ' fpm' : '—';
    elements.trackingLandingRate.classList.toggle('available', Number.isFinite(landingRate));
  }
  const touchdownSpeed = Number(stats.touchdownGroundSpeedKnots);
  if (elements.trackingTouchdownSpeed) {
    elements.trackingTouchdownSpeed.textContent = Number.isFinite(touchdownSpeed) ? Math.round(touchdownSpeed) + ' kt' : '—';
  }

  if (track.length < 2) {
    chart.innerHTML = '<div class="tracking-profile-empty"><strong>FLUGPROFIL</strong><span>Das Höhenprofil entsteht automatisch während des Fluges.</span></div>';
    return;
  }

  const width = 1000;
  const height = 244;
  const left = 58;
  const right = 982;
  const top = 16;
  const bottom = 202;
  const plotWidth = right - left;
  const plotHeight = bottom - top;
  const startMs = Date.parse(track[0].time);
  const endMs = Date.parse(track.at(-1).time);
  const timed = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const maxRaw = Math.max(0, observedMax || 0);
  const step = maxRaw > 30000 ? 10000 : maxRaw > 15000 ? 5000 : maxRaw > 7000 ? 2000 : 1000;
  const ceiling = Math.max(step, Math.ceil(maxRaw / step) * step);
  const stride = Math.max(1, Math.ceil(track.length / 1200));
  const samples = track.filter((entry, index) => index % stride === 0 || index === track.length - 1);
  const xFor = (entry, index) => {
    if (timed) return left + ((Date.parse(entry.time) - startMs) / (endMs - startMs)) * plotWidth;
    return left + (index / Math.max(1, samples.length - 1)) * plotWidth;
  };
  const yFor = (altitude) => bottom - (Math.max(0, Number(altitude) || 0) / ceiling) * plotHeight;
  const points = samples.map((entry, index) => ({ x: xFor(entry, index), y: yFor(entry.altitudeFeet), entry }));
  const linePath = 'M ' + points.map((point) => point.x.toFixed(1) + ' ' + point.y.toFixed(1)).join(' L ');
  const areaPath = linePath + ' L ' + points.at(-1).x.toFixed(1) + ' ' + bottom + ' L ' + points[0].x.toFixed(1) + ' ' + bottom + ' Z';

  const yTicks = [];
  for (let value = 0; value <= ceiling; value += step) yTicks.push(value);
  const yGrid = yTicks.map((value) => {
    const y = yFor(value).toFixed(1);
    const label = value >= 1000 ? Math.round(value / 1000) + 'k' : String(value);
    return '<line class="tracking-profile-gridline" x1="' + left + '" y1="' + y + '" x2="' + right + '" y2="' + y + '"></line>'
      + '<text class="tracking-profile-axis-label" x="' + (left - 10) + '" y="' + (Number(y) + 3) + '" text-anchor="end">' + label + '</text>';
  }).join('');

  const xFractions = [0, .25, .5, .75, 1];
  const xGrid = xFractions.map((fraction) => {
    const x = left + fraction * plotWidth;
    const tickTime = timed ? startMs + fraction * (endMs - startMs) : null;
    const label = tickTime === null ? Math.round(fraction * 100) + '%' : trackingProfileTimeLabel(tickTime);
    return '<line class="tracking-profile-gridline vertical" x1="' + x.toFixed(1) + '" y1="' + top + '" x2="' + x.toFixed(1) + '" y2="' + bottom + '"></line>'
      + '<text class="tracking-profile-axis-label time" x="' + x.toFixed(1) + '" y="228" text-anchor="middle">' + escapeHtml(label) + '</text>';
  }).join('');

  const eventMarkup = (timestamp, label, className) => {
    const time = Date.parse(timestamp);
    if (!timed || !Number.isFinite(time) || time < startMs || time > endMs) return '';
    const x = left + ((time - startMs) / (endMs - startMs)) * plotWidth;
    return '<line class="tracking-profile-event ' + className + '" x1="' + x.toFixed(1) + '" y1="' + top + '" x2="' + x.toFixed(1) + '" y2="' + bottom + '"></line>'
      + '<text class="tracking-profile-event-label ' + className + '" x="' + (x + 6).toFixed(1) + '" y="30">' + escapeHtml(label) + '</text>';
  };
  const takeoffMarker = eventMarkup(stats.takeoffAt, 'TAKEOFF', 'takeoff');
  const landingLabel = Number.isFinite(landingRate) ? 'TD ' + Math.round(landingRate) + ' fpm' : 'LANDING';
  const landingMarker = eventMarkup(stats.landedAt, landingLabel, 'landing');
  const lastPoint = points.at(-1);

  chart.innerHTML = '<svg class="tracking-profile-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Höhenprofil des tatsächlich geflogenen Fluges">'
    + '<defs><linearGradient id="tracking-profile-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffb347" stop-opacity=".28"></stop><stop offset="100%" stop-color="#ffb347" stop-opacity=".02"></stop></linearGradient></defs>'
    + yGrid + xGrid
    + '<path class="tracking-profile-area" d="' + areaPath + '"></path>'
    + '<path class="tracking-profile-line" d="' + linePath + '"></path>'
    + takeoffMarker + landingMarker
    + '<circle class="tracking-profile-current" cx="' + lastPoint.x.toFixed(1) + '" cy="' + lastPoint.y.toFixed(1) + '" r="4.5"></circle>'
    + '</svg><div class="tracking-profile-tooltip" hidden></div>';

  const svg = chart.querySelector('.tracking-profile-svg');
  const tooltip = chart.querySelector('.tracking-profile-tooltip');
  if (!svg || !tooltip) return;
  svg.addEventListener('pointermove', (event) => {
    const bounds = svg.getBoundingClientRect();
    if (!bounds.width) return;
    const localX = Math.max(left, Math.min(right, ((event.clientX - bounds.left) / bounds.width) * width));
    const fraction = Math.max(0, Math.min(1, (localX - left) / plotWidth));
    let entry;
    if (timed) {
      const target = startMs + fraction * (endMs - startMs);
      let low = 0;
      let high = track.length - 1;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (Date.parse(track[mid].time) < target) low = mid + 1;
        else high = mid;
      }
      entry = track[low];
    } else {
      entry = track[Math.round(fraction * (track.length - 1))];
    }
    if (!entry) return;
    const altitude = Math.round(Number(entry.altitudeFeet) || 0).toLocaleString(localeFor(currentLanguage));
    const vs = Number(entry.verticalSpeedFpm);
    const gs = Number(entry.groundSpeedKnots ?? entry.groundSpeed);
    tooltip.textContent = trackingProfileTimeLabel(entry.time) + ' · ' + altitude + ' ft'
      + (Number.isFinite(vs) ? ' · VS ' + Math.round(vs) + ' fpm' : '')
      + (Number.isFinite(gs) ? ' · GS ' + Math.round(gs) + ' kt' : '');
    tooltip.hidden = false;
    tooltip.style.left = Math.max(8, Math.min(chart.clientWidth - tooltip.offsetWidth - 8, event.clientX - bounds.left + 12)) + 'px';
    tooltip.style.top = Math.max(8, event.clientY - bounds.top - 42) + 'px';
  });
  svg.addEventListener('pointerleave', () => { tooltip.hidden = true; });
}

`;
    app = replaceRequired(app, 'function renderTrackingDetails(record) {', profileRenderer + 'function renderTrackingDetails(record) {', 'altitude profile renderer');
  }

  if (!app.includes('  renderTrackingAltitudeProfile(record);\n  const stats = record?.stats || {};')) {
    app = replaceRequired(
      app,
      "function renderTrackingDetails(record) {\n  const stats = record?.stats || {};",
      "function renderTrackingDetails(record) {\n  renderTrackingAltitudeProfile(record);\n  const stats = record?.stats || {};",
      'flight-profile render hook',
    );
  }

  return app;
});

await update('public/index.html', (source) => {
  if (source.includes('id="tracking-profile-chart"')) return source;
  const profileCard = `              <article class="efb-card tracking-profile-card">
                <div class="section-title"><h2>Flugprofil</h2><span>ALTITUDE / TIME</span></div>
                <div class="tracking-profile-metrics">
                  <span><small>MAX ALT</small><strong id="tracking-profile-max">—</strong></span>
                  <span><small>LANDERATE</small><strong id="tracking-landing-rate">—</strong></span>
                  <span><small>TOUCHDOWN GS</small><strong id="tracking-touchdown-speed">—</strong></span>
                </div>
                <div id="tracking-profile-chart" class="tracking-profile-chart"><div class="tracking-profile-empty"><strong>FLUGPROFIL</strong><span>Das Höhenprofil entsteht automatisch während des Fluges.</span></div></div>
              </article>
`;
  return replaceRequired(
    source,
    '            <section class="tracking-detail-layout">\n              <article class="efb-card tracking-route-card">',
    '            <section class="tracking-detail-layout">\n' + profileCard + '              <article class="efb-card tracking-route-card">',
    'flight-profile card',
  );
});

await update('public/release-1.20.11.css', (source) => {
  if (source.includes('/* Flight profile / touchdown analytics */')) return source;
  return `${source.trimEnd()}\n\n/* Flight profile / touchdown analytics */
.tracking-legend i.actual {
  background: #ffb347 !important;
  box-shadow: 0 0 0 1px rgba(255, 179, 71, .18);
}

[data-page="tracking"] .tracking-profile-card {
  grid-column: 1 / -1;
  min-width: 0;
  min-height: 286px;
  padding-bottom: 14px;
  overflow: hidden;
}

.tracking-profile-card > .section-title {
  padding-bottom: 8px;
}

.tracking-profile-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 10px;
}

.tracking-profile-metrics > span {
  display: grid;
  gap: 3px;
  min-width: 126px;
  padding: 8px 11px;
  border: 1px solid rgba(151, 193, 216, .14);
  border-radius: 9px;
  background: rgba(122, 154, 170, .055);
}

.tracking-profile-metrics small {
  color: var(--fd-ui-muted, #7893a1);
  font-size: 8px;
  font-weight: 850;
  letter-spacing: .1em;
}

.tracking-profile-metrics strong {
  color: var(--fd-ui-text, #edf8fb);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

#tracking-landing-rate.available {
  color: #ffb347;
}

.tracking-profile-chart {
  position: relative;
  min-height: 228px;
  margin: 0 12px;
  overflow: hidden;
  border: 1px solid rgba(151, 193, 216, .12);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(10, 29, 40, .58), rgba(7, 21, 31, .22));
}

.tracking-profile-svg {
  display: block;
  width: 100%;
  height: 228px;
  touch-action: pan-y;
}

.tracking-profile-gridline {
  stroke: rgba(147, 179, 196, .13);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.tracking-profile-gridline.vertical {
  stroke-dasharray: 3 7;
  stroke: rgba(147, 179, 196, .085);
}

.tracking-profile-axis-label {
  fill: #718c9a;
  font: 750 9px/1 Inter, system-ui, sans-serif;
  letter-spacing: .02em;
}

.tracking-profile-axis-label.time {
  font-size: 8px;
}

.tracking-profile-area {
  fill: url(#tracking-profile-fill);
  stroke: none;
}

.tracking-profile-line {
  fill: none;
  stroke: #ffb347;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  filter: drop-shadow(0 0 5px rgba(255, 179, 71, .22));
}

.tracking-profile-current {
  fill: #ffcf8b;
  stroke: #17252d;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.tracking-profile-event {
  stroke-width: 1.5;
  stroke-dasharray: 4 5;
  vector-effect: non-scaling-stroke;
}
.tracking-profile-event.takeoff { stroke: rgba(74, 242, 179, .78); }
.tracking-profile-event.landing { stroke: rgba(255, 179, 71, .95); }
.tracking-profile-event-label {
  font: 900 8px/1 Inter, system-ui, sans-serif;
  letter-spacing: .07em;
}
.tracking-profile-event-label.takeoff { fill: #70ddb2; }
.tracking-profile-event-label.landing { fill: #ffbd61; }

.tracking-profile-tooltip {
  position: absolute;
  z-index: 4;
  max-width: calc(100% - 16px);
  padding: 6px 9px;
  border: 1px solid rgba(255, 179, 71, .34);
  border-radius: 7px;
  background: rgba(5, 18, 27, .95);
  color: #eef8fb;
  box-shadow: 0 8px 24px rgba(0,0,0,.28);
  pointer-events: none;
  font-size: 9px;
  font-weight: 780;
  line-height: 1.25;
  white-space: nowrap;
}

.tracking-profile-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 6px;
  min-height: 226px;
  color: var(--fd-ui-muted, #7893a1);
  text-align: center;
}
.tracking-profile-empty strong { color: var(--fd-ui-text, #edf8fb); font-size: 11px; letter-spacing: .1em; }
.tracking-profile-empty span { font-size: 9px; }

html[data-theme="light"] .tracking-profile-chart {
  border-color: #cddae0;
  background: linear-gradient(180deg, #fbfdfe, #f2f7f9);
}
html[data-theme="light"] .tracking-profile-metrics > span { border-color: #d2dde2; background: #f7fafb; }
html[data-theme="light"] .tracking-profile-metrics strong { color: #19313d; }
html[data-theme="light"] .tracking-profile-axis-label { fill: #617b87; }
html[data-theme="light"] .tracking-profile-gridline { stroke: rgba(62, 91, 105, .16); }
html[data-theme="light"] .tracking-profile-tooltip { background: rgba(248, 252, 253, .97); color: #19313d; box-shadow: 0 8px 20px rgba(33, 61, 74, .18); }
html[data-theme="light"] .tracking-profile-current { stroke: #ffffff; }

@media (max-width: 820px) {
  [data-page="tracking"] .tracking-profile-card { min-height: 260px; }
  .tracking-profile-chart, .tracking-profile-svg { min-height: 210px; height: 210px; }
  .tracking-profile-metrics > span { flex: 1 1 110px; min-width: 0; }
}
`;
});

await update('public/service-worker.js', (source) => source.replace(
  /^const CACHE_NAME = .*;$/m,
  "const CACHE_NAME = 'flight-deck-efb-v12011-profile-landing1';",
));

await update('CHANGELOG.md', (source) => {
  if (!/^##\s+1\.20\.11\b/m.test(source)) return source;
  if (source.includes('interaktives **Flugprofil**')) return source;
  return source.replace(
    /(^##\s+1\.20\.11[^\n]*\n\n)/m,
    `$1- Die **tatsächlich geflogene Route** wird auf der Karte jetzt deutlich in Amber dargestellt und ist damit klar von der geplanten Route getrennt.\n- Ein neues interaktives **Flugprofil** zeigt die tatsächlich geflogene Höhe über der Flugzeit; per Maus/Touch lassen sich Zeitpunkt, Höhe, Vertical Speed und Ground Speed ablesen.\n- Die **Landerate** wird beim Übergang von airborne auf on-ground aus der MSFS Vertical Speed am Touchdown bzw. dem nächstgelegenen airborne Sample ermittelt und zusammen mit der Touchdown Ground Speed gespeichert und angezeigt.\n`,
  );
});

console.log('Flight Deck EFB 1.20.11 actual-track styling, altitude profile and landing-rate analytics materialized.');
