import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = 'Flight Deck EFB 1.7.19 migration applied';

async function patchFile(relativePath, transform, comment = '//') {
  const filename = path.join(root, relativePath);
  const source = await fs.readFile(filename, 'utf8');
  if (source.includes(MARKER)) return false;
  let next = transform(source);
  if (next === source) throw new Error(`${relativePath}: migration made no changes.`);
  if (comment === '<!--') next += `\n<!-- ${MARKER} -->\n`;
  else next += `\n${comment} ${MARKER}\n`;
  await fs.writeFile(filename, next, 'utf8');
  return true;
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing migration anchor: ${label}`);
  return source.replace(search, replacement);
}

function replaceAllRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`Missing migration anchor: ${label}`);
  return source.replaceAll(search, replacement);
}

await patchFile('src/simconnect-client.mjs', (source) => {
  let next = source;
  next = replaceRequired(next, 'const TRAFFIC_RADIUS_METERS = 200_000;', 'const TRAFFIC_RADIUS_METERS = 225_000;', 'simconnect traffic radius');
  next = replaceRequired(next, `function decodeBco16(value) {`, `const OWN_AIRLINE_CODES = new Map([\n  ['LUFTHANSA', 'DLH'], ['LUFTHANSA CARGO', 'GEC'], ['EUROWINGS', 'EWG'], ['DISCOVER AIRLINES', 'OCN'],\n  ['SWISS', 'SWR'], ['AUSTRIAN', 'AUA'], ['CONDOR', 'CFG'], ['KLM', 'KLM'], ['AIR FRANCE', 'AFR'],\n  ['RYANAIR', 'RYR'], ['EASYJET', 'EZY'], ['BRITISH AIRWAYS', 'BAW'], ['TUI', 'TUI'],\n]);\n\nfunction ownshipCallsign({ atcAirline, flightNumber, registration } = {}) {\n  const rawAirline = cleanTrafficText(atcAirline).toUpperCase();\n  const airline = OWN_AIRLINE_CODES.get(rawAirline) || (/^[A-Z0-9]{2,3}$/.test(rawAirline) ? rawAirline : '');\n  const number = cleanTrafficText(flightNumber).replace(/\\s+/g, '').toUpperCase();\n  if (airline && number) return \`\${airline}\${number}\`;\n  const reg = cleanTrafficText(registration).replace(/\\s+/g, '').toUpperCase();\n  return reg && !/^(?:AS-?GEN|FENIX|AIRBUS|AIRCRAFT)$/.test(reg) ? reg : null;\n}\n\nfunction isGenericPassiveAircraft(entry = {}) {\n  const title = cleanTrafficText(entry.title).replace(/[_-]+/g, ' ');\n  const id = cleanTrafficText(entry.atcId || entry.callsign).replace(/\\s+/g, '').toUpperCase();\n  return /\\b(?:asobo\\s+)?passive\\s*aircraft\\b/i.test(title)\n    && (!id || /^(?:AS-?GEN|ASOBO|PASSIVE|TRAFFIC-\\d+|AI-\\d+)$/.test(id));\n}\n\nfunction decodeBco16(value) {`, 'simconnect ownship helpers');
  next = replaceRequired(next, `    addString('TITLE', SimConnectDataType.STRING128);\n    addString('ATC ID', SimConnectDataType.STRING32);`, `    addString('TITLE', SimConnectDataType.STRING128);\n    addString('ATC ID', SimConnectDataType.STRING32);\n    addString('ATC AIRLINE', SimConnectDataType.STRING64);\n    addString('ATC FLIGHT NUMBER', SimConnectDataType.STRING32);`, 'own aircraft identity definitions');
  next = replaceRequired(next, `        aircraftTitle: received.data.readString128(),\n        registration: received.data.readString32(),\n        ...this.radioSnapshot,`, `        aircraftTitle: received.data.readString128(),\n        registration: received.data.readString32(),\n        atcAirline: received.data.readString64(),\n        flightNumber: received.data.readString32(),\n        ...this.radioSnapshot,`, 'own aircraft identity reads');
  next = replaceRequired(next, `      if (position.aircraftTitle && position.aircraftTitle !== this.lastAircraftTitle) {`, `      position.callsign = ownshipCallsign(position);\n      if (position.aircraftTitle && position.aircraftTitle !== this.lastAircraftTitle) {`, 'own callsign derive');
  next = replaceRequired(next, 'if (now - this.lastEmitAt >= 180)', 'if (now - this.lastEmitAt >= 500)', 'core telemetry throttle');
  next = replaceRequired(next, `    return this.transmitEvent(event, Math.round(mhz * 1_000_000));`, `    const result = await this.transmitEvent(event, Math.round(mhz * 1_000_000));\n    const prefix = \`com\${radio}\`;\n    this.radioSnapshot[\`\${prefix}\${normalizedMode === 'active' ? 'Active' : 'Standby'}\`] = mhz;\n    this.radioSnapshot.updatedAt = new Date().toISOString();\n    this.#publishRadioState();\n    return result;`, 'COM frequency optimistic UI');
  next = replaceRequired(next, `    return this.transmitEvent(radio === 1 ? 'COM1_RADIO_SWAP' : 'COM2_RADIO_SWAP', 0);`, `    const result = await this.transmitEvent(radio === 1 ? 'COM1_RADIO_SWAP' : 'COM2_RADIO_SWAP', 0);\n    const prefix = \`com\${radio}\`;\n    for (const [left, right] of [['Active', 'Standby'], ['ActiveIdent', 'StandbyIdent'], ['ActiveType', 'StandbyType']]) {\n      const value = this.radioSnapshot[\`\${prefix}\${left}\`];\n      this.radioSnapshot[\`\${prefix}\${left}\`] = this.radioSnapshot[\`\${prefix}\${right}\`];\n      this.radioSnapshot[\`\${prefix}\${right}\`] = value;\n    }\n    this.radioSnapshot.updatedAt = new Date().toISOString();\n    this.#publishRadioState();\n    return result;`, 'COM swap optimistic UI');
  next = replaceRequired(next, `    return this.transmitEvent(radio === 1 ? 'COM1_RECEIVE_SELECT' : 'COM2_RECEIVE_SELECT', enabled ? 1 : 0);`, `    const result = await this.transmitEvent(radio === 1 ? 'COM1_RECEIVE_SELECT' : 'COM2_RECEIVE_SELECT', enabled ? 1 : 0);\n    this.radioSnapshot[\`com\${radio}Receive\`] = Boolean(enabled);\n    this.radioSnapshot.updatedAt = new Date().toISOString();\n    this.#publishRadioState();\n    return result;`, 'COM RX optimistic UI');
  next = replaceRequired(next, `    return this.transmitEvent('PILOT_TRANSMITTER_SET', radio - 1);`, `    const result = await this.transmitEvent('PILOT_TRANSMITTER_SET', radio - 1);\n    this.radioSnapshot.com1Transmit = radio === 1;\n    this.radioSnapshot.com2Transmit = radio === 2;\n    this.radioSnapshot.updatedAt = new Date().toISOString();\n    this.#publishRadioState();\n    return result;`, 'COM TX optimistic UI');
  next = replaceRequired(next, `      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))`, `      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon) && !isGenericPassiveAircraft(entry))`, 'primary passive aircraft filter');
  next = replaceRequired(next, `.slice(0, 300)\n      .sort((left, right) => left.callsign.localeCompare`, `.slice(0, 180)\n      .sort((left, right) => left.callsign.localeCompare`, 'primary traffic cap');
  next = replaceRequired(next, `this.trafficPollTimer = setInterval(poll, 5_000);`, `this.trafficPollTimer = setInterval(poll, 10_000);`, 'primary traffic poll');
  return next;
});

