const API_BASE = 'https://aviationweather.gov/api/data/';

function normalizeAirports(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim().toUpperCase())
    .filter((value) => /^[A-Z0-9]{3,4}$/.test(value)))].slice(0, 6);
}

function rawText(entry, fields) {
  for (const field of fields) {
    const value = entry?.[field];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 2_000);
  }
  return null;
}

async function fetchProduct(product, airports, fetchImpl) {
  const url = new URL(product, API_BASE);
  url.searchParams.set('ids', airports.join(','));
  url.searchParams.set('format', 'json');
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'Flight-Deck-EFB/1.3.0 flight-simulation-companion' },
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`AviationWeather ${product.toUpperCase()} HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export class AviationWeatherClient {
  constructor(engine, { fetchImpl = globalThis.fetch, refreshMs = 10 * 60_000 } = {}) {
    this.engine = engine;
    this.fetchImpl = fetchImpl;
    this.refreshMs = refreshMs;
    this.timer = null;
    this.stopped = true;
    this.lastFingerprint = '';
    this.lastFetchAt = 0;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#poll();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  async refresh(airports = this.#airportsFromState(), { force = false } = {}) {
    const normalized = normalizeAirports(airports);
    if (!normalized.length) return null;
    const fingerprint = normalized.join(',');
    if (!force && fingerprint === this.lastFingerprint && Date.now() - this.lastFetchAt < this.refreshMs) {
      return this.engine.publicState().integrations?.aviationWeather || null;
    }
    this.engine.setIntegration('aviationWeather', { status: 'loading', airportsRequested: normalized, detail: 'METAR und TAF werden geladen …' });
    try {
      const [metars, tafs] = await Promise.all([
        fetchProduct('metar', normalized, this.fetchImpl),
        fetchProduct('taf', normalized, this.fetchImpl),
      ]);
      const byAirport = new Map(normalized.map((airport) => [airport, { airport, metar: null, taf: null, observedAt: null }]));
      for (const entry of metars) {
        const airport = String(entry.icaoId || entry.station || entry.stationId || '').toUpperCase();
        if (!byAirport.has(airport)) continue;
        Object.assign(byAirport.get(airport), {
          metar: rawText(entry, ['rawOb', 'raw_text', 'rawText']),
          observedAt: entry.reportTime || entry.obsTime || entry.observation_time || null,
          flightCategory: entry.fltCat || entry.flight_category || null,
          windDirection: Number.isFinite(Number(entry.wdir)) ? Number(entry.wdir) : null,
          windSpeed: Number.isFinite(Number(entry.wspd)) ? Number(entry.wspd) : null,
        });
      }
      for (const entry of tafs) {
        const airport = String(entry.icaoId || entry.station || entry.stationId || '').toUpperCase();
        if (byAirport.has(airport)) byAirport.get(airport).taf = rawText(entry, ['rawTAF', 'raw_text', 'rawText']);
      }
      const result = {
        status: 'ready', source: 'AviationWeather.gov', updatedAt: new Date().toISOString(),
        airports: [...byAirport.values()], airportsRequested: normalized,
        detail: `${normalized.length} Flughafen${normalized.length === 1 ? '' : 'häfen'} aktualisiert`,
      };
      this.lastFingerprint = fingerprint;
      this.lastFetchAt = Date.now();
      this.engine.setIntegration('aviationWeather', result);
      return result;
    } catch (error) {
      this.engine.setIntegration('aviationWeather', { status: 'error', detail: error.message, airportsRequested: normalized });
      throw error;
    }
  }

  #airportsFromState() {
    const state = this.engine.publicState();
    const simbrief = state.integrations?.simbrief?.flight || {};
    return [state.flight?.currentAirport, state.flight?.origin, simbrief.origin, state.flight?.destination, simbrief.destination];
  }

  async #poll() {
    try { await this.refresh(); } catch { /* SI weather and imported OFP remain available as fallback. */ }
    if (!this.stopped) this.timer = setTimeout(() => this.#poll(), 60_000);
  }
}

export { normalizeAirports as normalizeWeatherAirports };
