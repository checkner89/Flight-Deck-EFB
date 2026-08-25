from pathlib import Path
import json
import re


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Patch anchor missing: {label}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=0):
    next_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'Patch regex missing/ambiguous: {label} ({count})')
    return next_text


def update(path, transform):
    file = Path(path)
    old = file.read_text(encoding='utf-8')
    new = transform(old)
    if old == new:
        raise SystemExit(f'No changes produced for {path}')
    file.write_text(new, encoding='utf-8')


# -----------------------------------------------------------------------------
# SimConnect: isolated adapter/GSX variable groups and trusted internal writes
# -----------------------------------------------------------------------------
def patch_simconnect(text):
    text = replace_once(text,
        "const TRAFFIC_DATA_REQUEST = 48;\nconst AIRPORT_FACILITY_DEFINITION = 3_100;",
        "const TRAFFIC_DATA_REQUEST = 48;\nconst TRUSTED_WRITE_DEFINITION = 49;\nconst AIRPORT_FACILITY_DEFINITION = 3_100;",
        'trusted write definition')
    text = replace_once(text,
        "    this.customVariables = [];\n    this.eventIds = new Map();",
        "    this.customVariables = [];\n    this.variableGroups = new Map();\n    this.nextVariableGroupDefinition = 5_000;\n    this.eventIds = new Map();",
        'variable groups constructor')
    text = replace_once(text,
        "      this.#registerCustomVariableHandler(handle);\n      this.#registerCustomVariables(handle);\n      this.#registerFacilityHandler(handle);",
        "      this.#registerCustomVariableHandler(handle);\n      this.#registerVariableGroupHandler(handle);\n      this.#registerCustomVariables(handle);\n      for (const group of this.variableGroups.values()) this.#registerVariableGroup(handle, group);\n      this.#registerFacilityHandler(handle);",
        'register variable groups')
    anchor = """  configureVariables(variables = []) {
    this.customVariables = (Array.isArray(variables) ? variables : []).slice(0, 60).map((entry) => ({
      name: String(entry?.name || '').trim().slice(0, 120),
      unit: String(entry?.unit || 'number').trim().slice(0, 32),
    })).filter((entry) => /^(?:L:|Z:|[A-Z])[A-Z0-9_ .:@/-]{1,119}$/i.test(entry.name));
    if (this.handle) this.#registerCustomVariables(this.handle);
  }

"""
    insertion = anchor + """  configureVariableGroup(name, variables = []) {
    const groupName = String(name || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(groupName)) throw new Error('Variable group name is invalid.');
    const normalized = (Array.isArray(variables) ? variables : []).slice(0, 80).map((entry) => ({
      name: String(entry?.name || '').trim().slice(0, 120),
      unit: String(entry?.unit || 'number').trim().slice(0, 32),
    })).filter((entry) => /^(?:L:|Z:|[A-Z])[A-Z0-9_ .:@/-]{1,119}$/i.test(entry.name));
    let group = this.variableGroups.get(groupName);
    if (!group) {
      group = {
        name: groupName,
        definitionId: this.nextVariableGroupDefinition++,
        requestId: this.nextVariableGroupDefinition++,
        variables: [],
      };
    }
    group.variables = normalized;
    this.variableGroups.set(groupName, group);
    if (this.handle) this.#registerVariableGroup(this.handle, group);
    return { name: groupName, count: normalized.length };
  }

  async setTrustedVariable(name, value, unit = 'number') {
    if (!this.handle) throw new Error('SimConnect ist nicht verbunden.');
    const target = String(name || '').trim();
    const numeric = Number(value);
    if (!/^(?:L:|Z:)[A-Z0-9_ .:@/-]{1,119}$/i.test(target)) throw new Error('Interne Variable ist nicht freigegeben.');
    if (!Number.isFinite(numeric)) throw new Error('Variablenwert ist ungültig.');
    try { this.handle.clearDataDefinition(TRUSTED_WRITE_DEFINITION); } catch { /* Definition may not exist yet. */ }
    this.handle.addToDataDefinition(
      TRUSTED_WRITE_DEFINITION,
      target,
      String(unit || 'number'),
      SimConnectDataType.FLOAT64,
      0,
      SimConnectConstants.UNUSED,
    );
    const buffer = new RawBuffer(16);
    buffer.writeFloat64(numeric);
    this.handle.setDataOnSimObject(TRUSTED_WRITE_DEFINITION, SimConnectConstants.OBJECT_ID_USER, {
      buffer,
      arrayCount: 0,
      tagged: false,
    });
    return { target, value: numeric };
  }

  async transmitEventNumber(eventNumber, value = 0) {
    if (!this.handle) throw new Error('SimConnect ist nicht verbunden.');
    const numericEvent = Math.round(Number(eventNumber));
    if (!Number.isInteger(numericEvent) || numericEvent <= 0 || numericEvent > 0x7FFFFFFF) throw new Error('Event-ID ist ungültig.');
    const eventName = `#${numericEvent}`;
    let eventId = this.eventIds.get(eventName);
    if (!eventId) {
      eventId = this.nextEventId++;
      this.handle.mapClientEventToSimEvent(eventId, eventName);
      this.eventIds.set(eventName, eventId);
    }
    const numericValue = Math.max(0, Math.min(0xFFFFFFFF, Math.round(Number(value) || 0)));
    this.handle.transmitClientEvent(
      SimConnectConstants.OBJECT_ID_USER,
      eventId,
      numericValue,
      1,
      EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY,
    );
    return { eventNumber: numericEvent, value: numericValue };
  }

"""
    text = replace_once(text, anchor, insertion, 'simconnect adapter methods')
    insertion_anchor = """  #registerCustomVariableHandler(handle) {
"""
    group_methods = """  #registerVariableGroupHandler(handle) {
    handle.on('simObjectData', (received) => {
      const group = [...this.variableGroups.values()].find((entry) => entry.requestId === received.requestID);
      if (!group) return;
      try {
        const values = {};
        for (const variable of group.variables) values[variable.name] = received.data.readFloat64();
        this.engine.setIntegration(`${group.name}Variables`, {
          status: 'ready',
          values,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        this.engine.setIntegration(`${group.name}Variables`, {
          status: 'limited',
          error: error.message,
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  #registerVariableGroup(handle, group) {
    try { handle.clearDataDefinition(group.definitionId); } catch { /* Definition may not exist yet. */ }
    if (!group.variables.length) {
      this.engine.setIntegration(`${group.name}Variables`, { status: 'idle', values: {}, updatedAt: null });
      return;
    }
    try {
      for (const variable of group.variables) {
        this.#rememberOperation(handle.addToDataDefinition(
          group.definitionId,
          variable.name,
          variable.unit,
          SimConnectDataType.FLOAT64,
          0,
          SimConnectConstants.UNUSED,
        ), `${group.name}: ${variable.name}`, { optional: True });
      }
      this.#rememberOperation(handle.requestDataOnSimObject(
        group.requestId,
        group.definitionId,
        SimConnectConstants.OBJECT_ID_USER,
        SimConnectPeriod.SECOND,
        0,
        0,
        0,
        0,
      ), `${group.name}: Variablen anfordern`, { optional: True });
    } catch (error) {
      this.engine.setIntegration(`${group.name}Variables`, { status: 'limited', error: error.message });
    }
  }

""".replace('True', 'true')
    text = replace_once(text, insertion_anchor, group_methods + insertion_anchor, 'variable group handlers')
    return text

