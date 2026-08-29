import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.11');
if (version !== '1.20.11') throw new Error(`1.20.11 release materializer requires package version 1.20.11, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`1.20.11 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim().slice(0, 100))) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.20.11 patch range missing: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('src/server.mjs', (source) => source.replace(/^const APP_VERSION = '[^']+';$/m, `const APP_VERSION = '${version}';`));

/* Primary altitude must match the cockpit altimeter, not geometric altitude. */
await update('src/simconnect-client.mjs', (source) => {
  let next = source;
  next = replaceRequired(
    next,
    "    addFloat('PLANE ALTITUDE', 'feet');\n    addFloat('PLANE ALT ABOVE GROUND', 'feet');",
    "    // PLANE ALTITUDE is geometric/true altitude and can differ materially from the cockpit altimeter.\n    // Tracking follows the same barometric reference the pilot sees: QNH below transition, STD in flight levels.\n    addFloat('PLANE ALTITUDE', 'feet');\n    addFloat('INDICATED ALTITUDE', 'feet');\n    addFloat('KOHLSMAN SETTING MB:1', 'millibars');\n    addInt('KOHLSMAN SETTING STD:1', 'bool');\n    addFloat('PLANE ALT ABOVE GROUND', 'feet');",
    'barometric altitude SimVars',
  );
  next = replaceRequired(
    next,
    "        altitudeFeet: received.data.readFloat64(),\n        aglFeet: received.data.readFloat64(),",
    "        trueAltitudeFeet: received.data.readFloat64(),\n        altitudeFeet: received.data.readFloat64(),\n        altimeterSettingHpa: received.data.readFloat64(),\n        altimeterStandard: received.data.readInt32() === 1,\n        aglFeet: received.data.readFloat64(),",
    'barometric altitude telemetry mapping',
  );
  return next;
});

/* Preserve station coordinates and useful METAR fields so weather can be rendered on the map. */
await update('src/aviation-weather-client.mjs', (source) => {
  let next = source;
  next = replaceRequired(
    next,
    "      const byAirport = new Map(normalized.map((airport) => [airport, { airport, metar: null, taf: null, observedAt: null }]));",
    "      const byAirport = new Map(normalized.map((airport) => [airport, { airport, metar: null, taf: null, observedAt: null, lat: null, lon: null }]));",
    'weather station coordinate defaults',
  );
  next = replaceRequired(
    next,
    "          flightCategory: entry.fltCat || entry.flight_category || null,\n          windDirection: Number.isFinite(Number(entry.wdir)) ? Number(entry.wdir) : null,\n          windSpeed: Number.isFinite(Number(entry.wspd)) ? Number(entry.wspd) : null,",
    "          flightCategory: entry.fltCat || entry.flight_category || null,\n          lat: Number.isFinite(Number(entry.lat)) ? Number(entry.lat) : null,\n          lon: Number.isFinite(Number(entry.lon)) ? Number(entry.lon) : null,\n          windDirection: Number.isFinite(Number(entry.wdir)) ? Number(entry.wdir) : null,\n          windSpeed: Number.isFinite(Number(entry.wspd)) ? Number(entry.wspd) : null,\n          windGust: Number.isFinite(Number(entry.wgst)) ? Number(entry.wgst) : null,\n          visibilitySm: Number.isFinite(Number.parseFloat(entry.visib)) ? Number.parseFloat(entry.visib) : null,\n          altimeterHpa: Number.isFinite(Number(entry.altim)) ? Number(entry.altim) : null,\n          temperatureC: Number.isFinite(Number(entry.temp)) ? Number(entry.temp) : null,\n          dewpointC: Number.isFinite(Number(entry.dewp)) ? Number(entry.dewp) : null,\n          weatherString: rawText(entry, ['wxString', 'wx_string']),",
    'weather station overlay fields',
  );
  next = replaceRequired(
    next,
    "    return [state.flight?.currentAirport, state.flight?.origin, simbrief.origin, state.flight?.destination, simbrief.destination];",
    "    return [state.flight?.currentAirport, state.flight?.origin, simbrief.origin, state.flight?.destination, simbrief.destination, state.flight?.alternate, simbrief.alternate];",
    'alternate airport weather',
  );
  return next;
});

await update('src/flight-recorder.mjs', (source) => replaceRequired(
  source,
  "      officialAirports: (officialWeather.airports || []).slice(0, 8).map((entry) => ({\n        airport: upper(entry.airport, 4), metar: text(entry.metar, 800), taf: text(entry.taf, 1_600),\n        flightCategory: upper(entry.flightCategory, 8), observedAt: entry.observedAt || null,\n      })).filter((entry) => entry.airport),",
  "      officialAirports: (officialWeather.airports || []).slice(0, 8).map((entry) => ({\n        airport: upper(entry.airport, 4), metar: text(entry.metar, 800), taf: text(entry.taf, 1_600),\n        flightCategory: upper(entry.flightCategory, 8), observedAt: entry.observedAt || null,\n        lat: finite(entry.lat), lon: finite(entry.lon),\n        windDirection: finite(entry.windDirection), windSpeed: finite(entry.windSpeed), windGust: finite(entry.windGust),\n        visibilitySm: finite(entry.visibilitySm), altimeterHpa: finite(entry.altimeterHpa),\n        temperatureC: finite(entry.temperatureC), dewpointC: finite(entry.dewpointC),\n        weatherString: text(entry.weatherString, 80),\n      })).filter((entry) => entry.airport),",
  'record weather overlay fields',
));

await update('public/app.js', (source) => {
  let app = source;

  app = replaceRequired(
    app,
    "  trackingWaypointsToggle: $('#tracking-waypoints-toggle'),\n  trackingFollow: $('#tracking-follow'),",
    "  trackingWaypointsToggle: $('#tracking-waypoints-toggle'),\n  trackingWeatherToggle: $('#tracking-weather-toggle'),\n  trackingFollow: $('#tracking-follow'),",
    'weather overlay control element',
  );
  app = replaceRequired(
    app,
    "let trackingWaypointsVisible = localStorage.getItem('flight-deck-tracking-waypoints') !== 'hidden';\nlet trackingFollowAircraft = true;",
    "let trackingWaypointsVisible = localStorage.getItem('flight-deck-tracking-waypoints') !== 'hidden';\nlet trackingWeatherVisible = localStorage.getItem('flight-deck-tracking-weather') === 'visible';\nlet trackingFollowAircraft = true;",
    'weather overlay visibility state',
  );
  app = replaceRequired(
    app,
    "  airports: null,\n  traffic: null,\n  aircraft: null,",
    "  airports: null,\n  traffic: null,\n  weather: null,\n  aircraft: null,",
    'weather overlay layer state',
  );
  app = replaceRequired(
    app,
    "  trackingMap.createPane('trackingTraffic').style.zIndex = '445';",
    "  trackingMap.createPane('trackingTraffic').style.zIndex = '445';\n  trackingMap.createPane('trackingWeather').style.zIndex = '448';",
    'weather overlay pane',
  );
  app = replaceRequired(
    app,
    "  trackingLayers.airports = L.layerGroup().addTo(trackingMap);\n  trackingLayers.traffic = L.layerGroup().addTo(trackingMap);",
    "  trackingLayers.airports = L.layerGroup().addTo(trackingMap);\n  trackingLayers.traffic = L.layerGroup().addTo(trackingMap);\n  trackingLayers.weather = L.layerGroup();\n  if (trackingWeatherVisible) trackingLayers.weather.addTo(trackingMap);\n  syncTrackingWeatherButton();",
    'weather overlay layer initialization',
  );

  const weatherHelpers = `function syncTrackingWeatherButton() {
  if (!elements.trackingWeatherToggle) return;
  elements.trackingWeatherToggle.classList.toggle('active', trackingWeatherVisible);
  elements.trackingWeatherToggle.setAttribute('aria-pressed', trackingWeatherVisible ? 'true' : 'false');
}

function setTrackingWeatherVisible(visible) {
  trackingWeatherVisible = Boolean(visible);
  localStorage.setItem('flight-deck-tracking-weather', trackingWeatherVisible ? 'visible' : 'hidden');
  syncTrackingWeatherButton();
  if (!trackingMap || !trackingLayers.weather) return;
  if (trackingWeatherVisible && !trackingMap.hasLayer(trackingLayers.weather)) trackingLayers.weather.addTo(trackingMap);
  if (!trackingWeatherVisible && trackingMap.hasLayer(trackingLayers.weather)) trackingMap.removeLayer(trackingLayers.weather);
}

function trackingWeatherMapPoints(record, weather) {
  const positions = new Map();
  const add = (icao, point) => {
    const key = String(icao || '').trim().toUpperCase();
    const lat = Number(point?.lat);
    const lon = Number(point?.lon);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    positions.set(key, { lat, lon });
  };
  add(record?.flight?.origin, record?.plan?.originPosition);
  add(record?.flight?.destination, record?.plan?.destinationPosition);
  if (!trackingSelectedId) {
    const simbrief = latestState?.integrations?.simbrief?.flight || {};
    const live = latestState?.flight || {};
    add(live.origin || simbrief.origin, live.originPosition || simbrief.originPosition);
    add(live.destination || simbrief.destination, live.destinationPosition || simbrief.destinationPosition);
  }
  const result = [];
  for (const [airport, entry] of weather.entries()) {
    const directLat = Number(entry?.lat);
    const directLon = Number(entry?.lon);
    const point = Number.isFinite(directLat) && Number.isFinite(directLon)
      ? { lat: directLat, lon: directLon }
      : positions.get(String(airport || '').toUpperCase());
    if (point) result.push({ airport: String(airport || '').toUpperCase(), entry, ...point });
  }
  return result;
}

function renderTrackingWeatherOverlay(record, weather) {
  if (!trackingLayers.weather) return;
  trackingLayers.weather.clearLayers();
  for (const point of trackingWeatherMapPoints(record, weather)) {
    const categoryRaw = String(point.entry?.flightCategory || 'WX').toUpperCase();
    const category = ['VFR', 'MVFR', 'IFR', 'LIFR'].includes(categoryRaw) ? categoryRaw : 'WX';
    const categoryClass = category.toLowerCase();
    const windDirection = Number(point.entry?.windDirection);
    const windSpeed = Number(point.entry?.windSpeed);
    const windGust = Number(point.entry?.windGust);
    const wind = Number.isFinite(windSpeed)
      ? `${Number.isFinite(windDirection) ? String(Math.round(windDirection)).padStart(3, '0') + '°' : 'VRB'} / ${Math.round(windSpeed)}${Number.isFinite(windGust) && windGust > windSpeed ? `G${Math.round(windGust)}` : ''} kt`
      : 'METAR';
    const marker = L.marker([point.lat, point.lon], {
      pane: 'trackingWeather',
      zIndexOffset: 380,
      icon: L.divIcon({
        className: `tracking-weather-map-icon wx-${categoryClass}`,
        html: `<span><b>${escapeHtml(point.airport)}</b><em>${escapeHtml(category)}</em><small>${escapeHtml(wind)}</small></span>`,
        iconSize: [1, 1], iconAnchor: [0, 0],
      }),
    }).addTo(trackingLayers.weather);
    const details = [
      point.entry?.metar ? `<small>METAR</small><br>${escapeHtml(point.entry.metar)}` : '',
      point.entry?.taf ? `<br><small>TAF</small><br>${escapeHtml(point.entry.taf)}` : '',
    ].filter(Boolean).join('');
    marker.bindPopup(`<strong>${escapeHtml(point.airport)} · ${escapeHtml(category)}</strong><br>${escapeHtml(wind)}${details ? `<br>${details}` : ''}`);
  }
}

`;
  if (!app.includes('function setTrackingWeatherVisible(visible)')) {
    app = replaceRequired(app, 'function setTrackingBasemap(mode) {', `${weatherHelpers}function setTrackingBasemap(mode) {`, 'weather overlay helpers');
  }

  app = replaceRequired(
    app,
    "      marker.bindPopup(`<strong>${escapeHtml(entry.icao)}</strong>${wx?.metar ? `<br><small>METAR</small><br>${escapeHtml(wx.metar)}` : ''}${wx?.atis ? `<br><small>ATIS</small><br>${escapeHtml(wx.atis)}` : ''}`);\n    }\n  }\n\n  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;",
    "      marker.bindPopup(`<strong>${escapeHtml(entry.icao)}</strong>${wx?.metar ? `<br><small>METAR</small><br>${escapeHtml(wx.metar)}` : ''}${wx?.atis ? `<br><small>ATIS</small><br>${escapeHtml(wx.atis)}` : ''}`);\n    }\n    renderTrackingWeatherOverlay(record, weather);\n  }\n\n  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;",
    'weather overlay map render',
  );

  const routeDetails = `function renderTrackingWaypoints(record) {
  const waypoints = trackingWaypointPoints(record);
  if (elements.trackingWaypointCount) {
    elements.trackingWaypointCount.textContent = `${waypoints.length} WPT`;
    elements.trackingWaypointCount.hidden = true;
  }
  elements.trackingRouteSummary.textContent = record?.plan?.route
    || [record?.flight?.origin, record?.plan?.sid, record?.plan?.star, record?.flight?.destination].filter(Boolean).join(' · ')
    || t('noPlannedRoute');
  if (elements.trackingWaypointList) {
    elements.trackingWaypointList.replaceChildren();
    elements.trackingWaypointList.hidden = true;
  }
}

`;
  app = replaceBetween(app, 'function renderTrackingWaypoints(record) {', 'function renderTrackingWeather(record) {', routeDetails, 'route details without waypoint list');

  if (!app.includes("elements.trackingWeatherToggle?.addEventListener('click'")) {
    app = replaceRequired(
      app,
      "elements.trackingWaypointsToggle?.addEventListener('click', () => setTrackingWaypointsVisible(!trackingWaypointsVisible));\nelements.trackingFollow.addEventListener('click', () => {",
      "elements.trackingWaypointsToggle?.addEventListener('click', () => setTrackingWaypointsVisible(!trackingWaypointsVisible));\nelements.trackingWeatherToggle?.addEventListener('click', () => setTrackingWeatherVisible(!trackingWeatherVisible));\nelements.trackingFollow.addEventListener('click', () => {",
      'weather overlay toggle handler',
    );
  }

  return app;
});

/* Explicit, readable UTC and local time blocks. */
await update('public/flight-overlay.js', (source) => {
  const dualClock = `function ensureDualClock() {
  const host = document.querySelector('.home-time');
  if (!host || document.getElementById('flight-overlay-utc')) return;
  host.classList.add('flight-overlay-clock');
  const clock = overlayNode('div', { className: 'flight-overlay-clock-values' });
  const utc = overlayNode('span', { className: 'flight-overlay-clock-item' });
  utc.append(overlayNode('small', { text: 'UTC' }), overlayNode('strong', { id: 'flight-overlay-utc', text: '—' }));
  const local = overlayNode('span', { className: 'flight-overlay-clock-item' });
  local.append(overlayNode('small', { text: 'LOCAL' }), overlayNode('strong', { id: 'flight-overlay-local', text: '—' }));
  clock.append(utc, local);
  host.append(clock);
}

`;
  let next = replaceBetween(source, 'function ensureDualClock() {', 'function ensureHomeFlightPanel() {', dualClock, 'dual clock markup');
  const updateClock = `function updateClock() {
  ensureDualClock();
  const now = new Date();
  const utc = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(now);
  const local = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  overlaySet('flight-overlay-utc', utc);
  overlaySet('flight-overlay-local', local);
}

`;
  next = replaceBetween(next, 'function updateClock() {', 'function renderFlightOverlay(state = {}) {', updateClock, 'dual clock values');
  return next;
});

await update('public/index.html', (source) => {
  let html = source;
  html = replaceRequired(
    html,
    '<div class="tracking-basemap-selector" role="group" aria-label="Map style"><button type="button" class="active" data-tracking-basemap="map" data-i18n="mapView">MAP</button><button type="button" data-tracking-basemap="satellite" data-i18n="satelliteView">SATELLITE</button></div>',
    '<button type="button" class="tracking-control active" data-tracking-basemap="map" data-i18n="mapView">MAP</button><button type="button" class="tracking-control" data-tracking-basemap="satellite" data-i18n="satelliteView">SATELLITE</button>',
    'unified map/satellite controls',
  );
  if (!html.includes('id="tracking-weather-toggle"')) {
    html = replaceRequired(
      html,
      '<button id="tracking-waypoints-toggle" class="tracking-control active" type="button" aria-pressed="true">WEGPUNKTE</button>',
      '<button id="tracking-weather-toggle" class="tracking-control" type="button" aria-pressed="false">WETTER</button>\n                  <button id="tracking-waypoints-toggle" class="tracking-control active" type="button" aria-pressed="true">WEGPUNKTE</button>',
      'weather overlay toolbar control',
    );
  }
  if (!html.includes('<i class="weather"></i>')) {
    html = replaceRequired(
      html,
      '<span><i class="waypoint"></i><b data-i18n="allWaypoints">All waypoints</b></span>',
      '<span><i class="waypoint"></i><b data-i18n="allWaypoints">All waypoints</b></span><span><i class="weather"></i><b>METAR / Wetter</b></span>',
      'weather overlay legend',
    );
  }
  html = html.replace(/\s*<link[^>]+release-1\.20\.11\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/release-1.20.11.css?v=${version}">\n  </head>`);
  html = html.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v12011-weather-altitude1';");
  if (!sw.includes(`'/release-1.20.11.css?v=${version}'`)) {
    sw = sw.replace("  '/manifest.webmanifest',", `  '/release-1.20.11.css?v=${version}',\n  '/manifest.webmanifest',`);
  }
  return sw;
});

await update('CHANGELOG.md', (source) => {
  if (/^##\s+1\.20\.11\b/m.test(source)) return source;
  const notes = `## 1.20.11 — QNH Altitude, Weather Overlay & Tracking Polish\n\n- Flight Tracking uses MSFS **INDICATED ALTITUDE** as the primary altitude instead of geometric **PLANE ALTITUDE**, so the displayed value follows the selected **QNH** or **STD** reference. Geometric altitude remains available separately for diagnostics.\n- The active altimeter pressure setting and Standard-mode state are captured with the aircraft telemetry.\n- Added an optional **WETTER** layer to the tracking map. Current AviationWeather.gov METAR stations are positioned directly on the map with VFR/MVFR/IFR/LIFR category, wind and full METAR/TAF popups.\n- Official weather snapshots now retain station coordinates, wind, gusts, visibility, altimeter setting, temperature and dew point; the SimBrief alternate is also included in automatic weather refreshes.\n- **Karte** and **Satellit** now use the same individual control style as Wetter, Wegpunkte, Folgen and Gesamter Flug instead of sitting inside an extra framed selector.\n- **Routendetails** shows the route string only. Individual waypoints remain available directly on the map and can still be toggled there.\n- UTC and local time in the top bar use separate, higher-contrast labels and larger tabular values; compact flight-overlay labels were made more readable at medium desktop widths.\n\n`;
  const headingEnd = source.indexOf('\n') + 1;
  return `${source.slice(0, headingEnd)}\n${notes}${source.slice(headingEnd)}`;
});

console.log('Flight Deck EFB 1.20.11 QNH altitude, weather overlay and tracking polish materialized.');