await patchFile('src/injected-traffic-client.mjs', (source) => {
  let next = source;
  next = replaceRequired(next, 'const TRAFFIC_RADIUS_METERS = 200_000;', 'const TRAFFIC_RADIUS_METERS = 225_000;', 'injected traffic radius');
  next = replaceRequired(next, `function airlineFromTitle(value = '') {`, `function isGenericPassiveAircraft(entry = {}) {\n  const title = clean(entry.title).replace(/[_-]+/g, ' ');\n  const id = clean(entry.atcId || entry.callsign).replace(/\\s+/g, '').toUpperCase();\n  return /\\b(?:asobo\\s+)?passive\\s*aircraft\\b/i.test(title)\n    && (!id || /^(?:AS-?GEN|ASOBO|PASSIVE|TRAFFIC-\\d+|AI-\\d+)$/.test(id));\n}\n\nfunction airlineFromTitle(value = '') {`, 'injected passive helper');
  next = replaceRequired(next, `constructor(engine, { pollMs = 3_000, retryMs = 5_000 } = {})`, `constructor(engine, { pollMs = 12_000, retryMs = 5_000 } = {})`, 'injected poll interval');
  next = replaceRequired(next, `    this.fallbackAircraft = [];\n    this.onEngineChange`, `    this.fallbackAircraft = [];\n    this.publishTimer = null;\n    this.onEngineChange`, 'publish timer init');
  next = replaceRequired(next, `    clearTimeout(this.retryTimer);\n    this.pollTimer = null;`, `    clearTimeout(this.retryTimer);\n    clearTimeout(this.publishTimer);\n    this.publishTimer = null;\n    this.pollTimer = null;`, 'publish timer stop');
  next = replaceRequired(next, `        clearInterval(this.pollTimer);\n        this.pollTimer = null;`, `        clearInterval(this.pollTimer);\n        clearTimeout(this.publishTimer);\n        this.publishTimer = null;\n        this.pollTimer = null;`, 'publish timer reconnect');
  next = replaceRequired(next, `    const objectIds = [...batch.objectIds].slice(0, 600);`, `    const objectIds = [...batch.objectIds].slice(0, 180);`, 'discovery cap');
  next = replaceRequired(next, `.slice(0, 600);\n    this.#requestIdentityEnrichment`, `.filter((entry) => !isGenericPassiveAircraft(entry))\n      .slice(0, 180);\n    this.#requestIdentityEnrichment`, 'fallback filter cap');
  next = replaceRequired(next, `for (const entry of aircraft.slice(0, 300))`, `for (const entry of aircraft.slice(0, 120))`, 'identity cap');
  next = replaceRequired(next, `for (const entry of aircraft.slice(0, 240))`, `for (const entry of aircraft.slice(0, 120))`, 'plan cap');
  next = replaceAllRequired(next, `      this.#publishMergedTraffic();\n    } catch {\n      // Some injector objects expose no generic ATC identity fields.`, `      this.#schedulePublishMergedTraffic();\n    } catch {\n      // Some injector objects expose no generic ATC identity fields.`, 'identity publish throttle');
  next = replaceRequired(next, `      this.#publishMergedTraffic();\n    } catch {\n      // Optional AI schedule fields are not available`, `      this.#schedulePublishMergedTraffic();\n    } catch {\n      // Optional AI schedule fields are not available`, 'plan publish throttle');
  next = replaceRequired(next, `  #publishMergedTraffic() {`, `  #schedulePublishMergedTraffic(delay = 180) {\n    if (this.stopped || this.publishTimer) return;\n    this.publishTimer = setTimeout(() => {\n      this.publishTimer = null;\n      if (!this.stopped) this.#publishMergedTraffic();\n    }, delay);\n  }\n\n  #publishMergedTraffic() {`, 'publish scheduler');
  next = replaceRequired(next, `    const primary = currentAircraft.filter((entry) => entry?.source !== 'simconnect-all');`, `    const primary = currentAircraft.filter((entry) => entry?.source !== 'simconnect-all' && !isGenericPassiveAircraft(entry));\n    const usableFallback = this.fallbackAircraft.filter((entry) => !isGenericPassiveAircraft(entry));`, 'merged passive filter');
  next = replaceRequired(next, `    const fallbackOnlyCount = this.fallbackAircraft.filter((entry) => !primaryIds.has(Number(entry.objectId))).length;\n    const aircraft = mergeTrafficSources(primary, this.fallbackAircraft)`, `    const fallbackOnlyCount = usableFallback.filter((entry) => !primaryIds.has(Number(entry.objectId))).length;\n    const aircraft = mergeTrafficSources(primary, usableFallback)`, 'usable fallback merge');
  next = replaceRequired(next, `.slice(0, 600)\n      .sort`, `.slice(0, 180)\n      .sort`, 'merged cap');
  next = replaceRequired(next, `      queueMicrotask(() => {\n        if (!this.stopped) this.#publishMergedTraffic();\n      });`, `      this.#schedulePublishMergedTraffic(220);`, 'restore throttle');
  return next;
});