update('src/simconnect-client.mjs', patch_simconnect)


# -----------------------------------------------------------------------------
# State: default Phase 2 integrations + route-indexed hold short markers
# -----------------------------------------------------------------------------
def patch_state(text):
    fenix_anchor = """        fenix: {
          status: 'not-checked',
          reachable: false,
          url: null,
          detail: 'Fenix Remote EFB wird bei Bedarf verbunden',
        },
"""
    phase2_defaults = fenix_anchor + """        aircraftAdapter: {
          status: 'idle',
          active: 'generic',
          title: null,
          controlCount: 0,
          detail: 'Warte auf geladenes Flugzeug',
          fenix: { detected: false, reachable: false, url: null, inputEventCount: 0 },
          pmdg: { detected: false, activeFamily: null, broadcastEnabled: null, packages: [], controlCount: 0 },
        },
        groundSafety: {
          status: 'clear',
          highestSeverity: null,
          alerts: [],
          detail: 'Keine aktiven Ground-Safety-Warnungen',
        },
"""
    text = replace_once(text, fenix_anchor, phase2_defaults, 'phase2 state defaults')
    text = replace_once(text,
        "        lat: point.lat,\n        lon: point.lon,\n        label: runway ? `HOLD SHORT RWY ${runway}` : 'HOLD SHORT',",
        "        lat: point.lat,\n        lon: point.lon,\n        index: point.index,\n        label: runway ? `HOLD SHORT RWY ${runway}` : 'HOLD SHORT',",
        'explicit hold index')
    text = replace_once(text,
        "        lat: finalPoint.lat,\n        lon: finalPoint.lon,\n        label: runway ? `HOLD SHORT RWY ${runway}` : 'HOLD SHORT',\n        inferred: true,",
        "        lat: finalPoint.lat,\n        lon: finalPoint.lon,\n        index: path.length - 1,\n        label: runway ? `HOLD SHORT RWY ${runway}` : 'HOLD SHORT',\n        inferred: true,",
        'inferred hold index')
    return text

update('src/state-engine.mjs', patch_state)


# -----------------------------------------------------------------------------
# Server: adapter + safety lifecycle, APIs, diagnostics and GSX payload sync
# -----------------------------------------------------------------------------
def patch_server(text):
    text = replace_once(text,
        "import { LittleNavmapClient } from './littlenavmap-client.mjs';\n",
        "import { LittleNavmapClient } from './littlenavmap-client.mjs';\nimport { AircraftAdapterManager } from './aircraft-adapter-manager.mjs';\nimport { GroundSafetyEngine } from './ground-safety-engine.mjs';\n",
        'phase2 server imports')
    text = re.sub(r"const APP_VERSION = '[^']+';", "const APP_VERSION = '1.6.0';", text, count=1)
    text = replace_once(text,
        "  const littleNavmap = demo ? null : new LittleNavmapClient(engine);\n  const facilityMapCache = new Map();",
        "  const littleNavmap = demo ? null : new LittleNavmapClient(engine);\n  const aircraftAdapters = demo ? null : new AircraftAdapterManager(engine, { simConnect });\n  const groundSafety = new GroundSafetyEngine(engine);\n  const facilityMapCache = new Map();",
        'phase2 server instances')
    text = replace_once(text,
        "  await automation.start();\n  const updater = updateService || {",
        "  await automation.start();\n  groundSafety.start();\n  const updater = updateService || {",
        'ground safety start')
    text = replace_once(text,
        "      { id: 'little-navmap', label: 'Little Navmap WebAPI', status: state.integrations.littleNavmap?.status || 'waiting', detail: state.integrations.littleNavmap?.detail || '' },\n      { id: 'atc', label: 'ATC source',",
        "      { id: 'little-navmap', label: 'Little Navmap WebAPI', status: state.integrations.littleNavmap?.status || 'waiting', detail: state.integrations.littleNavmap?.detail || '' },\n      { id: 'aircraft-adapter', label: 'Aircraft Adapter (Fenix / PMDG)', status: state.integrations.aircraftAdapter?.status || 'idle', detail: state.integrations.aircraftAdapter?.detail || '' },\n      { id: 'ground-safety', label: 'Ground / Taxi Safety', status: state.integrations.groundSafety?.status === 'clear' ? 'ready' : state.integrations.groundSafety?.status || 'waiting', detail: state.integrations.groundSafety?.detail || '' },\n      { id: 'atc', label: 'ATC source',",
        'phase2 diagnostics')
    text = replace_once(text,
        "      safety: { automationMode: automation.publicConfiguration().mode, gsxRemoteControl: false, secretsIncluded: false },",
        "      safety: { automationMode: automation.publicConfiguration().mode, gsxRemoteControl: false, adapterControlRequiresExplicitRequest: true, groundSafetyAdvisoryOnly: true, secretsIncluded: false },",
        'support safety summary')
    api_anchor = """      if (pathname === '/api/simconnect/input-events' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const query = requestUrl.searchParams.get('q') || '';
        return json(response, 200, {
          connected: Boolean(simConnect?.handle),
          events: simConnect?.listInputEvents(query, { limit: requestUrl.searchParams.get('limit') }) || [],
        });
      }

"""
    api_insert = api_anchor + """      if (pathname === '/api/aircraft-adapter/status' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        return json(response, 200, { adapter: engine.publicState().integrations.aircraftAdapter });
      }

      if (pathname === '/api/aircraft-adapter/refresh' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!aircraftAdapters) return json(response, 409, { error: 'Aircraft Adapter ist im Demo-Modus nicht aktiv.' });
        try {
          return json(response, 200, { adapter: await aircraftAdapters.refresh(), state: engine.publicState() });
        } catch (error) {
          return json(response, 502, { error: error.message });
        }
      }

      if (pathname === '/api/aircraft-adapter/controls' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!aircraftAdapters) return json(response, 200, { controls: [] });
        const query = requestUrl.searchParams.get('q') || '';
        return json(response, 200, { controls: aircraftAdapters.listControls(query, { limit: requestUrl.searchParams.get('limit') }) });
      }

      if (pathname === '/api/aircraft-adapter/control' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!aircraftAdapters) return json(response, 409, { error: 'Aircraft Adapter ist im Demo-Modus nicht aktiv.' });
        try {
          const body = await readJsonBody(request);
          const result = await aircraftAdapters.executeControl({ id: body.id, value: body.value });
          return json(response, 200, { applied: true, result });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

"""
    text = replace_once(text, api_anchor, api_insert, 'adapter APIs')
    gsx_anchor = """      if (pathname === '/api/gsx/refresh' && request.method === 'POST') {
"""
    gsx_payload = """      if (pathname === '/api/gsx/payload-sync' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!gsx) return json(response, 409, { error: 'GSX-Connector ist im Demo-Modus nicht aktiv.' });
        const state = engine.publicState();
        const body = await readJsonBody(request);
        const passengers = body.passengers ?? state.integrations?.simbrief?.flight?.passengers;
        try {
          const result = await gsx.syncPayload({ passengers });
          return json(response, 200, { synced: true, result, gsx: engine.publicState().integrations.gsx });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

""" + gsx_anchor
    text = replace_once(text, gsx_anchor, gsx_payload, 'gsx payload API')
    fenix_pattern = r"      if \(pathname === '/api/fenix/check' && request\.method === 'POST'\) \{.*?\n      \}\n\n      if \(pathname === '/api/atc/provider'"
    fenix_replacement = """      if (pathname === '/api/fenix/check' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!aircraftAdapters) return json(response, 409, { error: 'Fenix Adapter ist im Demo-Modus nicht aktiv.' });
        const body = await readJsonBody(request);
        try {
          return json(response, 200, await aircraftAdapters.checkFenixRemote(body.url));
        } catch (error) {
          const detail = error.message || 'Fenix A32X ist nicht erreichbar.';
          engine.setIntegration('fenix', { status: 'disconnected', reachable: false, detail });
          return json(response, 502, { reachable: false, detail });
        }
      }

      if (pathname === '/api/atc/provider'"""
    text = sub_once(text, fenix_pattern, fenix_replacement, 'delegate fenix endpoint', flags=re.S)
    text = replace_once(text,
        "    gsx = new GsxClient(engine);",
        "    gsx = new GsxClient(engine, { simConnect });",
        'GSX SimConnect injection')
    text = replace_once(text,
        "    littleNavmap.start();\n    gsx.start();",
        "    littleNavmap.start();\n    aircraftAdapters.start();\n    gsx.start();",
        'adapter start')
    text = replace_once(text,
        "      littleNavmap.stop();\n      simConnect.stop();",
        "      littleNavmap.stop();\n      aircraftAdapters.stop();\n      simConnect.stop();",
        'adapter stop')
    text = replace_once(text,
        "      stopDemo();\n      navigraph.stop();",
        "      stopDemo();\n      navigraph.stop();",
        'demo stop anchor')
    text = replace_once(text,
        "      stopDataSources();\n      automation.stop();",
        "      stopDataSources();\n      groundSafety.stop();\n      automation.stop();",
        'ground safety stop')
    return text

