from pathlib import Path
import json
import re

BRANCH_VERSION = '1.7.4'


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=0):
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'bad regex count for {label}: {count}')
    return new


def update(path, transform):
    p = Path(path)
    old = p.read_text(encoding='utf-8')
    new = transform(old)
    if new == old:
        raise SystemExit(f'no changes for {path}')
    p.write_text(new, encoding='utf-8')


# package.json
update('package.json', lambda text: json.dumps({
    **json.loads(text),
    'version': BRANCH_VERSION,
    'description': 'Flight Deck EFB for MSFS with honest local Live Traffic, taxi guidance, native EFB bridging, flight intelligence, aircraft adapters, GSX and guarded simulator integrations.'
}, indent=2, ensure_ascii=False) + '\n')

# service worker
update('public/service-worker.js', lambda text: text.replace('flight-deck-efb-v173', 'flight-deck-efb-v174').replace('1.7.3', '1.7.4').replace("  '/app.js?v=1.7.4',", "  '/app.js?v=1.7.4',\n  '/live-traffic.js?v=1.7.4',"))

# Reduce traffic discovery bubble to the UI's local traffic scope.
for filename in ['src/simconnect-client.mjs', 'src/injected-traffic-client.mjs']:
    update(filename, lambda text: text.replace('const TRAFFIC_RADIUS_METERS = 200_000;', 'const TRAFFIC_RADIUS_METERS = 60_000;'))

# Embedded server version
update('src/server.mjs', lambda text: re.sub(r"const APP_VERSION = '[^']+';", "const APP_VERSION = '1.7.4';", text, count=1))

# index.html

def patch_index(text):
    text = text.replace('1.7.3', '1.7.4')
    pattern = r'''        <section class="efb-page" data-page="flightboard" hidden>.*?        </section>\n\n        <section class="efb-page" data-page="online"'''
    replacement = '''        <section class="efb-page live-traffic-page" data-page="flightboard" hidden>
          <header class="page-heading live-traffic-heading"><div><small>SIMCONNECT · LOCAL TRAFFIC</small><h1>Live Traffic</h1><p>Observed simulator traffic near your aircraft. No invented schedules, destinations or airport-board data.</p></div><span id="flightboard-status-pill" class="module-status waiting">WAITING</span></header>
          <div class="flightboard-layout live-traffic-layout">
            <article class="efb-card flightboard-card live-traffic-card">
              <header class="flightboard-toolbar live-traffic-toolbar">
                <div><small>LOCAL TRAFFIC</small><strong id="flightboard-airport">LIVE TRAFFIC</strong><span class="live-traffic-scope">30 NM · MAX 40</span></div>
                <div class="flightboard-tabs live-traffic-tabs" role="group" aria-label="Live Traffic view">
                  <button type="button" data-traffic-view="ground"><span>GROUND</span><b id="flightboard-ground-count">0</b></button>
                  <button type="button" data-traffic-view="arriving"><span>ARRIVING</span><b id="flightboard-arriving-count">0</b></button>
                  <button type="button" class="active" data-traffic-view="nearby"><span>NEARBY</span><b id="flightboard-nearby-count">0</b></button>
                </div>
                <button id="flightboard-refresh" class="secondary-card-action" type="button" data-i18n="refresh">REFRESH</button>
              </header>
              <div class="live-traffic-trust-note"><strong>WHAT THIS SHOWS</strong><span>Position, movement, aircraft identity and simulator-reported state. ARRIVING may be inferred from distance, altitude and descent when MSFS does not publish a traffic state.</span></div>
              <div class="flightboard-table live-traffic-table" role="table" aria-label="Local simulator live traffic">
                <div class="flightboard-row flightboard-head live-traffic-row" role="row"><span>TRAFFIC</span><span>AIRCRAFT</span><span>POSITION</span><span>ALT / GS</span><span>DISTANCE</span><span>STATUS</span></div>
                <div id="flightboard-list"><p class="empty-list">No local simulator traffic received yet.</p></div>
              </div>
              <footer><span id="flightboard-updated">—</span><strong>Source: SimConnect. SayIntentions Living World schedules are not exposed through a documented public traffic API.</strong></footer>
            </article>
          </div>
        </section>

        <section class="efb-page" data-page="online"'''
    text = sub_once(text, pattern, replacement, 'flightboard section', flags=re.S)
    old = '<article data-settings-panel="updates" class="efb-card settings-card update-changelog-card"><div class="section-title"><div><small>WHAT\'S NEW</small><h2>Changelog</h2></div><span>CURRENT v1.7.4</span></div><div class="update-changelog">'
    new = old + '<section><b>1.7.4</b><div><strong>Honest Live Traffic</strong><ul><li>Replaced the unreliable airport-style Flightboard with Ground / Arriving / Nearby Live Traffic.</li><li>Removed FROM/TO, ETD/ETA and Departures/Arrivals claims when the simulator does not publish a real schedule.</li><li>Reduced the simulator traffic bubble from 200 km to 60 km and limits the UI to the 40 closest relevant aircraft.</li><li>Shows distance, aircraft, position, altitude/groundspeed and whether a status is reported or inferred.</li><li>Removed external favicon-based airline logos in favor of consistent local airline-code badges.</li></ul></div></section>'
    text = replace_once(text, old, new, 'changelog card')
    return text

