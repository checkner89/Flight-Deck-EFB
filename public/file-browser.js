const FD_FILES_TOKEN_KEY = 'si-taxi-token';
const FD_FILES_FAVORITES = 'flight-deck-file-browser-favorites-v1';
const FD_FILES_PREFS = 'flight-deck-file-browser-prefs-v1';

const filesState = {
  roots: null,
  currentPath: null,
  parentPath: null,
  items: [],
  selected: new Set(),
  lastSelectedIndex: null,
  history: [],
  historyIndex: -1,
  search: '',
  searching: false,
  sort: 'name',
  direction: 'asc',
  view: 'list',
  showHidden: false,
  favorites: [],
  capabilities: { write: false, fullFilesystem: false },
};

const filesUi = {};

function filesToken() {
  return new URL(window.location.href).searchParams.get('token') || localStorage.getItem(FD_FILES_TOKEN_KEY) || '';
}

function filesApiUrl(pathname, params = {}) {
  const url = new URL(pathname, window.location.origin);
  const token = filesToken();
  if (token) url.searchParams.set('token', token);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  return url;
}

async function filesApi(pathname, { method = 'GET', body, params, rawBody, headers } = {}) {
  const response = await fetch(filesApiUrl(pathname, params), {
    method,
    cache: 'no-store',
    headers: headers || (body === undefined ? undefined : { 'Content-Type': 'application/json' }),
    body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try { data = await response.json(); } catch { /* binary / empty */ }
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
  return data;
}

function filesEl(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('data-')) node.setAttribute(key, value);
    else if (key === 'checked') node.checked = Boolean(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child?.nodeType ? child : document.createTextNode(String(child)));
  return node;
}

const FILE_ICONS = {
  folder: '<path d="M3.5 7.5h6l2 2h9v10h-17z"/><path d="M3.5 7.5V5h6l2 2h9v2.5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/>',
  image: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m5.5 17 4.5-4 3 2.5 2-2 3.5 3.5"/>',
  pdf: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M8.5 15h7M8.5 18h5"/>',
  text: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 15h6M9 18h4"/>',
  audio: '<path d="M9 18V7l9-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="15.5" cy="16" r="2.5"/>',
  video: '<rect x="3" y="6" width="14" height="12" rx="2"/><path d="m17 10 4-2v8l-4-2z"/>',
  drive: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M6 14h12M17 10h1"/>',
  home: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M9 20v-5h6v5"/>',
  star: '<path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9z"/>',
  back: '<path d="m14.5 5-7 7 7 7"/>', forward: '<path d="m9.5 5 7 7-7 7"/>', up: '<path d="m5 14 7-7 7 7"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M18 9a7 7 0 0 0-12-2L4 9m2 6a7 7 0 0 0 12 2l2-2"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>', close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5M5 15v5h14v-5"/>',
  rename: '<path d="M4 19h6M14 5l5 5-9 9H5v-5z"/>', copy: '<rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  move: '<path d="M4 12h15m-5-5 5 5-5 5"/><path d="M4 7v10"/>', trash: '<path d="M5 7h14M9 7V4h6v3m-8 0 1 13h8l1-13M10 10v7m4-7v7"/>',
  download: '<path d="M12 4v12m0 0 5-5m-5 5-5-5M5 20h14"/>', grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  theme: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};

function filesIcon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${FILE_ICONS[name] || FILE_ICONS.file}</svg>`;
}

function loadPrefs() {
  try {
    const prefs = JSON.parse(localStorage.getItem(FD_FILES_PREFS) || '{}');
    if (['name', 'size', 'modifiedAt', 'type'].includes(prefs.sort)) filesState.sort = prefs.sort;
    if (['asc', 'desc'].includes(prefs.direction)) filesState.direction = prefs.direction;
    if (['list', 'grid'].includes(prefs.view)) filesState.view = prefs.view;
    filesState.showHidden = prefs.showHidden === true;
  } catch { /* defaults */ }
  try {
    const favorites = JSON.parse(localStorage.getItem(FD_FILES_FAVORITES) || '[]');
    filesState.favorites = Array.isArray(favorites) ? favorites.filter((item) => item?.path && item?.label).slice(0, 30) : [];
  } catch { filesState.favorites = []; }
}

function savePrefs() {
  localStorage.setItem(FD_FILES_PREFS, JSON.stringify({ sort: filesState.sort, direction: filesState.direction, view: filesState.view, showHidden: filesState.showHidden }));
}

function saveFavorites() {
  localStorage.setItem(FD_FILES_FAVORITES, JSON.stringify(filesState.favorites.slice(0, 30)));
}

function fileGlyph(item) {
  if (item.type === 'directory') return 'folder';
  if (['image', 'pdf', 'text', 'audio', 'video'].includes(item.preview)) return item.preview;
  return 'file';
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let index = 0;
  while (n >= 1024 && index < units.length - 1) { n /= 1024; index += 1; }
  return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function pathLabel(target) {
  const match = [...(filesState.roots?.quick || []), ...(filesState.roots?.drives || [])].find((root) => root.path === target);
  return match?.label || target;
}

function setStatus(message, type = '') {
  if (!filesUi.status) return;
  filesUi.status.textContent = message || '';
  filesUi.status.dataset.state = type;
}

function selectedItems() {
  return filesState.items.filter((item) => filesState.selected.has(item.path));
}

function sortedItems() {
  const factor = filesState.direction === 'desc' ? -1 : 1;
  return [...filesState.items].sort((a, b) => {
    if (a.type === 'directory' && b.type !== 'directory') return -1;
    if (b.type === 'directory' && a.type !== 'directory') return 1;
    let left; let right;
    if (filesState.sort === 'size') { left = a.size ?? -1; right = b.size ?? -1; return (left - right) * factor; }
    if (filesState.sort === 'modifiedAt') { left = new Date(a.modifiedAt || 0).getTime(); right = new Date(b.modifiedAt || 0).getTime(); return (left - right) * factor; }
    if (filesState.sort === 'type') { left = `${a.type}:${a.extension}`; right = `${b.type}:${b.extension}`; }
    else { left = a.name; right = b.name; }
    return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' }) * factor;
  });
}

function updateActions() {
  const selection = selectedItems();
  const one = selection.length === 1;
  const write = filesState.capabilities.write;
  for (const button of filesUi.writeButtons || []) button.disabled = !write;
  filesUi.rename.disabled = !write || !one;
  filesUi.copy.disabled = !write || !one;
  filesUi.move.disabled = !write || !one;
  filesUi.remove.disabled = !write || selection.length === 0;
  filesUi.download.disabled = selection.length !== 1 || selection[0]?.type !== 'file';
  filesUi.favorite.disabled = !one || selection[0]?.type !== 'directory';
  filesUi.selection.textContent = selection.length ? `${selection.length} ausgewählt` : `${filesState.items.length} Einträge`;
}

function buildWorkspace() {
  if (document.getElementById('fd-files-workspace')) return;
  const overlay = filesEl('section', { id: 'fd-files-workspace', class: 'fd-files-workspace', hidden: true, 'aria-label': 'Flight Deck file browser' });
  const shell = filesEl('div', { class: 'fd-files-shell' });

  const topbar = filesEl('header', { class: 'fd-files-topbar' });
  const brand = filesEl('div', { class: 'fd-files-brand', html: `<span>${filesIcon('folder')}</span><div><small>FLIGHT DECK EFB</small><strong>FILES</strong></div>` });
  const nav = filesEl('div', { class: 'fd-files-navigation' });
  const back = filesEl('button', { type: 'button', title: 'Zurück', html: filesIcon('back') });
  const forward = filesEl('button', { type: 'button', title: 'Vor', html: filesIcon('forward') });
  const up = filesEl('button', { type: 'button', title: 'Übergeordneter Ordner', html: filesIcon('up') });
  const refresh = filesEl('button', { type: 'button', title: 'Aktualisieren', html: filesIcon('refresh') });
  const location = filesEl('input', { type: 'text', class: 'fd-files-location', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Pfad' });
  nav.append(back, forward, up, refresh, location);
  const searchWrap = filesEl('label', { class: 'fd-files-search', html: `${filesIcon('search')}<input type="search" placeholder="In diesem Ordner suchen" aria-label="Dateien suchen"><kbd>Ctrl F</kbd>` });
  const theme = filesEl('button', { type: 'button', class: 'fd-files-top-icon', title: 'Light / Dark Mode', html: filesIcon('theme') });
  const close = filesEl('button', { type: 'button', class: 'fd-files-top-icon', title: 'Dateibrowser schließen', html: filesIcon('close') });
  topbar.append(brand, nav, searchWrap, theme, close);

  const body = filesEl('main', { class: 'fd-files-body' });
  const sidebar = filesEl('aside', { class: 'fd-files-sidebar' });
  const roots = filesEl('div', { class: 'fd-files-roots' });
  sidebar.append(roots);

  const main = filesEl('section', { class: 'fd-files-main' });
  const toolbar = filesEl('div', { class: 'fd-files-toolbar' });
  const newFolder = filesEl('button', { type: 'button', html: `${filesIcon('plus')}<span>ORDNER</span>` });
  const newFile = filesEl('button', { type: 'button', html: `${filesIcon('plus')}<span>DATEI</span>` });
  const upload = filesEl('button', { type: 'button', html: `${filesIcon('upload')}<span>UPLOAD</span>` });
  const rename = filesEl('button', { type: 'button', html: `${filesIcon('rename')}<span>UMBENENNEN</span>` });
  const copy = filesEl('button', { type: 'button', html: `${filesIcon('copy')}<span>KOPIEREN</span>` });
  const move = filesEl('button', { type: 'button', html: `${filesIcon('move')}<span>VERSCHIEBEN</span>` });
  const remove = filesEl('button', { type: 'button', class: 'danger', html: `${filesIcon('trash')}<span>LÖSCHEN</span>` });
  const download = filesEl('button', { type: 'button', html: `${filesIcon('download')}<span>DOWNLOAD</span>` });
  const favorite = filesEl('button', { type: 'button', title: 'Zu Favoriten hinzufügen', html: `${filesIcon('star')}<span>FAVORIT</span>` });
  const spacer = filesEl('i', { class: 'fd-files-toolbar-spacer' });
  const hidden = filesEl('button', { type: 'button', title: 'Versteckte Dateien anzeigen', html: filesIcon('eye') });
  const view = filesEl('button', { type: 'button', title: 'Ansicht wechseln', html: filesIcon(filesState.view === 'list' ? 'grid' : 'list') });
  const sort = filesEl('select', { title: 'Sortierung', 'aria-label': 'Sortierung' });
  sort.innerHTML = '<option value="name">Name</option><option value="modifiedAt">Geändert</option><option value="size">Größe</option><option value="type">Typ</option>';
  toolbar.append(newFolder, newFile, upload, rename, copy, move, remove, download, favorite, spacer, hidden, sort, view);

  const tableHead = filesEl('div', { class: 'fd-files-table-head' });
  for (const [key, label] of [['name', 'NAME'], ['modifiedAt', 'GEÄNDERT'], ['type', 'TYP'], ['size', 'GRÖSSE']]) {
    const cell = filesEl('button', { type: 'button', 'data-sort': key, text: label });
    tableHead.append(cell);
  }
  const list = filesEl('div', { class: 'fd-files-list', role: 'listbox', tabindex: '0', 'aria-label': 'Dateien und Ordner' });
  const empty = filesEl('div', { class: 'fd-files-empty', hidden: true, html: `${filesIcon('folder')}<strong>Dieser Ordner ist leer.</strong><span>Ziehe Dateien hierher oder erstelle einen neuen Ordner.</span>` });
  const drop = filesEl('div', { class: 'fd-files-drop', hidden: true, html: `${filesIcon('upload')}<strong>Dateien hier ablegen</strong>` });
  const statusbar = filesEl('footer', { class: 'fd-files-statusbar' });
  const selection = filesEl('span', { text: '0 Einträge' });
  const status = filesEl('span', { class: 'fd-files-status', text: '' });
  const access = filesEl('span', { class: 'fd-files-access', text: '—' });
  statusbar.append(selection, status, access);
  main.append(toolbar, tableHead, list, empty, drop, statusbar);

  const preview = filesEl('aside', { class: 'fd-files-preview' });
  preview.innerHTML = `<header><small>PREVIEW</small><strong id="fd-files-preview-title">Keine Auswahl</strong></header><div id="fd-files-preview-body" class="fd-files-preview-body"><div class="fd-files-preview-empty">${filesIcon('file')}<p>Wähle eine Datei aus, um Vorschau und Eigenschaften anzuzeigen.</p></div></div><footer id="fd-files-preview-properties"></footer>`;

  const fileInput = filesEl('input', { type: 'file', multiple: true, hidden: true });
  body.append(sidebar, main, preview);
  shell.append(topbar, body, fileInput);
  overlay.append(shell);
  document.body.append(overlay);

  Object.assign(filesUi, {
    overlay, shell, roots, back, forward, up, refresh, location, search: searchWrap.querySelector('input'), theme, close,
    newFolder, newFile, upload, rename, copy, move, remove, download, favorite, hidden, view, sort, toolbar,
    tableHead, list, empty, drop, selection, status, access, preview, previewTitle: preview.querySelector('#fd-files-preview-title'),
    previewBody: preview.querySelector('#fd-files-preview-body'), previewProperties: preview.querySelector('#fd-files-preview-properties'), fileInput,
    writeButtons: [newFolder, newFile, upload],
  });

  back.addEventListener('click', historyBack);
  forward.addEventListener('click', historyForward);
  up.addEventListener('click', () => filesState.parentPath && navigateFiles(filesState.parentPath));
  refresh.addEventListener('click', () => refreshFiles());
  location.addEventListener('keydown', (event) => { if (event.key === 'Enter') navigateFiles(location.value.trim()); });
  searchWrap.querySelector('input').addEventListener('keydown', (event) => { if (event.key === 'Enter') runSearch(); if (event.key === 'Escape') clearSearch(); });
  theme.addEventListener('click', () => document.getElementById('quick-theme-toggle')?.click());
  close.addEventListener('click', closeFileBrowser);
  newFolder.addEventListener('click', createFolder);
  newFile.addEventListener('click', createFile);
  upload.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => uploadFiles([...fileInput.files]));
  rename.addEventListener('click', renameSelected);
  copy.addEventListener('click', copySelected);
  move.addEventListener('click', moveSelected);
  remove.addEventListener('click', deleteSelected);
  download.addEventListener('click', downloadSelected);
  favorite.addEventListener('click', toggleFavoriteSelected);
  hidden.addEventListener('click', toggleHidden);
  view.addEventListener('click', toggleView);
  sort.addEventListener('change', () => { filesState.sort = sort.value; savePrefs(); renderItems(); });
  tableHead.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sort]');
    if (!button) return;
    if (filesState.sort === button.dataset.sort) filesState.direction = filesState.direction === 'asc' ? 'desc' : 'asc';
    else { filesState.sort = button.dataset.sort; filesState.direction = 'asc'; }
    sort.value = filesState.sort; savePrefs(); renderItems();
  });
  list.addEventListener('keydown', fileKeyboard);
  list.addEventListener('contextmenu', showContextMenu);
  main.addEventListener('dragenter', dragEnter);
  main.addEventListener('dragover', dragOver);
  main.addEventListener('dragleave', dragLeave);
  main.addEventListener('drop', dropFiles);
  document.addEventListener('keydown', globalFileKeyboard);
}

function installLauncher() {
  const grid = document.querySelector('.app-launcher-grid');
  if (grid && !grid.querySelector('[data-fd-files-launcher]')) {
    const tile = filesEl('button', { class: 'efb-app-tile files-app', type: 'button', 'data-app-id': 'files', 'data-fd-files-launcher': '1' });
    tile.innerHTML = `<span class="app-tile-icon">${filesIcon('folder')}</span><span class="app-tile-copy"><small>LOCAL FILES · PREVIEW · MANAGEMENT</small><strong>Files</strong><span>Dateibrowser für PC, Briefings, Downloads und Flight Deck Daten</span></span><i class="app-open-arrow">›</i>`;
    tile.addEventListener('click', () => openFileBrowser());
    const settings = grid.querySelector('.settings-app');
    if (settings) grid.insertBefore(tile, settings); else grid.append(tile);
  }
  installRailButton();
}

function installRailButton() {
  const rail = document.querySelector('.fd-global-rail');
  if (!rail || rail.querySelector('[data-fd-files-rail]')) return;
  const button = filesEl('button', { type: 'button', title: 'Files', 'data-fd-files-rail': '1', html: `${filesIcon('folder')}<span>Files</span>` });
  button.addEventListener('click', () => openFileBrowser());
  const spacer = rail.querySelector('.fd-rail-spacer');
  rail.insertBefore(button, spacer || rail.lastElementChild);
  filesUi.railButton = button;
}

function markRailActive(active) {
  installRailButton();
  if (active) {
    document.querySelectorAll('.fd-global-rail button').forEach((button) => button.classList.remove('active'));
    filesUi.railButton?.classList.add('active');
  } else {
    filesUi.railButton?.classList.remove('active');
    window.dispatchEvent(new CustomEvent('flightdeck:modulechange', { detail: { module: document.documentElement.dataset.flightdeckModule || 'home' } }));
  }
}

async function openFileBrowser(initialPath = null) {
  buildWorkspace(); installLauncher();
  filesUi.overlay.hidden = false;
  document.documentElement.classList.add('fd-files-open');
  markRailActive(true);
  window.dispatchEvent(new CustomEvent('flightdeck:file-browser-open'));
  setStatus('Dateibrowser wird geladen …');
  try {
    await loadRoots();
    const start = initialPath || filesState.currentPath || filesState.roots?.quick?.find((root) => root.id === 'home')?.path || filesState.roots?.quick?.[0]?.path || filesState.roots?.drives?.[0]?.path;
    if (!start) throw new Error('Es wurde kein lesbarer Startordner gefunden.');
    await navigateFiles(start, { push: filesState.history.length === 0 });
  } catch (error) { setStatus(error.message, 'error'); }
}

function closeFileBrowser() {
  if (!filesUi.overlay) return;
  filesUi.overlay.hidden = true;
  document.documentElement.classList.remove('fd-files-open');
  markRailActive(false);
  window.dispatchEvent(new CustomEvent('flightdeck:file-browser-close'));
}

async function loadRoots() {
  filesState.roots = await filesApi('/api/files/roots');
  filesState.capabilities = filesState.roots.capabilities || { write: false, fullFilesystem: false };
  filesUi.access.textContent = filesState.capabilities.write ? 'WINDOWS HOST · READ / WRITE' : 'PAIRED DEVICE · READ ONLY';
  filesUi.access.dataset.write = filesState.capabilities.write ? '1' : '0';
  renderRoots(); updateActions();
}

function renderRoots() {
  filesUi.roots.replaceChildren();
  const section = (title, items, iconName) => {
    if (!items?.length) return;
    filesUi.roots.append(filesEl('small', { class: 'fd-files-root-title', text: title }));
    for (const item of items) {
      const button = filesEl('button', { type: 'button', class: filesState.currentPath === item.path ? 'active' : '', title: item.path });
      button.innerHTML = `${filesIcon(item.kind === 'drive' ? 'drive' : iconName)}<span>${escapeHtml(item.label)}</span><i>›</i>`;
      button.addEventListener('click', () => navigateFiles(item.path));
      filesUi.roots.append(button);
    }
  };
  section('QUICK ACCESS', filesState.roots?.quick, 'home');
  if (filesState.favorites.length) section('FAVORITES', filesState.favorites.map((item) => ({ ...item, kind: 'favorite' })), 'star');
  section('DRIVES', filesState.roots?.drives, 'drive');
}

async function navigateFiles(target, { push = true } = {}) {
  if (!target) return;
  filesState.search = '';
  filesState.searching = false;
  filesUi.search.value = '';
  setStatus('Ordner wird geladen …');
  try {
    const data = await filesApi('/api/files/list', { params: { path: target, hidden: filesState.showHidden ? 1 : 0 } });
    filesState.currentPath = data.path;
    filesState.parentPath = data.parent;
    filesState.items = data.items || [];
    filesState.selected.clear();
    filesState.lastSelectedIndex = null;
    filesUi.location.value = data.path;
    if (push) {
      filesState.history = filesState.history.slice(0, filesState.historyIndex + 1);
      if (filesState.history.at(-1) !== data.path) filesState.history.push(data.path);
      filesState.historyIndex = filesState.history.length - 1;
    }
    renderRoots(); renderItems(); clearPreview(); updateNavigation();
    setStatus('Bereit', 'success');
  } catch (error) { setStatus(error.message, 'error'); }
}

async function refreshFiles() {
  if (filesState.searching) return runSearch();
  return navigateFiles(filesState.currentPath, { push: false });
}

function updateNavigation() {
  filesUi.back.disabled = filesState.historyIndex <= 0;
  filesUi.forward.disabled = filesState.historyIndex < 0 || filesState.historyIndex >= filesState.history.length - 1;
  filesUi.up.disabled = !filesState.parentPath || filesState.parentPath === filesState.currentPath;
}

function historyBack() {
  if (filesState.historyIndex <= 0) return;
  filesState.historyIndex -= 1;
  navigateFiles(filesState.history[filesState.historyIndex], { push: false });
}

function historyForward() {
  if (filesState.historyIndex >= filesState.history.length - 1) return;
  filesState.historyIndex += 1;
  navigateFiles(filesState.history[filesState.historyIndex], { push: false });
}

function renderItems() {
  const items = sortedItems();
  filesUi.list.classList.toggle('grid', filesState.view === 'grid');
  filesUi.tableHead.hidden = filesState.view === 'grid';
  filesUi.view.innerHTML = filesIcon(filesState.view === 'list' ? 'grid' : 'list');
  filesUi.hidden.classList.toggle('active', filesState.showHidden);
  filesUi.sort.value = filesState.sort;
  filesUi.list.replaceChildren();
  for (const [index, item] of items.entries()) {
    const row = filesEl('div', { class: `fd-file-row ${filesState.selected.has(item.path) ? 'selected' : ''}`, role: 'option', tabindex: '-1', 'data-path': item.path, 'aria-selected': filesState.selected.has(item.path) ? 'true' : 'false' });
    const name = filesEl('div', { class: 'fd-file-name' });
    name.innerHTML = `<span class="fd-file-icon ${item.type === 'directory' ? 'folder' : ''}">${filesIcon(fileGlyph(item))}</span><div><strong>${escapeHtml(item.name)}</strong><small>${item.type === 'directory' ? 'Ordner' : item.extension?.replace('.', '').toUpperCase() || 'Datei'}</small></div>`;
    row.append(name, filesEl('span', { class: 'fd-file-modified', text: formatDate(item.modifiedAt) }), filesEl('span', { class: 'fd-file-type', text: item.type === 'directory' ? 'Ordner' : item.mime?.split(';')[0] || 'Datei' }), filesEl('span', { class: 'fd-file-size', text: item.type === 'directory' ? '—' : formatBytes(item.size) }));
    row.addEventListener('click', (event) => selectItem(item, index, event));
    row.addEventListener('dblclick', () => openItem(item));
    filesUi.list.append(row);
  }
  filesUi.empty.hidden = items.length !== 0;
  updateActions();
}

function selectItem(item, index, event = {}) {
  const items = sortedItems();
  if (event.shiftKey && filesState.lastSelectedIndex !== null) {
    const start = Math.min(filesState.lastSelectedIndex, index);
    const end = Math.max(filesState.lastSelectedIndex, index);
    if (!event.ctrlKey && !event.metaKey) filesState.selected.clear();
    for (let i = start; i <= end; i += 1) filesState.selected.add(items[i].path);
  } else if (event.ctrlKey || event.metaKey) {
    if (filesState.selected.has(item.path)) filesState.selected.delete(item.path); else filesState.selected.add(item.path);
    filesState.lastSelectedIndex = index;
  } else {
    filesState.selected.clear(); filesState.selected.add(item.path); filesState.lastSelectedIndex = index;
  }
  renderItems(); renderPreview();
}

function openItem(item) {
  if (item.type === 'directory') navigateFiles(item.path);
  else { filesState.selected.clear(); filesState.selected.add(item.path); renderItems(); renderPreview(true); }
}

async function renderPreview(autoFocus = false) {
  const selection = selectedItems();
  if (selection.length !== 1) {
    if (selection.length > 1) renderMultiPreview(selection); else clearPreview();
    return;
  }
  const item = selection[0];
  filesUi.previewTitle.textContent = item.name;
  filesUi.previewBody.innerHTML = '<div class="fd-files-preview-loading"><i></i><span>Vorschau wird geladen …</span></div>';
  filesUi.previewProperties.innerHTML = propertiesHtml(item);
  try {
    const meta = await filesApi('/api/files/preview', { params: { path: item.path } });
    filesUi.previewProperties.innerHTML = propertiesHtml(meta);
    const contentUrl = filesApiUrl('/api/files/content', { path: item.path }).toString();
    if (meta.preview === 'directory') {
      filesUi.previewBody.innerHTML = `<div class="fd-files-preview-empty">${filesIcon('folder')}<p>Ordner</p><button type="button" data-open-folder>ÖFFNEN</button></div>`;
      filesUi.previewBody.querySelector('[data-open-folder]')?.addEventListener('click', () => navigateFiles(item.path));
    } else if (meta.preview === 'image') {
      filesUi.previewBody.innerHTML = `<img class="fd-files-preview-image" src="${escapeAttr(contentUrl)}" alt="${escapeAttr(item.name)}">`;
    } else if (meta.preview === 'pdf') {
      filesUi.previewBody.innerHTML = `<iframe class="fd-files-preview-pdf" src="${escapeAttr(contentUrl)}" title="${escapeAttr(item.name)}"></iframe>`;
    } else if (meta.preview === 'audio') {
      filesUi.previewBody.innerHTML = `<div class="fd-files-media-preview">${filesIcon('audio')}<audio controls preload="metadata" src="${escapeAttr(contentUrl)}"></audio></div>`;
    } else if (meta.preview === 'video') {
      filesUi.previewBody.innerHTML = `<video class="fd-files-preview-video" controls preload="metadata" src="${escapeAttr(contentUrl)}"></video>`;
    } else if (meta.preview === 'text') {
      const editable = filesState.capabilities.write && meta.size <= 8 * 1024 * 1024;
      const textarea = filesEl('textarea', { class: 'fd-files-text-preview', readonly: editable ? null : true, spellcheck: 'false' });
      textarea.value = meta.text || '';
      const wrap = filesEl('div', { class: 'fd-files-text-wrap' }, textarea);
      if (meta.truncated) wrap.prepend(filesEl('div', { class: 'fd-files-truncated', text: 'Vorschau gekürzt – die Datei ist größer als 1,5 MB.' }));
      if (editable) {
        const save = filesEl('button', { class: 'fd-files-save-text', type: 'button', text: 'TEXT SPEICHERN' });
        save.addEventListener('click', async () => {
          save.disabled = true; setStatus('Textdatei wird gespeichert …');
          try { await filesApi('/api/files/text', { method: 'PUT', body: { path: item.path, content: textarea.value } }); setStatus('Datei gespeichert.', 'success'); await refreshFiles(); }
          catch (error) { setStatus(error.message, 'error'); }
          finally { save.disabled = false; }
        });
        wrap.append(save);
      }
      filesUi.previewBody.replaceChildren(wrap);
    } else {
      filesUi.previewBody.innerHTML = `<div class="fd-files-preview-empty">${filesIcon('file')}<p>Für diesen Dateityp ist keine integrierte Vorschau verfügbar.</p><button type="button" data-download-preview>DOWNLOAD</button></div>`;
      filesUi.previewBody.querySelector('[data-download-preview]')?.addEventListener('click', downloadSelected);
    }
    if (autoFocus) filesUi.preview.scrollIntoView({ block: 'nearest' });
  } catch (error) {
    filesUi.previewBody.innerHTML = `<div class="fd-files-preview-error">${filesIcon('file')}<strong>Vorschau nicht verfügbar</strong><span>${escapeHtml(error.message)}</span></div>`;
  }
}

function renderMultiPreview(items) {
  const bytes = items.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
  filesUi.previewTitle.textContent = `${items.length} Einträge`;
  filesUi.previewBody.innerHTML = `<div class="fd-files-preview-empty">${filesIcon('copy')}<p>${items.length} Dateien/Ordner ausgewählt</p><strong>${formatBytes(bytes)}</strong></div>`;
  filesUi.previewProperties.innerHTML = `<dl><div><dt>AUSWAHL</dt><dd>${items.length}</dd></div><div><dt>DATEIGRÖSSE</dt><dd>${formatBytes(bytes)}</dd></div></dl>`;
}

function clearPreview() {
  if (!filesUi.previewBody) return;
  filesUi.previewTitle.textContent = 'Keine Auswahl';
  filesUi.previewBody.innerHTML = `<div class="fd-files-preview-empty">${filesIcon('file')}<p>Wähle eine Datei aus, um Vorschau und Eigenschaften anzuzeigen.</p></div>`;
  filesUi.previewProperties.innerHTML = '';
}

function propertiesHtml(item) {
  return `<dl><div><dt>TYP</dt><dd>${escapeHtml(item.type === 'directory' ? 'Ordner' : item.mime?.split(';')[0] || 'Datei')}</dd></div><div><dt>GRÖSSE</dt><dd>${item.type === 'directory' ? '—' : formatBytes(item.size)}</dd></div><div><dt>GEÄNDERT</dt><dd>${escapeHtml(formatDate(item.modifiedAt))}</dd></div><div class="wide"><dt>PFAD</dt><dd title="${escapeAttr(item.path)}">${escapeHtml(item.path)}</dd></div></dl>`;
}

async function runSearch() {
  const query = filesUi.search.value.trim();
  if (!query) return clearSearch();
  filesState.search = query; filesState.searching = true; filesState.selected.clear();
  setStatus(`Suche nach „${query}“ …`);
  try {
    const data = await filesApi('/api/files/search', { params: { path: filesState.currentPath, q: query, hidden: filesState.showHidden ? 1 : 0, limit: 500 } });
    filesState.items = data.items || [];
    renderItems(); clearPreview();
    setStatus(`${filesState.items.length} Treffer${data.truncated ? ' · Ergebnis begrenzt' : ''}`, 'success');
  } catch (error) { setStatus(error.message, 'error'); }
}

function clearSearch() {
  filesUi.search.value = ''; filesState.search = ''; filesState.searching = false; refreshFiles();
}

async function createFolder() {
  if (!filesState.capabilities.write) return;
  const name = (window.prompt('Name des neuen Ordners:', 'Neuer Ordner') || '').trim();
  if (!name) return;
  await mutation('Ordner wird erstellt …', () => filesApi('/api/files/folder', { method: 'POST', body: { path: filesState.currentPath, name } }));
}

async function createFile() {
  if (!filesState.capabilities.write) return;
  const name = (window.prompt('Name der neuen Datei:', 'notiz.txt') || '').trim();
  if (!name) return;
  await mutation('Datei wird erstellt …', () => filesApi('/api/files/new-file', { method: 'POST', body: { path: filesState.currentPath, name } }));
}

async function renameSelected() {
  const item = selectedItems()[0]; if (!item || !filesState.capabilities.write) return;
  const name = (window.prompt('Neuer Name:', item.name) || '').trim();
  if (!name || name === item.name) return;
  await mutation('Eintrag wird umbenannt …', () => filesApi('/api/files/rename', { method: 'POST', body: { path: item.path, name } }));
}

async function copySelected() {
  const item = selectedItems()[0]; if (!item || !filesState.capabilities.write) return;
  const destination = (window.prompt('Zielordner für die Kopie:', filesState.currentPath) || '').trim();
  if (!destination) return;
  await mutation('Eintrag wird kopiert …', () => filesApi('/api/files/copy', { method: 'POST', body: { source: item.path, destination } }));
}

async function moveSelected() {
  const item = selectedItems()[0]; if (!item || !filesState.capabilities.write) return;
  const destination = (window.prompt('Zielordner:', filesState.currentPath) || '').trim();
  if (!destination) return;
  await mutation('Eintrag wird verschoben …', () => filesApi('/api/files/move', { method: 'POST', body: { source: item.path, destination } }));
}

async function deleteSelected() {
  const items = selectedItems(); if (!items.length || !filesState.capabilities.write) return;
  const label = items.length === 1 ? `„${items[0].name}“` : `${items.length} Einträge`;
  if (!window.confirm(`${label} wirklich dauerhaft löschen?\n\nDieser Vorgang nutzt nicht den Windows-Papierkorb.`)) return;
  setStatus('Einträge werden gelöscht …');
  try {
    for (const item of items) await filesApi('/api/files/item', { method: 'DELETE', params: { path: item.path } });
    setStatus('Gelöscht.', 'success'); await refreshFiles();
  } catch (error) { setStatus(error.message, 'error'); }
}

function downloadSelected() {
  const item = selectedItems()[0]; if (!item || item.type !== 'file') return;
  const anchor = document.createElement('a');
  anchor.href = filesApiUrl('/api/files/content', { path: item.path, download: 1 }).toString();
  anchor.download = item.name; anchor.rel = 'noopener'; document.body.append(anchor); anchor.click(); anchor.remove();
}

function toggleFavoriteSelected() {
  const item = selectedItems()[0]; if (!item || item.type !== 'directory') return;
  const existing = filesState.favorites.findIndex((favorite) => favorite.path === item.path);
  if (existing >= 0) filesState.favorites.splice(existing, 1);
  else filesState.favorites.push({ label: item.name, path: item.path });
  saveFavorites(); renderRoots();
}

function toggleHidden() {
  filesState.showHidden = !filesState.showHidden; savePrefs(); refreshFiles();
}

function toggleView() {
  filesState.view = filesState.view === 'list' ? 'grid' : 'list'; savePrefs(); renderItems();
}

async function mutation(message, action) {
  setStatus(message);
  try { await action(); setStatus('Fertig.', 'success'); await refreshFiles(); }
  catch (error) { setStatus(error.message, 'error'); }
}

async function uploadFiles(files) {
  filesUi.fileInput.value = '';
  if (!files.length || !filesState.capabilities.write) return;
  let completed = 0;
  for (const file of files) {
    setStatus(`Upload ${completed + 1}/${files.length}: ${file.name}`);
    try {
      await filesApi('/api/files/upload', { method: 'POST', params: { path: filesState.currentPath, name: file.name }, rawBody: file, headers: { 'Content-Type': 'application/octet-stream' } });
      completed += 1;
    } catch (error) {
      if (/existiert bereits/i.test(error.message) && window.confirm(`${file.name} existiert bereits. Überschreiben?`)) {
        await filesApi('/api/files/upload', { method: 'POST', params: { path: filesState.currentPath, name: file.name, overwrite: 1 }, rawBody: file, headers: { 'Content-Type': 'application/octet-stream' } });
        completed += 1;
      } else setStatus(`${file.name}: ${error.message}`, 'error');
    }
  }
  if (completed) { setStatus(`${completed} Datei${completed === 1 ? '' : 'en'} hochgeladen.`, 'success'); await refreshFiles(); }
}

let dragDepth = 0;
function dragEnter(event) { if (!filesState.capabilities.write) return; event.preventDefault(); dragDepth += 1; filesUi.drop.hidden = false; }
function dragOver(event) { if (!filesState.capabilities.write) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
function dragLeave(event) { if (!filesState.capabilities.write) return; event.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) filesUi.drop.hidden = true; }
function dropFiles(event) { if (!filesState.capabilities.write) return; event.preventDefault(); dragDepth = 0; filesUi.drop.hidden = true; uploadFiles([...event.dataTransfer.files]); }

function fileKeyboard(event) {
  const items = sortedItems();
  if (!items.length) return;
  const current = selectedItems()[0];
  let index = current ? items.findIndex((item) => item.path === current.path) : -1;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); index = event.key === 'ArrowDown' ? Math.min(items.length - 1, index + 1) : Math.max(0, index <= 0 ? 0 : index - 1);
    selectItem(items[index], index, {}); filesUi.list.querySelector(`[data-path="${cssEscape(items[index].path)}"]`)?.scrollIntoView({ block: 'nearest' });
  } else if (event.key === 'Enter' && current) { event.preventDefault(); openItem(current); }
}

function globalFileKeyboard(event) {
  if (!filesUi.overlay || filesUi.overlay.hidden) return;
  if (event.key === 'Escape') { event.preventDefault(); closeFileBrowser(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); filesUi.search.focus(); filesUi.search.select(); return; }
  if (event.altKey && event.key === 'ArrowLeft') { event.preventDefault(); historyBack(); return; }
  if (event.altKey && event.key === 'ArrowRight') { event.preventDefault(); historyForward(); return; }
  if (event.key === 'F2') { event.preventDefault(); renameSelected(); return; }
  if (event.key === 'Delete') { event.preventDefault(); deleteSelected(); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && document.activeElement === filesUi.list) {
    event.preventDefault(); filesState.selected = new Set(filesState.items.map((item) => item.path)); renderItems(); renderPreview();
  }
}

function showContextMenu(event) {
  const row = event.target.closest('.fd-file-row'); if (!row) return;
  event.preventDefault();
  const item = filesState.items.find((candidate) => candidate.path === row.dataset.path); if (!item) return;
  if (!filesState.selected.has(item.path)) { filesState.selected.clear(); filesState.selected.add(item.path); renderItems(); renderPreview(); }
  document.querySelector('.fd-files-context')?.remove();
  const menu = filesEl('div', { class: 'fd-files-context' });
  const action = (label, iconName, handler, disabled = false) => {
    const button = filesEl('button', { type: 'button', disabled, html: `${filesIcon(iconName)}<span>${label}</span>` });
    button.addEventListener('click', () => { menu.remove(); handler(); }); menu.append(button);
  };
  action(item.type === 'directory' ? 'Öffnen' : 'Vorschau', item.type === 'directory' ? 'folder' : 'eye', () => openItem(item));
  if (item.type === 'file') action('Download', 'download', downloadSelected);
  action('Favorit', 'star', toggleFavoriteSelected, item.type !== 'directory');
  menu.append(filesEl('hr'));
  action('Umbenennen', 'rename', renameSelected, !filesState.capabilities.write);
  action('Kopieren nach …', 'copy', copySelected, !filesState.capabilities.write);
  action('Verschieben nach …', 'move', moveSelected, !filesState.capabilities.write);
  action('Löschen', 'trash', deleteSelected, !filesState.capabilities.write);
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - 210)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - 280)}px`;
  document.body.append(menu);
  const close = (closeEvent) => { if (!menu.contains(closeEvent.target)) { menu.remove(); document.removeEventListener('pointerdown', close, true); } };
  setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
function escapeAttr(value) { return escapeHtml(value).replaceAll('`', '&#096;'); }
function cssEscape(value) { return window.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&'); }

window.addEventListener('flightdeck:modulechange', () => {
  if (filesUi.overlay && !filesUi.overlay.hidden) closeFileBrowser();
  setTimeout(installRailButton, 0);
});
window.addEventListener('flightdeck:documents-open', () => { if (filesUi.overlay && !filesUi.overlay.hidden) closeFileBrowser(); });

loadPrefs();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { buildWorkspace(); installLauncher(); }, { once: true });
else { buildWorkspace(); installLauncher(); }

window.flightDeckFiles = { open: openFileBrowser, close: closeFileBrowser, refresh: refreshFiles };
