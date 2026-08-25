function text(value, max = 120) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
}

function upper(value, max = 40) {
  return text(value, max)?.toUpperCase() || null;
}

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function airportIdent(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.toUpperCase().match(/\b[A-Z][A-Z0-9]{3}\b/);
    return match?.[0] || upper(value, 8);
  }
  return upper(
    value.icao
      ?? value.icaoIdent
      ?? value.ident
      ?? value.icao_code
      ?? value.airportIdent
      ?? value.name,
    8,
  );
}

function runwayIdent(value) {
  if (!value) return null;
  const raw = typeof value === 'string'
    ? value
    : value.designation ?? value.ident ?? value.runway ?? value.name ?? value.number;
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toUpperCase().replace(/^RWY\s*/, '').replace(/^RUNWAY\s*/, '');
  const match = normalized.match(/(?:^|\s)([0-3]?\d(?:[LCR])?)(?:\s|$)/);
  return match?.[1] || normalized.slice(0, 8) || null;
}

function procedureIdent(value) {
  if (!value) return null;
  return upper(typeof value === 'string' ? value : value.ident ?? value.name ?? value.procedureIdent, 40);
}

function waypointIdent(value, index) {
  if (!value) return null;
  if (typeof value === 'string') return upper(value, 24);
  return upper(value.ident ?? value.icaoIdent ?? value.name ?? value.fixIdent ?? value.fix ?? `WP${index + 1}`, 24);
}

function position(value) {
  if (!value || typeof value !== 'object') return null;
  const source = value.position ?? value.location ?? value;
  const lat = finite(source.lat ?? source.latitude ?? source.latDeg);
  const lon = finite(source.lon ?? source.lng ?? source.longitude ?? source.long ?? source.lonDeg);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function normalizeEnroute(values) {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 2_000).map((entry, index) => {
    const ident = waypointIdent(entry, index);
    if (!ident) return null;
    return {
      ident,
      airway: upper(entry?.airway ?? entry?.viaAirway ?? entry?.via, 24),
      position: position(entry),
    };
  }).filter(Boolean);
}

export function normalizeMsfsEfbRoute(route = {}) {
  if (!route || typeof route !== 'object' || Array.isArray(route)) return null;
  const departureAirport = airportIdent(route.departureAirport ?? route.origin ?? route.departure);
  const destinationAirport = airportIdent(route.destinationAirport ?? route.destination ?? route.arrivalAirport);
  const enroute = normalizeEnroute(route.enroute ?? route.waypoints ?? route.route ?? []);
  if (!departureAirport && !destinationAirport && enroute.length === 0) return null;
  return {
    source: 'msfs-efb',
    departureAirport,
    destinationAirport,
    departureRunway: runwayIdent(route.departureRunway),
    destinationRunway: runwayIdent(route.destinationRunway ?? route.arrivalRunway),
    departure: procedureIdent(route.departure),
    departureTransition: procedureIdent(route.departureTransition),
    arrival: procedureIdent(route.arrival),
    arrivalTransition: procedureIdent(route.arrivalTransition),
    approach: procedureIdent(route.approach),
    approachTransition: procedureIdent(route.approachTransition),
    cruiseAltitude: finite(route.cruiseAltitude),
    isVfr: route.isVfr === true,
    enroute,
  };
}

export function buildFlightDeckRoute(state = {}) {
  const brief = state.integrations?.simbrief?.flight || {};
  const flight = state.flight || {};
  const departureAirport = upper(brief.origin ?? flight.origin, 8);
  const destinationAirport = upper(brief.destination ?? flight.destination, 8);
  const enroute = normalizeEnroute(brief.waypoints || []);
  if (!departureAirport && !destinationAirport && enroute.length === 0) return null;
  return {
    source: brief.origin || brief.destination ? 'simbrief' : 'flight-deck',
    departureAirport,
    destinationAirport,
    departureRunway: runwayIdent(brief.departureRunway ?? flight.departureRunway),
    destinationRunway: runwayIdent(brief.arrivalRunway ?? flight.arrivalRunway),
    departure: procedureIdent(brief.sid ?? flight.sid),
    departureTransition: null,
    arrival: procedureIdent(brief.star ?? flight.star),
    arrivalTransition: null,
    approach: null,
    approachTransition: null,
    cruiseAltitude: finite(brief.cruiseAltitudeFeet),
    isVfr: String(brief.flightRules || '').toUpperCase() === 'VFR',
    enroute,
  };
}

