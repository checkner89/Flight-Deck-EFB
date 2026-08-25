from pathlib import Path
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# --- public/app.js -----------------------------------------------------------
app_path = Path('public/app.js')
app = app_path.read_text(encoding='utf-8')

# Taxi follow remains active on module open / route updates.
app = replace_once(app,
"""  if (taxiActive) {
    setTimeout(() => {
      map.invalidateSize();
      fitRoute();
    }, 60);
  }
""",
"""  if (taxiActive) {
    followAircraft = true;
    syncFollowButton();
    setTimeout(() => {
      map.invalidateSize();
      const aircraft = latestState?.aircraft;
      if (aircraft && Number.isFinite(aircraft.lat) && Number.isFinite(aircraft.lon)) {
        map.setView([aircraft.lat, aircraft.lon], Math.max(map.getZoom(), 17.5), { animate: false });
        renderAircraft(aircraft);
      } else {
        fitRoute({ disableFollow: false });
      }
    }, 100);
  }
""", 'taxi module follow')
app = replace_once(app, "  fitRoute();\n}\n\nfunction escapeHtml", "  fitRoute({ disableFollow: false });\n}\n\nfunction escapeHtml", 'render path follow')
app = replace_once(app, "function fitRoute() {\n", "function fitRoute({ disableFollow = true } = {}) {\n", 'fit route signature')
app = replace_once(app,
"""  if (coordinates.length >= 2) {
    followAircraft = false;
    syncFollowButton();
    map.fitBounds(coordinates, { padding: [100, 100], maxZoom: 18.6, animate: true });
""",
"""  if (coordinates.length >= 2) {
    if (disableFollow) {
      followAircraft = false;
      syncFollowButton();
    }
    if (!followAircraft || !latestState?.aircraft || !Number.isFinite(latestState.aircraft.lat) || !Number.isFinite(latestState.aircraft.lon)) {
      map.fitBounds(coordinates, { padding: [100, 100], maxZoom: 18.6, animate: true });
    }
""", 'fit route body')

# Aircraft / EFB submenu bindings.
app = replace_once(app,
"  atcTabButtons: [...document.querySelectorAll('[data-atc-tab]')],\n",
"  atcTabButtons: [...document.querySelectorAll('[data-atc-tab]')],\n  aircraftViewButtons: [...document.querySelectorAll('[data-aircraft-view-button]')],\n",
'aircraft buttons binding')
app = replace_once(app,
"function setFlightHubTab(tab) {",
"""function setAircraftView(view = 'fenix') {
  const selected = ['fenix', 'pmdg', 'status'].includes(view) ? view : 'fenix';
  for (const button of elements.aircraftViewButtons || []) button.classList.toggle('active', button.dataset.aircraftViewButton === selected);
  for (const panel of document.querySelectorAll('[data-aircraft-view]')) panel.hidden = panel.dataset.aircraftView !== selected;
}

function setFlightHubTab(tab) {""",
'aircraft view function')
app = replace_once(app,
"for (const button of elements.siMessageViewButtons) {",
"""for (const button of elements.aircraftViewButtons || []) {
  button.addEventListener('click', () => setAircraftView(button.dataset.aircraftViewButton));
}
setAircraftView('fenix');
for (const button of elements.siMessageViewButtons) {""",
'aircraft tab listeners')

# Flightboard: merge online network pilot route data by callsign when available.
app = replace_once(app,
"function currentFlightboardAirport(state) {",
"""function normalizeFlightboardCallsign(value = '') {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function enrichTrafficFromKnownFlightPlans(entries, state) {
  const onlinePilots = Array.isArray(state?.integrations?.onlineNetworks?.pilots) ? state.integrations.onlineNetworks.pilots : [];
  const onlineByCallsign = new Map(onlinePilots.map((pilot) => [normalizeFlightboardCallsign(pilot.callsign), pilot]));
  return entries.map((entry) => {
    const pilot = onlineByCallsign.get(normalizeFlightboardCallsign(entry.callsign || entry.atcId));
    if (!pilot) return entry;
    return {
      ...entry,
      origin: entry.origin || pilot.departure || '',
      destination: entry.destination || pilot.arrival || '',
      airline: entry.airline || pilot.name || '',
      route: entry.route || pilot.route || '',
    };
  });
}

function currentFlightboardAirport(state) {""",
'flightboard enrichment helper')

