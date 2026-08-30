import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.2') throw new Error(`1.24.2 materializer requires package version 1.24.2, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.24.2 patch range missing: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('public/index.html', (source) => {
  let next = source.replace(/data-app-version="[^"]+"/, 'data-app-version="1.24.2"');
  next = next.replaceAll('?v=1.24.1', '?v=1.24.2');
  if (!next.includes('/release-1.24.2.css?v=1.24.2')) {
    next = next.replace('</head>', '    <link rel="stylesheet" href="/release-1.24.2.css?v=1.24.2">\n  </head>');
  }
  next = next.replace(
    /<dl class="tracking-flight-strip">[\s\S]*?<\/dl>/,
    `<dl class="tracking-flight-strip">
                <div><dt>CALLSIGN</dt><dd id="tracking-context-callsign">—</dd></div>
                <div><dt>AIRCRAFT</dt><dd id="tracking-context-aircraft">—</dd></div>
                <div class="fd1242-wide-context"><dt>FLUGPLAN</dt><dd id="tracking-context-route">—</dd></div>
                <div><dt>GATE</dt><dd id="tracking-context-gate">—</dd></div>
                <div><dt>ABFLUG</dt><dd id="tracking-context-departure" class="fd1242-schedule-value">—</dd></div>
                <div><dt>TAKE-OFF</dt><dd id="tracking-context-takeoff" class="fd1242-schedule-value">—</dd></div>
                <div><dt>LANDUNG</dt><dd id="tracking-context-landing" class="fd1242-schedule-value">—</dd></div>
                <div><dt>ANKUNFT</dt><dd id="tracking-context-arrival" class="fd1242-schedule-value">—</dd></div>
              </dl>`,
  );
  next = next.replace(/<b>Traffic\s*\/\s*beobachtete Route<\/b>/gi, '<b>Traffic</b>');
  next = next.replace(/<b>Traffic<\/b>/g, '<b>Traffic</b>');
  return next;
});

await update('public/i18n.js', (source) => source
  .replaceAll("actualTrack: 'Actual track'", "actualTrack: 'Actual route'")
  .replaceAll("actualTrack: 'Tatsächliche Flugspur'", "actualTrack: 'Tatsächliche Route'")
  .replaceAll("actualTrack: 'Trace réelle'", "actualTrack: 'Route réelle'"));

await update('public/live-traffic.js', (source) => {
  const replacement = `export function trafficAircraftLabel(entry = {}) {
  const raw = String(entry.aircraftType || entry.typeDesignator || entry.model || entry.title || entry.aircraftTitle || '').replace(/[_]+/g, ' ').trim();
  const upper = raw.toUpperCase();
  const compact = upper.replace(/\s+/g, '');
  if (/\bA20N\b|A320.*(?:NEO|LEAP|PW1)/i.test(raw)) return 'A320neo';
  if (/\bA21N\b|A321.*(?:NEO|LEAP|PW1)/i.test(raw)) return 'A321neo';
  if (/\bA319\b|AIRBUS\\s+A?319/i.test(raw)) return 'A319-100';
  if (/\bA320\b|AIRBUS\\s+A?320/i.test(raw)) return 'A320-200';
  if (/\bA321\b|AIRBUS\\s+A?321/i.test(raw)) return 'A321-200';
  if (/\bA330\b|AIRBUS\\s+A?330/i.test(raw)) return 'A330';
  if (/\bA350\b|AIRBUS\\s+A?350/i.test(raw)) return 'A350';
  if (/\bB738\b|737[- ]?8(?:00)?\b|BOEING\\s+737[- ]?800/i.test(raw)) return 'B737-800';
  if (/\bB739\b|737[- ]?9(?:00)?\b|BOEING\\s+737[- ]?900/i.test(raw)) return 'B737-900';
  if (/\bB737\b|BOEING\\s+737/i.test(raw)) return 'B737';
  if (/\bB77[78]\b|BOEING\\s+777/i.test(raw)) return 'B777';
  if (/\bB78[89X]\b|BOEING\\s+787/i.test(raw)) return 'B787';
  if (/\bE17[05]\b|EMBRAER\\s+E?17[05]/i.test(raw)) return compact.includes('175') ? 'E175' : 'E170';
  if (/\bE19[05]\b|EMBRAER\\s+E?19[05]/i.test(raw)) return compact.includes('195') ? 'E195' : 'E190';
  const icao = compact.match(/\b(A20N|A21N|A319|A320|A321|A330|A350|B738|B739|B737|B77[78]|B78[89X]|E17[05]|E19[05]|CRJ(?:2|5|7|9)|AT(?:42|72)|DH8[ABCD]?|C172|C208|PC12)\b/i);
  return icao ? icao[1].toUpperCase() : raw.slice(0, 24) || 'UNKNOWN';
}

`;
  return replaceBetween(source, 'export function trafficAircraftLabel(entry = {}) {', 'export function trafficPositionLabel(entry = {}) {', replacement, 'compact traffic aircraft labels');
});

