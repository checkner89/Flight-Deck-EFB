from pathlib import Path
import json
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Patch anchor missing: {label}')
    return text.replace(old, new, 1)


def update(path, transform):
    file = Path(path)
    old = file.read_text(encoding='utf-8')
    new = transform(old)
    if old == new:
        raise SystemExit(f'No changes produced for {path}')
    file.write_text(new, encoding='utf-8')


# -----------------------------------------------------------------------------
# Route bridge session hygiene
# -----------------------------------------------------------------------------
def patch_route_sync(text):
    text = replace_once(
        text,
        "    this.avionicsSync = { lastAt: null, routeFingerprint: null };\n    this.lastPublishedFingerprint = '';",
        "    this.avionicsSync = { lastAt: null, routeFingerprint: null };\n    this.sessionGeneration = null;\n    this.lastPublishedFingerprint = '';",
        'route sync session generation field',
    )
    text = replace_once(
        text,
        "  #publish(state) {\n    if (this.publishing) return;\n    const flightDeckRoute = buildFlightDeckRoute(state);",
        "  #publish(state) {\n    if (this.publishing) return;\n    const generation = Number(state.session?.generation || 1);\n    if (this.sessionGeneration !== null && generation !== this.sessionGeneration) {\n      this.msfsEfbRoute = null;\n      this.msfsEfbReceivedAt = null;\n      this.avionicsSync = { lastAt: null, routeFingerprint: null };\n      this.lastPublishedFingerprint = '';\n    }\n    this.sessionGeneration = generation;\n    const flightDeckRoute = buildFlightDeckRoute(state);",
        'route sync reset on new flight',
    )
    return text


update('src/route-sync-service.mjs', patch_route_sync)


# -----------------------------------------------------------------------------
# State defaults for Phase 3 services
# -----------------------------------------------------------------------------
def patch_state(text):
    anchor = """        groundSafety: {
          status: 'clear',
          highestSeverity: null,
          alerts: [],
          detail: 'Keine aktiven Ground-Safety-Warnungen',
        },
"""
    addition = anchor + """        routeSync: {
          status: 'waiting-route',
          detail: 'Waiting for a Flight Deck/SimBrief route.',
          nativeEfb: { connected: false, lastSeenAt: null, routeReceivedAt: null, readMethod: 'GET_EFB_ROUTE' },
          flightDeckRoute: null,
          msfsEfbRoute: null,
          comparison: { status: 'waiting', matchPercent: null, mismatches: [], waypointOverlapPercent: null },
          avionicsSync: { lastAt: null, routeFingerprint: null },
          capabilities: { readEfbRoute: true, observeAvionicsSync: true, writeEfbRoute: false, writeAvionicsRoute: false },
        },
        flightIntelligence: {
          status: 'waiting',
          phase: null,
          rawPhase: null,
          candidatePhase: null,
          confidence: null,
          evidence: [],
          detail: 'Waiting for simulator flight-state data.',
        },
        turnaround: {
          status: 'inactive',
          stage: 'waiting',
          progressPercent: 0,
          blockers: [],
          milestones: [],
          recommendedNext: null,
          detail: 'Waiting for ground-state data.',
          remoteServiceControl: false,
        },
        flightAssistant: {
          status: 'clear',
          highestSeverity: 'clear',
          advisories: [],
          detail: 'No operational advisories.',
          advisoryOnly: true,
        },
"""
    return replace_once(text, anchor, addition, 'phase3 integration defaults')


update('src/state-engine.mjs', patch_state)


# -----------------------------------------------------------------------------
# Flight phase resolution prefers stabilized Phase 3 intelligence
# -----------------------------------------------------------------------------
def patch_phases(text):
    old = """export function resolveFlightPhase(state, activeRecord, override = 'auto') {
  return PHASE_IDS.has(override) ? override : deriveAutomaticFlightPhase(state, activeRecord);
}
"""
    new = """export function resolveFlightPhase(state, activeRecord, override = 'auto') {
  if (PHASE_IDS.has(override)) return override;
  const stabilized = state?.integrations?.flightIntelligence?.phase;
  return PHASE_IDS.has(stabilized) ? stabilized : deriveAutomaticFlightPhase(state, activeRecord);
}
"""
    return replace_once(text, old, new, 'stabilized phase resolver')


update('public/flight-phases.js', patch_phases)


