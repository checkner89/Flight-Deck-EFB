import fs from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const targetVersion = pkg.version;
if (!['1.23.0', '1.23.1', '1.23.2', '1.24.0', '1.24.1', '1.24.2'].includes(targetVersion)) throw new Error(`1.23 compatibility preparation requires package version 1.23.0/1.23.1/1.23.2/1.24.0/1.24.1/1.24.2, got ${targetVersion}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

const names = await fs.readdir('scripts');
const targets = names
  .filter((name) => name.endsWith('.mjs'))
  // All historical materializers/tests need the current patch version added before
  // they execute. The compatibility preparer itself is the only file excluded.
  .filter((name) => name !== 'prepare-release-1.23.0-compat.mjs')
  .map((name) => path.join('scripts', name));

for (const filename of targets) {
  await update(filename, (source) => {
    let next = source;
    next = next.replace(
      /if \((version|pkg\.version|packageJson\.version) !== '(\d+\.\d+\.\d+)'\) throw new Error\(([^\n]+)\);/g,
      (match, variable, legacyVersion, message) => legacyVersion === targetVersion
        ? match
        : `if (!['${legacyVersion}', '${targetVersion}'].includes(${variable})) throw new Error(${message});`,
    );
    next = next.replace(
      /\[([^\]\n]*'\d+\.\d+\.\d+'[^\]\n]*)\]\.includes\((version|pkg\.version|packageJson\.version)\)/g,
      (match, list, variable) => list.includes(`'${targetVersion}'`) ? match : `[${list}, '${targetVersion}'].includes(${variable})`,
    );
    return next;
  });
}

// Newer releases replace the legacy 1.20.11 map/satellite toolbar with a compact
// selector after the first materialization pass. npm install, prepare-data and dist
// run the materializer chain repeatedly, so accept that newer selector on later passes.
await update('scripts/apply-release-1.20.11.mjs', (source) => {
  const compatibilityGuard = "    if (label === 'unified map/satellite controls' && source.includes('id=\"tracking-basemap-select\"')) return source;";
  if (source.includes(compatibilityGuard)) return source;
  return source.replace(
    "    if (label === 'record weather overlay fields') return source;",
    "    if (label === 'record weather overlay fields') return source;\n" + compatibilityGuard,
  );
});

// 1.20.10 owns the old SimBrief-route insertion. Once 1.24.2 has already been
// materialized, running that historical patch again can no longer find its original
// anchor because the current tracking renderer intentionally has a newer structure.
// Skip only repeated 1.20.10 passes; the first pass still runs in full.
await update('scripts/apply-release-1.20.10.mjs', (source) => {
  const marker = "const fd1242CurrentApp = await fs.readFile(path.join(root, 'public/app.js'), 'utf8').catch(() => '');";
  if (source.includes(marker)) return source;
  const anchor = "const version = String(pkg.version || '1.20.10');";
  if (!source.includes(anchor)) return source;
  return source.replace(anchor, `${anchor}\n${marker}\nif (version === '1.24.2' && fd1242CurrentApp.includes('function trackingScheduleMarkup(')) {\n  console.log('Flight Deck EFB 1.20.10 legacy map materializer skipped after 1.24.2 materialization.');\n  process.exit(0);\n}`);
});

console.log(`Prepared prior Flight Deck release materializers and regression suites for the ${targetVersion} chain.`);
