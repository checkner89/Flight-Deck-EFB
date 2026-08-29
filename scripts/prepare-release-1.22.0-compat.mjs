import fs from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.22.0') throw new Error(`1.22 compatibility preparation requires package version 1.22.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

const names = await fs.readdir('scripts');
const targets = names
  .filter((name) => /(?:release-1\.(?:20|21)\.|release-1\.21\.0|prepare-release-1\.20|prepare-release-1\.21)/.test(name) && name.endsWith('.mjs'))
  .map((name) => path.join('scripts', name));

for (const filename of targets) {
  if (filename.endsWith('prepare-release-1.22.0-compat.mjs')) continue;
  await update(filename, (source) => {
    let next = source;
    next = next.replace(/\[([^\]\n]*'1\.21\.0'[^\]\n]*)\]\.includes\((version|pkg\.version|packageJson\.version)\)/g, (match, list, variable) => list.includes("'1.22.0'") ? match : `[${list}, '1.22.0'].includes(${variable})`);
    next = next.replace(/if \((version|pkg\.version|packageJson\.version) !== '1\.21\.0'\) throw new Error\(([^\n]+)\);/g, (match, variable, message) => `if (!['1.21.0', '1.22.0'].includes(${variable})) throw new Error(${message});`);
    next = next.replace(/'1\.20\.11', '1\.21\.0'\]/g, "'1.20.11', '1.21.0', '1.22.0']");
    next = next.replace(/'1\.21\.0'\]/g, (match) => match.includes('1.22.0') ? match : "'1.21.0', '1.22.0']");
    next = next.replace(/flight-deck-efb-v1210-backlog1/g, 'flight-deck-efb-v1210-backlog1|flight-deck-efb-v1220-pilotops1');
    return next;
  });
}

// Keep the latest release test authoritative while allowing it to execute as a compatibility regression in 1.22.
await update('scripts/test-release-1.21.0.mjs', (source) => {
  let next = source;
  next = next.replace(
    "if (pkg.version !== '1.21.0') throw new Error(`Expected package version 1.21.0, got ${pkg.version}.`);",
    "if (!['1.21.0', '1.22.0'].includes(pkg.version)) throw new Error(`Expected package version 1.21.0+, got ${pkg.version}.`);",
  );
  next = next.replace(/flight-deck-efb-v1210-backlog1/g, 'flight-deck-efb-v1210-backlog1');
  return next;
});

console.log('Prepared prior Flight Deck release materializers and regression suites for the 1.22.0 chain.');
