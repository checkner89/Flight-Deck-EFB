import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const version = String(pkg.version || '1.21.0');
if (version !== '1.21.0') throw new Error(`1.21.0 UI materializer requires package version 1.21.0, got ${version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}
function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`1.21.0 UI anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('public/app.js', (source) => {
  let next = source;
  if (!next.includes('window.__flightDeckTaxiMap = map;')) {
    next = replaceRequired(next,
      "}).setView([51.2895, 6.7668], 16);",
      "}).setView([51.2895, 6.7668], 16);\nwindow.__flightDeckTaxiMap = map;",
      'taxi map bridge');
  }
  if (!next.includes('window.__flightDeckLatestState = state;')) {
    next = replaceRequired(next, '  latestState = state;', '  latestState = state;\n  window.__flightDeckLatestState = state;', 'live state bridge');
  }
  if (!next.includes('window.__flightDeckLoadedAirportMapData = mapData;')) {
    next = replaceRequired(next,
      '  loadedAirportMapData = mapData;',
      '  loadedAirportMapData = mapData;\n  window.__flightDeckLoadedAirportMapData = mapData;\n  window.FlightDeckRelease121?.constrainTaxiMap?.();',
      'airport map bridge');
  }
  if (!next.includes('window.__flightDeckTrackingMap = trackingMap;')) {
    next = replaceRequired(next,
      "  }).setView([50.5, 8.5], 5.5);\n  trackingMap.createPane('trackingPlanned').style.zIndex = '410';",
      "  }).setView([50.5, 8.5], 5.5);\n  window.__flightDeckTrackingMap = trackingMap;\n  window.__flightDeckTrackingLayers = trackingLayers;\n  trackingMap.createPane('trackingPlanned').style.zIndex = '410';",
      'tracking map bridge');
  }
  return next;
});

await update('public/index.html', (source) => {
  let html = source;
  html = html.replace(/\s*<link[^>]+release-1\.21\.0\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace(/\s*<script[^>]+release-1\.21\.0\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/release-1.21.0.css?v=${version}">\n  </head>`);
  html = html.replace('</body>', `    <script src="/release-1.21.0.js?v=${version}"></script>\n  </body>`);
  html = html.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let next = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v1210-backlog1';");
  if (!next.includes("'/release-1.21.0.css?v=1.21.0'")) {
    next = next.replace("  '/manifest.webmanifest',", "  '/release-1.21.0.css?v=1.21.0',\n  '/release-1.21.0.js?v=1.21.0',\n  '/manifest.webmanifest',");
  }
  return next;
});

const changelog = await fs.readFile('CHANGELOG.md', 'utf8');
if (!/^## 1\.21\.0\b/m.test(changelog)) {
  const notes = (await fs.readFile('release-notes/1.21.0.md', 'utf8')).trim();
  const clean = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${clean}\n\n`);
  await fs.writeFile('CHANGELOG.md', next, 'utf8');
}

console.log('Flight Deck EFB 1.21.0 UI/release assets materialized.');
