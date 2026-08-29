import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.9');

if (version !== '1.20.9') throw new Error(`1.20.9 release materializer requires package version 1.20.9, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) {
    if (source.includes(to)) return source;
    throw new Error(`1.20.9 patch anchor missing: ${label}`);
  }
  return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    if (source.includes(replacement.trim().slice(0, 80))) return source;
    throw new Error(`1.20.9 patch range missing: ${label}`);
  }
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('src/server.mjs', (source) => source.replace(/^const APP_VERSION = '[^']+';$/m, `const APP_VERSION = '${version}';`));

/*
 * Progress used to select the nearest route waypoint. With only origin and
 * destination available this made the origin remain the "next" point until
 * halfway through the flight, so remaining distance became larger than the
 * planned route and progress was clamped to 0 %. Project the aircraft onto
 * the route polyline instead.
 */
await update('public/flight-phases.js', (source) => {
  const replacement = `export function calculateFlightProgress(state = {}) {
  const aircraft = state.aircraft || {};
  const points = routePoints(state);
  const flight = simBriefFlight(state);
  const result = {
    routePointCount: points.length,
    totalRouteNm: points.length > 1 ? sumRoute(points) : null,
    remainingRouteNm: null,
    completedPercent: null,
    destinationDistanceNm: distanceNm(aircraft, destinationPoint(state)),
    nextWaypoint: null,
    nextWaypointDistanceNm: null,
    etaSeconds: null,
    fuelRemainingPounds: finite(aircraft.fuelWeightPounds),
    plannedBlockFuelPounds: finite(flight.blockFuelPounds),
    plannedTripFuelPounds: finite(flight.tripFuelPounds),
    reserveFuelPounds: finite(flight.reserveFuelPounds),
    taxiFuelPounds: finite(flight.taxiFuelPounds),
    fuelUsedPounds: null,
    fuelDeltaToPlannedPounds: null,
    plannedRemainingTripBurnPounds: null,
    projectedLandingFuelPounds: null,
    projectedReserveMarginPounds: null,
  };
  if (result.plannedBlockFuelPounds !== null && result.fuelRemainingPounds !== null) {
    result.fuelUsedPounds = Math.max(0, result.plannedBlockFuelPounds - result.fuelRemainingPounds);
    if (result.plannedTripFuelPounds !== null) result.fuelDeltaToPlannedPounds = result.plannedTripFuelPounds - result.fuelUsedPounds;
  }
  if (!validPoint(aircraft) || points.length === 0) return result;

  if (points.length === 1) {
    result.nextWaypoint = points[0];
    result.nextWaypointDistanceNm = distanceNm(aircraft, points[0]);
    result.remainingRouteNm = result.nextWaypointDistanceNm;
  } else if (result.totalRouteNm && result.totalRouteNm > 0) {
    const aircraftLat = Number(aircraft.lat);
    const aircraftLon = Number(aircraft.lon);
    const longitudeDelta = (value) => {
      let delta = Number(value) - aircraftLon;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      return delta;
    };
    const longitudeScale = Math.max(0.0001, Math.cos(aircraftLat * Math.PI / 180));
    const local = (point) => ({
      x: longitudeDelta(point.lon) * longitudeScale,
      y: Number(point.lat) - aircraftLat,
    });

    let completedBeforeSegment = 0;
    let best = null;
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = local(points[index]);
      const end = local(points[index + 1]);
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      const segmentNm = distanceNm(points[index], points[index + 1]) || 0;
      const rawProgress = lengthSquared > 0
        ? ((-start.x * dx) + (-start.y * dy)) / lengthSquared
        : 0;
      const segmentProgress = Math.max(0, Math.min(1, rawProgress));
      const projected = {
        lat: Number(points[index].lat) + segmentProgress * (Number(points[index + 1].lat) - Number(points[index].lat)),
        lon: Number(points[index].lon) + segmentProgress * (Number(points[index + 1].lon) - Number(points[index].lon)),
      };
      const crossTrackNm = distanceNm(aircraft, projected) ?? Infinity;
      const candidate = {
        segmentIndex: index,
        segmentProgress,
        crossTrackNm,
        completedNm: completedBeforeSegment + segmentNm * segmentProgress,
      };
      if (!best || candidate.crossTrackNm < best.crossTrackNm) best = candidate;
      completedBeforeSegment += segmentNm;
    }

    if (best) {
      const nextIndex = Math.min(points.length - 1, best.segmentIndex + 1);
      result.nextWaypoint = points[nextIndex];
      result.nextWaypointDistanceNm = distanceNm(aircraft, result.nextWaypoint);
      result.remainingRouteNm = Math.max(0, result.totalRouteNm - best.completedNm);
      result.completedPercent = Math.max(0, Math.min(100, best.completedNm / result.totalRouteNm * 100));
    }
  }

  const groundSpeed = finite(aircraft.groundSpeed);
  if (groundSpeed !== null && groundSpeed >= 30 && result.remainingRouteNm !== null) {
    result.etaSeconds = Math.round(result.remainingRouteNm / groundSpeed * 3_600);
  }
  if (result.plannedTripFuelPounds !== null
    && result.fuelRemainingPounds !== null
    && result.totalRouteNm > 0
    && result.remainingRouteNm !== null) {
    const remainingRatio = Math.max(0, Math.min(1, result.remainingRouteNm / result.totalRouteNm));
    result.plannedRemainingTripBurnPounds = result.plannedTripFuelPounds * remainingRatio;
    result.projectedLandingFuelPounds = result.fuelRemainingPounds - result.plannedRemainingTripBurnPounds;
    if (result.reserveFuelPounds !== null) {
      result.projectedReserveMarginPounds = result.projectedLandingFuelPounds - result.reserveFuelPounds;
    }
  }
  return result;
}

