import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.23.1') throw new Error(`1.23.1 materializer requires package version 1.23.1, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await import('./apply-feature-1.23.1-ui-review.mjs');

// Historical release layers can leave event bindings for controls that no longer exist
// in the current cockpit shell. Make only the binding operation tolerant of an absent
// control; operational handlers and provider logic remain unchanged when a control exists.
await update('public/app.js', (source) => source.replace(
  /elements\.([A-Za-z0-9_]+)\.addEventListener\(/g,
  'elements.$1?.addEventListener(',
));

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '1.23.1';"));

await update('public/index.html', (source) => {
  let next = source.replace(/data-app-version="[^"]+"/, 'data-app-version="1.23.1"');
  next = next.replaceAll('?v=1.23.0', '?v=1.23.1');
  return next;
});

await update('public/service-worker.js', (source) => {
  let next = source.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flight-deck-efb-v1231-ui2';");
  next = next.replaceAll('?v=1.23.0', '?v=1.23.1');
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.23.1')) return source;
  const section = `## 1.23.1 — Cockpit UI & Briefing Hotfix\n\n- Cleans up Home tiles, removes duplicate-looking module labels and removes News from visible navigation.\n- Restores Live Traffic map interaction to aircraft-only markers with flight number/callsign on hover and details on click.\n- Stabilizes Guided Briefing rendering so unrelated state updates no longer rebuild the active panel continuously.\n- Imports SimBrief OFP NOTAM text into the Guided Briefing NOTAM section.\n- Removes Gate Assignment / Gate-Stand from the visible departure briefing.\n- Removes cross-module Taxi/Ground shortcuts from Briefing.\n- Hides the airport map while no Taxi route exists.\n- Fixes Taxi planner viewport clipping, centering, responsive sizing and footer/action visibility.\n- Makes legacy renderer event bindings tolerant of controls removed by newer cockpit layouts.\n- Keeps simulator, recorder, GSX, route and traffic-source logic unchanged.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  return source.startsWith('# Flight Deck EFB changelog\n')
    ? source.replace('# Flight Deck EFB changelog\n', `# Flight Deck EFB changelog\n\n${section}`)
    : section + source;
});

console.log('Flight Deck EFB 1.23.1 release materialized.');
