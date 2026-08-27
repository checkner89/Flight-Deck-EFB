const SIMBRIEF_ENDPOINT = 'https://www.simbrief.com/api/xml.fetcher.php';
const MAX_OFP_TEXT = 1_000_000;
const MAX_BRIEFING_TEXT = 350_000;

function text(value, maxLength = 300) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized || ['undefined', 'null'].includes(normalized.toLowerCase())) return null;
  return normalized.slice(0, maxLength);
}

function longText(value, maxLength = MAX_OFP_TEXT) {
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

function simBriefFileLink(files, key) {
  const entry = files?.[key];
  const candidate = entry?.link || entry?.url || (typeof entry === 'string' ? entry : null);
  if (!candidate) return null;
  const direct = safeLink(candidate);
  if (direct) return direct;
  const directory = safeLink(files?.directory);
  if (!directory) return null;
  try {
    const base = directory.endsWith('/') ? directory : `${directory}/`;
    return safeLink(new URL(String(candidate).replace(/^\/+/, ''), base).toString());
  } catch {
    return null;
  }
}

function decodeBasicEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&#(\d+);/g, (match, code) => {
      const parsed = Number(code);
      return Number.isInteger(parsed) && parsed > 0 && parsed <= 0x10ffff ? String.fromCodePoint(parsed) : match;
    });
}

function htmlToPlainText(value) {
  if (!value) return null;
  return longText(decodeBasicEntities(String(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|pre|tr|table|section|h[1-6])>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<td[^>]*>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')),
  MAX_OFP_TEXT);
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

function collectReadableText(value, maxLength = MAX_BRIEFING_TEXT) {
  const lines = [];
  let total = 0;
  const push = (line) => {
    const normalized = String(line || '').replace(/\r/g, '').trim();
    if (!normalized || total >= maxLength) return;
    const remaining = maxLength - total;
    const sliced = normalized.slice(0, remaining);
    lines.push(sliced);
    total += sliced.length + 1;
  };
  const visit = (node, label = '', depth = 0) => {
    if (total >= maxLength || depth > 8 || node === undefined || node === null) return;
    if (typeof node === 'string' || typeof node === 'number') {
      const body = String(node).trim();
      if (!body) return;
      push(label && body.length > 20 ? `${label.toUpperCase()}\n${body}` : label ? `${label}: ${body}` : body);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, label, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) {
        const childLabel = key.replace(/_/g, ' ');
        visit(child, childLabel, depth + 1);
      }
    }
  };
  visit(value);
  return lines.join('\n\n').trim() || null;
}

export function extractSimBriefOFP(payload, summary = null) {
  const planHtml = longText(payload?.text?.plan_html, MAX_OFP_TEXT);
  const planText = longText(
    payload?.text?.plan_text
      || payload?.text?.plan
      || htmlToPlainText(planHtml),
    MAX_OFP_TEXT,
  );
  const files = payload?.files || {};
  const pdfLink = simBriefFileLink(files, 'pdf') || summary?.flight?.ofpLink || null;
  const generatedAt = summary?.generatedAt || new Date().toISOString();
  return {
    generatedAt,
    planHtml,
    planText,
    pdfLink,
    planFormat: text(payload?.params?.planformat || payload?.params?.ofp_format || payload?.general?.ofp_layout, 40),
    notamsText: collectReadableText(payload?.notams || payload?.notam || null),
    briefingText: collectReadableText(payload?.weather || payload?.briefing || null),
  };
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
    airlineIcao: text(general.icao_airline, 4)?.toUpperCase() || null,
    airlineIata: text(general.iata_airline, 3)?.toUpperCase() || null,
    flightRules: text(general.flight_rules || general.flight_rule, 8)?.toUpperCase() || null,
    origin: text(origin.icao_code, 4)?.toUpperCase() || null,
    destination: text(destination.icao_code, 4)?.toUpperCase() || null,
    alternate: text(alternate.icao_code, 4)?.toUpperCase() || null,
    originName: text(origin.name, 100),
    destinationName: text(destination.name, 100),
    originPosition: position(origin),
    destinationPosition: position(destination),
    departureRunway: text(origin.plan_rwy, 6)?.toUpperCase() || null,
    arrivalRunway: text(destination.plan_rwy, 6)?.toUpperCase() || null,
    sid: text(general.sid || origin.sid, 40)?.toUpperCase() || null,
    star: text(general.star || destination.star, 40)?.toUpperCase() || null,
    route: text(general.route_ifps || general.route, 4_000),
    routeDistanceNm: number(general.route_distance || general.distance),
    airDistanceNm: number(general.air_distance),
    initialAltitude: text(general.initial_altitude, 12),
    cruiseAltitudeFeet: number(general.initial_altitude || general.cruise_altitude),
    cruiseMach: number(general.cruise_mach),
    cruiseTasKnots: number(general.cruise_tas),
    costIndex: number(general.costindex || general.cost_index),
    aircraftType: text(aircraft.icaocode || aircraft.icao_code, 12)?.toUpperCase() || null,
    aircraftName: text(aircraft.name, 100),
    registration: text(aircraft.reg, 20)?.toUpperCase() || null,
    passengers: number(weights.pax_count),
    payloadPounds: number(weights.payload),
    cargoPounds: number(weights.cargo),
    zeroFuelWeightPounds: number(weights.est_zfw),
    takeoffWeightPounds: number(weights.est_tow),
    landingWeightPounds: number(weights.est_ldw),
    maxZeroFuelWeightPounds: number(weights.max_zfw),
    maxTakeoffWeightPounds: number(weights.max_tow),
    maxLandingWeightPounds: number(weights.max_ldw),
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
    blockSeconds: seconds(times.est_block),
    originMetar: text(origin.metar, 600),
    originTaf: text(origin.taf, 1_200),
    destinationMetar: text(destination.metar, 600),
    destinationTaf: text(destination.taf, 1_200),
    alternateMetar: text(alternate.metar, 600),
    alternateTaf: text(alternate.taf, 1_200),
    waypoints,
    ofpLink: simBriefFileLink(files, 'pdf'),
    navlogCount: waypoints.length,
    units: text(params.units, 16),
    airacCycle: text(params.airac, 16),
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
    this.latestOFP = null;
  }

  latestDocument() {
    return this.latestOFP ? structuredClone(this.latestOFP) : null;
  }

  async importLatest(identifier) {
    const value = String(identifier ?? '').trim();
    if (!/^[A-Za-z0-9_.-]{2,80}$/.test(value)) {
      throw new Error('Bitte eine gültige SimBrief Pilot ID oder einen Benutzernamen eingeben.');
    }
    const url = new URL(SIMBRIEF_ENDPOINT);
    url.searchParams.set(/^\d+$/.test(value) ? 'userid' : 'username', value);
    url.searchParams.set('json', 'v2');
    const response = await this.fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Flight-Deck-EFB' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`SimBrief antwortet mit HTTP ${response.status}.`);
    const payload = await response.json();
    const summary = summarizeSimBrief(payload, value);
    this.latestOFP = extractSimBriefOFP(payload, summary);
    if (!summary.flight.ofpLink && this.latestOFP.pdfLink) summary.flight.ofpLink = this.latestOFP.pdfLink;
    this.engine.applySimBrief(summary);
    return summary;
  }
}
