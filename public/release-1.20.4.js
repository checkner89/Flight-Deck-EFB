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

function ensureUnifiedStyles() {
  if (document.getElementById('fd26-unified-styles')) return;
  const style = document.createElement('style');
  style.id = 'fd26-unified-styles';
  style.textContent = `
:root{
  --fd-ui-bg:#061019;--fd-ui-bg2:#091722;--fd-ui-panel:#0d1b26;--fd-ui-panel2:#10232f;--fd-ui-surface:#132733;
  --fd-ui-line:rgba(154,193,213,.16);--fd-ui-line2:rgba(154,193,213,.28);--fd-ui-text:#edf7fb;--fd-ui-muted:#90a6b2;
  --fd-ui-accent:#18cfc3;--fd-ui-accent2:#58e7dd;--fd-ui-danger:#ef6864;--fd-ui-radius:12px;--fd-ui-touch:44px;
  --fd24-bg:var(--fd-ui-bg);--fd24-bg-2:var(--fd-ui-bg2);--fd24-panel:var(--fd-ui-panel);--fd24-panel-2:var(--fd-ui-panel2);
  --fd24-line:var(--fd-ui-line);--fd24-line-strong:var(--fd-ui-line2);--fd24-text:var(--fd-ui-text);--fd24-muted:var(--fd-ui-muted);--fd24-accent:var(--fd-ui-accent);--fd24-accent-2:var(--fd-ui-accent2);
  --fd-docs-bg:var(--fd-ui-bg);--fd-docs-panel:var(--fd-ui-panel);--fd-docs-panel-2:var(--fd-ui-panel2);--fd-docs-surface:var(--fd-ui-surface);--fd-docs-text:var(--fd-ui-text);--fd-docs-muted:var(--fd-ui-muted);--fd-docs-line:var(--fd-ui-line);--fd-docs-accent:var(--fd-ui-accent);--fd-docs-accent-2:var(--fd-ui-accent2);
  --fd-files-bg:var(--fd-ui-bg);--fd-files-panel:var(--fd-ui-panel);--fd-files-panel-2:var(--fd-ui-panel2);--fd-files-surface:var(--fd-ui-surface);--fd-files-text:var(--fd-ui-text);--fd-files-muted:var(--fd-ui-muted);--fd-files-line:var(--fd-ui-line);--fd-files-line-strong:var(--fd-ui-line2);--fd-files-accent:var(--fd-ui-accent);--fd-files-accent-2:var(--fd-ui-accent2);--fd-files-danger:var(--fd-ui-danger);
}
html[data-theme="light"]{
  --fd-ui-bg:#edf3f6;--fd-ui-bg2:#f6f9fb;--fd-ui-panel:#ffffff;--fd-ui-panel2:#f4f8fa;--fd-ui-surface:#e8f0f4;
  --fd-ui-line:rgba(28,65,84,.14);--fd-ui-line2:rgba(28,65,84,.25);--fd-ui-text:#14232d;--fd-ui-muted:#627986;
  --fd-ui-accent:#0aaea5;--fd-ui-accent2:#087e8b;--fd-ui-danger:#c74343;
}
.topbar{min-height:64px!important;height:64px!important}.connection-summary{gap:7px!important}.fd26-global-clock{display:flex;align-items:center;gap:9px;padding:5px 9px;border:1px solid var(--fd-ui-line);border-radius:9px;background:var(--fd-ui-panel2);white-space:nowrap}.fd26-global-clock span{display:grid;gap:1px}.fd26-global-clock small{font-size:9px!important;line-height:1;color:var(--fd-ui-muted);font-weight:800;letter-spacing:.09em}.fd26-global-clock b{font-size:12px;line-height:1.1;color:var(--fd-ui-text);font-variant-numeric:tabular-nums}.connection-chip{min-height:36px!important;font-size:10px!important}.new-flight-button,.icon-button{min-height:38px!important}.new-flight-button{font-size:10px!important}
.fd-global-rail.fd26-rail{top:74px!important;bottom:12px!important;width:78px!important;gap:3px!important;padding:7px 6px!important}.fd-global-rail.fd26-rail button{min-height:54px!important;font-size:10px!important;letter-spacing:0!important}.fd-global-rail.fd26-rail button svg{width:20px!important;height:20px!important}.fd-global-rail.fd26-rail button.active:before{left:-7px!important}.fd26-bottom-nav{display:none}
.app-toolbar{min-height:52px!important;padding:5px 16px!important}.app-home-button{display:none!important}.app-toolbar-identity small,.app-toolbar-context{font-size:10px!important}.app-toolbar-identity strong{font-size:16px!important}.app-toolbar-actions button{min-height:40px!important;font-size:10px!important}
.efb-page{padding:18px!important}.page-heading small,.home-launcher-heading small,.launcher-section-heading small,.section-title small,.eyebrow,.section-eyebrow,.panel-eyebrow{font-size:10px!important;letter-spacing:.08em!important}.page-heading p,.home-launcher-heading p,.help-text{font-size:12px!important;line-height:1.45!important}.efb-app-tile{min-height:112px!important;padding:14px!important}.efb-app-tile .app-tile-copy>small{font-size:10px!important}.efb-app-tile .app-tile-copy>strong{font-size:15px!important}.efb-app-tile .app-tile-copy>span{font-size:11px!important;line-height:1.4!important}.charts-app[disabled]{display:none!important}
.primary-card-action,.secondary-card-action,.danger-card-action,.focus-mode-button{min-height:var(--fd-ui-touch)!important;font-size:11px!important}.module-status,.connection-chip,.route-source{border-radius:999px!important;font-size:10px!important;font-weight:800!important;letter-spacing:.05em!important}.module-status.connected,.module-status.ready,.connection-chip.connected{color:var(--fd-ui-accent2)!important;border-color:color-mix(in srgb,var(--fd-ui-accent) 38%,var(--fd-ui-line))!important}.module-status.error,.module-status.disconnected{color:var(--fd-ui-danger)!important}
[data-page="flight"] .floating-section-nav.flight-hub-nav,[data-page="flight"] .flight-journey-hub{display:none!important}.fd26-flight-ops{display:grid;gap:0;margin:0 0 16px;border:1px solid var(--fd-ui-line);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--fd-ui-accent) 5%,var(--fd-ui-panel)),var(--fd-ui-panel));overflow:hidden}.fd26-flight-ops-head{display:grid;grid-template-columns:minmax(180px,1fr) minmax(240px,1.5fr) 150px;align-items:center;gap:22px;padding:18px 20px;border-bottom:1px solid var(--fd-ui-line)}.fd26-flight-ops-head>div:first-child{display:grid;gap:3px}.fd26-flight-ops-head small,.fd26-flight-ops-grid small{font-size:10px;color:var(--fd-ui-muted);font-weight:850;letter-spacing:.09em}.fd26-flight-ops-head h2{margin:0;font-size:24px;letter-spacing:.04em}.fd26-flight-ops-head>div:first-child span{font-size:11px;color:var(--fd-ui-muted)}.fd26-flight-ops-progress{display:flex;align-items:center;gap:12px}.fd26-flight-ops-progress>span{position:relative;height:7px;flex:1;border-radius:99px;background:var(--fd-ui-surface);overflow:hidden}.fd26-flight-ops-progress i{position:absolute;inset:0 auto 0 0;width:0;border-radius:inherit;background:linear-gradient(90deg,var(--fd-ui-accent),var(--fd-ui-accent2));transition:width .45s ease}.fd26-flight-ops-progress b{min-width:38px;font-size:12px;text-align:right}.fd26-flight-ops-eta{display:grid;gap:2px;text-align:right}.fd26-flight-ops-eta strong{font-size:20px}.fd26-flight-ops-eta span{font-size:11px;color:var(--fd-ui-muted)}.fd26-flight-ops-grid{display:grid;grid-template-columns:repeat(8,minmax(0,1fr))}.fd26-flight-ops-grid article{display:grid;gap:5px;min-width:0;padding:15px 14px;border-right:1px solid var(--fd-ui-line)}.fd26-flight-ops-grid article:last-child{border-right:0}.fd26-flight-ops-grid strong{overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.fd26-flight-ops-grid span{font-size:10px;color:var(--fd-ui-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fd26-flight-ops-actions{display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--fd-ui-line);background:color-mix(in srgb,var(--fd-ui-panel2) 74%,transparent)}.fd26-flight-ops-actions button{min-height:40px;padding:0 16px;border:1px solid var(--fd-ui-line);border-radius:9px;background:var(--fd-ui-panel2);color:var(--fd-ui-text);font-size:11px;font-weight:800;cursor:pointer}.fd26-flight-ops-actions button.primary{border-color:color-mix(in srgb,var(--fd-ui-accent) 40%,var(--fd-ui-line));background:color-mix(in srgb,var(--fd-ui-accent) 13%,var(--fd-ui-panel));color:var(--fd-ui-accent2)}
#fd-docs-workspace{inset:64px 0 0 92px!important;padding:0!important;background:var(--fd-ui-bg)!important;backdrop-filter:none!important}#fd-docs-workspace .fd-docs-shell{border:0!important;border-radius:0!important;box-shadow:none!important;grid-template-rows:minmax(0,1fr)!important;background:var(--fd-ui-bg)!important}.fd-docs-topbar,.fd-docs-progress{display:none!important}.fd-docs-layout{height:100%!important}.fd-docs-nav button{min-height:44px!important;font-size:11px!important}.fd-docs-add{min-height:44px!important;font-size:11px!important}.fd-docs-tabs button{height:42px!important;font-size:11px!important}.fd-docs-commandbar button{min-height:40px!important;font-size:10px!important}.fd-docs-viewer-header small,.fd-docs-widget small,.fd-docs-sidebar-head small{font-size:10px!important}.fd-docs-viewer-header strong,.fd-docs-widget strong{font-size:13px!important}.fd-docs-tool{min-width:40px!important;min-height:40px!important}
#fd-files-workspace{inset:64px 0 0 92px!important;padding:0!important;background:var(--fd-ui-bg)!important;backdrop-filter:none!important}#fd-files-workspace .fd-files-shell{border:0!important;border-radius:0!important;box-shadow:none!important;grid-template-rows:56px minmax(0,1fr)!important}.fd-files-brand,.fd-files-top-icon{display:none!important}.fd-files-topbar{grid-template-columns:minmax(390px,1fr) minmax(240px,370px)!important;padding:0 12px!important}.fd-files-navigation{grid-template-columns:40px 40px 40px 40px minmax(190px,1fr)!important}.fd-files-navigation button{width:40px!important;height:40px!important}.fd-files-location,.fd-files-search{height:40px!important;font-size:11px!important}.fd-files-search input{font-size:11px!important}.fd-files-root-title,.fd-files-table-head button,.fd-files-statusbar{font-size:10px!important}.fd-files-roots button{min-height:44px!important}.fd-files-roots button span{font-size:11px!important}.fd-files-main{grid-template-rows:56px 38px minmax(0,1fr) 32px!important}.fd-files-toolbar button,.fd-files-toolbar select,.fd-files-save-text{min-height:40px!important;font-size:10px!important}.fd-file-row{min-height:52px!important}.fd-file-name strong{font-size:12px!important}.fd-file-name small,.fd-file-modified,.fd-file-type,.fd-file-size{font-size:10px!important}.fd-files-preview>header small{font-size:10px!important}.fd-files-preview>header strong{font-size:12px!important}
@media(max-width:1350px){.fd26-flight-ops-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.fd26-flight-ops-grid article:nth-child(4n){border-right:0}.fd26-flight-ops-grid article:nth-child(-n+4){border-bottom:1px solid var(--fd-ui-line)}}
@media(max-width:1100px){body{padding-bottom:72px!important}.fd-global-rail{display:none!important}.fd26-bottom-nav{position:fixed;z-index:5000;left:0;right:0;bottom:0;height:70px;display:flex;align-items:stretch;gap:2px;padding:5px max(6px,env(safe-area-inset-left)) calc(5px + env(safe-area-inset-bottom));border-top:1px solid var(--fd-ui-line);background:color-mix(in srgb,var(--fd-ui-panel) 96%,transparent);backdrop-filter:blur(16px);overflow-x:auto}.fd26-bottom-nav button{flex:1 0 68px;min-width:68px;border:0;border-radius:9px;background:transparent;color:var(--fd-ui-muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:9px;font-weight:800}.fd26-bottom-nav button svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.7}.fd26-bottom-nav button.active{background:color-mix(in srgb,var(--fd-ui-accent) 10%,var(--fd-ui-panel));color:var(--fd-ui-accent2)}#fd-docs-workspace,#fd-files-workspace{left:0!important;bottom:70px!important}.fd26-flight-ops-head{grid-template-columns:1fr 1fr}.fd26-flight-ops-eta{grid-column:2;text-align:right}.fd26-flight-ops-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media(max-width:760px){.brand-copy small{display:none!important}.brand{min-width:auto!important}.connection-chip{display:none!important}.new-flight-button{display:none!important}.fd26-global-clock{padding:4px 7px}.fd26-global-clock small{font-size:8px!important}.flight-summary.flight-overlay-host{min-width:180px!important}.fd26-flight-ops-head{grid-template-columns:1fr;gap:12px}.fd26-flight-ops-eta{grid-column:auto;text-align:left}.fd26-flight-ops-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fd26-flight-ops-grid article:nth-child(n){border-right:1px solid var(--fd-ui-line);border-bottom:1px solid var(--fd-ui-line)}.fd26-flight-ops-grid article:nth-child(2n){border-right:0}.fd26-flight-ops-actions{display:grid;grid-template-columns:repeat(2,1fr)}.fd-files-body{grid-template-columns:160px minmax(0,1fr)!important}.fd-files-preview{display:none!important}.fd-files-topbar{grid-template-columns:1fr!important}.fd-files-search{display:none!important}.fd-docs-layout{grid-template-columns:150px minmax(0,1fr) 46px!important}.fd-docs-right{display:none!important}}
`;
  document.head.append(style);
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
  if (target === 'documents') { document.querySelector('[data-fd-docs-launcher]')?.click(); return; }
  if (target === 'files') { document.querySelector('[data-fd-files-launcher]')?.click(); return; }
  window.dispatchEvent(new CustomEvent('flightdeck:navigate', { detail: { module: target === 'map' ? 'tracking' : target } }));
}

