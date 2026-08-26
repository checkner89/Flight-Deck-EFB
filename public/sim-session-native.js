let refreshTimer = null;
let lastScreenshotUrl = null;
let observerFrame = 0;

function token() {
  return localStorage.getItem('si-taxi-token') || new URL(window.location.href).searchParams.get('token') || '';
}

function authenticatedUrl(pathname) {
  const url = new URL(pathname, window.location.origin);
  const value = token();
  if (value) url.searchParams.set('token', value);
  return url.toString();
}

async function api(pathname, options = {}) {
  const response = await fetch(authenticatedUrl(pathname), options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) throw new Error(body?.error || `${response.status} ${response.statusText}`);
  return body;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function isGerman() {
  return String(document.documentElement.lang || '').toLowerCase().startsWith('de');
}

function copy() {
  return isGerman() ? {
    tools: 'Windows Tools', toolsHint: 'Automatisch erkannte Simulator-Programme',
    running: 'LÄUFT', stopped: 'BEREIT', missing: 'NICHT GEFUNDEN', launch: 'STARTEN',
    path: 'EXE-PFAD', savePath: 'PFAD SPEICHERN', clearPath: 'AUTO', configureHint: 'Pfadänderungen sind nur in der Windows-App erlaubt.',
    screenshot: 'MSFS Screenshot', screenshotHint: 'Expliziter Screenshot des Simulatorfensters', takeScreenshot: 'SCREENSHOT AUFNEHMEN',
    noScreenshot: 'Noch kein Screenshot aufgenommen.', download: 'PNG SPEICHERN',
    discovery: 'LAN Auto Discovery', discoveryHint: 'Tablet ohne IP-Adresse verbinden',
    discoveryReady: 'Im selben WLAN diese Adresse öffnen:', discoveryFallback: 'mDNS nicht verfügbar. QR-Code bzw. LAN-Adresse weiterverwenden.',
    refresh: 'AKTUALISIEREN', failed: 'Nicht verfügbar',
  } : {
    tools: 'Windows Tools', toolsHint: 'Automatically detected simulator applications',
    running: 'RUNNING', stopped: 'READY', missing: 'NOT FOUND', launch: 'LAUNCH',
    path: 'EXE PATH', savePath: 'SAVE PATH', clearPath: 'AUTO', configureHint: 'Executable paths can only be changed in the Windows app.',
    screenshot: 'MSFS Screenshot', screenshotHint: 'Explicit capture of the simulator window', takeScreenshot: 'TAKE SCREENSHOT',
    noScreenshot: 'No screenshot captured yet.', download: 'SAVE PNG',
    discovery: 'LAN Auto Discovery', discoveryHint: 'Connect a tablet without remembering an IP address',
    discoveryReady: 'Open this address on the same Wi-Fi:', discoveryFallback: 'mDNS is unavailable. Keep using the QR code or LAN address.',
    refresh: 'REFRESH', failed: 'Unavailable',
  };
}

function statusClass(tool) {
  if (tool.running) return 'running';
  if (tool.launchable) return 'ready';
  return 'missing';
}

function toolRows(data) {
  const dictionary = copy();
  return (data.tools || []).map((tool) => {
    const status = tool.running ? dictionary.running : tool.launchable ? dictionary.stopped : dictionary.missing;
    const pathControls = data.canConfigure ? `<div class="native-tool-path"><input data-tool-path="${esc(tool.id)}" value="${esc(tool.path || '')}" placeholder="${dictionary.path}"><button type="button" data-save-tool-path="${esc(tool.id)}">${dictionary.savePath}</button><button type="button" data-clear-tool-path="${esc(tool.id)}">${dictionary.clearPath}</button></div>` : '';
    return `<article class="native-tool-row ${statusClass(tool)}"><span class="native-tool-dot"></span><div class="native-tool-copy"><strong>${esc(tool.label)}</strong><small>${esc(tool.path || (tool.launchMode === 'uri' ? 'WINDOWS / STEAM URI' : 'AUTO DETECT'))}</small>${pathControls}</div><b>${status}</b><button type="button" data-launch-tool="${esc(tool.id)}" ${tool.running || !tool.launchable ? 'disabled' : ''}>${dictionary.launch}</button></article>`;
  }).join('');
}

function ensureNativeCards() {
  const grid = document.querySelector('.sim-session-grid');
  if (!grid || grid.querySelector('[data-native-session-root]')) return false;
  const dictionary = copy();
  const fragment = document.createElement('div');
  fragment.dataset.nativeSessionRoot = 'true';
  fragment.className = 'sim-session-native-root';
  fragment.innerHTML = `
    <article class="sim-session-card native-tools-card">
      <header><div><small>WINDOWS HOST</small><h2>${dictionary.tools}</h2><p>${dictionary.toolsHint}</p></div><button type="button" data-native-refresh>${dictionary.refresh}</button></header>
      <div class="native-tools-list" data-native-tools-list><p class="native-empty">…</p></div>
      <footer><span data-native-config-hint></span></footer>
    </article>
    <article class="sim-session-card native-screenshot-card">
      <header><div><small>REMOTE CAPTURE</small><h2>${dictionary.screenshot}</h2><p>${dictionary.screenshotHint}</p></div><button type="button" data-take-screenshot>${dictionary.takeScreenshot}</button></header>
      <div class="native-screenshot-preview" data-screenshot-preview><p>${dictionary.noScreenshot}</p></div>
      <footer><span data-screenshot-message></span><a data-screenshot-download hidden download="Flight-Deck-MSFS-Screenshot.png">${dictionary.download}</a></footer>
    </article>
    <article class="sim-session-card native-discovery-card">
      <header><div><small>ZEROCONF / mDNS</small><h2>${dictionary.discovery}</h2><p>${dictionary.discoveryHint}</p></div></header>
      <div data-discovery-body class="native-discovery-body"><p>…</p></div>
    </article>`;
  grid.append(fragment);
  wireNativeCards(fragment);
  refreshNativeStatus().catch(() => {});
  startRefreshTimer();
  return true;
}

function wireNativeCards(root) {
  root.querySelector('[data-native-refresh]')?.addEventListener('click', () => refreshNativeStatus(true));
  root.querySelector('[data-take-screenshot]')?.addEventListener('click', takeScreenshot);
  root.addEventListener('click', async (event) => {
    const launch = event.target.closest('[data-launch-tool]');
    if (launch) {
      launch.disabled = true;
      try {
        await api('/api/sim-session/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: launch.dataset.launchTool }) });
        setTimeout(() => refreshNativeStatus(true).catch(() => {}), 1600);
      } catch (error) {
        launch.title = error.message;
        launch.disabled = false;
      }
      return;
    }
    const save = event.target.closest('[data-save-tool-path]');
    if (save) {
      const input = root.querySelector(`[data-tool-path="${CSS.escape(save.dataset.saveToolPath)}"]`);
      if (!input) return;
      save.disabled = true;
      try {
        await api('/api/sim-session/configure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: save.dataset.saveToolPath, path: input.value }) });
        await refreshNativeStatus(true);
      } catch (error) {
        input.setCustomValidity(error.message);
        input.reportValidity();
        input.setCustomValidity('');
        save.disabled = false;
      }
      return;
    }
    const clear = event.target.closest('[data-clear-tool-path]');
    if (clear) {
      clear.disabled = true;
      try {
        await api('/api/sim-session/configure', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: clear.dataset.clearToolPath }) });
        await refreshNativeStatus(true);
      } catch {
        clear.disabled = false;
      }
    }
  });
}