`;
  return replaceBetween(source, 'export function calculateFlightProgress(state = {}) {', 'function timeFromSimBrief(value) {', replacement, 'route progress projection');
});

/* Keep live SayIntentions/MSFS plan data usable even when a SimBrief object is
 * present but was not explicitly imported for this flight. */
await update('src/flight-recorder.mjs', (source) => {
  const replacement = `function planFromState(state) {
  const simbrief = state.integrations?.simbrief || {};
  const planned = simbrief.flight || {};
  const live = state.flight || {};
  const preferSimBrief = Boolean(simbrief.imported && planned.origin && planned.destination);
  const present = (value) => value !== undefined && value !== null && value !== '';
  const choose = (plannedValue, liveValue) => preferSimBrief
    ? (present(plannedValue) ? plannedValue : liveValue)
    : (present(liveValue) ? liveValue : plannedValue);
  const plannedWaypoints = Array.isArray(planned.waypoints) ? planned.waypoints : [];
  const liveWaypoints = Array.isArray(live.waypoints) ? live.waypoints : [];
  const sourceWaypoints = preferSimBrief
    ? (plannedWaypoints.length ? plannedWaypoints : liveWaypoints)
    : (liveWaypoints.length ? liveWaypoints : plannedWaypoints);
  const waypoints = sourceWaypoints.map(waypoint).filter(Boolean);
  const rawOriginPosition = choose(planned.originPosition, live.originPosition);
  const rawDestinationPosition = choose(planned.destinationPosition, live.destinationPosition);
  return {
    source: preferSimBrief ? 'simbrief' : live.flightPlanRoute ? 'sayintentions' : planned.route ? 'simbrief' : 'simulator',
    route: text(choose(planned.route, live.flightPlanRoute ?? live.route), 8_000),
    sid: upper(choose(planned.sid, live.sid), 32),
    star: upper(choose(planned.star, live.star), 32),
    initialAltitude: text(choose(planned.initialAltitude, live.initialAltitude), 20),
    waypoints,
    originPosition: validPoint(rawOriginPosition)
      ? { lat: Number(rawOriginPosition.lat), lon: Number(rawOriginPosition.lon) }
      : null,
    destinationPosition: validPoint(rawDestinationPosition)
      ? { lat: Number(rawDestinationPosition.lat), lon: Number(rawDestinationPosition.lon) }
      : null,
  };
}