await patchFile('src/state-engine.mjs', (source) => {
  let next = source;
  next = replaceRequired(next, `          radiusKm: 200,`, `          radiusKm: 225,`, 'state traffic radius');
  next = replaceRequired(next, `      aircraftTitle: textOrEmpty(position.aircraftTitle) || this.state.aircraft?.aircraftTitle || null,\n      registration: textOrEmpty(position.registration) || this.state.aircraft?.registration || null,`, `      aircraftTitle: textOrEmpty(position.aircraftTitle) || this.state.aircraft?.aircraftTitle || null,\n      registration: textOrEmpty(position.registration) || this.state.aircraft?.registration || null,\n      atcAirline: textOrEmpty(position.atcAirline) || this.state.aircraft?.atcAirline || null,\n      flightNumber: textOrEmpty(position.flightNumber) || this.state.aircraft?.flightNumber || null,\n      callsign: textOrEmpty(position.callsign) || this.state.aircraft?.callsign || null,`, 'own identity state');
  next = replaceRequired(next, `    this.#updateGuidance();\n    this.#touch();\n  }\n\n  publicState()`, `    const simulatorCallsign = textOrEmpty(this.state.aircraft.callsign).toUpperCase();\n    const currentCallsign = textOrEmpty(this.state.flight.callsign);\n    if (simulatorCallsign && (!currentCallsign || /^(?:fenix|airbus|aircraft)/i.test(currentCallsign))) {\n      this.state.flight.callsign = simulatorCallsign;\n    }\n    this.#updateGuidance();\n    this.#touch();\n  }\n\n  publicState()`, 'publish own callsign');
  return next;
});

