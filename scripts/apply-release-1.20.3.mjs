import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.3');
const documentsAssetVersion = `${version}-docs1`;
const cacheVersion = version.replace(/[^0-9]/g, '');

if (version !== '1.20.3') throw new Error(`1.20.3 release materializer requires package version 1.20.3, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('public/documents-workspace.js', (source) => source.replace(
  /^const FD_DOCS_VERSION = '[^']+';$/m,
  `const FD_DOCS_VERSION = '${documentsAssetVersion}';`,
));

await update('public/service-worker.js', (source) => source.replace(
  /^const CACHE_NAME = .*;$/m,
  `const CACHE_NAME = 'flight-deck-efb-v${cacheVersion}-docs1';`,
));

await update('public/index.html', (source) => source.replace(
  /(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i,
  `$1${version}$2`,
));

const changelogPath = path.join(root, 'CHANGELOG.md');
const releaseNotesPath = path.join(root, 'release-notes', '1.20.3.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.3\b/m.test(changelog)) {
  const notes = (await fs.readFile(releaseNotesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log(`Applied Flight Deck EFB ${version} OFP/Documents release materialization.`);