await update('public/app.js', (source) => {
  let next = source;

  next = next.replace('  elements.appToolbar.hidden = homeActive;', "  elements.appToolbar.hidden = homeActive || activeModule === 'flight';");

  if (!next.includes('let selectedTrafficTrailLayer = null;')) {
    next = next.replace('let selectedTrafficTrailId = null;', 'let selectedTrafficTrailId = null;\nlet selectedTrafficTrailLayer = null;');
  }
  if (!next.includes('let openTrafficPopupId = null;')) {
    next = next.replace('let selectedTrafficTrailLayer = null;', 'let selectedTrafficTrailLayer = null;\nlet openTrafficPopupId = null;');
  }

  next = next.replace(
    '      registration: aircraft.registration || simbrief.registration || null,',
    `      registration: aircraft.registration || simbrief.registration || null,
      estimatedOut: simbrief.estimatedOut || null,
      estimatedOff: simbrief.estimatedOff || null,
      estimatedOn: simbrief.estimatedOn || null,
      estimatedIn: simbrief.estimatedIn || null,`,
  );

  const trafficReplacement = `function updateTrafficTrails(entries = []) {
  const now = Date.now();
  const historyWindowMs = 15 * 60_000;
  for (const entry of entries.slice(0, 120)) {
    const lat = Number(entry.lat ?? entry.latitude);
    const lon = Number(entry.lon ?? entry.longitude);
    const key = trafficTrailKey(entry);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const trail = trafficTrails.get(key) || { key, callsign: entry.callsign || entry.atcId || \`AI-\${key}\`, points: [], lastSeen: now, entry: {} };
    trail.callsign = entry.callsign || entry.atcId || trail.callsign;
    trail.entry = { ...trail.entry, ...entry };
    trail.lastSeen = now;
    trail.points = trail.points.filter((point) => now - point.time <= historyWindowMs);
    const point = { lat, lon, time: now, altitudeFeet: Number(entry.altitudeFeet), groundSpeed: Number(entry.groundSpeed) };
    const previous = trail.points.at(-1);
    if (!previous || approximateDistanceMeters(previous, point) >= 35 || now - previous.time >= 10_000) {
      trail.points.push(point);
      if (trail.points.length > 1_200) trail.points.splice(0, trail.points.length - 1_200);
    }
    trafficTrails.set(key, trail);
  }
  for (const [key, trail] of trafficTrails) {
    if (now - trail.lastSeen > historyWindowMs) {
      trafficTrails.delete(key);
      if (selectedTrafficTrailId === key) selectedTrafficTrailId = null;
      if (openTrafficPopupId === key) openTrafficPopupId = null;
    }
  }
}

function trafficTrailDurationLabel(trail) {
  if (!trail?.points?.length || trail.points.length < 2) return 'Noch keine ausreichende Historie';
  const seconds = Math.max(0, Math.round((trail.points.at(-1).time - trail.points[0].time) / 1_000));
  const minutes = Math.max(1, Math.round(seconds / 60));
  return \`Bisherige Route · ca. \${minutes} min · \${trail.points.length} Punkte\`;
}

function renderSelectedTrafficTrail(trail) {
  if (!trackingLayers.traffic || !trail?.points || trail.points.length < 2) return null;
  const points = trail.points.map((point) => [point.lat, point.lon]);
  const group = L.layerGroup().addTo(trackingLayers.traffic);
  L.polyline(points, {
    pane: 'trackingTraffic', color: '#0b2236', opacity: 0.62, weight: 7, lineCap: 'round', lineJoin: 'round', interactive: false,
  }).addTo(group);
  L.polyline(points, {
    pane: 'trackingTraffic', color: '#4aa3ff', opacity: 0.98, weight: 3.4, lineCap: 'round', lineJoin: 'round', interactive: false,
  }).addTo(group);
  return group;
}

function trafficPopupMarkup(entry, flightLabel, trail) {
  const aircraftType = trafficAircraftLabel(entry);
  const origin = String(entry.origin || '').trim().toUpperCase();
  const destination = String(entry.destination || '').trim().toUpperCase();
  const route = origin || destination ? \`<div class="fd1242-traffic-route"><span>\${escapeHtml(origin || '—')}</span><i></i><span>\${escapeHtml(destination || '—')}</span></div>\` : '';
  const altitude = Number.isFinite(Number(entry.altitudeFeet)) ? \`\${Math.round(Number(entry.altitudeFeet)).toLocaleString(localeFor(currentLanguage))} ft\` : '—';
  const speed = Number.isFinite(Number(entry.groundSpeed)) ? \`\${Math.round(Number(entry.groundSpeed))} kt\` : '—';
  const heading = Number(entry.heading ?? entry.headingDegrees ?? entry.trueHeading);
  const headingLabel = Number.isFinite(heading) ? \`\${String(Math.round(heading) % 360).padStart(3, '0')}°\` : '—';
  const position = trafficPositionLabel(entry);
  return \`<div class="fd1242-traffic-card"><header><span><strong>\${escapeHtml(flightLabel)}</strong><small>\${escapeHtml(position)}</small></span><b class="fd1242-traffic-type">\${escapeHtml(aircraftType)}</b></header>\${route}<div class="fd1242-traffic-metrics"><span><small>HÖHE</small><b>\${escapeHtml(altitude)}</b></span><span><small>GROUND SPEED</small><b>\${escapeHtml(speed)}</b></span><span><small>HEADING</small><b>\${escapeHtml(headingLabel)}</b></span><span><small>STATUS</small><b>\${escapeHtml(entry.onGround ? 'GROUND' : 'AIRBORNE')}</b></span></div><div class="fd1242-traffic-history">\${escapeHtml(trafficTrailDurationLabel(trail))}</div></div>\`;
}

function renderTrackingTraffic(state) {
  if (!trackingLayers.traffic || trackingSelectedId) {
    trackingLayers.traffic?.clearLayers();
    selectedTrafficTrailLayer = null;
    return;
  }
  const entries = Array.isArray(state?.integrations?.simTraffic?.aircraft) ? state.integrations.simTraffic.aircraft : [];
  updateTrafficTrails(entries);
  trackingLayers.traffic.clearLayers();
  selectedTrafficTrailLayer = null;
  const selected = selectedTrafficTrailId ? trafficTrails.get(selectedTrafficTrailId) : null;
  if (selected) selectedTrafficTrailLayer = renderSelectedTrafficTrail(selected);

  for (const entry of entries.slice(0, 120)) {
    const lat = Number(entry.lat ?? entry.latitude);
    const lon = Number(entry.lon ?? entry.longitude);
    const key = trafficTrailKey(entry);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const callsign = entry.callsign || entry.atcId || \`AI-\${key}\`;
    const airline = resolveAirlineIdentity(entry);
    const flightLabel = formatTrafficFlightNumber(entry, airline) || callsign;
    const heading = Number(entry.heading ?? entry.headingDegrees ?? entry.trueHeading ?? 0);
    const isSelected = key === selectedTrafficTrailId;
    const marker = L.marker([lat, lon], {
      pane: 'trackingTraffic',
      zIndexOffset: isSelected ? 850 : 200,
      icon: L.divIcon({
        className: \`tracking-traffic-icon fd124-traffic-plane\${isSelected ? ' fd1242-selected-traffic' : ''}\`,
        html: \`<span class="fd124-traffic-aircraft" style="--fd124-heading:\${Number.isFinite(heading) ? heading : 0}deg" aria-hidden="true">✈︎</span>\`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      }),
    }).addTo(trackingLayers.traffic);
    const trail = trafficTrails.get(key);
    marker.bindTooltip(escapeHtml(flightLabel), { direction: 'top', offset: [0, -12], className: 'fd124-traffic-tooltip', opacity: 0.97 });
    marker.bindPopup(trafficPopupMarkup(entry, flightLabel, trail), {
      className: 'fd1242-traffic-popup',
      closeButton: true,
      autoClose: true,
      closeOnClick: false,
      maxWidth: 310,
      offset: [0, -8],
    });
    marker.on('click', () => {
      selectedTrafficTrailId = key;
      openTrafficPopupId = key;
      document.querySelectorAll('.tracking-traffic-icon.fd1242-selected-traffic').forEach((node) => node.classList.remove('fd1242-selected-traffic'));
      marker.getElement?.()?.classList.add('fd1242-selected-traffic');
      if (selectedTrafficTrailLayer) trackingLayers.traffic.removeLayer(selectedTrafficTrailLayer);
      selectedTrafficTrailLayer = renderSelectedTrafficTrail(trail);
      marker.openPopup();
    });
    marker.on('popupclose', () => {
      setTimeout(() => {
        if (marker._map && openTrafficPopupId === key && !marker.isPopupOpen()) openTrafficPopupId = null;
      }, 0);
    });
    if (openTrafficPopupId === key || isSelected) requestAnimationFrame(() => marker.openPopup());
  }
}

`;
  next = replaceBetween(next, 'function updateTrafficTrails(entries = []) {', 'function renderTrackingMap(record) {', trafficReplacement, 'traffic history and selection');

  next = next.replace("pane: 'trackingActual', color: '#19e4d5'", "pane: 'trackingActual', color: '#2f6fed'");

  const ownshipBlock = `  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;
  const aircraft = liveAircraft && Number.isFinite(Number(liveAircraft.lat)) ? liveAircraft : actualPoints.at(-1);
  if (aircraft && Number.isFinite(Number(aircraft.lat)) && Number.isFinite(Number(aircraft.lon))) {
    const heading = Number(aircraft.heading ?? aircraft.headingDegrees ?? 0);
    trackingLayers.aircraft = L.marker([aircraft.lat, aircraft.lon], {
      pane: 'trackingMarkers',
      zIndexOffset: 1_000,
      icon: L.divIcon({
        className: 'tracking-ownship-icon',
        html: \`<span class="fd1242-ownship-plane" style="--fd1242-heading:\${Number.isFinite(heading) ? heading : 0}deg" aria-label="Eigenes Flugzeug">✈︎</span>\`,
        iconSize: [32, 32], iconAnchor: [16, 16],
      }),
    }).addTo(trackingMap);
  }

`;
  next = replaceBetween(next, '  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;', '  const renderKey = trackingSelectedId ?', ownshipBlock, 'red ownship aircraft');

  const detailsReplacement = `function trackingScheduleTime(value) {
  if (value === undefined || value === null || value === '') return '—';
  const numeric = Number(value);
  const normalized = Number.isFinite(numeric) && numeric > 0 && numeric < 10_000_000_000 ? numeric * 1_000 : value;
  return formatTime(normalized) || '—';
}

function trackingActualOffBlock(record) {
  return trackingActualPoints(record).find((entry) => entry.onGround && (Number(entry.groundSpeedKnots ?? entry.groundSpeed) || 0) >= 3)?.time || null;
}

function trackingActualOnBlock(record) {
  const points = trackingActualPoints(record);
  const landedAt = record?.stats?.landedAt ? Date.parse(record.stats.landedAt) : 0;
  return [...points].reverse().find((entry) => entry.onGround && Date.parse(entry.time) >= landedAt && (Number(entry.groundSpeedKnots ?? entry.groundSpeed) || 0) < 2 && (entry.parkingBrake || entry.enginesRunning === false))?.time || record?.endedAt || null;
}

function trackingScheduleMarkup(planned, actual) {
  return \`<span><em>PLAN</em><b>\${escapeHtml(trackingScheduleTime(planned))}</b></span><span><em>IST</em><b>\${escapeHtml(trackingScheduleTime(actual))}</b></span>\`;
}

function trackingGateValue(record) {
  if (trackingSelectedId) return record?.flight?.gate || '—';
  const state = latestState || {};
  return state?.gate?.name || homeGateLabel(state) || state?.taxi?.pathMetadata?.destination?.name || record?.flight?.gate || '—';
}

function trackingRouteContext(record) {
  const flight = record?.flight || {};
  const plan = record?.plan || {};
  const departure = [flight.departureRunway ? \`RWY \${flight.departureRunway}\` : null, plan.sid ? \`SID \${plan.sid}\` : null].filter(Boolean).join(' · ') || '—';
  const arrival = [flight.arrivalRunway ? \`RWY \${flight.arrivalRunway}\` : null, plan.star ? \`STAR \${plan.star}\` : null].filter(Boolean).join(' · ') || '—';
  return \`<span><small>DEP</small> \${escapeHtml(departure)}</span><span><small>ARR</small> \${escapeHtml(arrival)}</span>\`;
}

function renderTrackingDetails(record) {
  const stats = record?.stats || {};
  const flight = record?.flight || {};
  const gate = trackingGateValue(record);
  const values = [
    ['CALLSIGN', flight.callsign || '—'],
    ['AIRCRAFT', [flight.aircraftType, flight.registration].filter(Boolean).join(' · ') || flight.aircraftName || '—'],
    ['RUNWAYS', [flight.departureRunway, flight.arrivalRunway].filter(Boolean).join(' → ') || '—'],
    ['GATE', gate],
  ];
  elements.trackingFlightDate.textContent = formatFlightDate(record?.startedAt, { time: false });
  elements.trackingDetailGrid.innerHTML = values.map(([label, value]) => \`<div><dt>\${escapeHtml(label)}</dt><dd>\${escapeHtml(value)}</dd></div>\`).join('');

  const callsign = document.getElementById('tracking-context-callsign');
  const aircraft = document.getElementById('tracking-context-aircraft');
  const route = document.getElementById('tracking-context-route');
  const gateNode = document.getElementById('tracking-context-gate');
  const departure = document.getElementById('tracking-context-departure');
  const takeoff = document.getElementById('tracking-context-takeoff');
  const landing = document.getElementById('tracking-context-landing');
  const arrival = document.getElementById('tracking-context-arrival');
  if (callsign) callsign.textContent = flight.callsign || '—';
  if (aircraft) aircraft.textContent = [flight.aircraftType, flight.registration].filter(Boolean).join(' · ') || flight.aircraftName || '—';
  if (route) { route.className = 'fd1242-route-context'; route.innerHTML = trackingRouteContext(record); }
  if (gateNode) gateNode.textContent = gate;
  if (departure) departure.innerHTML = trackingScheduleMarkup(flight.estimatedOut, trackingActualOffBlock(record));
  if (takeoff) takeoff.innerHTML = trackingScheduleMarkup(flight.estimatedOff, stats.takeoffAt);
  if (landing) landing.innerHTML = trackingScheduleMarkup(flight.estimatedOn, stats.landedAt);
  if (arrival) arrival.innerHTML = trackingScheduleMarkup(flight.estimatedIn, trackingActualOnBlock(record));

  const notes = String(record?.operations?.notes || '').trim();
  const manualChecks = Object.values(record?.operations?.checklist || {}).filter(Boolean).length;
  elements.trackingFlightNotesPanel.hidden = !notes && manualChecks === 0;
  elements.trackingFlightNotesText.textContent = notes || t('noFlightNotes');
  elements.trackingFlightChecklistSummary.textContent = \`\${manualChecks} \${t('manualChecksSaved')}\`;
}

`;
  next = replaceBetween(next, 'function renderTrackingDetails(record) {', 'function renderTrackingRecord(record) {', detailsReplacement, 'single schedule source and gate');
  return next;
});