update('public/index.html', patch_index)

# app.js

def patch_app(text):
    text = text.replace("from './i18n.js?v=1.7.3'", "from './i18n.js?v=1.7.4'")
    text = text.replace("from './flight-phases.js?v=1.7.3'", "from './flight-phases.js?v=1.7.4'")
    import_anchor = "} from './flight-phases.js?v=1.7.4';\n"
    text = replace_once(text, import_anchor, import_anchor + "import { buildLiveTrafficModel, trafficAircraftLabel, trafficPositionLabel } from './live-traffic.js?v=1.7.4';\n", 'live traffic import')
    text = replace_once(text,
        "  flightboardList: $('#flightboard-list'),\n  flightboardUpdated: $('#flightboard-updated'),",
        "  flightboardList: $('#flightboard-list'),\n  flightboardUpdated: $('#flightboard-updated'),\n  flightboardGroundCount: $('#flightboard-ground-count'),\n  flightboardArrivingCount: $('#flightboard-arriving-count'),\n  flightboardNearbyCount: $('#flightboard-nearby-count'),",
        'live traffic count elements')
    text = text.replace("let trafficBoardView = 'all';", "let trafficBoardView = 'nearby';")

    pattern = r"function normalizeFlightboardCallsign\(value = ''\) \{.*?\n\}\n\nfunction renderHomeNextStep\(state\) \{"
    replacement = r'''const LIVE_TRAFFIC_AIRLINES = {
  AFR: ['AF', 'Air France'], AEE: ['A3', 'Aegean'], AUA: ['OS', 'Austrian'], BAW: ['BA', 'British Airways'], BEL: ['SN', 'Brussels Airlines'],
  BTI: ['BT', 'airBaltic'], CFG: ['DE', 'Condor'], DLH: ['LH', 'Lufthansa'], EIN: ['EI', 'Aer Lingus'], EWG: ['EW', 'Eurowings'],
  EZY: ['U2', 'easyJet'], FIN: ['AY', 'Finnair'], ICE: ['FI', 'Icelandair'], KLM: ['KL', 'KLM'], LOT: ['LO', 'LOT'], NSZ: ['D8', 'Norwegian'],
  QTR: ['QR', 'Qatar Airways'], RYR: ['FR', 'Ryanair'], SAS: ['SK', 'SAS'], SWR: ['LX', 'SWISS'], TAP: ['TP', 'TAP'], THY: ['TK', 'Turkish Airlines'],
  TUI: ['X3', 'TUI fly'], UAE: ['EK', 'Emirates'], VLG: ['VY', 'Vueling'], WZZ: ['W6', 'Wizz Air'],
};

const LIVE_TRAFFIC_AIRLINE_NAMES = [
  [/air\s*baltic/i, ['BT', 'airBaltic']], [/lufthansa/i, ['LH', 'Lufthansa']], [/british airways|speedbird/i, ['BA', 'British Airways']],
  [/eurowings/i, ['EW', 'Eurowings']], [/condor/i, ['DE', 'Condor']], [/air france/i, ['AF', 'Air France']], [/easyjet/i, ['U2', 'easyJet']],
  [/austrian/i, ['OS', 'Austrian']], [/aer lingus/i, ['EI', 'Aer Lingus']], [/aegean/i, ['A3', 'Aegean']], [/klm/i, ['KL', 'KLM']],
];

function liveTrafficAirline(entry = {}) {
  const callsign = String(entry.callsign || entry.atcId || '').trim().toUpperCase();
  const icao = callsign.match(/^([A-Z]{3})/)?.[1];
  if (icao && LIVE_TRAFFIC_AIRLINES[icao]) return LIVE_TRAFFIC_AIRLINES[icao];
  const haystack = [entry.airline, entry.title, entry.callsign].filter(Boolean).join(' ');
  return LIVE_TRAFFIC_AIRLINE_NAMES.find(([pattern]) => pattern.test(haystack))?.[1]
    || [String(entry.airline || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'AI', entry.airline || 'Simulator traffic'];
}

function liveTrafficBadge(entry = {}) {
  const [code, name] = liveTrafficAirline(entry);
  return `<span class="traffic-airline-logo live-traffic-airline-badge" title="${escapeHtml(name)}"><b>${escapeHtml(code || 'AI')}</b></span>`;
}

function currentFlightboardAirport(state) {
  const flight = state.flight || {};
  const phase = resolveFlightPhase(state);
  const arrivalPhase = ['descent', 'approach', 'landing', 'taxi-in', 'postflight'].includes(phase);
  return String(
    flight.currentAirport
    || state.planning?.selectedAirport?.icao
    || (arrivalPhase ? flight.destination : flight.origin)
    || flight.destination
    || flight.origin
    || '',
  ).trim().toUpperCase();
}

function liveTrafficStatusClass(kind = '') {
  if (['arriving', 'landing', 'climb', 'enroute', 'airborne'].includes(kind)) return 'airborne';
  if (['taxi', 'pushback'].includes(kind)) return 'ground';
  if (['parking', 'preflight'].includes(kind)) return 'parked';
  return 'unknown';
}

function renderFlightboard(state) {
  const integration = state.integrations?.simTraffic || {};
  const simulatorOnline = ['connected', 'demo'].includes(state.connections?.simConnect?.status);
  const entries = Array.isArray(integration.aircraft) ? integration.aircraft : [];
  const model = buildLiveTrafficModel(entries, state.aircraft || {}, trafficBoardView);
  const airport = currentFlightboardAirport(state);

  elements.flightboardStatusPill.className = `module-status ${simulatorOnline ? 'connected' : 'waiting'}`;
  elements.flightboardStatusPill.textContent = simulatorOnline ? `${model.counts.nearby} LIVE` : 'SIM OFFLINE';
  elements.flightboardAirport.textContent = airport ? `${airport} · LIVE TRAFFIC` : 'LIVE TRAFFIC';
  elements.flightboardUpdated.textContent = integration.updatedAt ? `${t('updated')} ${formatTime(integration.updatedAt)}` : '—';
  elements.flightboardRefresh.disabled = !simulatorOnline;
  if (elements.flightboardGroundCount) elements.flightboardGroundCount.textContent = String(model.counts.ground);
  if (elements.flightboardArrivingCount) elements.flightboardArrivingCount.textContent = String(model.counts.arriving);
  if (elements.flightboardNearbyCount) elements.flightboardNearbyCount.textContent = String(model.counts.nearby);
  for (const button of elements.flightboardTabs) button.classList.toggle('active', button.dataset.trafficView === model.view);

  elements.flightboardList.replaceChildren();
  for (const entry of model.rows) {
    const status = entry.liveStatus || {};
    const [airlineCode, airlineName] = liveTrafficAirline(entry);
    const altitude = Number(entry.altitudeFeet);
    const groundSpeed = Number(entry.groundSpeed);
    const distance = Number(status.distanceNm);
    const row = document.createElement('div');
    row.className = 'flightboard-row live-traffic-row';
    row.setAttribute('role', 'row');
    row.innerHTML = `<span class="flightboard-flight">${liveTrafficBadge(entry)}<span><strong>${escapeHtml(entry.callsign || entry.atcId || `AI-${entry.objectId}`)}</strong><small>${escapeHtml(airlineName || airlineCode || 'Simulator traffic')}</small></span></span><b>${escapeHtml(trafficAircraftLabel(entry))}</b><span class="live-traffic-position"><strong>${escapeHtml(trafficPositionLabel(entry))}</strong><small>${escapeHtml(entry.currentAirport || (entry.onGround ? 'GROUND' : 'AIRBORNE'))}</small></span><span class="live-traffic-motion"><strong>${Number.isFinite(altitude) && !entry.onGround ? `${Math.round(altitude).toLocaleString(localeFor(currentLanguage))} ft` : 'GROUND'}</strong><small>${Number.isFinite(groundSpeed) ? `${Math.round(groundSpeed)} kt` : '—'}</small></span><b class="live-traffic-distance">${Number.isFinite(distance) ? `${distance.toFixed(distance < 10 ? 1 : 0)} NM` : '—'}</b><em class="traffic-status ${escapeHtml(liveTrafficStatusClass(status.kind))}"><span>${escapeHtml(status.label || 'UNKNOWN')}</span><small>${status.inferred ? 'INFERRED' : 'REPORTED'}</small></em>`;
    elements.flightboardList.append(row);
  }
  if (!model.rows.length) {
    const label = model.view === 'ground' ? 'ground traffic' : model.view === 'arriving' ? 'arriving traffic' : 'nearby traffic';
    const message = simulatorOnline ? `No ${label} observed in the current local scope.` : t('startMsfsForTraffic');
    elements.flightboardList.innerHTML = `<p class="empty-list">${escapeHtml(message)}</p>`;
  }
  if (model.hiddenRows > 0) {
    const note = document.createElement('p');
    note.className = 'live-traffic-more';
    note.textContent = `${model.hiddenRows} additional aircraft hidden · showing the 40 closest`;
    elements.flightboardList.append(note);
  }
}

function renderHomeNextStep(state) {'''
    text = sub_once(text, pattern, replacement, 'replace flightboard logic', flags=re.S)
    text = text.replace("document.documentElement.dataset.appVersion || '1.7.3'", "document.documentElement.dataset.appVersion || '1.7.4'")
    return text

