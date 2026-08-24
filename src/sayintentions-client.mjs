const DEFAULT_FLIGHT_JSON_URL = 'http://localhost:63287/flightJSON';
const DEFAULT_SAPI_BASE_URL = 'https://apipri.sayintentions.ai/sapi/';

async function fetchJson(url, timeoutMs = 4_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
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
      }
      this.engine.applyFlightJson(data);

      const publicState = this.engine.publicState();
      const needsParking = publicState.gate && (publicState.gate.lat === null || publicState.gate.lon === null);
      if (needsParking && this.apiKey && Date.now() - this.lastParkingFetch > 20_000) {
        this.lastParkingFetch = Date.now();
        this.#fetchParking().catch(() => {});
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
        const entries = Array.isArray(data?.comm_history) ? data.comm_history : [];
        if (entries.length > 0) {
          this.allComms.push(...entries);
          this.allComms = this.allComms.slice(-100);
          this.lastCommsId = Math.max(this.lastCommsId, ...entries.map((entry) => Number(entry.id) || 0));
          this.engine.applyComms(this.allComms);
        }
      }
    } catch {
      // The moving map remains usable when the optional communications endpoint is unavailable.
    } finally {
      if (!this.stopped) this.commsTimer = setTimeout(() => this.#pollComms(), this.commsPollMs);
    }
  }

  async #fetchParking() {
    const url = new URL('getParking', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    const parking = await fetchJson(url);
    this.engine.applyParking(parking);
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