await update('public/release-1.22.0.js', (source) => {
  let next = source;
  next = next.replace("altitudeColors: localStorage.getItem('fd122-altitude-colors') !== 'off',", 'altitudeColors: true,');
  const profileControls = `  function ensureProfileControls() {
    const card = document.querySelector('.tracking-profile-card');
    if (!card) return;
    card.querySelector('.fd124-time-strip')?.remove();
    let toolbar = card.querySelector('.fd122-profile-toolbar');
    if (!toolbar) {
      const header = card.querySelector('.section-title');
      toolbar = document.createElement('div');
      toolbar.className = 'fd122-profile-toolbar';
      (header || card.firstElementChild)?.insertAdjacentElement('afterend', toolbar);
    }
    toolbar.innerHTML = \`<div class="fd1242-profile-controls"><label><span>PROFIL NACH</span><select id="fd122-profile-axis"><option value="time">Zeitverlauf</option><option value="distance">Distanz</option><option value="waypoint">Wegpunkte</option></select></label><label><span>HÖHENEINHEIT</span><select id="fd122-alt-unit"><option value="ft">Feet (ft)</option><option value="m">Meter (m)</option></select></label></div>\`;
    const axis = toolbar.querySelector('#fd122-profile-axis');
    axis.value = state.profileAxis;
    axis.onchange = () => { state.profileAxis = axis.value; localStorage.setItem('fd122-profile-axis', axis.value); renderProfile(); };
    const unit = toolbar.querySelector('#fd122-alt-unit');
    unit.value = state.altitudeUnit;
    unit.onchange = () => { state.altitudeUnit = unit.value; localStorage.setItem('fd122-altitude-unit', unit.value); renderProfile(); };
    state.altitudeColors = true;
    localStorage.setItem('fd122-altitude-colors', 'on');
  }
`;
  next = replaceBetween(next, '  function ensureProfileControls() {', '  function renderProfile() {', profileControls, 'simplified flight profile controls');
  next = next.replace(/\n\s*renderFlightTimeStrip\(record\);/g, '');
  next = next.replaceAll('<span>Flugspur</span><b>GEFLOGEN</b>', '<span>Tatsächliche Route</span><b>ROUTE</b>');
  return next;
});

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '1.24.2';"));
await update('public/service-worker.js', (source) => {
  let next = source.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flyxora-v1242-tracking-traffic';");
  next = next.replaceAll('?v=1.24.1', '?v=1.24.2');
  const asset = "  '/release-1.24.2.css?v=1.24.2',";
  if (!next.includes(asset.trim())) next = next.replace("  '/manifest.webmanifest',", `${asset}\n  '/manifest.webmanifest',`);
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.2')) return source;
  const section = `## 1.24.2 — Tracking Schedule & Traffic UX\n\n- Adds a single, non-duplicated tracking schedule with Gate, SimBrief planned Departure, Take-off, Landing and Arrival plus actual times where available.\n- Shows departure/arrival runway and SID/STAR context directly in the tracking header.\n- Removes the separate schedule row from Flight Profile and simplifies its controls to “Profil nach” and altitude unit; altitude colouring is always enabled.\n- Improves map-legend contrast and renames “Tatsächliche Flugspur” to “Tatsächliche Route” and the traffic entry to “Traffic”.\n- Reworks Traffic selection: one aircraft marker, a 15-minute locally buffered historical route, stable popup selection and no trail-position aircraft duplicates.\n- Modernizes Traffic popups, removes source text from them and normalizes common aircraft types such as A320-200, A320neo and B737-800.\n- Displays ownship as a distinct red aircraft on the tracking map.\n- Removes the redundant “Flug & Tracking” app toolbar while inside the Flight Hub.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  return source.startsWith('# FLYXORA changelog\n')
    ? source.replace('# FLYXORA changelog\n', `# FLYXORA changelog\n\n${section}`)
    : source.startsWith('# Flight Deck EFB changelog\n')
      ? source.replace('# Flight Deck EFB changelog\n', `# FLYXORA changelog\n\n${section}`)
      : section + source;
});

console.log('FLYXORA 1.24.2 tracking schedule and traffic UX materialized.');