`;
  return replaceBetween(source, 'function planFromState(state) {', 'function flightFromState(state) {', replacement, 'flight recorder plan merge');
});

await update('public/app.js', (source) => {
  let app = source;

  app = replaceRequired(
    app,
    "let flightHubTab = 'operations';",
    "let flightHubTab = 'tracking';",
    'tracking-first hub state',
  );
  app = replaceRequired(
    app,
    "  if (moduleName === 'flight' && !preserveFlightHubTab) flightHubTab = 'operations';",
    "  if (moduleName === 'flight' && !preserveFlightHubTab) flightHubTab = 'tracking';",
    'tracking-first module navigation',
  );

  app = replaceRequired(
    app,
    "  trackingBasemapButtons: [...document.querySelectorAll('[data-tracking-basemap]')],\n  trackingFollow: $('#tracking-follow'),",
    "  trackingBasemapButtons: [...document.querySelectorAll('[data-tracking-basemap]')],\n  trackingWaypointsToggle: $('#tracking-waypoints-toggle'),\n  trackingFollow: $('#tracking-follow'),",
    'waypoint toggle element',
  );
  app = replaceRequired(
    app,
    "  trackingArchiveCount: $('#tracking-archive-count'),\n  flightArchiveList: $('#flight-archive-list'),",
    "  trackingArchiveCount: $('#tracking-archive-count'),\n  trackingArchiveDeleteAll: $('#tracking-archive-delete-all'),\n  flightArchiveList: $('#flight-archive-list'),",
    'archive bulk delete element',
  );

  app = replaceRequired(
    app,
    "let trackingBasemap = 'map';\nlet trackingFollowAircraft = true;",
    "let trackingBasemap = 'map';\nlet trackingWaypointsVisible = localStorage.getItem('flight-deck-tracking-waypoints') !== 'hidden';\nlet trackingFollowAircraft = true;",
    'waypoint visibility state',
  );

  const waypointFunctions = `function syncTrackingWaypointButton() {
  if (!elements.trackingWaypointsToggle) return;
  elements.trackingWaypointsToggle.classList.toggle('active', trackingWaypointsVisible);
  elements.trackingWaypointsToggle.setAttribute('aria-pressed', trackingWaypointsVisible ? 'true' : 'false');
}

function setTrackingWaypointsVisible(visible) {
  trackingWaypointsVisible = Boolean(visible);
  localStorage.setItem('flight-deck-tracking-waypoints', trackingWaypointsVisible ? 'visible' : 'hidden');
  syncTrackingWaypointButton();
  if (!trackingMap || !trackingLayers.waypoints) return;
  if (trackingWaypointsVisible) {
    if (!trackingMap.hasLayer(trackingLayers.waypoints)) trackingLayers.waypoints.addTo(trackingMap);
  } else if (trackingMap.hasLayer(trackingLayers.waypoints)) {
    trackingMap.removeLayer(trackingLayers.waypoints);
  }
}

`;
  if (!app.includes('function setTrackingWaypointsVisible(visible)')) {
    app = replaceRequired(app, 'function setTrackingBasemap(mode) {', `${waypointFunctions}function setTrackingBasemap(mode) {`, 'waypoint visibility functions');
  }

  app = replaceRequired(
    app,
    "  trackingLayers.waypoints = L.layerGroup().addTo(trackingMap);",
    "  trackingLayers.waypoints = L.layerGroup();\n  if (trackingWaypointsVisible) trackingLayers.waypoints.addTo(trackingMap);\n  syncTrackingWaypointButton();",
    'waypoint layer visibility',
  );

  const trackingPointHelpers = `function trackingWaypointPoints(record) {
  const recorded = (record?.plan?.waypoints || [])
    .filter((entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lon)));
  if (trackingSelectedId || recorded.length) return recorded;
  const state = latestState || {};
  const simbriefIntegration = state.integrations?.simbrief || {};
  const planned = simbriefIntegration.flight || {};
  const live = state.flight || {};
  const preferSimBrief = Boolean(simbriefIntegration.imported && planned.origin && planned.destination);
  const source = preferSimBrief
    ? (Array.isArray(planned.waypoints) ? planned.waypoints : [])
    : (Array.isArray(live.waypoints) && live.waypoints.length ? live.waypoints : (Array.isArray(planned.waypoints) ? planned.waypoints : []));
  return source.filter((entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lon)));
}

