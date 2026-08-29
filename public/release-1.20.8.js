const FD28_TOKEN_KEY = 'si-taxi-token';
let fd28Timer = null;
let fd28Observer = null;

function fd28Token() {
  const fromUrl = new URL(window.location.href).searchParams.get('token');
  return fromUrl || localStorage.getItem(FD28_TOKEN_KEY) || '';
}

function fd28Url(pathname) {
  const url = new URL(pathname, window.location.origin);
  const token = fd28Token();
  if (token) url.searchParams.set('token', token);
  return url;
}

async function fd28Api(pathname, options = {}) {
  const response = await fetch(fd28Url(pathname), { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.detail || `${response.status} ${response.statusText}`);
  return data;
}

function fd28Number(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fd28Text(value, fallback = '—') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function fd28Set(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value ?? '—';
}

function fd28Frequency(value) {
  const number = fd28Number(value);
  return number === null ? '—' : number.toFixed(3);
}

function fd28Epoch(seconds) {
  const value = fd28Number(seconds);
  if (value === null) return '—';
  const date = new Date(value * 1000);
  if (Number.isNaN(date.valueOf())) return '—';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function fd28RouteProgress() {
  const raw = String(document.querySelector('#journey-progress-value')?.textContent || document.querySelector('#flight-overlay-top-progress-value')?.textContent || '');
  const match = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*%/);
  const percent = match ? Math.max(0, Math.min(100, Number(match[1].replace(',', '.')))) : 0;
  const remaining = fd28Text(document.querySelector('#home-flight-remaining')?.textContent || document.querySelector('#journey-remaining')?.textContent, '—');
  const eta = fd28Text(document.querySelector('#home-flight-eta')?.textContent || document.querySelector('#journey-eta')?.textContent, '—').replace(/^ETA\s*/i, '').split(' · ')[0].trim();
  return { percent, remaining, eta };
}

function fd28Navigate(module) {
  if (module === 'documents') {
    document.querySelector('[data-fd-docs-launcher]')?.click();
    return;
  }
  window.dispatchEvent(new CustomEvent('flightdeck:navigate', { detail: { module } }));
}

function fd28CleanLegacyFlightCopy() {
  document.querySelectorAll('[data-page="flight"] .simbrief-card').forEach((card) => {
    [...card.children].forEach((child) => {
      if (child.matches?.('.auto-flight-detection')) child.remove();
      else if (child.tagName === 'P' && child.textContent.includes('Flight Deck EFB erkennt den aktiven Flug automatisch')) child.remove();
    });
  });
  document.querySelectorAll('[data-settings-panel="flight"] .auto-flight-detection').forEach((node) => node.remove());
}

function fd28EnsureFlightCard() {
  const panel = document.getElementById('fd26-flight-ops');
  if (!panel || panel.dataset.fd28Ready === '1') return panel;
  panel.dataset.fd28Ready = '1';
  panel.classList.add('fd28-flight-ops');
  panel.innerHTML = `
    <header class="fd28-flight-hero">
      <div class="fd28-flight-ident"><small>ACTIVE FLIGHT</small><h2 id="fd28-flight-route">— → —</h2><span id="fd28-flight-meta">—</span></div>
      <div class="fd28-flight-source"><span id="fd28-plan-source" class="plan">PLAN · WAITING</span><span id="fd28-live-source" class="live">LIVE · WAITING</span></div>
      <div class="fd28-flight-eta"><small>ETA</small><strong id="fd28-flight-eta">—</strong><span id="fd28-flight-remaining">— remaining</span></div>
    </header>
    <div class="fd28-progress"><i id="fd28-flight-progress"></i></div>
    <div class="fd28-flight-metrics">
      <article class="fd28-flight-metric"><small>NOW</small><strong id="fd28-flight-airport">—</strong><span id="fd28-flight-runway">RWY —</span></article>
      <article class="fd28-flight-metric"><small>FLIGHT</small><strong id="fd28-flight-altitude">—</strong><span id="fd28-flight-speed">—</span></article>
      <article class="fd28-flight-metric"><small>RADIO</small><strong id="fd28-flight-com">—</strong><span id="fd28-flight-com-stby">STBY —</span></article>
      <article class="fd28-flight-metric"><small>GROUND</small><strong id="fd28-flight-gate">—</strong><span id="fd28-flight-ground-detail">Gate / stand</span></article>
    </div>
    <footer class="fd28-flight-actions">
      <button type="button" data-fd28-nav="documents">OFP & DOCUMENTS</button>
      <button type="button" data-fd28-simbrief>SIMBRIEF REFRESH</button>
      <button type="button" data-fd28-nav="com">COM</button>
      <button type="button" data-fd28-nav="taxi">TAXI</button>
      <button type="button" class="primary" data-fd28-nav="map">LIVE MAP</button>
    </footer>`;
  panel.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-fd28-nav]');
    if (nav) { fd28Navigate(nav.dataset.fd28Nav); return; }
    const simbrief = event.target.closest('[data-fd28-simbrief]');
    if (simbrief) fd28RefreshSimBrief(simbrief);
  });
  return panel;
}