update('src/server.mjs', patch_server)


# -----------------------------------------------------------------------------
# UI markup: 1.6.0, Aircraft Adapters, live GSX and Ground Safety
# -----------------------------------------------------------------------------
def patch_index(text):
    text = text.replace('1.5.0', '1.6.0')
    text = text.replace('v1.4.4', 'v1.6.0')
    text = replace_once(text,
        '<span class="app-tile-copy"><small>A32X</small><strong>Fenix Remote EFB</strong><span id="home-fenix-summary" data-i18n="fenixSummary">Connect the official local Fenix EFB</span></span>',
        '<span class="app-tile-copy"><small>FENIX · PMDG</small><strong>Aircraft Adapters</strong><span id="home-fenix-summary">Aircraft-specific local integrations</span></span>',
        'adapter launcher text')
    text = replace_once(text,
        '<header class="page-heading"><div><small>FENIX A32X</small><h1>Fenix Remote EFB</h1><p data-i18n="fenixIntro">Connect the official Fenix web EFB running locally with the aircraft.</p></div><span id="fenix-status-pill" class="module-status waiting">NOT CHECKED</span></header>\n          <div class="fenix-layout">',
        '<header class="page-heading"><div><small>AIRCRAFT-SPECIFIC CONNECTORS</small><h1>Aircraft Adapters</h1><p>Automatic Fenix and PMDG detection without bundling unofficial aircraft data.</p></div><span id="aircraft-adapter-status" class="module-status waiting">WAITING</span></header>\n          <div class="fenix-layout adapter-layout">\n            <article class="efb-card adapter-overview-card"><div class="section-title"><div><small>ACTIVE ADAPTER</small><h2 id="aircraft-adapter-model">Generic SimConnect</h2></div><span id="aircraft-adapter-source">GENERIC</span></div><p id="aircraft-adapter-detail">Warte auf geladenes Flugzeug.</p><div class="bridge-facts"><span><small>CONTROLS</small><b id="aircraft-adapter-controls">0</b></span><span><small>SAFETY</small><b>EXPLICIT ONLY</b></span></div><button id="aircraft-adapter-refresh" class="primary-card-action" type="button">ADAPTER PRÜFEN</button></article>',
        'adapter page header')
    text = replace_once(text,
        '<article class="efb-card fenix-connect-card"><div class="section-title"><h2 data-i18n="connection">Connection</h2><span>PORT 8083</span></div>',
        '<article class="efb-card fenix-connect-card"><div class="section-title"><div><small>FENIX A319 / A320 / A321</small><h2>Fenix Remote EFB</h2></div><span id="fenix-status-pill" class="module-status waiting">NOT CHECKED</span></div>',
        'fenix card header')
    text = replace_once(text,
        '            <article class="efb-card fenix-frame-card"><div class="fenix-frame-placeholder" id="fenix-placeholder">',
        '            <article class="efb-card pmdg-adapter-card"><div class="section-title"><div><small>LOCAL SDK DISCOVERY</small><h2>PMDG Adapter</h2></div><span id="pmdg-status-pill" class="module-status waiting">NOT DETECTED</span></div><p>Flight Deck liest ausschließlich den lokal installierten PMDG SDK-Header und erzeugt daraus die für deine Installation verfügbaren Event-IDs. Der SDK-Inhalt wird nicht mit Flight Deck ausgeliefert.</p><div class="bridge-facts"><span><small>FAMILY</small><b id="pmdg-family">—</b></span><span><small>SDK</small><b id="pmdg-sdk">—</b></span><span><small>DATA BROADCAST</small><b id="pmdg-broadcast">—</b></span><span><small>CONTROLS</small><b id="pmdg-controls">0</b></span></div><p class="safety-note">PMDG controls are only sent after an explicit user/automation action and only when the event exists in the locally installed SDK.</p></article>\n            <article class="efb-card fenix-frame-card"><div class="fenix-frame-placeholder" id="fenix-placeholder">',
        'PMDG adapter card')
    ground_overview_end = '            <article class="efb-card service-panel"><div class="section-title"><h2>Available services</h2><span id="gsx-service-status">NATIVE GSX MENU</span></div><div id="gsx-services" class="service-grid"></div><p class="safety-note">GSX veröffentlicht keine allgemeine Fernsteuerungs-API für externe EFBs. Der Statuscheck ist echt; Servicebefehle bleiben deshalb im nativen GSX-Menü. Beim Fenix A32X nutzt du „Mass &amp; Balance → Load Aircraft → GSX“.</p></article>'
    ground_new = '''            <article class="efb-card ground-safety-card"><div class="section-title"><div><small>GROUND / TAXI SAFETY</small><h2>Intelligent warnings</h2></div><span id="ground-safety-status" class="module-status connected">CLEAR</span></div><p id="ground-safety-detail">Keine aktiven Ground-Safety-Warnungen</p><div id="ground-safety-list" class="ground-safety-list"><p class="empty-list">No active alerts.</p></div><p class="safety-note">Advisory only. ATC clearances, airport signs, charts and pilot judgement always have priority.</p></article>
            <article class="efb-card gsx-payload-card"><div class="section-title"><div><small>DOCUMENTED GSX PASSENGER INTERFACE</small><h2>Payload sync</h2></div><span id="gsx-payload-status">READ ONLY</span></div><div class="bridge-facts"><span><small>TARGET PAX</small><b id="gsx-pax-target">—</b></span><span><small>BOARDING</small><b id="gsx-pax-progress">—</b></span><span><small>CARGO</small><b id="gsx-cargo-progress">—</b></span></div><p>SimBrief passenger count can be written explicitly to GSX. Flight Deck does not start or stop GSX services.</p><div class="connector-actions"><button id="gsx-payload-sync" class="primary-card-action" type="button">SIMBRIEF PAX → GSX</button><span id="gsx-payload-message" class="form-message" role="status"></span></div></article>
            <article class="efb-card service-panel"><div class="section-title"><h2>GSX live services</h2><span id="gsx-service-status">WAITING FOR LIVE DATA</span></div><div id="gsx-services" class="service-grid"></div><p class="safety-note">Service states are read from documented GSX LVars. Service requests remain in the native GSX/Fenix workflow; Flight Deck does not emulate the GSX menu.</p></article>'''
    text = replace_once(text, ground_overview_end, ground_new, 'ground phase2 cards')
    text = replace_once(text,
        '<div><i id="settings-lnm-dot"></i><span><strong>Little Navmap</strong><small id="settings-lnm">WebAPI wird gesucht</small></span></div>\n                <div><i id="settings-atc-dot"></i>',
        '<div><i id="settings-lnm-dot"></i><span><strong>Little Navmap</strong><small id="settings-lnm">WebAPI wird gesucht</small></span></div>\n                <div><i id="settings-adapter-dot"></i><span><strong>Aircraft Adapters</strong><small id="settings-adapter">Fenix / PMDG wird erkannt</small></span></div>\n                <div><i id="settings-atc-dot"></i>',
        'settings adapter row')
    text = text.replace('Microsoft Flight Simulator, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix, GSX, VATSIM and IVAO',
                        'Microsoft Flight Simulator, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix, PMDG, GSX, Little Navmap, VATSIM and IVAO')
    return text

