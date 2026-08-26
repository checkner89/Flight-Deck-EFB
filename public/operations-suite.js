const OPS_STORAGE = {
  scratchpad: 'flight-deck-ops-scratchpad-v1',
  checklist: 'flight-deck-ops-checklist-v1',
  reviews: 'flight-deck-ops-reviews-v1',
  logbook: 'flight-deck-ops-logbook-v1',
  launcher: 'flight-deck-ops-launcher-v1',
};

const VATSIM_URL = 'https://data.vatsim.net/v3/vatsim-data.json';
const KG_PER_LB = 0.45359237;
const NM_PER_KM = 0.5399568;

let latestState = null;
let shell = null;
let activeTool = null;
let activeChecklist = 'preflight';
let vatsimData = null;
let vatsimFetchedAt = 0;
let vatsimTimer = null;
let fuelMonitor = null;
let currentFlightLog = null;
let lastClearanceFingerprint = '';
let lastAtcMessageFingerprint = '';

function safeJsonParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function load(key, fallback) {
  return safeJsonParse(localStorage.getItem(key) || '', fallback);
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

function finite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function text(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized && normalized !== '—' && normalized.toLowerCase() !== 'null') return normalized;
  }
  return '';
}

function bool(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function formatClock(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function lbsToKg(value) {
  const number = finite(value);
  return number === null ? null : number * KG_PER_LB;
}

function formatKg(value) {
  const number = finite(value);
  return number === null ? '—' : `${Math.round(number).toLocaleString()} kg`;
}

function formatNm(value) {
  const number = finite(value);
  return number === null ? '—' : `${number < 10 ? number.toFixed(1) : Math.round(number)} NM`;
}

function flightData(state = latestState || {}) {
  const flight = state.flight || {};
  const aircraft = state.aircraft || {};
  const simbrief = state.integrations?.simbrief?.flight || state.integrations?.simbrief || {};
  return {
    callsign: text(flight.callsign, aircraft.callsign, simbrief.callsign, simbrief.atcCallsign, aircraft.registration) || '—',
    origin: text(flight.origin, simbrief.origin, simbrief.departure) || '—',
    destination: text(flight.destination, simbrief.destination, simbrief.arrival) || '—',
    currentAirport: text(flight.currentAirport, state.planning?.selectedAirport?.icao, flight.origin) || '—',
    runway: text(flight.runway, flight.departureRunway, simbrief.runway, simbrief.departureRunway) || '—',
    arrivalRunway: text(flight.arrivalRunway, simbrief.arrivalRunway) || '—',
    gate: text(flight.gate, aircraft.gate, state.integrations?.gsx?.gate) || '—',
    route: text(flight.route, simbrief.route, state.planning?.route) || '—',
    aircraftType: text(flight.aircraft, simbrief.aircraft, simbrief.aircraftType, aircraft.aircraftTitle) || '—',
    eet: text(simbrief.eet, simbrief.ete, flight.eet) || '—',
    fuelPlan: finite(simbrief.fuel, simbrief.blockFuel, simbrief.fuelPlan, flight.plannedFuel),
    altitude: finite(flight.cruiseAltitude, simbrief.cruiseAltitude, simbrief.altitude),
    com1: finite(aircraft.com1Active, state.radio?.com1Active, state.integrations?.simConnect?.radio?.com1Active),
    com1Standby: finite(aircraft.com1Standby, state.radio?.com1Standby, state.integrations?.simConnect?.radio?.com1Standby),
    squawk: text(aircraft.transponderCode, aircraft.squawk, state.radio?.transponderCode, state.atc?.squawk) || '—',
  };
}

function flightKey(state = latestState) {
  const data = flightData(state || {});
  const route = `${data.callsign}|${data.origin}|${data.destination}`;
  return route.replace(/[^A-Za-z0-9|_-]/g, '').slice(0, 96) || 'no-flight';
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(String(value || ''));
    return true;
  } catch {
    return false;
  }
}

function greatCircleNm(a, b) {
  const lat1 = finite(a?.lat, a?.latitude);
  const lon1 = finite(a?.lon, a?.longitude);
  const lat2 = finite(b?.lat, b?.latitude);
  const lon2 = finite(b?.lon, b?.longitude);
  if ([lat1, lon1, lat2, lon2].some((entry) => entry === null)) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x))) * NM_PER_KM;
}

function ownship() {
  const aircraft = latestState?.aircraft || {};
  const lat = finite(aircraft.lat, aircraft.latitude);
  const lon = finite(aircraft.lon, aircraft.longitude);
  return lat === null || lon === null ? null : { lat, lon };
}

function toolLabel(tool) {
  return ({
    scratchpad: ['SCRATCHPAD', 'ATC notes & CRAFT'],
    checklist: ['SMART CHECKLISTS', 'Automatic + manual flow'],
    documents: ['FLIGHT DOCUMENTS', 'OFP, sign-off & receipts'],
    vatsim: ['VATSIM', 'Controllers & nearby traffic'],
    logbook: ['FLIGHT LOG', 'Timeline & ATC history'],
    launcher: ['SIM SESSION', 'Internal & external launchers'],
  })[tool] || ['PILOT TOOLS', 'Operations suite'];
}

