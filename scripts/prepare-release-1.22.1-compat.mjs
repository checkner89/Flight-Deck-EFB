import fs from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.22.1') throw new Error(`1.22.1 compatibility preparation requires package version 1.22.1, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

const names = await fs.readdir('scripts');
const targets = names
  .filter((name) => /(?:release-1\.(?:20|21|22)\.|release-1\.(?:21|22)\.0|prepare-release-1\.(?:20|21|22))/.test(name) && name.endsWith('.mjs'))
  .filter((name) => name !== 'prepare-release-1.22.1-compat.mjs')
  .map((name) => path.join('scripts', name));

for (const filename of targets) {
  await update(filename, (source) => {
    let next = source;

    // Any prior release compatibility gate must continue to admit the current patch release.
    // This runs before the historical compatibility scripts, so it deliberately covers strict
    // 1.20.x gates as well as the more recent 1.21/1.22 compatibility arrays.
    next = next.replace(
      /\[([^\]\n]*'1\.(?:20\.\d+|21\.0|22\.0)'[^\]\n]*)\]\.includes\((version|pkg\.version|packageJson\.version)\)/g,
      (match, list, variable) => list.includes("'1.22.1'") ? match : `[${list}, '1.22.1'].includes(${variable})`,
    );

    next = next.replace(
      /if \((version|pkg\.version|packageJson\.version) !== '(1\.(?:20\.\d+|21\.0|22\.0))'\) throw new Error\(([^\n]+)\);/g,
      (match, variable, legacyVersion, message) => `if (!['${legacyVersion}', '1.22.1'].includes(${variable})) throw new Error(${message});`,
    );

    // A few legacy scripts compare package versions through String(...) aliases. Their final
    // guards are normalized above because the alias itself is named `version`; keep explicit
    // list literals resilient when later compatibility scripts add intermediate releases.
    next = next.replace(/'1\.20\.11', '1\.21\.0', '1\.22\.0'\]/g, "'1.20.11', '1.21.0', '1.22.0', '1.22.1']");
    next = next.replace(/'1\.21\.0', '1\.22\.0'\]/g, "'1.21.0', '1.22.0', '1.22.1']");

    return next;
  });
}

console.log('Prepared prior Flight Deck release materializers and regression suites for the 1.22.1 chain.');
