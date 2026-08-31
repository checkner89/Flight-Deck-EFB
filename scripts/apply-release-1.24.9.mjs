import fs from 'node:fs/promises';
import path from 'node:path';

const VERSION = '1.24.9';
const CACHE = 'flyxora-v1.24.9-traffic-simbrief-brand';
const TEXT_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.md', '.mjs', '.nsh', '.scss', '.ts', '.tsx', '.txt', '.webmanifest', '.xml', '.yaml', '.yml',
]);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.9 release updated ${filename}`);
  }
}

function applyBranding(source) {
  return source
    .replace(/FLIGHT DECK EFB/g, 'FLYXORA')
    .replace(/Flight Deck EFB/g, 'FLYXORA')
    .replace(/FLIGHT DECK/g, 'FLYXORA')
    .replace(/Flight Deck/g, 'FLYXORA');
}

async function brandTree(root) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    const filename = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await brandTree(filename);
      continue;
    }
    if (!entry.isFile() || !TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    await update(filename, applyBranding);
  }
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== VERSION) throw new Error(`1.24.9 finalizer expected package ${VERSION}, got ${pkg.version}.`);

// All end-user surfaces use the FLYXORA product name. Technical compatibility
// identifiers such as the existing appId and repository slug intentionally remain
// unchanged so installed 1.24.x clients continue to update in place.
pkg.name = 'flyxora';
pkg.productName = 'FLYXORA';
pkg.description = 'FLYXORA Simulation EFB for MSFS with gate-to-gate journey intelligence, operational briefing readiness, unified flight tracking, taxi and ground safety, persistent scratchpads and a harmonized cockpit UI.';
pkg.build = pkg.build || {};
pkg.build.productName = 'FLYXORA';
pkg.build.artifactName = 'FLYXORA-Setup-${version}.${ext}';
pkg.build.win = pkg.build.win || {};
pkg.build.win.executableName = 'FLYXORA';
pkg.build.nsis = pkg.build.nsis || {};
pkg.build.nsis.shortcutName = 'FLYXORA';
pkg.build.nsis.uninstallDisplayName = 'FLYXORA';
await fs.writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

for (const root of ['public', 'src', 'MSFS-2024-EFB-App', 'build']) await brandTree(root);
for (const filename of ['README.md', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md', 'CHANGELOG.md']) {
  try {
    await update(filename, applyBranding);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, `data-app-version="${VERSION}"`)
  .replace(/\?v=1\.24\.8\b/g, `?v=${VERSION}`)
  .replace(/<meta name="apple-mobile-web-app-title" content="[^"]*">/, '<meta name="apple-mobile-web-app-title" content="FLYXORA">')
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="FLYXORA für Microsoft Flight Simulator">')
  .replace(/<title>[^<]*<\/title>/, '<title>FLYXORA</title>')
  .replace(/<div class="brand" aria-label="[^"]*">/, '<div class="brand" aria-label="FLYXORA">'));

await update('public/manifest.webmanifest', (source) => {
  const manifest = JSON.parse(source);
  manifest.name = 'FLYXORA';
  manifest.short_name = 'FLYXORA';
  manifest.description = 'FLYXORA – Simulation EFB für Microsoft Flight Simulator mit Flight Tracking, Taxi, SimBrief, ATC und Pilot Tools.';
  return `${JSON.stringify(manifest, null, 2)}\n`;
});

await update('src/server.mjs', (source) => source
  .replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${VERSION}';`));

await update('src/electron-main.mjs', (source) => source
  .replace(/title: 'FLYXORA [^']+'/g, `title: 'FLYXORA ${VERSION}'`));

await update('public/service-worker.js', (source) => source
  .replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = '${CACHE}';`)
  .replace(/\?v=1\.24\.8\b/g, `?v=${VERSION}`));

await update('CHANGELOG.md', (source) => {
  let next = source.replace(/^#\s+.*changelog\s*$/im, '# FLYXORA changelog');
  if (next.includes('## 1.24.9 — Traffic Consistency, SimBrief Route & FLYXORA Branding')) return next;
  const heading = '# FLYXORA changelog';
  if (!next.includes(heading)) next = `${heading}\n\n${next.trim()}\n`;
  const notes = `## 1.24.9 — Traffic Consistency, SimBrief Route & FLYXORA Branding\n\n- Unified all Traffic aircraft markers so every target uses the same heading-aware circular presentation.\n- Added spatial Traffic deduplication across simulator and VATSIM/IVAO sources to suppress overlapping duplicate aircraft without collapsing adjacent stands.\n- Removed the Traffic history footer from aircraft popups.\n- Restored the dedicated SimBrief route geometry on the Tracking map, including origin and destination, while keeping the lower route strip limited to DEP/ARR.\n- Completed the visible product rename to FLYXORA across the web UI, PWA metadata, Windows application, installer/uninstaller, shortcuts and native MSFS EFB surface.\n- Preserved technical application/update identifiers so existing installations continue to upgrade in place.\n`;
  return next.replace(heading, `${heading}\n\n${notes}`);
});

console.log('FLYXORA 1.24.9 final release branding/version materialized.');
