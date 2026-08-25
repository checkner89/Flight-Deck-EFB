import { EventEmitter } from 'node:events';

const EARTH_RADIUS_METERS = 6_371_000;
const ATC_PROVIDERS = new Set(['auto', 'sayintentions', 'beyondatc', 'manual']);
const EXACT_PATH_SOURCES = new Set(['sayintentions', 'beyondatc']);
const FLIGHT_PHASE_OVERRIDES = new Set(['auto', 'preflight', 'taxi-out', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing', 'taxi-in', 'postflight']);
const MAX_GUIDANCE_ROUTE_DISTANCE_METERS = 25_000;

export const DEFAULT_THRESHOLDS = Object.freeze({
  attentionMeters: 20,
  offRouteMeters: 35,
  warningDelayMs: 2_500,
});

function emptyFlight() {
  return {
    flightId: null,
    callsign: null,
    origin: null,
    destination: null,
    currentAirport: null,
    originPosition: null,
    destinationPosition: null,
    departureRunway: null,
    arrivalRunway: null,
    availableArrivalRunways: [],
    flightPlanRoute: null,
    sid: null,
    star: null,
    flightPhase: null,
    distanceToRunwayNm: null,
    takeoffRunway: null,
    landingRunway: null,
    clearedForTakeoff: false,
    clearedForLanding: false,
  };
}

function emptyFlightOperations() {
  return {
    phaseOverride: 'auto',
    checklist: {},
    notes: '',
    updatedAt: null,
  };
}

function unavailableGuidance(reason = null) {
  return {
    available: false,
    deviationMeters: null,
    remainingMeters: null,
    closestSegment: null,
    status: 'unavailable',
    warning: false,
    reason,
  };
}

function runwayOrNull(value) {
  if (value === true || value === 1 || String(value).trim() === '1') return null;
  if (value === false || value === 0 || String(value).trim() === '0') return null;
  const text = textOrEmpty(value).toUpperCase();
  return /^[0-3]?\d(?:[LCR])?$/.test(text) ? text : null;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pointOrNull(latValue, lonValue) {
  const lat = numberOrNull(latValue);
  const lon = numberOrNull(lonValue);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function firstDefined(...values) {
  const value = values.find((candidate) => {
    if (candidate === undefined || candidate === null || candidate === '') return false;
    if (typeof candidate !== 'string') return true;
    return !['undefined', 'null', 'none', 'nan'].includes(candidate.trim().toLowerCase());
  });
  return value === undefined ? null : value;
}

function textOrEmpty(...values) {
  const value = firstDefined(...values);
  if (value === undefined || value === null || typeof value === 'object') return '';
  const text = String(value).trim();
  return ['undefined', 'null', 'none', 'nan'].includes(text.toLowerCase()) ? '' : text;
}

function boolish(value) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  }
  return Boolean(value);
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function unwrapPath(value) {
  const parsed = parseMaybeJson(value);
  if (Array.isArray(parsed)) return { points: parsed, geoJson: false };
  if (!parsed || typeof parsed !== 'object') return { points: [], geoJson: false };

  if (parsed.type === 'Feature') return unwrapPath(parsed.geometry);
  if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    const line = parsed.features.find((feature) => feature?.geometry?.type === 'LineString');
    return line ? unwrapPath(line.geometry) : { points: [], geoJson: false };
  }

  if (parsed.type === 'LineString' && Array.isArray(parsed.coordinates)) {
    return { points: parsed.coordinates, geoJson: true };
  }

  for (const key of ['points', 'path', 'waypoints', 'coordinates', 'taxi_path']) {
    if (Array.isArray(parsed[key])) {
      return { points: parsed[key], geoJson: key === 'coordinates' };
    }
  }

  return { points: [], geoJson: false };
}

export function normalizeTaxiPath(value) {
  const { points, geoJson } = unwrapPath(value);
  const normalized = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    let lat;
    let lon;
    let metadata = {};

    if (Array.isArray(point)) {
      if (geoJson) {
        lon = numberOrNull(point[0]);
        lat = numberOrNull(point[1]);
      } else {
        lat = numberOrNull(point[0]);
        lon = numberOrNull(point[1]);
      }
    } else if (point && typeof point === 'object') {
      const position = point.position ?? point.location ?? point.coordinate ?? point.coordinates ?? point;
      if (Array.isArray(position)) {
        const geoJsonPoint = position === point.coordinates;
        lat = numberOrNull(firstDefined(geoJsonPoint ? position[1] : position[0], point.lat, point.latitude));
        lon = numberOrNull(firstDefined(geoJsonPoint ? position[0] : position[1], point.lon, point.longitude));
      } else {
        lat = numberOrNull(firstDefined(position.lat, position.Lat, position.latitude, position.Latitude));
        lon = numberOrNull(firstDefined(position.lon, position.Lon, position.lng, position.longitude, position.Longitude));
      }
      metadata = point;
    }

    if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

    const descriptor = textOrEmpty(
      metadata.type,
      metadata.action,
      metadata.instruction,
      metadata.label,
      metadata.name,
    ).toLowerCase();

    const explicitHold = Boolean(firstDefined(
      metadata.hold_short,
      metadata.holdShort,
      metadata.is_hold_short,
      metadata.isHoldShort,
      false,
    ));

    normalized.push({
      lat,
      lon,
      index: normalized.length,
      label: textOrEmpty(metadata.label, metadata.name, metadata.taxiway),
      holdShort: explicitHold || descriptor.includes('hold short') || descriptor.includes('holding'),
    });
  }

  return normalized;
}

function toLocalMeters(point, referenceLatitude) {
  const latRad = point.lat * Math.PI / 180;
  const lonRad = point.lon * Math.PI / 180;
  const refRad = referenceLatitude * Math.PI / 180;
  return {
    x: EARTH_RADIUS_METERS * lonRad * Math.cos(refRad),
    y: EARTH_RADIUS_METERS * latRad,
  };
}

export function distanceMeters(a, b) {
  const referenceLatitude = (a.lat + b.lat) / 2;
  const localA = toLocalMeters(a, referenceLatitude);
  const localB = toLocalMeters(b, referenceLatitude);
  return Math.hypot(localA.x - localB.x, localA.y - localB.y);
}

export function closestPointOnPath(position, path, { minSegment = 0, maxSegment = null } = {}) {
  if (!position || !Array.isArray(path) || path.length === 0) return null;
  if (path.length === 1) {
    return {
      distanceMeters: distanceMeters(position, path[0]),
      segmentIndex: 0,
      segmentProgress: 0,
      point: { lat: path[0].lat, lon: path[0].lon },
      remainingMeters: 0,
    };
  }

  const referenceLatitude = position.lat;
  const localPosition = toLocalMeters(position, referenceLatitude);
  let best = null;

  const firstSegment = Math.max(0, Math.min(path.length - 2, Number(minSegment) || 0));
  const lastSegment = Math.max(firstSegment, Math.min(path.length - 2, Number.isFinite(Number(maxSegment)) ? Number(maxSegment) : path.length - 2));
  for (let index = firstSegment; index <= lastSegment; index += 1) {
    const start = toLocalMeters(path[index], referenceLatitude);
    const end = toLocalMeters(path[index + 1], referenceLatitude);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const rawProgress = lengthSquared === 0
      ? 0
      : ((localPosition.x - start.x) * dx + (localPosition.y - start.y) * dy) / lengthSquared;
    const progress = Math.max(0, Math.min(1, rawProgress));
    const closestX = start.x + progress * dx;
    const closestY = start.y + progress * dy;
    const distance = Math.hypot(localPosition.x - closestX, localPosition.y - closestY);

    if (!best || distance < best.distanceMeters) {
      const lat = path[index].lat + progress * (path[index + 1].lat - path[index].lat);
      const lon = path[index].lon + progress * (path[index + 1].lon - path[index].lon);
      best = {
        distanceMeters: distance,
        segmentIndex: index,
        segmentProgress: progress,
        point: { lat, lon },
      };
    }
  }

  let remainingMeters = 0;
  if (best) {
    remainingMeters += distanceMeters(best.point, path[best.segmentIndex + 1]);
    for (let index = best.segmentIndex + 1; index < path.length - 1; index += 1) {
      remainingMeters += distanceMeters(path[index], path[index + 1]);
    }
    best.remainingMeters = remainingMeters;
  }

  return best;
}

function findCurrentClearance(comms) {
  if (!Array.isArray(comms)) return null;
  const candidates = comms
    .map((entry) => ({
      id: numberOrNull(entry.id),
      text: textOrEmpty(
        entry.outgoing_message_english,
        entry.outgoing_message,
        entry.atc_message_english,
        entry.atc_message,
        entry.response_english,
        entry.response,
        entry.message_english,
        entry.message,
        entry.text,
      ),
      station: textOrEmpty(entry.station_name, entry.station, entry.ident),
      time: firstDefined(entry.stamp_zulu, null),
    }))
    .filter((entry) => entry.text);

  const taxiPattern = /\b(taxi|hold(?:ing)? short|holding point|cross (?:runway|rwy)|line up|continue|proceed|follow)\b/i;
  const taxiMessages = candidates.filter((entry) => taxiPattern.test(entry.text));
  return taxiMessages.at(-1) ?? candidates.at(-1) ?? null;
}

function extractRunwayFromClearance(text) {
  if (!text) return null;
  const match = text.match(/(?:runway|rwy)\s*([0-3]?\d(?:[LCR])?)/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function isHoldShortClearance(text) {
  return /\b(?:hold(?:ing)? short|holding point)\b/i.test(text ?? '');
}

function pathFingerprint(path) {
  return path.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join('|');
}

function airportFromRouteEnd(route) {
  const text = textOrEmpty(route).toUpperCase();
  if (!text) return null;
  const tokens = text.replace(/[.\\/,-]+/g, ' ').split(/\s+/).filter(Boolean);
  const candidate = [...tokens].reverse().find((token) => /^[A-Z][A-Z0-9]{3}$/.test(token));
  return candidate || null;
}

function flightIdentity({ flightId, callsign, origin, destination } = {}) {
  const parts = [flightId, callsign, origin, destination].map((value) => textOrEmpty(value).toUpperCase());
  return parts.some(Boolean) ? parts.join('|') : null;
}

export class StateEngine extends EventEmitter {
  constructor({ thresholds = {} } = {}) {
    super();
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.offRouteSince = null;
    this.guidanceSegmentIndex = null;
    this.state = {
      updatedAt: new Date().toISOString(),
      mode: 'live',
      connections: {
        sayIntentions: { status: 'waiting', detail: 'Warte auf aktiven Flug' },
        beyondAtc: { status: 'waiting', detail: 'BeyondATC-Log wird gesucht' },
        simConnect: { status: 'waiting', detail: 'Warte auf MSFS' },
        gsx: { status: 'waiting', detail: 'GSX-Installation wird gesucht' },
        navigraph: { status: 'configuration-required', detail: 'Developer-Zugang und Login erforderlich' },
      },
      atc: {
        selectedProvider: 'auto',
        activeProvider: null,
        providerClearances: {},
      },
      integrations: {
        sayIntentions: {
          status: 'waiting',
          comms: [],
          weather: { airports: [], comms: [], updatedAt: null },
          frequencies: null,
          flightPhase: null,
          taxiPathVisible: null,
          radioPositions: { com1: null, com2: null },
          intercomPositions: [null, null, null],
          audioState: { radioPtt: false, intercomPtt: false, com1Receiving: false, com2Receiving: false },
        },
        navigraph: {
          status: 'configuration-required',
          configured: false,
          authenticated: false,
          chartsEnabled: false,
          simulatorRequired: true,
          detail: 'Navigraph Developer-Zugang und Client-Zugangsdaten erforderlich',
        },
        gsx: {
          status: 'waiting',
          installed: false,
          connected: false,
          controlEnabled: false,
          installLocation: null,
          manualDetected: false,
          detail: 'GSX-Installation wird gesucht',
          services: [],
        },
        simbrief: {
          status: 'not-configured',
          imported: false,
          user: null,
          generatedAt: null,
          detail: 'Flugplan wird automatisch aus SayIntentions/MSFS erkannt',
          flight: null,
        },
        onlineNetworks: {
          selected: 'off',
          status: 'idle',
          updatedAt: null,
          airports: [],
          controllers: [],
          atis: [],
          pilots: [],
          detail: 'VATSIM / IVAO bei Bedarf aktualisieren',
        },
        littleNavmap: {
          status: 'waiting',
          reachable: false,
          simulatorConnected: false,
          updatedAt: null,
          detail: 'Little Navmap WebAPI wird gesucht',
          sim: null,
          airport: null,
        },
        aviationWeather: {
          status: 'idle',
          source: 'AviationWeather.gov',
          updatedAt: null,
          airports: [],
          detail: 'Wetter wird bei vorhandenem Flugplan automatisch geladen',
        },
        fenix: {
          status: 'not-checked',
          reachable: false,
          url: null,
          detail: 'Fenix Remote EFB wird bei Bedarf verbunden',
        },
        aircraftAdapter: {
          status: 'idle',
          active: 'generic',
          title: null,
          controlCount: 0,
          detail: 'Warte auf geladenes Flugzeug',
          fenix: { detected: false, reachable: false, url: null, inputEventCount: 0 },
          pmdg: { detected: false, activeFamily: null, broadcastEnabled: null, packages: [], controlCount: 0 },
        },
        groundSafety: {
          status: 'clear',
          highestSeverity: null,
          alerts: [],
          detail: 'Keine aktiven Ground-Safety-Warnungen',
        },
        com: {
          status: 'waiting',
          source: 'SimConnect',
          detail: 'Warte auf COM-Daten aus MSFS',
        },
        simTraffic: {
          status: 'waiting',
          source: 'SimConnect',
          radiusKm: 200,
          updatedAt: null,
          detail: 'Warte auf Simulatorverkehr',
          aircraft: [],
        },
        simConnectHealth: {
          status: 'waiting',
          detail: 'Noch keine SimConnect-Diagnose verfügbar',
          updatedAt: null,
        },
        flightOperations: emptyFlightOperations(),
      },
      session: {
        generation: 1,
        resetAt: null,
        resetReason: null,
      },
      flight: emptyFlight(),
      gate: null,
      taxi: {
        path: [],
        pathRevision: 0,
        pathSource: null,
        pathMetadata: null,
        clearance: null,
        holdShorts: [],
      },
      planning: {
        selectedAirport: null,
        active: false,
      },
      aircraft: null,
      guidance: unavailableGuidance(),
      sharing: {
        urls: [],
        pairingPin: null,
        qrDataUrl: null,
        enabled: true,
        deviceCount: 0,
      },
      thresholds: this.thresholds,
    };
    this._pathFingerprint = '';
    this._suppressedPathFingerprint = null;
    this._suppressedClearanceFingerprints = new Set();
    this._suppressedFlightIdentity = null;
  }

  setMode(mode) {
    this.state.mode = mode;
    this.#touch();
  }

  setSharing(sharing) {
    this.state.sharing = { ...this.state.sharing, ...sharing };
    this.#touch();
  }

  setConnection(name, status, detail = '') {
    const current = this.state.connections[name];
    if (current?.status === status && current?.detail === detail) return;
    this.state.connections[name] = { status, detail };
    this.#touch();
  }

  setAtcProvider(provider) {
    const normalized = String(provider ?? '').trim().toLowerCase();
    if (!ATC_PROVIDERS.has(normalized)) return false;
    if (this.state.atc.selectedProvider === normalized) return true;

    this.state.atc.selectedProvider = normalized;
    const exactProvider = EXACT_PATH_SOURCES.has(this.state.taxi.pathSource)
      ? this.state.taxi.pathSource
      : null;
    const selectedClearance = normalized === 'auto'
      ? (exactProvider ? this.state.atc.providerClearances[exactProvider] : null) ?? this.#newestProviderClearance()
      : this.state.atc.providerClearances[normalized] ?? null;

    if (normalized === 'auto') {
      this.state.atc.activeProvider = this.state.taxi.pathSource === 'sayintentions'
        ? 'sayintentions'
        : selectedClearance?.provider ?? null;
    } else {
      this.state.atc.activeProvider = normalized;
    }

    if (this.state.taxi.pathSource === 'clearance-map'
      || (EXACT_PATH_SOURCES.has(this.state.taxi.pathSource) && this.state.taxi.pathSource !== normalized && normalized !== 'auto')) {
      this.#setTaxiPath([], null, null);
      this.state.planning.active = false;
    }

    this.state.taxi.clearance = selectedClearance ? structuredClone(selectedClearance) : null;
    this.#refreshHoldShorts();
    this.#updateGuidance();
    this.#touch();
    return true;
  }

  setIntegration(name, value = {}) {
    const current = this.state.integrations[name] ?? {};
    const next = { ...current, ...structuredClone(value) };
    if (JSON.stringify(current) === JSON.stringify(next)) return;
    this.state.integrations[name] = next;
    this.#touch();
  }

  setFlightOperations(value = {}) {
    const current = this.state.integrations.flightOperations || emptyFlightOperations();
    const phaseOverride = FLIGHT_PHASE_OVERRIDES.has(String(value.phaseOverride || '').trim())
      ? String(value.phaseOverride).trim()
      : current.phaseOverride;
    const checklist = value.checklist && typeof value.checklist === 'object' && !Array.isArray(value.checklist)
      ? Object.fromEntries(Object.entries(value.checklist).slice(0, 160).map(([key, checked]) => [String(key).slice(0, 80), Boolean(checked)]))
      : current.checklist;
    const notes = value.notes === undefined ? current.notes : String(value.notes || '').slice(0, 4_000);
    if (current.phaseOverride === phaseOverride
      && current.notes === notes
      && JSON.stringify(current.checklist) === JSON.stringify(checklist)) return false;
    const next = {
      phaseOverride,
      checklist,
      notes,
      updatedAt: new Date().toISOString(),
    };
    this.state.integrations.flightOperations = next;
    this.#touch();
    return true;
  }

  resetFlight({ reason = 'manual', preserveAircraft = true, suppressCurrent = true } = {}) {
    if (suppressCurrent) this._suppressedFlightIdentity = flightIdentity(this.state.flight);
    if (suppressCurrent && this._pathFingerprint) this._suppressedPathFingerprint = this._pathFingerprint;
    if (suppressCurrent) {
      for (const clearance of Object.values(this.state.atc.providerClearances)) {
        if (clearance?.provider && clearance?.text) {
          this._suppressedClearanceFingerprints.add(`${clearance.provider}|${clearance.text}`);
        }
      }
    } else {
      this._suppressedPathFingerprint = null;
      this._suppressedClearanceFingerprints.clear();
      this._suppressedFlightIdentity = null;
    }

    const aircraft = preserveAircraft ? this.state.aircraft : null;
    this.#setTaxiPath([], null, null);
    this.state.flight = emptyFlight();
    this.state.gate = null;
    this.state.aircraft = aircraft;
    this.state.taxi.clearance = null;
    this.state.taxi.holdShorts = [];
    this.state.planning = { selectedAirport: null, active: false };
    this.state.atc.activeProvider = null;
    this.state.atc.providerClearances = {};
    this.state.guidance = unavailableGuidance('new-flight');
    this.state.integrations.sayIntentions = {
      ...this.state.integrations.sayIntentions,
      comms: [],
      weather: { airports: [], comms: [], updatedAt: null },
      frequencies: null,
      flightPhase: null,
      taxiPathVisible: null,
      radioPositions: { com1: null, com2: null },
      intercomPositions: [null, null, null],
      audioState: { radioPtt: false, intercomPtt: false, com1Receiving: false, com2Receiving: false },
    };
    this.state.integrations.simbrief = {
      status: 'not-configured',
      imported: false,
      user: null,
      generatedAt: null,
      detail: 'Flugplan wird automatisch aus SayIntentions/MSFS erkannt',
      flight: null,
    };
    this.state.integrations.onlineNetworks = {
      ...this.state.integrations.onlineNetworks,
      status: 'idle',
      updatedAt: null,
      airports: [],
      controllers: [],
      atis: [],
      pilots: [],
      detail: 'VATSIM / IVAO bei Bedarf aktualisieren',
    };
    this.state.integrations.flightOperations = emptyFlightOperations();
    this.state.session = {
      generation: (this.state.session?.generation ?? 0) + 1,
      resetAt: new Date().toISOString(),
      resetReason: reason,
    };
    this.offRouteSince = null;
    this.#touch();
    return true;
  }

  applySayIntentionsWeather(value = {}) {
    const airports = Array.isArray(value.airports) ? value.airports.slice(0, 8).map((airport) => ({
      airport: textOrEmpty(airport.airport).toUpperCase(),
      atis: textOrEmpty(airport.atis),
      atisCpdlc: textOrEmpty(airport.atis_cpdlc, airport.atisCpdlc),
      metar: textOrEmpty(airport.metar),
      taf: textOrEmpty(airport.taf),
      activeRunway: textOrEmpty(airport.active_runway, airport.activeRunway).toUpperCase() || null,
      windDirection: numberOrNull(firstDefined(airport.wind_direction, airport.windDirection)),
      windSpeed: numberOrNull(firstDefined(airport.wind_speed, airport.windSpeed)),
    })).filter((airport) => airport.airport) : [];
    const comms = Array.isArray(value.comms) ? value.comms.slice(0, 40).map((entry) => ({
      type: textOrEmpty(entry.type).toUpperCase(),
      frequency: textOrEmpty(entry.freq, entry.frequency),
      callsign: textOrEmpty(entry.callsign),
      airport: textOrEmpty(entry.airport).toUpperCase(),
    })).filter((entry) => entry.frequency) : [];
    this.state.integrations.sayIntentions.weather = {
      airports,
      comms,
      updatedAt: new Date().toISOString(),
    };
    this.#touch();
  }

  applySayIntentionsFrequencies(value) {
    if (!value || typeof value !== 'object') return;
    const sanitize = (candidate) => {
      if (candidate === null || candidate === undefined) return null;
      if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
      if (typeof candidate !== 'object') return null;
      return Object.fromEntries(Object.entries(candidate).slice(0, 20).map(([key, entry]) => [
        String(key).slice(0, 60),
        typeof entry === 'object' ? JSON.stringify(entry).slice(0, 180) : String(entry).slice(0, 180),
      ]));
    };
    this.state.integrations.sayIntentions.frequencies = sanitize(value);
    this.#touch();
  }

  setSayIntentionsRadioState(value = {}) {
    this.state.integrations.sayIntentions = {
      ...this.state.integrations.sayIntentions,
      flightPhase: numberOrNull(value.flightPhase),
      taxiPathVisible: value.taxiPathVisible === undefined ? this.state.integrations.sayIntentions.taxiPathVisible : Boolean(value.taxiPathVisible),
      radioPositions: {
        com1: numberOrNull(value.com1Position),
        com2: numberOrNull(value.com2Position),
      },
      intercomPositions: Array.isArray(value.intercomPositions)
        ? value.intercomPositions.slice(0, 3).map(numberOrNull)
        : this.state.integrations.sayIntentions.intercomPositions,
      audioState: {
        radioPtt: Boolean(value.radioPtt),
        intercomPtt: Boolean(value.intercomPtt),
        com1Receiving: Boolean(value.com1Receiving),
        com2Receiving: Boolean(value.com2Receiving),
      },
      lvarsUpdatedAt: new Date().toISOString(),
    };
    if (numberOrNull(value.flightPhase) !== null) this.state.flight.flightPhase = numberOrNull(value.flightPhase);
    if (value.clearedForTakeoff !== undefined) this.state.flight.clearedForTakeoff = Boolean(value.clearedForTakeoff);
    if (value.clearedForLanding !== undefined) this.state.flight.clearedForLanding = Boolean(value.clearedForLanding);
    this.#touch();
  }

  applySimBrief(summary = {}) {
    const flight = summary.flight && typeof summary.flight === 'object' ? structuredClone(summary.flight) : null;
    this.state.integrations.simbrief = {
      status: flight ? 'imported' : 'error',
      imported: Boolean(flight),
      user: summary.user ? String(summary.user).slice(0, 100) : null,
      generatedAt: summary.generatedAt || null,
      detail: flight ? `${flight.origin || '—'} → ${flight.destination || '—'} automatisch ergänzt` : 'Kein gültiger OFP gefunden',
      flight,
    };
    if (flight) {
      this.state.flight = {
        ...this.state.flight,
        callsign: this.state.flight.callsign || flight.callsign || null,
        origin: this.state.flight.origin || flight.origin || null,
        destination: this.state.flight.destination || flight.destination || null,
        originPosition: this.state.flight.originPosition || flight.originPosition || null,
        destinationPosition: this.state.flight.destinationPosition || flight.destinationPosition || null,
        departureRunway: this.state.flight.departureRunway || flight.departureRunway || null,
        arrivalRunway: this.state.flight.arrivalRunway || flight.arrivalRunway || null,
        sid: this.state.flight.sid || flight.sid || null,
        star: this.state.flight.star || flight.star || null,
        flightPlanRoute: this.state.flight.flightPlanRoute || flight.route || null,
      };
    }
    this.#touch();
  }

  setPlanningAirport(airport) {
    if (!airport) {
      this.state.planning.selectedAirport = null;
      this.#touch();
      return;
    }
    const lat = numberOrNull(airport.lat);
    const lon = numberOrNull(airport.lon);
    const icao = textOrEmpty(airport.icao).toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(icao) || lat === null || lon === null) return;
    this.state.planning.selectedAirport = {
      icao,
      name: textOrEmpty(airport.name) || icao,
      lat,
      lon,
      municipality: textOrEmpty(airport.municipality) || null,
      country: textOrEmpty(airport.country) || null,
    };
    this.#touch();
  }

  setPlannedTaxiPath(value, metadata = {}) {
    if (EXACT_PATH_SOURCES.has(this.state.taxi.pathSource) && this.state.taxi.path.length > 1) return false;
    const path = normalizeTaxiPath(value);
    if (path.length < 2) return false;
    this.#setTaxiPath(path, metadata.source || 'manual', metadata);
    this.state.planning.active = true;
    this.#refreshHoldShorts();
    this.#updateGuidance();
    this.#touch();
    return true;
  }

  setDerivedTaxiPath(value, metadata = {}) {
    if (EXACT_PATH_SOURCES.has(this.state.taxi.pathSource) && this.state.taxi.path.length > 1) return false;
    const path = normalizeTaxiPath(value);
    if (path.length < 2) return false;
    this.#setTaxiPath(path, 'clearance-map', {
      provider: this.state.atc.activeProvider,
      ...metadata,
    });
    this.#refreshHoldShorts();
    this.#updateGuidance();
    this.#touch();
    return true;
  }

  clearPlannedTaxiPath() {
    if (!['manual', 'clearance-map'].includes(this.state.taxi.pathSource)) return false;
    this.#setTaxiPath([], null, null);
    this.state.planning.active = false;
    this.#refreshHoldShorts();
    this.#updateGuidance();
    this.#touch();
    return true;
  }

  applyFlightJson(raw) {
    const details = raw?.flight_details ?? raw?.flightDetails ?? null;
    if (!details || typeof details !== 'object') {
      this.setConnection('sayIntentions', 'waiting', 'SayIntentions läuft, aber kein Flug ist aktiv');
      return;
    }

    const current = details.current_flight ?? details.currentFlight ?? {};
    const nextFlightId = firstDefined(details.flight_id, details.flightId, null);
    const nextCallsign = textOrEmpty(details.callsign_icao, details.callsign) || null;
    const nextOrigin = textOrEmpty(
      current.flight_origin,
      current.flight_plan_origin,
      current.origin,
      details.flight_origin,
    ).toUpperCase() || null;
    const routeText = textOrEmpty(current.flight_plan_route, current.route, details.flight_plan_route);
    const nextDestination = textOrEmpty(
      current.flight_destination,
      current.flight_plan_destination,
      current.flight_plan_destination_icao,
      current.destination,
      current.destination_icao,
      details.flight_destination,
      details.destination,
    ).toUpperCase() || airportFromRouteEnd(routeText) || null;
    const prior = this.state.flight;
    const nextIdentity = flightIdentity({
      flightId: nextFlightId,
      callsign: nextCallsign,
      origin: nextOrigin,
      destination: nextDestination,
    });
    if (this._suppressedFlightIdentity && nextIdentity === this._suppressedFlightIdentity) {
      this.setConnection('sayIntentions', 'connected', 'Neuer Flug gestartet · warte auf eine neue SI-Flugsitzung');
      return;
    }
    if (this._suppressedFlightIdentity && nextIdentity && nextIdentity !== this._suppressedFlightIdentity) {
      this._suppressedFlightIdentity = null;
      this._suppressedPathFingerprint = null;
      this._suppressedClearanceFingerprints.clear();
    }
    const flightChanged = (
      prior.flightId !== null && nextFlightId !== null && String(prior.flightId) !== String(nextFlightId)
    ) || (
      prior.callsign && nextCallsign && prior.callsign !== nextCallsign
    ) || (
      prior.origin && nextOrigin && prior.origin !== nextOrigin
    ) || (
      prior.destination && nextDestination && prior.destination !== nextDestination
    );
    if (flightChanged) {
      this.resetFlight({ reason: 'source-flight-change', preserveAircraft: true, suppressCurrent: false });
    }

    const path = normalizeTaxiPath(firstDefined(
      current.taxi_path,
      current.taxiPath,
      details.taxi_path,
      details.taxiPath,
      [],
    ));
    const nextPathFingerprint = pathFingerprint(path);
    const pathSuppressed = path.length > 1 && nextPathFingerprint === this._suppressedPathFingerprint;
    if (path.length === 0) this._suppressedPathFingerprint = null;
    else if (!pathSuppressed) this._suppressedPathFingerprint = null;

    const siPathSelected = this.state.atc.selectedProvider === 'auto'
      || this.state.atc.selectedProvider === 'sayintentions';
    if (path.length > 1 && siPathSelected && !pathSuppressed) {
      this.#setTaxiPath(path, 'sayintentions', { exact: true });
      this.state.atc.activeProvider = 'sayintentions';
      this.state.planning.active = false;
    } else if (this.state.taxi.pathSource === 'sayintentions') {
      this.#setTaxiPath([], null, null);
    }

    this.state.flight = {
      flightId: nextFlightId,
      callsign: nextCallsign,
      origin: nextOrigin,
      destination: nextDestination,
      currentAirport: firstDefined(details.current_airport, current.current_airport, null),
      originPosition: pointOrNull(
        firstDefined(current.flight_plan_origin_lat, current.origin_lat),
        firstDefined(current.flight_plan_origin_lon, current.origin_lon),
      ),
      destinationPosition: pointOrNull(
        firstDefined(current.flight_destination_lat, current.destination_lat),
        firstDefined(current.flight_destination_lon, current.destination_lon),
      ),
      departureRunway: firstDefined(current.flight_plan_departing_runway, details.runway, null),
      arrivalRunway: firstDefined(current.flight_plan_arriving_runway, null),
      availableArrivalRunways: textOrEmpty(current.destination_arriving_runways)
        .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean),
      flightPlanRoute: routeText || null,
      sid: textOrEmpty(current.flight_plan_sid) || null,
      star: textOrEmpty(current.flight_plan_star) || null,
      flightPhase: numberOrNull(firstDefined(details.flight_phase, current.flight_phase)),
      distanceToRunwayNm: numberOrNull(firstDefined(details.distance_to_runway, current.distance_to_runway)),
      takeoffRunway: runwayOrNull(firstDefined(details.cleared_for_takeoff, current.cleared_for_takeoff)),
      landingRunway: runwayOrNull(firstDefined(details.cleared_for_landing, current.cleared_for_landing)),
      clearedForTakeoff: boolish(firstDefined(details.cleared_for_takeoff, current.cleared_for_takeoff, false)),
      clearedForLanding: boolish(firstDefined(details.cleared_for_landing, current.cleared_for_landing, false)),
    };

    this.state.integrations.sayIntentions = {
      ...this.state.integrations.sayIntentions,
      status: pathSuppressed ? 'reset-waiting' : 'connected',
      flightPhase: this.state.flight.flightPhase ?? this.state.integrations.sayIntentions.flightPhase,
      traffic: {
        enabled: boolish(details.traffic_enabled),
        density: textOrEmpty(details.traffic_density) || null,
        radiusNm: numberOrNull(details.traffic_radius),
        maxAircraft: numberOrNull(details.max_aircraft),
      },
    };

    const gateLat = numberOrNull(firstDefined(current.assigned_gate_lat, current.gate_lat));
    const gateLon = numberOrNull(firstDefined(current.assigned_gate_lon, current.gate_lon));
    const gateName = firstDefined(current.assigned_gate, current.gate, null);
    this.state.gate = gateLat !== null && gateLon !== null
      ? { name: gateName, lat: gateLat, lon: gateLon }
      : gateName
        ? { name: gateName, lat: null, lon: null }
        : null;

    this.setConnection('sayIntentions', 'connected', pathSuppressed
      ? 'Neuer Flug gestartet · warte auf einen neuen Taxiweg'
      : path.length > 1
        ? `Taxiweg mit ${path.length} Punkten empfangen`
      : 'Flug verbunden – warte auf Taxifreigabe');
    this.#refreshHoldShorts();
    this.#updateGuidance();
    this.#touch();
  }

  applyParking(parking) {
    const value = parking?.parking ?? parking;
    const lat = numberOrNull(value?.lat);
    const lon = numberOrNull(value?.lon);
    const heading = numberOrNull(value?.heading);
    const name = textOrEmpty(value?.name, value?.id, this.state.gate?.name) || null;
    if (lat === null && lon === null && !name) return;
    this.state.gate = {
      name: name || 'Gate',
      lat: lat ?? this.state.gate?.lat ?? null,
      lon: lon ?? this.state.gate?.lon ?? null,
      heading: heading ?? this.state.gate?.heading ?? null,
    };
    this.#touch();
  }

  applyComms(comms) {
    const timeline = Array.isArray(comms) ? comms.slice(-2_000).map((entry) => ({
      id: numberOrNull(entry.id),
      station: textOrEmpty(entry.station_name, entry.station, entry.ident),
      ident: textOrEmpty(entry.ident).toUpperCase(),
      frequency: textOrEmpty(entry.frequency),
      channel: textOrEmpty(entry.channel).toUpperCase(),
      time: firstDefined(entry.stamp_zulu, null),
      pilot: textOrEmpty(entry.incoming_message_english, entry.incoming_message),
      atc: textOrEmpty(entry.outgoing_message_english, entry.outgoing_message),
      language: textOrEmpty(entry.language),
      copilot: boolish(entry.copilot),
      acars: boolish(entry.is_acars),
    })).filter((entry) => entry.pilot || entry.atc) : [];
    this.state.integrations.sayIntentions.comms = timeline;
    const clearance = findCurrentClearance(comms);
    if (!clearance) {
      this.#touch();
      return;
    }
    this.applyExternalClearance({ provider: 'sayintentions', ...clearance });
  }

  applyExternalClearance({ provider, text, station = '', time = null, id = null } = {}) {
    const normalizedProvider = String(provider ?? '').trim().toLowerCase();
    const normalizedText = textOrEmpty(text);
    if (!ATC_PROVIDERS.has(normalizedProvider) || normalizedProvider === 'auto' || !normalizedText) return false;
    const clearanceFingerprint = `${normalizedProvider}|${normalizedText}`;
    if (this._suppressedClearanceFingerprints.has(clearanceFingerprint)) return false;
    for (const fingerprint of [...this._suppressedClearanceFingerprints]) {
      if (fingerprint.startsWith(`${normalizedProvider}|`)) this._suppressedClearanceFingerprints.delete(fingerprint);
    }

    const receivedAt = new Date().toISOString();
    const clearance = {
      id: firstDefined(id, null),
      text: normalizedText,
      station: textOrEmpty(station),
      time: firstDefined(time, receivedAt),
      provider: normalizedProvider,
      receivedAt,
    };
    const previousForProvider = this.state.atc.providerClearances[normalizedProvider];
    if (clearance.id !== null && clearance.id === previousForProvider?.id) return false;
    if (clearance.id === null && clearance.text === previousForProvider?.text) return false;
    this.state.atc.providerClearances[normalizedProvider] = clearance;

    const providerSelected = this.state.atc.selectedProvider === normalizedProvider;
    const autoSelected = this.state.atc.selectedProvider === 'auto';
    const exactSiActive = this.state.taxi.pathSource === 'sayintentions' && this.state.taxi.path.length > 1;
    if (!providerSelected && (!autoSelected || (exactSiActive && normalizedProvider !== 'sayintentions'))) {
      this.#touch();
      return true;
    }

    const previous = this.state.taxi.clearance;
    const changed = previous?.provider !== normalizedProvider || previous?.text !== clearance.text;
    if (changed && this.state.taxi.pathSource === 'clearance-map') this.#setTaxiPath([], null, null);
    this.state.taxi.clearance = clearance;
    this.state.atc.activeProvider = normalizedProvider;
    this.#refreshHoldShorts();
    this.#touch();
    return true;
  }

  setAircraft(position) {
    const lat = numberOrNull(position?.lat);
    const lon = numberOrNull(position?.lon);
    if (lat === null || lon === null) return;
    this.state.aircraft = {
      lat,
      lon,
      heading: numberOrNull(position.heading) ?? 0,
      groundSpeed: numberOrNull(position.groundSpeed) ?? 0,
      onGround: position.onGround === undefined ? true : Boolean(position.onGround),
      altitudeFeet: numberOrNull(position.altitudeFeet),
      aglFeet: numberOrNull(position.aglFeet),
      indicatedAirspeed: numberOrNull(position.indicatedAirspeed),
      verticalSpeedFpm: numberOrNull(position.verticalSpeedFpm),
      ambientTemperatureC: numberOrNull(position.ambientTemperatureC),
      ambientWindDirection: numberOrNull(position.ambientWindDirection),
      ambientWindSpeedKnots: numberOrNull(position.ambientWindSpeedKnots),
      visibilityMeters: numberOrNull(position.visibilityMeters),
      seaLevelPressureHpa: numberOrNull(position.seaLevelPressureHpa),
      gearDown: position.gearDown === undefined ? null : Boolean(position.gearDown),
      flapsHandleIndex: numberOrNull(position.flapsHandleIndex),
      spoilersArmed: position.spoilersArmed === undefined ? null : Boolean(position.spoilersArmed),
      autopilotMaster: position.autopilotMaster === undefined ? null : Boolean(position.autopilotMaster),
      parkingBrake: position.parkingBrake === undefined ? null : Boolean(position.parkingBrake),
      enginesRunning: position.enginesRunning === undefined ? null : Boolean(position.enginesRunning),
      fuelWeightPounds: numberOrNull(position.fuelWeightPounds),
      grossWeightPounds: numberOrNull(position.grossWeightPounds),
      com1Active: numberOrNull(position.com1Active),
      com1Standby: numberOrNull(position.com1Standby),
      com2Active: numberOrNull(position.com2Active),
      com2Standby: numberOrNull(position.com2Standby),
      transponderCode: numberOrNull(position.transponderCode),
      aircraftTitle: textOrEmpty(position.aircraftTitle) || this.state.aircraft?.aircraftTitle || null,
      registration: textOrEmpty(position.registration) || this.state.aircraft?.registration || null,
      updatedAt: position.updatedAt ?? new Date().toISOString(),
    };
    this.#updateGuidance();
    this.#touch();
  }

  publicState() {
    return structuredClone(this.state);
  }

  #newestProviderClearance() {
    return Object.values(this.state.atc.providerClearances)
      .sort((left, right) => String(left.receivedAt).localeCompare(String(right.receivedAt)))
      .at(-1) ?? null;
  }

  #setTaxiPath(path, source, metadata) {
    const fingerprint = pathFingerprint(path);
    const metadataFingerprint = JSON.stringify([source, metadata ?? null]);
    const previousMetadataFingerprint = JSON.stringify([
      this.state.taxi.pathSource,
      this.state.taxi.pathMetadata,
    ]);
    if (fingerprint === this._pathFingerprint && metadataFingerprint === previousMetadataFingerprint) return;
    this._pathFingerprint = fingerprint;
    this.state.taxi.path = path;
    this.state.taxi.pathSource = source;
    this.state.taxi.pathMetadata = metadata ? structuredClone(metadata) : null;
    this.state.taxi.pathRevision += 1;
    this.offRouteSince = null;
    this.guidanceSegmentIndex = null;
  }

  #refreshHoldShorts() {
    const path = this.state.taxi.path;
    const clearanceText = this.state.taxi.clearance?.text;
    const runway = extractRunwayFromClearance(clearanceText)
      ?? this.state.taxi.pathMetadata?.runway
      ?? this.state.flight.departureRunway
      ?? this.state.flight.arrivalRunway;
    const explicit = path
      .filter((point) => point.holdShort)
      .map((point) => ({
        lat: point.lat,
        lon: point.lon,
        index: point.index,
        label: runway ? `HOLD SHORT RWY ${runway}` : 'HOLD SHORT',
        taxiway: point.label || null,
      }));

    const plannedHoldingPoint = this.state.taxi.pathSource === 'manual'
      && this.state.taxi.pathMetadata?.mode === 'departure'
      && runway;
    if (explicit.length === 0 && path.length > 1 && (isHoldShortClearance(clearanceText) || plannedHoldingPoint)) {
      const finalPoint = path.at(-1);
      explicit.push({
        lat: finalPoint.lat,
        lon: finalPoint.lon,
        index: path.length - 1,
        label: runway ? `HOLD SHORT RWY ${runway}` : 'HOLD SHORT',
        inferred: true,
      });
    }

    this.state.taxi.holdShorts = explicit;
  }

  #updateGuidance() {
    const { aircraft } = this.state;
    const path = this.state.taxi.path;
    if (!aircraft || !aircraft.onGround || path.length < 2) {
      this.state.guidance = {
        available: false,
        deviationMeters: null,
        remainingMeters: null,
        closestSegment: null,
        status: 'unavailable',
        warning: false,
      };
      this.offRouteSince = null;
      return;
    }
    const previousSegment = Number.isInteger(this.guidanceSegmentIndex) ? this.guidanceSegmentIndex : null;
    const closest = previousSegment === null
      ? closestPointOnPath(aircraft, path)
      : closestPointOnPath(aircraft, path, {
        minSegment: Math.max(0, previousSegment - 2),
        maxSegment: Math.min(path.length - 2, previousSegment + 14),
      });
    if (!closest) return;
    const deviation = closest.distanceMeters;
    if (deviation < 180) this.guidanceSegmentIndex = closest.segmentIndex;
    if (deviation > MAX_GUIDANCE_ROUTE_DISTANCE_METERS) {
      this.state.guidance = unavailableGuidance('route-position-mismatch');
      this.offRouteSince = null;
      return;
    }
    let status = 'on-route';
    if (deviation > this.thresholds.offRouteMeters) status = 'off-route';
    else if (deviation > this.thresholds.attentionMeters) status = 'attention';

    if (status === 'off-route') {
      this.offRouteSince ??= Date.now();
    } else {
      this.offRouteSince = null;
    }

    const warning = status === 'off-route'
      && Date.now() - this.offRouteSince >= this.thresholds.warningDelayMs;

    this.state.guidance = {
      available: true,
      deviationMeters: Math.round(deviation),
      remainingMeters: Math.round(closest.remainingMeters),
      closestSegment: closest.segmentIndex,
      segmentProgress: closest.segmentProgress,
      status,
      warning,
    };
  }

  #touch() {
    this.state.updatedAt = new Date().toISOString();
    this.emit('change', this.publicState());
  }
}