# Replace airline rendering with reliable local badge + optional online favicon.
start = app.index('const AIRLINE_IATA_BY_ICAO = {')
end = app.index('function trafficRouteFields(entry = {}) {', start)
airline_block = r'''const AIRLINE_META_BY_ICAO = {
  BTI: ['BT', 'airBaltic', 'airbaltic.com'], DLH: ['LH', 'Lufthansa', 'lufthansa.com'], BAW: ['BA', 'British Airways', 'britishairways.com'],
  RYR: ['FR', 'Ryanair', 'ryanair.com'], EZY: ['U2', 'easyJet', 'easyjet.com'], KLM: ['KL', 'KLM', 'klm.com'], AFR: ['AF', 'Air France', 'airfrance.com'],
  TAP: ['TP', 'TAP Air Portugal', 'flytap.com'], IBE: ['IB', 'Iberia', 'iberia.com'], UAE: ['EK', 'Emirates', 'emirates.com'], QTR: ['QR', 'Qatar Airways', 'qatarairways.com'],
  THY: ['TK', 'Turkish Airlines', 'turkishairlines.com'], SWR: ['LX', 'SWISS', 'swiss.com'], AUA: ['OS', 'Austrian', 'austrian.com'], BEL: ['SN', 'Brussels Airlines', 'brusselsairlines.com'],
  SAS: ['SK', 'SAS', 'flysas.com'], FIN: ['AY', 'Finnair', 'finnair.com'], EIN: ['EI', 'Aer Lingus', 'aerlingus.com'], WZZ: ['W6', 'Wizz Air', 'wizzair.com'],
  VLG: ['VY', 'Vueling', 'vueling.com'], CFG: ['DE', 'Condor', 'condor.com'], EWG: ['EW', 'Eurowings', 'eurowings.com'], TUI: ['X3', 'TUI fly', 'tuifly.com'],
  AEE: ['A3', 'Aegean', 'aegeanair.com'], LOT: ['LO', 'LOT', 'lot.com'], DAL: ['DL', 'Delta', 'delta.com'], UAL: ['UA', 'United', 'united.com'],
  AAL: ['AA', 'American', 'aa.com'], ACA: ['AC', 'Air Canada', 'aircanada.com'], JBU: ['B6', 'JetBlue', 'jetblue.com'], VIR: ['VS', 'Virgin Atlantic', 'virginatlantic.com'],
  SIA: ['SQ', 'Singapore Airlines', 'singaporeair.com'], CPA: ['CX', 'Cathay Pacific', 'cathaypacific.com'], ANA: ['NH', 'ANA', 'ana.co.jp'], JAL: ['JL', 'Japan Airlines', 'jal.com'],
  KAL: ['KE', 'Korean Air', 'koreanair.com'], ETD: ['EY', 'Etihad', 'etihad.com'], QFA: ['QF', 'Qantas', 'qantas.com'], ANZ: ['NZ', 'Air New Zealand', 'airnewzealand.com'], ICE: ['FI', 'Icelandair', 'icelandair.com'], NSZ: ['D8', 'Norwegian', 'norwegian.com'],
};
const AIRLINE_META_BY_NAME = [
  [/air\s*baltic/i, ['BT', 'airBaltic', 'airbaltic.com']], [/lufthansa/i, ['LH', 'Lufthansa', 'lufthansa.com']], [/speedbird|british airways/i, ['BA', 'British Airways', 'britishairways.com']],
  [/ryanair/i, ['FR', 'Ryanair', 'ryanair.com']], [/easyjet/i, ['U2', 'easyJet', 'easyjet.com']], [/klm/i, ['KL', 'KLM', 'klm.com']], [/air france/i, ['AF', 'Air France', 'airfrance.com']],
  [/condor/i, ['DE', 'Condor', 'condor.com']], [/eurowings/i, ['EW', 'Eurowings', 'eurowings.com']], [/wizz/i, ['W6', 'Wizz Air', 'wizzair.com']],
];

function trafficAirlineMeta(entry = {}) {
  const callsign = String(entry.callsign || entry.atcId || '').trim().toUpperCase();
  const icao = callsign.match(/^([A-Z]{3})/)?.[1];
  if (icao && AIRLINE_META_BY_ICAO[icao]) return AIRLINE_META_BY_ICAO[icao];
  const text = [entry.airline, entry.title, entry.callsign].filter(Boolean).join(' ');
  return AIRLINE_META_BY_NAME.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function trafficAirlineLogo(entry = {}) {
  const meta = trafficAirlineMeta(entry);
  const fallback = meta?.[0] || String(entry.airline || entry.callsign || 'AI').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'AI';
  const name = meta?.[1] || entry.airline || 'Airline';
  const domain = meta?.[2];
  const image = domain ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64" alt="${escapeHtml(name)}" loading="lazy" referrerpolicy="no-referrer">` : '';
  return `<span class="traffic-airline-logo" title="${escapeHtml(name)}">${image}<b>${escapeHtml(fallback)}</b></span>`;
}

'''
app = app[:start] + airline_block + app[end:]

