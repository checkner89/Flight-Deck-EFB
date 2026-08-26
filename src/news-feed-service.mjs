import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const DEFAULT_INSTALLED = ['fselite', 'cruiselevel', 'msfsaddons', 'threshold', 'flightsimto', 'fsnews'];
const REFRESH_MS = 10 * 60_000;
const CACHE_MS = 4 * 60_000;
const ARTICLE_CACHE_MS = 20 * 60_000;

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
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
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

function imageFromTag(node, base) {
  const source = /\b(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i.exec(node)?.[1]
    || /\bsrcset=["']([^"',\s]+)[^"']*["']/i.exec(node)?.[1];
  return safeUrl(source, base);
}

function extractContentBlocks(rawHtml, base) {
  const clean = decode(rawHtml)
    .replace(/<(script|style|noscript|iframe|form|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ');
  const blocks = [];
  const seen = new Set();
  const pattern = /<(h[1-4]|p|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*>/gi;
  for (const match of clean.matchAll(pattern)) {
    if (blocks.length >= 140) break;
    const whole = match[0];
    if (/^<img/i.test(whole)) {
      const url = imageFromTag(whole, base);
      if (!url || seen.has(`img:${url}`)) continue;
      seen.add(`img:${url}`);
      const alt = stripHtml(/\balt=["']([^"']*)["']/i.exec(whole)?.[1] || '');
      blocks.push({ type: 'image', url, alt });
      continue;
    }
    const tagName = String(match[1] || '').toLowerCase();
    for (const imageNode of String(match[2] || '').matchAll(/<img\b[^>]*>/gi)) {
      const url = imageFromTag(imageNode[0], base);
      if (url && !seen.has(`img:${url}`)) {
        seen.add(`img:${url}`);
        blocks.push({ type: 'image', url, alt: stripHtml(/\balt=["']([^"']*)["']/i.exec(imageNode[0])?.[1] || '') });
      }
    }
    const value = stripHtml(match[2]);
    if (!value || value.length < 3) continue;
    const key = `txt:${value.slice(0, 240)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const type = tagName.startsWith('h') ? 'heading' : tagName === 'blockquote' ? 'quote' : tagName === 'li' ? 'list' : 'paragraph';
    blocks.push({ type, text: value.slice(0, 5000) });
  }
  return blocks;
}

function firstImage(blocks = []) {
  return blocks.find((entry) => entry.type === 'image' && entry.url)?.url || '';
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
    const rawContent = tag(block, ['content:encoded', 'content', 'description', 'summary']);
    const fullContent = stripHtml(rawContent).slice(0, 40_000);
    const descriptionRaw = tag(block, ['description', 'summary']) || rawContent;
    const description = stripHtml(descriptionRaw).slice(0, 420);
    const contentBlocks = extractContentBlocks(rawContent, source.site);
    const image = safeUrl(/<(?:media:thumbnail|media:content)\b[^>]*url=["']([^"']+)["']/i.exec(block)?.[1]
      || /<enclosure\b[^>]*url=["']([^"']+)["'][^>]*type=["']image\//i.exec(block)?.[1], source.site)
      || firstImage(contentBlocks);
    items.push({
      id: itemId(source.id, link, guid, title, publishedAt), sourceId: source.id, sourceName: source.name,
      title, link, publishedAt, description, content: fullContent, contentBlocks, image, feedUrl,
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
      headers: {
        'User-Agent': 'Flight-Deck-EFB/1.20.2 (+flight-simulation-news-reader)',
        Accept: 'text/html, application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.2',
      },
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

function sourceAllowsArticle(source, link) {
  try {
    const articleHost = new URL(link).hostname.replace(/^www\./, '').toLowerCase();
    const sourceHost = new URL(source.site).hostname.replace(/^www\./, '').toLowerCase();
    return articleHost === sourceHost || articleHost.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${articleHost}`);
  } catch { return false; }
}

function metaContent(html, selector) {
  const pattern = selector === 'og:image'
    ? /<meta\b[^>]*(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>|<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["'][^>]*>/i
    : selector === 'author'
      ? /<meta\b[^>]*name=["']author["'][^>]*content=["']([^"']+)["'][^>]*>|<meta\b[^>]*content=["']([^"']+)["'][^>]*name=["']author["'][^>]*>/i
      : null;
  const match = pattern?.exec(String(html || ''));
  return match?.[1] || match?.[2] || '';
}

function articleRegion(html) {
  const value = String(html || '')
    .replace(/<(nav|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ');
  return /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(value)?.[1]
    || /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(value)?.[1]
    || /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(value)?.[1]
    || value;
}

function blockTextLength(blocks = []) {
  return blocks.reduce((sum, block) => sum + String(block.text || '').length, 0);
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
    this.articleCache = new Map();
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
    this.articleCache.clear();
    await this.#save();
    return this.catalog();
  }

  async install(id, installed = true) {
    if (!CURATED_NEWS_FEEDS.some((feed) => feed.id === id)) throw new Error('Unknown news feed.');
    const next = new Set(this.installed);
    if (installed) next.add(id); else next.delete(id);
    return this.setInstalled([...next]);
  }

  async article(id) {
    const key = String(id || '');
    const cached = this.articleCache.get(key);
    if (cached && Date.now() - cached.at < ARTICLE_CACHE_MS) return cached.value;
    const feed = await this.refresh({ force: false, notify: false });
    const item = feed.items.find((entry) => entry.id === key);
    if (!item) throw new Error('News article not found.');
    const source = CURATED_NEWS_FEEDS.find((entry) => entry.id === item.sourceId);
    let blocks = Array.isArray(item.contentBlocks) ? item.contentBlocks : [];
    let hero = item.image || firstImage(blocks);
    let author = '';
    let contentSource = 'feed';
    if (source && sourceAllowsArticle(source, item.link)) {
      try {
        const fetched = await fetchText(item.link, 15_000);
        const region = articleRegion(fetched.text);
        const extracted = extractContentBlocks(region, fetched.url || item.link);
        if (blockTextLength(extracted) > Math.max(250, blockTextLength(blocks) * 1.08)) {
          blocks = extracted;
          contentSource = 'article';
        }
        hero = safeUrl(metaContent(fetched.text, 'og:image'), fetched.url || item.link) || hero || firstImage(extracted);
        author = stripHtml(metaContent(fetched.text, 'author')).slice(0, 160);
      } catch { /* fall back to feed content */ }
    }
    const value = { ...item, sourceSite: source?.site || '', sourceLanguage: source?.language || '', contentBlocks: blocks, image: hero, author, contentSource };
    this.articleCache.set(key, { at: Date.now(), value });
    return value;
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
    this.cache = {
      installed: [...this.installed],
      sources: results.map(({ source, status, error }) => ({ id: source.id, name: source.name, language: source.language, site: source.site, feedUrl: source.feedUrl || null, status, error })),
      items,
      updatedAt: this.now().toISOString(),
    };
    this.cacheAt = Date.now();
    if (this.notificationsEnabled && newItems.length && typeof this.onNewItems === 'function') {
      try { await this.onNewItems(newItems.slice(0, 8)); } catch {}
    }
    return { ...this.cache, notificationsEnabled: this.notificationsEnabled };
  }
}