function setActive(module) {
  fd26CurrentModule = normalizedModule(module);
  document.querySelectorAll('[data-fd26-module]').forEach((button) => button.classList.toggle('active', button.dataset.fd26Module === fd26CurrentModule));
  document.querySelectorAll('.fd-global-rail [data-fd24-module]').forEach((button) => button.classList.toggle('active', normalizedModule(button.dataset.fd24Module) === fd26CurrentModule));
}

function makeNavButton(module, glyph, label, datasetKey) {
  const button = document.createElement('button');
  button.type = 'button'; button.dataset[datasetKey] = module; button.title = label;
  button.innerHTML = `${icon(glyph)}<span>${label}</span>`;
  button.addEventListener('click', () => navigate(module));
  return button;
}

function installRail() {
  document.querySelector('.fd-global-rail')?.remove();
  const rail = document.createElement('nav');
  rail.className = 'fd-global-rail fd26-rail'; rail.setAttribute('aria-label', 'Flight Deck navigation');
  for (const [module, glyph, label] of FD26_NAV) rail.append(makeNavButton(module, glyph, label, 'fd24Module'));
  document.body.append(rail); setActive(fd26CurrentModule);
}

function installBottomNav() {
  if (document.querySelector('.fd26-bottom-nav')) return;
  const nav = document.createElement('nav'); nav.className = 'fd26-bottom-nav'; nav.setAttribute('aria-label', 'Flight Deck mobile navigation');
  for (const [module, glyph, label] of FD26_NAV) nav.append(makeNavButton(module, glyph, label, 'fd26Module'));
  document.body.append(nav); setActive(fd26CurrentModule);
}