await patchFile('src/taxi-route-planner.mjs', (source) => {
  let next = source;
  next = replaceRequired(next, `    startPoint = request.start?.type === 'aircraft' ? finitePoint(context.aircraft) : featureAnchor(mapData, request.start);\n    starts = nearestNodes(graph, startPoint, { limit: 2, maxDistanceMeters: 650 });`, `    startPoint = request.start?.type === 'aircraft' ? finitePoint(context.aircraft) : featureAnchor(mapData, request.start);\n    const departureSnapDistance = request.start?.type === 'aircraft' ? 1_200 : 900;\n    starts = nearestNodes(graph, startPoint, { limit: 3, maxDistanceMeters: departureSnapDistance });`, 'departure snap tolerance');
  next = replaceRequired(next, `    goals = nearestNodes(graph, endPoint, { limit: 2, maxDistanceMeters: 650 });`, `    goals = nearestNodes(graph, endPoint, { limit: 3, maxDistanceMeters: 900 });`, 'arrival snap tolerance');
  next = replaceAllRequired(next, `nearestNodes(graph, startPoint, { limit: 2, maxDistanceMeters: 650 })`, `nearestNodes(graph, startPoint, { limit: 3, maxDistanceMeters: 900 })`, 'custom start tolerance');
  next = replaceAllRequired(next, `nearestNodes(graph, endPoint, { limit: 2, maxDistanceMeters: 650 })`, `nearestNodes(graph, endPoint, { limit: 3, maxDistanceMeters: 900 })`, 'custom end tolerance');
  next = replaceRequired(next, `const starts = nearestNodes(graph, startPoint, { limit: 3, maxDistanceMeters: 650 });`, `const starts = nearestNodes(graph, startPoint, { limit: 4, maxDistanceMeters: 1_200 });`, 'clearance snap tolerance');
  return next;
});

await patchFile('src/msfs-efb-package-builder.mjs', (source) => {
  let next = source;
  next = replaceRequired(next, `  for (const userCfg of await discoverUserCfgFiles(env)) {`, `  for (const environmentValue of [env.MSFS_2024_COMMUNITY, env.MSFS2024_COMMUNITY, env.MSFS_COMMUNITY]) {\n    const candidate = cleanWindowsPath(environmentValue);\n    if (candidate && isCommunityDirectory(candidate) && await directoryExists(candidate)) {\n      return { directory: candidate, source: 'environment', userCfg: null, installedPackagesPath: path.win32.dirname(candidate) };\n    }\n  }\n  for (const userCfg of await discoverUserCfgFiles(env)) {`, 'community environment discovery');
  next = replaceRequired(next, `      cleanWindowsPath(this.env.MSFS_SDK_ROOT),\n      path.win32.join(drive, 'MSFS 2024 SDK'),`, `      cleanWindowsPath(this.env.MSFS_SDK_ROOT),\n      cleanWindowsPath(this.env.MSFS_SDK),\n      cleanWindowsPath(this.env.MSFS2024_SDK),\n      path.win32.join(drive, 'MSFS 2024 SDK'),`, 'sdk env discovery');
  next = replaceRequired(next, `      path.win32.join(drive, 'Program Files (x86)', 'MSFS 2024 SDK'),\n    ];`, `      path.win32.join(drive, 'Program Files (x86)', 'MSFS 2024 SDK'),\n      this.env.ProgramFiles && path.win32.join(this.env.ProgramFiles, 'MSFS 2024 SDK'),\n      this.env.ProgramFiles && path.win32.join(this.env.ProgramFiles, 'Microsoft Flight Simulator 2024 SDK'),\n      this.env['ProgramFiles(x86)'] && path.win32.join(this.env['ProgramFiles(x86)'], 'MSFS 2024 SDK'),\n      this.env.USERPROFILE && path.win32.join(this.env.USERPROFILE, 'Documents', 'MSFS 2024 SDK'),\n      this.env.USERPROFILE && path.win32.join(this.env.USERPROFILE, 'Downloads', 'MSFS 2024 SDK'),\n      this.env.LOCALAPPDATA && path.win32.join(this.env.LOCALAPPDATA, 'MSFS 2024 SDK'),\n    ];`, 'sdk standard discovery');
  return next;
});

