import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.7') throw new Error(`1.24.7 materializer requires package version 1.24.7, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.24.7 patch range missing: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('src/electron-main.mjs', (source) => source
  .replace("title: 'FLYXORA 1.24.6'", "title: 'FLYXORA 1.24.7'"));

await update('public/index.html', (source) => {
  let next = source
    .replace(/data-app-version="[^"]+"/, 'data-app-version="1.24.7"')
    .replaceAll('?v=1.24.6', '?v=1.24.7');

  next = next.replace(
    /<header class="page-heading tracking-heading"><div><small>LIVE FLIGHT OPERATIONS<\/small><h1([^>]*)>Flight Tracking<\/h1><p[^>]*>[\s\S]*?<\/p><\/div>/,
    '<header class="page-heading tracking-heading"><div><h1$1>Flight Tracking</h1></div>',
  );

  if (!next.includes('/release-1.24.7.css?v=1.24.7')) {
    next = next.replace('</head>', '    <link rel="stylesheet" href="/release-1.24.7.css?v=1.24.7">\n  </head>');
  }
  return next;
});

await update('public/service-worker.js', (source) => source
  .replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flyxora-v1.24.7-tracking-performance';")
  .replaceAll('?v=1.24.6', '?v=1.24.7'));

await update('public/app.js', (source) => {
  let next = source;

  if (!next.includes("let trackingActualRenderKey = '';")) {
    next = next.replace(
      "let trackingStaticRenderKey = '';",
      "let trackingStaticRenderKey = '';\nlet trackingActualRenderKey = '';\nlet trackingTrafficRenderKey = '';\nlet trackingTrafficLastRenderAt = 0;\nconst trackingTrafficMarkers = new Map();",
    );
  }

  next = next.replace(
    "    worldCopyJump: true,",
    "    worldCopyJump: true,\n    zoomAnimation: false,\n    fadeAnimation: false,\n    markerZoomAnimation: false,",
  );
  next = next.replaceAll("    keepBuffer: 3,", "    keepBuffer: 2,\n    updateWhenZooming: false,");

  const trafficRenderer = `function trackingTrafficFingerprint(entries = []) {
  return entries.slice(0, 120).map((entry) => {
    const key = trafficTrailKey(entry);
    const lat = Number(entry.lat ?? entry.latitude);
    const lon = Number(entry.lon ?? entry.longitude);
    const heading = Number(entry.heading ?? entry.headingDegrees ?? entry.trueHeading ?? 0);
    return [key, Number.isFinite(lat) ? lat.toFixed(4) : '', Number.isFinite(lon) ? lon.toFixed(4) : '', Number.isFinite(heading) ? Math.round(heading / 3) : 0].join(':');
  }).join('|') + '|sel:' + (selectedTrafficTrailId || '') + '|pop:' + (openTrafficPopupId || '');
}

function trackingTrafficIconMarkup(heading, selected) {
  return L.divIcon({
    className: \`tracking-traffic-icon fd124-traffic-plane\${selected ? ' fd1242-selected-traffic' : ''}\`,
    html: \`<span class="fd124-traffic-aircraft" style="--fd124-heading:\${Number.isFinite(heading) ? heading : 0}deg" aria-hidden="true">✈︎</span>\`,
    iconSize: [28, 28], iconAnchor: [14, 14],
  });
}

function renderTrackingTraffic(state) {
  if (!trackingLayers.traffic || trackingSelectedId) {
    trackingLayers.traffic?.clearLayers();
    trackingTrafficMarkers.clear();
    selectedTrafficTrailLayer = null;
    trackingTrafficRenderKey = '';
    return;
  }

  const entries = Array.isArray(state?.integrations?.simTraffic?.aircraft) ? state.integrations.simTraffic.aircraft.slice(0, 120) : [];
  updateTrafficTrails(entries);
  const fingerprint = trackingTrafficFingerprint(entries);
  const now = performance.now();
  if (fingerprint === trackingTrafficRenderKey && now - trackingTrafficLastRenderAt < 2_500) return;
  trackingTrafficRenderKey = fingerprint;
  trackingTrafficLastRenderAt = now;

  if (selectedTrafficTrailLayer) {
    trackingLayers.traffic.removeLayer(selectedTrafficTrailLayer);
    selectedTrafficTrailLayer = null;
  }
  const selectedTrail = selectedTrafficTrailId ? trafficTrails.get(selectedTrafficTrailId) : null;
  if (selectedTrail) selectedTrafficTrailLayer = renderSelectedTrafficTrail(selectedTrail);

  const visibleKeys = new Set();
  for (const entry of entries) {
    const lat = Number(entry.lat ?? entry.latitude);
    const lon = Number(entry.lon ?? entry.longitude);
    const key = trafficTrailKey(entry);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    visibleKeys.add(key);

    const callsign = entry.callsign || entry.atcId || \`AI-\${key}\`;
    const airline = resolveAirlineIdentity(entry);
    const flightLabel = formatTrafficFlightNumber(entry, airline) || callsign;
    const heading = Number(entry.heading ?? entry.headingDegrees ?? entry.trueHeading ?? 0);
    const selected = key === selectedTrafficTrailId;
    const trail = trafficTrails.get(key);
    let marker = trackingTrafficMarkers.get(key);

    if (!marker) {
      marker = L.marker([lat, lon], {
        pane: 'trackingTraffic', zIndexOffset: selected ? 850 : 200,
        icon: trackingTrafficIconMarkup(heading, selected),
      }).addTo(trackingLayers.traffic);
      marker.__flyxoraTrafficKey = key;
      marker.bindTooltip(escapeHtml(flightLabel), { direction: 'top', offset: [0, -12], className: 'fd124-traffic-tooltip', opacity: 0.97 });
      marker.bindPopup(trafficPopupMarkup(entry, flightLabel, trail), {
        className: 'fd1242-traffic-popup', closeButton: true, autoClose: true, closeOnClick: false, maxWidth: 310, offset: [0, -8],
      });
      marker.on('click', () => {
        const currentKey = marker.__flyxoraTrafficKey;
        selectedTrafficTrailId = currentKey;
        openTrafficPopupId = currentKey;
        for (const [otherKey, otherMarker] of trackingTrafficMarkers) {
          otherMarker.getElement?.()?.classList.toggle('fd1242-selected-traffic', otherKey === currentKey);
        }
        if (selectedTrafficTrailLayer) trackingLayers.traffic.removeLayer(selectedTrafficTrailLayer);
        selectedTrafficTrailLayer = renderSelectedTrafficTrail(trafficTrails.get(currentKey));
        marker.openPopup();
      });
      marker.on('popupclose', () => {
        setTimeout(() => {
          if (marker._map && openTrafficPopupId === marker.__flyxoraTrafficKey && !marker.isPopupOpen()) openTrafficPopupId = null;
        }, 0);
      });
      trackingTrafficMarkers.set(key, marker);
    } else {
      marker.setLatLng([lat, lon]);
      marker.setZIndexOffset(selected ? 850 : 200);
      marker.getElement?.()?.classList.toggle('fd1242-selected-traffic', selected);
      const plane = marker.getElement?.()?.querySelector('.fd124-traffic-aircraft');
      if (plane) plane.style.setProperty('--fd124-heading', \`\${Number.isFinite(heading) ? heading : 0}deg\`);
      marker.setTooltipContent(escapeHtml(flightLabel));
      marker.setPopupContent(trafficPopupMarkup(entry, flightLabel, trail));
    }

    if ((openTrafficPopupId === key || selected) && !marker.isPopupOpen()) requestAnimationFrame(() => marker.openPopup());
  }

  for (const [key, marker] of trackingTrafficMarkers) {
    if (visibleKeys.has(key)) continue;
    trackingLayers.traffic.removeLayer(marker);
    trackingTrafficMarkers.delete(key);
    if (openTrafficPopupId === key) openTrafficPopupId = null;
  }
}

`;
  next = replaceBetween(next, 'function renderTrackingTraffic(state) {', 'function renderTrackingMap(record) {', trafficRenderer, 'persistent Traffic markers');

  const mapPrefix = `function renderTrackingMap(record) {
  ensureTrackingMap();

  const planPoints = trackingPlanPoints(record);
  const actualPoints = trackingActualPoints(record);
  const displayActualPoints = trackingDisplayPoints(actualPoints, trackingSelectedId ? 3_000 : 1_200);
  const lastActual = displayActualPoints.at(-1);
  const actualRenderKey = [
    trackingSelectedId || record?.id || 'pending',
    displayActualPoints.length,
    lastActual ? Number(lastActual.lat).toFixed(5) : '',
    lastActual ? Number(lastActual.lon).toFixed(5) : '',
  ].join('|');
  if (actualRenderKey !== trackingActualRenderKey) {
    trackingActualRenderKey = actualRenderKey;
    trackingLayers.actual.clearLayers();
    if (displayActualPoints.length > 1) {
      L.polyline(displayActualPoints.map((entry) => [entry.lat, entry.lon]), {
        pane: 'trackingActual', color: '#2f6fed', opacity: 0.94, weight: 3.5, lineCap: 'round', lineJoin: 'round', interactive: false,
      }).addTo(trackingLayers.actual);
    }
  }

  renderTrackingTraffic(latestState || {});
`;
  next = replaceBetween(next, 'function renderTrackingMap(record) {', '  const weather = weatherByAirport(record);', mapPrefix, 'cached actual route rendering');

  const ownship = `  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;
  const aircraft = liveAircraft && Number.isFinite(Number(liveAircraft.lat)) ? liveAircraft : actualPoints.at(-1);
  if (aircraft && Number.isFinite(Number(aircraft.lat)) && Number.isFinite(Number(aircraft.lon))) {
    const heading = Number(aircraft.heading ?? aircraft.headingDegrees ?? 0);
    if (!trackingLayers.aircraft) {
      trackingLayers.aircraft = L.marker([aircraft.lat, aircraft.lon], {
        pane: 'trackingMarkers', zIndexOffset: 1_000,
        icon: L.divIcon({
          className: 'tracking-ownship-icon',
          html: \`<span class="fd1242-ownship-plane" style="--fd1242-heading:\${Number.isFinite(heading) ? heading : 0}deg" aria-label="Eigenes Flugzeug">✈︎</span>\`,
          iconSize: [32, 32], iconAnchor: [16, 16],
        }),
      }).addTo(trackingMap);
    } else {
      trackingLayers.aircraft.setLatLng([aircraft.lat, aircraft.lon]);
      const plane = trackingLayers.aircraft.getElement?.()?.querySelector('.fd1242-ownship-plane');
      if (plane) plane.style.setProperty('--fd1242-heading', \`\${Number.isFinite(heading) ? heading : 0}deg\`);
    }
  } else if (trackingLayers.aircraft) {
    trackingMap.removeLayer(trackingLayers.aircraft);
    trackingLayers.aircraft = null;
  }

`;
  next = replaceBetween(next, '  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;', '  const renderKey = trackingSelectedId ?', ownship, 'persistent ownship marker');

  next = next.replace(
    /if \(!trackingSelectedId && trackingFollowAircraft && liveAircraft && Date\.now\(\) - trackingLastFollowAt > 1_500\) \{[\s\S]*?\n  \}/,
    `if (!trackingSelectedId && trackingFollowAircraft && liveAircraft && Date.now() - trackingLastFollowAt > 2_000) {
    const point = trackingMap.latLngToContainerPoint([liveAircraft.lat, liveAircraft.lon]);
    const center = trackingMap.getSize().divideBy(2);
    const drift = point.distanceTo(center);
    const minimumZoom = liveAircraft.onGround ? 13.5 : 7.5;
    if (drift > 90 || trackingMap.getZoom() < minimumZoom) {
      trackingLastFollowAt = Date.now();
      trackingMap.setView([liveAircraft.lat, liveAircraft.lon], Math.max(minimumZoom, trackingMap.getZoom()), { animate: false });
    }
  }`,
  );

  next = next.replace(
    "trackingMap.setView([latestState.aircraft.lat, latestState.aircraft.lon], Math.max(latestState.aircraft.onGround ? 13.5 : 7.5, trackingMap.getZoom()), { animate: true });",
    "trackingMap.setView([latestState.aircraft.lat, latestState.aircraft.lon], Math.max(latestState.aircraft.onGround ? 13.5 : 7.5, trackingMap.getZoom()), { animate: false });",
  );

  return next;
});

