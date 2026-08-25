const TOKEN_KEY = 'si-taxi-token';
const WEATHER_SOURCE_KEY = 'flight-deck-weather-source';
const WEATHER_SOURCES = new Set(['auto', 'sayintentions', 'aviationweather']);

let latestState = null;
let weatherObserver = null;
let stateTimer = null;
let lastWeatherRenderKey = '';

function authToken() {
  const fromUrl = new URL(window.location.href).searchParams.get('token');
  if (fromUrl) return fromUrl;
  return localStorage.getItem(TOKEN_KEY) || '';
}

function apiUrl(pathname) {
  const url = new URL(pathname, window.location.origin);
  const token = authToken();
  if (token) url.searchParams.set('token', token);
  return url;
}

async function api(pathname, { method = 'GET', body } = {}) {
  const response = await fetch(apiUrl(pathname), {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await response.json(); } catch { /* Empty responses are allowed. */ }
  if (!response.ok) throw new Error(data?.error || data?.detail || `HTTP ${response.status}`);
  return data;
}

function node(tag, { className = '', text = '', id = '', type = '' } = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  if (id) element.id = id;
  if (type) element.type = type;
  return element;
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function currentWeatherSource() {
  const value = localStorage.getItem(WEATHER_SOURCE_KEY) || 'auto';
  return WEATHER_SOURCES.has(value) ? value : 'auto';
}

function setWeatherSource(value) {
  const normalized = WEATHER_SOURCES.has(value) ? value : 'auto';
  localStorage.setItem(WEATHER_SOURCE_KEY, normalized);
  for (const select of document.querySelectorAll('[data-si-weather-source]')) select.value = normalized;
  lastWeatherRenderKey = '';
  if (latestState) renderWeather(latestState, true);
}

function createWeatherSelect() {
  const select = document.createElement('select');
  select.dataset.siWeatherSource = '1';
  select.setAttribute('aria-label', 'Weather source');
  select.append(
    option('auto', 'Auto · SI preferred'),
    option('sayintentions', 'SayIntentions'),
    option('aviationweather', 'AviationWeather.gov'),
  );
  select.value = currentWeatherSource();
  select.addEventListener('change', () => setWeatherSource(select.value));
  return select;
}

function ensureWeatherControls() {
  const weatherCard = document.querySelector('[data-page="briefing"] .briefing-weather');
  if (weatherCard && !weatherCard.querySelector('.si-weather-source-bar')) {
    const bar = node('div', { className: 'si-weather-source-bar' });
    const label = node('label', { className: 'si-source-field' });
    label.append(node('span', { text: 'WEATHER SOURCE' }), createWeatherSelect());
    const refresh = node('button', { className: 'secondary-card-action', text: 'REFRESH', type: 'button' });
    refresh.id = 'si-weather-refresh';
    refresh.addEventListener('click', () => refreshWeather(refresh));
    bar.append(label, refresh);
    weatherCard.querySelector('.section-title')?.after(bar);
  }

  const settingsCard = document.querySelector('#settings-flight');
  if (settingsCard && !settingsCard.querySelector('.si-weather-setting')) {
    const label = node('label', { className: 'si-weather-setting' });
    const title = node('span', { className: 'si-setting-copy' });
    title.append(node('strong', { text: 'Wetterquelle' }), node('small', { text: 'Auto bevorzugt SayIntentions; AviationWeather.gov bleibt der unabhängige Fallback.' }));
    label.append(title, createWeatherSelect());
    const existingRefresh = settingsCard.querySelector('#weather-refresh');
    if (existingRefresh) settingsCard.insertBefore(label, existingRefresh);
    else settingsCard.append(label);
  }
}

function ensureGateCard() {
  const layout = document.querySelector('[data-page="briefing"] .briefing-layout');
  if (!layout || document.querySelector('#si-gate-card')) return;
  const card = node('article', { className: 'efb-card si-ops-card', id: 'si-gate-card' });
  const heading = node('div', { className: 'section-title' });
  const headingCopy = node('div');
  headingCopy.append(node('small', { text: 'SAYINTENTIONS · AIRPORT OPS' }), node('h2', { text: 'Gate assignment' }));
  const badge = node('span', { text: 'SESSION' });
  badge.id = 'si-gate-badge';
  heading.append(headingCopy, badge);

  const current = node('div', { className: 'si-current-assignment' });
  current.append(node('small', { text: 'CURRENT ASSIGNMENT' }));
  const currentValue = node('strong', { text: '—' });
  currentValue.id = 'si-current-gate';
  const currentMeta = node('span', { text: 'Waiting for active flight' });
  currentMeta.id = 'si-current-gate-meta';
  current.append(currentValue, currentMeta);

  const form = node('div', { className: 'si-gate-form' });
  const airportLabel = node('label');
  airportLabel.append(node('span', { text: 'AIRPORT ICAO' }));
  const airport = document.createElement('input');
  airport.id = 'si-gate-airport';
  airport.maxLength = 4;
  airport.autocomplete = 'off';
  airport.placeholder = 'EDDF';
  airport.addEventListener('input', () => { airport.value = airport.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); airport.dataset.touched = '1'; });
  airportLabel.append(airport);

  const gateLabel = node('label');
  gateLabel.append(node('span', { text: 'REQUESTED GATE' }));
  const gate = document.createElement('input');
  gate.id = 'si-gate-request';
  gate.maxLength = 30;
  gate.autocomplete = 'off';
  gate.placeholder = 'A21';
  gate.addEventListener('input', () => { gate.value = gate.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 30); });
  gateLabel.append(gate);
  form.append(airportLabel, gateLabel);

  const actions = node('div', { className: 'si-ops-actions' });
  const assign = node('button', { className: 'primary-card-action', text: 'ASSIGN GATE', type: 'button' });
  assign.id = 'si-assign-gate';
  assign.addEventListener('click', () => assignGate(assign));
  const refresh = node('button', { className: 'secondary-card-action', text: 'REFRESH PARKING', type: 'button' });
  refresh.id = 'si-refresh-parking';
  refresh.addEventListener('click', () => refreshParking(refresh));
  actions.append(assign, refresh);

  const status = node('p', { className: 'form-message si-operation-status' });
  status.id = 'si-gate-status';
  status.setAttribute('role', 'status');
  card.append(heading, current, form, actions, status);
  layout.append(card);
}

