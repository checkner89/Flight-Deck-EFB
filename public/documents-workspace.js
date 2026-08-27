const FD_DOCS_TOKEN_KEY = 'si-taxi-token';
const FD_DOCS_DB = 'flight-deck-documents-v1';
const FD_DOCS_STORE = 'documents';
const FD_DOCS_ANNOTATIONS = 'flight-deck-doc-annotations-v1';
const FD_DOCS_VERSION = '1.20.2-docs1';

let fdDocsState = null;
let fdDocsTimer = null;
let fdDocsClockTimer = null;
let fdDocsCurrentId = 'simbrief-ofp';
let fdDocsObjectUrl = null;
let fdDocsAnnotationTool = 'pan';
let fdDocsAnnotationColor = '#11c7bd';
let fdDocsStroke = null;
let fdDocsRedo = [];
let fdDocsCustomDocuments = [];

const fdDocs = {};

function fdToken() {
  const fromUrl = new URL(window.location.href).searchParams.get('token');
  return fromUrl || localStorage.getItem(FD_DOCS_TOKEN_KEY) || '';
}

function fdApiUrl(pathname) {
  const url = new URL(pathname, window.location.origin);
  const token = fdToken();
  if (token) url.searchParams.set('token', token);
  return url;
}

async function fdApi(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(fdApiUrl(pathname), {
    method,
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await response.json(); } catch { /* empty */ }
  if (!response.ok) throw new Error(data?.error || data?.detail || `HTTP ${response.status}`);
  return data;
}

function el(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key === 'html') element.innerHTML = value;
    else if (key.startsWith('data-')) element.setAttribute(key, value);
    else if (key === 'checked') element.checked = Boolean(value);
    else element.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined) continue;
    element.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return element;
}

