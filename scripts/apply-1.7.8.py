import re
from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing patch target: {label}")
    return text.replace(old, new, 1)


# Live Traffic: do not let a busy apron hide all airborne traffic and clean aircraft labels.
p = Path("public/live-traffic.js")
text = read(p)
text = replace_once(text, "  maxRows: 40,", "  maxRows: 120,", "live traffic row limit")
start = text.index("export function trafficAircraftLabel(entry = {}) {")
end = text.index("\n}\n\nexport function trafficPositionLabel", start) + 2
text = text[:start] + r'''export function trafficAircraftLabel(entry = {}) {
  const raw = String(entry.aircraftType || entry.title || '').replace(/[_-]+/g, ' ').trim();
  const airbus = raw.match(/\bAirbus\s+A?(319|320|321|330|340|350|380)\b/i);
  if (airbus) return `A${airbus[1]}`;
  const boeing = raw.match(/\bBoeing\s+(717|727|737|747|757|767|777|787)\b/i);
  if (boeing) return `B${boeing[1]}`;
  const embraer = raw.match(/\bEmbraer\s+E?(170|175|190|195)\b/i);
  if (embraer) return `E${embraer[1]}`;
  const match = raw.match(/\b(A(?:319|320|321|330|340|350|380)|B(?:717|727|737|747|757|767|777|787)|E(?:170|175|190|195)|CRJ(?:2|5|7|9|100|200|550|700|900|1000)|ATR(?:42|72)|DH8[ABCD]?|C(?:172|208)|PC12)\b/i);
  if (match) return match[1].toUpperCase();
  return raw.slice(0, 28) || 'UNKNOWN';
}''' + text[end:]
write(p, text)


