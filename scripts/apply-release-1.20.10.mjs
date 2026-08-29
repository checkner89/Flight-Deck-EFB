import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.10');
if (version !== '1.20.10') throw new Error(`1.20.10 release materializer requires package version 1.20.10, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`1.20.10 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.20.10 patch range missing: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('src/server.mjs', (source) => source.replace(/^const APP_VERSION = '[^']+';$/m, `const APP_VERSION = '${version}';`));

await update('src/simbrief-client.mjs', (source) => {
  const replacement = `function position(source) {
  const value = source?.position ?? source?.location ?? source?.coordinate ?? source?.coordinates ?? source;
  if (Array.isArray(value) && value.length >= 2) {
    const first = number(value[0]);
    const second = number(value[1]);
    if (first !== null && second !== null) {
      const latLon = Math.abs(first) <= 90 && Math.abs(second) <= 180 ? { lat: first, lon: second } : null;
      const lonLat = Math.abs(second) <= 90 && Math.abs(first) <= 180 ? { lat: second, lon: first } : null;
      return latLon || lonLat;
    }
  }
  const lat = number(value?.pos_lat ?? value?.latitude ?? value?.lat ?? value?.Lat ?? value?.Latitude);
  const lon = number(value?.pos_long ?? value?.pos_lon ?? value?.longitude ?? value?.lon ?? value?.lng ?? value?.long ?? value?.Lon ?? value?.Longitude);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function navlogFixes(navlog, depth = 0) {
  if (depth > 5 || navlog === undefined || navlog === null) return [];
  if (Array.isArray(navlog)) return navlog;
  if (typeof navlog !== 'object') return [];
  for (const key of ['fix', 'fixes', 'waypoints', 'navlog', 'items', 'points']) {
    const candidate = navlog[key];
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const values = Object.values(candidate);
      if (values.some((entry) => entry && typeof entry === 'object' && position(entry))) return values;
    }
  }
  const direct = Object.values(navlog);
  if (direct.some((entry) => entry && typeof entry === 'object' && position(entry))) return direct;
  for (const candidate of direct) {
    if (!candidate || typeof candidate !== 'object') continue;
    const nested = navlogFixes(candidate, depth + 1);
    if (nested.length) return nested;
  }
  return [];
}

function navlogWaypoints(navlog) {
  const fixes = navlogFixes(navlog).slice(0, 2_000);
  return fixes.map((fix, index) => {
    const coordinates = position(fix);
    if (!coordinates) return null;
    return {
      ident: text(fix.ident || fix.fix || fix.name || fix.id, 20)?.toUpperCase() || \`WP\${index + 1}\`,
      name: text(fix.name || fix.ident, 80),
      type: text(fix.type || fix.fix_type, 24)?.toUpperCase() || null,
      airway: text(fix.via_airway || fix.airway || fix.via, 24)?.toUpperCase() || null,
      ...coordinates,
      altitudeFeet: number(fix.altitude_feet ?? fix.altitude ?? fix.alt),
      plannedSpeedKnots: number(fix.tas ?? fix.speed ?? fix.planned_speed),
      distanceNm: number(fix.distance ?? fix.distance_total ?? fix.dist),
      stage: text(fix.stage || fix.phase, 20)?.toUpperCase() || null,
    };
  }).filter(Boolean);
}

`;
  return replaceBetween(source, 'function position(source) {', 'function collectReadableText(value, maxLength = MAX_BRIEFING_TEXT) {', replacement, 'robust SimBrief navlog parser');
});

await update('public/app.js', (source) => {
  let app = source;

  app = replaceRequired(app,
`  if (visiblePage === 'tracking') {
    const trackingPage = document.querySelector('[data-page="tracking"]');
    const archiveOnly = flightHubTab === 'archive';
    trackingPage?.querySelector('.tracking-map-card')?.toggleAttribute('hidden', archiveOnly);
    trackingPage?.querySelector('.tracking-recorder-card')?.toggleAttribute('hidden', archiveOnly);
    trackingPage?.querySelector('.tracking-detail-layout')?.toggleAttribute('hidden', archiveOnly);
    trackingPage?.querySelector('.tracking-archive-card')?.removeAttribute('hidden');
  }`,
`  if (visiblePage === 'tracking') {
    const trackingPage = document.querySelector('[data-page="tracking"]');
    const archiveOnly = flightHubTab === 'archive';
    trackingPage?.classList.toggle('archive-only', archiveOnly);
    trackingPage?.querySelector('.tracking-map-card')?.toggleAttribute('hidden', archiveOnly);
    trackingPage?.querySelector('.tracking-recorder-card')?.setAttribute('hidden', '');
    trackingPage?.querySelector('.tracking-detail-layout')?.toggleAttribute('hidden', archiveOnly);
    trackingPage?.querySelector('.tracking-sidebar')?.toggleAttribute('hidden', !archiveOnly);
    trackingPage?.querySelector('.tracking-archive-card')?.toggleAttribute('hidden', !archiveOnly);
  }`,
    'tracking/archive layout split');

  if (!app.includes("trackingMap.createPane('trackingSimbrief')")) {
    app = replaceRequired(app,
      "  trackingMap.createPane('trackingPlanned').style.zIndex = '410';\n  trackingMap.createPane('trackingActual').style.zIndex = '430';",
      "  trackingMap.createPane('trackingPlanned').style.zIndex = '410';\n  trackingMap.createPane('trackingSimbrief').style.zIndex = '420';\n  trackingMap.createPane('trackingActual').style.zIndex = '430';",
      'SimBrief map pane');
  }
  if (!app.includes('trackingLayers.simbrief = L.layerGroup()')) {
    app = replaceRequired(app,
      '  trackingLayers.planned = L.layerGroup().addTo(trackingMap);\n  trackingLayers.actual = L.layerGroup().addTo(trackingMap);',
      '  trackingLayers.planned = L.layerGroup().addTo(trackingMap);\n  trackingLayers.simbrief = L.layerGroup().addTo(trackingMap);\n  trackingLayers.actual = L.layerGroup().addTo(trackingMap);',
      'SimBrief map layer');
  }

  const simbriefHelper = `function trackingSimBriefPoints() {
  if (trackingSelectedId) return [];
  const integration = latestState?.integrations?.simbrief || {};
  const plan = integration.flight || {};
  if (!integration.imported) return [];
  return (Array.isArray(plan.waypoints) ? plan.waypoints : [])
    .filter((entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lon)));
}

`;
  if (!app.includes('function trackingSimBriefPoints()')) {
    app = replaceRequired(app, 'function trackingWaypointPoints(record) {', `${simbriefHelper}function trackingWaypointPoints(record) {`, 'SimBrief route helper');
  }

  app = replaceRequired(app,
    '  const planPoints = trackingPlanPoints(record);\n  const actualPoints = trackingDisplayPoints(trackingActualPoints(record));',
    '  const planPoints = trackingPlanPoints(record);\n  const simbriefPoints = trackingSimBriefPoints();\n  const actualPoints = trackingDisplayPoints(trackingActualPoints(record));',
    'SimBrief route render points');

  app = replaceRequired(app,
    "    trackingWaypointPoints(record).map((entry) => [entry.ident, entry.lat, entry.lon, entry.altitudeFeet]),\n    [...weather.entries()],",
    "    trackingWaypointPoints(record).map((entry) => [entry.ident, entry.lat, entry.lon, entry.altitudeFeet]),\n    simbriefPoints.map((entry) => [entry.ident, entry.lat, entry.lon, entry.altitudeFeet]),\n    [...weather.entries()],",
    'SimBrief route render fingerprint');

  app = replaceRequired(app,
    '    trackingLayers.planned.clearLayers();\n    trackingLayers.waypoints.clearLayers();',
    '    trackingLayers.planned.clearLayers();\n    trackingLayers.simbrief?.clearLayers();\n    trackingLayers.waypoints.clearLayers();',
    'SimBrief route layer clear');

  app = replaceRequired(app,
`    if (planPoints.length > 1) {
      L.polyline(planPoints.map((entry) => [entry.lat, entry.lon]), {
        pane: 'trackingPlanned', color: '#2bbdca', opacity: 0.96, weight: 3.4, dashArray: '10 7', lineCap: 'round', interactive: false,
      }).addTo(trackingLayers.planned);
    }`,
`    if (planPoints.length > 1) {
      L.polyline(planPoints.map((entry) => [entry.lat, entry.lon]), {
        pane: 'trackingPlanned', color: '#9ab5c4', opacity: 0.82, weight: 2.5, dashArray: '10 7', lineCap: 'round', interactive: false,
      }).addTo(trackingLayers.planned);
    }
    if (simbriefPoints.length > 1) {
      L.polyline(simbriefPoints.map((entry) => [entry.lat, entry.lon]), {
        pane: 'trackingSimbrief', color: '#18cfc3', opacity: 0.98, weight: 4, lineCap: 'round', lineJoin: 'round', interactive: false,
      }).addTo(trackingLayers.simbrief);
    }`,
    'original SimBrief route layer');

  const detailsReplacement = `function renderTrackingDetails(record) {
  const stats = record?.stats || {};
  const values = [
    ['CALLSIGN', record?.flight?.callsign || '—'],
    ['AIRCRAFT', [record?.flight?.aircraftType, record?.flight?.registration].filter(Boolean).join(' · ') || record?.flight?.aircraftName || '—'],
    ['RUNWAYS', [record?.flight?.departureRunway, record?.flight?.arrivalRunway].filter(Boolean).join(' → ') || '—'],
    ['GATE', record?.flight?.gate || '—'],
    ['TAKEOFF', formatTime(stats.takeoffAt) || '—'],
    ['LANDING', formatTime(stats.landedAt) || '—'],
  ];
  elements.trackingFlightDate.textContent = formatFlightDate(record?.startedAt, { time: false });
  elements.trackingDetailGrid.innerHTML = values.map(([label, value]) => \`<div><dt>\${escapeHtml(label)}</dt><dd>\${escapeHtml(value)}</dd></div>\`).join('');
  const contextIds = ['tracking-context-callsign', 'tracking-context-aircraft', 'tracking-context-runways', 'tracking-context-gate', 'tracking-context-takeoff', 'tracking-context-landing'];
  values.forEach(([, value], index) => {
    const node = document.getElementById(contextIds[index]);
    if (node) node.textContent = value;
  });
  const notes = String(record?.operations?.notes || '').trim();
  const manualChecks = Object.values(record?.operations?.checklist || {}).filter(Boolean).length;
  elements.trackingFlightNotesPanel.hidden = !notes && manualChecks === 0;
  elements.trackingFlightNotesText.textContent = notes || t('noFlightNotes');
  elements.trackingFlightChecklistSummary.textContent = \`\${manualChecks} \${t('manualChecksSaved')}\`;
}

`;
  app = replaceBetween(app, 'function renderTrackingDetails(record) {', 'function renderTrackingRecord(record) {', detailsReplacement, 'map-attached flight context');

  app = replaceRequired(app,
`async function openTrackedFlight(id) {
  if (!id) return;
  trackingSelectedId = id;`,
`async function openTrackedFlight(id) {
  if (!id) return;
  flightHubTab = 'tracking';
  switchModule('flight', true);
  trackingSelectedId = id;`,
    'archive entry opens replay');

  return app;
});

await update('public/index.html', (source) => {
  let html = source;
  if (!html.includes('tracking-context-callsign')) {
    html = replaceRequired(html,
      '<dl class="tracking-live-strip"><div><dt>ALTITUDE</dt><dd id="tracking-altitude">—</dd></div><div><dt>GS / IAS</dt><dd id="tracking-speed">—</dd></div><div><dt>HEADING</dt><dd id="tracking-heading">—</dd></div><div><dt>DISTANCE</dt><dd id="tracking-distance">—</dd></div><div><dt>FLIGHT TIME</dt><dd id="tracking-duration">—</dd></div><div><dt>FUEL USED</dt><dd id="tracking-fuel">—</dd></div></dl>',
      '<dl class="tracking-live-strip"><div><dt>ALTITUDE</dt><dd id="tracking-altitude">—</dd></div><div><dt>GS / IAS</dt><dd id="tracking-speed">—</dd></div><div><dt>HEADING</dt><dd id="tracking-heading">—</dd></div><div><dt>DISTANCE</dt><dd id="tracking-distance">—</dd></div><div><dt>FLIGHT TIME</dt><dd id="tracking-duration">—</dd></div><div><dt>FUEL USED</dt><dd id="tracking-fuel">—</dd></div></dl>\n              <dl class="tracking-flight-strip"><div><dt>CALLSIGN</dt><dd id="tracking-context-callsign">—</dd></div><div><dt>AIRCRAFT</dt><dd id="tracking-context-aircraft">—</dd></div><div><dt>RUNWAYS</dt><dd id="tracking-context-runways">—</dd></div><div><dt>GATE</dt><dd id="tracking-context-gate">—</dd></div><div><dt>TAKEOFF</dt><dd id="tracking-context-takeoff">—</dd></div><div><dt>LANDING</dt><dd id="tracking-context-landing">—</dd></div></dl>',
      'map flight context strip');
  }
  if (!html.includes('<i class="simbrief"></i>')) {
    html = replaceRequired(html,
      '<div class="tracking-legend"><span><i class="planned"></i><b data-i18n="plannedRoute">Planned route</b></span>',
      '<div class="tracking-legend"><span><i class="simbrief"></i><b>SimBrief Route</b></span><span><i class="planned"></i><b data-i18n="plannedRoute">Planned route</b></span>',
      'SimBrief route legend');
  }
  html = html.replace(/\s*<link[^>]+release-1\.20\.10\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/release-1.20.10.css?v=${version}">\n  </head>`);
  html = html.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v12010-tracking-layout1';");
  if (!sw.includes(`'/release-1.20.10.css?v=${version}'`)) {
    sw = sw.replace("  '/manifest.webmanifest',", `  '/release-1.20.10.css?v=${version}',\n  '/manifest.webmanifest',`);
  }
  return sw;
});

const changelogPath = path.join(root, 'CHANGELOG.md');
const notesPath = path.join(root, 'release-notes', '1.20.10.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.10\b/m.test(changelog)) {
  const notes = (await fs.readFile(notesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log('Flight Deck EFB 1.20.10 responsive tracking layout, SimBrief route geometry and compact flight context materialized.');
