import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.22.1') throw new Error(`1.22.1 materializer requires package version 1.22.1, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '1.22.1';"));

await update('public/index.html', (source) => {
  let next = source.replace(/data-app-version="[^"]+"/, 'data-app-version="1.22.1"');
  next = next.replaceAll('?v=1.22.0', '?v=1.22.1');
  if (!next.includes('release-1.22.1.css?v=1.22.1')) {
    next = next.replace('</head>', '    <link rel="stylesheet" href="/release-1.22.1.css?v=1.22.1">\n  </head>');
  }
  return next;
});

await update('public/service-worker.js', (source) => {
  let next = source.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flight-deck-efb-v1221-ui1';");
  next = next.replaceAll('?v=1.22.0', '?v=1.22.1');
  if (!next.includes("'/release-1.22.1.css?v=1.22.1'")) {
    next = next.replace("  '/manifest.webmanifest',", "  '/release-1.22.1.css?v=1.22.1',\n  '/manifest.webmanifest',");
  }
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.22.1')) return source;
  const section = `## 1.22.1 — Cockpit UI Harmonization\n\n- Harmonizes spacing, card hierarchy, controls, focus states and responsive behavior across the persistent EFB shell.\n- Hardens the tracking-first Flight Hub by keeping retired Operations and manual Flight Journey UI out of the pilot-facing workflow.\n- Refines Flight Profile and Archive presentation without changing route, profile or recorder logic.\n- Improves Guided Briefing navigation, section hierarchy and compact operational data cards.\n- Makes Scratchpad tools easier to reach and gives the drawing area a clearer working surface.\n- Reduces visual noise in Ground Services while preserving the 1.22 phase-aware GSX workflow.\n- Rebalances Taxi moving-map overlays and the Taxi planner for desktop and tablet use.\n- Reworks News into a calmer, more readable briefing stream and adds full Light Mode treatment.\n- Uses a darker petrol interaction color in Light Mode so turquoise remains an accent instead of low-contrast body text.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  return section + source;
});

console.log('Flight Deck EFB 1.22.1 cockpit UI harmonization materialized.');