# -----------------------------------------------------------------------------
# Server lifecycle, native EFB loopback bridge and diagnostics
# -----------------------------------------------------------------------------
def patch_server(text):
    text = replace_once(
        text,
        "import { GroundSafetyEngine } from './ground-safety-engine.mjs';\n",
        "import { GroundSafetyEngine } from './ground-safety-engine.mjs';\nimport { RouteSyncService } from './route-sync-service.mjs';\nimport { FlightIntelligenceEngine } from './flight-intelligence-engine.mjs';\n",
        'phase3 server imports',
    )
    text = re.sub(r"const APP_VERSION = '[^']+';", "const APP_VERSION = '1.7.0';", text, count=1)
    text = replace_once(
        text,
        "  const groundSafety = new GroundSafetyEngine(engine);\n  const facilityMapCache = new Map();",
        "  const groundSafety = new GroundSafetyEngine(engine);\n  const routeSync = new RouteSyncService(engine);\n  const flightIntelligence = new FlightIntelligenceEngine(engine);\n  const facilityMapCache = new Map();",
        'phase3 service instances',
    )
    text = replace_once(
        text,
        "  await automation.start();\n  groundSafety.start();",
        "  await automation.start();\n  groundSafety.start();\n  routeSync.start();\n  flightIntelligence.start();",
        'phase3 service start',
    )
    text = replace_once(
        text,
        "      { id: 'ground-safety', label: 'Ground / Taxi Safety', status: state.integrations.groundSafety?.status === 'clear' ? 'ready' : state.integrations.groundSafety?.status || 'waiting', detail: state.integrations.groundSafety?.detail || '' },\n      { id: 'atc', label: 'ATC source',",
        "      { id: 'ground-safety', label: 'Ground / Taxi Safety', status: state.integrations.groundSafety?.status === 'clear' ? 'ready' : state.integrations.groundSafety?.status || 'waiting', detail: state.integrations.groundSafety?.detail || '' },\n      { id: 'flight-intelligence', label: 'Automatic Flight Intelligence', status: state.integrations.flightIntelligence?.status === 'stable' ? 'ready' : state.integrations.flightIntelligence?.status || 'waiting', detail: state.integrations.flightIntelligence?.detail || '' },\n      { id: 'route-sync', label: 'Native MSFS EFB Route Bridge', status: state.integrations.routeSync?.status === 'ready' ? 'ready' : state.integrations.routeSync?.status || 'waiting', detail: state.integrations.routeSync?.detail || '' },\n      { id: 'flight-assistant', label: 'Flight Assistant', status: state.integrations.flightAssistant?.status === 'clear' ? 'ready' : state.integrations.flightAssistant?.status || 'waiting', detail: state.integrations.flightAssistant?.detail || '' },\n      { id: 'turnaround', label: 'Turnaround Coordinator', status: ['ready', 'complete', 'inactive'].includes(state.integrations.turnaround?.status) ? 'ready' : state.integrations.turnaround?.status || 'waiting', detail: state.integrations.turnaround?.detail || '' },\n      { id: 'atc', label: 'ATC source',",
        'phase3 diagnostics',
    )
    text = replace_once(
        text,
        "      safety: { automationMode: automation.publicConfiguration().mode, gsxRemoteControl: false, adapterControlRequiresExplicitRequest: true, groundSafetyAdvisoryOnly: true, secretsIncluded: false },",
        "      safety: { automationMode: automation.publicConfiguration().mode, gsxRemoteControl: false, turnaroundRemoteServiceControl: false, adapterControlRequiresExplicitRequest: true, groundSafetyAdvisoryOnly: true, flightAssistantAdvisoryOnly: true, routeSyncUsesDocumentedReadApi: true, secretsIncluded: false },",
        'phase3 diagnostics safety',
    )
    anchor = """      const requestAddress = remoteAddress(request);
      const localRequest = isLoopbackAddress(requestAddress);
      if (!localRequest && !accessManager.sharingEnabled) {
"""
    native = """      const requestAddress = remoteAddress(request);
      const localRequest = isLoopbackAddress(requestAddress);
      const nativeCorsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      };
      if (pathname.startsWith('/api/native/')) {
        if (!localRequest) return json(response, 403, { error: 'Native EFB bridge is loopback-only.' }, nativeCorsHeaders);
        if (request.method === 'OPTIONS') {
          response.writeHead(204, nativeCorsHeaders);
          response.end();
          return;
        }
        if (pathname === '/api/native/health' && request.method === 'GET') {
          routeSync.touchNative();
          return json(response, 200, { status: 'ok', name: 'Flight Deck EFB', version: APP_VERSION, routeBridge: true }, nativeCorsHeaders);
        }
        if (pathname === '/api/native/route' && request.method === 'POST') {
          try {
            const body = await readJsonBody(request);
            const route = routeSync.ingestMsfsRoute(body.route ?? body);
            return json(response, 200, { accepted: true, routeSync: route }, nativeCorsHeaders);
          } catch (error) {
            return json(response, 422, { error: error.message }, nativeCorsHeaders);
          }
        }
        if (pathname === '/api/native/avionics-sync' && request.method === 'POST') {
          try {
            const body = await readJsonBody(request);
            const route = routeSync.markAvionicsSync(body.route ?? body);
            return json(response, 200, { accepted: true, routeSync: route }, nativeCorsHeaders);
          } catch (error) {
            return json(response, 422, { error: error.message }, nativeCorsHeaders);
          }
        }
        if (pathname === '/api/native/flight-deck-route' && request.method === 'GET') {
          routeSync.touchNative();
          return json(response, 200, { route: routeSync.currentFlightDeckRoute(), routeSync: routeSync.publicStatus() }, nativeCorsHeaders);
        }
        return json(response, 404, { error: 'Native EFB bridge endpoint not found.' }, nativeCorsHeaders);
      }
      if (!localRequest && !accessManager.sharingEnabled) {
"""
    text = replace_once(text, anchor, native, 'native loopback endpoints')
    text = replace_once(
        text,
        "      groundSafety.stop();\n      automation.stop();",
        "      flightIntelligence.stop();\n      routeSync.stop();\n      groundSafety.stop();\n      automation.stop();",
        'phase3 service stop',
    )
    return text


update('src/server.mjs', patch_server)


