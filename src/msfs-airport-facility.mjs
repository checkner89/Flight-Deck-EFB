const EARTH_METERS_PER_DEGREE = 111_320;

const PATH_KIND = Object.freeze({
  1: 'taxiway',
  2: 'runway',
  // A PARKING path is the lead-in edge to a stand; the stand itself is emitted
  // separately from TAXI_PARKING so the planner does not show duplicate gates.
  3: 'taxiway',
  4: 'taxiway',
  5: 'closed_taxiway',
  6: 'service_road',
  7: 'service_road',
  8: 'painted_line',
});

const PARKING_TYPE = Object.freeze({
  1: 'ramp-ga', 2: 'ramp-ga-small', 3: 'ramp-ga-medium', 4: 'ramp-ga-large',
  5: 'ramp-cargo', 6: 'ramp-military-cargo', 7: 'ramp-military-combat',
  8: 'gate-small', 9: 'gate-medium', 10: 'gate-heavy', 11: 'dock-ga',
  12: 'fuel', 13: 'vehicle', 14: 'ramp-ga-extra', 15: 'gate-extra',
});

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIcao(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(normalized) ? normalized : null;
}

function parkingStem(value) {
  const numeric = finite(value, 0);
  if (numeric === 1) return 'PARKING';
  if (numeric >= 2 && numeric <= 9) return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][numeric - 2];
  if (numeric === 10) return 'GATE';
  if (numeric === 11) return 'DOCK';
  if (numeric >= 12 && numeric <= 37) return String.fromCharCode(65 + numeric - 12);
  return '';
}

export function formatMsfsParkingName({ name, suffix, number } = {}) {
  const stem = parkingStem(name);
  const suffixValue = parkingStem(suffix);
  const numberValue = Math.max(0, Math.round(finite(number, 0)));
  const compactStem = /^[A-Z]$/.test(stem) && numberValue ? `${stem}${numberValue}` : null;
  const parts = compactStem ? [compactStem] : [];
  if (!compactStem && stem) parts.push(stem);
  if (!compactStem && numberValue) parts.push(String(numberValue));
  if (suffixValue && suffixValue !== stem) parts.push(suffixValue);
  return parts.join(' ') || (numberValue ? String(numberValue) : 'STAND');
}

/**
 * MSFS airport facility taxi points use metre offsets from the airport reference.
 * BIAS_X follows longitude (east/west) and BIAS_Z follows latitude (north/south).
 */
export function airportBiasToLatLon(reference, biasX, biasZ) {
  const latitude = finite(reference?.lat);
  const longitude = finite(reference?.lon);
  const x = finite(biasX);
  const z = finite(biasZ);
  if ([latitude, longitude, x, z].some((value) => value === null)) return null;
  const longitudeScale = EARTH_METERS_PER_DEGREE * Math.max(0.05, Math.cos(latitude * Math.PI / 180));
  return {
    lat: latitude + z / EARTH_METERS_PER_DEGREE,
    lon: longitude + x / longitudeScale,
  };
}

function feature(id, kind, geometry, coordinates, extra = {}) {
  return {
    id,
    kind,
    geometry,
    coordinates,
    ref: extra.ref || null,
    name: extra.name || null,
    operator: null,
    surface: null,
    widthMeters: finite(extra.widthMeters),
    area: false,
    source: 'msfs-facility',
    ...extra,
  };
}

function endpointForPath(raw, endpointIndex, pathType) {
  const point = raw.points.get(endpointIndex);
  const parking = raw.parkings.get(endpointIndex);
  if (point && parking) return pathType === 3 ? parking : point;
  return point || parking || null;
}

function calculateBounds(features, center) {
  const coordinates = features.flatMap((entry) => entry.coordinates || []);
  if (!coordinates.length) return [[center.lat - 0.025, center.lon - 0.025], [center.lat + 0.025, center.lon + 0.025]];
  const latitudes = coordinates.map((coordinate) => coordinate[0]);
  const longitudes = coordinates.map((coordinate) => coordinate[1]);
  return [[Math.min(...latitudes), Math.min(...longitudes)], [Math.max(...latitudes), Math.max(...longitudes)]];
}

