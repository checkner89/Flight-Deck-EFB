import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const DEFAULT_INSTALLED = ['fselite', 'cruiselevel', 'msfsaddons', 'threshold', 'flightsimto', 'fsnews'];
const REFRESH_MS = 10 * 60_000;
const CACHE_MS = 4 * 60_000;

export const CURATED_NEWS_FEEDS = [
  { id: 'fselite', name: 'FSElite', language: 'en', site: 'https://fselite.net/', feeds: ['https://fselite.net/feed/'] },
  { id: 'cruiselevel', name: 'cruiselevel', language: 'de', site: 'https://cruiselevel.de/', feeds: ['https://cruiselevel.de/feed/'] },
  { id: 'msfsaddons', name: 'MSFS Addons', language: 'en', site: 'https://msfsaddons.com/', feeds: ['https://msfsaddons.com/feed/'] },
  { id: 'threshold', name: 'Threshold', language: 'en', site: 'https://www.thresholdx.net/news', feeds: ['https://www.thresholdx.net/news/rss.xml'] },
  { id: 'flightsimto', name: 'Flightsim.to News', language: 'en', site: 'https://flightsim.to/news', feeds: ['https://flightsim.to/rss/news'] },
  { id: 'fsnews', name: 'FSNews', language: 'en', site: 'https://fsnews.eu/', feeds: ['https://fsnews.eu/feed/'] },
  { id: 'flightsimcom', name: 'FlightSim.com', language: 'en', site: 'https://www.flightsim.com/', feeds: ['https://www.flightsim.com/feed/'] },
  { id: 'simflightde', name: 'simFlight.de', language: 'de', site: 'https://www.simflight.de/', feeds: ['https://www.simflight.de/feed/'] },
  { id: 'xplane', name: 'X-Plane Developer Blog', language: 'en', site: 'https://developer.x-plane.com/', feeds: ['https://developer.x-plane.com/feed/'] },
  { id: 'navigraph', name: 'Navigraph Blog', language: 'en', site: 'https://navigraph.com/blog', feeds: [] },
  { id: 'fenix', name: 'Fenix Simulations', language: 'en', site: 'https://fenixsim.com/blog/', feeds: [] },
  { id: 'inibuilds', name: 'iniBuilds', language: 'en', site: 'https://inibuilds.com/blogs/news', feeds: ['https://inibuilds.com/blogs/news.atom'] },
  { id: 'orbx', name: 'Orbx', language: 'en', site: 'https://orbxdirect.com/blog', feeds: [] },
  { id: 'justflight', name: 'Just Flight', language: 'en', site: 'https://www.justflight.com/articles', feeds: [] },
  { id: 'aerosoft', name: 'Aerosoft', language: 'de/en', site: 'https://aerosoft.com/en/blog/', feeds: [] },
  { id: 'parallel42', name: 'Parallel 42', language: 'en', site: 'https://parallel42.com/blogs/news', feeds: ['https://parallel42.com/blogs/news.atom'] },
  { id: 'helisimmer', name: 'HeliSimmer.com', language: 'en', site: 'https://www.helisimmer.com/', feeds: ['https://www.helisimmer.com/feed'] },
  { id: 'dcs', name: 'DCS World News', language: 'en', site: 'https://www.digitalcombatsimulator.com/en/news/', feeds: ['https://www.digitalcombatsimulator.com/en/news/rss/'] },
  { id: 'infiniteflight', name: 'Infinite Flight Blog', language: 'en', site: 'https://infiniteflight.com/blog', feeds: [] },
  { id: 'aerofly', name: 'Aerofly FS Blog', language: 'en', site: 'https://www.aerofly.com/community/blog/', feeds: [] },
];