# -----------------------------------------------------------------------------
# UI markup: intelligence, route sync, assistant, turnaround and settings
# -----------------------------------------------------------------------------
def patch_index(text):
    text = text.replace('1.6.0', '1.7.0')
    home_anchor = '          <div class="launcher-section-heading"><div><small>FLIGHT BAG</small><h2 data-i18n="applications">Applications</h2></div><span><i></i><b id="home-atc-detail">Waiting for data source</b></span></div>'
    home_card = '''          <article class="home-assistant-card efb-card">
            <div class="section-title"><div><small>LOCAL FLIGHT INTELLIGENCE</small><h2>Flight Assistant</h2></div><span id="home-assistant-status" class="module-status connected">CLEAR</span></div>
            <p id="home-assistant-detail">No operational advisories.</p>
            <div id="home-assistant-list" class="flight-assistant-list"><p class="empty-list">No active advisories.</p></div>
            <small class="safety-note">Advisory only · no cloud AI and no automatic simulator control.</small>
          </article>

''' + home_anchor
    text = replace_once(text, home_anchor, home_card, 'home assistant card')

    phase_rail = '            <div id="flight-phase-rail" class="flight-phase-rail" aria-label="Flight phases"></div>'
    intelligence_cards = phase_rail + '''
            <div class="phase3-flight-grid">
              <article class="efb-card flight-intelligence-card"><div class="section-title"><div><small>AUTOMATIC PHASE ENGINE</small><h3>Flight Intelligence</h3></div><span id="flight-intelligence-status" class="module-status waiting">WAITING</span></div><div class="bridge-facts"><span><small>STABLE PHASE</small><b id="flight-intelligence-phase">—</b></span><span><small>RAW SIGNAL</small><b id="flight-intelligence-raw">—</b></span><span><small>CONFIDENCE</small><b id="flight-intelligence-confidence">—</b></span></div><p id="flight-intelligence-detail">Waiting for simulator state.</p><small id="flight-intelligence-evidence" class="phase3-evidence">—</small></article>
              <article class="efb-card route-sync-card"><div class="section-title"><div><small>MSFS 2024 PLANNED ROUTE API</small><h3>Route Bridge</h3></div><span id="route-sync-status" class="module-status waiting">WAITING</span></div><div class="route-sync-facts"><span><small>FLIGHT DECK</small><b id="route-sync-flightdeck">—</b></span><span><small>MSFS EFB</small><b id="route-sync-msfs">—</b></span><span><small>MATCH</small><b id="route-sync-match">—</b></span><span><small>AVIONICS SYNC</small><b id="route-sync-avionics">—</b></span></div><p id="route-sync-detail">Open the native Flight Deck app in the MSFS 2024 EFB to compare routes.</p><div id="route-sync-differences" class="route-sync-differences"></div><small class="safety-note">Flight Deck reads the documented EFB route and observes native avionics sync. Direct route-write APIs that are not fully documented are not used.</small></article>
            </div>'''
    text = replace_once(text, phase_rail, intelligence_cards, 'phase3 flight cards')

    ground_anchor = '            <article class="efb-card ground-safety-card">'
    turnaround = '''            <article class="efb-card turnaround-card"><div class="section-title"><div><small>PHASE-AWARE GROUND OPS</small><h2>Turnaround Coordinator</h2></div><span id="turnaround-status" class="module-status waiting">WAITING</span></div><div class="turnaround-stage"><span><small>CURRENT STAGE</small><strong id="turnaround-stage">—</strong></span><b id="turnaround-progress">0%</b></div><div class="turnaround-progress-track"><i id="turnaround-progress-bar"></i></div><p id="turnaround-detail">Waiting for aircraft and ground-service state.</p><div class="turnaround-next"><small>NEXT RECOMMENDED STEP</small><strong id="turnaround-next">—</strong></div><div id="turnaround-blockers" class="turnaround-blockers"></div><small class="safety-note">Flight Deck coordinates and advises. It never starts/cancels GSX services automatically.</small></article>
''' + ground_anchor
    text = replace_once(text, ground_anchor, turnaround, 'turnaround card')

    settings_anchor = '                <div><i id="settings-adapter-dot"></i><span><strong>Aircraft Adapters</strong><small id="settings-adapter">Fenix / PMDG wird erkannt</small></span></div>'
    settings = settings_anchor + '''
                <div><i id="settings-intelligence-dot"></i><span><strong>Flight Intelligence</strong><small id="settings-intelligence">Automatische Phase wird validiert</small></span></div>
                <div><i id="settings-route-sync-dot"></i><span><strong>MSFS EFB Route Bridge</strong><small id="settings-route-sync">Native EFB-App noch nicht verbunden</small></span></div>'''
    text = replace_once(text, settings_anchor, settings, 'phase3 settings rows')
    text = text.replace('Microsoft Flight Simulator, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix, PMDG, GSX, Little Navmap, VATSIM and IVAO', 'Microsoft Flight Simulator, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix, PMDG, GSX, Little Navmap, VATSIM and IVAO')
    return text


update('public/index.html', patch_index)


