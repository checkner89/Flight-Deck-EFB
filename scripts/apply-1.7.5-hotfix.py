from pathlib import Path


def replace(path, old, new, expected=1):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    found = text.count(old)
    if found != expected:
        raise SystemExit(f'{path}: expected {expected} occurrence(s), found {found}: {old[:120]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')


# Live Traffic scopes: Ground stays airport-local; Arriving / Nearby expand.
replace(
    'public/live-traffic.js',
    "  groundRadiusNm: 8,\n  arrivingRadiusNm: 25,\n  nearbyRadiusNm: 30,\n  maxRows: 40,",
    "  groundRadiusNm: 8,\n  arrivingRadiusNm: 80,\n  nearbyRadiusNm: 120,\n  maxRows: 40,",
)

# SimConnect hard-caps this API at 200 km (~108 NM).
replace('src/simconnect-client.mjs', 'const TRAFFIC_RADIUS_METERS = 60_000;', 'const TRAFFIC_RADIUS_METERS = 200_000;')
replace('src/injected-traffic-client.mjs', 'const TRAFFIC_RADIUS_METERS = 60_000;', 'const TRAFFIC_RADIUS_METERS = 200_000;')

# Do not discard PassiveAircraft-style injected traffic during all-object discovery.
replace(
    'src/injected-traffic-client.mjs',
    "const AIRCRAFT_CATEGORIES = new Set(['airplane', 'airship', 'helicopter', 'hotairballoon']);",
    "const AIRCRAFT_CATEGORIES = new Set([\n  'airplane', 'airship', 'helicopter', 'hotairballoon',\n  'aircraft', 'passiveaircraft', 'passive aircraft',\n]);",
)
replace(
    'src/injected-traffic-client.mjs',
    "      if (AIRCRAFT_CATEGORIES.has(category)\n        && Number.isInteger(objectId)\n        && objectId !== SimConnectConstants.OBJECT_ID_USER) {",
    "      const aircraftCategory = AIRCRAFT_CATEGORIES.has(category)\n        || category.includes('aircraft')\n        || category.includes('airplane')\n        || category.includes('helicopter');\n      if (aircraftCategory\n        && Number.isInteger(objectId)\n        && objectId !== SimConnectConstants.OBJECT_ID_USER) {",
)

# New Flight: suppress the just-finished provider identity/path so stale SI data does not immediately return.
replace(
    'src/server.mjs',
    "engine.resetFlight({ reason: 'manual-new-flight', preserveAircraft: true, suppressCurrent: false });",
    "engine.resetFlight({ reason: 'manual-new-flight', preserveAircraft: true, suppressCurrent: true });",
)

# Avoid returning a runway-only preview just because MSFS facility data wins the initial race.
replace(
    'src/server.mjs',
    "baseMap = (await Promise.race([basePromise, wait(900, { map: null })])).map;",
    "baseMap = (await Promise.race([basePromise, wait(8_000, { map: null })])).map;",
)

# Never turn a preview into a persistent browser cache entry. Existing 1.7.4 preview caches self-heal.
replace(
    'public/app.js',
    "    if (clientCached?.icao === icao && requestSerial === mapRequestSerial) {\n      clientCached.cache = { status: 'cached', offlineReady: true };\n      renderAirportMap(clientCached);\n      requestedAirportIcao = null;\n      return;\n    }",
    "    if (clientCached?.icao === icao\n      && clientCached.cache?.status !== 'preview'\n      && requestSerial === mapRequestSerial) {\n      clientCached.cache = { ...clientCached.cache, status: 'cached', offlineReady: true };\n      renderAirportMap(clientCached);\n      requestedAirportIcao = null;\n      return;\n    }",
)
replace(
    'public/app.js',
    "      renderAirportMap(data);\n      writeClientMapCache(data).catch(() => {});",
    "      renderAirportMap(data);\n      if (data.cache?.status !== 'preview') writeClientMapCache(data).catch(() => {});",
)