function ensureAtcOperationsCard() {
  const page = document.querySelector('[data-page="atc"]');
  if (!page || document.querySelector('#si-atc-operations')) return;
  const target = page.querySelector('.atc-layout, .atc-center-layout, .atc-page-layout') || page;
  const card = node('article', { className: 'efb-card si-ops-card si-atc-ops-card', id: 'si-atc-operations' });
  const heading = node('div', { className: 'section-title' });
  const headingCopy = node('div');
  headingCopy.append(node('small', { text: 'SAYINTENTIONS · SESSION' }), node('h2', { text: 'SI controls' }));
  const stateBadge = node('span', { text: 'OFFLINE' });
  stateBadge.id = 'si-session-state';
  heading.append(headingCopy, stateBadge);

  const pauseRow = node('div', { className: 'si-pause-row' });
  const pauseCopy = node('div');
  pauseCopy.append(node('strong', { text: 'ATC simulation' }), node('small', { text: 'Pause or resume the active SayIntentions session explicitly.' }));
  const pause = node('button', { className: 'secondary-card-action', text: 'PAUSE SI ATC', type: 'button' });
  pause.id = 'si-pause-toggle';
  pause.addEventListener('click', () => togglePause(pause));
  pauseRow.append(pauseCopy, pause);

  const messageBlock = node('div', { className: 'si-message-block' });
  const channel = document.createElement('select');
  channel.id = 'si-say-channel';
  channel.append(option('COM1', 'COM1 · Pilot → ATC'), option('COM2', 'COM2 · Pilot → ATC'));
  const message = document.createElement('textarea');
  message.id = 'si-say-message';
  message.maxLength = 255;
  message.rows = 3;
  message.placeholder = 'e.g. Ready for departure';
  const send = node('button', { className: 'primary-card-action', text: 'SEND TO SAYINTENTIONS', type: 'button' });
  send.id = 'si-say-send';
  send.addEventListener('click', () => sendSayAs(send));
  const note = node('small', { className: 'si-action-note', text: 'Explicit action: this transmits a real pilot text message into the active SI flight. Inbound/spoofed ATC channels are intentionally not exposed.' });
  const status = node('p', { className: 'form-message si-operation-status' });
  status.id = 'si-atc-operation-status';
  status.setAttribute('role', 'status');
  messageBlock.append(channel, message, send, note, status);
  card.append(heading, pauseRow, messageBlock);
  target.append(card);
}