function svgIcon(name) {
  const paths = {
    document: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M10 12h6M10 16h6"/>',
    hand: '<path d="M7 12V7a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v7c0 5-3 8-8 8H9c-3 0-5-2-6-5l-1-3a2 2 0 0 1 3-2l2 2Z"/>',
    pen: '<path d="m4 20 4.6-1 10-10-3.6-3.6-10 10L4 20Z"/><path d="m13.7 6.7 3.6 3.6"/>',
    highlighter: '<path d="m5 15 7-7 5 5-7 7H5v-5Z"/><path d="m14 6 2-2 5 5-2 2M4 22h16"/>',
    text: '<path d="M5 5h14M12 5v14M8 19h8"/>',
    eraser: '<path d="m4 15 8-9 7 6-7 8H7l-3-3v-2Z"/><path d="m10 20 5-6"/>',
    undo: '<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',
    redo: '<path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/>',
    upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M5 15v5h14v-5"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18 9a7 7 0 0 0-12-2L4 9m2 6a7 7 0 0 0 12 2l2-2"/>',
    sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    radio: '<path d="M5 8h14v10H5zM8 8l2-4h4l2 4M8 12h5M8 15h3"/><circle cx="16.5" cy="14.5" r="1.5"/>',
    taxi: '<path d="M4 17h12V9h-6l-3 4H4v4Zm12-5h3l2 3v2h-5"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
    map: '<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2V6Zm5-2v14m6-12v14"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v6H5V6h6"/>',
    trash: '<path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 10v7m4-7v7"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.document}</svg>`;
}

function safe(value, fallback = '—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatWeight(pounds) {
  const value = numeric(pounds);
  if (value === null) return '—';
  const metric = localStorage.getItem('flight-deck-weight-unit') === 'kg';
  return metric ? `${Math.round(value * 0.453592).toLocaleString()} kg` : `${Math.round(value).toLocaleString()} lb`;
}

function formatDuration(seconds) {
  const value = numeric(seconds);
  if (value === null) return '—';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function formatEpoch(seconds) {
  const value = numeric(seconds);
  if (value === null) return '—';
  const date = new Date(value * 1000);
  if (Number.isNaN(date.valueOf())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function routeProgress() {
  const raw = String(document.querySelector('#journey-progress-value')?.textContent || document.querySelector('#flight-overlay-top-progress-value')?.textContent || '');
  const match = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
  const percent = match ? Math.max(0, Math.min(100, Number(match[1].replace(',', '.')))) : 0;
  const remaining = safe(document.querySelector('#home-flight-remaining')?.textContent || document.querySelector('#journey-remaining')?.textContent, '—');
  const eta = safe(document.querySelector('#home-flight-eta')?.textContent || document.querySelector('#journey-eta')?.textContent, '—').replace(/^ETA\s*/i, '');
  return { percent, remaining, eta };
}

function flightKey(state = fdDocsState || {}) {
  const plan = state.integrations?.simbrief?.flight || {};
  const generated = state.integrations?.simbrief?.generatedAt || 'current';
  return `${safe(plan.callsign, 'flight')}-${safe(plan.origin, '----')}-${safe(plan.destination, '----')}-${generated}`.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 160);
}

function currentPlan(state = fdDocsState || {}) {
  return state.integrations?.simbrief?.flight || {};
}

function makeOfpHtml(plan) {
  const route = htmlEscape(plan.route || 'No route available');
  return `
    <div class="fd-document-paper fd-ofp-paper">
      <div class="fd-ofp-head">
        <strong>${htmlEscape(safe(plan.callsign, 'FLIGHT'))}</strong>
        <span>${htmlEscape(safe(plan.origin))} → ${htmlEscape(safe(plan.destination))}</span>
        <b>${htmlEscape(safe(plan.aircraftType))}</b>
      </div>
      <div class="fd-ofp-rule"></div>
      <h3>OPERATIONAL FLIGHT PLAN</h3>
      <p class="fd-ofp-muted">Imported from SimBrief · ${htmlEscape(safe(fdDocsState?.integrations?.simbrief?.generatedAt, 'latest OFP'))}</p>
      <div class="fd-ofp-grid">
        <section><small>TRIP SUMMARY</small><dl>
          <div><dt>Flight</dt><dd>${htmlEscape(safe(plan.callsign))}</dd></div>
          <div><dt>Route</dt><dd>${htmlEscape(safe(plan.origin))} → ${htmlEscape(safe(plan.destination))}</dd></div>
          <div><dt>Aircraft</dt><dd>${htmlEscape(safe(plan.aircraftType))} ${htmlEscape(safe(plan.registration, ''))}</dd></div>
          <div><dt>Distance</dt><dd>${numeric(plan.routeDistanceNm) === null ? '—' : `${Math.round(plan.routeDistanceNm)} NM`}</dd></div>
          <div><dt>EET</dt><dd>${formatDuration(plan.enrouteSeconds)}</dd></div>
          <div><dt>Cost Index</dt><dd>${htmlEscape(safe(plan.costIndex))}</dd></div>
        </dl></section>
        <section><small>FUEL</small><dl>
          <div><dt>Block</dt><dd>${formatWeight(plan.blockFuelPounds)}</dd></div>
          <div><dt>Trip</dt><dd>${formatWeight(plan.tripFuelPounds)}</dd></div>
          <div><dt>Taxi</dt><dd>${formatWeight(plan.taxiFuelPounds)}</dd></div>
          <div><dt>Alternate</dt><dd>${formatWeight(plan.alternateFuelPounds)}</dd></div>
          <div><dt>Reserve</dt><dd class="accent">${formatWeight(plan.reserveFuelPounds)}</dd></div>
          <div><dt>Contingency</dt><dd>${formatWeight(plan.contingencyFuelPounds)}</dd></div>
        </dl></section>
      </div>
      <section class="fd-ofp-section"><small>ATC ROUTE</small><pre>${route}</pre></section>
      <div class="fd-ofp-grid">
        <section><small>WEIGHTS</small><dl>
          <div><dt>ZFW</dt><dd>${formatWeight(plan.zeroFuelWeightPounds)}</dd></div>
          <div><dt>TOW</dt><dd>${formatWeight(plan.takeoffWeightPounds)}</dd></div>
          <div><dt>LW</dt><dd>${formatWeight(plan.landingWeightPounds)}</dd></div>
          <div><dt>PAX</dt><dd>${htmlEscape(safe(plan.passengers))}</dd></div>
        </dl></section>
        <section><small>AIRPORTS</small><dl>
          <div><dt>Departure</dt><dd>${htmlEscape(safe(plan.origin))} · RWY ${htmlEscape(safe(plan.departureRunway))}</dd></div>
          <div><dt>Destination</dt><dd>${htmlEscape(safe(plan.destination))} · RWY ${htmlEscape(safe(plan.arrivalRunway))}</dd></div>
          <div><dt>Alternate</dt><dd>${htmlEscape(safe(plan.alternate))}</dd></div>
          <div><dt>Airac</dt><dd>${htmlEscape(safe(plan.airacCycle))}</dd></div>
        </dl></section>
      </div>
      <section class="fd-ofp-section"><small>DESTINATION WEATHER</small><pre>${htmlEscape(safe(plan.destinationMetar, 'No destination METAR in current OFP'))}\n${htmlEscape(safe(plan.destinationTaf, 'No destination TAF in current OFP'))}</pre></section>
      <div class="fd-ofp-rule"></div>
      <footer>FLIGHT DECK EFB · SIMBRIEF IMPORT · FOR FLIGHT SIMULATION ONLY</footer>
    </div>`;
}

function makeRouteHtml(plan) {
  return `<div class="fd-document-paper"><h2>ATC Flight Plan</h2><p class="fd-document-lead">${htmlEscape(safe(plan.callsign))} · ${htmlEscape(safe(plan.origin))} → ${htmlEscape(safe(plan.destination))}</p><div class="fd-data-grid"><span><small>SID</small><b>${htmlEscape(safe(plan.sid))}</b></span><span><small>STAR</small><b>${htmlEscape(safe(plan.star))}</b></span><span><small>CRUISE</small><b>${numeric(plan.cruiseAltitudeFeet) === null ? '—' : `FL${Math.round(plan.cruiseAltitudeFeet / 100)}`}</b></span><span><small>AIRCRAFT</small><b>${htmlEscape(safe(plan.aircraftType))}</b></span></div><h3>Filed route</h3><pre class="fd-route-text">${htmlEscape(safe(plan.route, 'No route available'))}</pre></div>`;
}

function makeFuelHtml(plan) {
  const rows = [
    ['Block fuel', plan.blockFuelPounds], ['Taxi fuel', plan.taxiFuelPounds], ['Trip fuel', plan.tripFuelPounds],
    ['Contingency', plan.contingencyFuelPounds], ['Alternate fuel', plan.alternateFuelPounds], ['Final reserve', plan.reserveFuelPounds], ['Extra fuel', plan.extraFuelPounds],
  ];
  return `<div class="fd-document-paper"><h2>Fuel Planning</h2><table class="fd-doc-table"><thead><tr><th>Item</th><th>Planned</th></tr></thead><tbody>${rows.map(([label, value]) => `<tr><td>${label}</td><td>${formatWeight(value)}</td></tr>`).join('')}</tbody></table></div>`;
}

function makeTimesHtml(plan) {
  const rows = [
    ['Estimated out', formatEpoch(plan.estimatedOut)], ['Estimated off', formatEpoch(plan.estimatedOff)], ['Estimated on', formatEpoch(plan.estimatedOn)], ['Estimated in', formatEpoch(plan.estimatedIn)], ['Enroute', formatDuration(plan.enrouteSeconds)], ['Block', formatDuration(plan.blockSeconds)],
  ];
  return `<div class="fd-document-paper"><h2>Flight Times</h2><table class="fd-doc-table"><tbody>${rows.map(([label, value]) => `<tr><td>${label}</td><td>${value}</td></tr>`).join('')}</tbody></table></div>`;
}

function weatherAirportHtml(title, icao, metar, taf) {
  return `<section class="fd-weather-block"><header><small>${title}</small><h2>${htmlEscape(safe(icao))}</h2></header><label>METAR</label><pre>${htmlEscape(safe(metar, 'No METAR available'))}</pre><label>TAF</label><pre>${htmlEscape(safe(taf, 'No TAF available'))}</pre></section>`;
}

function makeWeatherHtml(plan) {
  const sections = [];
  if (plan.origin) sections.push(weatherAirportHtml('DEPARTURE', plan.origin, plan.originMetar, plan.originTaf));
  if (plan.destination) sections.push(weatherAirportHtml('DESTINATION', plan.destination, plan.destinationMetar, plan.destinationTaf));
  if (plan.alternate) sections.push(weatherAirportHtml('ALTERNATE', plan.alternate, plan.alternateMetar, plan.alternateTaf));
  return sections.length
    ? `<div class="fd-document-paper">${sections.join('')}</div>`
    : makePlaceholderHtml('Weather', 'No airport weather is stored in the current SimBrief summary.');
}

function makePlaceholderHtml(title, detail) {
  return `<div class="fd-document-paper fd-placeholder"><span class="fd-placeholder-icon">${svgIcon('document')}</span><h2>${htmlEscape(title)}</h2><p>${htmlEscape(detail)}</p><p class="fd-ofp-muted">You can add a PDF, image or text document with “Add document” and annotate it inside this workspace.</p></div>`;
}

function builtinDocuments(state = fdDocsState || {}) {
  const plan = currentPlan(state);
  const docs = [
    { id: 'simbrief-ofp', label: 'GENERAL', title: 'SimBrief OFP', chip: 'SimBrief OFP', kind: 'html', html: () => makeOfpHtml(plan) },
  ];
  if (plan.ofpLink) docs.push({ id: 'simbrief-pdf', label: 'OFP PDF', title: 'SimBrief OFP PDF', chip: 'OFP PDF', kind: 'url', url: fdApiUrl('/api/simbrief/document').toString() });
  docs.push(
    { id: 'atc-plan', label: 'ATC PLAN', title: 'ATC Flight Plan', chip: 'ATC Plan', kind: 'html', html: () => makeRouteHtml(plan) },
    { id: 'fuel', label: 'FUEL', title: 'Fuel Planning', chip: 'Fuel', kind: 'html', html: () => makeFuelHtml(plan) },
    { id: 'flight-times', label: 'FLIGHT TIMES', title: 'Flight Times', chip: 'Times', kind: 'html', html: () => makeTimesHtml(plan) },
    { id: 'weather', label: 'WEATHER', title: 'Weather Briefing', chip: 'Weather Briefing', kind: 'html', html: () => makeWeatherHtml(plan) },
    { id: 'departure', label: `${safe(plan.origin, 'DEP')} DEPARTURE`, title: `${safe(plan.origin, 'Departure')} Briefing`, chip: 'METAR / TAF', kind: 'html', html: () => makeWeatherHtml({ origin: plan.origin, originMetar: plan.originMetar, originTaf: plan.originTaf }) },
    { id: 'destination', label: `${safe(plan.destination, 'DEST')} DESTINATION`, title: `${safe(plan.destination, 'Destination')} Briefing`, chip: 'Destination', kind: 'html', html: () => makeWeatherHtml({ destination: plan.destination, destinationMetar: plan.destinationMetar, destinationTaf: plan.destinationTaf }) },
    { id: 'alternates', label: 'ALTERNATES', title: 'Alternate Airports', chip: 'Alternates', kind: 'html', html: () => plan.alternate ? makeWeatherHtml({ alternate: plan.alternate, alternateMetar: plan.alternateMetar, alternateTaf: plan.alternateTaf }) : makePlaceholderHtml('Alternates', 'No alternate airport is stored in the current SimBrief summary.') },
    { id: 'notams', label: 'NOTAMS', title: 'NOTAMs', chip: 'NOTAMs', kind: 'html', html: () => makePlaceholderHtml('NOTAMs', 'The current Flight Deck SimBrief bridge does not yet expose raw NOTAM text. Import the briefing PDF here to mark up NOTAMs directly.') },
    { id: 'sigwx', label: 'SIGWX', title: 'SIGWX', chip: 'SIGWX', kind: 'html', html: () => makePlaceholderHtml('SIGWX', 'Add your SimBrief SIGWX or weather chart as PDF/image to keep it with this flight.') },
  );
  return docs;
}

function allDocuments() {
  const custom = fdDocsCustomDocuments.map((record) => ({
    id: record.id,
    label: record.category || 'CUSTOM',
    title: record.name,
    chip: record.name,
    kind: 'blob',
    record,
  }));
  return [...builtinDocuments(), ...custom];
}

function findDocument(id) {
  return allDocuments().find((doc) => doc.id === id) || allDocuments()[0];
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FD_DOCS_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FD_DOCS_STORE)) {
        const store = db.createObjectStore(FD_DOCS_STORE, { keyPath: 'id' });
        store.createIndex('flightKey', 'flightKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadCustomDocuments() {
  try {
    const db = await openDb();
    const key = flightKey();
    fdDocsCustomDocuments = await new Promise((resolve, reject) => {
      const tx = db.transaction(FD_DOCS_STORE, 'readonly');
      const request = tx.objectStore(FD_DOCS_STORE).index('flightKey').getAll(key);
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
      request.onerror = () => reject(request.error);
    });
    db.close();
  } catch (error) {
    console.warn('[Flight Deck Documents] IndexedDB unavailable:', error);
    fdDocsCustomDocuments = [];
  }
}

async function storeDocument(file, category = 'CUSTOM') {
  const db = await openDb();
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = { id, flightKey: flightKey(), name: file.name, type: file.type || 'application/octet-stream', category, createdAt: Date.now(), blob: file };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FD_DOCS_STORE, 'readwrite');
    tx.objectStore(FD_DOCS_STORE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return record;
}

async function deleteDocument(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(FD_DOCS_STORE, 'readwrite');
    tx.objectStore(FD_DOCS_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  localStorage.removeItem(annotationKey(id));
}

function annotationKey(docId) {
  return `${FD_DOCS_ANNOTATIONS}:${flightKey()}:${docId}`;
}

function loadAnnotations(docId = fdDocsCurrentId) {
  try {
    const value = JSON.parse(localStorage.getItem(annotationKey(docId)) || '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function saveAnnotations(items, docId = fdDocsCurrentId) {
  try { localStorage.setItem(annotationKey(docId), JSON.stringify(items.slice(-1000))); } catch { /* quota */ }
}

function setStatus(message, kind = '') {
  if (!fdDocs.status) return;
  fdDocs.status.textContent = message || '';
  fdDocs.status.dataset.state = kind;
}

function buildWorkspace() {
  if (document.getElementById('fd-docs-workspace')) return;
  const overlay = el('section', { id: 'fd-docs-workspace', class: 'fd-docs-workspace', hidden: true, 'aria-label': 'OFP and Documents workspace' });
  const shell = el('div', { class: 'fd-docs-shell' });

  const top = el('header', { class: 'fd-docs-topbar' });
  const brand = el('div', { class: 'fd-docs-brand' }, el('span', { class: 'fd-docs-brand-mark' }), el('div', {}, el('strong', { text: 'FLIGHT DECK EFB' }), el('small', { text: 'OFP & DOCUMENTS' })));
  const route = el('div', { class: 'fd-docs-top-route' }, el('strong', { id: 'fd-docs-route', text: '— → —' }), el('span', { id: 'fd-docs-callsign', text: '—' }));
  const clocks = el('div', { class: 'fd-docs-clocks' }, el('span', {}, el('small', { text: 'UTC' }), el('b', { id: 'fd-docs-utc', text: '—' })), el('span', {}, el('small', { text: 'LOCAL' }), el('b', { id: 'fd-docs-local', text: '—' })));
  const topActions = el('div', { class: 'fd-docs-top-actions' });
  const importBtn = el('button', { class: 'fd-docs-btn secondary', type: 'button', title: 'Import latest SimBrief OFP', 'aria-label': 'Import SimBrief' }); importBtn.innerHTML = `${svgIcon('refresh')}<span>SIMBRIEF</span>`;
  const themeBtn = el('button', { class: 'fd-docs-icon-btn', type: 'button', title: 'Toggle light/dark mode', 'aria-label': 'Toggle light/dark mode' }); themeBtn.innerHTML = svgIcon('sun');
  const closeBtn = el('button', { class: 'fd-docs-icon-btn', type: 'button', title: 'Close documents', 'aria-label': 'Close documents' }); closeBtn.innerHTML = svgIcon('close');
  topActions.append(importBtn, themeBtn, closeBtn);
  top.append(brand, route, clocks, topActions);

  const progress = el('section', { class: 'fd-docs-progress' });
  progress.innerHTML = `<div class="fd-docs-airport"><small>FROM</small><strong id="fd-docs-origin">—</strong><span id="fd-docs-origin-name">Departure</span></div><div class="fd-docs-progress-center"><div class="fd-docs-progress-track"><i id="fd-docs-progress-fill"></i><b id="fd-docs-progress-plane">✈</b></div><div class="fd-docs-progress-meta"><span id="fd-docs-distance">—</span><span id="fd-docs-remaining">— remaining</span></div></div><div class="fd-docs-airport right"><small>TO</small><strong id="fd-docs-destination">—</strong><span id="fd-docs-destination-name">Destination</span></div><div class="fd-docs-eta"><small>ETA</small><strong id="fd-docs-eta">—</strong><span id="fd-docs-runway">RWY —</span></div>`;

  const layout = el('main', { class: 'fd-docs-layout' });
  const sidebar = el('aside', { class: 'fd-docs-sidebar' });
  const sideHead = el('div', { class: 'fd-docs-sidebar-head' }, el('small', { text: 'FLIGHT BRIEFING' }), el('strong', { text: 'Documents' }));
  const nav = el('nav', { id: 'fd-docs-nav', class: 'fd-docs-nav' });
  const add = el('button', { class: 'fd-docs-add', type: 'button' }); add.innerHTML = `${svgIcon('upload')}<span>ADD DOCUMENT</span>`;
  const file = el('input', { id: 'fd-docs-file', type: 'file', accept: 'application/pdf,image/png,image/jpeg,image/webp,text/plain,.txt', multiple: true, hidden: true });
  sidebar.append(sideHead, nav, add, file);

  const center = el('section', { class: 'fd-docs-center' });
  const tabs = el('div', { id: 'fd-docs-tabs', class: 'fd-docs-tabs' });
  const viewerHeader = el('div', { class: 'fd-docs-viewer-header' }, el('div', {}, el('small', { id: 'fd-docs-doc-kind', text: 'SIMBRIEF' }), el('strong', { id: 'fd-docs-doc-title', text: 'SimBrief OFP' })), el('div', { class: 'fd-docs-viewer-actions' }));
  const viewerActions = viewerHeader.querySelector('.fd-docs-viewer-actions');
  const externalBtn = el('button', { class: 'fd-docs-mini-btn', type: 'button', title: 'Open original SimBrief PDF' }); externalBtn.innerHTML = `${svgIcon('external')}<span>ORIGINAL</span>`;
  const deleteBtn = el('button', { class: 'fd-docs-mini-btn danger', type: 'button', hidden: true, title: 'Delete custom document' }); deleteBtn.innerHTML = `${svgIcon('trash')}<span>DELETE</span>`;
  viewerActions.append(externalBtn, deleteBtn);
  const viewerWrap = el('div', { id: 'fd-docs-viewer-wrap', class: 'fd-docs-viewer-wrap' });
  const viewer = el('div', { id: 'fd-docs-viewer', class: 'fd-docs-viewer' });
  const canvas = el('canvas', { id: 'fd-docs-canvas', class: 'fd-docs-canvas' });
  viewerWrap.append(viewer, canvas);
  const status = el('div', { id: 'fd-docs-status', class: 'fd-docs-status', role: 'status' });
  center.append(tabs, viewerHeader, viewerWrap, status);

  const annotation = el('aside', { class: 'fd-docs-annotation', 'aria-label': 'Document annotation tools' });
  const toolDefs = [['pan', 'Pan / scroll'], ['pen', 'Pen'], ['highlighter', 'Highlighter'], ['text', 'Text'], ['eraser', 'Eraser'], ['undo', 'Undo'], ['redo', 'Redo']];
  for (const [tool, label] of toolDefs) {
    const button = el('button', { type: 'button', class: `fd-docs-tool ${tool === 'pan' ? 'active' : ''}`, 'data-fd-tool': tool, title: label, 'aria-label': label });
    button.innerHTML = svgIcon(tool === 'pan' ? 'hand' : tool);
    annotation.append(button);
  }
  const colors = el('div', { class: 'fd-docs-colors' });
  for (const color of ['#f1d94f', '#11c7bd', '#ef5350', '#3f8cff', '#ffffff']) {
    colors.append(el('button', { type: 'button', class: `fd-docs-color ${color === fdDocsAnnotationColor ? 'active' : ''}`, 'data-fd-color': color, title: color, style: `--fd-color:${color}` }));
  }
  annotation.append(colors);

  const right = el('aside', { class: 'fd-docs-right' });
  right.innerHTML = `
    <article class="fd-docs-widget"><header><small>LIVE FLIGHT</small><b id="fd-docs-live-status">WAITING</b></header><div class="fd-docs-widget-grid"><span><small>ALTITUDE</small><strong id="fd-docs-altitude">—</strong></span><span><small>SPEED</small><strong id="fd-docs-speed">—</strong></span><span><small>COM ACTIVE</small><strong id="fd-docs-com-active">—</strong></span><span><small>COM STBY</small><strong id="fd-docs-com-standby">—</strong></span></div></article>
    <article class="fd-docs-widget"><header><small>AIRPORT PREVIEW</small><b id="fd-docs-airport-ident">—</b></header><div class="fd-docs-airport-preview"><span class="runway-line"></span><b id="fd-docs-airport-runway">RWY —</b><i>✈</i></div><p id="fd-docs-airport-detail">Destination information from SimBrief / simulator</p></article>
    <article class="fd-docs-widget"><header><small>WEATHER OVERVIEW</small><b id="fd-docs-weather-airport">—</b></header><div class="fd-docs-weather-main"><strong id="fd-docs-weather-temp">METAR</strong><span id="fd-docs-weather-wind">—</span></div><p id="fd-docs-weather-text">No weather available.</p></article>
    <article class="fd-docs-widget quick"><header><small>QUICK JUMP</small><b>COCKPIT</b></header><div class="fd-docs-quick"><button type="button" data-fd-jump="com">${svgIcon('radio')}<span>COM</span></button><button type="button" data-fd-jump="taxi">${svgIcon('taxi')}<span>TAXI</span></button><button type="button" data-fd-jump="map">${svgIcon('map')}<span>LIVE MAP</span></button></div></article>`;

  layout.append(sidebar, center, annotation, right);
  shell.append(top, progress, layout);
  overlay.append(shell);
  document.body.append(overlay);

  Object.assign(fdDocs, { overlay, shell, nav, tabs, add, file, viewer, viewerWrap, canvas, status, importBtn, themeBtn, closeBtn, externalBtn, deleteBtn });

  closeBtn.addEventListener('click', closeWorkspace);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeWorkspace(); });
  importBtn.addEventListener('click', importSimBrief);
  themeBtn.addEventListener('click', toggleTheme);
  add.addEventListener('click', () => file.click());
  file.addEventListener('change', uploadDocuments);
  externalBtn.addEventListener('click', openOriginalOfp);
  deleteBtn.addEventListener('click', deleteCurrentDocument);
  annotation.addEventListener('click', annotationToolbarClick);
  right.addEventListener('click', quickJump);
  canvas.addEventListener('pointerdown', annotationPointerDown);
  canvas.addEventListener('pointermove', annotationPointerMove);
  canvas.addEventListener('pointerup', annotationPointerUp);
  canvas.addEventListener('pointercancel', annotationPointerUp);
  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !overlay.hidden) closeWorkspace(); });
}

function installLauncher() {
  const grid = document.querySelector('.app-launcher-grid');
  if (grid && !grid.querySelector('[data-fd-docs-launcher]')) {
    const tile = el('button', { class: 'efb-app-tile documents-app', type: 'button', 'data-app-id': 'documents', 'data-fd-docs-launcher': '1' });
    tile.innerHTML = `<span class="app-tile-icon">${svgIcon('document')}</span><span class="app-tile-copy"><small>OFP · BRIEFING · ANNOTATION</small><strong>Documents</strong><span>SimBrief OFP, briefing documents and mark-up</span></span><i class="app-open-arrow">›</i>`;
    tile.addEventListener('click', openWorkspace);
    const settings = grid.querySelector('.settings-app');
    if (settings) grid.insertBefore(tile, settings); else grid.append(tile);
  }

  const heading = document.querySelector('[data-page="flight"] .page-heading');
  if (heading && !heading.querySelector('[data-fd-docs-flight-button]')) {
    const button = el('button', { class: 'secondary-card-action fd-docs-flight-button', type: 'button', 'data-fd-docs-flight-button': '1' });
    button.innerHTML = `${svgIcon('document')}<span>OFP & DOCUMENTS</span>`;
    button.addEventListener('click', openWorkspace);
    heading.append(button);
  }
}

function toggleTheme() {
  const existing = document.getElementById('quick-theme-toggle');
  if (existing) { existing.click(); return; }
  const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('flight-deck-theme', next);
}

function updateClock() {
  const now = new Date();
  const utc = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(now);
  const local = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  document.getElementById('fd-docs-utc').textContent = utc;
  document.getElementById('fd-docs-local').textContent = local;
}

async function refreshState() {
  try {
    fdDocsState = await fdApi('/api/state');
    renderState();
  } catch (error) {
    setStatus(`Live data unavailable: ${error.message}`, 'error');
  }
}

function renderState() {
  if (!fdDocsState) return;
  const plan = currentPlan();
  const flight = fdDocsState.flight || {};
  const aircraft = fdDocsState.aircraft || {};
  const com = { ...aircraft, ...(fdDocsState.integrations?.com || {}) };
  const origin = safe(flight.origin || plan.origin);
  const destination = safe(flight.destination || plan.destination);
  const callsign = safe(flight.callsign || plan.callsign);
  const progress = routeProgress();
  const airborne = aircraft.onGround === false;
  const runway = airborne ? (flight.arrivalRunway || plan.arrivalRunway || flight.departureRunway || plan.departureRunway) : (flight.departureRunway || plan.departureRunway || flight.arrivalRunway || plan.arrivalRunway);

  setText('fd-docs-route', `${origin} → ${destination}`);
  setText('fd-docs-callsign', callsign);
  setText('fd-docs-origin', origin);
  setText('fd-docs-origin-name', safe(plan.originName, 'Departure'));
  setText('fd-docs-destination', destination);
  setText('fd-docs-destination-name', safe(plan.destinationName, 'Destination'));
  setText('fd-docs-distance', numeric(plan.routeDistanceNm) === null ? '—' : `${Math.round(plan.routeDistanceNm)} NM planned`);
  setText('fd-docs-remaining', progress.remaining === '—' ? '— remaining' : `${progress.remaining} remaining`);
  setText('fd-docs-eta', progress.eta === '—' ? formatEpoch(plan.estimatedIn) : progress.eta);
  setText('fd-docs-runway', runway ? `RWY ${runway}` : 'RWY —');
  const fill = document.getElementById('fd-docs-progress-fill');
  const plane = document.getElementById('fd-docs-progress-plane');
  if (fill) fill.style.width = `${progress.percent}%`;
  if (plane) plane.style.left = `${Math.max(2, Math.min(98, progress.percent))}%`;

  setText('fd-docs-live-status', fdDocsState.connections?.simConnect?.status === 'connected' ? 'CONNECTED' : 'WAITING');
  setText('fd-docs-altitude', numeric(aircraft.altitudeFeet) === null ? '—' : `${Math.round(aircraft.altitudeFeet).toLocaleString()} ft`);
  const ias = numeric(aircraft.indicatedAirspeed); const gs = numeric(aircraft.groundSpeed);
  setText('fd-docs-speed', ias !== null ? `${Math.round(ias)} kt IAS` : gs !== null ? `${Math.round(gs)} kt GS` : '—');
  const radio = com.com2Transmit && !com.com1Transmit ? 2 : 1;
  setText('fd-docs-com-active', formatFrequency(radio === 2 ? com.com2Active : com.com1Active));
  setText('fd-docs-com-standby', formatFrequency(radio === 2 ? com.com2Standby : com.com1Standby));

  setText('fd-docs-airport-ident', destination);
  setText('fd-docs-airport-runway', plan.arrivalRunway ? `RWY ${plan.arrivalRunway}` : 'RWY —');
  setText('fd-docs-airport-detail', [plan.destinationName, fdDocsState.gate?.name ? `Gate ${fdDocsState.gate.name}` : ''].filter(Boolean).join(' · ') || 'Destination information from SimBrief / simulator');
  setText('fd-docs-weather-airport', destination);
  setText('fd-docs-weather-text', safe(plan.destinationMetar, 'No destination METAR available.'));
  const wind = String(plan.destinationMetar || '').match(/\b(\d{3}|VRB)(\d{2,3})(G\d{2,3})?KT\b/);
  setText('fd-docs-weather-wind', wind ? `${wind[1]}° ${wind[2]} kt${wind[3] ? ` ${wind[3]}` : ''}` : '—');
  setText('fd-docs-weather-temp', 'METAR');

  renderNavigation();
  if (findDocument(fdDocsCurrentId)?.kind === 'html') renderCurrentDocument(false);
}

function formatFrequency(value) {
  const n = numeric(value);
  return n === null ? '—' : n.toFixed(3);
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value ?? '—';
}

function renderNavigation() {
  if (!fdDocs.nav || !fdDocs.tabs) return;
  const docs = allDocuments();
  fdDocs.nav.replaceChildren();
  for (const doc of docs) {
    const button = el('button', { type: 'button', class: doc.id === fdDocsCurrentId ? 'active' : '', 'data-fd-doc-id': doc.id });
    button.append(el('span', { class: 'fd-docs-nav-icon', html: svgIcon('document') }), el('span', { text: doc.label }), el('i', { text: '›' }));
    button.addEventListener('click', () => selectDocument(doc.id));
    fdDocs.nav.append(button);
  }

  const pinned = docs.filter((doc) => ['simbrief-ofp', 'simbrief-pdf', 'weather', 'departure', 'destination', 'notams', 'sigwx'].includes(doc.id)).slice(0, 6);
  fdDocs.tabs.replaceChildren();
  for (const doc of pinned) {
    const button = el('button', { type: 'button', class: doc.id === fdDocsCurrentId ? 'active' : '', text: doc.chip });
    button.addEventListener('click', () => selectDocument(doc.id));
    fdDocs.tabs.append(button);
  }
}

async function selectDocument(id) {
  fdDocsCurrentId = id;
  fdDocsRedo = [];
  renderNavigation();
  renderCurrentDocument(true);
}

function renderCurrentDocument(resetScroll = true) {
  if (!fdDocs.viewer) return;
  const doc = findDocument(fdDocsCurrentId);
  if (!doc) return;
  if (fdDocsObjectUrl) { URL.revokeObjectURL(fdDocsObjectUrl); fdDocsObjectUrl = null; }
  if (resetScroll) fdDocs.viewer.scrollTop = 0;
  fdDocs.viewer.replaceChildren();
  setText('fd-docs-doc-title', doc.title);
  setText('fd-docs-doc-kind', doc.kind === 'blob' ? 'CUSTOM DOCUMENT' : doc.kind === 'url' ? 'SIMBRIEF DOCUMENT' : 'SIMBRIEF BRIEFING');
  fdDocs.deleteBtn.hidden = doc.kind !== 'blob';
  fdDocs.externalBtn.hidden = !currentPlan().ofpLink;

  if (doc.kind === 'html') {
    fdDocs.viewer.innerHTML = doc.html();
  } else if (doc.kind === 'url') {
    const iframe = el('iframe', { class: 'fd-docs-pdf', src: doc.url, title: doc.title, referrerpolicy: 'no-referrer' });
    if (['pen', 'highlighter', 'text', 'eraser'].includes(fdDocsAnnotationTool)) iframe.style.pointerEvents = 'none';
    fdDocs.viewer.append(iframe);
  } else {
    const record = doc.record;
    fdDocsObjectUrl = URL.createObjectURL(record.blob);
    if (record.type === 'application/pdf' || record.name.toLowerCase().endsWith('.pdf')) {
      const iframe = el('iframe', { class: 'fd-docs-pdf', src: `${fdDocsObjectUrl}#toolbar=0&navpanes=0`, title: record.name });
      if (['pen', 'highlighter', 'text', 'eraser'].includes(fdDocsAnnotationTool)) iframe.style.pointerEvents = 'none';
      fdDocs.viewer.append(iframe);
    } else if (record.type.startsWith('image/')) {
      fdDocs.viewer.append(el('img', { class: 'fd-docs-image', src: fdDocsObjectUrl, alt: record.name }));
    } else if (record.type.startsWith('text/') || record.name.toLowerCase().endsWith('.txt')) {
      const pre = el('pre', { class: 'fd-docs-text', text: 'Loading…' });
      fdDocs.viewer.append(pre);
      record.blob.text().then((value) => { pre.textContent = value; }).catch(() => { pre.textContent = 'Could not read text document.'; });
    } else {
      fdDocs.viewer.append(el('div', { class: 'fd-document-paper fd-placeholder' }, el('h2', { text: record.name }), el('p', { text: 'Preview is not supported for this file type.' })));
    }
  }
  requestAnimationFrame(() => { resizeCanvas(); drawAnnotations(); });
}

async function uploadDocuments(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  const category = window.prompt('Category for these documents (e.g. COMPANY DOCS, DESTINATION, SIGWX):', 'COMPANY DOCS') || 'COMPANY DOCS';
  fdDocs.add.disabled = true;
  setStatus(`Importing ${files.length} document${files.length === 1 ? '' : 's'} …`);
  try {
    let last = null;
    for (const file of files) last = await storeDocument(file, category.trim().toUpperCase().slice(0, 28));
    await loadCustomDocuments();
    renderNavigation();
    if (last) await selectDocument(last.id);
    setStatus(`${files.length} document${files.length === 1 ? '' : 's'} imported and stored locally.`, 'success');
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, 'error');
  } finally {
    fdDocs.add.disabled = false;
    event.target.value = '';
  }
}

