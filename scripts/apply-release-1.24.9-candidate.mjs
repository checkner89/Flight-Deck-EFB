import fs from 'node:fs/promises';

const MARKER = 'FLYXORA 1.24.9 candidate · unified Traffic + restored SimBrief map route';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.9 candidate updated ${filename}`);
  }
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.24.9 candidate patch range missing: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('public/app.js', (source) => {
  let next = source;

  // 1.24.7's performance renderer accidentally removed this declaration while the
  // static route block still referenced simbriefPoints. Restore the dedicated layer
  // and include origin/destination so the route is visible already on the airport map.
  const simbriefHelper = `function trackingSimBriefPoints(record = null) {
  const integration = latestState?.integrations?.simbrief || {};
  const livePlan = !trackingSelectedId && integration.imported ? (integration.flight || null) : null;
  const archivedPlan = record?.plan?.source === 'simbrief' ? record.plan : null;
  const plan = livePlan || archivedPlan;
  if (!plan) return [];

  const waypoints = Array.isArray(plan.waypoints) ? plan.waypoints : [];
  const origin = plan.originPosition || record?.plan?.originPosition || null;
  const destination = plan.destinationPosition || record?.plan?.destinationPosition || null;
  const candidates = [origin, ...waypoints, destination];
  const points = [];
  for (const entry of candidates) {
    const lat = Number(entry?.lat ?? entry?.latitude);
    const lon = Number(entry?.lon ?? entry?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const point = { ...entry, lat, lon };
    const previous = points.at(-1);
    if (previous && approximateDistanceMeters(previous, point) < 5) continue;
    points.push(point);
  }
  return points;
}

`;
  if (next.includes('function trackingSimBriefPoints(record = null) {')) {
    // already materialized
  } else if (next.includes('function trackingSimBriefPoints() {')) {
    next = replaceBetween(next, 'function trackingSimBriefPoints() {', 'function trackingWaypointPoints(record) {', simbriefHelper, 'SimBrief map route helper');
  } else {
    const anchor = 'function trackingWaypointPoints(record) {';
    if (!next.includes(anchor)) throw new Error('1.24.9 candidate: SimBrief route helper anchor missing.');
    next = next.replace(anchor, `${simbriefHelper}${anchor}`);
  }

  if (!next.includes("trackingMap.createPane('trackingSimbrief')")) {
    next = next.replace(
      "  trackingMap.createPane('trackingPlanned').style.zIndex = '410';",
      "  trackingMap.createPane('trackingPlanned').style.zIndex = '410';\n  trackingMap.createPane('trackingSimbrief').style.zIndex = '420';",
    );
  }
  if (!next.includes('trackingLayers.simbrief = L.layerGroup()')) {
    next = next.replace(
      '  trackingLayers.planned = L.layerGroup().addTo(trackingMap);',
      '  trackingLayers.planned = L.layerGroup().addTo(trackingMap);\n  trackingLayers.simbrief = L.layerGroup().addTo(trackingMap);',
    );
  }

  next = next.replace('  const simbriefPoints = trackingSimBriefPoints();', '  const simbriefPoints = trackingSimBriefPoints(record);');
  if (!next.includes('  const simbriefPoints = trackingSimBriefPoints(record);')) {
    const anchor = '  const planPoints = trackingPlanPoints(record);\n  const actualPoints = trackingActualPoints(record);';
    if (!next.includes(anchor)) throw new Error('1.24.9 candidate: SimBrief render declaration anchor missing.');
    next = next.replace(anchor, '  const planPoints = trackingPlanPoints(record);\n  const simbriefPoints = trackingSimBriefPoints(record);\n  const actualPoints = trackingActualPoints(record);');
  }
  if (!next.includes('simbriefPoints.map((entry) => [entry.ident, entry.lat, entry.lon, entry.altitudeFeet])')) {
    throw new Error('1.24.9 candidate: SimBrief static render fingerprint was lost.');
  }
  if (!next.includes("pane: 'trackingSimbrief'")) {
    throw new Error('1.24.9 candidate: dedicated SimBrief polyline layer was lost.');
  }

  // Remove the history footer from an otherwise intentionally unchanged Traffic popup.
  next = next.replaceAll('<div class="fd1242-traffic-history">${escapeHtml(trafficTrailDurationLabel(trail))}</div>', '');

  // Keep only DEP/ARR in the flight-plan strip. The actual route belongs on the map.
  const routeContext = `function trackingRouteContext1248(record) {
  const flight = record?.flight || {};
  const plan = record?.plan || {};
  const departure = [flight.departureRunway ? \`RWY \${flight.departureRunway}\` : null, plan.sid ? \`SID \${plan.sid}\` : null].filter(Boolean).join(' · ') || '—';
  const arrival = [flight.arrivalRunway ? \`RWY \${flight.arrivalRunway}\` : null, plan.star ? \`STAR \${plan.star}\` : null].filter(Boolean).join(' · ') || '—';
  return \`<div class="fd1248-route-endpoints"><span><small>DEP</small><b>\${escapeHtml(departure)}</b></span><span><small>ARR</small><b>\${escapeHtml(arrival)}</b></span></div>\`;
}

`;
  if (next.includes('function trackingRouteContext1248(record) {')) {
    next = replaceBetween(next, 'function trackingRouteContext1248(record) {', 'function trackingTrafficFingerprint(entries = []) {', routeContext, 'DEP/ARR-only route context');
  } else {
    throw new Error('1.24.9 candidate: 1.24.8 route context anchor missing.');
  }

  // Merge near-identical simulator/network positions after the existing callsign merge.
  // The tight ground threshold avoids collapsing different aircraft on adjacent stands.
  if (!next.includes('function fd1249DedupeTraffic(entries = [])')) {
    const anchor = 'function trackingTrafficFingerprint(entries = []) {';
    if (!next.includes(anchor)) throw new Error('1.24.9 candidate: Traffic fingerprint anchor missing.');
    const dedupe = `// ${MARKER}
function fd1249TrafficCallsign(entry = {}) {
  return String(entry.callsign || entry.atcId || '').trim().toUpperCase();
}

function fd1249WeakTrafficIdentity(value) {
  return !value || /^(?:AI[-_ ]?|TRAFFIC|MSFS|GENERIC|UNKNOWN|OBJECT)/i.test(value);
}

function fd1249TrafficGroundState(entry = {}) {
  if (typeof entry.onGround === 'boolean') return entry.onGround;
  const altitude = Number(entry.altitudeFeet ?? entry.altitude);
  const speed = Number(entry.groundSpeed ?? entry.groundSpeedKnots);
  return Number.isFinite(altitude) && altitude <= 300 && (!Number.isFinite(speed) || speed <= 55);
}

function fd1249MergeTraffic(left, right) {
  const leftSource = String(left?.trafficSource || '').toLowerCase();
  const rightSource = String(right?.trafficSource || '').toLowerCase();
  const local = leftSource.includes('simconnect') ? left : rightSource.includes('simconnect') ? right : left;
  const remote = local === left ? right : left;
  const localCallsign = fd1249TrafficCallsign(local);
  const remoteCallsign = fd1249TrafficCallsign(remote);
  const callsign = fd1249WeakTrafficIdentity(localCallsign) && !fd1249WeakTrafficIdentity(remoteCallsign)
    ? remoteCallsign
    : localCallsign || remoteCallsign;
  const sources = [...new Set([leftSource, rightSource].flatMap((value) => value.split('+')).filter(Boolean))];
  return {
    ...remote,
    ...local,
    callsign: callsign || local.callsign || remote.callsign || null,
    atcId: callsign || local.atcId || remote.atcId || null,
    aircraftType: local.aircraftType || local.typeDesignator || remote.aircraftType || remote.typeDesignator || null,
    origin: local.origin || remote.origin || null,
    destination: local.destination || remote.destination || null,
    network: local.network || remote.network || null,
    trafficSource: sources.join('+') || local.trafficSource || remote.trafficSource || null,
  };
}

function fd1249DedupeTraffic(entries = []) {
  const result = [];
  for (const candidate of entries) {
    const lat = Number(candidate?.lat ?? candidate?.latitude);
    const lon = Number(candidate?.lon ?? candidate?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const callsign = fd1249TrafficCallsign(candidate);
    const type = String(trafficAircraftLabel(candidate) || '').trim().toUpperCase();
    let duplicateIndex = result.findIndex((entry) => {
      const otherCallsign = fd1249TrafficCallsign(entry);
      return callsign && otherCallsign && callsign === otherCallsign;
    });

    if (duplicateIndex < 0) {
      duplicateIndex = result.findIndex((entry) => {
        const distance = approximateDistanceMeters(
          { lat, lon },
          { lat: Number(entry.lat ?? entry.latitude), lon: Number(entry.lon ?? entry.longitude) },
        );
        if (!Number.isFinite(distance)) return false;
        const bothGround = fd1249TrafficGroundState(candidate) && fd1249TrafficGroundState(entry);
        const altitudeA = Number(candidate.altitudeFeet ?? candidate.altitude);
        const altitudeB = Number(entry.altitudeFeet ?? entry.altitude);
        const altitudeClose = !Number.isFinite(altitudeA) || !Number.isFinite(altitudeB)
          || Math.abs(altitudeA - altitudeB) <= (bothGround ? 180 : 450);
        if (!altitudeClose) return false;

        const exactOverlay = distance <= (bothGround ? 7 : 55);
        if (exactOverlay) return true;

        const otherCallsign = fd1249TrafficCallsign(entry);
        const weakIdentity = fd1249WeakTrafficIdentity(callsign) || fd1249WeakTrafficIdentity(otherCallsign);
        const otherType = String(trafficAircraftLabel(entry) || '').trim().toUpperCase();
        const sameType = type && otherType && type === otherType;
        return weakIdentity && sameType && distance <= (bothGround ? 18 : 140);
      });
    }

    if (duplicateIndex >= 0) result[duplicateIndex] = fd1249MergeTraffic(result[duplicateIndex], candidate);
    else result.push(candidate);
  }
  return result;
}

`;
    next = next.replace(anchor, `${dedupe}${anchor}`);
  }

  next = next.replaceAll('const entries = fd1248TrafficEntries(state).slice(0, 120);', 'const entries = fd1249DedupeTraffic(fd1248TrafficEntries(state)).slice(0, 120);');

  // Every Traffic aircraft uses one identical, heading-aware circular marker.
  const iconRenderer = `function trackingTrafficIconMarkup(heading, selected) {
  const normalizedHeading = Number.isFinite(Number(heading)) ? Number(heading) : 0;
  return L.divIcon({
    className: \`tracking-traffic-icon fd1249-traffic-marker\${selected ? ' fd1242-selected-traffic' : ''}\`,
    html: \`<span class="fd1249-traffic-badge"><span class="fd1249-traffic-aircraft" style="--fd1249-heading:\${normalizedHeading}deg" aria-hidden="true">✈</span></span>\`,
    iconSize: [32, 32], iconAnchor: [16, 16],
  });
}

`;
  if (next.includes('function trackingTrafficIconMarkup(heading, selected) {')) {
    next = replaceBetween(next, 'function trackingTrafficIconMarkup(heading, selected) {', 'function renderTrackingTraffic(state) {', iconRenderer, 'unified Traffic icon renderer');
  } else {
    throw new Error('1.24.9 candidate: Traffic icon renderer anchor missing.');
  }
  next = next.replaceAll("querySelector('.fd124-traffic-aircraft')", "querySelector('.fd1249-traffic-aircraft')");
  next = next.replaceAll("plane.style.setProperty('--fd124-heading'", "plane.style.setProperty('--fd1249-heading'");

  if (!next.includes('fd1249DedupeTraffic(fd1248TrafficEntries(state))')) throw new Error('1.24.9 candidate: deduplicated Traffic renderer is not active.');
  if (next.includes('class="fd1242-traffic-history"')) throw new Error('1.24.9 candidate: Traffic history footer is still rendered.');
  return next;
});

await update('public/release-1.24.7.css', (source) => {
  if (source.includes('/* FLYXORA 1.24.9 candidate · unified Traffic markers */')) return source;
  return `${source}\n\n/* FLYXORA 1.24.9 candidate · unified Traffic markers */
.tracking-traffic-icon.fd1249-traffic-marker,
.tracking-traffic-icon.fd1249-traffic-marker > div {
  width: 32px !important;
  height: 32px !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.fd1249-traffic-badge {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid rgba(103, 182, 255, .9);
  border-radius: 50%;
  background: rgba(8, 29, 43, .94);
  box-shadow: 0 2px 7px rgba(0, 0, 0, .38);
}
.fd1249-traffic-aircraft {
  display: block;
  color: #4aa3ff;
  font-size: 20px;
  line-height: 1;
  text-shadow: none;
  transform: rotate(calc(var(--fd1249-heading, 0deg) - 45deg));
  transform-origin: 50% 50%;
}
.tracking-traffic-icon.fd1249-traffic-marker.fd1242-selected-traffic .fd1249-traffic-badge {
  box-shadow: 0 0 0 2px rgba(255, 255, 255, .94), 0 0 0 4px rgba(74, 163, 255, .55), 0 2px 7px rgba(0, 0, 0, .38);
}
.tracking-traffic-icon.fd1249-traffic-marker.fd1242-selected-traffic::after { display: none !important; }
.fd1242-traffic-history { display: none !important; }
.fd1248-route-main { display: none !important; }
.fd1248-route-endpoints { width: 100% !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
`;
});

console.log('FLYXORA 1.24.9 candidate Traffic/SimBrief tracking fixes materialized.');
