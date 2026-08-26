let shell = null;
let data = { items: [], sources: [], installed: [], notificationsEnabled: true };
let catalog = [];
let lang = 'all';
let source = 'all';
let unreadOnly = false;
let timer = null;
let frame = 0;
let selectedArticleId = null;
let selectedArticle = null;
let articleLoading = false;

const SEEN = 'flight-deck-news-seen-v1';

function auth(path) {
  const url = new URL(path, location.origin);
  const token = localStorage.getItem('si-taxi-token') || new URL(location.href).searchParams.get('token') || '';
  if (token) url.searchParams.set('token', token);
  return url.toString();
}

async function api(path, options = {}) {
  const response = await fetch(auth(path), options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `${response.status} ${response.statusText}`);
  return body;
}

function e(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function de() {
  return String(document.documentElement.lang || '').toLowerCase().startsWith('de');
}

function copy() {
  return de() ? {
    title: 'News', sub: 'Flight-Sim News an einem Ort', apps: 'APPS', refresh: 'AKTUALISIEREN', manage: 'FEEDS',
    all: 'ALLE', german: 'DEUTSCH', english: 'ENGLISH', unread: 'UNGelesen', library: 'Newsfeeds installieren',
    hint: '20 kuratierte Flight-Sim-Quellen. Feeds können einzeln installiert und Benachrichtigungen aktiviert werden.',
    install: 'INSTALLIEREN', remove: 'ENTFERNEN', unavailable: 'RSS NICHT ERREICHBAR', notify: 'NEWS-BENACHRICHTIGUNGEN',
    on: 'AN', off: 'AUS', read: 'LESEN', empty: 'Keine Artikel für diesen Filter.', new: 'NEU', back: 'ZURÜCK',
    original: 'ORIGINAL ÖFFNEN', loading: 'Artikel wird geladen …', feedNote: 'Diese Quelle stellt im Feed nur einen gekürzten Inhalt bereit. Für den vollständigen Originalbeitrag kannst du die Website öffnen.',
    articleNote: 'Reader-Ansicht aus dem öffentlich erreichbaren Artikel. Navigation, Werbung und Seitenelemente werden ausgeblendet.',
  } : {
    title: 'News', sub: 'Flight-sim news in one place', apps: 'APPS', refresh: 'REFRESH', manage: 'FEEDS',
    all: 'ALL', german: 'GERMAN', english: 'ENGLISH', unread: 'UNREAD', library: 'Install news feeds',
    hint: '20 curated flight-sim sources. Install feeds individually and enable notifications when desired.',
    install: 'INSTALL', remove: 'REMOVE', unavailable: 'RSS UNAVAILABLE', notify: 'NEWS NOTIFICATIONS',
    on: 'ON', off: 'OFF', read: 'READ', empty: 'No articles match this filter.', new: 'NEW', back: 'BACK',
    original: 'OPEN ORIGINAL', loading: 'Loading article …', feedNote: 'This source only exposes a shortened feed item. Open the publisher website for the complete original article.',
    articleNote: 'Reader view extracted from the publicly available article. Navigation, ads and page chrome are omitted.',
  };
}

function seenSet() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN) || '[]')); } catch { return new Set(); }
}

function saveSeen(value) {
  try { localStorage.setItem(SEEN, JSON.stringify([...value].slice(-1000))); } catch {}
}

function relativeDate(value) {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return '';
  const seconds = Math.max(0, (Date.now() - parsed) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))} min`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h`;
  return `${Math.floor(seconds / 86400)} d`;
}

function dateLabel(value) {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return '';
  try {
    return new Intl.DateTimeFormat(de() ? 'de-DE' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(parsed));
  } catch { return ''; }
}

function tileIcon() {
  return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 10h25v28H9zM34 16h5v22H14M15 17h13M15 23h13M15 29h8"/></svg>';
}

function unreadCount() {
  const seen = seenSet();
  return (data.items || []).filter((item) => !seen.has(item.id)).length;
}

function sourceInfo(sourceId) {
  return catalog.find((entry) => entry.id === sourceId)
    || data.sources?.find((entry) => entry.id === sourceId)
    || null;
}

