import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const SCHEMA_VERSION = 4;
const DEFAULT_RADIUS_METERS = 7_000;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const SUPPORTED_AEROWAYS = new Set([
  'aerodrome',
  'apron',
  'gate',
  'hangar',
  'holding_position',
  'parking_position',
  'runway',
  'taxilane',
  'taxiway',
  'terminal',
]);

function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validPoint(point) {
  return point
    && Number.isFinite(point.lat)
    && Number.isFinite(point.lon)
    && Math.abs(point.lat) <= 90
    && Math.abs(point.lon) <= 180;
}

function normalizeIcao(value) {
  const icao = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(icao) ? icao : null;
}

function defaultCacheDirectory() {
  if (process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Flight Deck EFB', 'maps');
  }
  return path.join(os.homedir(), '.flight-deck-efb', 'maps');
}

function pointFromPair(lat, lon) {
  const point = { lat: finiteNumber(lat), lon: finiteNumber(lon) };
  return validPoint(point) ? point : null;
}

function pathCenter(points) {
  const valid = (points ?? []).filter(validPoint);
  if (valid.length === 0) return null;
  const bounds = valid.reduce((result, point) => ({
    south: Math.min(result.south, point.lat),
    west: Math.min(result.west, point.lon),
    north: Math.max(result.north, point.lat),
    east: Math.max(result.east, point.lon),
  }), { south: 90, west: 180, north: -90, east: -180 });
  return {
    lat: (bounds.south + bounds.north) / 2,
    lon: (bounds.west + bounds.east) / 2,
  };
}

export function resolveAirportMapReference(state) {
  const plannedAirport = state?.planning?.selectedAirport;
  const plannedIcao = normalizeIcao(plannedAirport?.icao);
  if (plannedIcao && validPoint(plannedAirport)) {
    return { icao: plannedIcao, lat: plannedAirport.lat, lon: plannedAirport.lon };
  }
  const flight = state?.flight ?? {};
  const origin = normalizeIcao(flight.origin);
  const destination = normalizeIcao(flight.destination);
  let icao = normalizeIcao(flight.currentAirport);

  if (!icao) {
    if ((state?.taxi?.path?.length ?? 0) > 1) icao = origin ?? destination;
    else if (state?.aircraft?.onGround && flight.clearedForLanding) icao = destination ?? origin;
    else icao = origin ?? destination;
  }
  if (!icao) return null;

  let center = null;
  if (icao === origin) center = flight.originPosition;
  if (icao === destination) center = flight.destinationPosition;
  if (!validPoint(center)) center = pathCenter(state?.taxi?.path);
  if (!validPoint(center) && validPoint(state?.gate)) center = state.gate;
  if (!validPoint(center) && state?.aircraft?.onGround && validPoint(state.aircraft)) center = state.aircraft;
  return validPoint(center)
    ? { icao, lat: center.lat, lon: center.lon }
    : { icao, lat: null, lon: null };
}

export function buildOverpassQuery({ icao, lat, lon, radiusMeters = DEFAULT_RADIUS_METERS }) {
  const center = pointFromPair(lat, lon);
  if (!center) throw new TypeError('Valid airport coordinates are required');
  const normalizedIcao = normalizeIcao(icao);
  const radius = Math.max(2_000, Math.min(18_000, Math.round(radiusMeters)));
  const latitudeDelta = radius / 111_320;
  const longitudeDelta = radius / (111_320 * Math.max(0.2, Math.cos(center.lat * Math.PI / 180)));
  const bbox = [
    center.lat - latitudeDelta,
    center.lon - longitudeDelta,
    center.lat + latitudeDelta,
    center.lon + longitudeDelta,
  ].map((value) => value.toFixed(7)).join(',');
  const aeroways = [...SUPPORTED_AEROWAYS].join('|');
  const areaPrelude = normalizedIcao
    ? `area["aeroway"="aerodrome"]["icao"="${normalizedIcao}"]->.flightDeckAirportArea;`
    : '';
  const areaBuildings = normalizedIcao ? 'nwr(area.flightDeckAirportArea)["building"];' : '';
  return `[out:json][timeout:40];
${areaPrelude}
(
  nwr(${bbox})["aeroway"~"^(${aeroways})$"];
  nwr(${bbox})["building"~"^(terminal|hangar|transportation)$"];
  ${areaBuildings}
);
out center geom qt;`;
}

