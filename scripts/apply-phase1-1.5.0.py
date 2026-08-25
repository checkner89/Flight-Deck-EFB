from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Patch anchor missing: {label}')
    return text.replace(old, new, 1)


def update(path, transform):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    next_text = transform(text)
    if text == next_text:
        raise SystemExit(f'No changes produced for {path}')
    file.write_text(next_text, encoding='utf-8')


# -----------------------------------------------------------------------------
# Server: one lifecycle for SimConnect traffic + Little Navmap
# -----------------------------------------------------------------------------
def patch_server(text):
    text = replace_once(text,
        "import { SimConnectClient } from './simconnect-client.mjs';\n",
        "import { SimConnectClient } from './simconnect-client.mjs';\nimport { InjectedTrafficClient } from './injected-traffic-client.mjs';\nimport { LittleNavmapClient } from './littlenavmap-client.mjs';\n",
        'server connector imports')
    text = re.sub(r"const APP_VERSION = '[^']+';", "const APP_VERSION = '1.5.0';", text, count=1)
    text = replace_once(text,
        "  const simConnect = demo ? null : new SimConnectClient(engine);\n  const facilityMapCache = new Map();\n",
        "  const simConnect = demo ? null : new SimConnectClient(engine);\n  const injectedTraffic = demo ? null : new InjectedTrafficClient(engine);\n  const littleNavmap = demo ? null : new LittleNavmapClient(engine);\n  const facilityMapCache = new Map();\n",
        'server connector instances')
    text = replace_once(text,
        "      { id: 'msfs', label: 'Microsoft Flight Simulator / SimConnect', status: state.connections.simConnect?.status || 'waiting', detail: state.connections.simConnect?.detail || '' },\n      { id: 'atc', label: 'ATC source', status: activeConnectionStatus(state), detail: state.taxi?.clearance?.provider || state.atc?.selectedProvider || 'auto' },\n",
        "      { id: 'msfs', label: 'Microsoft Flight Simulator / SimConnect', status: state.connections.simConnect?.status || 'waiting', detail: state.connections.simConnect?.detail || '' },\n      { id: 'simconnect-health', label: 'SimConnect data health', status: state.integrations.simConnectHealth?.status || 'waiting', detail: state.integrations.simConnectHealth?.detail || '' },\n      { id: 'traffic', label: 'Simulator traffic', status: state.integrations.simTraffic?.status || 'waiting', detail: state.integrations.simTraffic?.detail || '' },\n      { id: 'little-navmap', label: 'Little Navmap WebAPI', status: state.integrations.littleNavmap?.status || 'waiting', detail: state.integrations.littleNavmap?.detail || '' },\n      { id: 'atc', label: 'ATC source', status: activeConnectionStatus(state), detail: state.taxi?.clearance?.provider || state.atc?.selectedProvider || 'auto' },\n",
        'diagnostic connector checks')
    text = replace_once(text,
        "      if (pathname === '/api/simbrief/import' && request.method === 'POST') {\n",
        "      if (pathname === '/api/littlenavmap/status' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        return json(response, 200, { littleNavmap: engine.publicState().integrations.littleNavmap });\n      }\n\n      if (pathname === '/api/littlenavmap/airport' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        if (!littleNavmap) return json(response, 409, { error: 'Little Navmap ist im Demo-Modus nicht aktiv.' });\n        const icao = String(requestUrl.searchParams.get('icao') || '').trim().toUpperCase();\n        try {\n          return json(response, 200, { airport: await littleNavmap.getAirport(icao), state: engine.publicState() });\n        } catch (error) {\n          return json(response, 502, { error: error.message });\n        }\n      }\n\n      if (pathname === '/api/simbrief/import' && request.method === 'POST') {\n",
        'little navmap routes')
    text = replace_once(text,
        "      if (pathname === '/api/traffic/refresh' && request.method === 'POST') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        try {\n          return json(response, 202, simConnect?.refreshTraffic() || { requested: false });\n",
        "      if (pathname === '/api/traffic/refresh' && request.method === 'POST') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        try {\n          const primary = simConnect?.refreshTraffic() || { requested: false };\n          const fallback = injectedTraffic?.refresh() || { requested: false };\n          return json(response, 202, { requested: Boolean(primary.requested || fallback.requested), primary, fallback });\n",
        'traffic refresh both readers')
    text = replace_once(text,
        "    sayIntentions.start();\n    beyondAtc.start();\n    simConnect.start();\n    gsx.start();\n    navigraph.start();\n    aviationWeather.start();\n",
        "    sayIntentions.start();\n    beyondAtc.start();\n    simConnect.start();\n    injectedTraffic.start();\n    littleNavmap.start();\n    gsx.start();\n    navigraph.start();\n    aviationWeather.start();\n",
        'start shared connectors')
    text = replace_once(text,
        "      sayIntentions.stop();\n      beyondAtc.stop();\n      simConnect.stop();\n      gsx.stop();\n",
        "      sayIntentions.stop();\n      beyondAtc.stop();\n      injectedTraffic.stop();\n      littleNavmap.stop();\n      simConnect.stop();\n      gsx.stop();\n",
        'stop shared connectors')
    text = replace_once(text,
        "    const mapData = facilityMap ? mergeMsfsFacilityMap(baseMap, facilityMap) : baseMap;\n    return {\n",
        "    const mapData = facilityMap ? mergeMsfsFacilityMap(baseMap, facilityMap) : baseMap;\n    littleNavmap?.getAirport(reference.icao).catch(() => {});\n    return {\n",
        'little navmap airport enrichment trigger')
    return text