await patchFile('src/server.mjs', (source) => {
  let next = source;
  next = replaceRequired(next, `import { MsfsEfbPackageBuilder } from './msfs-efb-package-builder.mjs';`, `import { MsfsEfbPackageBuilder } from './msfs-efb-package-builder.mjs';\nimport { installGsxProfileFiles, scanGsxProfileLibrary } from './local-path-discovery.mjs';`, 'server path discovery import');
  next = replaceRequired(next, `const APP_VERSION = '1.7.11';`, `const APP_VERSION = '1.7.19';`, 'server version');
  next = replaceRequired(next, `      if (pathname === '/api/msfs-efb-builder/status' && request.method === 'GET') {`, `      if (pathname === '/api/gsx/profile-library' && request.method === 'GET') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Die automatische GSX-Ordnersuche ist nur in der Windows-App verfügbar.' });\n        try {\n          return json(response, 200, await scanGsxProfileLibrary());\n        } catch (error) {\n          return json(response, 500, { error: error.message });\n        }\n      }\n\n      if (pathname === '/api/gsx/profile-library/install' && request.method === 'POST') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'GSX-Profile können nur durch die Windows-App installiert werden.' });\n        try {\n          const body = await readJsonBody(request, { maxBytes: 25 * 1024 * 1024 });\n          return json(response, 200, await installGsxProfileFiles(body.files));\n        } catch (error) {\n          return json(response, 422, { error: error.message });\n        }\n      }\n\n      if (pathname === '/api/msfs-efb-builder/status' && request.method === 'GET') {`, 'GSX host API');
  return next;
});

await patchFile('public/airline-catalog.js', (source) => replaceRequired(
  source,
  `[entry.airline, entry.atcAirline, entry.title, entry.callsign, entry.atcId]`,
  `[entry.airline, entry.atcAirline, entry.callsign, entry.atcId]`,
  'airline title inference',
));

