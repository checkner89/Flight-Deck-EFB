const OVERLAY_TOKEN_KEY = 'si-taxi-token';

let overlayStateTimer = null;
let overlayClockTimer = null;
let previousOnGround = null;
let departureGateBaseline = null;

function overlayToken() {
  const fromUrl = new URL(window.location.href).searchParams.get('token');
  return fromUrl || localStorage.getItem(OVERLAY_TOKEN_KEY) || '';
}

function overlayApiUrl(pathname) {
  const url = new URL(pathname, window.location.origin);
  const token = overlayToken();
  if (token) url.searchParams.set('token', token);
  return url;
}

function overlayNode(tag, { className = '', text = '', id = '', type = '' } = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  if (id) element.id = id;
  if (type) element.type = type;
  return element;
}

function overlayValue(selector, fallback = '—') {
  const value = String(document.querySelector(selector)?.textContent || '').trim();
  return value && value !== 'NO FLIGHT' ? value : fallback;
}

function overlaySet(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? '—';
}

function formatFrequency(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—';
}

function formatAltitude(value) {
  if (!Number.isFinite(Number(value))) return '—';
  return `${Math.round(Number(value)).toLocaleString()} ft`;
}

function formatSpeed(aircraft = {}) {
  const ias = Number(aircraft.indicatedAirspeed);
  const gs = Number(aircraft.groundSpeed);
  if (!Number.isFinite(ias) && !Number.isFinite(gs)) return '—';
  if (Number.isFinite(ias) && Number.isFinite(gs)) return `IAS ${Math.round(ias)} · GS ${Math.round(gs)} kt`;
  return Number.isFinite(ias) ? `IAS ${Math.round(ias)} kt` : `GS ${Math.round(gs)} kt`;
}

function formatRunway(value) {
  const runway = String(value || '').trim().replace(/^RWY\s*/i, '').toUpperCase();
  return runway ? `RWY ${runway}` : '—';
}

function normalizedIcao(value) {
  const result = String(value || '').trim().toUpperCase();
  return result || '—';
}

function routeProgress() {
  const raw = overlayValue('#journey-progress-value', '—');
  const match = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
  const percent = match ? Math.max(0, Math.min(100, Number(match[1].replace(',', '.')))) : null;
  const remaining = overlayValue('#home-flight-remaining', overlayValue('#journey-remaining', '—'));
  const etaRaw = overlayValue('#home-flight-eta', '—');
  const journeyEta = overlayValue('#journey-eta', '—').replace(/^ETA\s*/i, '').split(' · ')[0].trim();
  const eta = etaRaw !== '—' ? etaRaw : journeyEta || '—';
  return { percent, remaining, eta };
}

function openExistingModule(moduleName) {
  const button = document.querySelector(`[data-open-module="${moduleName}"]`);
  if (button) button.click();
}

function openLiveMap() {
  openExistingModule('flight');
  window.setTimeout(() => {
    const button = [...document.querySelectorAll('[data-flight-hub-tab="tracking"]')]
      .find((entry) => entry.offsetParent !== null) || document.querySelector('[data-flight-hub-tab="tracking"]');
    button?.click();
  }, 60);
}

function makeMetric(label, id, className = '') {
  const item = overlayNode('div', { className: `flight-overlay-metric ${className}`.trim() });
  item.append(overlayNode('small', { text: label }), overlayNode('strong', { id, text: '—' }));
  return item;
}

