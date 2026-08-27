import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('scripts/apply-release-1.20.3.mjs', (source) => source
  .replace("if (!['1.20.3', '1.20.4'].includes(version)) throw new Error(`1.20.3 release materializer requires package version 1.20.3 or a compatible 1.20.4 chain, got ${version}.`);",
    "if (!['1.20.3', '1.20.4', '1.20.5'].includes(version)) throw new Error(`1.20.3 release materializer requires a compatible 1.20.x chain, got ${version}.`);"));

await update('scripts/apply-release-1.20.4.mjs', (source) => source
  .replace("if (version !== '1.20.4') throw new Error(`1.20.4 release materializer requires package version 1.20.4, got ${version}.`);",
    "if (!['1.20.4', '1.20.5'].includes(version)) throw new Error(`1.20.4 release materializer requires a compatible 1.20.4+ chain, got ${version}.`);"));

console.log('Prepared prior Flight Deck release materializers for 1.20.5.');