# Injected traffic: separate generic identity reads from optional AI schedule reads.
p = Path("src/injected-traffic-client.mjs")
text = read(p)
text = replace_once(
    text,
    "const TRAFFIC_PLAN_DEFINITION = 92;\n",
    "const TRAFFIC_PLAN_DEFINITION = 92;\nconst TRAFFIC_IDENTITY_DEFINITION = 93;\n",
    "identity definition id",
)
clean_fn = r'''function clean(value) {
  return String(value || '').replace(/\0/g, '').trim();
}
'''
identity_helpers = clean_fn + r'''
function syntheticTrafficId(value = '') {
  const id = clean(value).replace(/\s+/g, '').toUpperCase();
  return /^(?:AIGAM|AIGAI|AIGAIMODELS|FSLTL)$/.test(id) || /^TRAFFIC-\d+$/.test(id) || /^AI-\d+$/.test(id);
}

function airlineFromTitle(value = '') {
  const raw = clean(value).replace(/[_-]+/g, ' ');
  const match = raw.match(/^(.+?)\s+(?:Airbus\s+A?\d{3}|Boeing\s+\d{3}|Embraer\s+E?\d{3}|A\d{3}|B\d{3}|E\d{3}|CRJ\d+)/i);
  if (!match) return '';
  return match[1].replace(/^(?:AIGAM|AIGAI|AIGAIMODELS|FSLTL)\s+/i, '').trim().slice(0, 32);
}

function bestTrafficCallsign(entry = {}) {
  const atcId = clean(entry.atcId);
  const airline = clean(entry.airline) || airlineFromTitle(entry.title);
  const flightNumber = clean(entry.flightNumber);
  if (airline && flightNumber) return `${airline} ${flightNumber}`;
  if (atcId && !syntheticTrafficId(atcId)) return atcId;
  if (flightNumber) return flightNumber;
  if (airline) return airline;
  return `TRAFFIC-${entry.objectId}`;
}
'''
text = replace_once(text, clean_fn, identity_helpers, "traffic identity helpers")
text = replace_once(
    text,
    "  const callsign = atcId || [airline, flightNumber].filter(Boolean).join(' ') || title || `AI-${entry.objectId}`;",
    "  const callsign = bestTrafficCallsign({ ...entry, atcId, title, airline, flightNumber });",
    "injected callsign",
)
text = replace_once(
    text,
    "    combined.source = entry?.source || 'simconnect-primary';\n    return combined;",
    "    combined.source = entry?.source || 'simconnect-primary';\n    combined.callsign = bestTrafficCallsign(combined);\n    return combined;",
    "merged callsign",
)
text = replace_once(
    text,
    "    this.pendingPlanRequests = new Map();\n",
    "    this.pendingPlanRequests = new Map();\n    this.pendingIdentityRequests = new Map();\n",
    "pending identity map",
)
text = text.replace(
    "    this.pendingPlanRequests.clear();\n    this.trafficPlanByObjectId.clear();",
    "    this.pendingPlanRequests.clear();\n    this.pendingIdentityRequests.clear();\n    this.trafficPlanByObjectId.clear();",
)
text = replace_once(
    text,
    "      this.handle.on('simObjectData', (received) => { this.#handleDetail(received); this.#handlePlanDetail(received); });",
    "      this.handle.on('simObjectData', (received) => { this.#handleDetail(received); this.#handleIdentityDetail(received); this.#handlePlanDetail(received); });",
    "identity event handler",
)
text = replace_once(
    text,
    "    addString('ATC ID', SimConnectDataType.STRING32);\n\n    const addPlanString",
    "    addString('ATC ID', SimConnectDataType.STRING32);\n\n"
    "    handle.addToDataDefinition(TRAFFIC_IDENTITY_DEFINITION, 'ATC AIRLINE', null, SimConnectDataType.STRING64, 0, SimConnectConstants.UNUSED);\n"
    "    handle.addToDataDefinition(TRAFFIC_IDENTITY_DEFINITION, 'ATC FLIGHT NUMBER', null, SimConnectDataType.STRING32, 0, SimConnectConstants.UNUSED);\n\n"
    "    const addPlanString",
    "identity SimVars",
)
text = text.replace("const objectIds = [...batch.objectIds].slice(0, 300);", "const objectIds = [...batch.objectIds].slice(0, 600);")
text = replace_once(
    text,
    "      .slice(0, 300);\n    this.#requestPlanEnrichment(this.fallbackAircraft);",
    "      .slice(0, 600);\n    this.#requestIdentityEnrichment(this.fallbackAircraft);\n    this.#requestPlanEnrichment(this.fallbackAircraft);",
    "identity enrichment invocation",
)
identity_methods = r'''  #requestIdentityEnrichment(aircraft = []) {
    if (!this.handle) return;
    for (const entry of aircraft.slice(0, 300)) {
      const objectId = Number(entry.objectId);
      if (!Number.isInteger(objectId) || [...this.pendingIdentityRequests.values()].includes(objectId)) continue;
      const requestId = this.#nextDetailRequestId();
      this.pendingIdentityRequests.set(requestId, objectId);
      try {
        this.handle.requestDataOnSimObject(requestId, TRAFFIC_IDENTITY_DEFINITION, objectId, SimConnectPeriod.ONCE, 0, 0, 0, 0);
        setTimeout(() => this.pendingIdentityRequests.delete(requestId), 3_000);
      } catch {
        this.pendingIdentityRequests.delete(requestId);
      }
    }
  }

  #handleIdentityDetail(received) {
    const objectId = this.pendingIdentityRequests.get(received.requestID);
    if (!objectId) return;
    this.pendingIdentityRequests.delete(received.requestID);
    try {
      const data = received.data;
      const identity = {
        airline: clean(data.readString64()),
        flightNumber: clean(data.readString32()),
      };
      if (!identity.airline && !identity.flightNumber) return;
      this.fallbackAircraft = this.fallbackAircraft.map((entry) => Number(entry.objectId) === Number(objectId)
        ? this.#normalizeTrafficEntry({ ...entry, ...identity }) : entry);
      this.#publishMergedTraffic();
    } catch {
      // Some injector objects expose no generic ATC identity fields.
    }
  }

'''
needle = "  #requestPlanEnrichment(aircraft = []) {\n"
text = replace_once(text, needle, identity_methods + needle, "identity enrichment methods")
text = text.replace("for (const entry of aircraft.slice(0, 120)) {", "for (const entry of aircraft.slice(0, 240)) {", 1)
text = text.replace("      .slice(0, 300)\n      .sort", "      .slice(0, 600)\n      .sort")
write(p, text)