# Better route fallback and view classification.
app = replace_once(app,
"""  if (!origin && current && /startup|preflight|clearance|push|taxi out|takeoff|depart/.test(state)) origin = current;
  if (!destination && current && /landing|approach|rollout|taxi in/.test(state)) destination = current;
  return { origin: origin || '—', destination: destination || '—' };
""",
"""  if (!origin && current && /startup|preflight|clearance|push|taxi out|takeoff|depart|taxi/.test(state)) origin = current;
  if (!destination && current && /landing|approach|rollout|taxi in/.test(state)) destination = current;
  if (!origin && entry.onGround && current) origin = current;
  return { origin: origin || '—', destination: destination || '—' };
""",
'route fallback')
app = replace_once(app,
"  const all = Array.isArray(integration.aircraft) ? integration.aircraft : [];\n",
"  const all = enrichTrafficFromKnownFlightPlans(Array.isArray(integration.aircraft) ? integration.aircraft : [], state);\n",
'flightboard enriched collection')
app = replace_once(app,
"""  if (trafficBoardView === 'departures') {
    return String(entry.origin || '').toUpperCase() === airport
      || /startup|preflight|clearance|push|taxi out|takeoff|depart/.test(state);
  }
  return String(entry.destination || '').toUpperCase() === airport
    || /landing|approach|rollout|taxi in/.test(state);
""",
"""  if (trafficBoardView === 'departures') {
    return String(entry.origin || '').toUpperCase() === airport
      || (entry.onGround && String(entry.currentAirport || '').toUpperCase() === airport && !/landing|rollout|taxi in/.test(state))
      || /startup|preflight|clearance|push|taxi out|takeoff|depart/.test(state);
  }
  return String(entry.destination || '').toUpperCase() === airport
    || (!entry.onGround && /landing|approach/.test(state))
    || /landing|approach|rollout|taxi in/.test(state);
""",
'flightboard filters')

app_path.write_text(app, encoding='utf-8')