# -----------------------------------------------------------------------------
# Client UI bindings and rendering
# -----------------------------------------------------------------------------
def patch_app(text):
    text = text.replace('1.6.0', '1.7.0')
    text = replace_once(
        text,
        "  settingsAdapterDot: $('#settings-adapter-dot'),\n  settingsAtcDot: $('#settings-atc-dot'),",
        "  settingsAdapterDot: $('#settings-adapter-dot'),\n  settingsIntelligenceDot: $('#settings-intelligence-dot'),\n  settingsRouteSyncDot: $('#settings-route-sync-dot'),\n  settingsAtcDot: $('#settings-atc-dot'),",
        'phase3 settings dot bindings',
    )
    text = replace_once(
        text,
        "  settingsAdapter: $('#settings-adapter'),\n  settingsAtc: $('#settings-atc'),",
        "  settingsAdapter: $('#settings-adapter'),\n  settingsIntelligence: $('#settings-intelligence'),\n  settingsRouteSync: $('#settings-route-sync'),\n  settingsAtc: $('#settings-atc'),",
        'phase3 settings bindings',
    )
    text = replace_once(
        text,
        "  homePhaseActions: $('#home-phase-actions'),\n  flightPhaseTitle:",
        "  homePhaseActions: $('#home-phase-actions'),\n  homeAssistantStatus: $('#home-assistant-status'),\n  homeAssistantDetail: $('#home-assistant-detail'),\n  homeAssistantList: $('#home-assistant-list'),\n  flightIntelligenceStatus: $('#flight-intelligence-status'),\n  flightIntelligencePhase: $('#flight-intelligence-phase'),\n  flightIntelligenceRaw: $('#flight-intelligence-raw'),\n  flightIntelligenceConfidence: $('#flight-intelligence-confidence'),\n  flightIntelligenceDetail: $('#flight-intelligence-detail'),\n  flightIntelligenceEvidence: $('#flight-intelligence-evidence'),\n  routeSyncStatus: $('#route-sync-status'),\n  routeSyncFlightdeck: $('#route-sync-flightdeck'),\n  routeSyncMsfs: $('#route-sync-msfs'),\n  routeSyncMatch: $('#route-sync-match'),\n  routeSyncAvionics: $('#route-sync-avionics'),\n  routeSyncDetail: $('#route-sync-detail'),\n  routeSyncDifferences: $('#route-sync-differences'),\n  turnaroundStatus: $('#turnaround-status'),\n  turnaroundStage: $('#turnaround-stage'),\n  turnaroundProgress: $('#turnaround-progress'),\n  turnaroundProgressBar: $('#turnaround-progress-bar'),\n  turnaroundDetail: $('#turnaround-detail'),\n  turnaroundNext: $('#turnaround-next'),\n  turnaroundBlockers: $('#turnaround-blockers'),\n  flightPhaseTitle:",
        'phase3 UI bindings',
    )
    marker = 'function renderState(state) {'
    if marker not in text:
        raise SystemExit('renderState marker missing')
    renderer = r'''function phase3RouteLabel(route) {
  if (!route) return '—';
  const from = route.departureAirport || '—';
  const to = route.destinationAirport || '—';
  return `${from} → ${to}`;
}

function phase3StatusClass(value) {
  const status = String(value || '').toLowerCase();
  if (['ready', 'matched', 'stable', 'clear', 'complete', 'connected'].includes(status)) return 'connected';
  if (['attention', 'warning', 'critical', 'different', 'error'].includes(status)) return 'attention';
  return 'waiting';
}

function renderPhase3(state) {
  const intelligence = state.integrations?.flightIntelligence || {};
  const routeSync = state.integrations?.routeSync || {};
  const turnaround = state.integrations?.turnaround || {};
  const assistant = state.integrations?.flightAssistant || {};

  if (elements.flightIntelligenceStatus) {
    elements.flightIntelligenceStatus.className = `module-status ${phase3StatusClass(intelligence.status)}`;
    elements.flightIntelligenceStatus.textContent = String(intelligence.status || 'waiting').toUpperCase();
    elements.flightIntelligencePhase.textContent = String(intelligence.phase || '—').toUpperCase();
    elements.flightIntelligenceRaw.textContent = String(intelligence.rawPhase || '—').toUpperCase();
    elements.flightIntelligenceConfidence.textContent = Number.isFinite(Number(intelligence.confidence)) ? `${Math.round(Number(intelligence.confidence) * 100)}%` : '—';
    elements.flightIntelligenceDetail.textContent = intelligence.detail || 'Waiting for simulator state.';
    elements.flightIntelligenceEvidence.textContent = (intelligence.evidence || []).join(' · ') || '—';
  }

  if (elements.routeSyncStatus) {
    elements.routeSyncStatus.className = `module-status ${phase3StatusClass(routeSync.status)}`;
    elements.routeSyncStatus.textContent = String(routeSync.status || 'waiting').replace(/-/g, ' ').toUpperCase();
    elements.routeSyncFlightdeck.textContent = phase3RouteLabel(routeSync.flightDeckRoute);
    elements.routeSyncMsfs.textContent = phase3RouteLabel(routeSync.msfsEfbRoute);
    elements.routeSyncMatch.textContent = Number.isFinite(Number(routeSync.comparison?.matchPercent)) ? `${Math.round(routeSync.comparison.matchPercent)}%` : '—';
    elements.routeSyncAvionics.textContent = routeSync.avionicsSync?.lastAt ? formatTime(routeSync.avionicsSync.lastAt) : '—';
    elements.routeSyncDetail.textContent = routeSync.detail || 'Open the native MSFS EFB app to compare routes.';
    elements.routeSyncDifferences.replaceChildren();
    for (const item of routeSync.comparison?.mismatches || []) {
      const row = document.createElement('span');
      row.innerHTML = `<b>${escapeHtml(String(item.field || 'route').toUpperCase())}</b><small>${escapeHtml(item.flightDeck || '—')} ↔ ${escapeHtml(item.msfsEfb || '—')}</small>`;
      elements.routeSyncDifferences.append(row);
    }
  }

  if (elements.turnaroundStatus) {
    elements.turnaroundStatus.className = `module-status ${phase3StatusClass(turnaround.status)}`;
    elements.turnaroundStatus.textContent = String(turnaround.status || 'waiting').toUpperCase();
    elements.turnaroundStage.textContent = String(turnaround.stage || '—').replace(/-/g, ' ').toUpperCase();
    const progress = Math.max(0, Math.min(100, Number(turnaround.progressPercent) || 0));
    elements.turnaroundProgress.textContent = `${Math.round(progress)}%`;
    elements.turnaroundProgressBar.style.width = `${progress}%`;
    elements.turnaroundDetail.textContent = turnaround.detail || 'Waiting for aircraft and ground-service state.';
    elements.turnaroundNext.textContent = turnaround.recommendedNext || '—';
    elements.turnaroundBlockers.replaceChildren();
    for (const blocker of turnaround.blockers || []) {
      const chip = document.createElement('span');
      chip.textContent = blocker;
      elements.turnaroundBlockers.append(chip);
    }
  }

  if (elements.homeAssistantStatus) {
    elements.homeAssistantStatus.className = `module-status ${phase3StatusClass(assistant.status)}`;
    elements.homeAssistantStatus.textContent = String(assistant.status || 'clear').toUpperCase();
    elements.homeAssistantDetail.textContent = assistant.detail || 'No operational advisories.';
    elements.homeAssistantList.replaceChildren();
    for (const item of assistant.advisories || []) {
      const row = document.createElement('article');
      row.className = `flight-assistant-item ${item.severity || 'info'}`;
      const copy = document.createElement('span');
      copy.innerHTML = `<strong>${escapeHtml(item.title || 'ADVISORY')}</strong><small>${escapeHtml(item.detail || '')}</small>`;
      row.append(copy);
      if (item.action && isAppEnabled(item.action)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'OPEN';
        button.addEventListener('click', () => switchModule(item.action));
        row.append(button);
      }
      elements.homeAssistantList.append(row);
    }
    if (!elements.homeAssistantList.childElementCount) elements.homeAssistantList.innerHTML = '<p class="empty-list">No active advisories.</p>';
  }

  if (elements.settingsIntelligenceDot) {
    setStatusDot(elements.settingsIntelligenceDot, intelligence.status === 'stable' ? 'ready' : intelligence.status);
    elements.settingsIntelligence.textContent = intelligence.detail || 'Automatic flight phase is waiting for data';
  }
  if (elements.settingsRouteSyncDot) {
    setStatusDot(elements.settingsRouteSyncDot, routeSync.status === 'ready' ? 'ready' : routeSync.status);
    elements.settingsRouteSync.textContent = routeSync.detail || 'Native MSFS EFB app not connected';
  }
}

'''
    text = text.replace(marker, renderer + marker, 1)
    text = replace_once(text, marker, marker + '\n  renderPhase3(state);', 'render phase3 from renderState')
    return text


