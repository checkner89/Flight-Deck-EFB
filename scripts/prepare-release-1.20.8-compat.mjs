import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

const compatibility = [
  ['scripts/apply-release-1.20.3.mjs', /if \(!\[[^\n]+\]\.includes\(version\)\) throw new Error\(`1\.20\.3 release materializer[^\n]+/, "if (!['1.20.3', '1.20.4', '1.20.5', '1.20.6', '1.20.7', '1.20.8'].includes(version)) throw new Error(`1.20.3 release materializer requires a compatible 1.20.x chain, got ${version}.`);"],
  ['scripts/apply-release-1.20.4.mjs', /if \((?:version !== '1\.20\.4'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.4 release materializer[^\n]+/, "if (!['1.20.4', '1.20.5', '1.20.6', '1.20.7', '1.20.8'].includes(version)) throw new Error(`1.20.4 release materializer requires a compatible 1.20.4+ chain, got ${version}.`);"],
  ['scripts/apply-release-1.20.5.mjs', /if \((?:version !== '1\.20\.5'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.5 release materializer[^\n]+/, "if (!['1.20.5', '1.20.6', '1.20.7', '1.20.8'].includes(version)) throw new Error(`1.20.5 release materializer requires a compatible 1.20.5+ chain, got ${version}.`);"],
  ['scripts/apply-release-1.20.6.mjs', /if \((?:version !== '1\.20\.6'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.6 UI\/UX materializer[^\n]+/, "if (!['1.20.6', '1.20.7', '1.20.8'].includes(version)) throw new Error(`1.20.6 UI/UX materializer requires a compatible 1.20.6+ chain, got ${version}.`);"],
];

for (const [filename, pattern, replacement] of compatibility) {
  await update(filename, (source) => source.replace(pattern, replacement));
}

await update('scripts/apply-release-1.20.7.mjs', (source) => source.replace(
  /if \(version !== '1\.20\.7'\) throw new Error\(`1\.20\.7 release materializer[^\n]+/,
  "if (!['1.20.7', '1.20.8'].includes(version)) throw new Error(`1.20.7 release materializer requires a compatible 1.20.7+ chain, got ${version}.`);",
));

console.log('Prepared prior Flight Deck release materializers for the 1.20.8 chain.');