function classify(tags = {}) {
  const aeroway = String(tags.aeroway ?? '').toLowerCase();
  const building = String(tags.building ?? '').toLowerCase();
  if (aeroway === 'taxilane') return 'taxiway';
  if (SUPPORTED_AEROWAYS.has(aeroway)) {
    if (aeroway === 'hangar') return 'building';
    return aeroway;
  }
  if (building === 'terminal') return 'terminal';
  if (building === 'hangar') return 'building';
  if (building && building !== 'no') return 'building';
  return null;
}

function geometryPoints(geometry) {
  if (!Array.isArray(geometry)) return [];
  return geometry
    .map((point) => pointFromPair(point?.lat, point?.lon))
    .filter(Boolean);
}

function samePoint(left, right) {
  return left && right && left.lat === right.lat && left.lon === right.lon;
}

function featureGeometry(kind, points, tags) {
  if (points.length === 1) return 'point';
  const isClosed = points.length > 3 && samePoint(points[0], points.at(-1));
  const areaKind = ['aerodrome', 'apron', 'building', 'terminal'].includes(kind);
  return isClosed || tags.area === 'yes' || areaKind ? 'polygon' : 'line';
}

function compactTags(tags = {}) {
  const width = finiteNumber(String(tags.width ?? '').replace(',', '.'));
  return {
    ref: tags.ref ? String(tags.ref) : null,
    name: tags.name ? String(tags.name) : null,
    operator: tags.operator ? String(tags.operator) : null,
    surface: tags.surface ? String(tags.surface) : null,
    widthMeters: width && width > 0 ? width : null,
    area: tags.area === 'yes',
  };
}

function addFeature(features, sourceId, tags, rawPoints) {
  const kind = classify(tags);
  if (!kind) return;
  const points = rawPoints.filter(validPoint);
  if (points.length === 0) return;
  const geometry = featureGeometry(kind, points, tags);
  if (geometry !== 'point' && points.length < 2) return;
  if (geometry === 'polygon' && !samePoint(points[0], points.at(-1))) points.push({ ...points[0] });
  features.push({
    id: sourceId,
    kind,
    geometry,
    coordinates: points.map((point) => [point.lat, point.lon]),
    ...compactTags(tags),
  });
}

function calculateBounds(features, fallbackCenter) {
  let south = 90;
  let west = 180;
  let north = -90;
  let east = -180;
  for (const feature of features) {
    for (const coordinate of feature.coordinates) {
      south = Math.min(south, coordinate[0]);
      west = Math.min(west, coordinate[1]);
      north = Math.max(north, coordinate[0]);
      east = Math.max(east, coordinate[1]);
    }
  }
  if (north < south || east < west) {
    const delta = 0.025;
    return [[fallbackCenter.lat - delta, fallbackCenter.lon - delta], [fallbackCenter.lat + delta, fallbackCenter.lon + delta]];
  }
  return [[south, west], [north, east]];
}

function runwayRefParts(value) {
  return String(value ?? '')
    .toUpperCase()
    .split(/[\/\-]/)
    .map((part) => part.trim().replace(/^0+(?=\d)/, ''))
    .filter(Boolean);
}

function pointToSegmentMeters(point, start, end) {
  const latitude = point.lat * Math.PI / 180;
  const xScale = 111_320 * Math.cos(latitude);
  const localPoint = { x: point.lon * xScale, y: point.lat * 111_320 };
  const localStart = { x: start.lon * xScale, y: start.lat * 111_320 };
  const localEnd = { x: end.lon * xScale, y: end.lat * 111_320 };
  const dx = localEnd.x - localStart.x;
  const dy = localEnd.y - localStart.y;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((localPoint.x - localStart.x) * dx + (localPoint.y - localStart.y) * dy) / lengthSquared,
  ));
  return Math.hypot(
    localPoint.x - (localStart.x + progress * dx),
    localPoint.y - (localStart.y + progress * dy),
  );
}