# --- public/index.html -------------------------------------------------------
index_path = Path('public/index.html')
html = index_path.read_text(encoding='utf-8')
start = html.index('        <section class="efb-page fenix-page" data-page="fenix" hidden>')
end = html.index('        <section class="efb-page" data-page="automations" hidden>', start)
replacement = '''        <section class="efb-page fenix-page" data-page="fenix" hidden>
          <header class="page-heading aircraft-page-heading"><div><small>AIRCRAFT-SPECIFIC CONNECTORS</small><h1>Aircraft &amp; EFB</h1><p>Fenix Remote EFB and aircraft-specific adapters in one workspace.</p></div><span id="aircraft-adapter-status" class="module-status waiting">WAITING</span></header>
          <nav class="floating-section-nav aircraft-subnav" aria-label="Aircraft integration"><button type="button" class="active" data-aircraft-view-button="fenix">FENIX EFB</button><button type="button" data-aircraft-view-button="pmdg">PMDG</button><button type="button" data-aircraft-view-button="status">ADAPTER STATUS</button></nav>
          <div class="aircraft-view-stack">
            <section class="aircraft-view fenix-efb-view" data-aircraft-view="fenix">
              <article class="efb-card fenix-connect-strip"><div class="fenix-connect-main"><div><small>FENIX A319 / A320 / A321</small><h2>Fenix Remote EFB</h2><p id="fenix-detail">Load a Fenix A32X flight first. The official Remote EFB is then available on the PC.</p></div><span id="fenix-status-pill" class="module-status waiting">NOT CHECKED</span></div><div class="fenix-connect-actions"><div class="inline-form"><input id="fenix-url" inputmode="url" value="http://127.0.0.1:8083/" aria-label="Fenix Remote EFB URL"><button id="fenix-connect" class="primary-card-action" type="button">CONNECT</button></div><button id="fenix-embed" class="secondary-card-action" type="button" disabled>SHOW HERE</button><a id="fenix-open" class="secondary-card-action external-action" href="http://127.0.0.1:8083/" target="_blank" rel="noreferrer">OPEN SEPARATELY</a></div></article>
              <article class="efb-card fenix-frame-card fenix-frame-full"><div class="fenix-frame-placeholder" id="fenix-placeholder"><strong>FENIX REMOTE EFB</strong><span>Connect first, then display the official EFB here.</span></div><iframe id="fenix-frame" title="Fenix Remote EFB" sandbox="allow-forms allow-scripts allow-same-origin allow-popups" hidden></iframe></article>
            </section>
            <section class="aircraft-view" data-aircraft-view="pmdg" hidden><article class="efb-card pmdg-adapter-card"><div class="section-title"><div><small>LOCAL SDK DISCOVERY</small><h2>PMDG Adapter</h2></div><span id="pmdg-status-pill" class="module-status waiting">NOT DETECTED</span></div><p>Flight Deck reads only the locally installed PMDG SDK header and derives the available event IDs. SDK content is not shipped with Flight Deck.</p><div class="bridge-facts"><span><small>FAMILY</small><b id="pmdg-family">—</b></span><span><small>SDK</small><b id="pmdg-sdk">—</b></span><span><small>DATA BROADCAST</small><b id="pmdg-broadcast">—</b></span><span><small>CONTROLS</small><b id="pmdg-controls">0</b></span></div></article></section>
            <section class="aircraft-view" data-aircraft-view="status" hidden><article class="efb-card adapter-overview-card"><div class="section-title"><div><small>ACTIVE ADAPTER</small><h2 id="aircraft-adapter-model">Generic SimConnect</h2></div><span id="aircraft-adapter-source">GENERIC</span></div><p id="aircraft-adapter-detail">Waiting for loaded aircraft.</p><div class="bridge-facts"><span><small>CONTROLS</small><b id="aircraft-adapter-controls">0</b></span><span><small>SAFETY</small><b>EXPLICIT ONLY</b></span></div><button id="aircraft-adapter-refresh" class="primary-card-action" type="button">CHECK ADAPTER</button></article></section>
          </div>
        </section>

'''
html = html[:start] + replacement + html[end:]