async function fd28RefreshSimBrief(button) {
  let identifier = String(localStorage.getItem('flight-deck-simbrief-user') || '').trim();
  if (!identifier) identifier = String(window.prompt('SimBrief Pilot ID or username:', '') || '').trim();
  if (!identifier) return;
  localStorage.setItem('flight-deck-simbrief-user', identifier.slice(0, 80));
  button.disabled = true;
  button.classList.add('syncing');
  const original = button.textContent;
  button.textContent = 'LOADING OFP…';
  try {
    const result = await fd28Api('/api/simbrief/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, prefetchDestination: true }),
    });
    const plan = result.summary?.flight || {};
    button.textContent = plan.origin && plan.destination ? `${plan.origin} → ${plan.destination}` : 'IMPORTED';
    window.setTimeout(() => { button.textContent = original; }, 2200);
    await fd28Refresh();
  } catch (error) {
    button.textContent = 'IMPORT FAILED';
    button.title = error.message;
    window.setTimeout(() => { button.textContent = original; }, 2800);
  } finally {
    button.disabled = false;
    button.classList.remove('syncing');
  }
}

function fd28RenderFlightCard(state = {}) {
  const panel = fd28EnsureFlightCard();
  if (!panel) return;
  const flight = state.flight || {};
  const simbrief = state.integrations?.simbrief || {};
  const plan = simbrief.flight || {};
  const aircraft = state.aircraft || {};
  const com = { ...aircraft, ...(state.integrations?.com || {}) };
  const hasPlan = Boolean(simbrief.imported && plan.origin && plan.destination);
  const origin = fd28Text((hasPlan ? plan.origin : null) || flight.origin);
  const destination = fd28Text((hasPlan ? plan.destination : null) || flight.destination || state.planning?.selectedAirport?.icao);
  const callsign = fd28Text((hasPlan ? plan.callsign : null) || flight.callsign, '');
  const aircraftType = fd28Text((hasPlan ? (plan.aircraftType || plan.aircraftName) : null) || flight.aircraftType || aircraft.aircraftType, '');
  const meta = [callsign, aircraftType, plan.registration].filter((value) => value && value !== '—').join(' · ') || 'Waiting for flight data';
  const airborne = aircraft.onGround === false;
  const currentAirport = fd28Text(flight.currentAirport, '');
  const airport = airborne ? destination : currentAirport || origin || destination;
  const departureRunway = (hasPlan ? plan.departureRunway : null) || flight.departureRunway;
  const arrivalRunway = (hasPlan ? plan.arrivalRunway : null) || flight.arrivalRunway;
  const runway = airborne ? (arrivalRunway || departureRunway) : (departureRunway || arrivalRunway);
  const altitude = fd28Number(aircraft.altitudeFeet);
  const ias = fd28Number(aircraft.indicatedAirspeed);
  const gs = fd28Number(aircraft.groundSpeed);
  const speed = ias !== null && gs !== null ? `IAS ${Math.round(ias)} · GS ${Math.round(gs)} kt` : ias !== null ? `IAS ${Math.round(ias)} kt` : gs !== null ? `GS ${Math.round(gs)} kt` : '—';
  const radio = com.com2Transmit && !com.com1Transmit ? 2 : 1;
  const active = radio === 2 ? com.com2Active : com.com1Active;
  const standby = radio === 2 ? com.com2Standby : com.com1Standby;
  const progress = fd28RouteProgress();
  const eta = progress.eta !== '—' ? progress.eta : fd28Epoch(plan.estimatedIn);
  const gate = fd28Text(state.gate?.name);
  const simConnected = state.connections?.simConnect?.status === 'connected';
  const siConnected = state.connections?.sayIntentions?.status === 'connected';

  fd28Set('fd28-flight-route', `${origin} → ${destination}`);
  fd28Set('fd28-flight-meta', meta);
  fd28Set('fd28-plan-source', hasPlan ? 'PLAN · SIMBRIEF' : 'PLAN · AUTO');
  fd28Set('fd28-live-source', simConnected ? 'LIVE · MSFS' : siConnected ? 'LIVE · SAYINTENTIONS' : 'LIVE · WAITING');
  document.getElementById('fd28-live-source')?.classList.toggle('connected', simConnected || siConnected);
  fd28Set('fd28-flight-eta', eta);
  fd28Set('fd28-flight-remaining', progress.remaining === '—' ? '— remaining' : `${progress.remaining} remaining`);
  const fill = document.getElementById('fd28-flight-progress'); if (fill) fill.style.width = `${progress.percent}%`;
  fd28Set('fd28-flight-airport', airport || '—');
  fd28Set('fd28-flight-runway', runway ? `RWY ${String(runway).replace(/^RWY\s*/i, '')}` : 'RWY —');
  fd28Set('fd28-flight-altitude', altitude === null ? '—' : `${Math.round(altitude).toLocaleString()} ft`);
  fd28Set('fd28-flight-speed', speed);
  fd28Set('fd28-flight-com', active == null ? `COM${radio} · —` : `COM${radio} · ${fd28Frequency(active)}`);
  fd28Set('fd28-flight-com-stby', `STBY ${fd28Frequency(standby)}`);
  fd28Set('fd28-flight-gate', gate);
  fd28Set('fd28-flight-ground-detail', airborne ? 'Arrival stand when available' : 'Gate / stand');
}