function ensureGlobalClock() {
  const host = document.querySelector('.connection-summary');
  if (!host || document.getElementById('fd26-global-clock')) return;
  const clock = document.createElement('div'); clock.id = 'fd26-global-clock'; clock.className = 'fd26-global-clock';
  clock.innerHTML = '<span><small>UTC</small><b id="fd26-utc">—</b></span><span><small>LOCAL</small><b id="fd26-local">—</b></span>';
  host.prepend(clock);
}

function updateGlobalClock() {
  ensureGlobalClock(); const now = new Date();
  const utc = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }).format(now);
  const local = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  const utcNode = document.getElementById('fd26-utc'); const localNode = document.getElementById('fd26-local');
  if (utcNode) utcNode.textContent = utc; if (localNode) localNode.textContent = local;
}

function ensureFlightOpsSummary() {
  const page = document.querySelector('[data-page="flight"]'); const heading = page?.querySelector('.page-heading');
  if (!page || !heading || document.getElementById('fd26-flight-ops')) return;
  const panel = document.createElement('section'); panel.id = 'fd26-flight-ops'; panel.className = 'fd26-flight-ops';
  panel.innerHTML = `<header class="fd26-flight-ops-head"><div><small>ACTIVE FLIGHT</small><h2 id="fd26-flight-route">— → —</h2><span id="fd26-flight-ident">—</span></div><div class="fd26-flight-ops-progress"><span><i id="fd26-flight-progress-fill"></i></span><b id="fd26-flight-progress">—</b></div><div class="fd26-flight-ops-eta"><small>ETA</small><strong id="fd26-flight-eta">—</strong><span id="fd26-flight-remaining">— remaining</span></div></header><div class="fd26-flight-ops-grid"><article><small>AIRPORT</small><strong id="fd26-flight-airport">—</strong><span id="fd26-flight-airport-context">Current</span></article><article><small>RUNWAY</small><strong id="fd26-flight-runway">—</strong><span>Active / expected</span></article><article><small>GATE</small><strong id="fd26-flight-gate">—</strong><span>Stand</span></article><article><small>SPEED</small><strong id="fd26-flight-speed">—</strong><span>IAS / GS</span></article><article><small>ALTITUDE</small><strong id="fd26-flight-altitude">—</strong><span>MSFS</span></article><article><small>NEXT</small><strong id="fd26-flight-next">—</strong><span id="fd26-flight-next-distance">Waypoint</span></article><article><small>COM ACTIVE</small><strong id="fd26-flight-com-active">—</strong><span id="fd26-flight-com-radio">Radio</span></article><article><small>COM STANDBY</small><strong id="fd26-flight-com-standby">—</strong><span>Standby</span></article></div><footer class="fd26-flight-ops-actions"><button type="button" data-fd26-jump="documents">Briefing</button><button type="button" data-fd26-jump="com">COM</button><button type="button" data-fd26-jump="taxi">Taxi</button><button type="button" class="primary" data-fd26-jump="map">Live Map</button></footer>`;
  panel.addEventListener('click', (event) => { const button = event.target.closest('[data-fd26-jump]'); if (button) navigate(button.dataset.fd26Jump); });
  heading.insertAdjacentElement('afterend', panel);
}