update_anchor = '<article id="settings-updates" data-settings-panel="updates" class="efb-card settings-card update-card">'
pos = html.index(update_anchor)
close = html.index('</article>', pos) + len('</article>')
if 'update-changelog-card' not in html:
    changelog_card = '''
            <article data-settings-panel="updates" class="efb-card settings-card update-changelog-card"><div class="section-title"><div><small>WHAT'S NEW</small><h2>Changelog</h2></div><span>CURRENT v1.7.2</span></div><div class="update-changelog"><section><b>1.7.2</b><div><strong>UI, Taxi, Flightboard &amp; Native EFB Builder</strong><ul><li>Taxi keeps Follow active automatically.</li><li>Flightboard enriches traffic with available route/schedule data and airline identity.</li><li>Departures / Arrivals also classify nearby traffic when schedules are incomplete.</li><li>Fenix EFB uses a full-width workspace with submenu.</li><li>ATC/SI and Phase-2/3 cards use compact non-stretching layouts.</li><li>Native MSFS EFB Package Builder state bug fixed.</li></ul></div></section><section><b>1.7.1</b><div><strong>Native EFB Package Builder</strong><p>Build and optionally install the native MSFS 2024 EFB Community package from the local SDK.</p></div></section><section><b>1.7.0</b><div><strong>Native EFB &amp; Flight Intelligence</strong><p>Route bridge, stabilized flight phases, Turnaround Coordinator and Flight Assistant.</p></div></section></div></article>'''
    html = html[:close] + changelog_card + html[close:]
index_path.write_text(html, encoding='utf-8')

# --- public/styles.css -------------------------------------------------------
css_path = Path('public/styles.css')
css = css_path.read_text(encoding='utf-8')
if '/* 1.7.2 compact UI */' not in css:
    css += r'''

/* 1.7.2 compact UI */
.efb-pages .efb-card { min-width: 0; min-height: 0; height: auto; align-self: start; }
.ground-layout,.automation-layout,.settings-grid,.flight-page-layout,.briefing-layout,.atc-layout,.combined-atc-layout { align-items: start !important; grid-auto-rows: max-content !important; }
.atc-layout > *, .combined-atc-layout > * { min-width: 0; align-self: start; }
.atc-messages-card,.manual-clearance,.network-selector-card,.online-controllers-card,.online-atis-card { height: auto !important; min-height: 0 !important; }
.atc-message-list,.comms-list { min-width: 0; overflow-x: hidden; }
.atc-message-list article,.comms-list article { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.atc-message-list article p,.comms-list article p { white-space: normal; overflow-wrap: anywhere; word-break: normal; }
.section-title,.ground-brand,.fenix-connect-main { min-width: 0; }
.section-title > div,.ground-brand > div,.fenix-connect-main > div { min-width: 0; }
.section-title span,.section-title b,.bridge-facts b,.bridge-facts small,.integration-list small,.integration-list strong { overflow-wrap: anywhere; }
.bridge-facts { grid-template-columns: repeat(auto-fit,minmax(130px,1fr)); }
.bridge-facts > span { min-width: 0; }
.turnaround-card,.ground-safety-card,.gsx-payload-card,.service-panel,.automation-master-card,.automation-variable-card,.automation-rule-builder,.automation-rules-card,.automation-log-card { height: auto !important; min-height: 0 !important; }
.aircraft-view-stack { display:block; }
.aircraft-view[hidden] { display:none !important; }
.aircraft-subnav { margin-bottom:12px; }
.fenix-efb-view { display:grid; gap:12px; grid-template-rows:auto minmax(520px,calc(100vh - 260px)); }
.fenix-connect-strip { display:grid; grid-template-columns:minmax(260px,1fr) auto; gap:16px; align-items:center; padding:14px 16px; }
.fenix-connect-main { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }
.fenix-connect-main p { margin:4px 0 0; }
.fenix-connect-actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-end; gap:8px; }
.fenix-connect-actions .inline-form { min-width:min(430px,100%); }
.fenix-frame-full { width:100%; min-height:520px !important; padding:0; overflow:hidden; }
.fenix-frame-full iframe,.fenix-frame-full .fenix-frame-placeholder { width:100%; height:100%; min-height:520px; }
.update-changelog { display:grid; gap:0; }
.update-changelog section { display:grid; grid-template-columns:68px minmax(0,1fr); gap:14px; padding:12px 0; border-top:1px solid var(--line); }
.update-changelog section:first-child { border-top:0; }
.update-changelog p,.update-changelog ul { margin:0; color:var(--muted); line-height:1.45; }
.update-changelog ul { padding-left:18px; }
.traffic-airline-logo { position:relative; display:grid; place-items:center; width:38px; height:38px; flex:0 0 38px; border-radius:50%; border:1px solid var(--line); background:var(--panel-soft); overflow:hidden; }
.traffic-airline-logo img { position:absolute; inset:5px; width:28px; height:28px; object-fit:contain; border-radius:6px; background:#fff; }
.traffic-airline-logo b { font-size:10px; letter-spacing:.03em; z-index:0; }
.traffic-airline-logo img + b { opacity:0; }
@media (max-width:920px) {
  .fenix-connect-strip { grid-template-columns:1fr; }
  .fenix-connect-actions { justify-content:flex-start; }
  .fenix-connect-actions .inline-form { min-width:0; width:100%; }
  .fenix-efb-view { grid-template-rows:auto minmax(440px,65vh); }
}
'''
css_path.write_text(css, encoding='utf-8')