update('public/index.html', patch_index)


# -----------------------------------------------------------------------------
# UI logic: live adapter, GSX, safety and version cleanup
# -----------------------------------------------------------------------------
def patch_app(text):
    text = text.replace('1.5.0', '1.6.0')
    text = text.replace("document.documentElement.dataset.appVersion || '1.4.1'", "document.documentElement.dataset.appVersion || '1.6.0'")
    text = replace_once(text,
        "  settingsLnmDot: $('#settings-lnm-dot'),\n  settingsAtcDot: $('#settings-atc-dot'),",
        "  settingsLnmDot: $('#settings-lnm-dot'),\n  settingsAdapterDot: $('#settings-adapter-dot'),\n  settingsAtcDot: $('#settings-atc-dot'),",
        'adapter settings dot element')
    text = replace_once(text,
        "  settingsLnm: $('#settings-lnm'),\n  settingsAtc: $('#settings-atc'),",
        "  settingsLnm: $('#settings-lnm'),\n  settingsAdapter: $('#settings-adapter'),\n  settingsAtc: $('#settings-atc'),",
        'adapter settings element')
    text = replace_once(text,
        "  homeFenixSummary: $('#home-fenix-summary'),\n  automationStatusPill:",
        "  homeFenixSummary: $('#home-fenix-summary'),\n  aircraftAdapterStatus: $('#aircraft-adapter-status'),\n  aircraftAdapterModel: $('#aircraft-adapter-model'),\n  aircraftAdapterSource: $('#aircraft-adapter-source'),\n  aircraftAdapterDetail: $('#aircraft-adapter-detail'),\n  aircraftAdapterControls: $('#aircraft-adapter-controls'),\n  aircraftAdapterRefresh: $('#aircraft-adapter-refresh'),\n  pmdgStatusPill: $('#pmdg-status-pill'),\n  pmdgFamily: $('#pmdg-family'),\n  pmdgSdk: $('#pmdg-sdk'),\n  pmdgBroadcast: $('#pmdg-broadcast'),\n  pmdgControls: $('#pmdg-controls'),\n  groundSafetyStatus: $('#ground-safety-status'),\n  groundSafetyDetail: $('#ground-safety-detail'),\n  groundSafetyList: $('#ground-safety-list'),\n  gsxPayloadStatus: $('#gsx-payload-status'),\n  gsxPaxTarget: $('#gsx-pax-target'),\n  gsxPaxProgress: $('#gsx-pax-progress'),\n  gsxCargoProgress: $('#gsx-cargo-progress'),\n  gsxPayloadSync: $('#gsx-payload-sync'),\n  gsxPayloadMessage: $('#gsx-payload-message'),\n  automationStatusPill:",
        'phase2 elements')
    text = sub_once(text,
        r"function renderGsxServices\(gsx\) \{.*?\n\}\n(?=\nfunction )",
        '''function renderGsxServices(gsx) {
  const fallback = [
    ['boarding', 'Boarding'], ['deboarding', 'Deboarding'], ['catering', 'Catering'],
    ['refueling', 'Refueling'], ['pushback', 'Pushback'], ['deicing', 'De-Icing'],
  ].map(([id, label]) => ({ id, label, status: 'offline', statusLabel: 'OFFLINE', available: false }));
  const services = gsx?.services?.length ? gsx.services : fallback;
  elements.gsxServices.replaceChildren();
  for (const service of services) {
    const row = document.createElement('div');
    const status = service.status || (service.available ? 'available' : 'offline');
    row.className = `service-item ${status}`;
    row.innerHTML = `<span><strong>${escapeHtml(service.label)}</strong><small>${escapeHtml(service.statusLabel || status.toUpperCase())}</small></span><i>${service.active ? '●' : service.completed ? '✓' : service.available ? '○' : '—'}</i>`;
    elements.gsxServices.append(row);
  }
}
''',
        'live GSX service renderer', flags=re.S)
    text = sub_once(text,
        r"function renderFenix\(state\) \{.*?\n\}\n(?=\nfunction automationState)",
        '''function renderFenix(state) {
  const fenix = state.integrations?.fenix || {};
  const adapter = state.integrations?.aircraftAdapter || {};
  const pmdg = adapter.pmdg || {};
  const active = adapter.active || 'generic';
  elements.fenixStatusPill.className = `module-status ${fenix.reachable ? 'connected' : fenix.status === 'disconnected' ? 'attention' : 'waiting'}`;
  elements.fenixStatusPill.textContent = fenix.reachable ? 'CONNECTED' : (fenix.status || 'NOT CHECKED').toUpperCase();
  elements.fenixDetail.textContent = fenix.detail || 'Fenix Remote EFB has not been checked.';
  elements.fenixEmbed.disabled = !fenix.reachable;
  elements.aircraftAdapterStatus.className = `module-status ${adapter.status === 'ready' ? 'connected' : adapter.status === 'attention' ? 'attention' : 'waiting'}`;
  elements.aircraftAdapterStatus.textContent = active === 'generic' ? 'GENERIC' : active.toUpperCase();
  elements.aircraftAdapterModel.textContent = adapter.title || (active.startsWith('pmdg') ? pmdg.activeFamily || 'PMDG' : active === 'fenix' ? 'Fenix A32X' : 'Generic SimConnect');
  elements.aircraftAdapterSource.textContent = active === 'fenix' ? 'MSFS INPUT EVENTS + EFB' : active.startsWith('pmdg') ? 'LOCAL PMDG SDK' : 'SIMCONNECT';
  elements.aircraftAdapterDetail.textContent = adapter.detail || 'Warte auf geladenes Flugzeug.';
  elements.aircraftAdapterControls.textContent = String(adapter.controlCount || 0);
  const packageInfo = (pmdg.packages || []).find((entry) => !pmdg.activeFamily || entry.family === pmdg.activeFamily) || (pmdg.packages || [])[0];
  elements.pmdgStatusPill.className = `module-status ${pmdg.detected ? 'connected' : 'waiting'}`;
  elements.pmdgStatusPill.textContent = pmdg.detected ? 'SDK DETECTED' : 'NOT DETECTED';
  elements.pmdgFamily.textContent = pmdg.activeFamily || packageInfo?.family || '—';
  elements.pmdgSdk.textContent = packageInfo?.sdkHeader || '—';
  elements.pmdgBroadcast.textContent = pmdg.broadcastEnabled === true ? 'ON' : pmdg.broadcastEnabled === false ? 'OFF' : '—';
  elements.pmdgControls.textContent = String(pmdg.controlCount || 0);
  elements.homeFenixSummary.textContent = adapter.detail || 'Fenix / PMDG adapter detection';
}

function renderGroundSafety(state) {
  const safety = state.integrations?.groundSafety || {};
  const severity = safety.highestSeverity || 'clear';
  elements.groundSafetyStatus.className = `module-status ${severity === 'clear' ? 'connected' : severity === 'caution' ? 'waiting' : 'attention'}`;
  elements.groundSafetyStatus.textContent = severity.toUpperCase();
  elements.groundSafetyDetail.textContent = safety.detail || 'Keine aktiven Ground-Safety-Warnungen';
  elements.groundSafetyList.replaceChildren();
  for (const item of safety.alerts || []) {
    const row = document.createElement('article');
    row.className = `ground-safety-alert ${item.severity || 'caution'}`;
    row.innerHTML = `<i></i><span><strong>${escapeHtml(item.title || 'GROUND ALERT')}</strong><small>${escapeHtml(item.detail || '')}</small></span><b>${escapeHtml(String(item.severity || '').toUpperCase())}</b>`;
    elements.groundSafetyList.append(row);
  }
  if (!elements.groundSafetyList.childElementCount) elements.groundSafetyList.innerHTML = '<p class="empty-list">No active alerts.</p>';
}
''',
        'adapter and safety renderers', flags=re.S)
    text = replace_once(text,
        "  elements.gsxServiceStatus.textContent = 'NATIVE GSX MENU';\n  renderGsxServices(gsx);",
        "  elements.gsxServiceStatus.textContent = gsx.liveData ? 'LIVE LVAR STATUS' : 'WAITING FOR LIVE DATA';\n  const payload = gsx.payload || {};\n  elements.gsxPayloadStatus.textContent = payload.sync?.syncedAt ? `SYNC ${formatTime(payload.sync.syncedAt)}` : 'EXPLICIT SYNC';\n  elements.gsxPaxTarget.textContent = Number.isFinite(Number(payload.passengerTarget)) ? String(Math.round(payload.passengerTarget)) : '—';\n  const boarded = Number.isFinite(Number(payload.boardingTotal)) ? payload.boardingTotal : payload.boardingPassengers;\n  elements.gsxPaxProgress.textContent = Number.isFinite(Number(boarded)) ? String(Math.round(boarded)) : '—';\n  elements.gsxCargoProgress.textContent = Number.isFinite(Number(payload.boardingCargoPercent)) ? `${Math.round(payload.boardingCargoPercent)} %` : '—';\n  renderGsxServices(gsx);\n  renderGroundSafety(state);",
        'GSX payload and safety render')
    text = replace_once(text,
        "  const littleNavmap = state.integrations?.littleNavmap || {};\n  setStatusDot(elements.settingsMsfsDot, simConnection.status);\n  setStatusDot(elements.settingsLnmDot, littleNavmap.status);",
        "  const littleNavmap = state.integrations?.littleNavmap || {};\n  const adapter = state.integrations?.aircraftAdapter || {};\n  setStatusDot(elements.settingsMsfsDot, simConnection.status);\n  setStatusDot(elements.settingsLnmDot, littleNavmap.status);\n  setStatusDot(elements.settingsAdapterDot, adapter.status);",
        'settings adapter status')
    text = replace_once(text,
        "  elements.settingsLnm.textContent = littleNavmap.detail || 'WebAPI wird gesucht';\n  elements.settingsAtc.textContent =",
        "  elements.settingsLnm.textContent = littleNavmap.detail || 'WebAPI wird gesucht';\n  elements.settingsAdapter.textContent = adapter.detail || 'Fenix / PMDG wird erkannt';\n  elements.settingsAtc.textContent =",
        'settings adapter detail')
    old_warning = """  const warning = Boolean(guidance.warning);
  const mismatch = guidance.reason === 'route-position-mismatch';
  elements.warningBanner.hidden = !warning && !mismatch;
  elements.warningBanner.classList.toggle('route-mismatch', mismatch);
  elements.warningBanner.querySelector('strong').textContent = mismatch ? 'ROUTE / POSITION UNPLAUSIBEL' : 'TAXIWEG VERLASSEN';
  elements.warningDetail.textContent = mismatch
    ? 'Alte Flugdaten erkannt. Die Abweichungswarnung wurde sicher deaktiviert.'
    : `${Math.round(guidance.deviationMeters || 0)} m von der freigegebenen Route entfernt`;
  elements.warningNewFlight.hidden = !mismatch;
  if (warning && !previousWarning && navigator.vibrate) navigator.vibrate([180, 100, 180]);
"""
    new_warning = """  const safetyAlert = state.integrations?.groundSafety?.alerts?.[0] || null;
  const warning = Boolean(safetyAlert || guidance.warning);
  const mismatch = guidance.reason === 'route-position-mismatch';
  elements.warningBanner.hidden = !warning && !mismatch;
  elements.warningBanner.classList.toggle('route-mismatch', mismatch);
  for (const level of ['caution', 'warning', 'critical']) elements.warningBanner.classList.toggle(`severity-${level}`, safetyAlert?.severity === level);
  elements.warningBanner.querySelector('strong').textContent = safetyAlert?.title || (mismatch ? 'ROUTE / POSITION UNPLAUSIBEL' : 'TAXIWEG VERLASSEN');
  elements.warningDetail.textContent = safetyAlert?.detail || (mismatch
    ? 'Alte Flugdaten erkannt. Die Abweichungswarnung wurde sicher deaktiviert.'
    : `${Math.round(guidance.deviationMeters || 0)} m von der freigegebenen Route entfernt`);
  elements.warningNewFlight.hidden = !mismatch;
  if (warning && !previousWarning && navigator.vibrate) navigator.vibrate(safetyAlert?.severity === 'critical' ? [220, 80, 220, 80, 220] : [180, 100, 180]);
"""
    text = replace_once(text, old_warning, new_warning, 'ground safety warning banner')
    text = replace_once(text,
        "async function connectFenix() {",
        "async function refreshAircraftAdapter() {\n  if (!elements.aircraftAdapterRefresh) return;\n  elements.aircraftAdapterRefresh.disabled = true;\n  try {\n    const response = await fetch(authenticatedUrl('/api/aircraft-adapter/refresh'), { method: 'POST' });\n    const data = await response.json();\n    if (!response.ok) throw new Error(data.error || 'Aircraft Adapter check failed.');\n    if (data.state) renderState(data.state);\n  } catch (error) {\n    elements.aircraftAdapterDetail.textContent = error.message;\n  } finally {\n    elements.aircraftAdapterRefresh.disabled = false;\n  }\n}\n\nasync function syncGsxPayload() {\n  if (!elements.gsxPayloadSync) return;\n  elements.gsxPayloadSync.disabled = true;\n  elements.gsxPayloadMessage.textContent = 'Syncing …';\n  try {\n    const response = await fetch(authenticatedUrl('/api/gsx/payload-sync'), { method: 'POST' });\n    const data = await response.json();\n    if (!response.ok) throw new Error(data.error || 'GSX payload sync failed.');\n    elements.gsxPayloadMessage.textContent = `${data.result.passengers} PAX an GSX übertragen.`;\n    if (latestState) { latestState.integrations.gsx = data.gsx; renderEfb(latestState); }\n  } catch (error) {\n    elements.gsxPayloadMessage.textContent = error.message;\n  } finally {\n    elements.gsxPayloadSync.disabled = false;\n  }\n}\n\nasync function connectFenix() {",
        'phase2 UI actions')
    text = replace_once(text,
        "elements.gsxRefresh.addEventListener('click', refreshGsx);",
        "elements.gsxRefresh.addEventListener('click', refreshGsx);\nelements.gsxPayloadSync?.addEventListener('click', syncGsxPayload);\nelements.aircraftAdapterRefresh?.addEventListener('click', refreshAircraftAdapter);",
        'phase2 event listeners')
    return text