update('src/server.mjs', patch_server)


# -----------------------------------------------------------------------------
# Electron: traffic fallback is hosted by server for desktop + portable/tablet
# -----------------------------------------------------------------------------
def patch_electron(text):
    text = text.replace("import { InjectedTrafficClient } from './injected-traffic-client.mjs';\n", '')
    text = text.replace('let injectedTraffic;\n', '')
    text = replace_once(text,
        "  if (!demo) {\n    injectedTraffic?.stop();\n    injectedTraffic = new InjectedTrafficClient(taxiServer.engine);\n    injectedTraffic.start();\n  }\n",
        '',
        'electron traffic startup')
    text = text.replace("  injectedTraffic?.stop();\n  injectedTraffic = null;\n", '')
    return text

update('src/electron-main.mjs', patch_electron)


# -----------------------------------------------------------------------------
# State: connector health, full SI session window, online pilot traffic
# -----------------------------------------------------------------------------
def patch_state(text):
    text = replace_once(text,
        "        onlineNetworks: {\n          selected: 'off',\n          status: 'idle',\n          updatedAt: null,\n          airports: [],\n          controllers: [],\n          atis: [],\n          detail: 'VATSIM / IVAO bei Bedarf aktualisieren',\n        },\n",
        "        onlineNetworks: {\n          selected: 'off',\n          status: 'idle',\n          updatedAt: null,\n          airports: [],\n          controllers: [],\n          atis: [],\n          pilots: [],\n          detail: 'VATSIM / IVAO bei Bedarf aktualisieren',\n        },\n        littleNavmap: {\n          status: 'waiting',\n          reachable: false,\n          simulatorConnected: false,\n          updatedAt: null,\n          detail: 'Little Navmap WebAPI wird gesucht',\n          sim: null,\n          airport: null,\n        },\n",
        'state connector defaults')
    text = replace_once(text,
        "      controllers: [],\n      atis: [],\n      detail: 'VATSIM / IVAO bei Bedarf aktualisieren',\n",
        "      controllers: [],\n      atis: [],\n      pilots: [],\n      detail: 'VATSIM / IVAO bei Bedarf aktualisieren',\n",
        'reset online pilots')
    text = text.replace('Array.isArray(comms) ? comms.slice(-100).map((entry) => ({', 'Array.isArray(comms) ? comms.slice(-2_000).map((entry) => ({', 1)
    text = replace_once(text,
        "        departureRunway: this.state.flight.departureRunway || flight.departureRunway || null,\n        arrivalRunway: this.state.flight.arrivalRunway || flight.arrivalRunway || null,\n        flightPlanRoute: this.state.flight.flightPlanRoute || flight.route || null,\n",
        "        departureRunway: this.state.flight.departureRunway || flight.departureRunway || null,\n        arrivalRunway: this.state.flight.arrivalRunway || flight.arrivalRunway || null,\n        sid: this.state.flight.sid || flight.sid || null,\n        star: this.state.flight.star || flight.star || null,\n        flightPlanRoute: this.state.flight.flightPlanRoute || flight.route || null,\n",
        'simbrief procedures into flight state')
    return text

