import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('scripts/apply-release-1.20.3.mjs', (source) => source
  .replace(
    /if \(!\[[^\n]+\]\.includes\(version\)\) throw new Error\(`1\.20\.3 release materializer[^\n]+/,
    "if (!['1.20.3', '1.20.4', '1.20.5', '1.20.6'].includes(version)) throw new Error(`1.20.3 release materializer requires a compatible 1.20.x chain, got ${version}.`);",
  ));

await update('scripts/apply-release-1.20.4.mjs', (source) => source
  .replace(
    /if \((?:version !== '1\.20\.4'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.4 release materializer[^\n]+/,
    "if (!['1.20.4', '1.20.5', '1.20.6'].includes(version)) throw new Error(`1.20.4 release materializer requires a compatible 1.20.4+ chain, got ${version}.`);",
  ));

await update('scripts/apply-release-1.20.5.mjs', (source) => source
  .replace(
    "if (version !== '1.20.5') throw new Error(`1.20.5 release materializer requires package version 1.20.5, got ${version}.`);",
    "if (!['1.20.5', '1.20.6'].includes(version)) throw new Error(`1.20.5 release materializer requires a compatible 1.20.5+ chain, got ${version}.`);",
  ));

console.log('Prepared prior Flight Deck release materializers for the 1.20.6 chain.');