update('public/app.js', patch_app)


# -----------------------------------------------------------------------------
# Phase 3 styles
# -----------------------------------------------------------------------------
def patch_styles(text):
    return text + r'''

/* Phase 3 · Native EFB bridge, flight intelligence and local assistant */
.home-assistant-card { margin-top: 14px; }
.flight-assistant-list { display: grid; gap: 8px; margin: 10px 0; }
.flight-assistant-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,.025); }
.flight-assistant-item > span { display: grid; gap: 3px; min-width: 0; }
.flight-assistant-item strong { font-size: 11px; letter-spacing: .05em; }
.flight-assistant-item small { color: var(--muted); line-height: 1.35; }
.flight-assistant-item button { flex: 0 0 auto; border: 1px solid var(--line); border-radius: 7px; padding: 6px 9px; background: transparent; color: var(--text); font-size: 9px; font-weight: 700; letter-spacing: .06em; }
.flight-assistant-item.caution { border-color: rgba(255,200,87,.4); }
.flight-assistant-item.warning, .flight-assistant-item.critical { border-color: rgba(255,92,108,.55); background: rgba(255,92,108,.06); }

.phase3-flight-grid { display: grid; grid-template-columns: minmax(0, .82fr) minmax(0, 1.18fr); gap: 12px; margin: 12px 0; }
.phase3-evidence { display: block; margin-top: 9px; color: var(--muted); line-height: 1.45; letter-spacing: .025em; }
.route-sync-facts { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; margin: 12px 0; }
.route-sync-facts > span { display: grid; gap: 3px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: rgba(255,255,255,.025); }
.route-sync-facts small { color: var(--muted); font-size: 9px; letter-spacing: .06em; }
.route-sync-facts b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.route-sync-differences { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.route-sync-differences > span { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 5px 8px; border: 1px solid rgba(255,200,87,.28); border-radius: 999px; background: rgba(255,200,87,.045); }
.route-sync-differences b { font-size: 8px; letter-spacing: .06em; }
.route-sync-differences small { color: var(--muted); font-size: 9px; }

.turnaround-stage { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-top: 8px; }
.turnaround-stage > span { display: grid; gap: 2px; }
.turnaround-stage small, .turnaround-next small { color: var(--muted); font-size: 9px; letter-spacing: .06em; }
.turnaround-stage strong { font-size: 17px; }
.turnaround-stage > b { font-size: 22px; font-variant-numeric: tabular-nums; }
.turnaround-progress-track { height: 6px; margin: 10px 0 12px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.08); }
.turnaround-progress-track > i { display: block; width: 0; height: 100%; border-radius: inherit; background: currentColor; transition: width .35s ease; }
.turnaround-next { display: grid; gap: 3px; margin-top: 12px; padding: 10px 11px; border: 1px solid var(--line); border-radius: 9px; background: rgba(255,255,255,.025); }
.turnaround-blockers { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.turnaround-blockers > span { padding: 4px 7px; border: 1px solid rgba(255,200,87,.32); border-radius: 999px; color: var(--muted); font-size: 9px; }

@media (max-width: 980px) {
  .phase3-flight-grid { grid-template-columns: 1fr; }
  .route-sync-facts { grid-template-columns: repeat(2, minmax(0,1fr)); }
}

@media (max-width: 560px) {
  .route-sync-facts { grid-template-columns: 1fr 1fr; }
  .flight-assistant-item { align-items: flex-start; }
}
'''


update('public/styles.css', patch_styles)


# -----------------------------------------------------------------------------
# Service-worker/app version sweep
# -----------------------------------------------------------------------------
def patch_service_worker(text):
    return text.replace('flight-deck-efb-v160', 'flight-deck-efb-v170').replace('1.6.0', '1.7.0')


update('public/service-worker.js', patch_service_worker)


# -----------------------------------------------------------------------------
# Package metadata
# -----------------------------------------------------------------------------
def patch_package(text):
    data = json.loads(text)
    data['version'] = '1.7.0'
    data['description'] = 'Flight Deck EFB for MSFS with native MSFS 2024 EFB route bridging, flight intelligence, turnaround coordination, taxi safety and guarded simulator integrations.'
    return json.dumps(data, indent=2, ensure_ascii=False) + '\n'


update('package.json', patch_package)


# -----------------------------------------------------------------------------
# Changelog
# -----------------------------------------------------------------------------
def patch_changelog(text):
    marker = '# Flight Deck EFB changelog\n\n'
    entry = '''## 1.7.0 — Phase 3 Native EFB & Flight Intelligence

- Upgraded the MSFS 2024 native EFB source from a fixed-port iframe wrapper to a native route bridge with automatic Flight Deck host discovery across ports 39871–39890.
- Added documented `GET_EFB_ROUTE` ingestion and `AvionicsRouteSync` observation for the MSFS 2024 Planned Route API. Flight Deck intentionally does not call route-write methods that remain incompletely documented/stubbed by the SDK.
- Added a local Route Sync Service that normalizes the MSFS EFB route, builds the current Flight Deck/SimBrief route and compares airports, runways, procedures and enroute waypoints without exposing connector credentials.
- Added a stabilized Flight Intelligence engine with phase-transition dwell/hysteresis on top of MSFS, ATC and route context. Manual phase override still has priority and existing phase-triggered automations automatically use the stabilized phase.
- Added a Turnaround Coordinator that combines flight-plan, aircraft and documented GSX state into departure/arrival progress, blockers and the next recommended step without remotely starting/cancelling GSX services.
- Added a local, advisory-only Flight Assistant for Ground Safety, route mismatch, projected fuel reserve, arrival weather, flight-plan/route readiness and turnaround recommendations.
- Added Flight Intelligence and Route Bridge cards to Flight Hub, Turnaround Coordinator to Ground Services and Flight Assistant advisories to Home.
- Added loopback-only native EFB bridge endpoints with explicit CORS handling; they expose route/status data only and never credentials or Windows update controls.
- Updated diagnostics, privacy, legal notices, native-EFB build instructions, version strings and cache identifiers for 1.7.0.

'''
    return replace_once(text, marker, marker + entry, 'changelog header')


update('CHANGELOG.md', patch_changelog)


