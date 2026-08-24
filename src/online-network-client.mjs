const ENDPOINTS = Object.freeze({
  vatsim: 'https://data.vatsim.net/v3/vatsim-data.json',
  ivao: 'https://api.ivao.aero/v2/tracker/whazzup',
});

function clean(value, max = 300) {
  return value === undefined || value === null ? '' : String(value).trim().slice(0, max);
}

function normalizedAirports(values) {
  return [...new Set(values.map((value) => clean(value, 4).toUpperCase()).filter((value) => /^[A-Z0-9]{4}$/.test(value)))];
}

function relevantCallsign(callsign, airports) {
  const normalized = clean(callsign, 30).toUpperCase();
  return airports.some((icao) => normalized === icao || normalized.startsWith(`${icao}_`));
}

function normalizeVatsim(payload, airports) {
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
  return {
    updatedAt: payload.general?.update_timestamp || new Date().toISOString(),
    connectedClients: Number(payload.general?.connected_clients) || null,
    controllers,
    atis,
  };
}

function normalizeIvao(payload, airports) {
  const rawAtcs = payload.clients?.atcs || payload.atcs || payload.controllers || [];
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
  return {
    updatedAt: payload.updatedAt || payload.updateTimestamp || new Date().toISOString(),
    connectedClients: Number(payload.clients?.total || payload.connectedClients) || null,
    controllers,
    atis,
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
    const cacheKey = `${selected}:${airports.join(',')}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < this.cacheMs) return cached.value;
    this.engine.setIntegration('onlineNetworks', {
      selected,
      status: 'loading',
      airports,
      detail: `${selected.toUpperCase()} wird aktualisiert …`,
    });
    const response = await this.fetchImpl(ENDPOINTS[selected], {
      headers: { Accept: 'application/json', 'User-Agent': 'Flight-Deck-EFB/1.3.2' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`${selected.toUpperCase()} antwortet mit HTTP ${response.status}.`);
    const payload = await response.json();
    const normalized = selected === 'vatsim'
      ? normalizeVatsim(payload, airports)
      : normalizeIvao(payload, airports);
    const value = {
      selected,
      status: 'ready',
      airports,
      ...normalized,
      detail: `${normalized.controllers.length} relevante ATC-Positionen online`,
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
      detail: 'Online-Netzwerk deaktiviert',
    });
  }
}