await update('public/release-1.22.0.js', (source) => {
  let next = source;
  if (!next.includes("profileRenderKey: ''")) {
    next = next.replace("    altitudeColors: localStorage.getItem('fd122-altitude-colors') !== 'off',", "    altitudeColors: localStorage.getItem('fd122-altitude-colors') !== 'off',\n    profileRenderKey: '',");
  }
  next = next.replace(
    "    const track = trackPoints(record).filter((p) => finite(p.altitudeFeet) !== null);",
    "    const track = trackPoints(record).filter((p) => finite(p.altitudeFeet) !== null);\n    const lastProfilePoint = track.at(-1);\n    const profileRenderKey = [state.recordId, track.length, lastProfilePoint?.time || '', state.profileAxis, state.altitudeUnit, record?.stats?.landingRateFpm ?? ''].join('|');\n    if (state.profileRenderKey === profileRenderKey) return;\n    state.profileRenderKey = profileRenderKey;",
  );
  next = next.replace(
    '    const stride = Math.max(1, Math.ceil(track.length / 1400));',
    "    const profilePointBudget = record?.status === 'recording' ? 500 : 1_200;\n    const stride = Math.max(1, Math.ceil(track.length / profilePointBudget));",
  );
  return next;
});

const css = `/* FLYXORA 1.24.7 · compact tracking + smoother moving map */

/* Tracking starts immediately below the application chrome. */
.efb-pages:has(.tracking-page:not([hidden])) { padding-top: 10px !important; }
.tracking-page .tracking-heading { align-items: center !important; margin-bottom: 8px !important; min-height: 0 !important; }
.tracking-page .tracking-heading > div > small,
.tracking-page .tracking-heading p { display: none !important; }
.tracking-page .tracking-heading h1 { margin: 0 !important; font-size: clamp(23px, 2.4vw, 32px) !important; }
.tracking-page .tracking-heading .module-status { margin-top: 0 !important; }
.tracking-page .flight-hub-nav { margin-top: 0 !important; margin-bottom: 10px !important; }
.tracking-page .tracking-layout { gap: 10px !important; }

/* Route context must never bleed into Gate. */
.tracking-flight-strip > div.fd1242-wide-context { min-width: 240px !important; }
.fd1242-route-context { min-width: 0 !important; overflow: hidden !important; }
.fd1242-route-context span { display: block !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }

/* Compact Flight Profile without sacrificing chart readability. */
.tracking-profile-card > .section-title { padding-bottom: 3px !important; }
.fd122-profile-toolbar { gap: 8px !important; padding: 5px 0 6px !important; margin: 0 0 6px !important; }
.fd1242-profile-controls { gap: 8px !important; }
.fd1242-profile-controls label { gap: 3px !important; min-width: 142px !important; }
.fd1242-profile-controls select { min-height: 34px !important; }
.tracking-profile-metrics { gap: 6px !important; padding: 0 12px 6px !important; }
.tracking-profile-metrics > span { min-width: 118px !important; padding: 6px 9px !important; }
.fd122-profile-wrap { min-height: 258px !important; }
.fd122-profile-svg { min-height: 244px !important; }

/* Avoid expensive visual effects on fast-moving Leaflet marker layers. */
#tracking-map .leaflet-marker-pane,
#tracking-map .leaflet-overlay-pane { will-change: transform; }
.tracking-ownship-icon,
.tracking-traffic-icon { contain: layout style paint; }

@media (max-width: 900px) {
  .efb-pages:has(.tracking-page:not([hidden])) { padding-top: 8px !important; }
  .tracking-page .tracking-heading { margin-bottom: 6px !important; }
  .tracking-flight-strip > div.fd1242-wide-context { min-width: 220px !important; }
  .fd122-profile-wrap { min-height: 235px !important; }
  .fd122-profile-svg { min-height: 220px !important; }
}
`;
await fs.writeFile('public/release-1.24.7.css', css, 'utf8');

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.7 — Tracking Density & Map Performance')) return source;
  const section = `## 1.24.7 — Tracking Density & Map Performance\n\n- Removes the redundant “LIVE FLIGHT OPERATIONS” eyebrow and explanatory Tracking paragraph and pulls the Tracking workspace toward the top of the EFB.\n- Prevents long flight-plan context from overlapping the Gate column and compacts the Flight Profile controls, metrics and chart spacing.\n- Reuses the ownship and Traffic markers instead of destroying/recreating up to 120 Leaflet markers on every state update.\n- Caches the flown-route layer until its track geometry actually changes and lowers the live route point budget while preserving full archive detail.\n- Stops repeatedly animated Follow recentering; the map only recenters when ownship has meaningfully drifted from the viewport center.\n- Disables unnecessary Leaflet zoom/fade marker animations and reduces live Flight Profile SVG work while retaining higher detail for archived flights.\n- Preserves the 1.24.6 desktop-session/SSE startup correction and the external-device PIN pairing flow.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  const first = source.indexOf('## ');
  return first >= 0 ? `${source.slice(0, first)}${section}${source.slice(first)}` : `${section}${source}`;
});

console.log('FLYXORA 1.24.7 compact tracking + map performance materialized.');
