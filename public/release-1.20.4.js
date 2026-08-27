const FD24_ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M9 20v-5h6v5"/>',
  flight: '<path d="M4 18h16M7 15V6h10v9M10 10h4"/><path d="m12 2 2 4h-4z"/>',
  docs: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
  taxi: '<path d="M4 16h11V9H9l-3 4H4zM15 12h3l2 3v1h-5"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  com: '<path d="M5 8h14v10H5zM8 8l2-4h4l2 4M8 12h5M8 15h3"/><circle cx="16.5" cy="14.5" r="1.5"/>',
  map: '<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14m6-12v14"/>',
  files: '<path d="M3.5 7.5h6l2 2h9v10h-17z"/><path d="M3.5 7.5V5h6l2 2h9v2.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8L9 6.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.6 3.1h4.8l.6-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/>',
};

const FD26_NAV = [
  ['home', 'home', 'Home'],
  ['flight', 'flight', 'Flight'],
  ['documents', 'docs', 'Briefing'],
  ['taxi', 'taxi', 'Taxi'],
  ['com', 'com', 'COM'],
  ['map', 'map', 'Live Map'],
  ['files', 'files', 'Files'],
  ['settings', 'settings', 'Settings'],
];

const FD26_TOKEN_KEY = 'si-taxi-token';
let fd26StateTimer = null;
let fd26ClockTimer = null;
let fd26CurrentModule = 'home';

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${FD24_ICONS[name] || FD24_ICONS.home}</svg>`;
}

function apiUrl(pathname) {
  const url = new URL(pathname, window.location.origin);
  const token = new URL(window.location.href).searchParams.get('token') || localStorage.getItem(FD26_TOKEN_KEY) || '';
  if (token) url.searchParams.set('token', token);
  return url;
}

function normalizedModule(module) {
  if (module === 'tracking') return 'map';
  if (module === 'briefing') return 'documents';
  return module || 'home';
}

function closeWorkspace(selector) {
  const workspace = document.querySelector(selector);
  if (!workspace || workspace.hidden) return;
  const close = workspace.querySelector('[title*="Close"], [title*="schließen"], [aria-label*="Close"], [aria-label*="Schließen"]');
  close?.click();
}

function navigate(module) {
  const target = normalizedModule(module);
  if (target !== 'documents') closeWorkspace('#fd-docs-workspace');
  if (target !== 'files') closeWorkspace('#fd-files-workspace');

  if (target === 'documents') {
    document.querySelector('[data-fd-docs-launcher]')?.click();
    return;
  }
  if (target === 'files') {
    document.querySelector('[data-fd-files-launcher]')?.click();
    return;
  }
  window.dispatchEvent(new CustomEvent('flightdeck:navigate', { detail: { module: target === 'map' ? 'tracking' : target } }));
}

function setActive(module) {
  fd26CurrentModule = normalizedModule(module);
  document.querySelectorAll('[data-fd26-module]').forEach((button) => {
    button.classList.toggle('active', button.dataset.fd26Module === fd26CurrentModule);
  });
  document.querySelectorAll('.fd-global-rail [data-fd24-module]').forEach((button) => {
    button.classList.toggle('active', normalizedModule(button.dataset.fd24Module) === fd26CurrentModule);
  });
}

function makeNavButton(module, glyph, label, datasetKey) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset[datasetKey] = module;
  button.title = label;
  button.innerHTML = `${icon(glyph)}<span>${label}</span>`;
  button.addEventListener('click', () => navigate(module));
  return button;
}

function installRail() {
  document.querySelector('.fd-global-rail')?.remove();
  const rail = document.createElement('nav');
  rail.className = 'fd-global-rail fd26-rail';
  rail.setAttribute('aria-label', 'Flight Deck navigation');
  for (const [module, glyph, label] of FD26_NAV) rail.append(makeNavButton(module, glyph, label, 'fd24Module'));
  document.body.append(rail);
  setActive(fd26CurrentModule);
}

function installBottomNav() {
  if (document.querySelector('.fd26-bottom-nav')) return;
  const nav = document.createElement('nav');
  nav.className = 'fd26-bottom-nav';
  nav.setAttribute('aria-label', 'Flight Deck mobile navigation');
  for (const [module, glyph, label] of FD26_NAV) nav.append(makeNavButton(module, glyph, label, 'fd26Module'));
  document.body.append(nav);
  setActive(fd26CurrentModule);
}

function ensureGlobalClock() {
  const host = document.querySelector('.connection-summary');
  if (!host || document.getElementById('fd26-global-clock')) return;
  const clock = document.createElement('div');
  clock.id = 'fd26-global-clock';
  clock.className = 'fd26-global-clock';
  clock.innerHTML = '<span><small>UTC</small><b id="fd26-utc">—</b></span><span><small>LOCAL</small><b id="fd26-local">—</b></span>';
  host.prepend(clock);
}

function updateGlobalClock() {
  ensureGlobalClock();
  const now = new Date();
  const utc = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(now);
  const local = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const utcNode = document.getElementById('fd26-utc');
  const localNode = document.getElementById('fd26-local');
  if (utcNode) utcNode.textContent = utc;
  if (localNode) localNode.textContent = local;
}

function ensureFlightOpsSummary() {
  const page = document.querySelector('[data-page="flight"]');
  const heading = page?.querySelector('.page-heading');
  if (!page || !heading || document.getElementById('fd26-flight-ops')) return;
  const panel = document.createElement('section');
  panel.id = 'fd26-flight-ops';
  panel.className = 'fd26-flight-ops';
  panel.innerHTML = `
    <header class="fd26-flight-ops-head">
      <div><small>ACTIVE FLIGHT</small><h2 id="fd26-flight-route">— → —</h2><span id="fd26-flight-ident">—</span></div>
      <div class="fd26-flight-ops-progress"><span><i id="fd26-flight-progress-fill"></i></span><b id="fd26-flight-progress">—</b></div>
      <div class="fd26-flight-ops-eta"><small>ETA</small><strong id="fd26-flight-eta">—</strong><span id="fd26-flight-remaining">— remaining</span></div>
    </header>
    <div class="fd26-flight-ops-grid">
      <article><small>AIRPORT</small><strong id="fd26-flight-airport">—</strong><span id="fd26-flight-airport-context">Current</span></article>
      <article><small>RUNWAY</small><strong id="fd26-flight-runway">—</strong><span>Active / expected</span></article>
      <article><small>GATE</small><strong id="fd26-flight-gate">—</strong><span>Stand</span></article>
      <article><small>SPEED</small><strong id="fd26-flight-speed">—</strong><span>IAS / GS</span></article>
      <article><small>ALTITUDE</small><strong id="fd26-flight-altitude">—</strong><span>MSFS</span></article>
      <article><small>NEXT</small><strong id="fd26-flight-next">—</strong><span id="fd26-flight-next-distance">Waypoint</span></article>
      <article><small>COM ACTIVE</small><strong id="fd26-flight-com-active">—</strong><span id="fd26-flight-com-radio">Radio</span></article>
      <article><small>COM STANDBY</small><strong id="fd26-flight-com-standby">—</strong><span>Standby</span></article>
    </div>
    <footer class="fd26-flight-ops-actions">
      <button type="button" data-fd26-jump="documents">Briefing</button>
      <button type="button" data-fd26-jump="com">COM</button>
      <button type="button" data-fd26-jump="taxi">Taxi</button>
      <button type="button" class="primary" data-fd26-jump="map">Live Map</button>
    </footer>`;
  panel.addEventListener('click', (event) => {
    const button = event.target.closest('[data-fd26-jump]');
    if (button) navigate(button.dataset.fd26Jump);
  });
  heading.insertAdjacentElement('afterend', panel);
}

function valueText(selector, fallback = '—') {
  const value = String(document.querySelector(selector)?.textContent || '').trim();
  return value && value !== 'NO FLIGHT' ? value : fallback;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value || '—';
}

function renderFlightOps(state = {}) {
  ensureFlightOpsSummary();
  const flight = state.flight || {};
  const plan = state.integrations?.simbrief?.flight || {};
  const aircraft = state.aircraft || {};
  const com = { ...aircraft, ...(state.integrations?.com || {}) };
  const origin = String(flight.origin || plan.origin || '—').toUpperCase();
  const destination = String(flight.destination || plan.destination || '—').toUpperCase();
  const callsign = flight.callsign || plan.callsign || valueText('#home-callsign');
  const flightNumber = flight.flightNumber || (plan.flightNumber ? `${plan.airlineIata || plan.airlineIcao || ''}${plan.flightNumber}` : callsign);
  const airborne = aircraft.onGround === false;
  const currentAirport = String(flight.currentAirport || '').toUpperCase();
  const airport = airborne ? destination : currentAirport || origin || destination;
  const runway = airborne ? (flight.arrivalRunway || plan.arrivalRunway || flight.departureRunway || plan.departureRunway) : (flight.departureRunway || plan.departureRunway || flight.arrivalRunway || plan.arrivalRunway);
  const gate = state.gate?.name || '—';
  const ias = numberOrNull(aircraft.indicatedAirspeed);
  const gs = numberOrNull(aircraft.groundSpeed);
  const altitude = numberOrNull(aircraft.altitudeFeet);
  const activeRadio = com.com2Transmit && !com.com1Transmit ? 2 : 1;
  const active = numberOrNull(activeRadio === 2 ? com.com2Active : com.com1Active);
  const standby = numberOrNull(activeRadio === 2 ? com.com2Standby : com.com1Standby);
  const progressRaw = valueText('#journey-progress-value', valueText('#flight-overlay-top-progress-value'));
  const progressMatch = progressRaw.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
  const progress = progressMatch ? Math.max(0, Math.min(100, Number(progressMatch[1].replace(',', '.')))) : 0;
  const eta = valueText('#home-flight-eta', valueText('#flight-overlay-top-eta'));
  const remaining = valueText('#home-flight-remaining', valueText('#journey-remaining'));
  const next = valueText('#journey-next-waypoint', valueText('#home-next-waypoint'));
  const nextDistance = valueText('#journey-next-distance', 'Waypoint');

  setText('fd26-flight-route', `${origin} → ${destination}`);
  setText('fd26-flight-ident', [flightNumber, callsign, plan.aircraftIcao || plan.aircraftType].filter(Boolean).join(' · '));
  setText('fd26-flight-progress', progressMatch ? `${Math.round(progress)}%` : '—');
  const fill = document.getElementById('fd26-flight-progress-fill');
  if (fill) fill.style.width = `${progress}%`;
  setText('fd26-flight-eta', eta);
  setText('fd26-flight-remaining', remaining === '—' ? '— remaining' : `${remaining} remaining`);
  setText('fd26-flight-airport', airport || '—');
  setText('fd26-flight-airport-context', airborne ? 'Destination' : 'Current airport');
  setText('fd26-flight-runway', runway ? `RWY ${String(runway).replace(/^RWY\s*/i, '')}` : '—');
  setText('fd26-flight-gate', gate);
  setText('fd26-flight-speed', ias !== null && gs !== null ? `${Math.round(ias)} / ${Math.round(gs)} kt` : ias !== null ? `${Math.round(ias)} kt IAS` : gs !== null ? `${Math.round(gs)} kt GS` : '—');
  setText('fd26-flight-altitude', altitude === null ? '—' : `${Math.round(altitude).toLocaleString()} ft`);
  setText('fd26-flight-next', next);
  setText('fd26-flight-next-distance', nextDistance);
  setText('fd26-flight-com-active', active === null ? '—' : active.toFixed(3));
  setText('fd26-flight-com-standby', standby === null ? '—' : standby.toFixed(3));
  setText('fd26-flight-com-radio', `COM${activeRadio}`);
}

async function refreshFlightOps() {
  try {
    const response = await fetch(apiUrl('/api/state'), { cache: 'no-store' });
    if (response.ok) renderFlightOps(await response.json());
  } catch { /* retain the last useful state */ }
}

function installWorkspaceIntegration() {
  document.documentElement.classList.add('fd26-unified-shell');
  const disabledCharts = document.querySelector('.charts-app[disabled]');
  if (disabledCharts) disabledCharts.setAttribute('aria-hidden', 'true');
}

function startUnifiedUx() {
  installRail();
  installBottomNav();
  installWorkspaceIntegration();
  ensureGlobalClock();
  ensureFlightOpsSummary();
  updateGlobalClock();
  refreshFlightOps();
  clearInterval(fd26ClockTimer);
  clearInterval(fd26StateTimer);
  fd26ClockTimer = setInterval(updateGlobalClock, 1_000);
  fd26StateTimer = setInterval(refreshFlightOps, 2_000);

  const observer = new MutationObserver(() => {
    document.querySelector('.fd-global-rail [data-fd-files-rail]')?.remove();
    if (!document.querySelector('.fd-global-rail')) installRail();
    ensureGlobalClock();
    ensureFlightOpsSummary();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('flightdeck:modulechange', (event) => setActive(event.detail?.module || 'home'));
window.addEventListener('flightdeck:documents-open', () => setActive('documents'));
window.addEventListener('flightdeck:documents-close', () => setActive(document.documentElement.dataset.flightdeckModule || 'home'));
window.addEventListener('flightdeck:file-browser-open', () => setActive('files'));
window.addEventListener('flightdeck:file-browser-close', () => setActive(document.documentElement.dataset.flightdeckModule || 'home'));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startUnifiedUx, { once: true });
else startUnifiedUx();