update('src/state-engine.mjs', patch_state)


# -----------------------------------------------------------------------------
# SayIntentions: deduplicated larger per-flight communications history
# -----------------------------------------------------------------------------
def patch_si(text):
    text = replace_once(text,
        "const DEFAULT_SAPI_BASE_URL = 'https://apipri.sayintentions.ai/sapi/';\n",
        "const DEFAULT_SAPI_BASE_URL = 'https://apipri.sayintentions.ai/sapi/';\nconst MAX_COMMS_HISTORY = 2_000;\n\nfunction commKey(entry = {}) {\n  const id = Number(entry.id);\n  if (Number.isFinite(id) && id > 0) return `id:${id}`;\n  return [entry.stamp_zulu, entry.station_name, entry.ident, entry.outgoing_message_english, entry.incoming_message_english, entry.message].map((value) => String(value || '')).join('|');\n}\n",
        'SI history helper')
    old = """        if (entries.length > 0) {
          this.allComms.push(...entries);
          this.allComms = this.allComms.slice(-100);
          this.lastCommsId = Math.max(this.lastCommsId, ...entries.map((entry) => Number(entry.id) || 0));
          this.engine.applyComms(this.allComms);
        }
"""
    new = """        if (entries.length > 0) {
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
"""
    return replace_once(text, old, new, 'SI history merge')

update('src/sayintentions-client.mjs', patch_si)


# -----------------------------------------------------------------------------
# SimBrief: richer normalized OFP while retaining current public state contract
# -----------------------------------------------------------------------------
Path('src/simbrief-client.mjs').write_text(r'''const SIMBRIEF_ENDPOINT = 'https://www.simbrief.com/api/xml.fetcher.php';

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
    ofpLink: safeLink(files.pdf?.link || files.pdf?.url || files.directory),
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
      headers: { Accept: 'application/json', 'User-Agent': 'Flight-Deck-EFB' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`SimBrief antwortet mit HTTP ${response.status}.`);
    const summary = summarizeSimBrief(await response.json(), value);
    this.engine.applySimBrief(summary);
    return summary;
  }
}
''', encoding='utf-8')


# -----------------------------------------------------------------------------
# VATSIM / IVAO: keep ATC and add relevant live pilot traffic
# -----------------------------------------------------------------------------
Path('src/online-network-client.mjs').write_text(r'''const ENDPOINTS = Object.freeze({
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
''', encoding='utf-8')


# -----------------------------------------------------------------------------
# SimConnect: connected transport must also prove fresh core telemetry
# -----------------------------------------------------------------------------
def patch_simconnect(text):
    text = replace_once(text,
        "    this.sentOperations = new Map();\n    this.lastCoreDataAt = 0;\n",
        "    this.sentOperations = new Map();\n    this.lastCoreDataAt = 0;\n    this.watchdogTimer = null;\n",
        'simconnect watchdog field')
    text = replace_once(text,
        "    this.stopped = false;\n    this.#connect();\n",
        "    this.stopped = false;\n    clearInterval(this.watchdogTimer);\n    this.watchdogTimer = setInterval(() => this.#watchConnection(), 5_000);\n    this.#connect();\n",
        'simconnect watchdog start')
    text = replace_once(text,
        "    clearTimeout(this.retryTimer);\n    clearInterval(this.trafficPollTimer);\n",
        "    clearTimeout(this.retryTimer);\n    clearInterval(this.watchdogTimer);\n    this.watchdogTimer = null;\n    clearInterval(this.trafficPollTimer);\n",
        'simconnect watchdog stop')
    text = replace_once(text,
        "      this.handle = handle;\n      this.protocol = protocol;\n",
        "      this.handle = handle;\n      this.protocol = protocol;\n      this.lastCoreDataAt = 0;\n      this.engine.setIntegration('simConnectHealth', { status: 'waiting', detail: `Transport verbunden · ${this.#protocolLabel(protocol)} · warte auf Telemetrie`, protocol: this.#protocolLabel(protocol), updatedAt: new Date().toISOString() });\n",
        'simconnect connected health')
    anchor = """  #rememberOperation(sendId, label, { optional = false } = {}) {
"""
    method = """  #watchConnection() {
    if (!this.handle) return;
    const ageMs = this.lastCoreDataAt ? Date.now() - this.lastCoreDataAt : null;
    if (ageMs === null) {
      this.engine.setIntegration('simConnectHealth', {
        status: 'waiting',
        detail: `Transport verbunden · ${this.#protocolLabel(this.protocol)} · warte auf Telemetrie`,
        protocol: this.#protocolLabel(this.protocol),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (ageMs > 15_000) {
      this.engine.setIntegration('simConnectHealth', {
        status: 'limited',
        detail: `SimConnect verbunden · Telemetrie seit ${Math.round(ageMs / 1_000)} s unverändert`,
        protocol: this.#protocolLabel(this.protocol),
        lastCoreDataAt: new Date(this.lastCoreDataAt).toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    this.engine.setIntegration('simConnectHealth', {
      status: 'ready',
      detail: `SimConnect Telemetrie aktiv · ${this.#protocolLabel(this.protocol)}`,
      protocol: this.#protocolLabel(this.protocol),
      lastCoreDataAt: new Date(this.lastCoreDataAt).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

"""
    text = replace_once(text, anchor, method + anchor, 'simconnect watchdog method')
    return text