function valueText(selector, fallback = '—') { const value = String(document.querySelector(selector)?.textContent || '').trim(); return value && value !== 'NO FLIGHT' ? value : fallback; }
function numberOrNull(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function setText(id, value) { const node = document.getElementById(id); if (node) node.textContent = value || '—'; }

function renderFlightOps(state = {}) {
  ensureFlightOpsSummary();
  const flight = state.flight || {}; const plan = state.integrations?.simbrief?.flight || {}; const aircraft = state.aircraft || {}; const com = { ...aircraft, ...(state.integrations?.com || {}) };
  const origin = String(flight.origin || plan.origin || '—').toUpperCase(); const destination = String(flight.destination || plan.destination || '—').toUpperCase();
  const callsign = flight.callsign || plan.callsign || valueText('#home-callsign');
  const flightNumber = flight.flightNumber || (plan.flightNumber ? `${plan.airlineIata || plan.airlineIcao || ''}${plan.flightNumber}` : callsign);
  const airborne = aircraft.onGround === false; const currentAirport = String(flight.currentAirport || '').toUpperCase(); const airport = airborne ? destination : currentAirport || origin || destination;
  const runway = airborne ? (flight.arrivalRunway || plan.arrivalRunway || flight.departureRunway || plan.departureRunway) : (flight.departureRunway || plan.departureRunway || flight.arrivalRunway || plan.arrivalRunway);
  const gate = state.gate?.name || '—'; const ias = numberOrNull(aircraft.indicatedAirspeed); const gs = numberOrNull(aircraft.groundSpeed); const altitude = numberOrNull(aircraft.altitudeFeet);
  const activeRadio = com.com2Transmit && !com.com1Transmit ? 2 : 1; const active = numberOrNull(activeRadio === 2 ? com.com2Active : com.com1Active); const standby = numberOrNull(activeRadio === 2 ? com.com2Standby : com.com1Standby);
  const progressRaw = valueText('#journey-progress-value', valueText('#flight-overlay-top-progress-value')); const progressMatch = progressRaw.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/); const progress = progressMatch ? Math.max(0, Math.min(100, Number(progressMatch[1].replace(',', '.')))) : 0;
  const eta = valueText('#home-flight-eta', valueText('#flight-overlay-top-eta')); const remaining = valueText('#home-flight-remaining', valueText('#journey-remaining')); const next = valueText('#journey-next-waypoint', valueText('#home-next-waypoint')); const nextDistance = valueText('#journey-next-distance', 'Waypoint');
  setText('fd26-flight-route', `${origin} → ${destination}`); setText('fd26-flight-ident', [flightNumber, callsign, plan.aircraftIcao || plan.aircraftType].filter(Boolean).join(' · ')); setText('fd26-flight-progress', progressMatch ? `${Math.round(progress)}%` : '—');
  const fill = document.getElementById('fd26-flight-progress-fill'); if (fill) fill.style.width = `${progress}%`;
  setText('fd26-flight-eta', eta); setText('fd26-flight-remaining', remaining === '—' ? '— remaining' : `${remaining} remaining`); setText('fd26-flight-airport', airport || '—'); setText('fd26-flight-airport-context', airborne ? 'Destination' : 'Current airport'); setText('fd26-flight-runway', runway ? `RWY ${String(runway).replace(/^RWY\s*/i, '')}` : '—'); setText('fd26-flight-gate', gate);
  setText('fd26-flight-speed', ias !== null && gs !== null ? `${Math.round(ias)} / ${Math.round(gs)} kt` : ias !== null ? `${Math.round(ias)} kt IAS` : gs !== null ? `${Math.round(gs)} kt GS` : '—'); setText('fd26-flight-altitude', altitude === null ? '—' : `${Math.round(altitude).toLocaleString()} ft`); setText('fd26-flight-next', next); setText('fd26-flight-next-distance', nextDistance); setText('fd26-flight-com-active', active === null ? '—' : active.toFixed(3)); setText('fd26-flight-com-standby', standby === null ? '—' : standby.toFixed(3)); setText('fd26-flight-com-radio', `COM${activeRadio}`);
}

