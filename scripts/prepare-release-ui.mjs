import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const publicDir = path.join(root, 'public');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(packageJson.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid package version: ${version || '(empty)'}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateAssetVersion(source, asset, nextVersion = version) {
  const pattern = new RegExp(`(${escapeRegExp(asset)}\\?v=)[^"'\\s<>]+`, 'g');
  return source.replace(pattern, `$1${nextVersion}`);
}

async function updateFile(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await updateFile('public/index.html', (source) => {
  let html = source.replace(/data-app-version="[^"]+"/, `data-app-version="${version}"`);
  for (const asset of [
    '/styles.css',
    '/si-operations.css',
    '/app.js',
    '/si-operations.js',
    '/flight-overlay.js',
    '/flight-overlay.css',
    '/com-polish.js',
    '/com-polish.css',
    '/atc-polish.js',
    '/atc-polish.css',
    '/ground-polish.js',
    '/ground-polish.css',
  ]) html = updateAssetVersion(html, asset);

  const overlayCss = `<link rel="stylesheet" data-flight-overlay-style href="/flight-overlay.css?v=${version}">`;
  if (/flight-overlay\.css\?v=/.test(html)) {
    html = html.replace(/<link[^>]+flight-overlay\.css\?v=[^>]+>/, overlayCss);
  } else {
    html = html.replace('</head>', `    ${overlayCss}\n  </head>`);
  }

  const comCss = `<link rel="stylesheet" data-com-polish-style href="/com-polish.css?v=${version}">`;
  if (/com-polish\.css\?v=/.test(html)) {
    html = html.replace(/<link[^>]+com-polish\.css\?v=[^>]+>/, comCss);
  } else {
    html = html.replace('</head>', `    ${comCss}\n  </head>`);
  }

  const atcCss = `<link rel="stylesheet" data-atc-polish-style href="/atc-polish.css?v=${version}">`;
  if (/atc-polish\.css\?v=/.test(html)) {
    html = html.replace(/<link[^>]+atc-polish\.css\?v=[^>]+>/, atcCss);
  } else {
    html = html.replace('</head>', `    ${atcCss}\n  </head>`);
  }

  const groundCss = `<link rel="stylesheet" data-ground-polish-style href="/ground-polish.css?v=${version}">`;
  if (/ground-polish\.css\?v=/.test(html)) {
    html = html.replace(/<link[^>]+ground-polish\.css\?v=[^>]+>/, groundCss);
  } else {
    html = html.replace('</head>', `    ${groundCss}\n  </head>`);
  }

  const overlayScript = `<script type="module" src="/flight-overlay.js?v=${version}"></script>`;
  if (/flight-overlay\.js\?v=/.test(html)) {
    html = html.replace(/<script[^>]+flight-overlay\.js\?v=[^>]+><\/script>/, overlayScript);
  } else {
    html = html.replace(/(<script type="module" src="\/app\.js\?v=[^"]+"><\/script>)/, `    ${overlayScript}\n    $1`);
  }

  const comScript = `<script type="module" src="/com-polish.js?v=${version}"></script>`;
  if (/com-polish\.js\?v=/.test(html)) {
    html = html.replace(/<script[^>]+com-polish\.js\?v=[^>]+><\/script>/, comScript);
  } else {
    html = html.replace(/(<script type="module" src="\/app\.js\?v=[^"]+"><\/script>)/, `$1\n    ${comScript}`);
  }

  const atcScript = `<script type="module" src="/atc-polish.js?v=${version}"></script>`;
  if (/atc-polish\.js\?v=/.test(html)) {
    html = html.replace(/<script[^>]+atc-polish\.js\?v=[^>]+><\/script>/, atcScript);
  } else {
    html = html.replace('</body>', `    ${atcScript}\n  </body>`);
  }

  const groundScript = `<script type="module" src="/ground-polish.js?v=${version}"></script>`;
  if (/ground-polish\.js\?v=/.test(html)) {
    html = html.replace(/<script[^>]+ground-polish\.js\?v=[^>]+><\/script>/, groundScript);
  } else {
    html = html.replace('</body>', `    ${groundScript}\n  </body>`);
  }

  html = html.replace(/(<span id="update-version">)v[^<]+/, `$1v${version}`);
  html = html.replace(/CURRENT v\d+\.\d+\.\d+/, `CURRENT v${version}`);
  return html;
});

await updateFile('public/app.js', (source) => {
  let js = source;
  for (const asset of [
    './i18n.js',
    './flight-phases.js',
    './live-traffic.js',
    './airline-catalog.js',
    '/service-worker.js',
  ]) js = updateAssetVersion(js, asset);
  return js;
});

await updateFile('public/live-traffic.js', (source) => updateAssetVersion(source, './flight-overlay.js'));
await updateFile('public/flight-overlay.js', (source) => updateAssetVersion(source, '/flight-overlay.css'));

await updateFile('public/service-worker.js', (source) => {
  let sw = source.replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'flight-deck-efb-v${version.replaceAll('.', '')}-ui';`);
  for (const asset of [
    '/styles.css',
    '/si-operations.css',
    '/app.js',
    '/live-traffic.js',
    '/flight-overlay.js',
    '/flight-overlay.css',
    '/com-polish.js',
    '/com-polish.css',
    '/atc-polish.js',
    '/atc-polish.css',
    '/ground-polish.js',
    '/ground-polish.css',
    '/airline-catalog.js',
    '/si-operations.js',
    '/i18n.js',
    '/flight-phases.js',
  ]) sw = updateAssetVersion(sw, asset);

  if (!sw.includes(`/flight-overlay.js?v=${version}`)) {
    sw = sw.replace(`  '/live-traffic.js?v=${version}',`, `  '/live-traffic.js?v=${version}',\n  '/flight-overlay.js?v=${version}',\n  '/flight-overlay.css?v=${version}',`);
  }
  if (!sw.includes(`/com-polish.js?v=${version}`)) {
    sw = sw.replace(`  '/flight-overlay.css?v=${version}',`, `  '/flight-overlay.css?v=${version}',\n  '/com-polish.js?v=${version}',\n  '/com-polish.css?v=${version}',`);
  }
  if (!sw.includes(`/atc-polish.js?v=${version}`)) {
    sw = sw.replace(`  '/com-polish.css?v=${version}',`, `  '/com-polish.css?v=${version}',\n  '/atc-polish.js?v=${version}',\n  '/atc-polish.css?v=${version}',`);
  }
  if (!sw.includes(`/ground-polish.js?v=${version}`)) {
    sw = sw.replace(`  '/atc-polish.css?v=${version}',`, `  '/atc-polish.css?v=${version}',\n  '/ground-polish.js?v=${version}',\n  '/ground-polish.css?v=${version}',`);
  }
  return sw;
});

const releaseNotesPath = path.join(root, 'release-notes', `${version}.md`);
try {
  const releaseNotes = (await fs.readFile(releaseNotesPath, 'utf8')).trim();
  await updateFile('CHANGELOG.md', (source) => {
    if (new RegExp(`^##\\s+${escapeRegExp(version)}\\b`, 'm').test(source)) return source;
    const firstBreak = source.indexOf('\n');
    if (firstBreak < 0) return `${source}\n\n${releaseNotes}\n`;
    return `${source.slice(0, firstBreak + 1)}\n${releaseNotes}\n\n${source.slice(firstBreak + 1)}`;
  });
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

console.log(`Prepared Flight Deck EFB UI assets for ${version}.`);