async function deleteCurrentDocument() {
  const doc = findDocument(fdDocsCurrentId);
  if (!doc || doc.kind !== 'blob') return;
  if (!window.confirm(`Delete “${doc.title}” from this flight?`)) return;
  try {
    await deleteDocument(doc.id);
    await loadCustomDocuments();
    fdDocsCurrentId = 'simbrief-ofp';
    renderNavigation();
    renderCurrentDocument(true);
    setStatus('Document deleted.', 'success');
  } catch (error) { setStatus(`Delete failed: ${error.message}`, 'error'); }
}

function openOriginalOfp() {
  const url = currentPlan().ofpLink;
  if (!url) return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

async function importSimBrief() {
  let identifier = (localStorage.getItem('flight-deck-simbrief-user') || document.getElementById('simbrief-identifier')?.value || '').trim();
  if (!identifier) identifier = (window.prompt('SimBrief Pilot ID or username:', '') || '').trim();
  if (!identifier) return;
  fdDocs.importBtn.disabled = true;
  setStatus('Importing latest SimBrief OFP …');
  try {
    localStorage.setItem('flight-deck-simbrief-user', identifier.slice(0, 80));
    const result = await fdApi('/api/simbrief/import', { method: 'POST', body: { identifier, prefetchDestination: true } });
    fdDocsState = result.state || await fdApi('/api/state');
    await loadCustomDocuments();
    fdDocsCurrentId = 'simbrief-ofp';
    renderState();
    renderCurrentDocument(true);
    setStatus('SimBrief OFP imported. Briefing documents are ready for annotation.', 'success');
  } catch (error) {
    setStatus(`SimBrief import failed: ${error.message}`, 'error');
  } finally { fdDocs.importBtn.disabled = false; }
}

function quickJump(event) {
  const button = event.target.closest('[data-fd-jump]');
  if (!button) return;
  const target = button.dataset.fdJump;
  closeWorkspace();
  if (target === 'map') {
    document.querySelector('[data-open-module="flight"]')?.click();
    window.setTimeout(() => document.querySelector('[data-flight-hub-tab="tracking"]')?.click(), 80);
    return;
  }
  document.querySelector(`[data-open-module="${target}"]`)?.click();
}

function annotationToolbarClick(event) {
  const color = event.target.closest('[data-fd-color]');
  if (color) {
    fdDocsAnnotationColor = color.dataset.fdColor;
    document.querySelectorAll('.fd-docs-color').forEach((node) => node.classList.toggle('active', node === color));
    return;
  }
  const button = event.target.closest('[data-fd-tool]');
  if (!button) return;
  const tool = button.dataset.fdTool;
  if (tool === 'undo') { undoAnnotation(); return; }
  if (tool === 'redo') { redoAnnotation(); return; }
  fdDocsAnnotationTool = tool;
  document.querySelectorAll('.fd-docs-tool[data-fd-tool]').forEach((node) => node.classList.toggle('active', node.dataset.fdTool === tool));
  fdDocs.canvas.classList.toggle('drawing', ['pen', 'highlighter', 'text', 'eraser'].includes(tool));
  const iframe = fdDocs.viewer.querySelector('iframe');
  if (iframe) iframe.style.pointerEvents = ['pen', 'highlighter', 'text', 'eraser'].includes(tool) ? 'none' : 'auto';
}

function canvasPoint(event) {
  const rect = fdDocs.canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
}

function annotationPointerDown(event) {
  if (!['pen', 'highlighter', 'eraser', 'text'].includes(fdDocsAnnotationTool)) return;
  const point = canvasPoint(event);
  fdDocs.canvas.setPointerCapture?.(event.pointerId);
  if (fdDocsAnnotationTool === 'text') {
    const text = window.prompt('Text note:', '')?.trim();
    if (text) {
      const items = loadAnnotations();
      items.push({ type: 'text', color: fdDocsAnnotationColor, x: point.x, y: point.y, text: text.slice(0, 500), size: 18 });
      saveAnnotations(items); fdDocsRedo = []; drawAnnotations();
    }
    return;
  }
  if (fdDocsAnnotationTool === 'eraser') {
    eraseNear(point);
    return;
  }
  fdDocsStroke = { type: fdDocsAnnotationTool, color: fdDocsAnnotationColor, points: [point], width: fdDocsAnnotationTool === 'highlighter' ? 18 : 3 };
}

function annotationPointerMove(event) {
  if (!fdDocsStroke) return;
  fdDocsStroke.points.push(canvasPoint(event));
  drawAnnotations(fdDocsStroke);
}

function annotationPointerUp(event) {
  if (!fdDocsStroke) return;
  fdDocsStroke.points.push(canvasPoint(event));
  const items = loadAnnotations();
  items.push(fdDocsStroke);
  saveAnnotations(items);
  fdDocsStroke = null;
  fdDocsRedo = [];
  drawAnnotations();
}

function eraseNear(point) {
  const items = loadAnnotations();
  if (!items.length) return;
  const distance = (item) => {
    if (item.type === 'text') return Math.hypot((item.x || 0) - point.x, (item.y || 0) - point.y);
    return Math.min(...(item.points || []).map((p) => Math.hypot(p.x - point.x, p.y - point.y)), 999);
  };
  let index = -1; let nearest = 0.08;
  items.forEach((item, i) => { const d = distance(item); if (d < nearest) { nearest = d; index = i; } });
  if (index >= 0) { fdDocsRedo = []; items.splice(index, 1); saveAnnotations(items); drawAnnotations(); }
}

function undoAnnotation() {
  const items = loadAnnotations();
  const item = items.pop();
  if (!item) return;
  fdDocsRedo.push(item);
  saveAnnotations(items);
  drawAnnotations();
}

function redoAnnotation() {
  const item = fdDocsRedo.pop();
  if (!item) return;
  const items = loadAnnotations();
  items.push(item);
  saveAnnotations(items);
  drawAnnotations();
}

function resizeCanvas() {
  if (!fdDocs.canvas || !fdDocs.viewerWrap) return;
  const rect = fdDocs.viewerWrap.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (fdDocs.canvas.width !== width || fdDocs.canvas.height !== height) {
    fdDocs.canvas.width = width;
    fdDocs.canvas.height = height;
    fdDocs.canvas.style.width = `${rect.width}px`;
    fdDocs.canvas.style.height = `${rect.height}px`;
    drawAnnotations();
  }
}

function drawAnnotations(extra = null) {
  const canvas = fdDocs.canvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = window.devicePixelRatio || 1;
  const cssWidth = canvas.width / ratio;
  const cssHeight = canvas.height / ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  const items = [...loadAnnotations(), ...(extra ? [extra] : [])];
  for (const item of items) {
    if (item.type === 'text') {
      ctx.save(); ctx.globalAlpha = 1; ctx.fillStyle = item.color || '#11c7bd'; ctx.font = `600 ${item.size || 18}px system-ui, sans-serif`; ctx.fillText(item.text || '', (item.x || 0) * cssWidth, (item.y || 0) * cssHeight); ctx.restore();
      continue;
    }
    const points = item.points || [];
    if (points.length < 1) continue;
    ctx.save();
    ctx.strokeStyle = item.color || '#11c7bd';
    ctx.lineWidth = item.width || 3;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = item.type === 'highlighter' ? 0.35 : 1;
    ctx.beginPath();
    points.forEach((p, index) => { const x = p.x * cssWidth; const y = p.y * cssHeight; if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke(); ctx.restore();
  }
}

async function openWorkspace() {
  buildWorkspace();
  installLauncher();
  fdDocs.overlay.hidden = false;
  document.documentElement.classList.add('fd-docs-open');
  updateClock();
  clearInterval(fdDocsClockTimer); fdDocsClockTimer = setInterval(updateClock, 1000);
  await refreshState();
  await loadCustomDocuments();
  renderNavigation();
  renderCurrentDocument(true);
  clearInterval(fdDocsTimer); fdDocsTimer = setInterval(refreshState, 2000);
  setStatus(currentPlan().origin ? 'SimBrief briefing loaded. Annotation is stored locally per flight.' : 'No SimBrief OFP loaded. Use SIMBRIEF to import the latest flight.');
}

function closeWorkspace() {
  if (!fdDocs.overlay) return;
  fdDocs.overlay.hidden = true;
  document.documentElement.classList.remove('fd-docs-open');
  clearInterval(fdDocsTimer); fdDocsTimer = null;
  clearInterval(fdDocsClockTimer); fdDocsClockTimer = null;
  if (fdDocsObjectUrl) { URL.revokeObjectURL(fdDocsObjectUrl); fdDocsObjectUrl = null; }
}

function boot() {
  const style = document.createElement('link');
  if (!document.querySelector('link[data-fd-docs-style]')) {
    style.rel = 'stylesheet'; style.href = `/documents-workspace.css?v=${FD_DOCS_VERSION}`; style.dataset.fdDocsStyle = '1'; document.head.append(style);
  }
  buildWorkspace();
  installLauncher();
  const observer = new MutationObserver(() => installLauncher());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