await patchFile('public/app.js', (source) => {
  let next = source;
  next = replaceRequired(next, `    keepBuffer: 3,\n    opacity: 0.78,`, `    keepBuffer: 2,\n    opacity: 0.78,`, 'taxi tile buffer');
  next = replaceRequired(next, `  ['planningPreview', 500],\n  ['taxiRoute', 520],`, `  ['planningPreview', 500],\n  ['taxiTraffic', 510],\n  ['taxiRoute', 520],`, 'taxi traffic pane');
  next = replaceRequired(next, `  planning: L.layerGroup().addTo(map),\n  aircraft: null,`, `  planning: L.layerGroup().addTo(map),\n  traffic: L.layerGroup().addTo(map),\n  aircraft: null,`, 'taxi traffic layer');
  next = replaceRequired(next, `let trackingRefreshTimer = null;`, `let trackingRefreshTimer = null;\nlet trackingLastLiveRenderAt = 0;`, 'tracking live render throttle');
  next = replaceAllRequired(next, `keepBuffer: 3,`, `keepBuffer: 2,`, 'tracking tile buffers');
  next = replaceRequired(next, `trackingRefreshTimer = setInterval(() => refreshTrackingData().catch(() => {}), 3_000);`, `trackingRefreshTimer = setInterval(() => refreshTrackingData().catch(() => {}), 8_000);`, 'tracking refresh interval');
  next = replaceRequired(next, `function liveTrafficStatusClass(kind = '') {\n  if (['arriving', 'landing', 'climb', 'enroute', 'airborne'].includes(kind)) return 'airborne';\n  if (['taxi', 'pushback'].includes(kind)) return 'ground';\n  if (['parking', 'preflight'].includes(kind)) return 'parked';\n  return 'unknown';\n}`, `function liveTrafficStatusClass(kind = '') {\n  const normalized = String(kind || 'unknown').toLowerCase();\n  const base = ['arriving', 'landing', 'climb', 'enroute', 'airborne'].includes(normalized) ? 'airborne'\n    : ['taxi', 'pushback'].includes(normalized) ? 'ground'\n      : ['parking', 'preflight'].includes(normalized) ? 'parked' : 'unknown';\n  return \`\${base} status-\${normalized}\`;\n}`, 'traffic status classes');
  next = replaceRequired(next, `  const startValues = [];\n  if (Number.isFinite(latestState?.aircraft?.lat) && latestState?.aircraft?.onGround) {\n    startValues.push({ value: 'aircraft', label: 'Aktuelle Flugzeugposition' });\n  }`, `  const startValues = [];\n  const liveAircraft = latestState?.aircraft;\n  const airportCenter = loadedAirportMapData?.center;\n  const aircraftNearAirport = Number.isFinite(Number(liveAircraft?.lat))\n    && Number.isFinite(Number(liveAircraft?.lon))\n    && liveAircraft?.onGround\n    && (!Number.isFinite(Number(airportCenter?.lat)) || approximateDistanceMeters(liveAircraft, airportCenter) <= 12_000);\n  if (aircraftNearAirport) {\n    startValues.push({ value: 'aircraft', label: 'Aktuelle Flugzeugposition' });\n  }`, 'planner aircraft proximity');
  next = replaceRequired(next, `function renderState(state) {\n  renderPhase3(state);\n  latestState = state;`, `function renderState(state) {\n  renderPhase3(state);\n  latestState = state;\n  window.dispatchEvent(new CustomEvent('flightdeckstate', { detail: state }));`, 'shared state event');
  next = replaceRequired(next, `  renderAircraft(state.aircraft);\n  renderSharing(state.sharing);`, `  renderAircraft(state.aircraft);\n  renderTaxiTraffic(state);\n  if (flightHubTab === 'tracking' && !trackingSelectedId && Date.now() - trackingLastLiveRenderAt >= 1_500) {\n    trackingLastLiveRenderAt = Date.now();\n    const record = trackingCurrentFlight || trackingViewedFlight || trackingFallbackRecord(state);\n    trackingViewedFlight = record;\n    renderTrackingMap(record);\n  }\n  renderSharing(state.sharing);`, 'live map rerender');
  next = replaceRequired(next, `function renderTrackingTraffic(state) {`, `function renderTaxiTraffic(state) {\n  layers.traffic.clearLayers();\n  const ownship = state?.aircraft || {};\n  const entries = Array.isArray(state?.integrations?.simTraffic?.aircraft) ? state.integrations.simTraffic.aircraft : [];\n  let rendered = 0;\n  for (const entry of entries) {\n    const lat = Number(entry.lat);\n    const lon = Number(entry.lon);\n    const speed = Number(entry.groundSpeed);\n    if (!entry.onGround || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(speed) || speed < 2) continue;\n    if (Number.isFinite(Number(ownship.lat)) && Number.isFinite(Number(ownship.lon))\n      && approximateDistanceMeters(ownship, { lat, lon }) > 22_000) continue;\n    const heading = Number.isFinite(Number(entry.heading)) ? Number(entry.heading) : 0;\n    const callsign = String(entry.callsign || entry.atcId || entry.flightNumber || 'TRAFFIC').trim().slice(0, 18);\n    L.marker([lat, lon], {\n      pane: 'taxiTraffic',\n      interactive: false,\n      zIndexOffset: 100,\n      icon: L.divIcon({\n        className: 'taxi-traffic-wrapper',\n        html: \`<span class=\"taxi-traffic-marker\"><i style=\"transform:rotate(\${heading}deg)\">↑</i><b>\${escapeHtml(callsign)}</b></span>\`,\n        iconSize: [92, 28], iconAnchor: [13, 14],\n      }),\n    }).addTo(layers.traffic);\n    rendered += 1;\n    if (rendered >= 60) break;\n  }\n}\n\nfunction renderTrackingTraffic(state) {`, 'taxi map traffic renderer');
  return next;
});

await patchFile('public/flight-overlay.js', (source) => {
  let next = source;
  next = replaceRequired(next, `let departureGateBaseline = null;`, `let departureGateBaseline = null;\nlet overlayLastSharedStateAt = 0;`, 'overlay shared timestamp');
  next = replaceRequired(next, `async function refreshFlightOverlay() {\n  try {`, `async function refreshFlightOverlay({ force = false } = {}) {\n  if (!force && Date.now() - overlayLastSharedStateAt < 12_000) return;\n  try {`, 'overlay refresh fallback');
  next = replaceRequired(next, `  refreshFlightOverlay();`, `  refreshFlightOverlay({ force: true });`, 'overlay initial refresh');
  next = replaceRequired(next, `  overlayClockTimer = setInterval(updateClock, 1_000);\n  overlayStateTimer = setInterval(refreshFlightOverlay, 2_000);`, `  overlayClockTimer = setInterval(updateClock, 30_000);\n  overlayStateTimer = setInterval(refreshFlightOverlay, 15_000);`, 'overlay poll throttle');
  next = replaceRequired(next, `if (typeof document !== 'undefined') {`, `if (typeof window !== 'undefined') {\n  window.addEventListener('flightdeckstate', (event) => {\n    overlayLastSharedStateAt = Date.now();\n    renderFlightOverlay(event.detail || {});\n  });\n}\n\nif (typeof document !== 'undefined') {`, 'overlay shared state listener');
  return next;
});

