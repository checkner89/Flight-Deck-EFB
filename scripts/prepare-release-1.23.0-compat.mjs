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

// The release chain is intentionally materialized several times inside one CI job
// (npm install -> prepare-data -> dist). After 1.24.2 has completed once, historical
// apply-* scripts must not rewrite its modern tracking DOM/renderers on later passes.
// They still execute fully on the first pass because the 1.24.2 marker is not present yet.
const legacyMaterializers = names
  .filter((name) => name.startsWith('apply-') && name.endsWith('.mjs'))
  .filter((name) => !['apply-release-1.24.2.mjs', 'apply-release-1.24.2-hotfix.mjs'].includes(name));
for (const name of legacyMaterializers) {
  await update(path.join('scripts', name), (source) => {
    const marker = 'const fd1242AlreadyMaterialized =';
    if (source.includes(marker)) return source;
    const fsImport = "import fs from 'node:fs/promises';\n";
    if (!source.includes(fsImport)) return source;
    const guard = `\nconst fd1242AlreadyMaterialized = (await fs.readFile('public/app.js', 'utf8').catch(() => '')).includes('function trackingScheduleMarkup(');\nconst fd1242CurrentVersion = JSON.parse(await fs.readFile('package.json', 'utf8')).version;\nif (fd1242CurrentVersion === '1.24.2' && fd1242AlreadyMaterialized) {\n  console.log('${name} skipped: FLYXORA 1.24.2 is already materialized in this build workspace.');\n  process.exit(0);\n}\n`;
    return source.replace(fsImport, fsImport + guard);
  });
}

// Keep the historical 1.20.11 map control patch tolerant when a newer selector is
// already present during the first materialization pass.
await update('scripts/apply-release-1.20.11.mjs', (source) => {
  const compatibilityGuard = "    if (label === 'unified map/satellite controls' && source.includes('id=\"tracking-basemap-select\"')) return source;";
  if (source.includes(compatibilityGuard)) return source;
  return source.replace(
    "    if (label === 'record weather overlay fields') return source;",
    "    if (label === 'record weather overlay fields') return source;\n" + compatibilityGuard,
  );
});

console.log(`Prepared prior Flight Deck release materializers and regression suites for the ${targetVersion} chain.`);