/** Convert the raw, index-preserving SimConnect facility response to the common map schema. */
export function convertMsfsAirportFacility(rawFacility, { downloadedAt = new Date().toISOString() } = {}) {
  const icao = normalizeIcao(rawFacility?.icao);
  const airport = rawFacility?.airport || {};
  const center = { lat: finite(airport.lat), lon: finite(airport.lon) };
  if (!icao || center.lat === null || center.lon === null) throw new TypeError('A valid MSFS airport facility response is required.');

  const raw = {
    names: new Map((rawFacility.names || []).map((entry, index) => [finite(entry.index, index), String(entry.name || '').trim()])),
    points: new Map(),
    parkings: new Map(),
  };
  const features = [];

  for (const [index, value] of (rawFacility.points || []).entries()) {
    const id = finite(value.index, index);
    const position = airportBiasToLatLon(center, value.biasX, value.biasZ);
    if (!position) continue;
    const normalized = { ...value, index: id, position };
    raw.points.set(id, normalized);
    if ([2, 4, 5, 6].includes(finite(value.type))) {
      features.push(feature(`msfs/hold/${id}`, 'holding_position', 'point', [[position.lat, position.lon]], {
        name: [4, 6].includes(finite(value.type)) ? 'ILS HOLD' : 'HOLD SHORT',
        holdType: [4, 6].includes(finite(value.type)) ? 'ils' : 'runway',
        orientation: finite(value.orientation, 0),
      }));
    }
  }

  for (const [index, value] of (rawFacility.parkings || []).entries()) {
    const id = finite(value.index, index);
    const position = airportBiasToLatLon(center, value.biasX, value.biasZ);
    if (!position) continue;
    const ref = formatMsfsParkingName(value);
    const normalized = { ...value, index: id, position, ref };
    raw.parkings.set(id, normalized);
    features.push(feature(`msfs/stand/${id}`, 'parking_position', 'point', [[position.lat, position.lon]], {
      ref,
      name: ref,
      heading: finite(value.heading),
      radiusMeters: finite(value.radius),
      parkingType: PARKING_TYPE[finite(value.type)] || 'stand',
      hasJetway: false,
      hasVdgs: false,
    }));
  }

  for (const [index, value] of (rawFacility.paths || []).entries()) {
    const pathType = finite(value.type, 0);
    const start = endpointForPath(raw, finite(value.start), pathType);
    const end = endpointForPath(raw, finite(value.end), pathType);
    if (!start?.position || !end?.position) continue;
    const name = raw.names.get(finite(value.nameIndex)) || '';
    const runwayDesignator = ['', 'L', 'R', 'C', 'W', 'A', 'B'][finite(value.runwayDesignator, 0)] || '';
    const runwayRef = pathType === 2 && finite(value.runwayNumber, 0) > 0
      ? `${String(finite(value.runwayNumber)).padStart(2, '0')}${runwayDesignator}`
      : null;
    features.push(feature(`msfs/path/${finite(value.index, index)}`, PATH_KIND[pathType] || 'taxiway', 'line', [
      [start.position.lat, start.position.lon],
      [end.position.lat, end.position.lon],
    ], {
      ref: name || runwayRef,
      name: name || runwayRef,
      widthMeters: finite(value.width),
      pathType,
      centerLine: Boolean(value.centerLine),
      centerLineLighted: Boolean(value.centerLineLighted),
      closed: pathType === 5,
      graphOnly: pathType === 2,
    }));
  }

  const jetwayParkingIndices = new Set((rawFacility.jetways || []).map((entry) => finite(entry.parkingSpot)).filter((value) => value !== null));
  const vdgsParkingIndices = new Set((rawFacility.vdgs || []).map((entry) => finite(entry.parkingIndex)).filter((value) => value !== null));
  for (const entry of features.filter((value) => value.kind === 'parking_position')) {
    const index = finite(entry.id.split('/').at(-1));
    entry.hasJetway = jetwayParkingIndices.has(index);
    entry.hasVdgs = vdgsParkingIndices.has(index);
  }

  const counts = {};
  for (const entry of features) counts[entry.kind] = (counts[entry.kind] || 0) + 1;
  return {
    schemaVersion: 4,
    icao,
    center,
    bounds: calculateBounds(features, center),
    downloadedAt,
    source: 'Microsoft Flight Simulator facility data',
    sources: [{ name: 'Microsoft Flight Simulator', license: 'local simulator data', role: 'taxi graph, stands and hold-short points' }],
    attribution: 'Microsoft Flight Simulator local facility data',
    airport: { name: String(airport.name || icao), type: null, municipality: null, country: null },
    counts,
    features,
    facility: {
      exact: true,
      taxiNameCount: raw.names.size,
      taxiPointCount: raw.points.size,
      parkingCount: raw.parkings.size,
      pathCount: (rawFacility.paths || []).length,
      jetwayCount: (rawFacility.jetways || []).length,
      vdgsCount: (rawFacility.vdgs || []).length,
    },
  };
}

/** Prefer the simulator taxi graph while retaining OSM/OurAirports buildings and aprons. */
export function mergeMsfsFacilityMap(baseMap, facilityMap) {
  if (!facilityMap?.features?.length) return baseMap;
  const replaceKinds = new Set(['taxiway', 'parking_position', 'gate', 'holding_position', 'closed_taxiway', 'painted_line']);
  const facilityKinds = new Set((facilityMap.features || []).map((entry) => entry.kind));
  const retained = (baseMap?.features || []).filter((entry) => !replaceKinds.has(entry.kind) || !facilityKinds.has(entry.kind));
  const features = [...retained, ...facilityMap.features];
  const counts = {};
  for (const entry of features) counts[entry.kind] = (counts[entry.kind] || 0) + 1;
  return {
    ...baseMap,
    schemaVersion: Math.max(4, finite(baseMap?.schemaVersion, 0)),
    center: facilityMap.center || baseMap.center,
    bounds: baseMap?.features?.length ? baseMap.bounds : facilityMap.bounds,
    downloadedAt: facilityMap.downloadedAt,
    source: 'MSFS facility data + OpenStreetMap + OurAirports',
    sources: [...(facilityMap.sources || []), ...(baseMap?.sources || [])],
    attribution: [facilityMap.attribution, baseMap?.attribution].filter(Boolean).join(' · '),
    counts,
    features,
    facility: facilityMap.facility,
    cache: { ...(baseMap?.cache || {}), simulatorFacility: true },
  };
}
