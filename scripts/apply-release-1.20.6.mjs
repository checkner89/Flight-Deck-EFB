import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.6');

if (version !== '1.20.6') throw new Error(`1.20.6 UI/UX materializer requires package version 1.20.6, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${version}';`));

await update('public/index.html', (source) => {
  let html = source.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  for (const asset of ['release-1.20.4.css', 'release-1.20.4.js', 'file-browser.css', 'file-browser.js']) {
    const escaped = asset.replaceAll('.', '\\.');
    html = html.replace(new RegExp(`${escaped}\\?v=[^"']+`, 'g'), `${asset}?v=${version}`);
  }
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v1206-unified-ui1';");
  for (const asset of ['release-1.20.4.css', 'release-1.20.4.js', 'file-browser.css', 'file-browser.js']) {
    const escaped = asset.replaceAll('.', '\\.');
    sw = sw.replace(new RegExp(`${escaped}\\?v=[^'"\\s,]+`, 'g'), `${asset}?v=${version}`);
  }
  return sw;
});

await update('public/file-browser.js', (source) => source.replace(
  /function installRailButton\(\) \{[\s\S]*?\r?\n\}\r?\n\r?\nfunction markRailActive/,
  `function installRailButton() {\n  const button = document.querySelector('.fd-global-rail [data-fd24-module="files"]');\n  if (button) filesUi.railButton = button;\n}\n\nfunction markRailActive`,
));

await update('public/documents-workspace.js', (source) => {
  let next = source;
  next = next.replace(
    '<strong>Documents</strong><span>SimBrief OFP, briefing documents and mark-up</span>',
    '<strong>Briefing</strong><span>SimBrief OFP, weather, NOTAMs, briefing documents and annotation</span>',
  );
  next = next.replace('<span>OFP & DOCUMENTS</span>', '<span>BRIEFING</span>');
  return next;
});

const changelogPath = path.join(root, 'CHANGELOG.md');
const releaseNotesPath = path.join(root, 'release-notes', '1.20.6.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.6\b/m.test(changelog)) {
  const notes = (await fs.readFile(releaseNotesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log(`Applied Flight Deck EFB ${version} unified UI/UX and app-scoped Files.`);