update('public/app.js', patch_app)


# -----------------------------------------------------------------------------
# CSS: safety/adapters/GSX live status
# -----------------------------------------------------------------------------
def patch_css(text):
    return text + r'''

/* Phase 2 · Aircraft adapters, GSX live status and ground safety */
.adapter-overview-card,
.pmdg-adapter-card,
.ground-safety-card,
.gsx-payload-card { min-width: 0; }

.service-item.available { border-color: rgba(74, 242, 179, .28); }
.service-item.requested,
.service-item.active { border-color: rgba(255, 200, 87, .42); background: rgba(255, 200, 87, .06); }
.service-item.completed { border-color: rgba(74, 242, 179, .32); background: rgba(74, 242, 179, .05); }
.service-item.unavailable,
.service-item.bypassed,
.service-item.offline { opacity: .62; }
.service-item.active i { color: var(--amber); text-shadow: 0 0 10px rgba(255, 200, 87, .45); }
.service-item.completed i,
.service-item.available i { color: var(--green); }

.ground-safety-list { display: grid; gap: 8px; margin-top: 12px; }
.ground-safety-alert { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,.025); }
.ground-safety-alert > i { width: 8px; height: 8px; border-radius: 50%; background: var(--amber); }
.ground-safety-alert > span { display: grid; gap: 2px; }
.ground-safety-alert strong { font-size: 11px; letter-spacing: .05em; }
.ground-safety-alert small { color: var(--muted); line-height: 1.35; }
.ground-safety-alert > b { font-size: 9px; letter-spacing: .08em; }
.ground-safety-alert.warning { border-color: rgba(255, 200, 87, .38); }
.ground-safety-alert.critical { border-color: rgba(255, 92, 108, .55); background: rgba(255, 92, 108, .08); }
.ground-safety-alert.critical > i { background: var(--red); box-shadow: 0 0 10px rgba(255, 92, 108, .5); }

.warning-banner.severity-caution { border-color: rgba(255, 200, 87, .5); }
.warning-banner.severity-warning { border-color: rgba(255, 200, 87, .72); }
.warning-banner.severity-critical { border-color: rgba(255, 92, 108, .82); background: rgba(76, 17, 27, .96); }

@media (max-width: 900px) {
  .adapter-layout,
  .ground-layout { grid-template-columns: 1fr; }
}
'''