# --- src/electron-main.mjs ---------------------------------------------------
electron_path = Path('src/electron-main.mjs')
electron = electron_path.read_text(encoding='utf-8')
if 'function normalizeReleaseNotes' not in electron:
    electron = replace_once(electron, 'function createUpdateService() {', '''function normalizeReleaseNotes(value) {
  if (typeof value === 'string') return value.slice(0, 12000);
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? entry : entry?.note || '').filter(Boolean).join('\\n').slice(0, 12000);
  return '';
}

function createUpdateService() {''', 'release notes helper')
electron = electron.replace("releaseName: info?.version || null, detail: `Version ${info?.version || ''} ist verfügbar.`", "releaseName: info?.version || null, releaseNotes: normalizeReleaseNotes(info?.releaseNotes), detail: `Version ${info?.version || ''} ist verfügbar.`")
electron = electron.replace("releaseName: info?.version || null, detail: `Version ${info?.version || ''} ist bereit. Neustart zum Installieren.`", "releaseName: info?.version || null, releaseNotes: normalizeReleaseNotes(info?.releaseNotes), detail: `Version ${info?.version || ''} ist bereit. Neustart zum Installieren.`")
electron_path.write_text(electron, encoding='utf-8')

# --- public/i18n.js: preserve common aviation English in German UI -----------
i18n_path = Path('public/i18n.js')
i18n = i18n_path.read_text(encoding='utf-8')
replacements = {
    "taxiPlanning: 'Taxi-Planung'": "taxiPlanning: 'Taxi Planning'",
    "taxiPlanningSummary: 'Abflug- oder Ankunftsroute planen'": "taxiPlanningSummary: 'Departure- oder Arrival-Route planen'",
    "groundServices: 'Bodenservices'": "groundServices: 'Ground Services'",
    "tracking: 'Flugverfolgung'": "tracking: 'Flight Tracking'",
    "liveMap: 'Live-Karte'": "liveMap: 'Live Map'",
    "archive: 'Flugarchiv'": "archive: 'Flight Archive'",
}
for old, new in replacements.items():
    i18n = i18n.replace(old, new, 1)
