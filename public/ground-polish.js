const GROUND_PAGE_SELECTOR = '[data-page="ground"]';
const GSX_REMOTE_URL_KEY = 'flight-deck-gsx-remote-url';
const GSX_GROUND_VIEW_KEY = 'flight-deck-ground-view';
const DEFAULT_GSX_REMOTE_PORT = 8744;

export function buildDefaultGsxRemoteUrl(hostname = '127.0.0.1', port = DEFAULT_GSX_REMOTE_PORT) {
  const host = String(hostname || '127.0.0.1').trim() || '127.0.0.1';
  const numericPort = Number(port);
  const safePort = Number.isInteger(numericPort) && numericPort > 0 && numericPort <= 65535
    ? numericPort : DEFAULT_GSX_REMOTE_PORT;
  const bracketed = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  return `http://${bracketed}:${safePort}/`;
}

export function normalizeGsxRemoteUrl(value, hostname = '127.0.0.1') {
  let candidate = String(value || '').trim();
  if (!candidate) candidate = buildDefaultGsxRemoteUrl(hostname);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `http://${candidate}`;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname) return null;
    if (!url.port) url.port = String(DEFAULT_GSX_REMOTE_PORT);
    if (!url.pathname) url.pathname = '/';
    return url.href;
  } catch {
    return null;
  }
}

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function currentHostname() {
  return window.location.hostname || '127.0.0.1';
}

function storedRemoteUrl() {
  return normalizeGsxRemoteUrl(localStorage.getItem(GSX_REMOTE_URL_KEY), currentHostname())
    || buildDefaultGsxRemoteUrl(currentHostname());
}

function setRemoteStatus(page, state, label, detail = '') {
  const pill = page.querySelector('#gsx-remote-status');
  const copy = page.querySelector('#gsx-remote-status-detail');
  if (pill) {
    pill.className = `module-status ${state}`;
    pill.textContent = label;
  }
  if (copy) copy.textContent = detail;
}

function loadGsxRemote(page, { force = false } = {}) {
  const input = page.querySelector('#gsx-remote-url');
  const frame = page.querySelector('#gsx-remote-frame');
  const placeholder = page.querySelector('#gsx-remote-placeholder');
  if (!input || !frame) return false;
  const url = normalizeGsxRemoteUrl(input.value, currentHostname());
  if (!url) {
    input.classList.add('invalid');
    setRemoteStatus(page, 'attention', 'CHECK URL', 'Bitte eine gültige HTTP/HTTPS-Adresse aus GSX Settings → Network eintragen.');
    return false;
  }
  input.classList.remove('invalid');
  input.value = url;
  localStorage.setItem(GSX_REMOTE_URL_KEY, url);
  if (!force && frame.dataset.loadedUrl === url && frame.src) return true;
  frame.dataset.loadedUrl = url;
  if (placeholder) {
    placeholder.hidden = false;
    placeholder.querySelector('strong').textContent = 'GSX WEB REMOTE WIRD GELADEN';
    placeholder.querySelector('span').textContent = url;
  }
  setRemoteStatus(page, 'waiting', 'CONNECTING', 'Die offizielle GSX-Weboberfläche wird vom lokalen Couatl Remote Control Server geladen.');
  frame.src = url;
  return true;
}