function faviconUrl(sourceEntry) {
  try { return new URL('/favicon.ico', sourceEntry?.site || location.origin).toString(); } catch { return ''; }
}

function logoMarkup(sourceEntry, fallbackName, className = 'news-source-logo') {
  const letters = String(fallbackName || 'N').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'N';
  const icon = faviconUrl(sourceEntry);
  return `<span class="${className}"><b>${e(letters)}</b>${icon ? `<img src="${e(icon)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-news-logo>` : ''}</span>`;
}

function tile() {
  const grid = document.querySelector('.app-launcher-grid');
  if (!grid) return;
  let button = grid.querySelector('[data-news-app-tile]');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'efb-app-tile news-app-tile';
    button.dataset.newsAppTile = 'true';
    button.style.order = '56';
    button.addEventListener('click', open);
    grid.append(button);
  }
  const dictionary = copy();
  const unread = unreadCount();
  const signature = `${dictionary.title}|${unread}|${de()}`;
  if (button.dataset.newsSignature === signature) return;
  button.dataset.newsSignature = signature;
  button.innerHTML = `<span class="app-tile-icon">${tileIcon()}</span><span class="app-tile-copy"><small>FLIGHT SIM COMMUNITY</small><strong>${dictionary.title}</strong><span>${de() ? 'Feeds, Artikel und Neuigkeiten' : 'Feeds, articles and updates'}</span></span><i class="app-open-arrow">›</i>${unread ? `<b class="news-tile-badge">${unread > 99 ? '99+' : unread}</b>` : ''}`;
}

function visibleItems() {
  const seen = seenSet();
  return (data.items || []).filter((item) => {
    const feed = sourceInfo(item.sourceId);
    const language = String(feed?.language || '').toLowerCase();
    if (lang !== 'all' && !language.includes(lang)) return false;
    if (source !== 'all' && source !== item.sourceId) return false;
    if (unreadOnly && seen.has(item.id)) return false;
    return true;
  });
}