function ensureUi() {
  ensureWeatherControls();
  ensureGateCard();
  ensureAtcOperationsCard();
  installWeatherObserver();
}

function statusMessage(id, text, kind = '') {
  const element = document.querySelector(id);
  if (!element) return;
  element.textContent = text || '';
  element.dataset.state = kind;
}

function normalizeAirports(state) {
  return [...new Set([
    state?.flight?.currentAirport,
    state?.flight?.origin,
    state?.flight?.destination,
    state?.integrations?.simbrief?.flight?.origin,
    state?.integrations?.simbrief?.flight?.destination,
  ].map((value) => String(value || '').trim().toUpperCase()).filter((value) => /^[A-Z0-9]{3,4}$/.test(value)))];
}

async function refreshWeather(button) {
  if (button) button.disabled = true;
  try {
    const source = currentWeatherSource();
    const airports = normalizeAirports(latestState || {});
    await api('/api/weather/refresh', { method: 'POST', body: { source, airports } });
    await refreshState();
  } catch (error) {
    statusMessage('#si-gate-status', `Weather refresh: ${error.message}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function selectedWeather(state) {
  const si = state?.integrations?.sayIntentions?.weather || {};
  const official = state?.integrations?.aviationWeather || {};
  const source = currentWeatherSource();
  if (source === 'sayintentions') return { id: 'sayintentions', label: 'SayIntentions', value: si };
  if (source === 'aviationweather') return { id: 'aviationweather', label: 'AviationWeather.gov', value: official };
  if (Array.isArray(si.airports) && si.airports.length > 0 && state?.connections?.sayIntentions?.status === 'connected') {
    return { id: 'sayintentions', label: 'SayIntentions · Auto', value: si };
  }
  return { id: 'aviationweather', label: 'AviationWeather.gov · Auto fallback', value: official };
}

function weatherFingerprint(selected) {
  return JSON.stringify({
    source: selected.id,
    updatedAt: selected.value?.updatedAt || null,
    airports: selected.value?.airports || [],
  });
}

function appendWeatherText(parent, label, value, className = '') {
  if (!value) return;
  const row = node('div', { className: `si-weather-product ${className}`.trim() });
  row.append(node('small', { text: label }), node('p', { text: String(value) }));
  parent.append(row);
}

function renderWeather(state, force = false) {
  const container = document.querySelector('#briefing-airports');
  if (!container) return;
  const selected = selectedWeather(state);
  const fingerprint = weatherFingerprint(selected);
  const markerPresent = Boolean(container.querySelector('[data-si-weather-render="1"]'));
  if (!force && fingerprint === lastWeatherRenderKey && markerPresent) return;
  lastWeatherRenderKey = fingerprint;

  const root = node('div', { className: 'si-weather-render' });
  root.dataset.siWeatherRender = '1';
  const airports = Array.isArray(selected.value?.airports) ? selected.value.airports : [];
  if (!airports.length) {
    root.append(node('p', { className: 'empty-list', text: `No ${selected.label} weather data available.` }));
  } else {
    for (const airport of airports) {
      const card = node('section', { className: 'si-weather-airport' });
      const header = node('header');
      const ident = node('div');
      ident.append(node('strong', { text: String(airport.airport || '—') }));
      const details = [airport.activeRunway ? `RWY ${airport.activeRunway}` : '', airport.flightCategory || ''].filter(Boolean).join(' · ');
      ident.append(node('small', { text: details || selected.label }));
      const wind = Number.isFinite(Number(airport.windDirection)) || Number.isFinite(Number(airport.windSpeed))
        ? `${Number.isFinite(Number(airport.windDirection)) ? Math.round(Number(airport.windDirection)) : '—'}° / ${Number.isFinite(Number(airport.windSpeed)) ? Math.round(Number(airport.windSpeed)) : '—'} kt`
        : '—';
      header.append(ident, node('span', { text: wind }));
      card.append(header);
      appendWeatherText(card, 'ATIS', airport.atis || airport.atisCpdlc, 'atis');
      appendWeatherText(card, 'METAR', airport.metar, 'metar');
      appendWeatherText(card, 'TAF', airport.taf, 'taf');
      root.append(card);
    }
  }
  container.replaceChildren(root);
  container.dataset.siWeatherFingerprint = fingerprint;
  const time = document.querySelector('#briefing-weather-time');
  if (time) {
    const stamp = selected.value?.updatedAt ? new Date(selected.value.updatedAt) : null;
    const rendered = stamp && !Number.isNaN(stamp.valueOf()) ? stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
    time.textContent = `${selected.label} · ${rendered}`;
  }
}

function installWeatherObserver() {
  const container = document.querySelector('#briefing-airports');
  if (!container || weatherObserver) return;
  weatherObserver = new MutationObserver(() => {
    if (!latestState) return;
    const selected = selectedWeather(latestState);
    const fingerprint = weatherFingerprint(selected);
    if (!container.querySelector('[data-si-weather-render="1"]') || container.dataset.siWeatherFingerprint !== fingerprint) {
      queueMicrotask(() => renderWeather(latestState, true));
    }
  });
  weatherObserver.observe(container, { childList: true, subtree: true });
}

async function assignGate(button) {
  const airport = document.querySelector('#si-gate-airport')?.value.trim().toUpperCase();
  const gate = document.querySelector('#si-gate-request')?.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(airport || '')) return statusMessage('#si-gate-status', 'Enter a valid 3–4 character airport ICAO.', 'error');
  if (!/^[A-Z0-9]{1,30}$/.test(gate || '')) return statusMessage('#si-gate-status', 'Gate must contain only letters and numbers.', 'error');
  button.disabled = true;
  statusMessage('#si-gate-status', `Requesting ${gate} at ${airport} …`, 'busy');
  try {
    const result = await api('/api/sayintentions/gate', { method: 'POST', body: { airport, gate } });
    const assigned = result?.assignedGate || result?.result?.assigned_gate_name || gate;
    statusMessage('#si-gate-status', `SayIntentions assigned ${assigned}. Parking position is being synchronized.`, 'success');
    await new Promise((resolve) => setTimeout(resolve, 450));
    await refreshState();
  } catch (error) {
    statusMessage('#si-gate-status', error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function refreshParking(button) {
  button.disabled = true;
  statusMessage('#si-gate-status', 'Refreshing SI parking assignment …', 'busy');
  try {
    await api('/api/sayintentions/parking/refresh', { method: 'POST', body: {} });
    await refreshState();
    statusMessage('#si-gate-status', 'Parking assignment refreshed.', 'success');
  } catch (error) {
    statusMessage('#si-gate-status', error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function togglePause(button) {
  const paused = Boolean(latestState?.integrations?.sayIntentions?.paused);
  button.disabled = true;
  try {
    await api('/api/sayintentions/pause', { method: 'POST', body: { paused: !paused } });
    await refreshState();
    statusMessage('#si-atc-operation-status', !paused ? 'SayIntentions ATC simulation paused.' : 'SayIntentions ATC simulation resumed.', 'success');
  } catch (error) {
    statusMessage('#si-atc-operation-status', error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

async function sendSayAs(button) {
  const channel = document.querySelector('#si-say-channel')?.value || 'COM1';
  const input = document.querySelector('#si-say-message');
  const message = input?.value.trim() || '';
  if (!message) return statusMessage('#si-atc-operation-status', 'Enter a message first.', 'error');
  button.disabled = true;
  statusMessage('#si-atc-operation-status', `Sending via ${channel} …`, 'busy');
  try {
    await api('/api/sayintentions/say', { method: 'POST', body: { channel, message } });
    if (input) input.value = '';
    statusMessage('#si-atc-operation-status', `Message sent via ${channel}.`, 'success');
  } catch (error) {
    statusMessage('#si-atc-operation-status', error.message, 'error');
  } finally {
    button.disabled = false;
  }
}

function renderOperations(state) {
  const connected = state?.connections?.sayIntentions?.status === 'connected';
  const gate = state?.gate || null;
  const gateValue = document.querySelector('#si-current-gate');
  const gateMeta = document.querySelector('#si-current-gate-meta');
  if (gateValue) gateValue.textContent = gate?.name || '—';
  if (gateMeta) {
    const position = Number.isFinite(Number(gate?.lat)) && Number.isFinite(Number(gate?.lon))
      ? `${Number(gate.lat).toFixed(5)}, ${Number(gate.lon).toFixed(5)}${Number.isFinite(Number(gate.heading)) ? ` · HDG ${Math.round(Number(gate.heading))}°` : ''}`
      : gate?.name ? 'Assignment received · waiting for parking coordinates' : 'No SI parking assignment yet';
    gateMeta.textContent = position;
  }
  const badge = document.querySelector('#si-gate-badge');
  if (badge) badge.textContent = connected ? 'SI LIVE' : 'SI OFFLINE';

  const airport = document.querySelector('#si-gate-airport');
  if (airport && airport.dataset.touched !== '1' && document.activeElement !== airport) {
    const suggested = String(state?.flight?.destination || state?.flight?.currentAirport || state?.flight?.origin || '').toUpperCase();
    if (/^[A-Z0-9]{3,4}$/.test(suggested)) airport.value = suggested;
  }
  for (const selector of ['#si-assign-gate', '#si-refresh-parking', '#si-pause-toggle', '#si-say-send']) {
    const control = document.querySelector(selector);
    if (control) control.disabled = !connected;
  }
  const paused = Boolean(state?.integrations?.sayIntentions?.paused);
  const pause = document.querySelector('#si-pause-toggle');
  if (pause) pause.textContent = paused ? 'RESUME SI ATC' : 'PAUSE SI ATC';
  const session = document.querySelector('#si-session-state');
  if (session) session.textContent = connected ? (paused ? 'PAUSED' : 'SI LIVE') : 'OFFLINE';
}

async function refreshState() {
  try {
    const state = await api('/api/state');
    latestState = state;
    ensureUi();
    renderOperations(state);
    renderWeather(state);
  } catch {
    // The main application owns the pairing/offline UI. Retry quietly here.
  }
}

function interceptExistingWeatherRefresh() {
  const button = document.querySelector('#weather-refresh');
  if (!button || button.dataset.siSourceAware === '1') return;
  button.dataset.siSourceAware = '1';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    refreshWeather(button);
  }, { capture: true });
}

function start() {
  ensureUi();
  interceptExistingWeatherRefresh();
  refreshState();
  clearInterval(stateTimer);
  stateTimer = setInterval(() => {
    ensureUi();
    interceptExistingWeatherRefresh();
    refreshState();
  }, 3_000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