# -----------------------------------------------------------------------------
# README, privacy and third-party notices
# -----------------------------------------------------------------------------
Path('README.md').write_text(r'''# Flight Deck EFB

**Current release: 1.7.0 — Phase 3 Native EFB & Flight Intelligence**

Flight Deck EFB is a Windows companion and responsive Electronic Flight Bag for Microsoft Flight Simulator 2020/2024. The Windows host owns SimConnect, local data and guarded integrations; the same Flight Deck interface can be used in the desktop app, a browser, an iPad/iPhone, Android device and — with the optional SDK-built adapter — directly inside the native MSFS 2024 EFB.

> **Flight simulation use only — not for real-world navigation.**

## 1.7.0 highlights

- **Native MSFS 2024 EFB Route Bridge:** the in-simulator app discovers the Windows host automatically, reads the current MSFS EFB route with the documented `GET_EFB_ROUTE` API and reports the documented `AvionicsRouteSync` event.
- **Route comparison:** Flight Deck normalizes the MSFS EFB route and compares it locally with the current SimBrief/Flight Deck route: origin/destination, runways, SID/STAR and enroute waypoint overlap.
- **Safe FMS/EFB sync model:** Flight Deck observes the simulator's native **Sync Route To Avionics** flow. Direct route-write calls that are still incompletely documented by the SDK are deliberately not invoked.
- **Automatic Flight Intelligence:** automatic phases are stabilized with transition dwell/hysteresis using MSFS aircraft state, ATC state and route context. Manual override still wins.
- **Turnaround Coordinator:** departure/arrival progress, open blockers and the next recommended ground step are derived from aircraft state, OFP and documented GSX service data. Flight Deck does not automatically start/cancel GSX services.
- **Flight Assistant:** local rule-based operational advisories for Ground Safety, route mismatch, fuel reserve projection, arrival weather, flight-plan readiness and turnaround context. No cloud LLM is used and the assistant cannot independently control the simulator.

## Core features

### Flight operations
- Flight Journey Hub with stabilized automatic phase inference, manual override, phase checklists, readiness, timeline, ETA/fuel/weather context and flight notes.
- SimBrief latest-OFP import with route, SID/STAR, runways, alternate, cruise planning, navlog coordinates, fuel/weight/timing and METAR/TAF fields.
- Native MSFS EFB route comparison and avionics-sync observation when the optional MSFS 2024 EFB adapter is installed.
- Persistent flight tracking/archive with planned route, actual track, weather snapshots, aircraft telemetry and GPX/JSON export.
- New Flight safely closes/clears active operational state while preserving application setup and archive data.

### Flight Assistant
The Flight Assistant is a deterministic local advisory engine, not a chat bot. It combines already available Flight Deck state and can surface:
- Ground/Taxi Safety alerts;
- MSFS EFB vs Flight Deck route differences;
- projected landing fuel below/near planned reserve;
- missing arrival weather during descent/approach;
- missing flight-plan/native-route readiness; and
- the next Turnaround Coordinator recommendation.

It never sends a simulator command by itself.

### Taxi and airport operations
- Exact SayIntentions taxi paths when available, BeyondATC local-log compatibility and manually entered clearances.
- Local taxi planning without an ATC client: stand/aircraft → runway, runway → stand, or custom map point → map point.
- MSFS airport facility data (taxi names/points/paths, parking, hold positions, jetways and VDGS) merged with OpenStreetMap geometry and OurAirports fallback metadata.
- Ground Safety for route deviation, excessive taxi speed, hold-short approach, stand approach and close moving ground traffic.

### ATC, traffic and weather
- SayIntentions SAPI flight/parking/weather/frequency/communications integration with a deduplicated per-flight message history.
- Read-only VATSIM/IVAO controller, ATIS and relevant-pilot data.
- SimConnect traffic plus an all-object fallback for compatible injected/live/add-on traffic.
- AviationWeather.gov METAR/TAF fallback.
- Optional Little Navmap local WebAPI cross-check and airport metadata enrichment.

### Aircraft and ground adapters
- **Generic SimConnect:** core telemetry, COM/XPDR, MSFS 2024 Input Events, approved variables and guarded one-shot actions.
- **Fenix:** official Remote EFB/Web MCDU plus currently enumerated MSFS Input Events; no unofficial Fenix variable catalog is bundled.
- **PMDG:** local SDK discovery for supported installed PMDG packages; event IDs are generated from the user's own local SDK header at runtime and SDK source is never redistributed.
- **GSX:** local installation/Couatl readiness, documented live service states and explicit passenger-target synchronization.
- **Turnaround Coordinator:** reads the above state and recommends the next ground step; it does not emulate the GSX menu.
- **Automations:** Off/Test/Armed modes, phase/app/ATC/variable triggers, cooldowns and operational guards. Stabilized Phase-3 flight phases feed existing `phase-enter` triggers automatically. Armed resets to Test after restart, new flight or aircraft change.

## Install / update Windows

1. Open the latest GitHub Release and run **`Flight-Deck-EFB-Setup-1.7.0.exe`**.
2. Windows SmartScreen can warn because the current build is not code-signed. Review the source/publisher before running it.
3. Start **Flight Deck EFB**. The Windows app starts the local host used by the desktop UI and second screens.
4. Allow private-network firewall access only when you want tablet/second-screen LAN access.
5. Complete first-run setup and optionally save your SimBrief Pilot ID/username.

The per-user installer upgrades the existing installation in place and retains normal local settings, paired-device tokens, cached airports and flight archive. The installed app uses the GitHub Release channel through `electron-updater`; `latest.yml` and the NSIS blockmap are published with every release.

## Native MSFS 2024 EFB app

Source for the optional in-simulator adapter is in `MSFS-2024-EFB-App/`. Microsoft SDK template/build files are intentionally not redistributed. Build that source against the EFB template installed with your own current MSFS 2024 SDK; detailed steps and route-API safety limits are in `MSFS-2024-EFB-App/README.md`.

The native app:
- discovers the Windows host on `127.0.0.1:39871–39890`;
- embeds the same Flight Deck UI;
- reads the current simulator EFB route through `GET_EFB_ROUTE`;
- sends that sanitized route only to the loopback Flight Deck host for comparison; and
- observes `AvionicsRouteSync` when MSFS reports the native EFB route was synchronized to avionics.

Flight Deck does not use legacy GPS write variables and does not call MSFS Planned Route write operations while those SDK interfaces remain incompletely documented.

## iPad / Android / second monitor

Use the Share button in the Windows app. Scan the QR code, connect over the same private network and enter the displayed six-digit pairing PIN once. Each paired device receives an individually revocable local token. LAN sharing can be disabled from Settings.

The native MSFS EFB bridge is different: its `/api/native/*` endpoints are loopback-only, expose only health/route bridge data and do not expose connector credentials or updater controls.

## Connector setup

### SayIntentions
Flight Deck detects the local SayIntentions flight endpoint and uses official SAPI data exposed for the active flight. API credentials remain host-side.

### BeyondATC
The compatibility connector is local and read-only. Override a non-standard log location with:

```text
BEYONDATC_LOG_DIR=C:\path\to\BeyondATC
```

### Little Navmap
Enable the Little Navmap web server. Flight Deck checks the local WebAPI on port 8965. Little Navmap is optional and never replaces SimConnect.

### Fenix
Load a Fenix A319/A320/A321 and keep the Fenix application running. The official Remote EFB/Web MCDU is expected on `http://127.0.0.1:8083/` on the Windows host.

### PMDG
Flight Deck scans common MSFS package roots for locally installed PMDG SDK headers. For a non-standard location:

```text
PMDG_PACKAGES_DIR=C:\path\to\Packages
```

Where the relevant PMDG product/SDK requires data broadcasting, enable it according to that product's own documentation. Flight Deck reports the local status and does not rewrite PMDG configuration files.

### GSX Pro
GSX is detected in usual FSDT Addon Manager locations. For a custom location:

```text
GSX_ADDON_MANAGER=C:\path\to\Addon Manager
```

Flight Deck reads documented GSX state/passenger/cargo variables and can explicitly set the documented GSX passenger target from SimBrief. Starting, cancelling or sequencing services remains in the native GSX/aircraft workflow.

### Navigraph
Standalone chart embedding remains disabled pending a separately approved, license-compliant integration.

## Data flow and privacy

Local by default:
- MSFS telemetry, facilities, traffic and Input Events → SimConnect;
- native MSFS EFB route → local loopback Route Bridge;
- Flight Intelligence, Turnaround Coordinator and Flight Assistant → local state evaluation only;
- Fenix Remote EFB → local/private port 8083;
- PMDG SDK discovery → local installed files only;
- GSX discovery/live variables → local installation + SimConnect;
- Little Navmap → local WebAPI;
- flight archive, settings and paired-device tokens → Windows application data.

Optional internet services include SimBrief, SayIntentions SAPI, AviationWeather.gov, VATSIM/IVAO public feeds, OpenStreetMap/Overpass map data and GitHub Releases for updates.

The support bundle intentionally excludes API keys, access tokens, ATC message contents, flight notes, PMDG SDK source and full local file paths. See `PRIVACY.md` for details.

## Safety model

- Ground Safety and Flight Assistant are **advisory only**.
- ATC clearance, airport markings/signage, charts and pilot judgement always take precedence.
- Route Bridge reads documented route state and observes the simulator's native avionics-sync event; it does not force undocumented FMS/EFB writes.
- Turnaround Coordinator never starts or cancels GSX services.
- Active radio changes and aircraft-adapter controls require an explicit action.
- Automation defaults to Test mode and uses allowlists/guards before any simulator write.
- Manual flight-phase override has priority over automatic Flight Intelligence.

## Development

Requirements: Node.js 22+ (release CI currently uses Node.js 24).

```text
npm install
npm run prepare-data
node src/server.mjs --demo --open
npm start
npm run dist
```

`src/server.mjs` is the shared host. `src/state-engine.mjs` owns normalized public state. `src/route-sync-service.mjs` owns the Phase-3 route comparison bridge and `src/flight-intelligence-engine.mjs` owns stabilized phases, turnaround coordination and Flight Assistant evaluation. The optional native simulator source is under `MSFS-2024-EFB-App`.

## Legal

Copyright © 2026 Christoph Heckner.

Application code is distributed under the included MIT License. Third-party libraries/data keep their own licenses; see `THIRD_PARTY_NOTICES.md`. Microsoft Flight Simulator, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix, PMDG, GSX, Little Navmap, VATSIM and IVAO are names/trademarks of their respective owners and are referenced only to identify compatibility. Flight Deck EFB is independent and is not endorsed by or affiliated with those providers unless explicitly stated.
''', encoding='utf-8')

