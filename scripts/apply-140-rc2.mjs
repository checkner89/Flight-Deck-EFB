import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, value) => fs.writeFileSync(file, value.replace(/\r\n/g, '\n'), 'utf8');
function literal(file, before, after, label) {
  let text = read(file);
  if (text.includes(after)) return;
  if (!text.includes(before)) throw new Error(`${file}: missing ${label}`);
  write(file, text.replace(before, after));
}
function regex(file, pattern, after, label) {
  let text = read(file);
  if (text.includes(after)) return;
  if (!pattern.test(text)) throw new Error(`${file}: missing ${label}`);
  write(file, text.replace(pattern, after));
}

// --- True tab navigation: Flight Hub, Settings and ATC show only the active tab. ---
{
  let html = read('public/index.html');
  html = html.replace(/<nav class="floating-section-nav flight-hub-nav"[^>]*>[\s\S]*?<\/nav>/g,
    '<nav class="floating-section-nav flight-hub-nav" aria-label="Flight Hub"><button type="button" data-flight-hub-tab="operations">OPERATIONS</button><button type="button" data-flight-hub-tab="tracking">TRACKING & KARTE</button><button type="button" data-flight-hub-tab="archive">ARCHIV</button></nav>');
  html = html.replace(/<nav class="floating-section-nav settings-subnav"[^>]*>[\s\S]*?<\/nav>/,
    '<nav class="floating-section-nav settings-subnav" aria-label="Einstellungen"><button type="button" data-settings-tab="system">SYSTEM</button><button type="button" data-settings-tab="appearance">DARSTELLUNG</button><button type="button" data-settings-tab="flight">FLUG</button><button type="button" data-settings-tab="devices">GERÄTE & DATEN</button><button type="button" data-settings-tab="updates">UPDATES & HILFE</button></nav>');
  html = html.replace(/<nav class="floating-section-nav atc-subnav"[^>]*>[\s\S]*?<\/nav>/,
    '<nav class="floating-section-nav atc-subnav" aria-label="ATC Bereiche"><button type="button" data-atc-tab="clearance">FREIGABE</button><button type="button" data-atc-tab="messages">NACHRICHTEN</button><button type="button" data-atc-tab="networks">VATSIM / IVAO</button></nav>');

  html = html.replace('id="settings-health" class="efb-card settings-card diagnostics-card settings-health-card"', 'id="settings-health" data-settings-panel="system" class="efb-card settings-card diagnostics-card settings-health-card"');
  html = html.replace('id="settings-appearance" class="efb-card settings-card preference-card"', 'id="settings-appearance" data-settings-panel="appearance" class="efb-card settings-card preference-card"');
  html = html.replace('<article class="efb-card settings-card preference-card"><h2 data-i18n="displayPreferences">', '<article data-settings-panel="appearance" class="efb-card settings-card preference-card"><h2 data-i18n="displayPreferences">');
  html = html.replace('id="settings-flight" class="efb-card settings-card preference-card"', 'id="settings-flight" data-settings-panel="flight" class="efb-card settings-card preference-card"');
  html = html.replace('<article class="efb-card settings-card preference-card"><h2 data-i18n="operationalAlerts">', '<article data-settings-panel="flight" class="efb-card settings-card preference-card"><h2 data-i18n="operationalAlerts">');
  html = html.replace('<article class="efb-card settings-card app-customization-card">', '<article data-settings-panel="appearance" class="efb-card settings-card app-customization-card">');
  html = html.replace('<article class="efb-card settings-card new-flight-card">', '<article data-settings-panel="flight" class="efb-card settings-card new-flight-card">');
  html = html.replace('id="settings-devices" class="efb-card settings-card mobile-access-card"', 'id="settings-devices" data-settings-panel="devices" class="efb-card settings-card mobile-access-card"');
  html = html.replace('<article class="efb-card settings-card backup-card">', '<article data-settings-panel="devices" class="efb-card settings-card backup-card">');
  html = html.replace('id="settings-updates" class="efb-card settings-card update-card"', 'id="settings-updates" data-settings-panel="updates" class="efb-card settings-card update-card"');
  html = html.replace('<article class="efb-card settings-card setup-assistant-card">', '<article data-settings-panel="updates" class="efb-card settings-card setup-assistant-card">');
  html = html.replace('<article class="efb-card settings-card legal-card">', '<article data-settings-panel="updates" class="efb-card settings-card legal-card">');
  html = html.replace('<article class="efb-card settings-card"><h2>Connector configuration</h2>', '<article data-settings-panel="system" class="efb-card settings-card"><h2>Connector configuration</h2>');
  html = html.replace('<article class="efb-card settings-card"><h2>Data sources</h2>', '<article data-settings-panel="system" class="efb-card settings-card"><h2>Data sources</h2>');

  const providerPattern = /<article id="atc-provider-section" class="efb-card provider-panel">[\s\S]*?<\/article>/;
  if (providerPattern.test(html)) {
    html = html.replace(providerPattern, `<article id="atc-provider-section" data-atc-panel="clearance" class="efb-card provider-panel atc-auto-provider">
              <div class="section-title"><div><small>AUTOMATISCHE QUELLENERKENNUNG</small><h2 id="atc-auto-source-label">AUTO</h2></div><span>KEINE AUSWAHL NÖTIG</span></div>
              <p class="help-text">Flight Deck EFB erkennt SayIntentions, BeyondATC oder eine manuelle Freigabe automatisch. Die aktive Quelle wird oben im ATC-Status angezeigt.</p>
              <div class="provider-statuses"><span><i id="atc-si-dot"></i><b>SayIntentions</b><small id="atc-si-detail">Wird gesucht</small></span><span><i id="atc-batc-dot"></i><b>BeyondATC</b><small id="atc-batc-detail">Log wird gesucht</small></span></div>
            </article>`);
  }
  html = html.replace('id="atc-clearance-section" class="efb-card clearance-panel"', 'id="atc-clearance-section" data-atc-panel="clearance" class="efb-card clearance-panel"');
  html = html.replace('class="efb-card manual-clearance"', 'data-atc-panel="clearance" class="efb-card manual-clearance"');
  html = html.replace('class="compatibility-note atc-compatibility-note"', 'data-atc-panel="clearance" class="compatibility-note atc-compatibility-note"');
  html = html.replace('id="atc-messages-section" class="efb-card atc-messages-card"', 'id="atc-messages-section" data-atc-panel="messages" class="efb-card atc-messages-card"');
  html = html.replace('id="atc-networks-section" class="efb-card network-selector-card"', 'id="atc-networks-section" data-atc-panel="networks" class="efb-card network-selector-card"');
  html = html.replace('class="efb-card online-controllers-card"', 'data-atc-panel="networks" class="efb-card online-controllers-card"');
  html = html.replace('class="efb-card online-atis-card"', 'data-atc-panel="networks" class="efb-card online-atis-card"');
  write('public/index.html', html);
}