function ensureOverlayStyles() {
  if (document.querySelector('link[data-flight-overlay-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/flight-overlay.css?v=1.7.11-homeflight1';
  link.dataset.flightOverlayStyle = '1';
  document.head.append(link);
}

function ensureTopOverlay() {
  const host = document.querySelector('.flight-summary');
  if (!host || document.getElementById('flight-overlay-top')) return;
  host.classList.add('flight-overlay-host');

  const overlay = overlayNode('div', { className: 'flight-overlay-top', id: 'flight-overlay-top' });
  const route = overlayNode('div', { className: 'flight-overlay-top-route' });
  route.append(overlayNode('small', { text: 'FLIGHT' }), overlayNode('strong', { id: 'flight-overlay-top-route', text: '— → —' }));

  const progress = overlayNode('div', { className: 'flight-overlay-top-progress' });
  const track = overlayNode('span', { className: 'flight-overlay-progress-track' });
  track.append(overlayNode('i', { id: 'flight-overlay-top-progress-fill' }));
  progress.append(track, overlayNode('b', { id: 'flight-overlay-top-progress-value', text: '—' }));

  const remaining = overlayNode('div', { className: 'flight-overlay-top-stat' });
  remaining.append(overlayNode('small', { text: 'REMAINING' }), overlayNode('strong', { id: 'flight-overlay-top-remaining', text: '—' }));
  const eta = overlayNode('div', { className: 'flight-overlay-top-stat' });
  eta.append(overlayNode('small', { text: 'ETA' }), overlayNode('strong', { id: 'flight-overlay-top-eta', text: '—' }));

  overlay.append(route, progress, remaining, eta);
  host.append(overlay);
}

function ensureDualClock() {
  const host = document.querySelector('.home-time');
  if (!host || document.getElementById('flight-overlay-utc')) return;
  host.classList.add('flight-overlay-clock');
  const clock = overlayNode('div', { className: 'flight-overlay-clock-values' });
  clock.append(
    overlayNode('strong', { id: 'flight-overlay-utc', text: '— UTC' }),
    overlayNode('span', { id: 'flight-overlay-local', text: '(Local Time: —)' }),
  );
  host.append(clock);
}

function ensureHomeFlightPanel() {
  const host = document.querySelector('.home-flight-strip');
  if (!host || document.getElementById('flight-overlay-home')) return;
  host.classList.add('flight-overlay-home-host');

  const panel = overlayNode('div', { className: 'flight-overlay-home', id: 'flight-overlay-home' });
  const routeRow = overlayNode('div', { className: 'flight-overlay-route-row' });
  const routeCopy = overlayNode('div', { className: 'flight-overlay-route-copy' });
  routeCopy.append(overlayNode('small', { text: 'ACTIVE ROUTE' }), overlayNode('strong', { id: 'flight-overlay-home-route', text: '— → —' }));
  const routeStats = overlayNode('div', { className: 'flight-overlay-route-stats' });
  const remaining = overlayNode('span');
  remaining.append(overlayNode('small', { text: 'REMAINING' }), overlayNode('b', { id: 'flight-overlay-home-remaining', text: '—' }));
  const eta = overlayNode('span');
  eta.append(overlayNode('small', { text: 'EST. ETA' }), overlayNode('b', { id: 'flight-overlay-home-eta', text: '—' }));
  routeStats.append(remaining, eta);
  routeRow.append(routeCopy, routeStats);

  const progress = overlayNode('div', { className: 'flight-overlay-home-progress' });
  const progressTrack = overlayNode('span', { className: 'flight-overlay-progress-track' });
  progressTrack.append(overlayNode('i', { id: 'flight-overlay-home-progress-fill' }));
  progress.append(progressTrack, overlayNode('b', { id: 'flight-overlay-home-progress-value', text: '—' }));

  const metrics = overlayNode('div', { className: 'flight-overlay-metrics' });
  metrics.append(
    makeMetric('FLIGHT NUMBER', 'flight-overlay-flight-number'),
    makeMetric('AIRPORT', 'flight-overlay-airport'),
    makeMetric('RUNWAY', 'flight-overlay-runway'),
    makeMetric('GATE', 'flight-overlay-gate'),
    makeMetric('ALTITUDE', 'flight-overlay-altitude'),
    makeMetric('SPEED', 'flight-overlay-speed', 'wide'),
    makeMetric('RADIO ACTIVE', 'flight-overlay-com-active'),
    makeMetric('RADIO STANDBY', 'flight-overlay-com-standby'),
  );

  const actions = overlayNode('div', { className: 'flight-overlay-actions' });
  const com = overlayNode('button', { className: 'flight-overlay-action', text: 'COM', type: 'button' });
  com.addEventListener('click', () => openExistingModule('com'));
  const taxi = overlayNode('button', { className: 'flight-overlay-action', text: 'TAXI', type: 'button' });
  taxi.addEventListener('click', () => openExistingModule('taxi'));
  const liveMap = overlayNode('button', { className: 'flight-overlay-action primary', text: 'LIVE MAP', type: 'button' });
  liveMap.addEventListener('click', openLiveMap);
  actions.append(com, taxi, liveMap);

  panel.append(routeRow, progress, metrics, actions);
  host.append(panel);
}

function ensureFlightOverlay() {
  ensureOverlayStyles();
  ensureTopOverlay();
  ensureDualClock();
  ensureHomeFlightPanel();
  document.getElementById('home-phase-card')?.classList.add('flight-overlay-phase-hidden');
}

function updateClock() {
  ensureDualClock();
  const now = new Date();
  const utc = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(now);
  const local = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  overlaySet('flight-overlay-utc', `${utc} UTC`);
  overlaySet('flight-overlay-local', `(Local Time: ${local})`);
}

function renderFlightOverlay(state = {}) {
  ensureFlightOverlay();
  const flight = state.flight || {};
  const plan = state.integrations?.simbrief?.flight || {};
  const aircraft = state.aircraft || {};
  const com = { ...aircraft, ...(state.integrations?.com || {}) };
  const origin = normalizedIcao(flight.origin || plan.origin);
  const destination = normalizedIcao(flight.destination || plan.destination || state.planning?.selectedAirport?.icao);
  const currentAirport = normalizedIcao(flight.currentAirport);
  const airborne = aircraft.onGround === false;
  const atDestination = currentAirport !== '—' && destination !== '—' && currentAirport === destination;
  const airport = airborne ? destination : currentAirport !== '—' ? currentAirport : atDestination ? destination : origin !== '—' ? origin : destination;
  const departureRunway = flight.departureRunway || plan.departureRunway;
  const arrivalRunway = flight.arrivalRunway || plan.arrivalRunway;
  const runway = airborne || atDestination ? (arrivalRunway || departureRunway) : (departureRunway || arrivalRunway);

  const explicitGate = String(state.gate?.name || '').trim() || null;
  const visibleGroundGate = explicitGate || overlayValue('#home-gate', '—');
  if (previousOnGround === true && airborne) departureGateBaseline = explicitGate || visibleGroundGate || null;
  if (!airborne && atDestination) departureGateBaseline = null;
  const gate = airborne
    ? explicitGate && explicitGate !== departureGateBaseline ? explicitGate : '—'
    : visibleGroundGate;
  previousOnGround = aircraft.onGround;

  const callsign = flight.callsign || plan.callsign || overlayValue('#home-callsign', '—');
  const plannedFlightNumber = plan.flightNumber
    ? `${plan.airlineIata || plan.airlineIcao || ''}${plan.flightNumber}`
    : null;
  const flightNumber = flight.flightNumber || plannedFlightNumber || callsign;
  const progress = routeProgress();
  const route = `${origin} → ${destination}`;
  const progressLabel = progress.percent === null ? '—' : `${Math.round(progress.percent)}%`;
  const progressWidth = `${progress.percent ?? 0}%`;
  const activeRadio = com.com2Transmit && !com.com1Transmit ? 2 : 1;
  const activeFrequency = activeRadio === 2 ? com.com2Active : com.com1Active;
  const standbyFrequency = activeRadio === 2 ? com.com2Standby : com.com1Standby;

  overlaySet('flight-overlay-top-route', route);
  overlaySet('flight-overlay-top-remaining', progress.remaining);
  overlaySet('flight-overlay-top-eta', progress.eta);
  overlaySet('flight-overlay-top-progress-value', progressLabel);
  overlaySet('flight-overlay-home-route', route);
  overlaySet('flight-overlay-home-remaining', progress.remaining);
  overlaySet('flight-overlay-home-eta', progress.eta);
  overlaySet('flight-overlay-home-progress-value', progressLabel);
  const topFill = document.getElementById('flight-overlay-top-progress-fill');
  const homeFill = document.getElementById('flight-overlay-home-progress-fill');
  if (topFill) topFill.style.width = progressWidth;
  if (homeFill) homeFill.style.width = progressWidth;

  overlaySet('flight-overlay-flight-number', flightNumber);
  overlaySet('flight-overlay-airport', airport);
  overlaySet('flight-overlay-runway', formatRunway(runway));
  overlaySet('flight-overlay-gate', gate);
  overlaySet('flight-overlay-altitude', formatAltitude(aircraft.altitudeFeet));
  overlaySet('flight-overlay-speed', formatSpeed(aircraft));
  overlaySet('flight-overlay-com-active', `COM${activeRadio} · ${formatFrequency(activeFrequency)}`);
  overlaySet('flight-overlay-com-standby', `COM${activeRadio} · ${formatFrequency(standbyFrequency)}`);
}

async function refreshFlightOverlay() {
  try {
    const response = await fetch(overlayApiUrl('/api/state'), { cache: 'no-store' });
    if (!response.ok) return;
    renderFlightOverlay(await response.json());
  } catch {
    ensureFlightOverlay();
  }
}

function startFlightOverlay() {
  ensureFlightOverlay();
  updateClock();
  refreshFlightOverlay();
  clearInterval(overlayClockTimer);
  clearInterval(overlayStateTimer);
  overlayClockTimer = setInterval(updateClock, 1_000);
  overlayStateTimer = setInterval(refreshFlightOverlay, 2_000);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startFlightOverlay, { once: true });
  else startFlightOverlay();
}