update('public/styles.css', patch_css)


# -----------------------------------------------------------------------------
# Version/cache
# -----------------------------------------------------------------------------
def patch_service_worker(text):
    text = text.replace("flight-deck-efb-v150", "flight-deck-efb-v160")
    return text.replace('1.5.0', '1.6.0')

update('public/service-worker.js', patch_service_worker)


# -----------------------------------------------------------------------------
# README: replace stale version-specific documentation with current 1.6 facts
# -----------------------------------------------------------------------------
readme = r'''# Flight Deck EFB

**Current release: 1.6.0 — Phase 2 Aircraft & Ground Intelligence**

Flight Deck EFB is a Windows companion and responsive Electronic Flight Bag for Microsoft Flight Simulator 2020/2024. The Windows host connects to MSFS and optional local/online services; the same EFB can then be used in the desktop app, a browser, an iPad/iPhone or Android device on the same private network.

> **Flight simulation use only — not for real-world navigation.**

## 1.6.0 highlights

- **Aircraft Adapter Layer:** automatic Fenix, PMDG or Generic SimConnect selection based on the loaded aircraft.
- **Fenix adapter:** keeps the official local Remote EFB/Web MCDU on port 8083 and exposes only MSFS Input Events that are actually enumerated for the loaded aircraft. Flight Deck does not ship or guess a private Fenix LVar catalog.
- **PMDG adapter:** discovers locally installed PMDG 737/777 SDK headers, derives the available `THIRD_PARTY_EVENT_ID_MIN + offset` controls at runtime and never bundles PMDG SDK content. SDK Data Broadcast status is reported when the local Options file is available.
- **GSX live integration:** installation/Couatl detection plus documented service-state and passenger/cargo LVars. SimBrief PAX can be explicitly synchronized to `L:FSDT_GSX_NUMPASSENGERS`; service requests remain in the native GSX/Fenix workflow.
- **Ground / Taxi Safety:** route deviation, excessive taxi speed, hold-short approach without detected runway authorization, stand-approach speed and close moving ground traffic are evaluated locally and surfaced as caution/warning/critical advisories.
- **Documentation/release cleanup:** all visible version strings, cache identifiers and GitHub Release notes are synchronized with the package version; Release notes are generated from the matching CHANGELOG section instead of a stale hard-coded text.

## Core features

### Flight operations
- Flight Journey Hub with automatic phase inference, manual override, phase checklists, readiness, timeline, ETA/fuel/weather context and flight notes.
- SimBrief latest-OFP import with route, SID/STAR, runways, alternate, cruise planning, navlog coordinates, fuel/weight/timing and METAR/TAF fields.
- Persistent flight tracking/archive with planned route, actual track, weather snapshots, aircraft telemetry and GPX/JSON export.
- New Flight safely closes the active recording and clears flight-specific state while preserving setup and archive data.

### Taxi and airport operations
- Exact SayIntentions taxi paths when available, BeyondATC local-log compatibility and manually entered clearances.
- Local taxi planning without an ATC client: stand/aircraft → runway, runway → stand, or custom map point → map point.
- MSFS airport facility data (taxi names/points/paths, parking, hold positions, jetways and VDGS) merged with OpenStreetMap airport geometry and OurAirports fallback metadata.
- Hold-short markers, route deviation, remaining distance, gate/stand context and Phase-2 Ground Safety advisories.
- Airport maps are cached locally for fast reopening.

### ATC, traffic and weather
- SayIntentions SAPI flight/parking/weather/frequency/communications integration with a deduplicated per-flight message history.
- Read-only VATSIM/IVAO controller, ATIS and relevant-pilot data.
- SimConnect traffic plus an all-object fallback so injected/live/add-on traffic can be normalized into the same Flightboard state.
- AviationWeather.gov METAR/TAF fallback.
- Little Navmap local WebAPI detection (`127.0.0.1:8965/api`) as optional simulator/airport metadata cross-check.

### Aircraft and ground adapters
- **Generic SimConnect:** core telemetry, COM/XPDR, MSFS 2024 Input Events, approved SimVars/LVars/ZVars and guarded one-shot actions.
- **Fenix:** official Remote EFB/Web MCDU plus currently enumerated MSFS Input Events. No unofficial variable catalog is bundled.
- **PMDG:** local SDK discovery for supported installed PMDG packages. Event IDs are generated from the user's own SDK header at runtime.
- **GSX:** local installation and Couatl readiness, documented live service states and explicit passenger-target synchronization. Flight Deck does **not** automate the GSX menu or pretend a general remote service API exists.
- **Automations:** Off/Test/Armed modes, phase/app/ATC/variable triggers, cooldowns, on-ground/groundspeed/aircraft guards and an audit log. Armed always resets to Test after restart, new flight or aircraft change.

## Install / update Windows

1. Open the latest GitHub Release and run **`Flight-Deck-EFB-Setup-1.6.0.exe`**.
2. Windows SmartScreen can warn because the current build is not code-signed. Review the publisher/source before choosing to run it.
3. Start **Flight Deck EFB**. The app also starts the local host used by tablets and second monitors.
4. Allow private-network firewall access when you want to use another device on your LAN.
5. Complete first-run setup and optionally save your SimBrief Pilot ID/username.

The installer is per-user, does not require administrator rights and upgrades the existing installation in place. Local settings, paired-device tokens, cached airports and the flight archive are retained on normal updates. The installed Windows app uses the GitHub Release channel through `electron-updater`; `latest.yml` and the NSIS blockmap are published with every release.

## iPad / Android / second monitor

Use the share button in the Windows app. Scan the QR code, connect over the same private network and enter the displayed six-digit pairing PIN once. Each paired device receives an individually revocable local token. LAN sharing can be disabled from Settings.

The browser receives sanitized application state. Connector credentials and host-only update controls remain in the Windows process.

## Connector setup

### SayIntentions
Flight Deck detects the local SayIntentions flight endpoint and uses the official SAPI data exposed for the active flight. API credentials remain host-side.

### BeyondATC
The compatibility connector is local and read-only. It can inspect `Player.log` / `beyondATC.log` for a reliably parseable taxi/hold-short instruction. Override a non-standard log location with:

```text
BEYONDATC_LOG_DIR=C:\path\to\BeyondATC
```

### Little Navmap
Enable the Little Navmap web server. Flight Deck checks the local WebAPI on port 8965. Little Navmap is optional and never replaces the primary SimConnect connection.

### Fenix
Load a Fenix A319/A320/A321 and keep the Fenix application running. The official Remote EFB/Web MCDU is expected on:

```text
http://127.0.0.1:8083/
```

For a physical tablet, the official Fenix EFB itself must use the Windows PC's LAN address; the Flight Deck host still performs its local health check on the PC.

### PMDG
Flight Deck scans common MSFS package roots for installed PMDG package SDK headers. You can explicitly set a package root:

```text
PMDG_PACKAGES_DIR=C:\path\to\Packages
```

For PMDG features that require SDK data broadcasting, enable `EnableDataBroadcast=1` in the aircraft's own Options file as described by the PMDG SDK/documentation for that product/version. Flight Deck reads the local status; it does not rewrite PMDG configuration files.

### GSX Pro
GSX is detected in the usual FSDT Addon Manager locations. Override a custom location with:

```text
GSX_ADDON_MANAGER=C:\path\to\Addon Manager
```

Flight Deck reads documented GSX LVars for service state/passenger/cargo progress and can explicitly set the documented GSX passenger target from the imported SimBrief OFP. Starting, cancelling or sequencing GSX services remains the responsibility of GSX/the aircraft's native integration.

### Navigraph
Standalone chart embedding remains disabled. Navigraph licensing/developer access and product-placement requirements are handled separately; the current standalone app opens official charts externally where applicable.

## Data flow and privacy

Local by default:
- MSFS telemetry, facilities, traffic and Input Events → SimConnect
- Fenix Remote EFB → local/private port 8083
- PMDG SDK discovery → local installed files only
- GSX discovery/live variables → local installation + SimConnect
- Little Navmap → local WebAPI
- flight archive, settings and paired-device tokens → Windows application data

Optional internet services:
- SimBrief latest OFP
- SayIntentions SAPI
- AviationWeather.gov
- VATSIM / IVAO public feeds
- OpenStreetMap/Overpass airport geometry and map layers
- GitHub Releases for application updates

The support bundle intentionally excludes API keys, access tokens, ATC message contents, flight notes and full local file paths. See `PRIVACY.md` for the detailed data policy.

## Safety model

- Ground Safety is **advisory only**. ATC clearance, airport signage/markings, charts and pilot judgement always take precedence.
- Active radio changes require an explicit action.
- Fenix/PMDG adapter controls require a control that is actually available from MSFS or the locally installed SDK.
- GSX service commands are not remotely emulated.
- Automation defaults to Test mode and uses allowlists/guards before any simulator write.
- Route/position mismatches suppress misleading deviation guidance and prompt for a fresh flight state.

## Development

Requirements: Node.js 22+ (release CI currently uses Node.js 24).

```text
npm install
npm run prepare-data
node src/server.mjs --demo --open
npm start
npm run dist
```

`src/server.mjs` is the shared host for Electron and LAN clients. `src/state-engine.mjs` owns normalized public state; connector modules feed it. `src/aircraft-adapter-manager.mjs` and `src/ground-safety-engine.mjs` contain Phase-2 aircraft/ground intelligence. The optional MSFS native EFB source remains under `MSFS-2024-EFB-App` for the later in-simulator phase.

## Legal

Copyright © 2026 Christoph Heckner.

Application code is distributed under the included MIT License. Third-party libraries/data keep their own licenses; see `THIRD_PARTY_NOTICES.md`. Microsoft Flight Simulator, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix, PMDG, GSX, Little Navmap, VATSIM and IVAO are names/trademarks of their respective owners and are referenced only to identify compatibility. Flight Deck EFB is an independent companion and is not endorsed by or affiliated with those providers unless explicitly stated.
'''
Path('README.md').write_text(readme, encoding='utf-8')