function trackingPlanPoints(record) {
  const waypoints = trackingWaypointPoints(record);
  if (waypoints.length > 1) return waypoints;
  if (trackingSelectedId) {
    return [record?.plan?.originPosition, record?.plan?.destinationPosition]
      .filter((entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lon)));
  }
  const state = latestState || {};
  const simbriefIntegration = state.integrations?.simbrief || {};
  const planned = simbriefIntegration.flight || {};
  const live = state.flight || {};
  const preferSimBrief = Boolean(simbriefIntegration.imported && planned.origin && planned.destination);
  const origin = record?.plan?.originPosition
    || (preferSimBrief ? planned.originPosition : live.originPosition)
    || planned.originPosition;
  const destination = record?.plan?.destinationPosition
    || (preferSimBrief ? planned.destinationPosition : live.destinationPosition)
    || planned.destinationPosition;
  return [origin, destination]
    .filter((entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lon)));
}

`;
  app = replaceBetween(app, 'function trackingPlanPoints(record) {', 'function trackingActualPoints(record) {', trackingPointHelpers, 'tracking route point fallback');

  app = app.replace(
    "  const latest = record?.weather?.at(-1) || {};",
    "  const effectiveWeather = record?.weather?.length ? record.weather : (!trackingSelectedId && latestState ? trackingFallbackRecord(latestState).weather : []);\n  const latest = effectiveWeather?.at(-1) || {};",
  );
  app = app.replace(
    "  const waypoints = record?.plan?.waypoints || [];\n  elements.trackingWaypointCount.textContent = `${waypoints.length} WPT`;",
    "  const waypoints = trackingWaypointPoints(record);\n  elements.trackingWaypointCount.textContent = `${waypoints.length} WPT`;",
  );
  app = app.replace(
    "    (record?.plan?.waypoints || []).map((entry) => [entry.ident, entry.lat, entry.lon, entry.altitudeFeet]),",
    "    trackingWaypointPoints(record).map((entry) => [entry.ident, entry.lat, entry.lon, entry.altitudeFeet]),",
  );
  app = app.replace(
    "    for (const [index, entry] of (record?.plan?.waypoints || []).entries()) {",
    "    for (const [index, entry] of trackingWaypointPoints(record).entries()) {",
  );
  app = app.replace(
    "        pane: 'trackingPlanned', color: '#b6d0df', opacity: 0.78, weight: 2.5, dashArray: '9 8', lineCap: 'round', interactive: false,",
    "        pane: 'trackingPlanned', color: '#2bbdca', opacity: 0.96, weight: 3.4, dashArray: '10 7', lineCap: 'round', interactive: false,",
  );

  /* A removed manual-start button was still dereferenced by the recorder
     renderer. That exception prevented route, weather, detail and map rendering. */
  app = replaceRequired(
    app,
    '  elements.trackingStart.hidden = recording || archived;',
    '  if (elements.trackingStart) elements.trackingStart.hidden = recording || archived;',
    'tracking recorder null guard',
  );

  const deleteAllFunction = `async function deleteAllTrackedFlights() {
  const button = elements.trackingArchiveDeleteAll;
  if (button) button.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/flights'), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Flight archive could not be loaded.');
    const currentId = data.current?.id || null;
    const deletable = (data.flights || []).filter((flight) => flight?.id && flight.id !== currentId && flight.status !== 'recording');
    if (!deletable.length) {
      window.alert('Es gibt keine abgeschlossenen Flüge zum Löschen. Der aktuelle Flug bleibt erhalten.');
      return;
    }
    if (!window.confirm(`${deletable.length} abgeschlossene Flug${deletable.length === 1 ? '' : 'e'} aus dem Flight Archiv löschen? Der aktuelle Flug bleibt erhalten.`)) return;
    const results = await Promise.allSettled(deletable.map(async (flight) => {
      const deletion = await fetch(authenticatedUrl(`/api/flights/${encodeURIComponent(flight.id)}`), { method: 'DELETE' });
      const body = await deletion.json().catch(() => ({}));
      if (!deletion.ok) throw new Error(body.error || `Flight ${flight.id} could not be deleted.`);
      return flight.id;
    }));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) throw new Error(`${failures.length} Flug${failures.length === 1 ? '' : 'e'} konnten nicht gelöscht werden.`);
    trackingSelectedId = null;
    trackingRenderedKey = '';
    trackingStaticRenderKey = '';
    await refreshTrackingData({ force: true });
  } catch (error) {
    if (elements.trackingRecordMessage) elements.trackingRecordMessage.textContent = error.message;
    window.alert(error.message);
  } finally {
    if (button) button.disabled = false;
  }
}

