import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 test compatibility patch requires package version 1.21.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

for (const filename of ['scripts/test-release-1.20.5.mjs', 'scripts/test-release-1.20.6.mjs', 'scripts/test-release-1.20.7.mjs']) {
  await update(filename, (source) => {
    if (source.includes("'flight-deck-efb-v1210-backlog1'")) return source;
    const anchor = "  'flight-deck-efb-v1209-tracking1',";
    if (!source.includes(anchor)) throw new Error(`1.21.0 cache compatibility anchor missing in ${filename}.`);
    return source.replace(anchor, `${anchor}\n  'flight-deck-efb-v1210-backlog1',`);
  });
}

console.log('Flight Deck EFB 1.21.0 legacy regression cache compatibility applied.');