# -----------------------------------------------------------------------------
# Changelog 1.6.0
# -----------------------------------------------------------------------------
def patch_changelog(text):
    entry = '''## 1.6.0 — Phase 2 Aircraft & Ground Intelligence

- Added a central Aircraft Adapter Layer that automatically selects Fenix, PMDG or Generic SimConnect for the loaded aircraft.
- Added a Fenix adapter that combines official Remote EFB health with only the MSFS Input Events actually enumerated for the active aircraft; no unofficial Fenix LVar catalog is bundled.
- Added PMDG 737/777 local SDK discovery. Available control events are derived at runtime from the user's installed PMDG SDK header and Data Broadcast readiness is reported without rewriting PMDG configuration.
- Upgraded GSX from installation-only detection to documented live service/passenger/cargo LVar monitoring. SimBrief passenger count can be explicitly synchronized to the documented GSX passenger target while service commands stay native to GSX/Fenix.
- Added intelligent Ground / Taxi Safety advisories for route deviation, excessive taxi speed, hold-short approach without detected runway authorization, stand-approach speed and close moving ground traffic.
- Integrated Ground Safety into the Taxi warning banner and Ground Services app with caution/warning/critical severity.
- Added Aircraft Adapter, Ground Safety and enhanced GSX state to diagnostics/support metadata without exposing secrets or full local SDK paths.
- Updated the Aircraft/Ground UI, legal compatibility names, settings integration overview and all visible application/cache version strings to 1.6.0.
- Rewrote README setup/data-flow/safety documentation to match the current product and removed stale installer/updater statements.
- GitHub Release notes are now generated from the matching CHANGELOG section instead of a hard-coded older release description.

'''
    marker = '# Flight Deck EFB changelog\n\n'
    return replace_once(text, marker, marker + entry, 'changelog header')

