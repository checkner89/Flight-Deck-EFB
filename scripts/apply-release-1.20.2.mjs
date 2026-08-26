import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.2');

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`1.20.2 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('src/server.mjs', (source) => {
  if (source.includes("pathname === '/api/news/article'")) return source;
  const anchor = "      if (pathname === '/api/news/subscriptions' && request.method === 'POST') {";
  const route = `      if (pathname === '/api/news/article' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        const id = requestUrl.searchParams.get('id');\n        if (!id) return json(response, 400, { error: 'Article id required.' });\n        try { return json(response, 200, await newsService.article(id)); }\n        catch (error) { return json(response, 404, { error: error.message }); }\n      }\n\n`;
  return replaceRequired(source, anchor, `${route}${anchor}`, 'enhanced news article route');
});

await update('public/index.html', (source) => {
  let html = source.replace(/\s*<link[^>]+release-1\.20\.2\.css\?v=[^>]+>\s*/g, '\n');
  return html.replace('</head>', `    <link rel="stylesheet" href="/release-1.20.2.css?v=${version}">\n  </head>`);
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^\s*['\"]\/release-1\.20\.2\.css\?v=[^'\"\s,]+['\"],?\s*$/gm, '');
  const anchor = `  '/manifest.webmanifest',`;
  const entry = `  '/release-1.20.2.css?v=${version}',\n`;
  if (!sw.includes(`/release-1.20.2.css?v=${version}`)) {
    if (!sw.includes(anchor)) throw new Error('1.20.2 service worker anchor missing.');
    sw = sw.replace(anchor, `${entry}${anchor}`);
  }
  return sw.replace(/\n{3,}/g, '\n\n');
});

console.log(`Applied Flight Deck EFB ${version} UI consolidation and enhanced News reader integration.`);