async function refreshFlightOps() { try { const response = await fetch(apiUrl('/api/state'), { cache: 'no-store' }); if (response.ok) renderFlightOps(await response.json()); } catch { /* retain last state */ } }

function installWorkspaceIntegration() { document.documentElement.classList.add('fd26-unified-shell'); const disabledCharts = document.querySelector('.charts-app[disabled]'); if (disabledCharts) disabledCharts.setAttribute('aria-hidden', 'true'); }

function startUnifiedUx() {
  ensureUnifiedStyles(); installRail(); installBottomNav(); installWorkspaceIntegration(); ensureGlobalClock(); ensureFlightOpsSummary(); updateGlobalClock(); refreshFlightOps();
  clearInterval(fd26ClockTimer); clearInterval(fd26StateTimer); fd26ClockTimer = setInterval(updateGlobalClock, 1_000); fd26StateTimer = setInterval(refreshFlightOps, 2_000);
  const observer = new MutationObserver(() => { document.querySelector('.fd-global-rail [data-fd-files-rail]')?.remove(); if (!document.querySelector('.fd-global-rail')) installRail(); ensureGlobalClock(); ensureFlightOpsSummary(); });
  observer.observe(document.body, { childList: true, subtree: true });
}

window.addEventListener('flightdeck:modulechange', (event) => setActive(event.detail?.module || 'home'));
window.addEventListener('flightdeck:documents-open', () => setActive('documents'));
window.addEventListener('flightdeck:documents-close', () => setActive(document.documentElement.dataset.flightdeckModule || 'home'));
window.addEventListener('flightdeck:file-browser-open', () => setActive('files'));
window.addEventListener('flightdeck:file-browser-close', () => setActive(document.documentElement.dataset.flightdeckModule || 'home'));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startUnifiedUx, { once: true }); else startUnifiedUx();
