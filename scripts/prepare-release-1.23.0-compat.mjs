import fs from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const targetVersion = pkg.version;
if (!['1.23.0', '1.23.1'].includes(targetVersion)) throw new Error(`1.23 compatibility preparation requires package version 1.23.0/1.23.1, got ${targetVersion}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

const names = await fs.readdir('scripts');
const targets = names
  .filter((name) => name.endsWith('.mjs'))
  .filter((name) => !['prepare-release-1.23.0-compat.mjs', 'apply-release-1.23.1.mjs', 'test-release-1.23.1.mjs'].includes(name))
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

console.log(`Prepared prior Flight Deck release materializers and regression suites for the ${targetVersion} chain.`);