# Traffic states are commonly used in English even in German aviation UI.
traffic_terms = {
    "trafficParked: 'Geparkt'": "trafficParked: 'Parking'",
    "trafficPreparing: 'Vorbereitung'": "trafficPreparing: 'Preflight'",
    "trafficPushback: 'Pushback'": "trafficPushback: 'Pushback'",
    "trafficTaxiOut: 'Taxi-Out'": "trafficTaxiOut: 'Taxi Out'",
    "trafficDeparting: 'Startet'": "trafficDeparting: 'Departure'",
    "trafficEnroute: 'Unterwegs'": "trafficEnroute: 'Enroute'",
    "trafficLanding: 'Landet'": "trafficLanding: 'Landing'",
    "trafficRollout: 'Ausrollen'": "trafficRollout: 'Rollout'",
    "trafficTaxiIn: 'Taxi-In'": "trafficTaxiIn: 'Taxi In'",
    "trafficTaxi: 'Taxi'": "trafficTaxi: 'Taxi'",
}
for old, new in traffic_terms.items():
    i18n = i18n.replace(old, new, 1)
i18n_path.write_text(i18n, encoding='utf-8')

# --- src/injected-traffic-client.mjs: optional flight-plan enrichment --------
traffic_path = Path('src/injected-traffic-client.mjs')
traffic = traffic_path.read_text(encoding='utf-8')
traffic = replace_once(traffic,
"const TRAFFIC_DEFINITION = 91;\n",
"const TRAFFIC_DEFINITION = 91;\nconst TRAFFIC_PLAN_DEFINITION = 92;\n",
'plan definition constant')
traffic = replace_once(traffic,
"    this.pendingRequests = new Map();\n",
"    this.pendingRequests = new Map();\n    this.pendingPlanRequests = new Map();\n    this.trafficPlanByObjectId = new Map();\n",
'plan request state')
traffic = replace_once(traffic,
"    this.pendingRequests.clear();\n    this.fallbackAircraft = [];\n",
"    this.pendingRequests.clear();\n    this.pendingPlanRequests.clear();\n    this.trafficPlanByObjectId.clear();\n    this.fallbackAircraft = [];\n",
'plan state stop')
traffic = replace_once(traffic,
"      this.handle.on('simObjectData', (received) => this.#handleDetail(received));\n",
"      this.handle.on('simObjectData', (received) => { this.#handleDetail(received); this.#handlePlanDetail(received); });\n",
'plan handler')
traffic = replace_once(traffic,
"        this.pendingRequests.clear();\n",
"        this.pendingRequests.clear();\n        this.pendingPlanRequests.clear();\n        this.trafficPlanByObjectId.clear();\n",
'reconnect plan clear')
traffic = replace_once(traffic,
"    addString('ATC ID', SimConnectDataType.STRING32);\n  }\n",
"""    addString('ATC ID', SimConnectDataType.STRING32);

    const addPlanString = (name, type = SimConnectDataType.STRING32) => handle.addToDataDefinition(
      TRAFFIC_PLAN_DEFINITION, name, null, type, 0, SimConnectConstants.UNUSED,
    );
    const addPlanFloat = (name, unit) => handle.addToDataDefinition(
      TRAFFIC_PLAN_DEFINITION, name, unit, SimConnectDataType.FLOAT64, 0, SimConnectConstants.UNUSED,
    );
    addPlanString('ATC AIRLINE', SimConnectDataType.STRING64);
    addPlanString('ATC FLIGHT NUMBER', SimConnectDataType.STRING32);
    addPlanString('AI TRAFFIC STATE', SimConnectDataType.STRING64);
    addPlanString('AI TRAFFIC CURRENT AIRPORT', SimConnectDataType.STRING32);
    addPlanString('AI TRAFFIC ASSIGNED RUNWAY', SimConnectDataType.STRING32);
    addPlanString('AI TRAFFIC ASSIGNED PARKING', SimConnectDataType.STRING64);
    addPlanString('AI TRAFFIC FROMAIRPORT', SimConnectDataType.STRING32);
    addPlanString('AI TRAFFIC TOAIRPORT', SimConnectDataType.STRING32);
    addPlanFloat('AI TRAFFIC ETD', 'seconds');
    addPlanFloat('AI TRAFFIC ETA', 'seconds');
  }
""",
'plan definitions')
traffic = replace_once(traffic,
"""    this.fallbackAircraft = batch.aircraft
      .sort((left, right) => left.callsign.localeCompare(right.callsign, 'en', { numeric: true }))
      .slice(0, 300);
    this.#publishMergedTraffic();
  }
""",
"""    this.fallbackAircraft = batch.aircraft
      .sort((left, right) => left.callsign.localeCompare(right.callsign, 'en', { numeric: true }))
      .slice(0, 300);
    this.#requestPlanEnrichment(this.fallbackAircraft);
    this.#publishMergedTraffic();
  }

  #requestPlanEnrichment(aircraft = []) {
    if (!this.handle) return;
    for (const entry of aircraft.slice(0, 120)) {
      const objectId = Number(entry.objectId);
      if (!Number.isInteger(objectId) || this.pendingPlanRequests.has(objectId)) continue;
      const requestId = this.#nextDetailRequestId();
      this.pendingPlanRequests.set(requestId, objectId);
      try {
        this.handle.requestDataOnSimObject(requestId, TRAFFIC_PLAN_DEFINITION, objectId, SimConnectPeriod.ONCE, 0, 0, 0, 0);
      } catch {
        this.pendingPlanRequests.delete(requestId);
      }
    }
  }

  #handlePlanDetail(received) {
    const objectId = this.pendingPlanRequests.get(received.requestID);
    if (!objectId) return;
    this.pendingPlanRequests.delete(received.requestID);
    try {
      const data = received.data;
      const plan = {
        airline: clean(data.readString64()),
        flightNumber: clean(data.readString32()),
        state: clean(data.readString64()),
        currentAirport: clean(data.readString32()).toUpperCase(),
        runway: clean(data.readString32()).toUpperCase(),
        parking: clean(data.readString64()),
        origin: clean(data.readString32()).toUpperCase(),
        destination: clean(data.readString32()).toUpperCase(),
        etdSeconds: data.readFloat64(),
        etaSeconds: data.readFloat64(),
      };
      this.trafficPlanByObjectId.set(Number(objectId), plan);
      this.fallbackAircraft = this.fallbackAircraft.map((entry) => Number(entry.objectId) === Number(objectId)
        ? this.#normalizeTrafficEntry({ ...entry, ...plan }) : entry);
      this.#publishMergedTraffic();
    } catch {
      // Optional AI schedule fields are not available for every PassiveAircraft/injector object.
    }
  }
""",
'plan enrichment methods')
traffic_path.write_text(traffic, encoding='utf-8')

# --- CHANGELOG ---------------------------------------------------------------
change_path = Path('CHANGELOG.md')
change = change_path.read_text(encoding='utf-8')
needle = '## 1.7.2 — Native EFB Builder Hotfix\n\n'
add = '''- Fixed Taxi Navigation auto-follow so the aircraft stays centered on module open and route refresh.\n- Reworked Aircraft & EFB into a full-width Fenix workspace with Fenix / PMDG / Adapter Status tabs.\n- Fixed stretched/offset ATC and SayIntentions cards plus oversized Phase-2/3 empty-state cards.\n- Improved Flightboard route/schedule enrichment with optional official MSFS AI Traffic fields and online-pilot fallback.\n- Improved Departures / Arrivals classification when schedule data is incomplete.\n- Added airline identity badges/icons and kept common aviation terms such as Taxi, Enroute, Parking and Boarding in English in the German UI.\n- Added an in-app update changelog and retained GitHub/electron-updater release notes in update state.\n'''
if add not in change:
    change = replace_once(change, needle, needle + add, 'changelog 1.7.2')
change_path.write_text(change, encoding='utf-8')