// --- Application behavior fixes. ---
{
  let app = read('public/app.js');
  app = app.replace("  flightHubNavButtons: [...document.querySelectorAll('[data-flight-hub-view]')],\n  sectionNavButtons: [...document.querySelectorAll('[data-scroll-target]')],",
    "  flightHubNavButtons: [...document.querySelectorAll('[data-flight-hub-tab]')],\n  settingsTabButtons: [...document.querySelectorAll('[data-settings-tab]')],\n  atcTabButtons: [...document.querySelectorAll('[data-atc-tab]')],");
  app = app.replace("let activeModule = 'home';", "let activeModule = 'home';\nlet flightHubTab = 'operations';\nlet settingsTab = 'system';\nlet atcTab = 'clearance';\nlet inferredHomeGate = null;\nlet forcingAutomaticAtc = false;");

  app = app.replace("function switchModule(moduleName) {\n  if (moduleName === 'online') moduleName = 'atc';",
    "function switchModule(moduleName, preserveFlightHubTab = false) {\n  if (moduleName === 'online') moduleName = 'atc';\n  if (moduleName === 'tracking') { flightHubTab = 'tracking'; moduleName = 'flight'; preserveFlightHubTab = true; }\n  if (moduleName === 'flight' && !preserveFlightHubTab) flightHubTab = 'operations';");
  app = app.replace("  for (const button of elements.flightHubNavButtons || []) {\n    const active = button.dataset.flightHubView === activeModule;\n    button.classList.toggle('active', active);\n  }",
    "  for (const button of elements.flightHubNavButtons || []) {\n    button.classList.toggle('active', activeModule === 'flight' && button.dataset.flightHubTab === flightHubTab);\n  }");
  app = app.replace("  for (const page of elements.efbPageSections) page.hidden = page.dataset.page !== activeModule;",
    "  const visiblePage = activeModule === 'flight' && flightHubTab !== 'operations' ? 'tracking' : activeModule;\n  for (const page of elements.efbPageSections) page.hidden = page.dataset.page !== visiblePage;\n  if (visiblePage === 'tracking') {\n    const trackingPage = document.querySelector('[data-page=\"tracking\"]');\n    const archiveOnly = flightHubTab === 'archive';\n    trackingPage?.querySelector('.tracking-map-card')?.toggleAttribute('hidden', archiveOnly);\n    trackingPage?.querySelector('.tracking-recorder-card')?.toggleAttribute('hidden', archiveOnly);\n    trackingPage?.querySelector('.tracking-detail-layout')?.toggleAttribute('hidden', archiveOnly);\n    trackingPage?.querySelector('.tracking-archive-card')?.removeAttribute('hidden');\n  }");
  app = app.replace("  if (activeModule === 'tracking') {", "  if (visiblePage === 'tracking') {");
  app = app.replace("  if (activeModule === 'automations') refreshAutomationConfiguration().catch(() => {});",
    "  if (activeModule === 'settings') setSettingsTab(settingsTab);\n  if (activeModule === 'atc') setAtcTab(atcTab);\n  if (activeModule === 'automations') refreshAutomationConfiguration().catch(() => {});");

  const navAnchor = "function appLabel(id) {";
  if (!app.includes('function setSettingsTab(tab)')) {
    app = app.replace(navAnchor, `function applyPanelTab(buttons, selector, attribute, value) {
  for (const button of buttons || []) button.classList.toggle('active', button.dataset[attribute] === value);
  for (const panel of document.querySelectorAll(selector)) panel.hidden = panel.dataset[attribute.replace('Tab', 'Panel')] !== value;
}

function setSettingsTab(tab) {
  settingsTab = ['system', 'appearance', 'flight', 'devices', 'updates'].includes(tab) ? tab : 'system';
  for (const button of elements.settingsTabButtons || []) button.classList.toggle('active', button.dataset.settingsTab === settingsTab);
  for (const panel of document.querySelectorAll('[data-settings-panel]')) panel.hidden = panel.dataset.settingsPanel !== settingsTab;
}

function setAtcTab(tab) {
  atcTab = ['clearance', 'messages', 'networks'].includes(tab) ? tab : 'clearance';
  for (const button of elements.atcTabButtons || []) button.classList.toggle('active', button.dataset.atcTab === atcTab);
  for (const panel of document.querySelectorAll('[data-atc-panel]')) panel.hidden = panel.dataset.atcPanel !== atcTab;
}

function setFlightHubTab(tab) {
  flightHubTab = ['operations', 'tracking', 'archive'].includes(tab) ? tab : 'operations';
  switchModule('flight', true);
}

${navAnchor}`);
  }

  const oldNavListeners = `for (const button of elements.flightHubNavButtons || []) {
  button.addEventListener('click', () => {
    switchModule(button.dataset.flightHubView);
    if (button.dataset.trackingSection === 'archive') setTimeout(() => document.querySelector('.tracking-archive-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  });
}
for (const button of elements.sectionNavButtons || []) {
  button.addEventListener('click', () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}`;
  const newNavListeners = `for (const button of elements.flightHubNavButtons || []) button.addEventListener('click', () => setFlightHubTab(button.dataset.flightHubTab));
for (const button of elements.settingsTabButtons || []) button.addEventListener('click', () => setSettingsTab(button.dataset.settingsTab));
for (const button of elements.atcTabButtons || []) button.addEventListener('click', () => setAtcTab(button.dataset.atcTab));`;
  if (app.includes(oldNavListeners)) app = app.replace(oldNavListeners, newNavListeners);

  // Flightboard: ALL means all nearby aircraft. Enrich missing schedule fields where the current airport/state makes it unambiguous.
  app = app.replace("    [/enroute|cruise|climb|pattern/, 'trafficEnroute', 'airborne'],",
    "    [/simple\\s*flight|flt plan|waypoint|enroute|cruise|climb|pattern/, 'trafficEnroute', 'airborne'],");
  const flightboardFilterOld = `  const airportTraffic = airport ? all.filter((entry) => trafficMatchesAirport(entry, airport)) : all;
  const useAirportFilter = Boolean(airport && airportTraffic.length);
  const candidates = useAirportFilter ? airportTraffic : all;
  const visible = candidates.filter((entry) => trafficMatchesView(entry, airport));`;
  const flightboardFilterNew = `  const airportTraffic = airport ? all.filter((entry) => trafficMatchesAirport(entry, airport)) : all;
  const candidates = trafficBoardView === 'all' || !airport ? all : airportTraffic;
  const visible = candidates.filter((entry) => trafficMatchesView(entry, airport));`;
  if (app.includes(flightboardFilterOld)) app = app.replace(flightboardFilterOld, flightboardFilterNew);
  app = app.replace("  elements.flightboardAirport.textContent = useAirportFilter ? airport : airport ? `${airport} · NEARBY` : 'ALL NEARBY';",
    "  elements.flightboardAirport.textContent = trafficBoardView === 'all' ? `ALL NEARBY · ${all.length}` : (airport || 'ALL NEARBY');");
  if (!app.includes('function trafficRouteFields(entry')) {
    app = app.replace('function renderFlightboard(state) {', `function trafficRouteFields(entry = {}) {
  const state = normalizedTrafficState(entry.state);
  const current = String(entry.currentAirport || '').toUpperCase();
  let origin = String(entry.origin || '').toUpperCase();
  let destination = String(entry.destination || '').toUpperCase();
  if (!origin && current && /startup|preflight|clearance|push|taxi out|takeoff|depart/.test(state)) origin = current;
  if (!destination && current && /landing|approach|rollout|taxi in/.test(state)) destination = current;
  return { origin: origin || '—', destination: destination || '—' };
}

function renderFlightboard(state) {`);
  }
  app = app.replace("    const status = trafficStateInfo(entry.state);\n    const row = document.createElement('div');",
    "    const status = trafficStateInfo(entry.state);\n    const route = trafficRouteFields(entry);\n    const row = document.createElement('div');");
  app = app.replace("<b>${escapeHtml(entry.origin || '—')}</b><b>${escapeHtml(entry.destination || '—')}</b>",
    "<b>${escapeHtml(route.origin)}</b><b>${escapeHtml(route.destination)}</b>");

  // Home gate: keep explicit SI gate, otherwise infer a stationary aircraft's nearest mapped parking position.
  if (!app.includes('function homeGateLabel(state)')) {
    app = app.replace('function renderEfb(state) {', `function homeGateLabel(state) {
  const explicit = state?.gate?.name;
  if (explicit) { inferredHomeGate = explicit; return explicit; }
  const aircraft = state?.aircraft;
  if (!aircraft?.onGround) return inferredHomeGate || '—';
  const speed = Number(aircraft.groundSpeed) || 0;
  if (speed > 8 || !loadedAirportMapData?.features?.length) return inferredHomeGate || '—';
  let best = null;
  for (const feature of loadedAirportMapData.features) {
    if (feature.kind !== 'parking_position') continue;
    const raw = Array.isArray(feature.coordinates) ? feature.coordinates.at(-1) : null;
    const lat = Number(raw?.lat ?? raw?.[0]);
    const lon = Number(raw?.lon ?? raw?.lng ?? raw?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distance = approximateDistanceMeters(aircraft, { lat, lon });
    if (distance <= 90 && (!best || distance < best.distance)) best = { distance, label: feature.ref || feature.name || 'Stand' };
  }
  if (best) inferredHomeGate = String(best.label).trim();
  return inferredHomeGate || '—';
}

function renderEfb(state) {`);
  }
  app = app.replace("  const gate = state.gate?.name || taxi.pathMetadata?.destination?.name || '—';",
    "  const gate = homeGateLabel(state);");

  // ATC is always automatic from the UI. If an older preference selected a provider, restore AUTO once.
  if (!app.includes('function ensureAutomaticAtcProvider(state)')) {
    app = app.replace('async function selectAtcProvider(provider) {', `function ensureAutomaticAtcProvider(state) {
  if (forcingAutomaticAtc || state?.atc?.selectedProvider === 'auto' || !token) return;
  forcingAutomaticAtc = true;
  fetch(authenticatedUrl('/api/atc/provider'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'auto' }),
  }).then((response) => response.json()).then((data) => { if (data?.state) renderState(data.state); }).catch(() => {}).finally(() => { forcingAutomaticAtc = false; });
}

async function selectAtcProvider(provider) {`);
  }
  app = app.replace("  elements.atcActivePill.textContent = atcProviderLabel(selectedProvider).toUpperCase();",
    "  elements.atcActivePill.textContent = effectiveProvider === 'auto' ? 'AUTO' : `AUTO · ${atcProviderLabel(effectiveProvider).toUpperCase()}`;\n  document.getElementById('atc-auto-source-label')?.replaceChildren(document.createTextNode(effectiveProvider === 'auto' ? 'Wird erkannt …' : atcProviderLabel(effectiveProvider)));\n  ensureAutomaticAtcProvider(state);");
  app = app.replace("  elements.settingsAtc.textContent = `${atcProviderLabel(selectedProvider)} · ${atcConnection?.detail || 'wartet'}`;",
    "  elements.settingsAtc.textContent = `${effectiveProvider === 'auto' ? 'AUTO' : atcProviderLabel(effectiveProvider)} · ${atcConnection?.detail || 'wartet'}`;");

  write('public/app.js', app);
}