update('public/app.js', patch_app)

# CSS: append explicit Live Traffic presentation.
def patch_css(text):
    return text + r'''

/* 1.7.4 · Honest Live Traffic */
.live-traffic-layout { display: block; }
.live-traffic-card { overflow: hidden; }
.live-traffic-toolbar { grid-template-columns: minmax(230px, 1fr) auto auto; align-items: center; gap: 14px; }
.live-traffic-toolbar > div:first-child { display: grid; gap: 3px; }
.live-traffic-scope { color: var(--muted); font-size: 8px; font-weight: 800; letter-spacing: .08em; }
.live-traffic-tabs button { display: inline-flex; align-items: center; gap: 7px; }
.live-traffic-tabs button b { display: grid; place-items: center; min-width: 23px; height: 20px; padding: 0 5px; border-radius: 999px; background: rgba(151,193,216,.1); color: currentColor; font-size: 8px; }
.live-traffic-trust-note { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px; padding: 9px 18px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: rgba(45,184,255,.035); color: var(--muted); font-size: 9px; line-height: 1.45; }
.live-traffic-trust-note strong { color: #8ac9e4; font-size: 8px; letter-spacing: .09em; white-space: nowrap; }
.live-traffic-row { grid-template-columns: minmax(210px, 1.4fr) minmax(95px, .7fr) minmax(120px, .85fr) minmax(120px, .8fr) minmax(90px, .55fr) minmax(120px, .75fr); min-width: 820px; }
.live-traffic-airline-badge { width: 38px; height: 38px; flex: 0 0 38px; border-radius: 9px; background: linear-gradient(145deg, rgba(45,184,255,.12), rgba(22,227,212,.06)); }
.live-traffic-airline-badge b { font-family: inherit; font-size: 10px; letter-spacing: .04em; }
.live-traffic-position,
.live-traffic-motion { display: grid; gap: 2px; }
.live-traffic-position strong,
.live-traffic-motion strong { overflow: hidden; color: var(--text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.live-traffic-position small,
.live-traffic-motion small { color: var(--muted); font-size: 9px; }
.live-traffic-distance { font-size: 12px !important; }
.live-traffic-row .traffic-status { display: grid; gap: 2px; }
.live-traffic-row .traffic-status small { color: inherit; font-size: 7px; font-weight: 800; letter-spacing: .08em; opacity: .68; }
.live-traffic-more { margin: 0; padding: 12px 18px; color: var(--muted); font-size: 9px; text-align: center; }
html[data-theme="light"] .live-traffic-trust-note { background: rgba(45,184,255,.045); }
html[data-theme="light"] .live-traffic-position strong,
html[data-theme="light"] .live-traffic-motion strong { color: #17313d; }
@media (max-width: 900px) {
  .live-traffic-toolbar { grid-template-columns: 1fr auto; }
  .live-traffic-tabs { grid-column: 1 / -1; order: 3; overflow-x: auto; }
  .live-traffic-trust-note { grid-template-columns: 1fr; }
}
'''
update('public/styles.css', patch_css)