function routeFingerprint(route) {
  if (!route) return null;
  return [
    route.departureAirport,
    route.destinationAirport,
    route.departureRunway,
    route.destinationRunway,
    route.departure,
    route.arrival,
    route.approach,
    route.cruiseAltitude,
    ...(route.enroute || []).map((entry) => entry.ident),
  ].map((value) => String(value ?? '')).join('|');
}

function normalizedIdentSet(route) {
  return new Set((route?.enroute || []).map((entry) => upper(entry.ident, 24)).filter(Boolean));
}

function compareField(label, left, right, mismatches) {
  const a = upper(left, 40);
  const b = upper(right, 40);
  if (!a || !b) return { compared: 0, matched: 0 };
  if (a === b) return { compared: 1, matched: 1 };
  mismatches.push({ field: label, flightDeck: a, msfsEfb: b });
  return { compared: 1, matched: 0 };
}

export function compareRoutes(flightDeckRoute, msfsEfbRoute) {
  if (!flightDeckRoute || !msfsEfbRoute) {
    return {
      status: 'waiting',
      matchPercent: null,
      mismatches: [],
      waypointOverlapPercent: null,
      detail: !flightDeckRoute ? 'Flight Deck route is not available yet.' : 'MSFS EFB route has not been received yet.',
    };
  }
  const mismatches = [];
  let compared = 0;
  let matched = 0;
  for (const [label, left, right] of [
    ['origin', flightDeckRoute.departureAirport, msfsEfbRoute.departureAirport],
    ['destination', flightDeckRoute.destinationAirport, msfsEfbRoute.destinationAirport],
    ['departure runway', flightDeckRoute.departureRunway, msfsEfbRoute.departureRunway],
    ['arrival runway', flightDeckRoute.destinationRunway, msfsEfbRoute.destinationRunway],
    ['SID', flightDeckRoute.departure, msfsEfbRoute.departure],
    ['STAR', flightDeckRoute.arrival, msfsEfbRoute.arrival],
  ]) {
    const result = compareField(label, left, right, mismatches);
    compared += result.compared;
    matched += result.matched;
  }

  const flightDeckWaypoints = normalizedIdentSet(flightDeckRoute);
  const msfsWaypoints = normalizedIdentSet(msfsEfbRoute);
  let waypointOverlapPercent = null;
  if (flightDeckWaypoints.size && msfsWaypoints.size) {
    const overlap = [...flightDeckWaypoints].filter((ident) => msfsWaypoints.has(ident)).length;
    waypointOverlapPercent = Math.round(overlap / Math.max(flightDeckWaypoints.size, msfsWaypoints.size) * 100);
    compared += 2;
    matched += waypointOverlapPercent >= 75 ? 2 : waypointOverlapPercent >= 40 ? 1 : 0;
    if (waypointOverlapPercent < 75) {
      mismatches.push({ field: 'enroute', flightDeck: `${flightDeckWaypoints.size} WPT`, msfsEfb: `${msfsWaypoints.size} WPT` });
    }
  }
  const matchPercent = compared ? Math.round(matched / compared * 100) : null;
  const status = matchPercent === null ? 'limited' : matchPercent >= 85 ? 'matched' : matchPercent >= 55 ? 'partial' : 'different';
  return {
    status,
    matchPercent,
    mismatches: mismatches.slice(0, 12),
    waypointOverlapPercent,
    detail: status === 'matched'
      ? 'MSFS EFB and Flight Deck routes are aligned.'
      : status === 'partial'
        ? 'Routes are broadly aligned but contain differences.'
        : status === 'different'
          ? 'MSFS EFB and Flight Deck routes differ materially.'
          : 'Not enough route data is available for a full comparison.',
  };
}

