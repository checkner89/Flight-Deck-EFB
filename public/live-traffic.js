const EARTH_RADIUS_NM = 3_440.065;

export const LIVE_TRAFFIC_LIMITS = Object.freeze({
  groundRadiusNm: 8,
  arrivingRadiusNm: 80,
  nearbyRadiusNm: 120,
  maxRows: 120,
});

function finite(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeTrafficState(value = '') {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function trafficDistanceNm(entry = {}, ownship = {}) {
  const lat1 = finite(ownship.lat);
  const lon1 = finite(ownship.lon);
  const lat2 = finite(entry.lat);
  const lon2 = finite(entry.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const toRad = (degrees) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function classifyLiveTraffic(entry = {}, ownship = {}) {
  const state = normalizeTrafficState(entry.state);
  const groundSpeed = Math.max(0, finite(entry.groundSpeed, 0));
  const verticalSpeed = finite(entry.verticalSpeedFpm ?? entry.verticalSpeed, 0);
  const altitude = finite(entry.altitudeFeet, 0);
  const distanceNm = trafficDistanceNm(entry, ownship);
  // The primary/fallback readers can synthesize state strings from movement. Only a state that
  // arrived through the optional AI traffic-plan enrichment is treated as simulator-reported.
  const reported = Boolean(entry.scheduleEnriched && state);
  const provenance = { inferred: !reported, distanceNm };

  if (entry.onGround) {
    if (/shutdown|sleep|parked|parking/.test(state)) return { kind: 'parking', label: 'PARKING', ...provenance };
    if (/startup|preflight|clearance/.test(state)) return { kind: 'preflight', label: 'PREFLIGHT', ...provenance };
    if (/push/.test(state)) return { kind: 'pushback', label: 'PUSHBACK', ...provenance };
    if (/taxi|rollout/.test(state)) return { kind: 'taxi', label: 'TAXI', ...provenance };
    if (groundSpeed <= 2) return { kind: 'parking', label: 'PARKING', inferred: true, distanceNm };
    return { kind: 'taxi', label: 'TAXI', inferred: true, distanceNm };
  }

  if (/landing/.test(state)) return { kind: 'landing', label: 'LANDING', ...provenance };
  if (/approach/.test(state)) return { kind: 'arriving', label: 'ARRIVING', ...provenance };
  if (/takeoff|depart|climb/.test(state)) return { kind: 'climb', label: 'CLIMB', ...provenance };
  if (/enroute|cruise|simple flight|flt plan|waypoint|pattern/.test(state)) return { kind: 'enroute', label: 'ENROUTE', ...provenance };

  const plausiblyArriving = Number.isFinite(distanceNm)
    && distanceNm <= LIVE_TRAFFIC_LIMITS.arrivingRadiusNm
    && verticalSpeed <= -150
    && altitude > 0
    && altitude <= 12_000;
  if (plausiblyArriving) return { kind: 'arriving', label: 'ARRIVING', inferred: true, distanceNm };
  if (verticalSpeed >= 500 && altitude < 18_000) return { kind: 'climb', label: 'CLIMB', inferred: true, distanceNm };
  return { kind: 'airborne', label: 'AIRBORNE', inferred: true, distanceNm };
}

function within(distanceNm, radiusNm) {
  return distanceNm === null || distanceNm <= radiusNm;
}

export function buildLiveTrafficModel(entries = [], ownship = {}, view = 'nearby') {
  const normalizedView = ['ground', 'arriving', 'nearby'].includes(view) ? view : 'nearby';
  const all = (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    liveStatus: classifyLiveTraffic(entry, ownship),
  }));

  const ground = all.filter((entry) => entry.onGround && within(entry.liveStatus.distanceNm, LIVE_TRAFFIC_LIMITS.groundRadiusNm));
  const arriving = all.filter((entry) => !entry.onGround
    && ['arriving', 'landing'].includes(entry.liveStatus.kind)
    && within(entry.liveStatus.distanceNm, LIVE_TRAFFIC_LIMITS.arrivingRadiusNm));
  const nearby = all.filter((entry) => within(entry.liveStatus.distanceNm, LIVE_TRAFFIC_LIMITS.nearbyRadiusNm));

  const selected = normalizedView === 'ground' ? ground : normalizedView === 'arriving' ? arriving : nearby;
  selected.sort((left, right) => {
    const leftDistance = left.liveStatus.distanceNm ?? Number.MAX_SAFE_INTEGER;
    const rightDistance = right.liveStatus.distanceNm ?? Number.MAX_SAFE_INTEGER;
    return leftDistance - rightDistance
      || Number(right.onGround) - Number(left.onGround)
      || String(left.callsign || left.atcId || '').localeCompare(String(right.callsign || right.atcId || ''), 'en', { numeric: true });
  });

  return {
    view: normalizedView,
    counts: { ground: ground.length, arriving: arriving.length, nearby: nearby.length },
    rows: selected.slice(0, LIVE_TRAFFIC_LIMITS.maxRows),
    hiddenRows: Math.max(0, selected.length - LIVE_TRAFFIC_LIMITS.maxRows),
    limits: LIVE_TRAFFIC_LIMITS,
  };
}

export function trafficAircraftLabel(entry = {}) {
  const raw = String(entry.aircraftType || entry.title || '').replace(/[_-]+/g, ' ').trim();
  const airbus = raw.match(/\bAirbus\s+A?(319|320|321|330|340|350|380)\b/i);
  if (airbus) return `A${airbus[1]}`;
  const boeing = raw.match(/\bBoeing\s+(717|727|737|747|757|767|777|787)\b/i);
  if (boeing) return `B${boeing[1]}`;
  const embraer = raw.match(/\bEmbraer\s+E?(170|175|190|195)\b/i);
  if (embraer) return `E${embraer[1]}`;
  const match = raw.match(/\b(A(?:319|320|321|330|340|350|380)|B(?:717|727|737|747|757|767|777|787)|E(?:170|175|190|195)|CRJ(?:2|5|7|9|100|200|550|700|900|1000)|ATR(?:42|72)|DH8[ABCD]?|C(?:172|208)|PC12)\b/i);
  if (match) return match[1].toUpperCase();
  return raw.slice(0, 28) || 'UNKNOWN';
}

export function trafficPositionLabel(entry = {}) {
  const parking = String(entry.parking || '').trim();
  const runway = String(entry.runway || '').trim().toUpperCase();
  const airport = String(entry.currentAirport || '').trim().toUpperCase();
  if (parking) return parking;
  if (runway) return `RWY ${runway}`;
  if (entry.onGround && airport) return airport;
  return entry.onGround ? 'GROUND' : 'AIRBORNE';
}