update('CHANGELOG.md', patch_changelog)


# -----------------------------------------------------------------------------
# Package version/description. package-lock version is updated by npm version.
# -----------------------------------------------------------------------------
def patch_package(text):
    data = json.loads(text)
    data['version'] = '1.6.0'
    data['description'] = 'Flight Deck EFB for MSFS with flight operations, taxi guidance, traffic, aircraft adapters, ground safety and guarded simulator integrations.'
    return json.dumps(data, indent=2, ensure_ascii=False) + '\n'

update('package.json', patch_package)


# -----------------------------------------------------------------------------
# Release CI: new modules in source checks + CHANGELOG-driven GitHub notes
# -----------------------------------------------------------------------------
def patch_release(text):
    text = replace_once(text,
        "          node --check src/littlenavmap-client.mjs\n",
        "          node --check src/littlenavmap-client.mjs\n          node --check src/aircraft-adapter-manager.mjs\n          node --check src/ground-safety-engine.mjs\n",
        'release checks phase2 modules')
    old_create = 'gh release create $tag @assets --repo $repo --title "Flight Deck EFB $version" --notes "Flight Deck EFB $version. SayIntentions operations update: selectable SI/AviationWeather weather source, continuous SI parking sync, explicit gate assignment, SI airport-data refresh, guarded ATC pause/resume and pilot COM1/COM2 text transmission. Flight simulation use only — not for real-world navigation." --verify-tag'
    new_create = 'gh release create $tag @assets --repo $repo --title "Flight Deck EFB $version" --notes-file $notesFile --verify-tag'
    text = replace_once(text, old_create, new_create, 'release static notes')
    notes_anchor = """          $assets = @(
            "dist/Flight-Deck-EFB-Setup-$version.exe",
            "dist/Flight-Deck-EFB-Setup-$version.exe.blockmap",
            'dist/latest.yml'
          )
"""
    notes_insert = notes_anchor + """          $changelog = Get-Content 'CHANGELOG.md' -Raw
          $escaped = [regex]::Escape($version)
          $match = [regex]::Match($changelog, "(?ms)^##\\s+$escaped\\b.*?(?=^##\\s+|\\z)")
          if (!$match.Success) { throw "CHANGELOG section for $version is missing." }
          $notesFile = Join-Path $env:RUNNER_TEMP "release-notes-$version.md"
          Set-Content -Path $notesFile -Value ($match.Value.Trim() + "`n`n> Flight simulation use only — not for real-world navigation.`n") -Encoding UTF8
"""
    text = replace_once(text, notes_anchor, notes_insert, 'changelog release notes generation')
    text = replace_once(text,
        'gh release edit $tag --repo $repo --draft=false --prerelease=false --title "Flight Deck EFB $version"',
        'gh release edit $tag --repo $repo --draft=false --prerelease=false --title "Flight Deck EFB $version" --notes-file $notesFile',
        'existing release notes update')
    return text

update('.github/workflows/release.yml', patch_release)
