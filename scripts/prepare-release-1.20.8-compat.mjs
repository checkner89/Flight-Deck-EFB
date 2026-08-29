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

// Previous materializers can reformat the SimBrief fetch options. Ensure the
// required no-store flag exists before apply-release-1.20.8.mjs runs so clean
// CI checkouts and repeated prepare runs remain idempotent.
await update('src/simbrief-client.mjs', (source) => {
  if (source.includes("cache: 'no-store'")) return source;
  const fetchStart = /const response = await this\.fetchImpl\(url,\s*\{/;
  if (!fetchStart.test(source)) {
    throw new Error('1.20.8 compatibility patch could not locate the SimBrief fetch call.');
  }
  return source.replace(fetchStart, (match) => `${match}\n      cache: 'no-store',`);
});

console.log('Prepared prior Flight Deck release materializers and resilient SimBrief fetch for the 1.20.8 chain.');
