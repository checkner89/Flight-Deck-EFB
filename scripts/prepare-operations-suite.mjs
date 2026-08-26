import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('public/index.html', (source) => {
  let html = source;
  html = html.replace(/\s*<link[^>]+operations-suite\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace(/\s*<script[^>]+operations-suite\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace(/\s*<link[^>]+pilot-tools\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace(/\s*<script[^>]+pilot-tools\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace(/<h3\s+data-i18n="scratchpad">Scratchpad<\/h3>/g, '<h3 data-i18n="flightNotes">Flight Notes</h3>');
  const css = `<link rel="stylesheet" data-pilot-tools-style href="/pilot-tools.css?v=${version}">`;
  const script = `<script type="module" data-pilot-tools src="/pilot-tools.js?v=${version}"></script>`;
  html = html.replace('</head>', `    ${css}\n  </head>`);
  html = html.replace('</body>', `    ${script}\n  </body>`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source;
  sw = sw.replace(/^\s*['"]\/operations-suite\.(?:js|css)\?v=[^'"\s,]+['"],?\s*$/gm, '');
  sw = sw.replace(/^\s*['"]\/pilot-tools\.(?:js|css)\?v=[^'"\s,]+['"],?\s*$/gm, '');
  const anchor = `  '/manifest.webmanifest',`;
  const entries = `  '/pilot-tools.js?v=${version}',\n  '/pilot-tools.css?v=${version}',\n`;
  if (sw.includes(anchor)) sw = sw.replace(anchor, `${entries}${anchor}`);
  return sw.replace(/\n{3,}/g, '\n\n');
});

console.log(`Prepared deduplicated pilot tools for ${version}.`);