# Primary reader: use the same identity precedence after metadata is merged back in.
p = Path("src/simconnect-client.mjs")
text = read(p)
helpers = r'''function cleanTrafficText(value) {
  return String(value || '').replace(/\0/g, '').trim();
}

function syntheticTrafficId(value = '') {
  const id = cleanTrafficText(value).replace(/\s+/g, '').toUpperCase();
  return /^(?:AIGAM|AIGAI|AIGAIMODELS|FSLTL)$/.test(id) || /^TRAFFIC-\d+$/.test(id) || /^AI-\d+$/.test(id);
}

function trafficAirlineFromTitle(value = '') {
  const raw = cleanTrafficText(value).replace(/[_-]+/g, ' ');
  const match = raw.match(/^(.+?)\s+(?:Airbus\s+A?\d{3}|Boeing\s+\d{3}|Embraer\s+E?\d{3}|A\d{3}|B\d{3}|E\d{3}|CRJ\d+)/i);
  return match ? match[1].replace(/^(?:AIGAM|AIGAI|AIGAIMODELS|FSLTL)\s+/i, '').trim().slice(0, 32) : '';
}

function trafficCallsign(entry = {}) {
  const atcId = cleanTrafficText(entry.atcId);
  const airline = cleanTrafficText(entry.airline) || trafficAirlineFromTitle(entry.title);
  const flightNumber = cleanTrafficText(entry.flightNumber);
  if (airline && flightNumber) return `${airline} ${flightNumber}`;
  if (atcId && !syntheticTrafficId(atcId)) return atcId;
  if (flightNumber) return flightNumber;
  if (airline) return airline;
  return `TRAFFIC-${entry.objectId}`;
}

'''
text = replace_once(text, "function decodeBco16(value) {\n", helpers + "function decodeBco16(value) {\n", "primary identity helpers")
text = replace_once(
    text,
    "    const callsign = atcId || [airline, flightNumber].filter(Boolean).join(' ') || `AI-${entry.objectId}`;",
    "    const callsign = trafficCallsign({ ...entry, atcId, airline, flightNumber });",
    "primary callsign",
)
text = replace_once(
    text,
    "        if (previous.scheduleEnriched) {\n          merged.scheduleEnriched = true;\n          if (previous.state) merged.state = previous.state;\n        }\n        return merged;",
    "        if (previous.scheduleEnriched) {\n          merged.scheduleEnriched = true;\n          if (previous.state) merged.state = previous.state;\n        }\n        merged.callsign = trafficCallsign(merged);\n        return merged;",
    "primary merged callsign",
)
write(p, text)


# Airport vector source: new schema forces old runway-only/partial caches to refresh.
p = Path("src/airport-map-service.mjs")
text = read(p)
text = replace_once(text, "const SCHEMA_VERSION = 3;", "const SCHEMA_VERSION = 4;", "map schema")
fn_start = text.index("export function buildOverpassQuery(")
fn_end = text.index("\n}\n\nfunction classify", fn_start) + 2
new_query = r'''export function buildOverpassQuery({ icao, lat, lon, radiusMeters = DEFAULT_RADIUS_METERS }) {
  const center = pointFromPair(lat, lon);
  if (!center) throw new TypeError('Valid airport coordinates are required');
  const normalizedIcao = normalizeIcao(icao);
  const radius = Math.max(2_000, Math.min(18_000, Math.round(radiusMeters)));
  const latitudeDelta = radius / 111_320;
  const longitudeDelta = radius / (111_320 * Math.max(0.2, Math.cos(center.lat * Math.PI / 180)));
  const bbox = [
    center.lat - latitudeDelta,
    center.lon - longitudeDelta,
    center.lat + latitudeDelta,
    center.lon + longitudeDelta,
  ].map((value) => value.toFixed(7)).join(',');
  const aeroways = [...SUPPORTED_AEROWAYS].join('|');
  const areaPrelude = normalizedIcao
    ? `area["aeroway"="aerodrome"]["icao"="${normalizedIcao}"]->.flightDeckAirportArea;`
    : '';
  const areaBuildings = normalizedIcao ? 'nwr(area.flightDeckAirportArea)["building"];' : '';
  return `[out:json][timeout:40];
${areaPrelude}
(
  nwr(${bbox})["aeroway"~"^(${aeroways})$"];
  nwr(${bbox})["building"~"^(terminal|hangar|transportation)$"];
  ${areaBuildings}
);
out center geom qt;`;
}'''
text = text[:fn_start] + new_query + text[fn_end:]
text = replace_once(
    text,
    "  if (building === 'hangar') return 'building';\n  return null;",
    "  if (building === 'hangar') return 'building';\n  if (building && building !== 'no') return 'building';\n  return null;",
    "generic airport buildings",
)
text = replace_once(
    text,
    "      if (![2, SCHEMA_VERSION].includes(parsed.schemaVersion) || parsed.icao !== icao || !Array.isArray(parsed.features)) return null;",
    "      if (![2, 3, SCHEMA_VERSION].includes(parsed.schemaVersion) || parsed.icao !== icao || !Array.isArray(parsed.features)) return null;",
    "legacy cache compatibility",
)
text = replace_once(
    text,
    "    if (cached && !forceRefresh) {\n      return { ...cached, cache: { status: 'cached', offlineReady: true } };\n    }",
    "    const staleSchema = Boolean(cached && cached.schemaVersion !== SCHEMA_VERSION);\n    if (cached && !forceRefresh && !staleSchema) {\n      return { ...cached, cache: { status: 'cached', offlineReady: true } };\n    }",
    "stale cache refresh",
)
text = text.replace("'User-Agent': 'Flight-Deck-EFB/1.3.2 (flight simulation companion)'", "'User-Agent': 'Flight-Deck-EFB/1.7.8 (flight simulation companion)'")
write(p, text)