# Scope label follows the active Live Traffic tab.
replace(
    'public/index.html',
    '<span class="live-traffic-scope">30 NM · MAX 40</span>',
    '<span id="live-traffic-scope" class="live-traffic-scope">120 NM · MAX 40</span>',
)
replace(
    'public/app.js',
    "  flightboardAirport: $('#flightboard-airport'),\n  flightboardTabs: [...document.querySelectorAll('[data-traffic-view]')],",
    "  flightboardAirport: $('#flightboard-airport'),\n  flightboardScope: $('#live-traffic-scope'),\n  flightboardTabs: [...document.querySelectorAll('[data-traffic-view]')],",
)
replace(
    'public/app.js',
    "  elements.flightboardAirport.textContent = airport ? `${airport} · LIVE TRAFFIC` : 'LIVE TRAFFIC';\n  elements.flightboardUpdated.textContent = integration.updatedAt ? `${t('updated')} ${formatTime(integration.updatedAt)}` : '—';",
    "  elements.flightboardAirport.textContent = airport ? `${airport} · LIVE TRAFFIC` : 'LIVE TRAFFIC';\n  const scopeNm = model.view === 'ground'\n    ? model.limits.groundRadiusNm\n    : model.view === 'arriving' ? model.limits.arrivingRadiusNm : model.limits.nearbyRadiusNm;\n  if (elements.flightboardScope) elements.flightboardScope.textContent = `${scopeNm} NM · MAX ${model.limits.maxRows}`;\n  elements.flightboardUpdated.textContent = integration.updatedAt ? `${t('updated')} ${formatTime(integration.updatedAt)}` : '—';",
)
replace(
    'public/app.js',
    "    note.textContent = `${model.hiddenRows} additional aircraft hidden · showing the 40 closest`;",
    "    note.textContent = `${model.hiddenRows} additional aircraft hidden · showing the ${model.limits.maxRows} closest`;",
)

# Regression coverage for the expanded scopes.
test_path = Path('scripts/test-live-traffic.mjs')
test = test_path.read_text(encoding='utf-8')
old = "const reportedApproach = { objectId: 6, lat: 51.33, lon: 6.80, onGround: false, groundSpeed: 190, altitudeFeet: 3500, verticalSpeedFpm: -700, state: 'approach', scheduleEnriched: true, callsign: 'KLM123' };\nconst farAway = { objectId: 5, lat: 52.5, lon: 8.5, onGround: true, groundSpeed: 0, state: 'parked', callsign: 'AIGFAR', title: 'AIGAI_B737' };"
new = "const reportedApproach = { objectId: 6, lat: 51.33, lon: 6.80, onGround: false, groundSpeed: 190, altitudeFeet: 3500, verticalSpeedFpm: -700, state: 'approach', scheduleEnriched: true, callsign: 'KLM123' };\nconst longApproach = { objectId: 7, lat: 52.3, lon: 8.0, onGround: false, groundSpeed: 220, altitudeFeet: 8000, verticalSpeedFpm: -700, state: '', callsign: 'SWR80NM', title: 'A320' };\nconst regional = { objectId: 8, lat: 52.5, lon: 9.0, onGround: false, groundSpeed: 430, altitudeFeet: 26000, verticalSpeedFpm: 0, state: 'enroute', callsign: 'BAW120NM', title: 'B737' };\nconst farAway = { objectId: 5, lat: 54.0, lon: 10.5, onGround: true, groundSpeed: 0, state: 'parked', callsign: 'AIGFAR', title: 'AIGAI_B737' };"
if test.count(old) != 1:
    raise SystemExit('scripts/test-live-traffic.mjs: fixture marker missing')
test = test.replace(old, new, 1)
old = "const model = buildLiveTrafficModel([ground, taxi, arriving, cruise, farAway], ownship, 'nearby');\nassert.equal(model.counts.ground, 2, 'far-away parked traffic must not pollute the airport ground view');\nassert.equal(model.counts.arriving, 1, 'only plausible nearby descending traffic belongs in Arriving');\nassert.equal(model.counts.nearby, 4, 'nearby view should exclude distant traffic outside 30 NM');\nassert.deepEqual(model.rows.map((entry) => entry.objectId), [1, 2, 3, 4], 'nearby rows should be distance sorted');"
new = "const model = buildLiveTrafficModel([ground, taxi, arriving, cruise, longApproach, regional, farAway], ownship, 'nearby');\nassert.equal(model.limits.arrivingRadiusNm, 80);\nassert.equal(model.limits.nearbyRadiusNm, 120);\nassert.equal(model.counts.ground, 2, 'far-away parked traffic must not pollute the airport ground view');\nassert.equal(model.counts.arriving, 2, 'Arriving should include plausible descending traffic out to 80 NM');\nassert.equal(model.counts.nearby, 6, 'Nearby should include regional traffic out to 120 NM');\nassert.deepEqual(model.rows.map((entry) => entry.objectId), [1, 2, 3, 4, 7, 8], 'nearby rows should be distance sorted');"
if test.count(old) != 1:
    raise SystemExit('scripts/test-live-traffic.mjs: nearby assertion marker missing')
