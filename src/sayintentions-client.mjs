const DEFAULT_FLIGHT_JSON_URL = 'http://localhost:63287/flightJSON';
const DEFAULT_SAPI_BASE_URL = 'https://apipri.sayintentions.ai/sapi/';
const MAX_COMMS_HISTORY = 2_000;

function commKey(entry = {}) {
  const id = Number(entry.id);
  if (Number.isFinite(id) && id > 0) return `id:${id}`;
  return [entry.stamp_zulu, entry.station_name, entry.ident, entry.outgoing_message_english, entry.incoming_message_english, entry.message].map((value) => String(value || '')).join('|');
}

async function fetchJson(url, timeoutMs = 4_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body); } catch { return { ok: true, text: body.slice(0, 2_000) }; }
}

function normalizeAirports(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim().toUpperCase())
    .filter((value) => /^[A-Z0-9]{3,4}$/.test(value)))].slice(0, 8);
}

function safeHostname(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

export class SayIntentionsClient {
  constructor(engine, {
    flightJsonUrl = DEFAULT_FLIGHT_JSON_URL,
    flightPollMs = 2_000,
    commsPollMs = 2_500,
    operationsPollMs = 10_000,
    weatherPollMs = 120_000,
  } = {}) {
    this.engine = engine;
    this.flightJsonUrl = flightJsonUrl;
    this.flightPollMs = flightPollMs;
    this.commsPollMs = commsPollMs;
    this.operationsPollMs = operationsPollMs;
    this.weatherPollMs = weatherPollMs;
    this.apiKey = null;
    this.currentFlightId = null;
    this.airportDataFlightId = null;
    this.sapiBaseUrl = DEFAULT_SAPI_BASE_URL;
    this.lastCommsId = 0;
    this.allComms = [];
    this.flightTimer = null;
    this.commsTimer = null;
    this.operationsTimer = null;
    this.stopped = true;
    this.lastParkingFetch = 0;
    this.lastWeatherFetch = 0;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#pollFlight();
    this.#pollComms();
    this.#pollOperations();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.flightTimer);
    clearTimeout(this.commsTimer);
    clearTimeout(this.operationsTimer);
  }

  async #pollFlight() {
    try {
      const data = await fetchJson(this.flightJsonUrl);
      const details = data?.flight_details;
      if (details) {
        const nextFlightId = details.flight_id;
        if (nextFlightId && nextFlightId !== this.currentFlightId) {
          this.currentFlightId = nextFlightId;
          this.lastCommsId = 0;
          this.allComms = [];
        }
        this.apiKey = details.api_key ?? this.apiKey;
        const host = safeHostname(details.hostname);
        if (host) this.sapiBaseUrl = `${host}/sapi/`;
        if (this.apiKey && nextFlightId && this.airportDataFlightId !== nextFlightId) {
          this.airportDataFlightId = nextFlightId;
          this.refreshAirportData().catch(() => {});
        }
      }
      this.engine.applyFlightJson(data);
      if (this.apiKey && this.currentFlightId && Date.now() - this.lastParkingFetch > 20_000) {
        this.refreshParking().catch(() => {});
      }
    } catch (error) {
      this.engine.setConnection(
        'sayIntentions',
        'disconnected',
        'SayIntentions nicht erreichbar – Client und Flug prüfen',
      );
    } finally {
      if (!this.stopped) this.flightTimer = setTimeout(() => this.#pollFlight(), this.flightPollMs);
    }
  }

  async #pollComms() {
    try {
      if (this.apiKey) {
        const url = new URL('getCommsHistory', this.sapiBaseUrl);
        url.searchParams.set('api_key', this.apiKey);
        if (this.lastCommsId > 0) url.searchParams.set('since_id', String(this.lastCommsId));
        const data = await fetchJson(url);
        const responseFlightId = data?.flight_id;
        if (responseFlightId && this.currentFlightId && String(responseFlightId) !== String(this.currentFlightId)) {
          this.currentFlightId = responseFlightId;
          this.lastCommsId = 0;
          this.allComms = [];
        } else if (responseFlightId && !this.currentFlightId) {
          this.currentFlightId = responseFlightId;
        }
        const entries = Array.isArray(data?.comm_history) ? data.comm_history : [];
        if (entries.length > 0) {
          const merged = new Map(this.allComms.map((entry) => [commKey(entry), entry]));
          for (const entry of entries) merged.set(commKey(entry), entry);
          this.allComms = [...merged.values()].slice(-MAX_COMMS_HISTORY);
          this.lastCommsId = Math.max(this.lastCommsId, ...entries.map((entry) => Number(entry.id) || 0));
          this.engine.applyComms(this.allComms);
          this.engine.setIntegration('sayIntentions', {
            commsCount: this.allComms.length,
            commsHistoryLimit: MAX_COMMS_HISTORY,
            commsUpdatedAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      // The moving map remains usable when the optional communications endpoint is unavailable.
    } finally {
      if (!this.stopped) this.commsTimer = setTimeout(() => this.#pollComms(), this.commsPollMs);
    }
  }

  async refreshParking() {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    this.lastParkingFetch = Date.now();
    const url = new URL('getParking', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    const parking = await fetchJson(url, 6_000);
    this.engine.applyParking(parking);
    return parking;
  }

  async refreshWeather(airports = []) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const state = this.engine.publicState();
    const normalized = normalizeAirports(airports.length ? airports : [
      state.flight?.currentAirport,
      state.flight?.origin,
      state.flight?.destination,
    ]);
    if (!normalized.length) throw new Error('Noch kein Flughafen für SI-Wetter verfügbar.');
    const url = new URL('getWX', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('icao', normalized.join(','));
    url.searchParams.set('with_comms', '1');
    const weather = await fetchJson(url, 8_000);
    this.engine.applySayIntentionsWeather(weather);
    this.lastWeatherFetch = Date.now();
    return weather;
  }

  async refreshAirportData() {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const url = new URL('getAirport', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    const airportData = await fetchJson(url, 8_000);
    this.engine.setIntegration('sayIntentions', {
      airportData,
      airportDataUpdatedAt: new Date().toISOString(),
    });
    return airportData;
  }

  async assignGate({ airport, gate } = {}) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const normalizedAirport = String(airport || '').trim().toUpperCase();
    const normalizedGate = String(gate || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(normalizedAirport)) throw new Error('Airport muss ein gültiger 3–4-stelliger ICAO-Code sein.');
    if (!/^[A-Z0-9]{1,30}$/.test(normalizedGate)) throw new Error('Gate darf nur Buchstaben und Zahlen enthalten.');
    const url = new URL('assignGate', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('gate', normalizedGate);
    url.searchParams.set('airport', normalizedAirport);
    const result = await fetchJson(url, 8_000);
    const assignedGate = String(result?.assigned_gate_name || normalizedGate).trim();
    this.engine.applyParking({ parking: { name: assignedGate } });
    this.lastParkingFetch = 0;
    let parking = null;
    try { parking = await this.refreshParking(); } catch { /* SI may publish coordinates a moment later. */ }
    this.refreshAirportData().catch(() => {});
    return { ...result, assigned_gate_name: assignedGate, parking: parking?.parking ?? parking ?? null };
  }

  async setPaused(paused) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const value = Boolean(paused);
    const url = new URL('setPause', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('value', value ? '1' : '0');
    const result = await fetchJson(url, 6_000);
    this.engine.setIntegration('sayIntentions', {
      paused: value,
      pauseUpdatedAt: new Date().toISOString(),
    });
    return result;
  }

  async sayAs({ channel = 'COM1', message = '' } = {}) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const normalizedChannel = String(channel || '').trim().toUpperCase();
    if (!['COM1', 'COM2'].includes(normalizedChannel)) {
      throw new Error('Im EFB sind nur Pilot→ATC Nachrichten über COM1 oder COM2 freigegeben.');
    }
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage || normalizedMessage.length > 255) throw new Error('Nachricht muss 1 bis 255 Zeichen lang sein.');
    const url = new URL('sayAs', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('channel', normalizedChannel);
    url.searchParams.set('message', normalizedMessage);
    return fetchJson(url, 8_000);
  }

  async #pollOperations() {
    try {
      if (!this.apiKey) return;
      try {
        const frequenciesUrl = new URL('getCurrentFrequencies', this.sapiBaseUrl);
        frequenciesUrl.searchParams.set('api_key', this.apiKey);
        this.engine.applySayIntentionsFrequencies(await fetchJson(frequenciesUrl));
      } catch {
        // Weather below can still be useful if this optional endpoint is unavailable.
      }

      if (Date.now() - this.lastWeatherFetch >= this.weatherPollMs) {
        const state = this.engine.publicState();
        const airports = [...new Set([
          state.flight.currentAirport,
          state.flight.origin,
          state.flight.destination,
        ].map((value) => String(value || '').trim().toUpperCase()).filter((value) => /^[A-Z0-9]{3,4}$/.test(value)))];
        if (airports.length > 0) {
          const weatherUrl = new URL('getWX', this.sapiBaseUrl);
          weatherUrl.searchParams.set('api_key', this.apiKey);
          weatherUrl.searchParams.set('icao', airports.join(','));
          weatherUrl.searchParams.set('with_comms', '1');
          try {
            this.engine.applySayIntentionsWeather(await fetchJson(weatherUrl, 8_000));
            this.lastWeatherFetch = Date.now();
          } catch {
            // Retry on the next operations cycle.
          }
        }
      }
    } catch {
      // Weather/frequency data is optional and must not interrupt taxi guidance.
    } finally {
      if (!this.stopped) this.operationsTimer = setTimeout(() => this.#pollOperations(), this.operationsPollMs);
    }
  }

  async setFrequency({ frequency, com = 1, mode = 'standby' } = {}) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const parsedFrequency = Number(frequency);
    const parsedCom = Number(com);
    if (!Number.isFinite(parsedFrequency) || parsedFrequency < 118 || parsedFrequency > 137) {
      throw new Error('Die Frequenz muss zwischen 118.000 und 137.000 MHz liegen.');
    }
    if (![1, 2].includes(parsedCom)) throw new Error('COM muss 1 oder 2 sein.');
    if (!['active', 'standby'].includes(mode)) throw new Error('Unbekannter Frequenzmodus.');
    const url = new URL('setFreq', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('freq', parsedFrequency.toFixed(3));
    url.searchParams.set('com', String(parsedCom));
    url.searchParams.set('mode', mode);
    return fetchJson(url);
  }
}