# Do not erase OSM taxiways merely because a partial MSFS facility response exists.
p = Path("src/msfs-airport-facility.mjs")
text = read(p)
text = replace_once(
    text,
    "  const replaceKinds = new Set(['taxiway', 'parking_position', 'gate', 'holding_position', 'closed_taxiway', 'painted_line']);\n  const retained = (baseMap?.features || []).filter((entry) => !replaceKinds.has(entry.kind));",
    "  const replaceKinds = new Set(['taxiway', 'parking_position', 'gate', 'holding_position', 'closed_taxiway', 'painted_line']);\n  const facilityKinds = new Set((facilityMap.features || []).map((entry) => entry.kind));\n  const retained = (baseMap?.features || []).filter((entry) => !replaceKinds.has(entry.kind) || !facilityKinds.has(entry.kind));",
    "conditional facility replacement",
)
write(p, text)


# The preview is fast; the detailed request should actually wait for complete OSM geometry.
p = Path("src/server.mjs")
text = read(p)
text = replace_once(
    text,
    "      baseMap = (await Promise.race([basePromise, wait(8_000, { map: null })])).map;",
    "      // A fast preview is already rendered by the browser. Wait for the detailed OSM map here\n      // so /current does not silently degrade into another runway-only preview.\n      baseMap = (await basePromise).map;",
    "full map wait",
)
text = text.replace("const APP_VERSION = '1.7.7';", "const APP_VERSION = '1.7.8';")
write(p, text)


# Remove only the Home Flight Assistant card. Flight phase intelligence remains in the product.
p = Path("public/index.html")
text = read(p)
pattern = re.compile(r'\n\s*<article class="home-assistant-card efb-card">.*?</article>\n', re.S)
text, count = pattern.subn("\n", text, count=1)
if count != 1:
    raise SystemExit("Flight Assistant home card not found exactly once")
text = text.replace('data-app-version="1.7.7"', 'data-app-version="1.7.8"')
text = text.replace('?v=1.7.7', '?v=1.7.8')
text = text.replace('id="update-version">v1.7.7', 'id="update-version">v1.7.8')
text = text.replace('<span>CURRENT v1.7.7</span>', '<span>CURRENT v1.7.8</span>', 1)
text = text.replace(
    '<div class="update-changelog">',
    '<div class="update-changelog"><section><b>1.7.8</b><div><strong>Traffic identity &amp; complete taxi map</strong><ul><li>Internal AIGAM-style IDs are suppressed when a better traffic identity is available.</li><li>ATC airline and flight number are read independently when the simulator/injector exposes them.</li><li>Nearby can show up to 120 aircraft, so airborne traffic is not hidden by a busy apron.</li><li>Taxi waits for the complete vector map with taxiways, aprons, terminals and airport buildings.</li><li>Flight Assistant was removed from Home.</li></ul></div></section>',
    1,
)
write(p, text)

