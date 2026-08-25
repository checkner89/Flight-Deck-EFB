const DEFAULT_BASE_URL = 'http://127.0.0.1:8965/api/';

function normalizeBaseUrl(value) {
  const url = new URL(String(value || DEFAULT_BASE_URL));
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)) {
    throw new Error('Little Navmap WebAPI muss lokal auf diesem Windows-PC laufen.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
  url.search = '';
  url.hash = '';
  return url;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textOrNull(value, max = 300) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function positionOrNull(value) {
  const lat = numberOrNull(value?.lat);
  const lon = numberOrNull(value?.lon ?? value?.lng);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function normalizeCom(value = {}) {
  const result = {};
  for (const [name, raw] of Object.entries(value || {}).slice(0, 30)) {
    const numeric = numberOrNull(raw);
    if (numeric === null) continue;
    result[String(name).slice(0, 30)] = numeric > 1_000 ? numeric / 1_000 : numeric;
  }
  return result;
}

function normalizeAirport(value = {}) {
  const ident = textOrNull(value.ident || value.icao, 8)?.toUpperCase() || null;
  return {
    ident,
    icao: textOrNull(value.icao || value.ident, 8)?.toUpperCase() || ident,
    iata: textOrNull(value.iata, 8)?.toUpperCase() || null,
    name: textOrNull(value.name, 120),
    city: textOrNull(value.city, 100),
    state: textOrNull(value.state, 100),
    country: textOrNull(value.country, 100),
    region: textOrNull(value.region, 60),
    position: positionOrNull(value.position),
    elevationFeet: numberOrNull(value.elevation),
    transitionAltitudeFeet: numberOrNull(value.transitionAltitude),
    magneticDeclination: numberOrNull(value.magneticDeclination),
    longestRunwayLengthMeters: numberOrNull(value.longestRunwayLength),
    longestRunwayWidthMeters: numberOrNull(value.longestRunwayWidth),
    longestRunwayHeading: textOrNull(value.longestRunwayHeading, 40),
    longestRunwaySurface: textOrNull(value.longestRunwaySurface, 30),
    closed: Boolean(value.closed),
    facilities: Array.isArray(value.facilities) ? value.facilities.slice(0, 60).map((item) => String(item).slice(0, 60)) : [],
    runwayFlags: Array.isArray(value.runways) ? value.runways.slice(0, 40).map((item) => String(item).slice(0, 60)) : [],
    parking: value.parking && typeof value.parking === 'object' ? { ...value.parking } : {},
    com: normalizeCom(value.com),
    metar: value.metar && typeof value.metar === 'object' ? structuredClone(value.metar) : {},
    sunrise: textOrNull(value.sunrise, 40),
    sunset: textOrNull(value.sunset, 40),
    activeDateTime: textOrNull(value.activeDateTime, 80),
    activeDateTimeSource: textOrNull(value.activeDateTimeSource, 80),
  };
}

export class LittleNavmapClient {
  constructor(engine, {
    baseUrl = process.env.LITTLENAVMAP_API_URL || DEFAULT_BASE_URL,
    fetchImpl = globalThis.fetch,
    pollMs = 5_000,
    timeoutMs = 2_500,
    airportCacheMs = 30 * 60_000,
  } = {}) {
    this.engine = engine;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.fetchImpl = fetchImpl;
    this.pollMs = Math.max(2_000, Number(pollMs) || 5_000);
    this.timeoutMs = Math.max(1_000, Number(timeoutMs) || 2_500);
    this.airportCacheMs = Math.max(30_000, Number(airportCacheMs) || 30 * 60_000);
    this.timer = null;
    this.stopped = true;
    this.airportCache = new Map();
    this.lastSuccessAt = 0;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.engine.setIntegration('littleNavmap', {
      status: 'connecting',
      reachable: false,
      simulatorConnected: false,
      detail: 'Little Navmap WebAPI wird gesucht …',
    });
    this.#poll();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
  }

  async #get(pathname, search = {}) {
    const url = new URL(String(pathname).replace(/^\/+/, ''), this.baseUrl);
    for (const [key, value] of Object.entries(search)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'Flight-Deck-EFB' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Little Navmap antwortet mit HTTP ${response.status}.`);
    return response.json();
  }

  async refresh() {
    const sim = await this.#get('sim/info');
    const active = Boolean(sim?.active);
    const position = positionOrNull(sim?.position);
    const snapshot = {
      status: active ? 'connected' : 'ready',
      reachable: true,
      simulatorConnected: active,
      updatedAt: new Date().toISOString(),
      detail: active ? 'Little Navmap · Simulator verbunden' : 'Little Navmap WebAPI erreichbar · Simulator nicht verbunden',
      sim: {
        active,
        simConnectStatus: textOrNull(sim?.simconnect_status, 160),
        position,
        altitudeAboveGroundFeet: numberOrNull(sim?.altitude_above_ground),
        indicatedAltitudeFeet: numberOrNull(sim?.indicated_altitude),
        groundSpeedKnots: numberOrNull(sim?.ground_speed),
        indicatedSpeedKnots: numberOrNull(sim?.indicated_speed),
        trueAirspeedKnots: numberOrNull(sim?.true_airspeed),
        verticalSpeedFpm: numberOrNull(sim?.vertical_speed),
        headingDegrees: numberOrNull(sim?.heading),
        windDirectionDegrees: numberOrNull(sim?.wind_direction),
        windSpeedKnots: numberOrNull(sim?.wind_speed),
        seaLevelPressureHpa: numberOrNull(sim?.sea_level_pressure),
      },
    };
    this.lastSuccessAt = Date.now();
    this.engine.setIntegration('littleNavmap', snapshot);
    return snapshot;
  }

  async getAirport(icao, { force = false } = {}) {
    const ident = String(icao || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(ident)) throw new Error('Ungültiger Flughafen-ICAO-Code.');
    const cached = this.airportCache.get(ident);
    if (!force && cached && Date.now() - cached.at < this.airportCacheMs) return structuredClone(cached.value);
    const airport = normalizeAirport(await this.#get('airport/info', { ident }));
    if (!airport.ident) throw new Error(`Little Navmap hat ${ident} nicht gefunden.`);
    this.airportCache.set(ident, { at: Date.now(), value: airport });
    this.engine.setIntegration('littleNavmap', {
      airport,
      airportUpdatedAt: new Date().toISOString(),
    });
    return structuredClone(airport);
  }

  async #poll() {
    try {
      await this.refresh();
    } catch (error) {
      const recentlyReachable = this.lastSuccessAt > 0 && Date.now() - this.lastSuccessAt < 20_000;
      this.engine.setIntegration('littleNavmap', {
        status: recentlyReachable ? 'limited' : 'waiting',
        reachable: recentlyReachable,
        simulatorConnected: false,
        updatedAt: new Date().toISOString(),
        detail: recentlyReachable
          ? `Little Navmap antwortet vorübergehend nicht · ${error.message}`
          : 'Little Navmap nicht verbunden · Webserver in Little Navmap starten',
      });
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => this.#poll(), this.pollMs);
    }
  }
}
