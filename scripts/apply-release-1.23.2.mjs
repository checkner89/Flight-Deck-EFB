import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (!['1.23.2', '1.24.0', '1.24.1'].includes(pkg.version)) throw new Error(`1.23.2 compatibility materializer requires package version 1.23.2, 1.24.0 or 1.24.1, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '1.23.2';"));

await update('public/index.html', (source) => {
  let next = source.replace(/data-app-version="[^"]+"/, 'data-app-version="1.23.2"');
  next = next.replaceAll('?v=1.23.1', '?v=1.23.2');
  return next;
});

await update('public/service-worker.js', (source) => {
  let next = source.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flight-deck-efb-v1232-persistence';");
  next = next.replaceAll('?v=1.23.1', '?v=1.23.2');
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.23.2')) return source;
  const section = `## 1.23.2 — Update-Safe Local Data\n\n- Adds an update-safe backup for persistent browser settings and cockpit preferences under Electron userData.\n- Flushes Chromium storage and snapshots persistent local state before automatic update installation.\n- Restores missing or update-snapshotted settings before the application window is shown after restart.\n- Migrates existing 1.23.1 local browser settings into the new durable backup on the first 1.23.2 start.\n- Adds a normal-shutdown fallback snapshot while excluding transient pairing/authentication tokens.\n- Keeps existing flight archive, automation, maps and other userData persistence unchanged.\n- Adds a regression gate so future release builds cannot silently remove update-safe state persistence.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  return source.startsWith('# Flight Deck EFB changelog\n')
    ? source.replace('# Flight Deck EFB changelog\n', `# Flight Deck EFB changelog\n\n${section}`)
    : section + source;
});

console.log(`Flight Deck EFB 1.23.2 compatibility layer materialized for ${pkg.version}.`);