function keepAirportRunways(features, airportMetadata) {
  const catalogRunways = airportMetadata?.runways ?? [];
  if (catalogRunways.length === 0) return features;
  const referenceParts = new Set(catalogRunways.flatMap((runway) => [runway.le, runway.he]).flatMap(runwayRefParts));
  const runwaySegments = catalogRunways
    .map((runway) => ({
      start: pointFromPair(runway.leLat, runway.leLon),
      end: pointFromPair(runway.heLat, runway.heLon),
    }))
    .filter((runway) => runway.start && runway.end);

  const accepted = features.filter((feature) => {
    if (feature.kind !== 'runway') return true;
    if (runwayRefParts(feature.ref).some((part) => referenceParts.has(part))) return true;
    if (runwaySegments.length === 0) return !feature.ref;
    return feature.coordinates.some(([lat, lon]) => runwaySegments.some((runway) => (
      pointToSegmentMeters({ lat, lon }, runway.start, runway.end) <= 350
    )));
  });
  return accepted.some((feature) => feature.kind === 'runway') ? accepted : features;
}

export function convertOverpassPayload(payload, reference, {
  downloadedAt = new Date().toISOString(),
  airportMetadata = null,
} = {}) {
  const icao = normalizeIcao(reference?.icao);
  const center = pointFromPair(reference?.lat, reference?.lon);
  if (!icao || !center) throw new TypeError('A valid ICAO and center are required');
  if (!payload || !Array.isArray(payload.elements)) throw new TypeError('Invalid Overpass response');

  let features = [];
  for (const element of payload.elements) {
    const tags = element.tags ?? {};
    if (element.type === 'node') {
      const point = pointFromPair(element.lat, element.lon);
      if (point) addFeature(features, `node/${element.id}`, tags, [point]);
      continue;
    }
    if (element.type === 'way') {
      addFeature(features, `way/${element.id}`, tags, geometryPoints(element.geometry));
      continue;
    }
    if (element.type === 'relation') {
      let memberIndex = 0;
      for (const member of element.members ?? []) {
        const points = geometryPoints(member.geometry);
        if (points.length > 0) {
          addFeature(features, `relation/${element.id}/${memberIndex}`, tags, points);
          memberIndex += 1;
        }
      }
    }
  }

  features = keepAirportRunways(features, airportMetadata);

  if (!features.some((feature) => feature.kind === 'runway')) {
    for (const [index, runway] of (airportMetadata?.runways ?? []).entries()) {
      const le = pointFromPair(runway.leLat, runway.leLon);
      const he = pointFromPair(runway.heLat, runway.heLon);
      if (!le || !he) continue;
      features.push({
        id: `ourairports/runway/${index}`,
        kind: 'runway',
        geometry: 'line',
        coordinates: [[le.lat, le.lon], [he.lat, he.lon]],
        ref: [runway.le, runway.he].filter(Boolean).join('/') || null,
        name: null,
        operator: null,
        surface: runway.surface || null,
        widthMeters: finiteNumber(runway.widthFt) ? runway.widthFt * 0.3048 : null,
        area: false,
        fallback: true,
      });
    }
  }

  const counts = {};
  for (const feature of features) counts[feature.kind] = (counts[feature.kind] ?? 0) + 1;
  if ((airportMetadata?.runways?.length ?? 0) > 0) counts.runway = airportMetadata.runways.length;
  return {
    schemaVersion: SCHEMA_VERSION,
    icao,
    center,
    bounds: calculateBounds(features, center),
    downloadedAt,
    source: 'OpenStreetMap via Overpass API + OurAirports',
    sources: [
      { name: 'OpenStreetMap', license: 'ODbL', role: 'airport vector geometry' },
      { name: 'OurAirports', license: 'Public Domain', role: 'airport catalog and runway fallback' },
    ],
    attribution: '© OpenStreetMap contributors · OurAirports',
    airport: airportMetadata ? {
      name: airportMetadata.name ?? icao,
      type: airportMetadata.type ?? null,
      municipality: airportMetadata.municipality ?? null,
      country: airportMetadata.country ?? null,
    } : null,
    counts,
    features,
  };
}

