import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.23.0') throw new Error(`1.23.0 materializer requires package version 1.23.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '1.23.0';"));

await update('public/index.html', (source) => {
  let next = source.replace(/data-app-version="[^"]+"/, 'data-app-version="1.23.0"');
  next = next.replaceAll('?v=1.22.1', '?v=1.23.0');
  return next;
});

await update('public/service-worker.js', (source) => {
  let next = source.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flight-deck-efb-v1230-journey1';");
  next = next.replaceAll('?v=1.22.1', '?v=1.23.0');
  return next;
});

await update('scripts/test-release-1.22.1.mjs', (source) => {
  let next = source;
  next = next.replace("if (pkg.version !== '1.22.1') throw new Error(`Expected package version 1.22.1, got ${pkg.version}.`);", "if (!['1.22.1', '1.23.0'].includes(pkg.version)) throw new Error(`Expected package version 1.22.1/1.23.0, got ${pkg.version}.`);");
  next = next.replaceAll('data-app-version="1.22.1"', 'data-app-version="1.23.0"');
  next = next.replaceAll('?v=1.22.1', '?v=1.23.0');
  next = next.replace("const APP_VERSION = '1.22.1';", "const APP_VERSION = '1.23.0';");
  next = next.replace('flight-deck-efb-v1221-ux1', 'flight-deck-efb-v1230-journey1');
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.23.0')) return source;
  const section = `## 1.23.0 — Gate-to-Gate Flight Intelligence\n\n- Adds a central gate-to-gate Flight Journey state covering Planning, Preflight, Boarding, Pushback, Taxi Out, Takeoff, Climb, Cruise, Descent, Approach, Landing, Taxi In, Turnaround and Shutdown.\n- Derives journey context from existing simulator, ATC, route and ground state without adding another SimConnect polling loop.\n- Adds stabilized automatic phase transitions plus manual correction support for the expanded journey phases.\n- Adds journey-aware flight completion so landing never ends the recording immediately; Taxi In remains part of the recorded flight and completion waits for a stable parked/shutdown state.\n- Keeps the proven legacy recorder completion logic as a safe fallback if the journey service is unavailable.\n- Adds Operational Briefing Readiness with Ready / Attention / Blocking evaluation for route, OFP, runways, weather, fuel, route synchronization and destination stand.\n- Keeps SimBrief optional: missing supplemental data produces Attention where appropriate instead of artificial flight blocking.\n- Adds focused journey/readiness regression tests and Windows CI coverage while retaining the 1.22.1 cockpit UI and pilot workflow baseline.\n- Moves Electron single-instance ownership into a guarded bootstrap so secondary Windows launches cannot start duplicate server/window lifecycle code.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  return source.startsWith('# Flight Deck EFB changelog\n')
    ? source.replace('# Flight Deck EFB changelog\n', `# Flight Deck EFB changelog\n\n${section}`)
    : section + source;
});

await import('./apply-feature-1.23.1-ui-review.mjs');
console.log('Flight Deck EFB 1.23.0 release materialized.');