export class RouteSyncService {
  constructor(engine) {
    this.engine = engine;
    this.started = false;
    this.msfsEfbRoute = null;
    this.msfsEfbReceivedAt = null;
    this.lastNativeSeenAt = null;
    this.avionicsSync = { lastAt: null, routeFingerprint: null };
    this.sessionGeneration = null;
    this.lastPublishedFingerprint = '';
    this.publishing = false;
    this.listener = (state) => this.#publish(state);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.engine.on('change', this.listener);
    this.#publish(this.engine.publicState());
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.engine.off('change', this.listener);
  }

  touchNative() {
    this.lastNativeSeenAt = new Date().toISOString();
    this.#publish(this.engine.publicState());
    return this.publicStatus();
  }

  ingestMsfsRoute(route) {
    const normalized = normalizeMsfsEfbRoute(route);
    if (!normalized) throw new Error('MSFS EFB route did not contain usable route data.');
    this.msfsEfbRoute = normalized;
    this.msfsEfbReceivedAt = new Date().toISOString();
    this.lastNativeSeenAt = this.msfsEfbReceivedAt;
    this.#publish(this.engine.publicState());
    return this.publicStatus();
  }

  markAvionicsSync(route = null) {
    const normalized = normalizeMsfsEfbRoute(route) || this.msfsEfbRoute;
    const timestamp = new Date().toISOString();
    this.lastNativeSeenAt = timestamp;
    if (normalized) {
      this.msfsEfbRoute = normalized;
      this.msfsEfbReceivedAt = timestamp;
    }
    this.avionicsSync = { lastAt: timestamp, routeFingerprint: routeFingerprint(normalized) };
    this.#publish(this.engine.publicState());
    return this.publicStatus();
  }

  currentFlightDeckRoute() {
    return buildFlightDeckRoute(this.engine.publicState());
  }

  publicStatus() {
    return this.engine.publicState().integrations?.routeSync || {};
  }

  #publish(state) {
    if (this.publishing) return;
    const generation = Number(state.session?.generation || 1);
    if (this.sessionGeneration !== null && generation !== this.sessionGeneration) {
      this.msfsEfbRoute = null;
      this.msfsEfbReceivedAt = null;
      this.avionicsSync = { lastAt: null, routeFingerprint: null };
      this.lastPublishedFingerprint = '';
    }
    this.sessionGeneration = generation;
    const flightDeckRoute = buildFlightDeckRoute(state);
    const comparison = compareRoutes(flightDeckRoute, this.msfsEfbRoute);
    const nativeFresh = this.lastNativeSeenAt && Date.now() - Date.parse(this.lastNativeSeenAt) < 60_000;
    const status = nativeFresh
      ? comparison.status === 'different' ? 'attention' : comparison.status === 'matched' ? 'ready' : 'connected'
      : flightDeckRoute ? 'waiting-native' : 'waiting-route';
    const detail = nativeFresh
      ? comparison.detail
      : flightDeckRoute
        ? 'Flight Deck route ready · open the native MSFS 2024 EFB app to compare it.'
        : 'Waiting for a Flight Deck/SimBrief route.';
    const value = {
      status,
      detail,
      nativeEfb: {
        connected: Boolean(nativeFresh),
        lastSeenAt: this.lastNativeSeenAt,
        routeReceivedAt: this.msfsEfbReceivedAt,
        readMethod: 'GET_EFB_ROUTE',
      },
      flightDeckRoute,
      msfsEfbRoute: this.msfsEfbRoute,
      comparison,
      avionicsSync: { ...this.avionicsSync },
      capabilities: {
        readEfbRoute: true,
        observeAvionicsSync: true,
        writeEfbRoute: false,
        writeAvionicsRoute: false,
      },
      updatedAt: new Date().toISOString(),
    };
    const fingerprint = JSON.stringify({
      status: value.status,
      detail: value.detail,
      nativeEfb: value.nativeEfb,
      flightDeck: routeFingerprint(value.flightDeckRoute),
      msfs: routeFingerprint(value.msfsEfbRoute),
      comparison: value.comparison,
      avionicsSync: value.avionicsSync,
    });
    if (fingerprint === this.lastPublishedFingerprint) return;
    this.lastPublishedFingerprint = fingerprint;
    this.publishing = true;
    try {
      this.engine.setIntegration('routeSync', value);
    } finally {
      this.publishing = false;
    }
  }
}