function fd28ReplaceDocsRight() {
  const right = document.querySelector('#fd-docs-workspace .fd-docs-right');
  if (!right || right.dataset.fd28Ready === '1') return;
  right.dataset.fd28Ready = '1';
  right.innerHTML = `
    <article class="fd-docs-widget fd28-docs-destination-card"><header><small>DESTINATION OPS</small><b id="fd-docs-airport-ident">—</b></header>
      <div class="fd28-docs-route"><span><small>FROM</small><strong id="fd28-docs-departure">—</strong></span><i></i><span><small>TO</small><strong id="fd28-docs-destination">—</strong></span></div>
      <div class="fd28-runway-card"><small>PLANNED ARRIVAL</small><strong id="fd-docs-airport-runway">RWY —</strong><span id="fd-docs-airport-detail">Destination from SimBrief</span></div>
    </article>
    <article class="fd-docs-widget"><header><small>WEATHER</small><b id="fd-docs-weather-airport">—</b></header><div class="fd-docs-weather-main"><strong id="fd-docs-weather-temp">METAR</strong><span id="fd-docs-weather-wind">—</span></div><p id="fd-docs-weather-text" class="fd-docs-weather-text">No weather available.</p></article>
    <article class="fd-docs-widget"><header><small>LIVE</small><b id="fd-docs-live-status">WAITING</b></header><div class="fd28-docs-live"><span><small>ALT</small><strong id="fd-docs-altitude">—</strong></span><span><small>SPEED</small><strong id="fd-docs-speed">—</strong></span><span><small>COM</small><strong id="fd-docs-com-active">—</strong></span><span><small>STBY</small><strong id="fd-docs-com-standby">—</strong></span></div></article>
    <article class="fd-docs-widget quick"><header><small>QUICK JUMP</small><b>COCKPIT</b></header><div class="fd-docs-quick"><button type="button" data-fd-jump="com"><span>COM</span></button><button type="button" data-fd-jump="taxi"><span>TAXI</span></button><button type="button" data-fd-jump="map"><span>LIVE MAP</span></button></div></article>`;
}