function setGroundView(page, view = 'overview') {
  const selected = view === 'remote' ? 'remote' : 'overview';
  localStorage.setItem(GSX_GROUND_VIEW_KEY, selected);
  for (const button of page.querySelectorAll('[data-ground-view-button]')) {
    const active = button.dataset.groundViewButton === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  for (const section of page.querySelectorAll('[data-ground-view]')) section.hidden = section.dataset.groundView !== selected;
  if (selected === 'remote') loadGsxRemote(page);
}

function buildRemoteWorkspace(page) {
  if (page.querySelector('#gsx-remote-workspace')) return;
  const workspace = node('section', 'gsx-remote-workspace');
  workspace.id = 'gsx-remote-workspace';
  workspace.dataset.groundView = 'remote';
  workspace.hidden = true;

  const connect = node('article', 'efb-card gsx-remote-connect-strip');
  const intro = node('div', 'gsx-remote-intro');
  const introCopy = node('div');
  const eyebrow = node('small', '', 'OFFICIAL GSX PRO WEB REMOTE');
  const title = node('h2', '', 'GSX Remote Control');
  const description = node('p', '', 'GSX Pro 4.0.6+ can expose its own live menu in a browser. Flight Deck embeds that official page instead of recreating or reverse-engineering GSX controls.');
  introCopy.append(eyebrow, title, description);
  const status = node('span', 'module-status waiting', 'READY');
  status.id = 'gsx-remote-status';
  intro.append(introCopy, status);

  const facts = node('div', 'gsx-remote-facts');
  for (const [label, value] of [
    ['REQUIRES', 'GSX PRO 4.0.6+'],
    ['DEFAULT PORT', '8744'],
    ['SOURCE', 'COUATL WEB SERVER'],
  ]) {
    const item = node('span');
    item.append(node('small', '', label), node('b', '', value));
    facts.append(item);
  }

  const controls = node('div', 'gsx-remote-controls');
  const field = node('label', 'gsx-remote-url-field');
  field.append(node('span', '', 'GSX REMOTE ADDRESS'));
  const input = document.createElement('input');
  input.id = 'gsx-remote-url';
  input.type = 'url';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.value = storedRemoteUrl();
  input.placeholder = buildDefaultGsxRemoteUrl(currentHostname());
  field.append(input);
  const load = node('button', 'primary-card-action', 'LOAD REMOTE');
  load.id = 'gsx-remote-load';
  load.type = 'button';
  const reload = node('button', 'secondary-card-action', 'RELOAD');
  reload.id = 'gsx-remote-reload';
  reload.type = 'button';
  const external = node('button', 'secondary-card-action', 'OPEN SEPARATELY');
  external.id = 'gsx-remote-open';
  external.type = 'button';
  controls.append(field, load, reload, external);

  const detail = node('p', 'gsx-remote-status-detail', 'In GSX Settings → Network muss „Remote control server“ aktiviert sein. Ab GSX 4.0.7 wird dort die PC-Adresse inklusive Port angezeigt.');
  detail.id = 'gsx-remote-status-detail';
  const note = node('small', 'safety-note', 'The embedded content is served by GSX/Couatl on your local network. Flight Deck does not intercept invoices, settings, hotkeys or service commands. If GSX blocks embedding on your installation, use OPEN SEPARATELY.');
  connect.append(intro, facts, controls, detail, note);

  const frameCard = node('article', 'efb-card gsx-remote-frame-card');
  const toolbar = node('div', 'gsx-remote-frame-toolbar');
  const toolbarCopy = node('span');
  toolbarCopy.append(node('small', '', 'LIVE GSX MENU'), node('strong', '', 'Official browser interface'));
  const toolbarActions = node('div');
  const frameReload = node('button', 'secondary-card-action', '↻ REFRESH');
  frameReload.type = 'button';
  frameReload.dataset.gsxFrameRefresh = '1';
  toolbarActions.append(frameReload);
  toolbar.append(toolbarCopy, toolbarActions);
  const frameShell = node('div', 'gsx-remote-frame-shell');
  const placeholder = node('div', 'gsx-remote-placeholder');
  placeholder.id = 'gsx-remote-placeholder';
  placeholder.append(node('strong', '', 'GSX WEB REMOTE'), node('span', '', 'Open this tab to load the official GSX menu.'));
  const frame = document.createElement('iframe');
  frame.id = 'gsx-remote-frame';
  frame.title = 'GSX Pro Web Remote';
  frame.referrerPolicy = 'no-referrer';
  frame.allow = 'autoplay; clipboard-read; clipboard-write';
  frame.addEventListener('load', () => {
    placeholder.hidden = true;
    setRemoteStatus(page, 'connected', 'LOADED', 'GSX Remote wurde im Ground-Services-Workspace geladen.');
  });
  frameShell.append(placeholder, frame);
  frameCard.append(toolbar, frameShell);
  workspace.append(connect, frameCard);
  page.append(workspace);

  load.addEventListener('click', () => loadGsxRemote(page, { force: true }));
  reload.addEventListener('click', () => loadGsxRemote(page, { force: true }));
  frameReload.addEventListener('click', () => loadGsxRemote(page, { force: true }));
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    loadGsxRemote(page, { force: true });
  });
  external.addEventListener('click', () => {
    const url = normalizeGsxRemoteUrl(input.value, currentHostname());
    if (!url) return loadGsxRemote(page, { force: true });
    localStorage.setItem(GSX_REMOTE_URL_KEY, url);
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

function buildGroundNav(page, layout) {
  if (page.querySelector('.ground-subnav')) return;
  const nav = node('nav', 'floating-section-nav ground-subnav');
  nav.setAttribute('aria-label', 'Ground Services Bereiche');
  for (const [id, label] of [['overview', 'OVERVIEW'], ['remote', 'GSX REMOTE']]) {
    const button = node('button', '', label);
    button.type = 'button';
    button.dataset.groundViewButton = id;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => setGroundView(page, id));
    nav.append(button);
  }
  page.insertBefore(nav, layout);
}

export function enhanceGroundPage(root = document) {
  const page = root.querySelector?.(GROUND_PAGE_SELECTOR) || document.querySelector(GROUND_PAGE_SELECTOR);
  if (!page) return false;
  const layout = page.querySelector('.ground-layout');
  if (!layout) return false;
  page.classList.add('ground-polished');
  layout.dataset.groundView = 'overview';
  layout.setAttribute('aria-label', 'GSX live overview');
  page.querySelector('.ground-overview')?.classList.add('ground-connector-card');
  page.querySelector('.service-panel')?.classList.add('gsx-live-service-card');
  buildGroundNav(page, layout);
  buildRemoteWorkspace(page);
  const initial = localStorage.getItem(GSX_GROUND_VIEW_KEY) === 'remote' ? 'remote' : 'overview';
  setGroundView(page, initial);
  return true;
}

function start() {
  enhanceGroundPage();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
