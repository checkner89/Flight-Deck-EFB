import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, text) => fs.writeFileSync(path.join(root, rel), text.replace(/\r\n/g, '\n'), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const version = packageJson.version;
if (version !== '1.3.2') throw new Error(`apply-1.3.2 expects package version 1.3.2, got ${version}`);

function edit(rel, fn) { write(rel, fn(read(rel))); }

for (const rel of [
  'src/server.mjs', 'src/online-network-client.mjs', 'src/airport-map-service.mjs',
  'src/aviation-weather-client.mjs', 'src/simbrief-client.mjs', 'public/service-worker.js',
  'public/app.js', 'public/index.html', 'THIRD_PARTY_NOTICES.md',
]) {
  edit(rel, (text) => text.replaceAll('1.3.0', version).replaceAll('1.3.1', version));
}

edit('src/electron-main.mjs', (text) => {
  text = text.replace(
    "import { app, BrowserWindow, dialog, Menu, nativeImage, shell, Tray } from 'electron';",
    "import { app, BrowserWindow, dialog, Menu, nativeImage, screen, shell, Tray } from 'electron';",
  );
  text = text.replace("import { autoUpdater } from 'electron-updater';", "import updaterPackage from 'electron-updater';");
  if (!text.includes('const { autoUpdater } = updaterPackage;')) {
    text = text.replace("import { fileURLToPath } from 'node:url';\n", "import { fileURLToPath } from 'node:url';\n\nconst { autoUpdater } = updaterPackage;\n");
  }
  const oldWindow = `  mainWindow = new BrowserWindow({\n    width: 1380,\n    height: 860,\n    minWidth: 960,\n    minHeight: 640,\n    backgroundColor: '#07121c',`;
  const newWindow = `  const { workAreaSize } = screen.getPrimaryDisplay();\n  const initialWidth = Math.min(workAreaSize.width, Math.max(1320, Math.round(workAreaSize.width * 0.96)));\n  const initialHeight = Math.min(workAreaSize.height, Math.max(820, Math.round(workAreaSize.height * 0.94)));\n  mainWindow = new BrowserWindow({\n    width: initialWidth,\n    height: initialHeight,\n    minWidth: 1180,\n    minHeight: 720,\n    show: false,\n    backgroundColor: '#07121c',`;
  if (text.includes(oldWindow)) text = text.replace(oldWindow, newWindow);
  else if (!text.includes('const { workAreaSize } = screen.getPrimaryDisplay();')) throw new Error('Electron window block not found');
  const oldLoad = `  await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);\n  createTray();`;
  const newLoad = `  await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);\n  mainWindow.maximize();\n  mainWindow.show();\n  mainWindow.focus();\n  createTray();`;
  if (text.includes(oldLoad)) text = text.replace(oldLoad, newLoad);
  else if (!text.includes('mainWindow.maximize();')) throw new Error('Electron loadURL block not found');
  return text;
});

edit('src/simconnect-client.mjs', (text) => {
  text = text.replace(
    'const attempts = [Protocol.SunRise, Protocol.KittyHawk, Protocol.FSX_SP2];',
    'const attempts = [Protocol.KittyHawk, Protocol.SunRise, Protocol.FSX_SP2];',
  );
  text = text.replace(
    "    if (protocol === Protocol.SunRise) return 'MSFS 2024';\n    if (protocol === Protocol.KittyHawk) return 'MSFS 2020/2024';",
    "    if (protocol === Protocol.KittyHawk) return 'MSFS 2024';\n    if (protocol === Protocol.SunRise) return 'MSFS 2024 (Legacy)';",
  );
  const oldBlock = `    if (recoverable && this.lastCoreDataAt) {\n      this.engine.setConnection('simConnect', 'connected', \`MSFS verbunden · \${this.#protocolLabel(this.protocol)} · optionale Daten eingeschränkt\`);\n      return;\n    }\n    this.engine.setConnection('simConnect', 'attention', \`SimConnect: \${detail}\`);`;
  const newBlock = `    // A SimConnect exception is a data-operation error, not a transport disconnect.\n    // Keep the transport usable until a real close/quit event occurs.\n    if (this.handle) {\n      const suffix = recoverable ? 'optionale Daten eingeschränkt' : \`Datenhinweis: \${detail}\`;\n      this.engine.setConnection('simConnect', 'connected', \`MSFS verbunden · \${this.#protocolLabel(this.protocol)} · \${suffix}\`);\n      return;\n    }\n    this.engine.setConnection('simConnect', 'disconnected', 'MSFS-Verbindung getrennt');`;
  if (text.includes(oldBlock)) text = text.replace(oldBlock, newBlock);
  else if (!text.includes('A SimConnect exception is a data-operation error')) throw new Error('SimConnect exception block not found');
  return text;
});

edit('src/state-engine.mjs', (text) => {
  text = text.replaceAll("detail: 'SimBrief Pilot ID oder Benutzername hinterlegen'", "detail: 'Flugplan wird automatisch aus SayIntentions/MSFS erkannt'");
  const flightIdentity = 'function flightIdentity({ flightId, callsign, origin, destination } = {}) {';
  const helper = `function airportFromRouteEnd(route) {\n  const text = textOrEmpty(route).toUpperCase();\n  if (!text) return null;\n  const tokens = text.replace(/[.\\\\/,-]+/g, ' ').split(/\\s+/).filter(Boolean);\n  const candidate = [...tokens].reverse().find((token) => /^[A-Z][A-Z0-9]{3}$/.test(token));\n  return candidate || null;\n}\n\n`;
  if (!text.includes('function airportFromRouteEnd(route)')) text = text.replace(flightIdentity, helper + flightIdentity);
  const oldOD = `    const nextOrigin = textOrEmpty(current.flight_origin, current.origin).toUpperCase() || null;\n    const nextDestination = textOrEmpty(current.flight_destination, current.destination).toUpperCase() || null;`;
  const newOD = `    const nextOrigin = textOrEmpty(\n      current.flight_origin,\n      current.flight_plan_origin,\n      current.origin,\n      details.flight_origin,\n    ).toUpperCase() || null;\n    const routeText = textOrEmpty(current.flight_plan_route, current.route, details.flight_plan_route);\n    const nextDestination = textOrEmpty(\n      current.flight_destination,\n      current.flight_plan_destination,\n      current.flight_plan_destination_icao,\n      current.destination,\n      current.destination_icao,\n      details.flight_destination,\n      details.destination,\n    ).toUpperCase() || airportFromRouteEnd(routeText) || null;`;
  if (text.includes(oldOD)) text = text.replace(oldOD, newOD);
  else if (!text.includes('current.flight_plan_destination_icao')) throw new Error('State origin/destination block not found');
  text = text.replace('flightPlanRoute: textOrEmpty(current.flight_plan_route) || null,', 'flightPlanRoute: routeText || null,');
  const oldSimbrief = `    this.state.integrations.simbrief = {\n      status: flight ? 'imported' : 'error',\n      imported: Boolean(flight),\n      user: summary.user ? String(summary.user).slice(0, 100) : null,\n      generatedAt: summary.generatedAt || null,\n      detail: flight ? \`\${flight.origin || '—'} → \${flight.destination || '—'} importiert\` : 'Kein gültiger OFP gefunden',\n      flight,\n    };\n    this.#touch();`;
  const newSimbrief = `    this.state.integrations.simbrief = {\n      status: flight ? 'imported' : 'error',\n      imported: Boolean(flight),\n      user: summary.user ? String(summary.user).slice(0, 100) : null,\n      generatedAt: summary.generatedAt || null,\n      detail: flight ? \`\${flight.origin || '—'} → \${flight.destination || '—'} automatisch ergänzt\` : 'Kein gültiger OFP gefunden',\n      flight,\n    };\n    if (flight) {\n      this.state.flight = {\n        ...this.state.flight,\n        callsign: this.state.flight.callsign || flight.callsign || null,\n        origin: this.state.flight.origin || flight.origin || null,\n        destination: this.state.flight.destination || flight.destination || null,\n        originPosition: this.state.flight.originPosition || flight.originPosition || null,\n        destinationPosition: this.state.flight.destinationPosition || flight.destinationPosition || null,\n        departureRunway: this.state.flight.departureRunway || flight.departureRunway || null,\n        arrivalRunway: this.state.flight.arrivalRunway || flight.arrivalRunway || null,\n        flightPlanRoute: this.state.flight.flightPlanRoute || flight.route || null,\n      };\n    }\n    this.#touch();`;
  if (text.includes(oldSimbrief)) text = text.replace(oldSimbrief, newSimbrief);
  else if (!text.includes('automatisch ergänzt')) throw new Error('applySimBrief block not found');
  return text;
});

edit('src/server.mjs', (text) => text.replace(
  "engine.resetFlight({ reason: 'manual-new-flight', preserveAircraft: true, suppressCurrent: true });",
  "engine.resetFlight({ reason: 'manual-new-flight', preserveAircraft: true, suppressCurrent: false });",
));

edit('public/index.html', (text) => {
  text = text.replace(/\n\s*<button id="home-planner-app" class="efb-app-tile planning-app".*?<\/button>/s, '');
  text = text.replace(
    '<span class="app-tile-copy"><small>GROUND NAVIGATION</small><strong>Taxi</strong><span id="home-taxi-summary" data-i18n="taxiSummary">Moving map and route guidance</span></span>',
    '<span class="app-tile-copy"><small>GROUND NAVIGATION &amp; PLANNING</small><strong>Taxi</strong><span id="home-taxi-summary" data-i18n="taxiSummary">Moving map, route guidance and taxi planning</span></span>',
  );
  text = text.replace(
    '<p data-i18n="simbriefHelp">Enter your SimBrief Pilot ID or username. No SimBrief password is needed.</p>\n              <div class="inline-form"><input id="simbrief-identifier" autocomplete="username" maxlength="80" placeholder="Pilot ID / username"><button id="simbrief-import" class="primary-card-action" type="button" data-i18n="import">IMPORT</button></div>',
    '<p>Flight Deck EFB erkennt den aktiven Flug automatisch über SayIntentions und MSFS. SimBrief wird nur optional ergänzt, wenn bereits eine Kennung gespeichert ist.</p>\n              <div class="auto-flight-detection"><i></i><span><strong>AUTOMATISCHE FLUGERKENNUNG</strong><small>Keine Pilot-ID erforderlich</small></span></div>\n              <div class="inline-form" hidden><input id="simbrief-identifier" autocomplete="username" maxlength="80" placeholder="Pilot ID / username"><button id="simbrief-import" class="primary-card-action" type="button" data-i18n="import">IMPORT</button></div>',
  );
  text = text.replace(
    '<label for="settings-simbrief-identifier"><span data-i18n="simbriefPilotId">SimBrief Pilot ID / username</span></label><div class="settings-inline-save"><input id="settings-simbrief-identifier" autocomplete="username" maxlength="80" placeholder="Pilot ID / username"><span id="settings-simbrief-saved" role="status" data-i18n="savedLocally">SAVED LOCALLY</span></div><small data-i18n="simbriefStoredHelp">Saved once on this device. No SimBrief password is stored.</small>',
    '<div class="auto-flight-detection compact"><i></i><span><strong>AUTOMATISCHE FLUGERKENNUNG</strong><small>SayIntentions / MSFS · SimBrief optional im Hintergrund</small></span></div><input id="settings-simbrief-identifier" autocomplete="username" maxlength="80" hidden><span id="settings-simbrief-saved" role="status" hidden>SAVED LOCALLY</span>',
  );
  text = text.replace(
    '          <div class="onboarding-step-heading"><small>STEP 2 / 3</small><h3>SimBrief</h3><p data-i18n="simbriefSetupHelp">Enter your Pilot ID once. The EFB remembers it on this device.</p></div>\n          <label class="onboarding-wide-field"><span data-i18n="simbriefPilotId">SimBrief Pilot ID / username</span><input id="onboarding-simbrief-identifier" autocomplete="username" maxlength="80" placeholder="Pilot ID / username"><small data-i18n="simbriefStoredHelp">Saved locally. No SimBrief password is stored.</small></label>\n          <label class="preference-toggle onboarding-toggle" for="onboarding-simbrief-auto"><span><strong data-i18n="simbriefAutoImport">Import latest SimBrief OFP automatically</strong><small data-i18n="simbriefAutoImportHelp">Uses the saved Pilot ID after the Windows host starts.</small></span><input id="onboarding-simbrief-auto" type="checkbox"></label>',
    '          <div class="onboarding-step-heading"><small>STEP 2 / 3</small><h3>Flugplan</h3><p>Der aktive Flug wird automatisch aus SayIntentions und MSFS übernommen. SimBrief ist keine Pflichtangabe.</p></div>\n          <div class="auto-flight-detection"><i></i><span><strong>AUTOMATISCHE ERKENNUNG AKTIV</strong><small>Keine Pilot-ID erforderlich</small></span></div>\n          <input id="onboarding-simbrief-identifier" autocomplete="username" maxlength="80" hidden><input id="onboarding-simbrief-auto" type="checkbox" checked hidden>',
  );
  return text;
});

edit('public/app.js', (text) => {
  text = text.replace(
    "const DEFAULT_APP_ORDER = ['taxi', 'planner', 'flight', 'tracking', 'briefing', 'com', 'flightboard', 'charts', 'atc', 'ground', 'fenix', 'automations', 'settings'];",
    "const DEFAULT_APP_ORDER = ['taxi', 'flight', 'tracking', 'briefing', 'com', 'flightboard', 'charts', 'atc', 'ground', 'fenix', 'automations', 'settings'];",
  );
  text = text.replaceAll("'taxi', 'planner',", "'taxi',");
  text = text.replace("elements.homePlannerApp.addEventListener('click', () => {", "elements.homePlannerApp?.addEventListener('click', () => {");
  const oldNext = `  else if (!preferences.simbriefIdentifier && !state.flight?.origin && !state.flight?.destination) next = { title: t('nextSimbriefTitle'), detail: t('nextSimbriefDetail'), action: 'settings', label: t('openSettings') };\n  else if (!simbriefReady && preferences.simbriefIdentifier) next = { title: t('nextImportTitle'), detail: t('nextImportDetail'), action: 'import', label: t('import') };\n  else if (!simulatorOnline) next = { title: t('nextSimulatorTitle'), detail: t('nextSimulatorDetail'), action: 'diagnostics', label: t('runChecks') };`;
  const newNext = `  else if (!simulatorOnline) next = { title: t('nextSimulatorTitle'), detail: t('nextSimulatorDetail'), action: 'diagnostics', label: t('runChecks') };\n  else if (!state.flight?.origin && !state.flight?.destination && !simbriefReady) next = { title: 'Flug wird automatisch erkannt', detail: 'Lade einen Flug in MSFS oder starte deine SayIntentions-Flugsitzung.', action: 'diagnostics', label: t('runChecks') };`;
  if (text.includes(oldNext)) text = text.replace(oldNext, newNext);
  text = text.replace(
    "  elements.homeCallsign.textContent = flight.callsign || 'NO FLIGHT';\n  elements.homeOrigin.textContent = flight.origin || '—';\n  elements.homeDestination.textContent = flight.destination || state.planning?.selectedAirport?.icao || '—';",
    "  const planFlight = state.integrations?.simbrief?.flight || {};\n  elements.homeCallsign.textContent = flight.callsign || planFlight.callsign || 'NO FLIGHT';\n  elements.homeOrigin.textContent = flight.origin || planFlight.origin || '—';\n  elements.homeDestination.textContent = flight.destination || planFlight.destination || state.planning?.selectedAirport?.icao || '—';",
  );
  text = text.replace(
    "  elements.callsign.textContent = flight.callsign || '—';\n  elements.origin.textContent = flight.origin || '—';\n  elements.destination.textContent = plannedAirport?.icao || flight.destination || '—';",
    "  const planFlight = state.integrations?.simbrief?.flight || {};\n  elements.callsign.textContent = flight.callsign || planFlight.callsign || '—';\n  elements.origin.textContent = flight.origin || planFlight.origin || '—';\n  elements.destination.textContent = plannedAirport?.icao || flight.destination || planFlight.destination || '—';",
  );
  text = text.replace(
    "    || state?.flight?.origin\n    || state?.flight?.destination",
    "    || state?.flight?.origin\n    || state?.flight?.destination\n    || state?.integrations?.simbrief?.flight?.origin\n    || state?.integrations?.simbrief?.flight?.destination",
  );
  text = text.replace("  elements.simbriefRoute.textContent = flight.route || 'No OFP imported.';", "  elements.simbriefRoute.textContent = flight.route || state.flight?.flightPlanRoute || 'Warte auf automatisch erkannten Flugplan …';");

  const marker = 'function renderFlightboard(state) {';
  const helper = `const AIRLINE_IATA_BY_ICAO = {\n  BTI: 'BT', DLH: 'LH', BAW: 'BA', RYR: 'FR', EZY: 'U2', KLM: 'KL', AFR: 'AF', TAP: 'TP', IBE: 'IB',\n  UAE: 'EK', QTR: 'QR', THY: 'TK', SWR: 'LX', AUA: 'OS', BEL: 'SN', SAS: 'SK', FIN: 'AY',\n  EIN: 'EI', WZZ: 'W6', VLG: 'VY', CFG: 'DE', EWG: 'EW', TUI: 'X3', AEE: 'A3', LOT: 'LO',\n  DAL: 'DL', UAL: 'UA', AAL: 'AA', ACA: 'AC', JBU: 'B6', VIR: 'VS', SIA: 'SQ', CPA: 'CX',\n  ANA: 'NH', JAL: 'JL', KAL: 'KE', ETD: 'EY', QFA: 'QF', ANZ: 'NZ', ICE: 'FI', NSZ: 'D8',\n};\nconst AIRLINE_IATA_BY_NAME = [\n  [/air\\s*baltic/i, 'BT'], [/lufthansa/i, 'LH'], [/speedbird|british airways/i, 'BA'], [/ryanair/i, 'FR'], [/easyjet/i, 'U2'],\n  [/klm/i, 'KL'], [/air france/i, 'AF'], [/\\btap\\b/i, 'TP'], [/iberia/i, 'IB'], [/emirates/i, 'EK'],\n  [/qatar/i, 'QR'], [/turkish/i, 'TK'], [/swiss/i, 'LX'], [/austrian/i, 'OS'], [/brussels/i, 'SN'],\n  [/sas|scandinavian/i, 'SK'], [/finnair/i, 'AY'], [/aer lingus/i, 'EI'], [/wizz/i, 'W6'],\n  [/vueling/i, 'VY'], [/condor/i, 'DE'], [/eurowings/i, 'EW'], [/tuifly|tui/i, 'X3'],\n];\n\nfunction trafficAirlineIata(entry = {}) {\n  const callsign = String(entry.callsign || entry.atcId || '').trim().toUpperCase();\n  const icao = callsign.match(/^([A-Z]{3})/)?.[1];\n  if (icao && AIRLINE_IATA_BY_ICAO[icao]) return AIRLINE_IATA_BY_ICAO[icao];\n  const text = [entry.airline, entry.title, entry.callsign].filter(Boolean).join(' ');\n  return AIRLINE_IATA_BY_NAME.find(([pattern]) => pattern.test(text))?.[1] || null;\n}\n\nfunction trafficAirlineLogo(entry = {}) {\n  const iata = trafficAirlineIata(entry);\n  const fallback = iata || String(entry.airline || entry.callsign || 'AI').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'AI';\n  const image = iata ? \`<img src=\"https://images.kiwi.com/airlines/64/\${encodeURIComponent(iata)}.png\" alt=\"\" loading=\"lazy\">\` : '';\n  return \`<span class=\"traffic-airline-logo\"><b>\${escapeHtml(fallback)}</b>\${image}</span>\`;\n}\n\n`;
  if (!text.includes('const AIRLINE_IATA_BY_ICAO')) text = text.replace(marker, helper + marker);
  const oldRow = `    row.innerHTML = \`<time>\${escapeHtml(trafficScheduleTime(schedule))}</time><span><strong>\${escapeHtml(entry.callsign || \`AI-\${entry.objectId}\`)}</strong><small>\${escapeHtml(entry.airline || entry.title || 'MSFS TRAFFIC')}</small></span><b>\${escapeHtml(entry.origin || '—')}</b><b>\${escapeHtml(entry.destination || '—')}</b><span><strong>\${escapeHtml(entry.runway || '—')}</strong><small>\${escapeHtml(entry.parking || (entry.onGround ? \`\${Math.round(Number(entry.groundSpeed) || 0)} kt\` : \`\${Math.round(Number(entry.altitudeFeet) || 0)} ft\`))}</small></span><em class="traffic-status \${escapeHtml(status.className)}">\${escapeHtml(status.label)}</em>\`;`;
  const newRow = `    row.innerHTML = \`<time>\${escapeHtml(trafficScheduleTime(schedule))}</time><span class="flightboard-flight">\${trafficAirlineLogo(entry)}<span><strong>\${escapeHtml(entry.callsign || \`AI-\${entry.objectId}\`)}</strong><small>\${escapeHtml(entry.airline || entry.title || 'MSFS TRAFFIC')}</small></span></span><b>\${escapeHtml(entry.origin || '—')}</b><b>\${escapeHtml(entry.destination || '—')}</b><span><strong>\${escapeHtml(entry.runway || '—')}</strong><small>\${escapeHtml(entry.parking || (entry.onGround ? \`\${Math.round(Number(entry.groundSpeed) || 0)} kt\` : \`\${Math.round(Number(entry.altitudeFeet) || 0)} ft\`))}</small></span><em class="traffic-status \${escapeHtml(status.className)}">\${escapeHtml(status.label)}</em>\`;\n    row.querySelector('.traffic-airline-logo img')?.addEventListener('error', (event) => event.currentTarget.remove(), { once: true });`;
  if (text.includes(oldRow)) text = text.replace(oldRow, newRow);
  else if (!text.includes('trafficAirlineLogo(entry)')) throw new Error('Flightboard row template not found');
  return text;
});

edit('public/i18n.js', (text) => text
  .replace("taxiSummary: 'Moving map and route guidance'", "taxiSummary: 'Moving map, route guidance and taxi planning'")
  .replace("taxiSummary: 'Moving Map und Taxiwegführung'", "taxiSummary: 'Moving Map, Taxiwegführung und Planung'")
  .replace("flightSummary: 'SimBrief plan and live MSFS data'", "flightSummary: 'Automatically detected flight plan and live MSFS data'")
  .replace("flightSummary: 'SimBrief-Flugplan und Live-Daten aus MSFS'", "flightSummary: 'Automatisch erkannter Flugplan und Live-Daten aus MSFS'")
  .replace("simbriefHelp: 'Enter your SimBrief Pilot ID or username. No SimBrief password is needed.'", "simbriefHelp: 'The active flight is detected automatically from SayIntentions and MSFS.'")
  .replace("simbriefHelp: 'Gib deine SimBrief Pilot ID oder deinen Benutzernamen ein. Ein Passwort ist nicht nötig.'", "simbriefHelp: 'Der aktive Flug wird automatisch aus SayIntentions und MSFS erkannt.'")
);

edit('public/styles.css', (text) => {
  if (text.includes('1.3.2 · readability')) return text;
  return text + `\n\n/* 1.3.2 · readability, automatic flight detection and Flightboard identity */\n.auto-flight-detection { display:flex; align-items:center; gap:12px; min-height:58px; padding:12px 14px; border:1px solid rgba(57,199,188,.35); border-radius:12px; background:rgba(57,199,188,.08); }\n.auto-flight-detection.compact { min-height:48px; }\n.auto-flight-detection > i { width:10px; height:10px; border-radius:50%; flex:0 0 auto; background:#33c8b9; box-shadow:0 0 0 5px rgba(51,200,185,.12); }\n.auto-flight-detection span { display:grid; gap:3px; }\n.auto-flight-detection strong { font-size:.82rem; letter-spacing:.06em; }\n.auto-flight-detection small { opacity:.78; }\n.flightboard-flight { display:flex !important; align-items:center; gap:10px; min-width:0; }\n.flightboard-flight > span:last-child { display:grid; min-width:0; }\n.traffic-airline-logo { position:relative; width:38px; height:30px; flex:0 0 38px; display:grid; place-items:center; overflow:hidden; border-radius:8px; border:1px solid rgba(130,155,170,.28); background:rgba(255,255,255,.94); }\n.traffic-airline-logo b { font-size:.65rem; letter-spacing:.04em; color:#324b5d; }\n.traffic-airline-logo img { position:absolute; inset:3px; width:calc(100% - 6px); height:calc(100% - 6px); object-fit:contain; background:#fff; }\nhtml[data-theme="light"] .home-time strong, html[data-theme="light"] .home-time span, html[data-theme="light"] .home-flight-ident span, html[data-theme="light"] .home-phase-source, html[data-theme="light"] .module-status, html[data-theme="light"] .runway-pill, html[data-theme="light"] .connection-chip, html[data-theme="light"] .traffic-status { color:#17364a !important; }\nhtml[data-theme="light"] .home-flight-ident span, html[data-theme="light"] .home-phase-source, html[data-theme="light"] .module-status.connected, html[data-theme="light"] .module-status.waiting { background:#e4f6f3 !important; border-color:#9bcfc8 !important; }\nhtml[data-theme="light"] .phase-quick-action, html[data-theme="light"] .secondary-card-action, html[data-theme="light"] .text-mini-action, html[data-theme="light"] .map-button, html[data-theme="light"] .secondary-action { color:#12384a !important; background:#f7fbfc !important; border-color:#b8cbd5 !important; }\nhtml[data-theme="light"] .phase-quick-action:hover, html[data-theme="light"] .secondary-card-action:hover { background:#e6f5f3 !important; border-color:#7fbfb8 !important; }\nhtml[data-theme="light"] button:disabled, html[data-theme="light"] .phase-quick-action:disabled, html[data-theme="light"] .secondary-card-action:disabled, html[data-theme="light"] .primary-card-action:disabled { opacity:1 !important; color:#687d89 !important; background:#e7edf0 !important; border-color:#c5d0d6 !important; box-shadow:none !important; }\nhtml[data-theme="light"] .home-phase-actions button { color:#0d615b !important; background:#e2f5f2 !important; border:1px solid #99cec8 !important; }\nhtml[data-theme="light"] .home-heading-actions .secondary-card-action { color:#17364a !important; background:#fff !important; }\nhtml[data-theme="light"] .auto-flight-detection { color:#153849; background:#e9f7f5; border-color:#a2d6d0; }\n`;
});

console.log('Applied Flight Deck EFB 1.3.2 build fixes.');