Path('PRIVACY.md').write_text(r'''# Flight Deck EFB — Privacy and data flow

Effective for version 1.7.0 (25 August 2026)

Flight Deck EFB is a local companion for flight simulation. The Windows host stores settings, paired-device tokens, cached airport data, automation rules, flight recordings and the optional SimBrief identifier in the current Windows user's application-data folder. Normal application updates keep this data. **New Flight** resets the current operational session but does not delete the archive or application preferences.

## Connections and local reads

Depending on selected features, Flight Deck EFB can use:

- Microsoft Flight Simulator through the local SimConnect interface;
- the optional native MSFS 2024 EFB app. Its loopback-only bridge reads the current EFB route through the documented Planned Route read API and reports the simulator's avionics-route-sync event to the Windows host;
- local SayIntentions flight data and SAPI endpoints for the active flight;
- local BeyondATC log files in read-only compatibility mode;
- the Fenix Remote EFB/Web MCDU on a local/private address using port 8083;
- locally installed PMDG SDK header/options files to discover controls and SDK Data Broadcast readiness. Flight Deck does not upload or redistribute those files;
- local GSX/FSDreamTeam installation/Couatl state and documented GSX SimConnect variables. An explicit payload action can write the imported SimBrief passenger target to the documented GSX passenger-count variable;
- the local Little Navmap WebAPI when enabled;
- SimBrief for the latest OFP belonging to a user-supplied Pilot ID/username;
- AviationWeather.gov for METAR/TAF;
- VATSIM or IVAO public feeds only when selected;
- OpenStreetMap/Overpass and optional map imagery providers; and
- GitHub Releases for Windows update checks/downloads.

Navigraph chart functionality in the standalone build remains disabled unless a separately approved integration is available. Flight Deck EFB does not operate its own analytics, advertising or telemetry service.

## Native EFB route data

The native MSFS 2024 adapter can send a sanitized planned-route object to `127.0.0.1` for local comparison. Flight Deck stores only normalized route fields needed for the active session (airport/runway/procedure identifiers, cruise altitude and enroute waypoint identifiers/coordinates where provided). A New Flight session clears the previous simulator-EFB route comparison state.

The native bridge endpoints are loopback-only and do not expose connector credentials, paired-device tokens or update-management controls. Flight Deck does not upload the native route to a Flight Deck cloud service.

## Flight Intelligence, Turnaround and Flight Assistant

Automatic Flight Intelligence, Turnaround Coordinator and Flight Assistant evaluation run locally in the Windows host. They use already available simulator/ATC/route/weather/GSX state. The assistant is a deterministic advisory engine; it does not send these inputs to an OpenAI service or other cloud AI provider and it cannot independently control the simulator.

## Aircraft adapters and Ground Safety

Ground/Taxi Safety evaluation also runs locally. Fenix controls exposed by Flight Deck are limited to MSFS Input Events actually enumerated for the loaded aircraft. PMDG controls are derived from SDK headers installed on the user's PC. Full PMDG SDK source text and full local file paths are not returned to browser clients.

## Credentials and mobile access

The SayIntentions API key remains inside the Windows host process. Secrets/account tokens are not returned to tablet UI clients or included in support exports.

iPad, iPhone, Android and second-monitor browsers connect directly to the Windows host on the private LAN. Access is protected by a rotating pairing PIN and individually revocable device token. LAN sharing can be disabled in Settings. Do not expose the local host port to the public internet.

## Exports and deletion

Flight GPX/JSON exports and user-created backups are written only after an explicit action. The support export intentionally omits API keys, login tokens, ATC message content, flight notes, PMDG SDK source and full local file paths. Paired devices can be revoked in Settings. Local application data can be removed using in-app controls where available or by uninstalling Flight Deck and deleting its application-data folder.

Third-party providers process optional requests under their own privacy notices and terms. See `THIRD_PARTY_NOTICES.md` for licensing and compatibility notices.

Flight simulation use only — not for real-world navigation.
''', encoding='utf-8')

