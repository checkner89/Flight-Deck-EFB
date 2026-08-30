import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.0') throw new Error(`1.24.0 materializer requires package version 1.24.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '1.24.0';"));

await update('public/index.html', (source) => {
  let next = source.replace(/data-app-version="[^"]+"/, 'data-app-version="1.24.0"');
  next = next.replaceAll('?v=1.23.2', '?v=1.24.0');
  next = next.replaceAll('?v=1.23.1', '?v=1.24.0');
  return next;
});

await update('public/service-worker.js', (source) => {
  let next = source.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flight-deck-efb-v1240-flighttracking';");
  next = next.replaceAll('?v=1.23.2', '?v=1.24.0');
  next = next.replaceAll('?v=1.23.1', '?v=1.24.0');
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.0')) return source;
  const section = `## 1.24.0 — Flight & Tracking Polish\n\n- Reworks the Flight Profile layout with a larger plotting area, readable altitude labels and altitude-coloured actual-flight segments.\n- Shows planned and actual Off Block, Takeoff, Landing and On Block times together; SimBrief planned Takeoff uses the OFP estimated-off time while actual Takeoff comes from the recorder.\n- Removes the redundant “Archiv: Originalplanung + tatsächliche Spur” helper text and the obsolete “ALTITUDE / TIME” profile subtitle.\n- Removes the historical profile renderer from the active render path so an older chart can no longer appear behind the enhanced profile.\n- Restores clean Live Traffic aircraft symbols without the dark circular marker background.\n- Keeps the selected Live Traffic details popup open across normal traffic refreshes after clicking an aircraft.\n- Preserves the update-safe local-state migration introduced in 1.23.2.\n- Adds materialized-runtime regression coverage for the visible Flight & Tracking changes.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  return source.startsWith('# Flight Deck EFB changelog\n')
    ? source.replace('# Flight Deck EFB changelog\n', `# Flight Deck EFB changelog\n\n${section}`)
    : section + source;
});

console.log('Flight Deck EFB 1.24.0 release materialized.');