test = test.replace(old, new, 1)
old = "const arrivingModel = buildLiveTrafficModel([ground, taxi, arriving, cruise], ownship, 'arriving');\nassert.deepEqual(arrivingModel.rows.map((entry) => entry.objectId), [3]);"
new = "const arrivingModel = buildLiveTrafficModel([ground, taxi, arriving, cruise, longApproach], ownship, 'arriving');\nassert.deepEqual(arrivingModel.rows.map((entry) => entry.objectId), [3, 7]);"
if test.count(old) != 1:
    raise SystemExit('scripts/test-live-traffic.mjs: arriving assertion marker missing')
test_path.write_text(test.replace(old, new, 1), encoding='utf-8')

# Release notes.
changelog = Path('CHANGELOG.md')
text = changelog.read_text(encoding='utf-8')
marker = '# Flight Deck EFB changelog\n\n'
if '## 1.7.5 — Traffic & Taxi Recovery' not in text:
    section = (
        '## 1.7.5 — Traffic & Taxi Recovery\n\n'
        '- Expanded Live Traffic to **Arriving 80 NM** and **Nearby 120 NM** while Ground remains 8 NM; the active tab now shows its actual scope.\n'
        '- Restored the documented maximum SimConnect discovery radius of **200 km (~108 NM)**. The 120 NM Nearby filter is retained as the UI target, while direct SimConnect visibility remains capped by the simulator API.\n'
        '- Broadened injected-traffic discovery to accept **PassiveAircraft / aircraft-style categories**, improving compatibility with SayIntentions Living World and other injectors that are visible in MSFS but were filtered out before detail reads.\n'
        '- Fixed Taxi Navigation getting stuck on a **runway-only preview**: preview maps are no longer persisted as complete browser maps, existing poisoned preview caches self-heal, and the host waits longer for OSM/Overpass geometry when MSFS facility data arrives first.\n'
        '- Fixed **New Flight** immediately re-importing the just-finished taxi route/session, which could make the red ROUTE / POSITION warning reappear and leave guidance unusable.\n'
        '- Taxi/map fixes are implemented independently with documented MSFS facility data, OpenStreetMap/Overpass and OurAirports; no TaxiNow code, assets or protected implementation were reused.\n\n'
    )
    if marker not in text:
        raise SystemExit('CHANGELOG header marker missing')
    changelog.write_text(text.replace(marker, marker + section, 1), encoding='utf-8')

readme = Path('README.md')
r = readme.read_text(encoding='utf-8')
r = r.replace('**Current release: 1.7.4 — Honest Live Traffic**', '**Current release: 1.7.5 — Traffic & Taxi Recovery**', 1)
r = r.replace('## 1.7.4 highlights', '## 1.7.5 highlights', 1)
r = r.replace(
    '- **Local scope:** Ground is limited to 8 NM, Arriving to 25 NM and Nearby to 30 NM; at most the closest 40 aircraft are rendered. The underlying SimConnect discovery radius is reduced from 200 km to 60 km.',
    '- **Wider Live Traffic scope:** Ground remains 8 NM, Arriving is 80 NM and Nearby is 120 NM; at most the closest 40 aircraft are rendered. Direct SimConnect discovery uses the documented 200 km (~108 NM) maximum, so the last ~12 NM of the Nearby UI scope can only be populated by another compatible source.',
    1,
)
r = r.replace('Flight-Deck-EFB-Setup-1.7.4.exe', 'Flight-Deck-EFB-Setup-1.7.5.exe', 1)
readme.write_text(r, encoding='utf-8')

# Cache-bust web assets and align embedded host version.
for filename in ['public/index.html', 'public/app.js', 'public/service-worker.js', 'src/server.mjs']:
    p = Path(filename)
    s = p.read_text(encoding='utf-8')
    p.write_text(s.replace('1.7.4', '1.7.5'), encoding='utf-8')