Path('THIRD_PARTY_NOTICES.md').write_text(r'''# Third-party notices — Flight Deck EFB 1.7.0

Flight Deck EFB is an independent flight-simulation companion. It is not affiliated with or endorsed by Microsoft/Asobo Studio, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix Simulations, PMDG, FSDreamTeam/GSX, Little Navmap, VATSIM, IVAO, OpenStreetMap, OurAirports or Esri unless explicitly stated otherwise.

## Bundled/open-source components

- Node.js — runtime/build tooling with applicable open-source licenses/notices.
- Electron — MIT; the Windows runtime also includes Chromium and applicable third-party notices.
- electron-updater and electron-builder — MIT; used for GitHub Release updates and Windows packaging. NSIS/generated installer components retain their own licenses.
- Leaflet — BSD-2-Clause.
- node-simconnect — LGPL-3.0-or-later.
- qrcode and runtime dependencies — their respective open-source licenses.
- OpenStreetMap airport geometry/map data — © OpenStreetMap contributors; ODbL/usage policies apply. Attribution is shown in the application.
- OurAirports airport/runway data — public-domain source data; the generated local catalog records source/generation metadata.
- Esri World Imagery — optional imagery; provider attribution/terms apply when selected.

## Optional compatibility interfaces and services

- Microsoft Flight Simulator / SimConnect — local simulator interface; Microsoft/Asobo terms and SDK terms apply.
- Microsoft Flight Simulator 2024 EFB / Planned Route API — optional native adapter source uses the installed SDK template and documented route-read/event interfaces. Microsoft SDK/template/build files are not redistributed by Flight Deck. Direct route-write APIs that remain incompletely documented/stubbed are deliberately not used.
- SayIntentions.AI — optional active-flight/SAPI compatibility. No SayIntentions credential/API key is distributed with Flight Deck.
- BeyondATC — optional local, read-only log compatibility. No BeyondATC code/assets are distributed.
- SimBrief — latest-OFP endpoint used with a Pilot ID/username; SimBrief/Navigraph terms apply.
- AviationWeather.gov — requested METAR/TAF data; provider terms/operational disclaimers apply.
- VATSIM and IVAO — official/public live-network feeds queried on user request; network API/data policies apply.
- Little Navmap — optional local WebAPI compatibility. Little Navmap code/data is not bundled.
- Fenix Simulations — compatibility uses the official local Remote EFB/Web MCDU and MSFS Input Events available from the user's installed/running aircraft. Flight Deck does not distribute a private/unofficial Fenix variable catalog.
- PMDG — compatibility discovers SDK header/options files already installed with the user's PMDG product. Flight Deck parses event identifiers at runtime and **does not bundle, copy or redistribute PMDG SDK source/header content**.
- FSDreamTeam/GSX — compatibility uses local installation/process detection and documented GSX variables. Flight Deck does not bundle GSX code/assets and does not emulate a general GSX remote-service API. Phase-3 Turnaround coordination remains advisory and does not automatically start/cancel GSX services.
- Navigraph — standalone chart embedding remains disabled pending an approved, license-compliant integration.

Product names and trademarks are property of their respective owners. Their appearance identifies optional compatibility only and does not imply sponsorship, certification or affiliation.

Copyright © 2026 Christoph Heckner. Flight Deck EFB application code is provided under the accompanying MIT License. That license does not relicense third-party data, trademarks, runtimes, SDKs, libraries, map imagery or service APIs.

The Electron distribution retains its runtime/Chromium notices. Individual dependency licenses remain with their packages and packaged resources as applicable. See `PRIVACY.md` for local storage, LAN/loopback access, optional network requests, native-route data flow, exports and deletion.

Flight simulation use only — not for real-world navigation.
''', encoding='utf-8')