function newsCard(item, seen) {
  const dictionary = copy();
  const feed = sourceInfo(item.sourceId);
  return `<article class="news-card ${seen ? '' : 'unread'} ${item.image ? 'has-image' : ''}" data-news-open="${e(item.id)}" tabindex="0">
    ${item.image ? `<img class="news-card-image" src="${e(item.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
    <div class="news-card-content">
      <div class="news-card-source">${logoMarkup(feed, item.sourceName)}<div><strong>${e(item.sourceName)}</strong><span>${e(relativeDate(item.publishedAt))}</span></div>${seen ? '' : `<b>${dictionary.new}</b>`}</div>
      <h2>${e(item.title)}</h2>
      <p>${e(item.description || '')}</p>
      <button class="news-read" type="button" data-news-open="${e(item.id)}">${dictionary.read} <span>›</span></button>
    </div>
  </article>`;
}

function libraryMarkup() {
  const dictionary = copy();
  const status = new Map((data.sources || []).map((entry) => [entry.id, entry]));
  return `<aside class="news-drawer" data-news-drawer hidden><header><div><small>NEWS FEEDS</small><h2>${dictionary.library}</h2><p>${dictionary.hint}</p></div><button data-news-drawer-close aria-label="Close">×</button></header><div class="news-notify"><div><strong>${dictionary.notify}</strong><small>${de() ? 'Neue Artikel als Windows-Benachrichtigung' : 'New articles as Windows notifications'}</small></div><button data-news-notify class="${data.notificationsEnabled ? 'active' : ''}">${data.notificationsEnabled ? dictionary.on : dictionary.off}</button></div><div class="news-library">${catalog.map((feed) => {
    const installed = data.installed?.includes(feed.id);
    const unavailable = installed && status.get(feed.id)?.status === 'error';
    return `<article>${logoMarkup(feed, feed.name, 'news-library-logo')}<div><strong>${e(feed.name)}</strong><small>${e(feed.language.toUpperCase())} · ${e(new URL(feed.site).hostname.replace(/^www\./, ''))}</small>${unavailable ? `<em>${dictionary.unavailable}</em>` : ''}</div><button data-news-install="${e(feed.id)}" data-on="${installed ? '1' : '0'}">${installed ? dictionary.remove : dictionary.install}</button></article>`;
  }).join('')}</div></aside>`;
}

function renderBlock(block) {
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'image' && block.url) return `<figure class="news-reader-image"><img src="${e(block.url)}" alt="${e(block.alt || '')}" loading="lazy" referrerpolicy="no-referrer">${block.alt ? `<figcaption>${e(block.alt)}</figcaption>` : ''}</figure>`;
  if (!block.text) return '';
  if (block.type === 'heading') return `<h2>${e(block.text)}</h2>`;
  if (block.type === 'quote') return `<blockquote>${e(block.text)}</blockquote>`;
  if (block.type === 'list') return `<div class="news-reader-list-item"><i></i><span>${e(block.text)}</span></div>`;
  return `<p>${e(block.text)}</p>`;
}

function readerMarkup() {
  if (!selectedArticleId) return '';
  const dictionary = copy();
  const baseItem = (data.items || []).find((entry) => entry.id === selectedArticleId);
  const item = selectedArticle || baseItem;
  if (!item) return '';
  const feed = sourceInfo(item.sourceId);
  const blocks = Array.isArray(item.contentBlocks) && item.contentBlocks.length
    ? item.contentBlocks
    : [{ type: 'paragraph', text: item.content || item.description || '' }];
  return `<section class="news-reader" data-news-reader><header class="news-reader-toolbar"><button type="button" data-news-reader-close>‹ ${dictionary.back}</button><div class="news-reader-toolbar-title">${logoMarkup(feed, item.sourceName, 'news-reader-logo')}<div><small>${e(item.sourceName)}</small><strong>${e(item.title)}</strong></div></div><a href="${e(item.link)}" target="_blank" rel="noopener noreferrer">${dictionary.original} ↗</a></header><div class="news-reader-scroll"><article class="news-reader-article">
    ${articleLoading ? `<div class="news-reader-loading"><i></i><span>${dictionary.loading}</span></div>` : ''}
    ${item.image ? `<img class="news-reader-hero" src="${e(item.image)}" alt="" loading="eager" referrerpolicy="no-referrer">` : ''}
    <div class="news-reader-heading"><div class="news-reader-source">${logoMarkup(feed, item.sourceName, 'news-reader-logo large')}<div><b>${e(item.sourceName)}</b><span>${e(dateLabel(item.publishedAt))}${item.author ? ` · ${e(item.author)}` : ''}</span></div></div><h1>${e(item.title)}</h1></div>
    <div class="news-reader-body">${blocks.map(renderBlock).join('')}</div>
    <p class="news-reader-note">${item.contentSource === 'article' ? dictionary.articleNote : dictionary.feedNote}</p>
  </article></div></section>`;
}

function render() {
  if (!shell) return;
  const dictionary = copy();
  const seen = seenSet();
  const items = visibleItems();
  const installed = catalog.filter((feed) => data.installed?.includes(feed.id));
  shell.innerHTML = `<header class="news-toolbar"><button data-news-close>‹ <span>${dictionary.apps}</span></button><div><small>${dictionary.sub}</small><strong>${dictionary.title}</strong></div><nav><button data-news-manage>${dictionary.manage}</button><button data-news-refresh>↻ ${dictionary.refresh}</button></nav></header><main class="news-content"><div class="news-filterbar"><div class="news-filter-primary"><button data-news-lang="all" class="${lang === 'all' ? 'active' : ''}">${dictionary.all}</button><button data-news-lang="de" class="${lang === 'de' ? 'active' : ''}">${dictionary.german}</button><button data-news-lang="en" class="${lang === 'en' ? 'active' : ''}">${dictionary.english}</button><button data-news-unread class="${unreadOnly ? 'active' : ''}">${dictionary.unread}${unreadCount() ? ` · ${unreadCount()}` : ''}</button></div><div class="news-filter-sources"><button data-news-source="all" class="${source === 'all' ? 'active' : ''}">${dictionary.all}</button>${installed.map((feed) => `<button data-news-source="${e(feed.id)}" class="${source === feed.id ? 'active' : ''}">${e(feed.name)}</button>`).join('')}</div></div><section class="news-stream">${items.length ? items.map((item) => newsCard(item, seen.has(item.id))).join('') : `<div class="news-empty">${dictionary.empty}</div>`}</section>${libraryMarkup()}${readerMarkup()}</main>`;
  wire();
}

function markOne(id) {
  const seen = seenSet();
  seen.add(id);
  saveSeen(seen);
  tile();
}

async function openArticle(id) {
  const base = (data.items || []).find((item) => item.id === id);
  if (!base) return;
  selectedArticleId = id;
  selectedArticle = base;
  articleLoading = true;
  markOne(id);
  render();
  try {
    selectedArticle = await api(`/api/news/article?id=${encodeURIComponent(id)}`);
  } catch {
    selectedArticle = base;
  } finally {
    articleLoading = false;
    render();
  }
}

function wireLogos() {
  shell.querySelectorAll('[data-news-logo]').forEach((image) => image.addEventListener('error', () => { image.hidden = true; }, { once: true }));
}

function wire() {
  wireLogos();
  shell.querySelector('[data-news-close]')?.addEventListener('click', close);
  shell.querySelector('[data-news-refresh]')?.addEventListener('click', () => load(true));
  shell.querySelector('[data-news-manage]')?.addEventListener('click', () => { shell.querySelector('[data-news-drawer]').hidden = false; });
  shell.querySelector('[data-news-drawer-close]')?.addEventListener('click', () => { shell.querySelector('[data-news-drawer]').hidden = true; });
  shell.querySelector('[data-news-reader-close]')?.addEventListener('click', () => { selectedArticleId = null; selectedArticle = null; articleLoading = false; render(); });
  shell.querySelectorAll('[data-news-lang]').forEach((button) => button.addEventListener('click', () => { lang = button.dataset.newsLang; render(); }));
  shell.querySelector('[data-news-unread]')?.addEventListener('click', () => { unreadOnly = !unreadOnly; render(); });
  shell.querySelectorAll('[data-news-source]').forEach((button) => button.addEventListener('click', () => { source = button.dataset.newsSource; render(); }));
  shell.querySelectorAll('[data-news-open]').forEach((node) => {
    node.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openArticle(node.dataset.newsOpen); });
    node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openArticle(node.dataset.newsOpen); } });
  });
  shell.querySelectorAll('[data-news-install]').forEach((button) => button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api('/api/news/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: button.dataset.newsInstall, installed: button.dataset.on !== '1' }) });
      await load(true);
    } catch {} finally { button.disabled = false; }
  }));
  shell.querySelector('[data-news-notify]')?.addEventListener('click', async () => {
    try {
      const result = await api('/api/news/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !data.notificationsEnabled }) });
      data.notificationsEnabled = !!result.notificationsEnabled;
      render();
    } catch {}
  });
}

async function load(force = false) {
  try {
    const [catalogResponse, feedResponse] = await Promise.all([api('/api/news/catalog'), api(`/api/news/feed${force ? '?refresh=1' : ''}`)]);
    catalog = catalogResponse.feeds || [];
    data = feedResponse;
    tile();
    if (selectedArticleId && !(data.items || []).some((item) => item.id === selectedArticleId)) {
      selectedArticleId = null;
      selectedArticle = null;
    }
    if (shell && !shell.hidden) render();
  } catch {}
}

function open() {
  if (!shell) {
    shell = document.createElement('section');
    shell.id = 'news-app-shell';
    shell.className = 'news-app-shell';
    document.body.append(shell);
  }
  selectedArticleId = null;
  selectedArticle = null;
  shell.hidden = false;
  document.documentElement.classList.add('news-app-open');
  render();
  load(false);
}

function close() {
  selectedArticleId = null;
  selectedArticle = null;
  if (shell) shell.hidden = true;
  document.documentElement.classList.remove('news-app-open');
}

function schedule() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; tile(); });
}

function start() {
  schedule();
  load(false);
  timer = setInterval(() => { if (!document.hidden) load(false); }, 5 * 60_000);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
