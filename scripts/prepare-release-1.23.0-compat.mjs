import fs from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.23.0') throw new Error(`1.23.0 compatibility preparation requires package version 1.23.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

const names = await fs.readdir('scripts');
const targets = names
  .filter((name) => name.endsWith('.mjs'))
  .filter((name) => !['prepare-release-1.23.0-compat.mjs', 'apply-release-1.23.0.mjs', 'test-release-1.23.0.mjs'].includes(name))
  .map((name) => path.join('scripts', name));

for (const filename of targets) {
  await update(filename, (source) => {
    let next = source;

    next = next.replace(
      /if \((version|pkg\.version|packageJson\.version) !== '(\d+\.\d+\.\d+)'\) throw new Error\(([^\n]+)\);/g,
      (match, variable, legacyVersion, message) => legacyVersion === '1.23.0'
        ? match
        : `if (!['${legacyVersion}', '1.23.0'].includes(${variable})) throw new Error(${message});`,
    );

    next = next.replace(
      /\[([^\]\n]*'\d+\.\d+\.\d+'[^\]\n]*)\]\.includes\((version|pkg\.version|packageJson\.version)\)/g,
      (match, list, variable) => list.includes("'1.23.0'") ? match : `[${list}, '1.23.0'].includes(${variable})`,
    );

    return next;
  });
}

console.log('Prepared prior Flight Deck release materializers and regression suites for the 1.23.0 chain.');