`;
  if (!app.includes('async function deleteAllTrackedFlights()')) {
    app = replaceRequired(app, 'async function deleteTrackedFlight() {', `${deleteAllFunction}async function deleteTrackedFlight() {`, 'archive bulk delete function');
  }

  if (!app.includes("elements.trackingWaypointsToggle?.addEventListener('click'")) {
    app = replaceRequired(
      app,
      "for (const button of elements.trackingBasemapButtons) {\n  button.addEventListener('click', () => setTrackingBasemap(button.dataset.trackingBasemap));\n}\nelements.trackingFollow.addEventListener('click', () => {",
      "for (const button of elements.trackingBasemapButtons) {\n  button.addEventListener('click', () => setTrackingBasemap(button.dataset.trackingBasemap));\n}\nelements.trackingWaypointsToggle?.addEventListener('click', () => setTrackingWaypointsVisible(!trackingWaypointsVisible));\nelements.trackingFollow.addEventListener('click', () => {",
      'waypoint toggle handler',
    );
  }
  if (!app.includes("elements.trackingArchiveDeleteAll?.addEventListener('click'")) {
    app = replaceRequired(
      app,
      "elements.trackingDelete.addEventListener('click', deleteTrackedFlight);",
      "elements.trackingDelete.addEventListener('click', deleteTrackedFlight);\nelements.trackingArchiveDeleteAll?.addEventListener('click', deleteAllTrackedFlights);",
      'archive bulk delete handler',
    );
  }
  return app;
});

await update('public/flight-overlay.js', (source) => source.replace(
  "function openLiveMap() {\n  openExistingModule('flight');",
  "function openLiveMap() {\n  openExistingModule('tracking');",
));

await update('public/index.html', (source) => {
  let html = source;
  if (!html.includes('id="tracking-waypoints-toggle"')) {
    html = replaceRequired(
      html,
      '<div class="tracking-basemap-selector" role="group" aria-label="Map style"><button type="button" class="active" data-tracking-basemap="map" data-i18n="mapView">MAP</button><button type="button" data-tracking-basemap="satellite" data-i18n="satelliteView">SATELLITE</button></div>\n                  <button id="tracking-follow"',
      '<div class="tracking-basemap-selector" role="group" aria-label="Map style"><button type="button" class="active" data-tracking-basemap="map" data-i18n="mapView">MAP</button><button type="button" data-tracking-basemap="satellite" data-i18n="satelliteView">SATELLITE</button></div>\n                  <button id="tracking-waypoints-toggle" class="tracking-control active" type="button" aria-pressed="true">WEGPUNKTE</button>\n                  <button id="tracking-follow"',
      'tracking waypoint button markup',
    );
  }
  if (!html.includes('id="tracking-archive-delete-all"')) {
    html = replaceRequired(
      html,
      '<div class="section-title"><h2 data-i18n="archive">Flight archive</h2><span id="tracking-archive-count">0</span></div>',
      '<div class="section-title"><h2 data-i18n="archive">Flight archive</h2><div class="tracking-archive-header-actions"><span id="tracking-archive-count">0</span><button id="tracking-archive-delete-all" type="button">ALLE LÖSCHEN</button></div></div>',
      'archive bulk delete markup',
    );
  }
  html = html.replace(/\s*<link[^>]+release-1\.20\.9\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/release-1.20.9.css?v=${version}">\n  </head>`);
  html = html.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v1209-tracking1';");
  if (!sw.includes("'/release-1.20.9.css?v=1.20.9'")) {
    sw = sw.replace("  '/manifest.webmanifest',", "  '/release-1.20.9.css?v=1.20.9',\n  '/manifest.webmanifest',");
  }
  return sw;
});

const changelogPath = path.join(root, 'CHANGELOG.md');
const notesPath = path.join(root, 'release-notes', '1.20.9.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.9\b/m.test(changelog)) {
  const notes = (await fs.readFile(notesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log('Flight Deck EFB 1.20.9 tracking-first flight hub, progress, route and archive fixes materialized.');