function decode(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function stripHtml(value) {
  return decode(value).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function tag(block, names) {
  for (const name of names) {
    const pattern = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
    const found = pattern.exec(block)?.[1];
    if (found) return decode(found).trim();
  }
  return '';
}

function linkFrom(block) {
  const rss = tag(block, ['link']);
  if (/^https?:\/\//i.test(stripHtml(rss))) return stripHtml(rss);
  const atom = /<link\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(block)?.[1];
  return atom || '';
}

function safeUrl(value, base) {
  try {
    const url = new URL(String(value || ''), base);
    return /^https?:$/.test(url.protocol) ? url.toString() : '';
  } catch { return ''; }
}

function itemId(sourceId, link, guid, title, publishedAt) {
  return crypto.createHash('sha1').update(`${sourceId}|${guid}|${link}|${title}|${publishedAt}`).digest('hex').slice(0, 20);
}

function parseFeedXml(xml, source, feedUrl) {
  const blocks = [...String(xml || '').matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  const items = [];
  for (const block of blocks.slice(0, 40)) {
    const title = stripHtml(tag(block, ['title']));
    const link = safeUrl(linkFrom(block), source.site);
    if (!title || !link) continue;
    const guid = stripHtml(tag(block, ['guid', 'id']));
    const dateValue = stripHtml(tag(block, ['pubDate', 'published', 'updated', 'dc:date']));
    const parsedDate = Date.parse(dateValue);
    const publishedAt = Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null;
    const description = stripHtml(tag(block, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 320);
    const image = safeUrl(/<(?:media:thumbnail|media:content)\b[^>]*url=["']([^"']+)["']/i.exec(block)?.[1]
      || /<enclosure\b[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i.exec(block)?.[1], source.site);
    items.push({
      id: itemId(source.id, link, guid, title, publishedAt), sourceId: source.id, sourceName: source.name,
      title, link, publishedAt, description, image, feedUrl,
    });
  }
  return items;
}

function feedLinksFromHtml(html, site) {
  const links = [];
  for (const match of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const node = match[0];
    if (!/rel=["'][^"']*alternate/i.test(node) || !/type=["']application\/(?:rss|atom)\+xml/i.test(node)) continue;
    const href = /href=["']([^"']+)["']/i.exec(node)?.[1];
    const url = safeUrl(href, site);
    if (url) links.push(url);
  }
  return [...new Set(links)];
}

async function fetchText(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Flight-Deck-EFB/1.20 (+flight-simulation-news-reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.7, */*;q=0.2' },
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return { text: await response.text(), contentType: response.headers.get('content-type') || '', url: response.url };
  } finally { clearTimeout(timer); }
}

async function resolveFeed(source) {
  const candidates = [...source.feeds];
  try {
    const home = await fetchText(source.site);
    candidates.push(...feedLinksFromHtml(home.text, home.url || source.site));
  } catch {}
  const base = new URL(source.site);
  candidates.push(new URL('/feed/', base).toString(), new URL('/rss/', base).toString(), new URL('/rss.xml', base).toString(), new URL('/feed.xml', base).toString());
  const unique = [...new Set(candidates)];
  let lastError = null;
  for (const candidate of unique) {
    try {
      const result = await fetchText(candidate);
      const items = parseFeedXml(result.text, source, result.url || candidate);
      if (items.length) return { url: result.url || candidate, items };
    } catch (error) { lastError = error; }
  }
  throw new Error(lastError?.message || 'No RSS/Atom feed found.');
}

export class NewsFeedService {
  constructor({ storageDirectory, onNewItems = null, now = () => new Date() } = {}) {
    this.storageDirectory = storageDirectory || path.join(os.homedir(), '.flight-deck-efb', 'news');
    this.stateFile = path.join(this.storageDirectory, 'state.json');
    this.onNewItems = onNewItems;
    this.now = now;
    this.installed = [...DEFAULT_INSTALLED];
    this.notificationsEnabled = true;
    this.knownIds = {};
    this.cache = null;
    this.cacheAt = 0;
    this.timer = null;
  }

  async start() {
    try {
      const saved = JSON.parse(await fs.readFile(this.stateFile, 'utf8'));
      if (Array.isArray(saved?.installed)) this.installed = saved.installed.filter((id) => CURATED_NEWS_FEEDS.some((feed) => feed.id === id));
      if (typeof saved?.notificationsEnabled === 'boolean') this.notificationsEnabled = saved.notificationsEnabled;
      if (saved?.knownIds && typeof saved.knownIds === 'object') this.knownIds = saved.knownIds;
    } catch {}
    this.timer = setInterval(() => this.refresh({ notify: true }).catch(() => {}), REFRESH_MS);
    this.timer.unref?.();
  }

  async stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  catalog() {
    return CURATED_NEWS_FEEDS.map((feed) => ({ ...feed, installed: this.installed.includes(feed.id) }));
  }

  preferences() { return { notificationsEnabled: this.notificationsEnabled }; }

  async #save() {
    await fs.mkdir(this.storageDirectory, { recursive: true });
    await fs.writeFile(this.stateFile, `${JSON.stringify({ installed: this.installed, notificationsEnabled: this.notificationsEnabled, knownIds: this.knownIds }, null, 2)}\n`, 'utf8');
  }

  async setNotifications(enabled) {
    this.notificationsEnabled = Boolean(enabled);
    await this.#save();
    return this.preferences();
  }

  async setInstalled(ids) {
    this.installed = [...new Set((ids || []).filter((id) => CURATED_NEWS_FEEDS.some((feed) => feed.id === id)))];
    this.cache = null;
    await this.#save();
    return this.catalog();
  }

  async install(id, installed = true) {
    if (!CURATED_NEWS_FEEDS.some((feed) => feed.id === id)) throw new Error('Unknown news feed.');
    const next = new Set(this.installed);
    if (installed) next.add(id); else next.delete(id);
    return this.setInstalled([...next]);
  }

  async refresh({ force = false, notify = false } = {}) {
    if (!force && this.cache && Date.now() - this.cacheAt < CACHE_MS) return { ...this.cache, notificationsEnabled: this.notificationsEnabled };
    const sources = CURATED_NEWS_FEEDS.filter((feed) => this.installed.includes(feed.id));
    const results = await Promise.all(sources.map(async (source) => {
      try {
        const resolved = await resolveFeed(source);
        return { source: { ...source, feedUrl: resolved.url }, status: 'ok', items: resolved.items, error: null };
      } catch (error) {
        return { source, status: 'error', items: [], error: error.message };
      }
    }));
    const items = results.flatMap((entry) => entry.items).sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0)).slice(0, 200);
    const newItems = [];
    for (const result of results) {
      const currentIds = result.items.map((item) => item.id);
      const previous = new Set(this.knownIds[result.source.id] || []);
      if (notify && previous.size) newItems.push(...result.items.filter((item) => !previous.has(item.id)).slice(0, 6));
      this.knownIds[result.source.id] = currentIds.slice(0, 80);
    }
    await this.#save().catch(() => {});
    this.cache = { installed: [...this.installed], sources: results.map(({ source, status, error }) => ({ id: source.id, name: source.name, language: source.language, site: source.site, feedUrl: source.feedUrl || null, status, error })), items, updatedAt: this.now().toISOString() };
    this.cacheAt = Date.now();
    if (this.notificationsEnabled && newItems.length && typeof this.onNewItems === 'function') {
      try { await this.onNewItems(newItems.slice(0, 8)); } catch {}
    }
    return { ...this.cache, notificationsEnabled: this.notificationsEnabled };
  }
}