// --- Progressive taxi guidance prevents route-position jumps at parallel/intersecting taxiways. ---
{
  let state = read('src/state-engine.mjs');
  state = state.replace('export function closestPointOnPath(position, path) {', 'export function closestPointOnPath(position, path, { minSegment = 0, maxSegment = null } = {}) {');
  state = state.replace('  for (let index = 0; index < path.length - 1; index += 1) {',
    '  const firstSegment = Math.max(0, Math.min(path.length - 2, Number(minSegment) || 0));\n  const lastSegment = Math.max(firstSegment, Math.min(path.length - 2, Number.isFinite(Number(maxSegment)) ? Number(maxSegment) : path.length - 2));\n  for (let index = firstSegment; index <= lastSegment; index += 1) {');
  state = state.replace('    this.offRouteSince = null;\n    this.state = {', '    this.offRouteSince = null;\n    this.guidanceSegmentIndex = null;\n    this.state = {');
  state = state.replace('    this.state.taxi.pathRevision += 1;\n    this.offRouteSince = null;', '    this.state.taxi.pathRevision += 1;\n    this.offRouteSince = null;\n    this.guidanceSegmentIndex = null;');
  const oldClosest = `    const closest = closestPointOnPath(aircraft, path);
    if (!closest) return;
    const deviation = closest.distanceMeters;`;
  const newClosest = `    const previousSegment = Number.isInteger(this.guidanceSegmentIndex) ? this.guidanceSegmentIndex : null;
    const closest = previousSegment === null
      ? closestPointOnPath(aircraft, path)
      : closestPointOnPath(aircraft, path, {
        minSegment: Math.max(0, previousSegment - 2),
        maxSegment: Math.min(path.length - 2, previousSegment + 14),
      });
    if (!closest) return;
    const deviation = closest.distanceMeters;
    if (deviation < 180) this.guidanceSegmentIndex = closest.segmentIndex;`;
  if (state.includes(oldClosest)) state = state.replace(oldClosest, newClosest);
  write('src/state-engine.mjs', state);
}

