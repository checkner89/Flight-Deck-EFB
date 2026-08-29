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

    // Existing compatibility lists that already contain 1.22.0 should also accept 1.22.1.
    next = next.replace(
      /\[([^\]\n]*'1\.22\.0'[^\]\n]*)\]\.includes\((version|pkg\.version|packageJson\.version)\)/g,
      (match, list, variable) => list.includes("'1.22.1'") ? match : `[${list}, '1.22.1'].includes(${variable})`,
    );

    // Latest 1.22.0 materializers/tests must remain valid compatibility regressions in 1.22.1.
    next = next.replace(
      /if \((version|pkg\.version|packageJson\.version) !== '1\.22\.0'\) throw new Error\(([^\n]+)\);/g,
      (match, variable, message) => `if (!['1.22.0', '1.22.1'].includes(${variable})) throw new Error(${message});`,
    );

    // Older release scripts that are still strict get the complete current compatibility range.
    next = next.replace(
      /if \((version|pkg\.version|packageJson\.version) !== '1\.21\.0'\) throw new Error\(([^\n]+)\);/g,
      (match, variable, message) => `if (!['1.21.0', '1.22.0', '1.22.1'].includes(${variable})) throw new Error(${message});`,
    );

    next = next.replace(/'1\.20\.11', '1\.21\.0', '1\.22\.0'\]/g, "'1.20.11', '1.21.0', '1.22.0', '1.22.1']");
    next = next.replace(/'1\.21\.0', '1\.22\.0'\]/g, "'1.21.0', '1.22.0', '1.22.1']");

    return next;
  });
}

console.log('Prepared prior Flight Deck release materializers and regression suites for the 1.22.1 chain.');
