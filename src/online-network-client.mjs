const ENDPOINTS = Object.freeze({
  vatsim: 'https://data.vatsim.net/v3/vatsim-data.json',
  ivao: 'https://api.ivao.aero/v2/tracker/whazzup',
});

const EARTH_RADIUS_KM = 6_371;
const NEARBY_TRAFFIC_KM = 250;

function clean(value, max = 300) {
  return value === undefined || value === null ? '' : String(value).trim().slice(0, max);
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedAirports(values) {
  return [...new Set(values.map((value) => clean(value, 4).toUpperCase()).filter((value) => /^[A-Z0-9]{4}$/.test(value)))];
}

function relevantCallsign(callsign, airports) {
  const normalized = clean(callsign, 30).toUpperCase();
  return airports.some((icao) => normalized === icao || normalized.startsWith(`${icao}_`));
}

function distanceKm(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return Infinity;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizePosition(item) {
  const lat = numeric(item?.latitude ?? item?.lat ?? item?.lastTrack?.latitude);
  const lon = numeric(item?.longitude ?? item?.lon ?? item?.lastTrack?.longitude);
  return lat === null || lon === null ? null : { lat, lon };
}

function relevantPilot(item, airports, ownPosition, network) {
  const fp = network === 'vatsim' ? item.flight_plan || {} : item.flightPlan || item.flight_plan || {};
  const departure = clean(fp.departure || fp.departureId || fp.departureAirport, 4).toUpperCase();
  const arrival = clean(fp.arrival || fp.arrivalId || fp.arrivalAirport, 4).toUpperCase();
  if (airports.includes(departure) || airports.includes(arrival)) return true;
  const pos = normalizePosition(item);
  return distanceKm(pos, ownPosition) <= NEARBY_TRAFFIC_KM;
}

function normalizePilot(item, network) {
  const fp = network === 'vatsim' ? item.flight_plan || {} : item.flightPlan || item.flight_plan || {};
  const pos = normalizePosition(item);
  const last = item.lastTrack || {};
  return {
    callsign: clean(item.callsign, 30),
    name: clean(item.name || item.userId, 80),
    lat: pos?.lat ?? null,
    lon: pos?.lon ?? null,
    altitudeFeet: numeric(item.altitude ?? last.altitude),
    groundSpeedKnots: numeric(item.groundspeed ?? item.groundSpeed ?? last.groundSpeed),
    heading: numeric(item.heading ?? last.heading),
    aircraft: clean(fp.aircraft_short || fp.aircraft || fp.aircraftId || fp.aircraftType, 40),
    departure: clean(fp.departure || fp.departureId || fp.departureAirport, 4).toUpperCase(),
    arrival: clean(fp.arrival || fp.arrivalId || fp.arrivalAirport, 4).toUpperCase(),
    alternate: clean(fp.alternate || fp.alternateId, 4).toUpperCase(),
    route: clean(fp.route, 1_500),
    network,
  };
}

function normalizeVatsim(payload, airports, ownPosition) {
  const controllers = (payload.controllers || [])
    .filter((item) => relevantCallsign(item.callsign, airports))
    .map((item) => ({
      callsign: clean(item.callsign, 30),
      frequency: clean(item.frequency, 16),
      name: clean(item.name, 80),
      facility: Number(item.facility) || null,
      atis: Array.isArray(item.text_atis) ? item.text_atis.map((line) => clean(line, 300)).filter(Boolean).slice(0, 12) : [],
    }));
  const atis = (payload.atis || [])
    .filter((item) => relevantCallsign(item.callsign, airports))
    .map((item) => ({
      callsign: clean(item.callsign, 30),
      frequency: clean(item.frequency, 16),
      code: clean(item.atis_code, 8),
      text: Array.isArray(item.text_atis) ? item.text_atis.map((line) => clean(line, 300)).filter(Boolean).slice(0, 16) : [],
    }));
  const pilots = (payload.pilots || [])
    .filter((item) => relevantPilot(item, airports, ownPosition, 'vatsim'))
    .map((item) => normalizePilot(item, 'vatsim'))
    .slice(0, 500);
  return {
    updatedAt: payload.general?.update_timestamp || new Date().toISOString(),
    connectedClients: Number(payload.general?.connected_clients) || null,
    controllers,
    atis,
    pilots,
  };
}

function normalizeIvao(payload, airports, ownPosition) {
  const rawAtcs = payload.clients?.atcs || payload.atcs || payload.controllers || [];
  const rawPilots = payload.clients?.pilots || payload.pilots || [];
  const controllers = rawAtcs
    .filter((item) => relevantCallsign(item.callsign, airports))
    .map((item) => ({
      callsign: clean(item.callsign, 30),
      frequency: clean(item.lastTrack?.frequency || item.frequency, 16),
      name: clean(item.name || item.userId, 80),
      facility: clean(item.rating?.shortName || item.ratingShortName, 20) || null,
      atis: Array.isArray(item.atis?.lines) ? item.atis.lines.map((line) => clean(line, 300)).filter(Boolean).slice(0, 12) : [],
    }));
  const atis = controllers.filter((item) => item.callsign.endsWith('_ATIS') || item.atis.length).map((item) => ({
    callsign: item.callsign,
    frequency: item.frequency,
    code: '',
    text: item.atis,
  }));
  const pilots = rawPilots
    .filter((item) => relevantPilot(item, airports, ownPosition, 'ivao'))
    .map((item) => normalizePilot(item, 'ivao'))
    .slice(0, 500);
  return {
    updatedAt: payload.updatedAt || payload.updateTimestamp || new Date().toISOString(),
    connectedClients: Number(payload.clients?.total || payload.connectedClients) || null,
    controllers,
    atis,
    pilots,
  };
}

export class OnlineNetworkClient {
  constructor(engine, { fetchImpl = globalThis.fetch, timeoutMs = 10_000, cacheMs = 15_000 } = {}) {
    this.engine = engine;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.cacheMs = cacheMs;
    this.cache = new Map();
  }

  async refresh(network) {
    const selected = String(network || '').toLowerCase();
    if (!ENDPOINTS[selected]) throw new Error('Unbekanntes Online-Netzwerk.');
    const state = this.engine.publicState();
    const airports = normalizedAirports([
      state.flight.currentAirport,
      state.flight.origin,
      state.flight.destination,
      state.planning.selectedAirport?.icao,
    ]);
    if (airports.length === 0) throw new Error('Für die Netzwerkabfrage wird zuerst ein Flughafen benötigt.');
    const ownPosition = Number.isFinite(state.aircraft?.lat) && Number.isFinite(state.aircraft?.lon)
      ? { lat: state.aircraft.lat, lon: state.aircraft.lon }
      : null;
    const cacheKey = `${selected}:${airports.join(',')}:${ownPosition ? `${ownPosition.lat.toFixed(2)},${ownPosition.lon.toFixed(2)}` : 'none'}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < this.cacheMs) return cached.value;
    this.engine.setIntegration('onlineNetworks', {
      selected,
      status: 'loading',
      airports,
      detail: `${selected.toUpperCase()} wird aktualisiert …`,
    });
    const response = await this.fetchImpl(ENDPOINTS[selected], {
      headers: { Accept: 'application/json', 'User-Agent': 'Flight-Deck-EFB' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`${selected.toUpperCase()} antwortet mit HTTP ${response.status}.`);
    const payload = await response.json();
    const normalized = selected === 'vatsim'
      ? normalizeVatsim(payload, airports, ownPosition)
      : normalizeIvao(payload, airports, ownPosition);
    const value = {
      selected,
      status: 'ready',
      airports,
      ...normalized,
      detail: `${normalized.controllers.length} relevante ATC-Positionen · ${normalized.pilots.length} relevante Flugzeuge`,
    };
    this.cache.set(cacheKey, { at: Date.now(), value });
    this.engine.setIntegration('onlineNetworks', value);
    return value;
  }

  disable() {
    this.engine.setIntegration('onlineNetworks', {
      selected: 'off',
      status: 'idle',
      updatedAt: null,
      airports: [],
      controllers: [],
      atis: [],
      pilots: [],
      detail: 'Online-Netzwerk deaktiviert',
    });
  }
}
