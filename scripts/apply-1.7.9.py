import re
from pathlib import Path


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)


# Airport vectors: reliable bbox query, longer timeout, force stale detailed maps to refresh.
p = Path('src/airport-map-service.mjs')
text = read(p)
text = replace_once(text, 'const SCHEMA_VERSION = 4;', 'const SCHEMA_VERSION = 5;', 'map schema')
text = replace_once(text, 'const DEFAULT_TIMEOUT_MS = 20_000;', 'const DEFAULT_TIMEOUT_MS = 35_000;', 'map timeout')
pattern = re.compile(r'export function buildOverpassQuery\(\{ icao, lat, lon, radiusMeters = DEFAULT_RADIUS_METERS \}\) \{.*?\n\}\n\nfunction classify', re.S)
replacement = '''export function buildOverpassQuery({ lat, lon, radiusMeters = DEFAULT_RADIUS_METERS }) {
  const center = pointFromPair(lat, lon);
  if (!center) throw new TypeError('Valid airport coordinates are required');
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
  return `[out:json][timeout:35];
(
  nwr(${bbox})["aeroway"~"^(${aeroways})$"];
  nwr(${bbox})["building"~"^(terminal|hangar|transportation)$"];
);
out center geom qt;`;
}

function classify'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit('missing patch target: Overpass query')
text = replace_once(
    text,
    "if (![2, 3, SCHEMA_VERSION].includes(parsed.schemaVersion)",
    "if (![2, 3, 4, SCHEMA_VERSION].includes(parsed.schemaVersion)",
    'legacy map cache compatibility',
)
old = """        const mapData = convertOverpassPayload(payload, reference, { airportMetadata: reference.airport });
        await this.#writeCache(mapData);"""
new = """        const mapData = convertOverpassPayload(payload, reference, { airportMetadata: reference.airport });
        const complexAirport = ['large_airport', 'medium_airport'].includes(String(reference.airport?.type || '').toLowerCase());
        if (complexAirport && Number(mapData.counts?.taxiway || 0) < 1) {
          throw new Error('Unvollständige Airport-Daten: keine Taxiways geliefert');
        }
        await this.#writeCache(mapData);"""
text = replace_once(text, old, new, 'reject runway-only airport payload')
text = text.replace('Flight-Deck-EFB/1.7.8', 'Flight-Deck-EFB/1.7.9')
write(p, text)

# Main Taxi map: actual OSM basemap, fresh browser map cache, standalone planner readiness.
p = Path('public/app.js')
text = read(p)
map_anchor = """}).setView([51.2895, 6.7668], 16);

for (const [name, zIndex] of ["""
map_insert = """}).setView([51.2895, 6.7668], 16);

// Always show a real airport basemap, even when MSFS/SimConnect is not running.
// Operational vector geometry is drawn on top when available and remains the routing source.
const taxiBasemap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  subdomains: 'abc',
  updateWhenIdle: true,
  keepBuffer: 3,
  opacity: 0.78,
  attribution: '&copy; OpenStreetMap contributors',
}).addTo(map);

for (const [name, zIndex] of ["""
text = replace_once(text, map_anchor, map_insert, 'taxi OSM basemap')
text = replace_once(text, "const CLIENT_MAP_CACHE = 'flight-deck-airport-maps-v2';", "const CLIENT_MAP_CACHE = 'flight-deck-airport-maps-v3';", 'client map cache generation')
old_ready = """  const mapReady = loadedAirportMapData
    && (!plannerState.selectedAirport || loadedAirportMapData.icao === plannerState.selectedAirport.icao);"""
new_ready = """  const mapReady = loadedAirportMapData
    && loadedAirportMapData.cache?.status !== 'preview'
    && Number(loadedAirportMapData.counts?.taxiway || 0) > 0
    && (!plannerState.selectedAirport || loadedAirportMapData.icao === plannerState.selectedAirport.icao);"""
text = replace_once(text, old_ready, new_ready, 'planner detailed-map readiness')
old_message = """  if (!mapReady && plannerState.selectedAirport) {
    elements.plannerMessage.textContent = `Karte für ${plannerState.selectedAirport.icao} wird geladen …`;
  } else if (mapReady && elements.plannerMessage.textContent.includes('wird geladen')) {
    elements.plannerMessage.textContent = '';
  }"""
new_message = """  if (!mapReady && plannerState.selectedAirport) {
    const preview = loadedAirportMapData?.cache?.status === 'preview';
    elements.plannerMessage.textContent = preview
      ? `Basiskarte für ${plannerState.selectedAirport.icao} ist sichtbar. Taxiway-Routingdaten werden geladen …`
      : `Karte für ${plannerState.selectedAirport.icao} wird geladen …`;
  } else if (mapReady && (elements.plannerMessage.textContent.includes('wird geladen') || elements.plannerMessage.textContent.includes('Basiskarte'))) {
    elements.plannerMessage.textContent = '';
  }"""
text = replace_once(text, old_message, new_message, 'planner offline loading message')
text = text.replace("navigator.serviceWorker.register('/service-worker.js?v=1.4.1'", "navigator.serviceWorker.register('/service-worker.js?v=1.7.9'")
text = text.replace('?v=1.7.8', '?v=1.7.9')
write(p, text)

# HTML: standalone planning copy plus real version cache busting.
p = Path('public/index.html')
text = read(p)
text = text.replace('1.7.8', '1.7.9')
text = text.replace('?v=1.7.2', '?v=1.7.9')
text = replace_once(
    text,
    '<h1>Warte auf Taxifreigabe</h1>\n          <p>Starte SayIntentions oder BeyondATC – oder plane den Taxiweg selbst.</p>',
    '<h1>Noch keine Taxi-Route</h1>\n          <p>Plane einen Taxiweg auch ohne laufenden Simulator: Flughafen auswählen, Start und Ziel setzen.</p>',
    'standalone taxi empty state',
)
text = replace_once(
    text,
    'Nur für Flugsimulation · Offline-Vektorkarte · ©',
    'Nur für Flugsimulation · OpenStreetMap-Basiskarte + lokale Vektordaten · ©',
    'map attribution label',
)
text = text.replace(
    '<div class="update-changelog">',
    '<div class="update-changelog"><section><b>1.7.9</b><div><strong>Real airport map & standalone taxi planning</strong><ul><li>Taxi now always shows a real OpenStreetMap airport basemap with taxiways, roads and buildings even when MSFS is not running.</li><li>Standalone airport selection and taxi planning no longer depend on SimConnect.</li><li>Airport routing vectors use a simplified, more reliable Overpass query and reject runway-only payloads for large/medium airports.</li><li>Old runway-only browser map caches are bypassed automatically.</li><li>Fixed stale app.js/service-worker cache-busting references that could keep an older Taxi implementation active after updating.</li></ul></div></section>',
    1,
)
write(p, text)

p = Path('public/service-worker.js')
text = read(p)
text = text.replace("const CACHE_NAME = 'flight-deck-efb-v176';", "const CACHE_NAME = 'flight-deck-efb-v179';")
text = text.replace('1.7.8', '1.7.9').replace('1.7.2', '1.7.9')
write(p, text)

p = Path('src/server.mjs')
text = read(p).replace("const APP_VERSION = '1.7.8';", "const APP_VERSION = '1.7.9';")
write(p, text)

p = Path('README.md')
text = read(p)
text = re.sub(r'\*\*Current release: 1\.7\.8 — [^*]+\*\*', '**Current release: 1.7.9 — Real Airport Map & Standalone Taxi Planning**', text, count=1)
text = text.replace('## 1.7.8 highlights', '## 1.7.9 highlights', 1)
text = text.replace('Flight-Deck-EFB-Setup-1.7.8.exe', 'Flight-Deck-EFB-Setup-1.7.9.exe')
write(p, text)

p = Path('THIRD_PARTY_NOTICES.md')
text = read(p).replace('# Third-party notices — Flight Deck EFB 1.7.8', '# Third-party notices — Flight Deck EFB 1.7.9', 1)
write(p, text)

p = Path('CHANGELOG.md')
text = read(p)
marker = '# Flight Deck EFB changelog\n\n'
section = '''## 1.7.9 — Real Airport Map & Standalone Taxi Planning\n\n- Taxi Navigation now always has an **OpenStreetMap basemap**, so taxiways, roads, terminal context and buildings remain visible even with MSFS/SimConnect offline.\n- **Standalone taxi planning** is explicitly supported: select any airport from the bundled OurAirports catalog and plan without a running simulator.\n- Operational airport vectors now use a simpler bbox-based Overpass query with a longer timeout; large and medium airports reject incomplete runway-only responses and automatically try the next endpoint.\n- Airport vector schema was bumped to **5** and the browser map cache to **v3**, forcing old runway-only caches to refresh while preserving them only as an emergency offline fallback.\n- The planner no longer treats a runway-only preview as route-ready; it waits for an actual taxiway graph while the visual OSM basemap remains usable.\n- Fixed stale HTML script references (`app.js?v=1.7.2`, `si-operations.js?v=1.7.2`) and the old service-worker registration URL, which could leave an outdated Taxi implementation active after an update.\n- Taxi empty-state copy now makes it clear that planning works without SayIntentions, BeyondATC or MSFS.\n\n'''
if marker not in text:
    raise SystemExit('CHANGELOG header missing')
if '## 1.7.9 — Real Airport Map & Standalone Taxi Planning' not in text:
    text = text.replace(marker, marker + section, 1)
write(p, text)