update('src/simconnect-client.mjs', patch_simconnect)


# -----------------------------------------------------------------------------
# Traffic fallback: explicit refresh for the shared server endpoint
# -----------------------------------------------------------------------------
def patch_traffic(text):
    anchor = """  #registerDefinitions(handle) {
"""
    method = """  refresh() {
    if (!this.handle) return { requested: false, reason: 'not-connected' };
    if (this.discoveryBatch || this.detailBatch) return { requested: true, pending: true };
    this.#poll();
    return { requested: true };
  }

"""
    return replace_once(text, anchor, method + anchor, 'traffic refresh method')

update('src/injected-traffic-client.mjs', patch_traffic)


# -----------------------------------------------------------------------------
# UI: visible Little Navmap health alongside other integrations
# -----------------------------------------------------------------------------
def patch_index(text):
    text = text.replace('data-app-version="1.4.4"', 'data-app-version="1.5.0"', 1)
    text = text.replace('?v=1.4.4', '?v=1.5.0')
    return replace_once(text,
        "                <div><i id=\"settings-msfs-dot\"></i><span><strong>Microsoft Flight Simulator</strong><small id=\"settings-msfs\">Wird gesucht</small></span></div>\n                <div><i id=\"settings-atc-dot\"></i><span><strong>ATC &amp; Online Networks</strong><small id=\"settings-atc\">Auto</small></span></div>\n",
        "                <div><i id=\"settings-msfs-dot\"></i><span><strong>Microsoft Flight Simulator</strong><small id=\"settings-msfs\">Wird gesucht</small></span></div>\n                <div><i id=\"settings-lnm-dot\"></i><span><strong>Little Navmap</strong><small id=\"settings-lnm\">WebAPI wird gesucht</small></span></div>\n                <div><i id=\"settings-atc-dot\"></i><span><strong>ATC &amp; Online Networks</strong><small id=\"settings-atc\">Auto</small></span></div>\n",
        'Little Navmap settings row')

update('public/index.html', patch_index)