async function refreshNativeStatus(force = false) {
  const root = document.querySelector('[data-native-session-root]');
  if (!root) return;
  try {
    const query = force ? '?refresh=1' : '';
    const data = await api(`/api/sim-session/status${query}`);
    const list = root.querySelector('[data-native-tools-list]');
    if (list) list.innerHTML = toolRows(data);
    const hint = root.querySelector('[data-native-config-hint]');
    if (hint) hint.textContent = data.canConfigure ? '' : copy().configureHint;
  } catch (error) {
    const list = root.querySelector('[data-native-tools-list]');
    if (list) list.innerHTML = `<p class="native-empty">${esc(error.message)}</p>`;
  }
  try {
    const discovery = await api('/api/discovery/status');
    renderDiscovery(discovery);
  } catch (error) {
    renderDiscovery({ status: 'unavailable', detail: error.message });
  }
}

function renderDiscovery(discovery) {
  const root = document.querySelector('[data-native-session-root]');
  const body = root?.querySelector('[data-discovery-body]');
  if (!body) return;
  const dictionary = copy();
  if (discovery?.status === 'ready' && discovery.url) {
    body.innerHTML = `<span class="native-discovery-state ready">● READY</span><p>${dictionary.discoveryReady}</p><strong>${esc(discovery.url)}</strong><small>${esc(discovery.computerName || '')}</small>`;
  } else {
    body.innerHTML = `<span class="native-discovery-state degraded">● ${dictionary.failed.toUpperCase()}</span><p>${dictionary.discoveryFallback}</p><small>${esc(discovery?.detail || '')}</small>`;
  }
}

async function takeScreenshot() {
  const root = document.querySelector('[data-native-session-root]');
  const button = root?.querySelector('[data-take-screenshot]');
  const preview = root?.querySelector('[data-screenshot-preview]');
  const message = root?.querySelector('[data-screenshot-message]');
  const download = root?.querySelector('[data-screenshot-download]');
  if (!button || !preview) return;
  button.disabled = true;
  if (message) message.textContent = '…';
  try {
    const response = await fetch(authenticatedUrl('/api/sim-session/screenshot'), { method: 'POST' });
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try { detail = (await response.json()).error || detail; } catch {}
      throw new Error(detail);
    }
    const blob = await response.blob();
    if (lastScreenshotUrl) URL.revokeObjectURL(lastScreenshotUrl);
    lastScreenshotUrl = URL.createObjectURL(blob);
    preview.innerHTML = `<img src="${lastScreenshotUrl}" alt="MSFS screenshot">`;
    if (download) {
      download.href = lastScreenshotUrl;
      download.hidden = false;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      download.download = `Flight-Deck-MSFS-${timestamp}.png`;
    }
    if (message) message.textContent = response.headers.get('x-flight-deck-capture-source') || 'MSFS';
  } catch (error) {
    if (message) message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function startRefreshTimer() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    const root = document.querySelector('[data-native-session-root]');
    const shell = document.querySelector('#pilot-tools-shell');
    if (!root || shell?.hidden || document.hidden) return;
    refreshNativeStatus(false).catch(() => {});
  }, 8_000);
}

function scheduleEnsure() {
  if (observerFrame) return;
  observerFrame = requestAnimationFrame(() => {
    observerFrame = 0;
    ensureNativeCards();
  });
}

function start() {
  scheduleEnsure();
  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleEnsure();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