function fd28RenderDocs(state = {}) {
  fd28ReplaceDocsRight();
  const plan = state.integrations?.simbrief?.flight || {};
  fd28Set('fd28-docs-departure', fd28Text(plan.origin || state.flight?.origin));
  fd28Set('fd28-docs-destination', fd28Text(plan.destination || state.flight?.destination));
}

function fd28RepairNewsImages(root = document) {
  root.querySelectorAll?.('.news-card-image,.news-reader-hero,.news-reader-image img').forEach((image) => {
    if (image.dataset.fd28ImageGuard === '1') return;
    image.dataset.fd28ImageGuard = '1';
    image.addEventListener('error', () => {
      image.hidden = true;
      image.closest('.news-card')?.classList.remove('has-image');
    }, { once: true });
    if (image.complete && image.naturalWidth === 0) image.dispatchEvent(new Event('error'));
  });
}

function fd28EnhanceArchive() {
  const list = document.getElementById('flight-archive-list');
  if (!list) return;
  [...list.children].forEach((entry) => {
    if (!(entry instanceof HTMLButtonElement) || !entry.classList.contains('flight-archive-entry') || !entry.dataset.flightId) return;
    if (entry.parentElement?.classList.contains('fd28-archive-row')) return;
    const row = document.createElement('div'); row.className = 'fd28-archive-row';
    entry.parentNode.insertBefore(row, entry); row.append(entry);
    const del = document.createElement('button'); del.type = 'button'; del.className = 'fd28-archive-delete'; del.title = 'Flight löschen'; del.setAttribute('aria-label', 'Flight löschen'); del.textContent = '×';
    del.addEventListener('click', async () => {
      const label = entry.querySelector('strong')?.textContent || 'diesen Flug';
      if (!window.confirm(`${label} aus dem Flight Archiv löschen?`)) return;
      del.disabled = true;
      try {
        await fd28Api(`/api/flights/${encodeURIComponent(entry.dataset.flightId)}`, { method: 'DELETE' });
        row.remove();
        const count = document.getElementById('tracking-archive-count');
        if (count) count.textContent = String(Math.max(0, Number(count.textContent || 0) - 1));
      } catch (error) {
        del.title = error.message;
        del.disabled = false;
      }
    });
    row.append(del);
  });
}

async function fd28Refresh() {
  fd28CleanLegacyFlightCopy();
  fd28EnsureFlightCard();
  fd28ReplaceDocsRight();
  fd28EnhanceArchive();
  fd28RepairNewsImages(document);
  try {
    const state = await fd28Api('/api/state');
    fd28RenderFlightCard(state);
    fd28RenderDocs(state);
  } catch {
    // Keep the shell usable while the Windows host reconnects.
  }
}

function fd28Boot() {
  fd28Refresh();
  clearInterval(fd28Timer); fd28Timer = setInterval(fd28Refresh, 2_000);
  fd28Observer?.disconnect();
  fd28Observer = new MutationObserver((mutations) => {
    let relevant = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) { relevant = true; break; }
    }
    if (!relevant) return;
    fd28CleanLegacyFlightCopy();
    fd28EnsureFlightCard();
    fd28ReplaceDocsRight();
    fd28EnhanceArchive();
    fd28RepairNewsImages(document);
  });
  fd28Observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('flightdeck:documents-open', () => { fd28ReplaceDocsRight(); fd28Refresh(); });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fd28Boot, { once: true });
else fd28Boot();
