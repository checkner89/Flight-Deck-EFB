import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.5') throw new Error(`1.24.5 materializer requires package version 1.24.5, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/electron-main.mjs', (source) => source
  .replace("    title: 'FLYXORA',", "    title: 'FLYXORA 1.24.5',"));

await update('public/app.js', (source) => source
  .replaceAll('?v=1.24.4', '?v=1.24.5')
  .replace(
    '<small>WINDOWS APP</small><h1>FLYXORA wird gestartet</h1>',
    '<small>WINDOWS APP · v1.24.5</small><h1>FLYXORA wird gestartet</h1>',
  ));

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, 'data-app-version="1.24.5"')
  .replaceAll('?v=1.24.4', '?v=1.24.5'));

await update('public/service-worker.js', (source) => source
  .replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flyxora-v1.24.5-stale-process';")
  .replaceAll('?v=1.24.4', '?v=1.24.5'));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.5 — Windows Upgrade Process')) return source;
  const section = `## 1.24.5 — Windows Upgrade Process\n\n- Setup now terminates stale FLYXORA and legacy Flight Deck EFB desktop processes before replacing application files, preventing an old tray instance from continuing to serve an older renderer after an upgrade.\n- Removes legacy desktop/start-menu shortcuts that may point to an obsolete installation.\n- Shows the exact Windows build version on the desktop startup/recovery screen and in the window title for immediate verification.\n- Retains all 1.24.4 hardened desktop-session recovery and packaged renderer checks.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  const first = source.indexOf('## ');
  return first >= 0 ? `${source.slice(0, first)}${section}${source.slice(first)}` : `${section}${source}`;
});

console.log('FLYXORA 1.24.5 Windows upgrade process materialized.');