p = Path("public/app.js")
write(p, read(p).replace('?v=1.7.7', '?v=1.7.8'))
p = Path("public/service-worker.js")
write(p, read(p).replace('1.7.7', '1.7.8'))


# Regression coverage.
p = Path("scripts/test-live-traffic.mjs")
text = read(p)
text = replace_once(
    text,
    "assert.equal(trafficAircraftLabel(ground), 'A320');",
    "assert.equal(trafficAircraftLabel(ground), 'A320');\nassert.equal(trafficAircraftLabel({ title: 'AIGAM SunExpress Boeing 737-800' }), 'B737');",
    "aircraft label regression",
)
text = replace_once(
    text,
    "assert.equal(model.limits.nearbyRadiusNm, 120);",
    "assert.equal(model.limits.nearbyRadiusNm, 120);\nassert.equal(model.limits.maxRows, 120);",
    "row limit regression",
)
write(p, text)

p = Path("scripts/verify-traffic-merge.mjs")
text = read(p)
traffic_regression = r'''
const synthetic = normalizeInjectedTrafficEntry({
  objectId: 123, lat: 51.2, lon: 6.7, onGround: true, title: 'AIGAM SunExpress Boeing 737-800',
  atcId: 'AIGAM', airline: 'SunExpress', flightNumber: '1234',
});
assert.equal(synthetic.callsign, 'SunExpress 1234', 'real airline/flight number must beat synthetic AIGAM id');

'''
text = replace_once(text, "console.log('Traffic merge regression OK');", traffic_regression + "console.log('Traffic merge regression OK');", "identity regression")
write(p, text)


# Versioned docs.
p = Path("README.md")
text = read(p)
text = re.sub(r'\*\*Current release: 1\.7\.7 — [^*]+\*\*', '**Current release: 1.7.8 — Traffic Identity & Complete Taxi Map**', text, count=1)
text = text.replace('## 1.7.7 highlights', '## 1.7.8 highlights', 1)
text = text.replace('Flight-Deck-EFB-Setup-1.7.7.exe', 'Flight-Deck-EFB-Setup-1.7.8.exe')
write(p, text)

p = Path("THIRD_PARTY_NOTICES.md")
write(p, read(p).replace('# Third-party notices — Flight Deck EFB 1.7.7', '# Third-party notices — Flight Deck EFB 1.7.8', 1))

p = Path("CHANGELOG.md")
text = read(p)
marker = "# Flight Deck EFB changelog\n\n"
section = """## 1.7.8 — Traffic Identity & Complete Taxi Map

- Live Traffic now shows up to **120 rows**, preventing nearby airborne traffic from being hidden by the first 40 ground objects at busy airports.
- Added a separate generic **ATC AIRLINE / ATC FLIGHT NUMBER** identity read, so a flight number is shown when MSFS/the injector actually exposes one without making core traffic depend on optional schedule SimVars.
- Internal injector IDs such as **AIGAM** are no longer preferred as the visible callsign; real airline/flight-number identity wins, with a clean title-derived airline fallback.
- Aircraft strings such as **AIGAM SunExpress Boeing 737-800** are normalized to an aircraft family such as **B737** instead of leaking provider/livery text into the Aircraft column.
- Detailed Taxi Navigation now waits for the complete OSM/Overpass map after the fast preview, restoring **taxiways, aprons, terminals and airport buildings** instead of getting stuck on runways.
- Airport building download now includes buildings inside the ICAO aerodrome area, and schema-3 map caches are refreshed automatically while remaining usable as an offline fallback if the download fails.
- MSFS facility geometry replaces an OSM feature class only when the facility response actually contains that class, preventing partial facility data from deleting valid OSM taxiways.
- Removed the **Flight Assistant** card from Home; automatic flight-phase intelligence remains available to the Flight Journey features.

"""
if marker not in text:
    raise SystemExit("CHANGELOG header missing")
if "## 1.7.8 — Traffic Identity & Complete Taxi Map" not in text:
    text = text.replace(marker, marker + section, 1)
write(p, text)