def patch_app(text):
    text = text.replace("./i18n.js?v=1.4.4", "./i18n.js?v=1.5.0", 1)
    text = text.replace("./flight-phases.js?v=1.4.4", "./flight-phases.js?v=1.5.0", 1)
    text = replace_once(text,
        "  settingsMsfsDot: $('#settings-msfs-dot'),\n  settingsAtcDot: $('#settings-atc-dot'),\n",
        "  settingsMsfsDot: $('#settings-msfs-dot'),\n  settingsLnmDot: $('#settings-lnm-dot'),\n  settingsAtcDot: $('#settings-atc-dot'),\n",
        'LNM settings dot element')
    text = replace_once(text,
        "  settingsMsfs: $('#settings-msfs'),\n  settingsAtc: $('#settings-atc'),\n",
        "  settingsMsfs: $('#settings-msfs'),\n  settingsLnm: $('#settings-lnm'),\n  settingsAtc: $('#settings-atc'),\n",
        'LNM settings text element')
    text = replace_once(text,
        "  setStatusDot(elements.settingsMsfsDot, simConnection.status);\n  setStatusDot(elements.settingsAtcDot, atcConnection?.status);\n",
        "  const littleNavmap = state.integrations?.littleNavmap || {};\n  setStatusDot(elements.settingsMsfsDot, simConnection.status);\n  setStatusDot(elements.settingsLnmDot, littleNavmap.status);\n  setStatusDot(elements.settingsAtcDot, atcConnection?.status);\n",
        'LNM settings status')
    text = replace_once(text,
        "  elements.settingsMsfs.textContent = simConnection.detail || 'Wird gesucht';\n  elements.settingsAtc.textContent = `${effectiveProvider === 'auto' ? 'AUTO' : atcProviderLabel(effectiveProvider)} · ${atcConnection?.detail || 'wartet'}`;\n",
        "  elements.settingsMsfs.textContent = simConnection.detail || 'Wird gesucht';\n  elements.settingsLnm.textContent = littleNavmap.detail || 'WebAPI wird gesucht';\n  elements.settingsAtc.textContent = `${effectiveProvider === 'auto' ? 'AUTO' : atcProviderLabel(effectiveProvider)} · ${atcConnection?.detail || 'wartet'}`;\n",
        'LNM settings detail')
    return text

update('public/app.js', patch_app)


def patch_sw(text):
    text = text.replace("flight-deck-efb-v144", "flight-deck-efb-v150")
    text = text.replace('?v=1.4.4', '?v=1.5.0')
    return text

update('public/service-worker.js', patch_sw)


# -----------------------------------------------------------------------------
# Documentation / release metadata
# -----------------------------------------------------------------------------
def patch_changelog(text):
    heading = """# Flight Deck EFB changelog

"""
    release = """# Flight Deck EFB changelog

## 1.5.0 — Phase 1 connectors

- Hardened SimConnect health reporting with a telemetry watchdog while preserving transport connections on optional data errors.
- Moved injected/all-object traffic fallback into the shared host so Flightboard traffic works consistently in Windows and portable/tablet-host modes.
- Expanded SayIntentions communications history to a deduplicated 2,000-message per-flight session window while keeping incremental SAPI polling.
- Expanded normalized SimBrief OFP data with procedures, cruise planning, distances, additional weights/fuel/timing and METAR/TAF fields.
- Extended VATSIM and IVAO refresh data with relevant live pilots in addition to ATC and ATIS.
- Added a local-only Little Navmap WebAPI connector on port 8965 for simulator-health cross-checks and airport metadata/weather/frequency enrichment.
- Added Little Navmap, SimConnect data-health and traffic status to diagnostics and the Settings integration overview.

"""
    return replace_once(text, heading, release, 'changelog heading')

update('CHANGELOG.md', patch_changelog)


def patch_readme(text):
    text = re.sub(r'^# Flight Deck EFB [^\n]+', '# Flight Deck EFB 1.5.0', text, count=1, flags=re.M)
    anchor = """- **Simulator Flightboard** lists the AI, live and add-on traffic currently
  exposed by MSFS SimConnect. Departures and arrivals can be filtered for the
  relevant airport, while operational labels such as parked, taxi out,
  departing, landing and taxi in are derived from simulator state. It does not
  depend on a SayIntentions traffic endpoint.
"""
    replacement = anchor + """- **Little Navmap** can be detected through its local WebAPI (`127.0.0.1:8965/api`)
  when the Little Navmap web server is enabled. Flight Deck uses the documented
  simulator and airport-information endpoints as an optional cross-check and
  metadata source; Little Navmap is never required for the core MSFS connection.
- **Online Networks** can additionally normalize relevant VATSIM/IVAO pilots
  whose flight plans involve the active airports or whose position is near the
  user aircraft, alongside the existing controller and ATIS view.
"""
    return replace_once(text, anchor, replacement, 'README connector features')

update('README.md', patch_readme)

print('Phase 1 migration applied successfully.')