await patchFile('public/si-operations.js', (source) => {
  let next = source;
  next = replaceRequired(next, `function start() {\n  ensureUi();`, `function acceptSharedState(state) {\n  if (!state || typeof state !== 'object') return;\n  latestState = state;\n  ensureUi();\n  renderOperations(state);\n  renderWeather(state);\n}\n\nfunction start() {\n  ensureUi();`, 'SI shared renderer');
  next = replaceRequired(next, `  stateTimer = setInterval(() => {\n    ensureUi();\n    interceptExistingWeatherRefresh();\n    refreshState();\n  }, 3_000);`, `  stateTimer = setInterval(() => {\n    ensureUi();\n    interceptExistingWeatherRefresh();\n    if (!document.hidden) refreshState();\n  }, 15_000);`, 'SI polling throttle');
  next = replaceRequired(next, `if (document.readyState === 'loading')`, `window.addEventListener('flightdeckstate', (event) => acceptSharedState(event.detail));\n\nif (document.readyState === 'loading')`, 'SI shared event listener');
  return next;
});

await patchFile('public/gsx-profile-manager.js', (source) => {
  let next = source;
  next = replaceRequired(next, `    busy: false,\n  };`, `    busy: false,\n    autoLibrary: null,\n  };`, 'GSX auto library state');
  next = replaceRequired(next, `  function fileSystemSupported() {`, `  function hostApiUrl(pathname) {\n    const url = new URL(pathname, window.location.origin);\n    const token = new URL(window.location.href).searchParams.get('token') || localStorage.getItem('si-taxi-token');\n    if (token) url.searchParams.set('token', token);\n    return url;\n  }\n\n  async function loadAutoLibrary() {\n    try {\n      const response = await fetch(hostApiUrl('/api/gsx/profile-library'), { cache: 'no-store' });\n      if (!response.ok) return null;\n      const library = await response.json();\n      state.autoLibrary = library;\n      return library;\n    } catch {\n      return null;\n    }\n  }\n\n  function fileSystemSupported() {`, 'GSX backend helper');
  next = replaceRequired(next, `    if (profile) profile.textContent = state.profileHandle?.name || '%APPDATA%\\\\Virtuali\\\\GSX\\\\MSFS';\n    if (community) community.textContent = state.communityHandle?.name || 'Optional für Missing-Profile-Scan';\n    if (handlers) handlers.textContent = state.handlerHandle?.name || 'Optional · %APPDATA%\\\\Virtuali\\\\Handlers\\\\lib';\n    const folderState = document.getElementById('gsxp-folder-state');\n    if (folderState) folderState.textContent = state.profileHandle ? 'PROFILE DIR READY' : 'LOCAL ONLY';`, `    const auto = state.autoLibrary?.paths || {};\n    if (profile) profile.textContent = state.profileHandle?.name || auto.profileDirectory || '%APPDATA%\\\\Virtuali\\\\GSX\\\\MSFS';\n    if (community) community.textContent = state.communityHandle?.name || auto.communityDirectory || 'Optional für Missing-Profile-Scan';\n    if (handlers) handlers.textContent = state.handlerHandle?.name || auto.handlerDirectory || 'Optional · %APPDATA%\\\\Virtuali\\\\Handlers\\\\lib';\n    const folderState = document.getElementById('gsxp-folder-state');\n    if (folderState) folderState.textContent = state.profileHandle ? 'PROFILE DIR READY' : auto.profileDirectory ? 'AUTO DETECTED' : 'LOCAL ONLY';`, 'GSX auto folders render');
  next = replaceRequired(next, `      await restoreHandles();\n      state.profiles = await scanProfileDirectory(state.profileHandle);\n      state.airports = await scanCommunityDirectory(state.communityHandle);\n      if (message) {\n        message.textContent = state.profileHandle\n          ? \`\${state.profiles.length} Profil-Dateien erkannt\${state.communityHandle ? \` · \${state.airports.length} mögliche Airport-Packages\` : ''}.\`\n          : 'GSX Profilordner noch nicht verbunden.';\n      }\n      setStatus(state.profileHandle ? 'connected' : 'waiting', state.profileHandle ? 'READY' : 'SETUP');`, `      await restoreHandles();\n      const auto = await loadAutoLibrary();\n      state.profiles = state.profileHandle ? await scanProfileDirectory(state.profileHandle) : (auto?.profiles || []);\n      state.airports = state.communityHandle ? await scanCommunityDirectory(state.communityHandle) : (auto?.airports || []);\n      const profileReady = Boolean(state.profileHandle || auto?.paths?.profileDirectory);\n      if (message) {\n        message.textContent = profileReady\n          ? \`\${state.profiles.length} Profil-Dateien erkannt\${state.airports.length ? \` · \${state.airports.length} mögliche Airport-Packages\` : ''}\${!state.profileHandle ? ' · Ordner automatisch erkannt' : ''}.\`\n          : 'GSX Profilordner wurde nicht automatisch gefunden. Manuelle Auswahl bleibt verfügbar.';\n      }\n      setStatus(profileReady ? 'connected' : 'waiting', profileReady ? 'READY' : 'SETUP');`, 'GSX auto scan');
  next = replaceRequired(next, `    restoreHandles().then(() => renderAll()).catch(() => {});`, `    restoreHandles().then(() => scanAll()).catch(() => renderAll());`, 'GSX open auto scan');
  next = replaceRequired(next, `  async function installSelected() {\n    if (!state.importCandidates.length) return;\n    await restoreHandles();`, `  function bytesToBase64(data) {\n    let binary = '';\n    for (let offset = 0; offset < data.length; offset += 0x8000) binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));\n    return btoa(binary);\n  }\n\n  async function installSelectedViaHost() {\n    const chosenValue = document.querySelector('input[name=\"gsxp-candidate\"]:checked')?.value;\n    const candidates = chosenValue === '__all__' ? state.importCandidates : state.importCandidates.filter((entry) => entry.id === chosenValue || entry.selected && !chosenValue);\n    const files = candidates.flatMap((candidate) => candidate.files).map((file) => {\n      const normalized = file.path.replaceAll('\\\\', '/').toLowerCase();\n      const handler = normalized.includes('/lib/') && extname(file.name) === '.py' && !file.name.toLowerCase().endsWith('_handler.py');\n      return { name: basename(file.name), target: handler ? 'handler' : 'profile', dataBase64: bytesToBase64(file.data) };\n    });\n    const response = await fetch(hostApiUrl('/api/gsx/profile-library/install'), {\n      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }),\n    });\n    const data = await response.json();\n    if (!response.ok) throw new Error(data.error || 'Installation über die Windows-App fehlgeschlagen.');\n    setImportMessage(\`\${data.profileCount || 0} GSX Profil-Datei(en) installiert · \${data.handlerCount || 0} Handler-Datei(en).\`);\n    clearImport();\n    await scanAll();\n  }\n\n  async function installSelected() {\n    if (!state.importCandidates.length) return;\n    await restoreHandles();\n    if (!state.profileHandle && state.autoLibrary?.paths?.profileDirectory) {\n      const installButton = document.getElementById('gsxp-install');\n      if (installButton) installButton.disabled = true;\n      try {\n        await installSelectedViaHost();\n      } catch (error) {\n        setImportMessage(error.message);\n        setStatus('attention', 'INSTALL ERROR');\n      } finally {\n        if (installButton) installButton.disabled = false;\n      }\n      return;\n    }`, 'GSX host install');
  return next;
});

await patchFile('public/index.html', (source) => {
  let next = source;
  next = replaceRequired(next, `  </head>`, `    <link rel="stylesheet" data-release-1719-style href="/release-1.7.19.css?v=1.7.19">\n  </head>`, 'release CSS');
  next = replaceRequired(next, `  </body>`, `    <script src="/release-1.7.19.js?v=1.7.19"></script>\n  </body>`, 'release JS');
  return next;
}, '<!--');

await patchFile('public/service-worker.js', (source) => {
  let next = source;
  const anchor = `  '/live-traffic.js?v=`;
  const index = next.indexOf(anchor);
  if (index < 0) throw new Error('Missing migration anchor: service worker live traffic');
  const lineEnd = next.indexOf('\n', index);
  next = `${next.slice(0, lineEnd + 1)}  '/release-1.7.19.css?v=1.7.19',\n  '/release-1.7.19.js?v=1.7.19',\n${next.slice(lineEnd + 1)}`;
  return next;
});

console.log('Applied Flight Deck EFB 1.7.19 source migration.');