# i18n overrides. Keep common aviation terminology in English for German UI.
def patch_i18n(text):
    addition = r'''

const v174Translations = {
  en: {
    flightboard: 'Live Traffic',
    flightboardSummary: 'Observed local simulator traffic',
    flightboardIntro: 'Observed simulator traffic near your aircraft. No invented schedules or destinations.',
    trafficSourceNote: 'Source: SimConnect. SayIntentions Living World schedules are not exposed through a documented public traffic API.',
  },
  de: {
    flightboard: 'Live Traffic',
    flightboardSummary: 'Beobachteter lokaler Simulator-Traffic',
    flightboardIntro: 'Beobachteter Traffic in der Nähe deines Flugzeugs – ohne erfundene Schedules oder Destinations.',
    trafficSourceNote: 'Quelle: SimConnect. SayIntentions Living World Schedules sind nicht über eine dokumentierte öffentliche Traffic-API verfügbar.',
    trafficParked: 'PARKING', trafficPreparing: 'PREFLIGHT', trafficPushback: 'PUSHBACK', trafficTaxiOut: 'TAXI OUT', trafficDeparting: 'DEPARTURE', trafficEnroute: 'ENROUTE', trafficLanding: 'LANDING', trafficRollout: 'ROLLOUT', trafficTaxiIn: 'TAXI IN', trafficTaxi: 'TAXI', trafficUnknown: 'UNKNOWN',
  },
};
for (const [language, additions] of Object.entries(v174Translations)) Object.assign(dictionaries[language] || dictionaries.en, additions);
'''
    return text + addition