function svgFor(tool) {
  const icons = {
    scratchpad: '<path d="M10 7h24v34H10zM15 14h14M15 21h14M15 28h10M32 32l6 6m0-6-6 6"/>',
    checklist: '<path d="M10 11h5l2 2 4-5M24 11h14M10 23h5l2 2 4-5M24 23h14M10 35h5l2 2 4-5M24 35h14"/>',
    documents: '<path d="M13 6h16l8 8v28H13zM29 6v9h8M18 23h14M18 30h14M18 37h9"/>',
    vatsim: '<circle cx="24" cy="24" r="16"/><path d="M8 24h32M24 8c5 5 7 10 7 16s-2 11-7 16c-5-5-7-10-7-16s2-11 7-16ZM24 24l9-6"/>',
    logbook: '<path d="M9 8h27v33H9zM15 14h15M15 21h15M15 28h9M15 35h13"/>',
    launcher: '<path d="M13 8h22v32H13zM20 17h8M24 13v8M18 30h12M39 16l5 8-5 8"/>',
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${icons[tool] || icons.scratchpad}</svg>`;
}

function installLauncherTiles() {
  const grid = document.querySelector('.app-launcher-grid');
  if (!grid || grid.querySelector('[data-ops-tool]')) return;
  const tools = ['scratchpad', 'checklist', 'documents', 'vatsim', 'logbook', 'launcher'];
  tools.forEach((tool, index) => {
    const [title, subtitle] = toolLabel(tool);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `efb-app-tile ops-app-tile ops-${tool}`;
    button.dataset.opsTool = tool;
    button.style.order = String(60 + index);
    button.innerHTML = `<span class="app-tile-icon">${svgFor(tool)}</span><span class="app-tile-copy"><small>${esc(subtitle)}</small><strong>${esc(title)}</strong><span>${tool === 'vatsim' ? 'ONLINE DATA' : 'FLIGHT DECK'}</span></span><span class="app-tile-arrow">›</span>`;
    button.addEventListener('click', () => openTool(tool));
    grid.append(button);
  });
}

function ensureShell() {
  if (shell) return shell;
  shell = document.createElement('section');
  shell.id = 'operations-suite';
  shell.className = 'operations-suite';
  shell.hidden = true;
  shell.innerHTML = `
    <header class="ops-toolbar">
      <button class="ops-back" type="button" data-ops-close aria-label="Back to apps">‹ <span>APPS</span></button>
      <div class="ops-title"><span class="ops-title-icon"></span><div><small>FLIGHT DECK APPLICATION</small><strong id="ops-title">PILOT TOOLS</strong><em id="ops-subtitle">Operations suite</em></div></div>
      <nav class="ops-tabs" aria-label="Pilot tools">
        ${['scratchpad','checklist','documents','vatsim','logbook','launcher'].map((tool) => `<button type="button" data-ops-tab="${tool}">${toolLabel(tool)[0]}</button>`).join('')}
      </nav>
    </header>
    <div id="ops-content" class="ops-content"></div>`;
  document.body.append(shell);
  shell.querySelector('[data-ops-close]').addEventListener('click', closeTool);
  for (const button of shell.querySelectorAll('[data-ops-tab]')) button.addEventListener('click', () => openTool(button.dataset.opsTab));
  return shell;
}

function openTool(tool) {
  ensureShell();
  activeTool = tool;
  const [title, subtitle] = toolLabel(tool);
  shell.querySelector('#ops-title').textContent = title;
  shell.querySelector('#ops-subtitle').textContent = subtitle;
  shell.querySelector('.ops-title-icon').innerHTML = svgFor(tool);
  for (const button of shell.querySelectorAll('[data-ops-tab]')) button.classList.toggle('active', button.dataset.opsTab === tool);
  shell.hidden = false;
  document.documentElement.classList.add('ops-suite-open');
  renderActiveTool();
  if (tool === 'vatsim') startVatsimRefresh(); else stopVatsimRefresh();
}

function closeTool() {
  stopVatsimRefresh();
  if (shell) shell.hidden = true;
  document.documentElement.classList.remove('ops-suite-open');
  activeTool = null;
}

function renderActiveTool() {
  if (!shell || shell.hidden) return;
  const content = shell.querySelector('#ops-content');
  if (!content) return;
  if (activeTool === 'scratchpad') renderScratchpad(content);
  else if (activeTool === 'checklist') renderChecklist(content);
  else if (activeTool === 'documents') renderDocuments(content);
  else if (activeTool === 'vatsim') renderVatsim(content);
  else if (activeTool === 'logbook') renderLogbook(content);
  else if (activeTool === 'launcher') renderLauncher(content);
}

function scratchpadState() {
  const all = load(OPS_STORAGE.scratchpad, {});
  const key = flightKey();
  return { all, key, value: all[key] || { note: '', craft: {} } };
}

function saveScratchpad(value) {
  const { all, key } = scratchpadState();
  all[key] = value;
  save(OPS_STORAGE.scratchpad, all);
}

function autoCraft() {
  const data = flightData();
  return {
    clearance: data.destination !== '—' ? `CLEARED ${data.destination}` : '',
    route: data.route !== '—' ? data.route : '',
    altitude: data.altitude !== null ? `FL${String(Math.round(data.altitude / 100)).padStart(3, '0')}` : '',
    frequency: data.com1 !== null ? Number(data.com1).toFixed(3) : '',
    transponder: data.squawk !== '—' ? data.squawk : '',
  };
}

function renderScratchpad(content) {
  const { value } = scratchpadState();
  const data = flightData();
  content.innerHTML = `
    <div class="ops-page-grid scratchpad-grid">
      <article class="ops-card ops-card-wide">
        <header><div><small>ACTIVE FLIGHT</small><h2>${esc(data.callsign)} · ${esc(data.origin)} → ${esc(data.destination)}</h2></div><div class="ops-card-actions"><button type="button" data-scratch-auto>AUTO FILL</button><button type="button" data-scratch-clear class="danger-quiet">CLEAR</button></div></header>
        <div class="craft-grid">
          ${[['C','clearance','CLEARANCE'],['R','route','ROUTE'],['A','altitude','ALTITUDE'],['F','frequency','FREQUENCY'],['T','transponder','TRANSPONDER']].map(([letter,key,label]) => `<label class="craft-field"><span>${letter}</span><small>${label}</small><input data-craft="${key}" value="${esc(value.craft?.[key] || '')}" autocomplete="off"></label>`).join('')}
        </div>
      </article>
      <article class="ops-card scratch-note-card">
        <header><div><small>FREE TEXT</small><h2>Scratchpad</h2></div><span class="ops-badge">LOCAL</span></header>
        <textarea id="ops-scratch-note" spellcheck="false" placeholder="ATIS, taxi instructions, phone numbers, clearances …">${esc(value.note || '')}</textarea>
        <footer><span>Autosaved on this device</span><button type="button" data-copy-scratch>COPY</button></footer>
      </article>
      <article class="ops-card quick-data-card">
        <header><div><small>LIVE DATA</small><h2>Quick reference</h2></div></header>
        <dl class="ops-metrics"><div><dt>COM1</dt><dd>${data.com1 === null ? '—' : data.com1.toFixed(3)}</dd></div><div><dt>STBY</dt><dd>${data.com1Standby === null ? '—' : data.com1Standby.toFixed(3)}</dd></div><div><dt>SQUAWK</dt><dd>${esc(data.squawk)}</dd></div><div><dt>RWY</dt><dd>${esc(data.runway)}</dd></div></dl>
      </article>
    </div>`;
  const collect = () => ({
    note: content.querySelector('#ops-scratch-note')?.value || '',
    craft: Object.fromEntries([...content.querySelectorAll('[data-craft]')].map((input) => [input.dataset.craft, input.value])),
  });
  content.querySelectorAll('input,textarea').forEach((input) => input.addEventListener('input', () => saveScratchpad(collect())));
  content.querySelector('[data-scratch-auto]')?.addEventListener('click', () => {
    const next = collect(); next.craft = { ...next.craft, ...autoCraft() }; saveScratchpad(next); renderScratchpad(content);
  });
  content.querySelector('[data-scratch-clear]')?.addEventListener('click', () => { saveScratchpad({ note: '', craft: {} }); renderScratchpad(content); });
  content.querySelector('[data-copy-scratch]')?.addEventListener('click', async (event) => {
    const valueNow = collect();
    const craftText = ['clearance','route','altitude','frequency','transponder'].map((key, index) => `${'CRAFT'[index]}: ${valueNow.craft[key] || '—'}`).join('\n');
    const ok = await copyText(`${craftText}\n\n${valueNow.note || ''}`.trim());
    event.currentTarget.textContent = ok ? 'COPIED' : 'COPY FAILED';
  });
}

const CHECKLISTS = {
  preflight: {
    label: 'Preflight',
    items: [
      ['sim', 'MSFS data available', true, (s) => finite(s?.aircraft?.lat) !== null],
      ['flight', 'Flight / callsign loaded', true, (s) => flightData(s).callsign !== '—'],
      ['route', 'Route / destination loaded', true, (s) => flightData(s).destination !== '—'],
      ['park', 'Parking brake set', true, (s) => bool(s?.aircraft?.parkingBrake)],
      ['ofp', 'OFP reviewed', false],
      ['doors', 'Doors / boarding checked', false],
    ],
  },
  'before-start': {
    label: 'Before Start',
    items: [
      ['park', 'Parking brake set', true, (s) => bool(s?.aircraft?.parkingBrake)],
      ['engoff', 'Engines stopped', true, (s) => !bool(s?.aircraft?.enginesRunning)],
      ['fuel', 'Fuel quantity checked', true, (s) => finite(s?.aircraft?.fuelWeightPounds) !== null],
      ['clearance', 'ATC clearance received', false],
      ['beacon', 'Beacon ON', false],
      ['doors', 'Doors CLOSED', false],
    ],
  },
  'before-taxi': {
    label: 'Before Taxi',
    items: [
      ['engon', 'Engines running', true, (s) => bool(s?.aircraft?.enginesRunning)],
      ['ground', 'Aircraft on ground', true, (s) => bool(s?.aircraft?.onGround)],
      ['flaps', 'Takeoff flaps selected', true, (s) => finite(s?.aircraft?.flapsHandleIndex) > 0],
      ['taxi', 'Taxi clearance / route checked', false],
      ['transponder', 'Transponder set', false],
      ['lights', 'Taxi lights ON', false],
    ],
  },
  'before-takeoff': {
    label: 'Before Takeoff',
    items: [
      ['engon', 'Engines running', true, (s) => bool(s?.aircraft?.enginesRunning)],
      ['gear', 'Landing gear DOWN', true, (s) => bool(s?.aircraft?.gearDown)],
      ['flaps', 'Takeoff flaps selected', true, (s) => finite(s?.aircraft?.flapsHandleIndex) > 0],
      ['cabin', 'Cabin ready', false],
      ['lights', 'Landing lights ON', false],
      ['clearance', 'Takeoff clearance received', false],
    ],
  },
  'after-landing': {
    label: 'After Landing',
    items: [
      ['ground', 'Aircraft on ground', true, (s) => bool(s?.aircraft?.onGround)],
      ['gear', 'Landing gear DOWN', true, (s) => bool(s?.aircraft?.gearDown)],
      ['speed', 'Groundspeed below 40 kt', true, (s) => (finite(s?.aircraft?.groundSpeed) ?? 999) < 40],
      ['spoilers', 'Spoilers disarmed', true, (s) => !bool(s?.aircraft?.spoilersArmed)],
      ['lights', 'Landing lights OFF', false],
      ['apu', 'APU / ground power as required', false],
    ],
  },
  shutdown: {
    label: 'Shutdown',
    items: [
      ['ground', 'Aircraft on ground', true, (s) => bool(s?.aircraft?.onGround)],
      ['park', 'Parking brake set', true, (s) => bool(s?.aircraft?.parkingBrake)],
      ['engoff', 'Engines stopped', true, (s) => !bool(s?.aircraft?.enginesRunning)],
      ['fuel', 'Fuel / postflight recorded', false],
      ['doors', 'Doors / deboarding checked', false],
      ['log', 'Flight log closed', false],
    ],
  },
};

function manualChecklistState() {
  const all = load(OPS_STORAGE.checklist, {});
  const key = flightKey();
  return { all, key, value: all[key] || {} };
}

function renderChecklist(content) {
  const { all, key, value } = manualChecklistState();
  const definition = CHECKLISTS[activeChecklist] || CHECKLISTS.preflight;
  const rows = definition.items.map(([id, label, automatic, predicate]) => {
    const checked = automatic ? Boolean(predicate?.(latestState || {})) : Boolean(value[activeChecklist]?.[id]);
    return `<button type="button" class="checklist-row ${checked ? 'checked' : ''} ${automatic ? 'automatic' : ''}" data-check-item="${id}" ${automatic ? 'data-auto="1"' : ''}><span class="check-box">${checked ? '✓' : ''}</span><span><strong>${esc(label)}</strong><small>${automatic ? 'AUTO · SIMCONNECT' : 'MANUAL'}</small></span><em>${checked ? 'DONE' : 'OPEN'}</em></button>`;
  }).join('');
  const completed = definition.items.filter(([id,,automatic,predicate]) => automatic ? Boolean(predicate?.(latestState || {})) : Boolean(value[activeChecklist]?.[id])).length;
  content.innerHTML = `
    <article class="ops-card checklist-card">
      <header><div><small>SMART CHECKLIST</small><h2>${esc(flightData().callsign)} · ${completed}/${definition.items.length} complete</h2></div><button type="button" data-check-reset class="danger-quiet">RESET MANUAL</button></header>
      <div class="checklist-tabs">${Object.entries(CHECKLISTS).map(([id, item]) => `<button type="button" data-check-tab="${id}" class="${id === activeChecklist ? 'active' : ''}">${esc(item.label)}</button>`).join('')}</div>
      <div class="checklist-progress"><i style="width:${Math.round(completed / definition.items.length * 100)}%"></i></div>
      <div class="checklist-list">${rows}</div>
      <footer><span>Automatic items are read from MSFS. Manual items stay stored for the active flight.</span></footer>
    </article>`;
  content.querySelectorAll('[data-check-tab]').forEach((button) => button.addEventListener('click', () => { activeChecklist = button.dataset.checkTab; renderChecklist(content); }));
  content.querySelectorAll('[data-check-item]:not([data-auto])').forEach((button) => button.addEventListener('click', () => {
    const next = all[key] || {};
    next[activeChecklist] ||= {};
    next[activeChecklist][button.dataset.checkItem] = !next[activeChecklist][button.dataset.checkItem];
    all[key] = next; save(OPS_STORAGE.checklist, all); renderChecklist(content);
  }));
  content.querySelector('[data-check-reset]')?.addEventListener('click', () => { delete all[key]; save(OPS_STORAGE.checklist, all); renderChecklist(content); });
}

function reviewStore() {
  return load(OPS_STORAGE.reviews, {});
}

function ofpSummary() {
  const data = flightData();
  return [
    `FLIGHT ${data.callsign}`,
    `${data.origin} → ${data.destination}`,
    `AIRCRAFT ${data.aircraftType}`,
    `DEP RWY ${data.runway} / ARR RWY ${data.arrivalRunway}`,
    `ROUTE ${data.route}`,
    `CRUISE ${data.altitude === null ? '—' : `${Math.round(data.altitude)} ft`}`,
    `EET ${data.eet}`,
    `PLANNED FUEL ${data.fuelPlan === null ? '—' : String(data.fuelPlan)}`,
  ].join('\n');
}

function fuelReceiptData() {
  const data = flightData();
  const aircraft = latestState?.aircraft || {};
  const currentKg = lbsToKg(aircraft.fuelWeightPounds);
  const deliveredKg = fuelMonitor ? Math.max(0, fuelMonitor.maxKg - fuelMonitor.baseKg) : null;
  const explicitGsx = latestState?.integrations?.gsx;
  return {
    callsign: data.callsign,
    airport: data.currentAirport,
    gate: data.gate,
    planned: data.fuelPlan,
    currentKg,
    deliveredKg,
    startedAt: fuelMonitor?.startedAt || null,
    completedAt: fuelMonitor?.completedAt || null,
    source: explicitGsx?.connected || explicitGsx?.status === 'connected' ? 'GSX + SimConnect' : 'SimConnect inferred',
    inferred: !(explicitGsx?.connected || explicitGsx?.status === 'connected'),
  };
}

function renderDocuments(content) {
  const data = flightData();
  const reviews = reviewStore();
  const key = flightKey();
  const reviewedAt = reviews[key]?.ofp || null;
  const receipt = fuelReceiptData();
  content.innerHTML = `
    <div class="ops-page-grid documents-grid">
      <article class="ops-card ops-card-wide ofp-card">
        <header><div><small>OPERATIONAL FLIGHT PLAN</small><h2>${esc(data.callsign)} · ${esc(data.origin)} → ${esc(data.destination)}</h2></div><div class="ops-card-actions"><button type="button" data-ofp-copy>COPY</button><button type="button" data-ofp-export>EXPORT</button></div></header>
        <div class="document-status ${reviewedAt ? 'reviewed' : ''}"><span>${reviewedAt ? '✓' : '!'}</span><div><strong>${reviewedAt ? 'OFP REVIEWED' : 'REVIEW REQUIRED'}</strong><small>${reviewedAt ? formatDateTime(reviewedAt) : 'Review the operational summary before departure.'}</small></div><button type="button" data-ofp-review>${reviewedAt ? 'REVIEW AGAIN' : 'MARK REVIEWED'}</button></div>
        <dl class="ofp-grid"><div><dt>CALLSIGN</dt><dd>${esc(data.callsign)}</dd></div><div><dt>AIRCRAFT</dt><dd>${esc(data.aircraftType)}</dd></div><div><dt>ORIGIN</dt><dd>${esc(data.origin)}</dd></div><div><dt>DESTINATION</dt><dd>${esc(data.destination)}</dd></div><div><dt>DEP RWY</dt><dd>${esc(data.runway)}</dd></div><div><dt>ARR RWY</dt><dd>${esc(data.arrivalRunway)}</dd></div><div><dt>CRUISE</dt><dd>${data.altitude === null ? '—' : `${Math.round(data.altitude).toLocaleString()} ft`}</dd></div><div><dt>EET</dt><dd>${esc(data.eet)}</dd></div></dl>
        <div class="route-document"><small>ROUTE</small><p>${esc(data.route)}</p></div>
      </article>
      <article class="ops-card receipt-card">
        <header><div><small>GROUND DOCUMENT</small><h2>Fuel Receipt</h2></div><span class="ops-badge ${receipt.inferred ? 'inferred' : 'live'}">${receipt.inferred ? 'INFERRED' : 'GSX'}</span></header>
        <dl class="receipt-list"><div><dt>AIRPORT / GATE</dt><dd>${esc(receipt.airport)} · ${esc(receipt.gate)}</dd></div><div><dt>CURRENT FUEL</dt><dd>${formatKg(receipt.currentKg)}</dd></div><div><dt>DELIVERED</dt><dd>${formatKg(receipt.deliveredKg)}</dd></div><div><dt>START</dt><dd>${receipt.startedAt ? formatClock(receipt.startedAt) : '—'}</dd></div><div><dt>COMPLETED</dt><dd>${receipt.completedAt ? formatClock(receipt.completedAt) : '—'}</dd></div><div><dt>SOURCE</dt><dd>${esc(receipt.source)}</dd></div></dl>
        <footer><span>Fuel delivery is inferred from on-ground fuel changes unless GSX exposes a connected state.</span><button type="button" data-receipt-export>EXPORT</button></footer>
      </article>
      <article class="ops-card postflight-card">
        <header><div><small>POST FLIGHT</small><h2>Flight release</h2></div></header>
        ${renderCurrentFlightSummary()}
        <footer><span>Current flight data is continuously recorded in Flight Log.</span><button type="button" data-open-log>OPEN LOG</button></footer>
      </article>
    </div>`;
  content.querySelector('[data-ofp-review]')?.addEventListener('click', () => { reviews[key] = { ...(reviews[key] || {}), ofp: new Date().toISOString() }; save(OPS_STORAGE.reviews, reviews); renderDocuments(content); });
  content.querySelector('[data-ofp-copy]')?.addEventListener('click', async (event) => { event.currentTarget.textContent = await copyText(ofpSummary()) ? 'COPIED' : 'FAILED'; });
  content.querySelector('[data-ofp-export]')?.addEventListener('click', () => downloadJson(`OFP-${data.callsign.replace(/[^A-Za-z0-9_-]/g, '')}.json`, { ...data, reviewedAt }));
  content.querySelector('[data-receipt-export]')?.addEventListener('click', () => downloadJson(`Fuel-Receipt-${data.callsign.replace(/[^A-Za-z0-9_-]/g, '')}.json`, receipt));
  content.querySelector('[data-open-log]')?.addEventListener('click', () => openTool('logbook'));
}

async function fetchVatsim(force = false) {
  if (!force && vatsimData && Date.now() - vatsimFetchedAt < 55_000) return vatsimData;
  const response = await fetch(VATSIM_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`VATSIM HTTP ${response.status}`);
  vatsimData = await response.json();
  vatsimFetchedAt = Date.now();
  return vatsimData;
}

function nearbyVatsimPilots(data) {
  const position = ownship();
  if (!position) return [];
  return (data?.pilots || [])
    .map((pilot) => ({ ...pilot, distanceNm: greatCircleNm(position, pilot) }))
    .filter((pilot) => pilot.distanceNm !== null && pilot.distanceNm <= 120)
    .sort((a, b) => a.distanceNm - b.distanceNm)
    .slice(0, 30);
}

function relevantControllers(data) {
  const flight = flightData();
  const airports = new Set([flight.currentAirport, flight.origin, flight.destination].filter((entry) => entry && entry !== '—'));
  const withScore = (data?.controllers || []).map((controller) => {
    const call = String(controller.callsign || '').toUpperCase();
    let score = 0;
    for (const airport of airports) if (call.startsWith(airport)) score += 20;
    if (/_(TWR|GND|DEL|APP|DEP)$/.test(call)) score += 5;
    if (/_(CTR|FSS)$/.test(call)) score += 2;
    return { ...controller, score };
  });
  return withScore.filter((entry) => entry.score > 0 || airports.size === 0).sort((a, b) => b.score - a.score || String(a.callsign).localeCompare(String(b.callsign))).slice(0, 24);
}

function stageComFrequency(frequency) {
  const number = finite(frequency);
  if (number === null || number < 118 || number > 136.99) return false;
  const input = document.querySelector('#com1-frequency-input');
  if (!input) return false;
  input.value = number.toFixed(3);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const button = document.querySelector('[data-com-action="set"][data-com="1"][data-mode="standby"]');
  if (button && !button.disabled) button.click();
  return true;
}

function renderVatsim(content) {
  const loading = !vatsimData;
  const pilots = vatsimData ? nearbyVatsimPilots(vatsimData) : [];
  const controllers = vatsimData ? relevantControllers(vatsimData) : [];
  content.innerHTML = `
    <div class="ops-page-grid vatsim-grid">
      <article class="ops-card ops-card-wide vatsim-summary">
        <header><div><small>VATSIM NETWORK</small><h2>${loading ? 'Loading live network …' : `${(vatsimData?.pilots || []).length.toLocaleString()} pilots online`}</h2></div><div class="ops-card-actions"><span class="ops-badge live">${vatsimData ? `UPDATED ${formatClock(vatsimFetchedAt)}` : 'ONLINE'}</span><button type="button" data-vatsim-refresh>REFRESH</button></div></header>
        <div class="vatsim-columns">
          <section><h3>Relevant controllers</h3><div class="vatsim-list controllers">${controllers.length ? controllers.map((controller) => `<article><span class="network-dot"></span><div><strong>${esc(controller.callsign)}</strong><small>${esc(controller.name || controller.facility || 'ATC')}</small></div><b>${esc(controller.frequency || '—')}</b><button type="button" data-tune="${esc(controller.frequency || '')}">COM1 STBY</button></article>`).join('') : '<p class="ops-empty">No matching controllers found for the current route.</p>'}</div></section>
          <section><h3>Traffic within 120 NM</h3><div class="vatsim-list pilots">${pilots.length ? pilots.map((pilot) => `<article><span class="aircraft-mini">✈</span><div><strong>${esc(pilot.callsign)}</strong><small>${esc(pilot.flight_plan?.departure || '—')} → ${esc(pilot.flight_plan?.arrival || '—')}</small></div><b>${formatNm(pilot.distanceNm)}</b><em>FL${String(Math.max(0, Math.round((finite(pilot.altitude) || 0) / 100))).padStart(3, '0')}</em></article>`).join('') : '<p class="ops-empty">Ownship position unavailable or no VATSIM traffic within 120 NM.</p>'}</div></section>
        </div>
      </article>
      <article class="ops-card vatsim-help"><header><div><small>RADIO BRIDGE</small><h2>Controller → COM1</h2></div></header><p>Select <b>COM1 STBY</b> to stage the controller frequency directly in the existing COM module. The simulator remains the authoritative readback.</p><button type="button" data-open-com>OPEN COM MODULE</button></article>
    </div>`;
  content.querySelector('[data-vatsim-refresh]')?.addEventListener('click', async (event) => { event.currentTarget.disabled = true; try { await fetchVatsim(true); } catch {} finally { event.currentTarget.disabled = false; renderVatsim(content); } });
  content.querySelectorAll('[data-tune]').forEach((button) => button.addEventListener('click', () => { const ok = stageComFrequency(button.dataset.tune); button.textContent = ok ? 'STAGED ✓' : 'COM OFFLINE'; }));
  content.querySelector('[data-open-com]')?.addEventListener('click', () => { closeTool(); document.querySelector('[data-open-module="com"]')?.click(); });
  if (!vatsimData) fetchVatsim().then(() => { if (activeTool === 'vatsim') renderVatsim(content); }).catch(() => { if (activeTool === 'vatsim') { content.querySelector('.vatsim-summary h2').textContent = 'VATSIM data unavailable'; } });
}

function startVatsimRefresh() {
  stopVatsimRefresh();
  vatsimTimer = setInterval(async () => {
    if (activeTool !== 'vatsim' || document.hidden) return;
    try { await fetchVatsim(true); renderActiveTool(); } catch {}
  }, 60_000);
}

function stopVatsimRefresh() {
  if (vatsimTimer) clearInterval(vatsimTimer);
  vatsimTimer = null;
}

function logStore() {
  const value = load(OPS_STORAGE.logbook, { completed: [] });
  if (!Array.isArray(value.completed)) value.completed = [];
  return value;
}

function makeFlightLog(state) {
  const data = flightData(state);
  return {
    id: `${Date.now()}-${data.callsign}`,
    key: flightKey(state),
    callsign: data.callsign,
    origin: data.origin,
    destination: data.destination,
    aircraft: data.aircraftType,
    gateOut: data.gate,
    gateIn: '—',
    startedAt: new Date().toISOString(),
    offBlockAt: null,
    takeoffAt: null,
    landingAt: null,
    onBlockAt: null,
    completedAt: null,
    airborneSeen: false,
    fuelStartKg: lbsToKg(state?.aircraft?.fuelWeightPounds),
    fuelEndKg: null,
    events: [{ time: new Date().toISOString(), type: 'flight', text: `Flight tracking started: ${data.origin} → ${data.destination}` }],
    atc: [],
  };
}

function pushEvent(type, message) {
  if (!currentFlightLog || !message) return;
  const last = currentFlightLog.events.at(-1);
  if (last?.type === type && last?.text === message && Date.now() - new Date(last.time).getTime() < 15_000) return;
  currentFlightLog.events.push({ time: new Date().toISOString(), type, text: message });
  currentFlightLog.events = currentFlightLog.events.slice(-120);
}

function extractAtcMessages(state) {
  const candidates = [
    state?.integrations?.sayIntentions?.messages,
    state?.integrations?.si?.messages,
    state?.atc?.messages,
    state?.messages?.atc,
  ].filter(Array.isArray);
  const messages = [];
  for (const list of candidates) {
    for (const item of list.slice(-15)) {
      if (typeof item === 'string') messages.push({ text: item });
      else if (item && typeof item === 'object') messages.push({
        text: text(item.text, item.message, item.content, item.instruction),
        station: text(item.station, item.facility, item.controller),
        time: item.time || item.timestamp || item.createdAt,
      });
    }
  }
  return messages.filter((entry) => entry.text);
}

function updateAtcLog(state) {
  if (!currentFlightLog) return;
  const clearance = text(state?.taxi?.clearance, state?.guidance?.clearance, state?.atc?.clearance, state?.clearance?.text);
  if (clearance) {
    const fingerprint = clearance.slice(0, 220);
    if (fingerprint !== lastClearanceFingerprint) {
      lastClearanceFingerprint = fingerprint;
      currentFlightLog.atc.push({ time: new Date().toISOString(), station: 'ATC', text: clearance, kind: 'clearance' });
      pushEvent('atc', clearance);
    }
  }
  const messages = extractAtcMessages(state);
  const last = messages.at(-1);
  if (last) {
    const fingerprint = `${last.station || ''}|${last.text}`.slice(0, 260);
    if (fingerprint !== lastAtcMessageFingerprint) {
      lastAtcMessageFingerprint = fingerprint;
      currentFlightLog.atc.push({ time: last.time || new Date().toISOString(), station: last.station || 'ATC', text: last.text, kind: 'message' });
      currentFlightLog.atc = currentFlightLog.atc.slice(-100);
    }
  }
}

function updateFlightLog(state) {
  const data = flightData(state);
  const hasFlight = data.origin !== '—' || data.destination !== '—' || data.callsign !== '—';
  if (!currentFlightLog && hasFlight) currentFlightLog = makeFlightLog(state);
  if (!currentFlightLog) return;
  if (currentFlightLog.key !== flightKey(state) && currentFlightLog.airborneSeen) finalizeFlightLog(state, 'flight-changed');
  if (!currentFlightLog) currentFlightLog = makeFlightLog(state);
  const aircraft = state?.aircraft || {};
  const onGround = bool(aircraft.onGround);
  const speed = finite(aircraft.groundSpeed) || 0;
  const parking = bool(aircraft.parkingBrake);
  if (!currentFlightLog.offBlockAt && speed > 1 && !parking) { currentFlightLog.offBlockAt = new Date().toISOString(); pushEvent('ground', 'Off blocks / taxi started'); }
  if (!onGround && !currentFlightLog.takeoffAt) { currentFlightLog.takeoffAt = new Date().toISOString(); currentFlightLog.airborneSeen = true; pushEvent('flight', 'Takeoff detected'); }
  if (currentFlightLog.airborneSeen && onGround && !currentFlightLog.landingAt) { currentFlightLog.landingAt = new Date().toISOString(); pushEvent('flight', 'Landing detected'); }
  if (currentFlightLog.landingAt && onGround && parking && speed < 1 && !currentFlightLog.onBlockAt) { currentFlightLog.onBlockAt = new Date().toISOString(); pushEvent('ground', 'On blocks detected'); finalizeFlightLog(state, 'on-blocks'); }
  updateAtcLog(state);
}

function finalizeFlightLog(state, reason) {
  if (!currentFlightLog) return;
  currentFlightLog.completedAt = new Date().toISOString();
  currentFlightLog.fuelEndKg = lbsToKg(state?.aircraft?.fuelWeightPounds);
  currentFlightLog.gateIn = flightData(state).gate;
  currentFlightLog.reason = reason;
  const store = logStore();
  store.completed.unshift(currentFlightLog);
  store.completed = store.completed.slice(0, 30);
  save(OPS_STORAGE.logbook, store);
  currentFlightLog = null;
  lastClearanceFingerprint = '';
  lastAtcMessageFingerprint = '';
}

function renderCurrentFlightSummary() {
  if (!currentFlightLog) return '<p class="ops-empty">No active flight log yet.</p>';
  const used = currentFlightLog.fuelStartKg !== null && finite(latestState?.aircraft?.fuelWeightPounds) !== null
    ? currentFlightLog.fuelStartKg - lbsToKg(latestState.aircraft.fuelWeightPounds) : null;
  return `<dl class="ops-metrics"><div><dt>STARTED</dt><dd>${formatClock(currentFlightLog.startedAt)}</dd></div><div><dt>TAKEOFF</dt><dd>${currentFlightLog.takeoffAt ? formatClock(currentFlightLog.takeoffAt) : '—'}</dd></div><div><dt>LANDING</dt><dd>${currentFlightLog.landingAt ? formatClock(currentFlightLog.landingAt) : '—'}</dd></div><div><dt>FUEL USED</dt><dd>${formatKg(used)}</dd></div></dl>`;
}

function renderLogbook(content) {
  const store = logStore();
  const data = flightData();
  const atc = currentFlightLog?.atc || [];
  content.innerHTML = `
    <div class="ops-page-grid logbook-grid">
      <article class="ops-card current-log-card">
        <header><div><small>ACTIVE FLIGHT</small><h2>${esc(data.callsign)} · ${esc(data.origin)} → ${esc(data.destination)}</h2></div><div class="ops-card-actions"><button type="button" data-log-export>EXPORT</button><button type="button" data-log-close>FINISH</button></div></header>
        ${renderCurrentFlightSummary()}
        <div class="event-timeline">${currentFlightLog?.events?.length ? currentFlightLog.events.slice(-12).reverse().map((entry) => `<article><time>${formatClock(entry.time)}</time><span class="event-dot ${esc(entry.type)}"></span><p>${esc(entry.text)}</p></article>`).join('') : '<p class="ops-empty">Flight events will appear automatically.</p>'}</div>
      </article>
      <article class="ops-card atc-log-card">
        <header><div><small>ATC HISTORY</small><h2>Messages & clearances</h2></div><span class="ops-badge">${atc.length}</span></header>
        <div class="atc-history">${atc.length ? atc.slice(-20).reverse().map((entry) => `<article><div><strong>${esc(entry.station || 'ATC')}</strong><time>${formatClock(entry.time)}</time></div><p>${esc(entry.text)}</p></article>`).join('') : '<p class="ops-empty">No ATC messages captured yet. SayIntentions messages are stored when exposed in shared state.</p>'}</div>
      </article>
      <article class="ops-card ops-card-wide history-card">
        <header><div><small>LOGBOOK</small><h2>Recent flights</h2></div><span>${store.completed.length}/30</span></header>
        <div class="flight-history">${store.completed.length ? store.completed.map((flight) => `<article><div><strong>${esc(flight.callsign)}</strong><small>${esc(flight.origin)} → ${esc(flight.destination)}</small></div><span><b>${flight.takeoffAt ? formatClock(flight.takeoffAt) : '—'}</b><small>TAKEOFF</small></span><span><b>${flight.landingAt ? formatClock(flight.landingAt) : '—'}</b><small>LANDING</small></span><span><b>${formatKg(flight.fuelStartKg !== null && flight.fuelEndKg !== null ? flight.fuelStartKg - flight.fuelEndKg : null)}</b><small>FUEL</small></span><button type="button" data-export-history="${esc(flight.id)}">EXPORT</button></article>`).join('') : '<p class="ops-empty">Completed flights will be stored locally here.</p>'}</div>
      </article>
    </div>`;
  content.querySelector('[data-log-export]')?.addEventListener('click', () => currentFlightLog && downloadJson(`Flight-Log-${data.callsign.replace(/[^A-Za-z0-9_-]/g, '')}.json`, currentFlightLog));
  content.querySelector('[data-log-close]')?.addEventListener('click', () => { finalizeFlightLog(latestState || {}, 'manual'); renderLogbook(content); });
  content.querySelectorAll('[data-export-history]').forEach((button) => button.addEventListener('click', () => { const flight = store.completed.find((entry) => entry.id === button.dataset.exportHistory); if (flight) downloadJson(`Flight-Log-${flight.callsign.replace(/[^A-Za-z0-9_-]/g, '')}.json`, flight); }));
}

function launcherConfig() {
  return load(OPS_STORAGE.launcher, {
    slots: [
      { name: 'MSFS 2024 (Steam)', uri: 'steam://rungameid/2537590' },
      { name: 'Custom tool 1', uri: '' },
      { name: 'Custom tool 2', uri: '' },
    ],
  });
}

function safeLaunchUri(uri) {
  const value = String(uri || '').trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) || /^(javascript|data|file):/i.test(value)) return false;
  const anchor = document.createElement('a');
  anchor.href = value;
  anchor.target = '_blank';
  anchor.rel = 'noreferrer';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

function renderLauncher(content) {
  const config = launcherConfig();
  const fenixUrl = document.querySelector('#fenix-url')?.value || '';
  content.innerHTML = `
    <div class="ops-page-grid launcher-grid">
      <article class="ops-card ops-card-wide internal-launcher">
        <header><div><small>FLIGHT DECK</small><h2>Quick launch</h2></div><span class="ops-badge live">LOCAL</span></header>
        <div class="launch-button-grid">
          ${[['Taxi','taxi','T'],['COM','com','C'],['Live Map','flight','M'],['ATC','atc','A'],['Ground','ground','G'],['Settings','settings','S']].map(([label,module,icon]) => `<button type="button" data-internal-module="${module}"><span>${icon}</span><strong>${label}</strong><small>OPEN MODULE</small></button>`).join('')}
          ${fenixUrl ? `<button type="button" data-fenix-open><span>F</span><strong>Fenix EFB</strong><small>OPEN REMOTE EFB</small></button>` : ''}
        </div>
      </article>
      <article class="ops-card external-launcher">
        <header><div><small>WINDOWS / URI</small><h2>External tools</h2></div></header>
        <p class="ops-hint">Flight Deck can immediately launch registered URI schemes. Add a Steam or tool-specific URI; Windows decides which application handles it.</p>
        <div class="launcher-slots">${config.slots.map((slot, index) => `<article><input data-launch-name="${index}" value="${esc(slot.name)}" aria-label="Tool name"><input data-launch-uri="${index}" value="${esc(slot.uri)}" placeholder="scheme://…" aria-label="Launch URI"><button type="button" data-launch-run="${index}" ${slot.uri ? '' : 'disabled'}>LAUNCH</button></article>`).join('')}</div>
        <footer><span>Unsafe schemes such as javascript:, data: and file: are blocked.</span><button type="button" data-launch-save>SAVE</button></footer>
      </article>
      <article class="ops-card session-status-card">
        <header><div><small>SESSION</small><h2>Connection status</h2></div></header>
        <dl class="receipt-list"><div><dt>MSFS</dt><dd>${finite(latestState?.aircraft?.lat) !== null ? 'CONNECTED' : 'WAITING'}</dd></div><div><dt>GSX</dt><dd>${latestState?.integrations?.gsx?.connected ? 'CONNECTED' : 'AUTO DETECT'}</dd></div><div><dt>SIMBRIEF</dt><dd>${flightData().destination !== '—' ? 'FLIGHT LOADED' : 'WAITING'}</dd></div><div><dt>VATSIM</dt><dd>${vatsimData ? 'DATA ONLINE' : 'ON DEMAND'}</dd></div></dl>
      </article>
    </div>`;
  content.querySelectorAll('[data-internal-module]').forEach((button) => button.addEventListener('click', () => { closeTool(); document.querySelector(`[data-open-module="${button.dataset.internalModule}"]`)?.click(); }));
  content.querySelector('[data-fenix-open]')?.addEventListener('click', () => window.open(fenixUrl, '_blank', 'noreferrer'));
  content.querySelector('[data-launch-save]')?.addEventListener('click', () => {
    config.slots = config.slots.map((slot, index) => ({ name: content.querySelector(`[data-launch-name="${index}"]`)?.value || slot.name, uri: content.querySelector(`[data-launch-uri="${index}"]`)?.value || '' }));
    save(OPS_STORAGE.launcher, config); renderLauncher(content);
  });
  content.querySelectorAll('[data-launch-run]').forEach((button) => button.addEventListener('click', () => { const slot = config.slots[Number(button.dataset.launchRun)]; button.textContent = safeLaunchUri(slot?.uri) ? 'STARTED' : 'INVALID URI'; }));
}

function updateFuelMonitor(state) {
  const aircraft = state?.aircraft || {};
  const currentKg = lbsToKg(aircraft.fuelWeightPounds);
  if (currentKg === null) return;
  const onGround = bool(aircraft.onGround);
  const enginesRunning = bool(aircraft.enginesRunning);
  const key = flightKey(state);
  if (!fuelMonitor || fuelMonitor.key !== key) fuelMonitor = { key, baseKg: currentKg, maxKg: currentKg, startedAt: null, completedAt: null, lastIncreaseAt: null };
  if (!onGround || enginesRunning) return;
  if (currentKg > fuelMonitor.maxKg + 5) {
    if (!fuelMonitor.startedAt) fuelMonitor.startedAt = new Date().toISOString();
    fuelMonitor.maxKg = currentKg;
    fuelMonitor.lastIncreaseAt = Date.now();
    fuelMonitor.completedAt = null;
  }
  if (fuelMonitor.startedAt && !fuelMonitor.completedAt && fuelMonitor.lastIncreaseAt && Date.now() - fuelMonitor.lastIncreaseAt > 20_000) fuelMonitor.completedAt = new Date().toISOString();
}

function onFlightDeckState(event) {
  latestState = event.detail || latestState;
  updateFuelMonitor(latestState || {});
  updateFlightLog(latestState || {});
  if (activeTool && shell && !shell.hidden) {
    if (activeTool === 'checklist' || activeTool === 'documents' || activeTool === 'logbook' || activeTool === 'launcher') renderActiveTool();
    else if (activeTool === 'scratchpad') {
      const quick = shell.querySelector('.quick-data-card');
      if (quick) renderScratchpad(shell.querySelector('#ops-content'));
    }
  }
}

function startOperationsSuite() {
  installLauncherTiles();
  ensureShell();
  window.addEventListener('flightdeckstate', onFlightDeckState);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && activeTool) closeTool(); });
  const observer = new MutationObserver(() => installLauncherTiles());
  const home = document.querySelector('[data-page="home"]');
  if (home) observer.observe(home, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startOperationsSuite, { once: true });
else startOperationsSuite();
