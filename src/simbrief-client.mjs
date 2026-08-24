const SIMBRIEF_ENDPOINT = 'https://www.simbrief.com/api/xml.fetcher.php';

function text(value, maxLength = 300) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized || ['undefined', 'null'].includes(normalized.toLowerCase())) return null;
  return normalized.slice(0, maxLength);
}

function number(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function seconds(value) {
  const parsed = number(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

function safeLink(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /(^|\.)simbrief\.com$/i.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function position(source) {
  const lat = number(source?.pos_lat ?? source?.latitude ?? source?.lat);
  const lon = number(source?.pos_long ?? source?.longitude ?? source?.lon ?? source?.lng);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function navlogWaypoints(navlog) {
  const raw = navlog?.fix ?? navlog?.fixes ?? navlog?.waypoints ?? [];
  const fixes = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
  return fixes.slice(0, 2_000).map((fix, index) => {
    const coordinates = position(fix);
    if (!coordinates) return null;
    return {
      ident: text(fix.ident || fix.name, 20)?.toUpperCase() || `WP${index + 1}`,
      name: text(fix.name, 80),
      type: text(fix.type, 24)?.toUpperCase() || null,
      airway: text(fix.via_airway || fix.airway, 24)?.toUpperCase() || null,
      ...coordinates,
      altitudeFeet: number(fix.altitude_feet ?? fix.altitude),
      plannedSpeedKnots: number(fix.tas ?? fix.speed),
      distanceNm: number(fix.distance ?? fix.distance_total),
      stage: text(fix.stage, 20)?.toUpperCase() || null,
    };
  }).filter(Boolean);
}

export function summarizeSimBrief(payload, user) {
  if (!payload || typeof payload !== 'object') throw new Error('SimBrief hat keinen gültigen OFP geliefert.');
  if (payload.fetch?.status === 'Error' || payload.fetch?.status === 'error') {
    throw new Error(text(payload.fetch?.message, 240) || 'SimBrief-OFP konnte nicht geladen werden.');
  }
  const general = payload.general || {};
  const origin = payload.origin || {};
  const destination = payload.destination || {};
  const alternate = payload.alternate || {};
  const aircraft = payload.aircraft || {};
  const weights = payload.weights || {};
  const fuel = payload.fuel || {};
  const times = payload.times || {};
  const params = payload.params || {};
  const files = payload.files || {};
  const waypoints = navlogWaypoints(payload.navlog || {});
  const flight = {
    callsign: text(general.callsign || `${general.icao_airline || ''}${general.flight_number || ''}`, 24),
    flightNumber: text(general.flight_number, 16),
    origin: text(origin.icao_code, 4)?.toUpperCase() || null,
    destination: text(destination.icao_code, 4)?.toUpperCase() || null,
    alternate: text(alternate.icao_code, 4)?.toUpperCase() || null,
    originName: text(origin.name, 100),
    destinationName: text(destination.name, 100),
    originPosition: position(origin),
    destinationPosition: position(destination),
    departureRunway: text(origin.plan_rwy, 6)?.toUpperCase() || null,
    arrivalRunway: text(destination.plan_rwy, 6)?.toUpperCase() || null,
    route: text(general.route_ifps || general.route, 4_000),
    initialAltitude: text(general.initial_altitude, 12),
    aircraftType: text(aircraft.icaocode || aircraft.icao_code, 12)?.toUpperCase() || null,
    aircraftName: text(aircraft.name, 100),
    registration: text(aircraft.reg, 20)?.toUpperCase() || null,
    passengers: number(weights.pax_count),
    cargoPounds: number(weights.cargo),
    zeroFuelWeightPounds: number(weights.est_zfw),
    takeoffWeightPounds: number(weights.est_tow),
    landingWeightPounds: number(weights.est_ldw),
    blockFuelPounds: number(fuel.plan_ramp || fuel.plan_block),
    tripFuelPounds: number(fuel.enroute_burn || fuel.plan_trip),
    taxiFuelPounds: number(fuel.taxi || fuel.plan_taxi),
    reserveFuelPounds: number(fuel.reserve || fuel.plan_reserve || fuel.final_reserve),
    alternateFuelPounds: number(fuel.alternate_burn || fuel.plan_alternate),
    contingencyFuelPounds: number(fuel.contingency || fuel.plan_contingency),
    extraFuelPounds: number(fuel.extra || fuel.plan_extra),
    estimatedOut: seconds(times.est_out),
    estimatedOff: seconds(times.est_off),
    estimatedOn: seconds(times.est_on),
    estimatedIn: seconds(times.est_in),
    enrouteSeconds: seconds(times.est_time_enroute),
    originMetar: text(origin.metar, 600),
    destinationMetar: text(destination.metar, 600),
    waypoints,
    ofpLink: safeLink(files.pdf?.link || files.pdf?.url || files.directory),
  };
  if (!flight.origin || !flight.destination) throw new Error('Der letzte SimBrief-OFP enthält keine gültige Route.');
  const generated = number(params.time_generated || general.release_time);
  return {
    user: text(user, 100),
    generatedAt: generated ? new Date(generated * 1_000).toISOString() : new Date().toISOString(),
    flight,
  };
}

export class SimBriefClient {
  constructor(engine, { fetchImpl = globalThis.fetch, timeoutMs = 12_000 } = {}) {
    this.engine = engine;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async importLatest(identifier) {
    const value = String(identifier ?? '').trim();
    if (!/^[A-Za-z0-9_.-]{2,80}$/.test(value)) {
      throw new Error('Bitte eine gültige SimBrief Pilot ID oder einen Benutzernamen eingeben.');
    }
    const url = new URL(SIMBRIEF_ENDPOINT);
    url.searchParams.set(/^\d+$/.test(value) ? 'userid' : 'username', value);
    url.searchParams.set('json', '1');
    const response = await this.fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Flight-Deck-EFB/1.3.0' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`SimBrief antwortet mit HTTP ${response.status}.`);
    const summary = summarizeSimBrief(await response.json(), value);
    this.engine.applySimBrief(summary);
    return summary;
  }
}