update('public/i18n.js', patch_i18n)

# Changelog
def patch_changelog(text):
    entry = '''## 1.7.4 — Honest Live Traffic\n\n- Replaced the airport-style Flightboard with an honest **Live Traffic** workspace: **Ground / Arriving / Nearby**.\n- Removed FROM/TO, ETD/ETA and Departures/Arrivals presentation for simulator objects that do not publish a real schedule. Flight Deck no longer fills schedule gaps with airport heuristics.\n- Live Traffic now prioritizes directly observed data: callsign/operator identity, aircraft type, position, altitude, groundspeed, distance and simulator-reported traffic state.\n- When MSFS does not publish a traffic state, movement-based statuses such as Parking, Taxi and Arriving are explicitly marked **INFERRED** rather than presented as authoritative schedule data.\n- Reduced both SimConnect traffic discovery bubbles from 200 km to 60 km and limits the UI to the closest 40 relevant aircraft; Ground uses an 8 NM scope, Arriving 25 NM and Nearby 30 NM.\n- Removed external website-favicon airline images and replaced them with deterministic local airline-code badges.\n- Added Live Traffic regression tests covering distance filtering, Ground/Arriving classification and status inference.\n- Clarified in-product and README documentation that SayIntentions Living World internally uses real-world schedules/routes/gates, but does not currently expose a documented public Living World traffic board/API to Flight Deck.\n\n'''
    marker = '# Flight Deck EFB changelog\n\n'
    return replace_once(text, marker, marker + entry, 'changelog marker')
