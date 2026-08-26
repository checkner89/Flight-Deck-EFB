import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.1');

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/news-feed-service.mjs', (source) => {
  if (source.includes('content: fullContent,')) return source;
  const from = "    const description = stripHtml(tag(block, ['description', 'summary', 'content:encoded', 'content'])).slice(0, 320);";
  if (!source.includes(from)) throw new Error('1.20.1 news content anchor missing.');
  const to = "    const fullContent = stripHtml(tag(block, ['content:encoded', 'content', 'description', 'summary'])).slice(0, 12000);\n    const description = fullContent.slice(0, 320);";
  return source.replace(from, to).replace('      title, link, publishedAt, description, image, feedUrl,', '      title, link, publishedAt, description, content: fullContent, image, feedUrl,');
});

await update('public/index.html', (source) => {
  let html = source.replace(/\s*<link[^>]+release-1\.20\.1\.css\?v=[^>]+>\s*/g, '\n');
  return html.replace('</head>', `    <link rel="stylesheet" href="/release-1.20.1.css?v=${version}">\n  </head>`);
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^\s*['\"]\/release-1\.20\.1\.css\?v=[^'\"\s,]+['\"],?\s*$/gm, '');
  const anchor = `  '/manifest.webmanifest',`;
  const entry = `  '/release-1.20.1.css?v=${version}',\n`;
  if (!sw.includes(`/release-1.20.1.css?v=${version}`)) {
    if (!sw.includes(anchor)) throw new Error('1.20.1 service worker anchor missing.');
    sw = sw.replace(anchor, `${entry}${anchor}`);
  }
  return sw.replace(/\n{3,}/g, '\n\n');
});

await update('CHANGELOG.md', (source) => {
  if (/^## 1\.20\.1\b/m.test(source)) return source;
  const notes = `## 1.20.1 — Unified UI & In-App News\n\n- Fixes unreadable dark-on-dark combinations in Scratchpad, Flight Setup and News by making all three modules explicitly theme-aware in both Light and Dark mode.\n- Aligns Scratchpad, Flight Setup and News with Flight Deck's established card, typography, spacing, button and status styling.\n- Keeps the Scratchpad writing surface bright and high-contrast while the surrounding controls follow the selected theme.\n- Adds a native in-app News reader; selecting a story opens feed-supplied article content inside Flight Deck instead of immediately leaving the app.\n- Keeps an Open Original action when a publisher exposes only a shortened RSS/Atom version.\n- Marks News as read when a story is actually opened instead of clearing unread state merely by entering the News app.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  return source.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${notes}`);
});

console.log(`Applied Flight Deck EFB ${version} theme + in-app News reader patch.`);
