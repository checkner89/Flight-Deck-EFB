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
  const css = `<link rel="stylesheet" data-operations-suite-style href="/operations-suite.css?v=${version}">`;
  const script = `<script type="module" data-operations-suite src="/operations-suite.js?v=${version}"></script>`;
  if (/operations-suite\.css\?v=/.test(html)) html = html.replace(/<link[^>]+operations-suite\.css\?v=[^>]+>/, css);
  else html = html.replace('</head>', `    ${css}\n  </head>`);
  if (/operations-suite\.js\?v=/.test(html)) html = html.replace(/<script[^>]+operations-suite\.js\?v=[^>]+><\/script>/, script);
  else html = html.replace('</body>', `    ${script}\n  </body>`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source;
  sw = sw.replace(/\/operations-suite\.js\?v=[^'"\s,]+/g, `/operations-suite.js?v=${version}`);
  sw = sw.replace(/\/operations-suite\.css\?v=[^'"\s,]+/g, `/operations-suite.css?v=${version}`);
  if (!sw.includes(`/operations-suite.js?v=${version}`)) {
    const anchor = `  '/flight-phases.js?v=${version}',`;
    if (sw.includes(anchor)) {
      sw = sw.replace(anchor, `${anchor}\n  '/operations-suite.js?v=${version}',\n  '/operations-suite.css?v=${version}',`);
    } else {
      sw = sw.replace(`  '/manifest.webmanifest',`, `  '/operations-suite.js?v=${version}',\n  '/operations-suite.css?v=${version}',\n  '/manifest.webmanifest',`);
    }
  }
  return sw;
});

console.log(`Prepared operations suite assets for ${version}.`);