update('CHANGELOG.md', patch_changelog)

# README: current release + traffic section + install version.
def patch_readme(text):
    text = text.replace('**Current release: 1.7.3 — Native EFB Community Package Builder**', '**Current release: 1.7.4 — Honest Live Traffic**')
    highlights_pattern = r"## 1\.7\.3 highlights\n\n.*?\n## 1\.7\.0 highlights"
    highlights = '''## 1.7.4 highlights

- **Live Traffic instead of fake FIDS:** the simulator traffic app now shows Ground / Arriving / Nearby based on observable MSFS traffic, not an airport departures/arrivals board that implies unavailable schedules.
- **No invented FROM/TO:** route/schedule fields are no longer presented unless another feature explicitly has a real flight plan. SayIntentions Living World knows its own schedules internally, but does not expose a documented public Living World traffic-list API to Flight Deck.
- **Local scope:** Ground is limited to 8 NM, Arriving to 25 NM and Nearby to 30 NM; at most the closest 40 aircraft are rendered. The underlying SimConnect discovery radius is reduced from 200 km to 60 km.
- **Honest status provenance:** simulator-published states are marked REPORTED; movement-based Parking/Taxi/Arriving classifications are marked INFERRED.
- **Stable airline identity:** local airline-code badges replace unreliable website-favicon images.

## 1.7.0 highlights'''
    text = sub_once(text, highlights_pattern, highlights, 'readme highlights', flags=re.S)
    old = '''### ATC, traffic and weather
- SayIntentions SAPI flight/parking/weather/frequency/communications integration with a deduplicated per-flight message history.
- Read-only VATSIM/IVAO controller, ATIS and relevant-pilot data.
- SimConnect traffic plus an all-object fallback for compatible injected/live/add-on traffic.
- AviationWeather.gov METAR/TAF fallback.
- Optional Little Navmap local WebAPI cross-check and airport metadata enrichment.'''
    new = '''### ATC, Live Traffic and weather
- SayIntentions SAPI flight/parking/weather/frequency/communications integration with a deduplicated per-flight message history.
- **Live Traffic:** local SimConnect traffic in Ground / Arriving / Nearby views using observable position/movement/identity data. Flight Deck does not present a fake airport schedule when injected objects do not expose FROM/TO/ETD/ETA.
- SayIntentions Living World is documented by SayIntentions as using real-world schedules/routes/gates internally; its complete Living World flight list is not currently exposed through a documented public traffic-board API to Flight Deck.
- Read-only VATSIM/IVAO controller, ATIS and relevant-pilot data.
- SimConnect primary traffic plus an all-object fallback for compatible injected/live/add-on traffic.
- AviationWeather.gov METAR/TAF fallback.
- Optional Little Navmap local WebAPI cross-check and airport metadata enrichment.'''
    text = replace_once(text, old, new, 'readme traffic section')
    text = text.replace('Flight-Deck-EFB-Setup-1.7.3.exe', 'Flight-Deck-EFB-Setup-1.7.4.exe')
    return text
update('README.md', patch_readme)

# Release CI must verify the permanent Live Traffic contract.
def patch_release(text):
    text = replace_once(text, '          node --check public/flight-phases.js\n          node --check public/app.js', '          node --check public/flight-phases.js\n          node --check public/live-traffic.js\n          node --check public/app.js', 'release live traffic syntax')
    text = replace_once(text, '          node scripts/verify-msfs-efb-builder.mjs\n', '          node scripts/verify-msfs-efb-builder.mjs\n          node scripts/test-live-traffic.mjs\n', 'release live traffic test')
    return text
update('.github/workflows/release.yml', patch_release)