// --- Larger Fenix work area, clearer Home facts and true-tab layout. ---
{
  let css = read('public/styles.css');
  if (!css.includes('/* v1.4.0 RC2 layout fixes */')) {
    css += `
/* v1.4.0 RC2 layout fixes */
[data-settings-panel][hidden],[data-atc-panel][hidden],.tracking-map-card[hidden],.tracking-recorder-card[hidden],.tracking-detail-layout[hidden]{display:none!important}
.settings-layout:has([data-settings-panel]:not([hidden])){align-content:start}
.atc-layout:has([data-atc-panel]:not([hidden])){align-content:start}
.atc-auto-provider{grid-column:1/-1}
.fenix-page .fenix-layout{grid-template-columns:minmax(250px,.30fr) minmax(0,1.70fr);min-height:calc(100vh - 165px)}
.fenix-page .fenix-frame-card{min-height:calc(100vh - 165px);padding:6px}
.fenix-page .fenix-frame-card iframe,.fenix-page .fenix-frame-placeholder{min-height:calc(100vh - 185px);height:100%}
.home-flight-facts>span:nth-child(1){border-color:rgba(22,227,212,.32);background:linear-gradient(135deg,rgba(22,227,212,.10),rgba(22,227,212,.025))}
.home-flight-facts>span:nth-child(2){border-color:rgba(45,184,255,.34);background:linear-gradient(135deg,rgba(45,184,255,.11),rgba(45,184,255,.025))}
.home-flight-facts>span:nth-child(3){border-color:rgba(255,200,87,.34);background:linear-gradient(135deg,rgba(255,200,87,.10),rgba(255,200,87,.025))}
.home-flight-facts>span:nth-child(1) b{color:#8ff5e9}.home-flight-facts>span:nth-child(2) b{color:#9bddff}.home-flight-facts>span:nth-child(3) b{color:#ffd878}
.flightboard-table{max-height:calc(100vh - 285px);overflow:auto}
html[data-theme="light"] .home-flight-facts>span:nth-child(1){background:#dff7f3;border-color:#79c9bd}html[data-theme="light"] .home-flight-facts>span:nth-child(1) b{color:#075f59}
html[data-theme="light"] .home-flight-facts>span:nth-child(2){background:#e1f2fb;border-color:#82bddc}html[data-theme="light"] .home-flight-facts>span:nth-child(2) b{color:#15577a}
html[data-theme="light"] .home-flight-facts>span:nth-child(3){background:#fff3cf;border-color:#d4b55c}html[data-theme="light"] .home-flight-facts>span:nth-child(3) b{color:#735500}
@media(max-width:1050px){.fenix-page .fenix-layout{grid-template-columns:1fr;min-height:auto}.fenix-page .fenix-frame-card{min-height:680px}.fenix-page .fenix-frame-card iframe,.fenix-page .fenix-frame-placeholder{min-height:660px}}
`;
  }
  write('public/styles.css', css);
}

// --- Changelog addendum for the RC2 corrections. ---
{
  let changelog = read('CHANGELOG.md');
  const anchor = '## 1.4.0 — 24 August 2026\n\n';
  const addendum = '- Flightboard ALL now shows all detected nearby simulator aircraft; From/To is retained where MSFS exposes a schedule and sensibly inferred from current-airport/state where possible. Raw generic states such as “simple flight” are normalized.\n- Floating navigation now behaves as real tabs: only the active Settings or ATC section is shown, and Flight Hub stays inside one stable module while switching Operations, Tracking and Archive.\n- Enlarged the embedded Fenix Remote EFB work area.\n- Improved Home airport/runway/gate presentation and added local stand inference when a stationary aircraft is close to a mapped parking position.\n- Taxi route progress now follows a progressive segment window to avoid implausible jumps across nearby or intersecting taxiways.\n- ATC provider selection was removed from the UI; source selection is always automatic and the detected provider is shown read-only.\n';
  if (changelog.includes(anchor) && !changelog.includes('Flightboard ALL now shows all detected')) changelog = changelog.replace(anchor, anchor + addendum);
  write('CHANGELOG.md', changelog);
}

console.log('Applied Flight Deck EFB 1.4.0 RC2 fixes.');