export class AirportMapService {
  constructor({
    cacheDirectory = defaultCacheDirectory(),
    endpoints = DEFAULT_ENDPOINTS,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    radiusMeters = DEFAULT_RADIUS_METERS,
  } = {}) {
    this.cacheDirectory = cacheDirectory;
    this.endpoints = endpoints;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.radiusMeters = radiusMeters;
    this.inFlight = new Map();
    this.memoryCache = new Map();
  }

  #cachePath(icao) {
    return path.join(this.cacheDirectory, `${icao}.json`);
  }

  async #readCache(icao, airportMetadata) {
    if (this.memoryCache.has(icao)) return this.memoryCache.get(icao);
    try {
      const parsed = JSON.parse(await fs.readFile(this.#cachePath(icao), 'utf8'));
      if (![2, 3, SCHEMA_VERSION].includes(parsed.schemaVersion) || parsed.icao !== icao || !Array.isArray(parsed.features)) return null;
      if (parsed.schemaVersion === 2) {
        const features = keepAirportRunways(parsed.features, airportMetadata);
        const counts = {};
        for (const feature of features) counts[feature.kind] = (counts[feature.kind] ?? 0) + 1;
        if ((airportMetadata?.runways?.length ?? 0) > 0) counts.runway = airportMetadata.runways.length;
        const migrated = {
          ...parsed,
          schemaVersion: SCHEMA_VERSION,
          bounds: calculateBounds(features, parsed.center),
          counts,
          features,
        };
        await this.#writeCache(migrated);
        this.memoryCache.set(icao, migrated);
        return migrated;
      }
      this.memoryCache.set(icao, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  async #writeCache(mapData) {
    this.memoryCache.set(mapData.icao, mapData);
    await fs.mkdir(this.cacheDirectory, { recursive: true });
    await fs.writeFile(this.#cachePath(mapData.icao), JSON.stringify(mapData));
  }

  async #download(reference) {
    const query = buildOverpassQuery({ ...reference, radiusMeters: this.radiusMeters });
    const errors = [];
    for (const endpoint of this.endpoints) {
      try {
        const response = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'Flight-Deck-EFB/1.7.8 (flight simulation companion)',
          },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const mapData = convertOverpassPayload(payload, reference, { airportMetadata: reference.airport });
        await this.#writeCache(mapData);
        return { ...mapData, cache: { status: 'downloaded', offlineReady: true } };
      } catch (error) {
        errors.push(`${new URL(endpoint).hostname}: ${error.message}`);
      }
    }
    throw new Error(`Airport map download failed (${errors.join('; ')})`);
  }

  async getMap(reference, { forceRefresh = false } = {}) {
    const icao = normalizeIcao(reference?.icao);
    const center = pointFromPair(reference?.lat, reference?.lon);
    if (!icao || !center) throw new TypeError('A valid airport reference is required');
    const normalized = { icao, ...center, airport: reference.airport ?? null };
    const cached = await this.#readCache(icao, normalized.airport);
    const staleSchema = Boolean(cached && cached.schemaVersion !== SCHEMA_VERSION);
    if (cached && !forceRefresh && !staleSchema) {
      return { ...cached, cache: { status: 'cached', offlineReady: true } };
    }

    const key = `${icao}:${forceRefresh ? 'refresh' : 'load'}`;
    if (!this.inFlight.has(key)) {
      const task = this.#download(normalized)
        .catch((error) => {
          if (cached) return { ...cached, cache: { status: 'offline', offlineReady: true, warning: error.message } };
          throw error;
        })
        .finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, task);
    }
    return this.inFlight.get(key);
  }
}
