import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 completion patch requires package version 1.21.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('public/app.js', (source) => {
  if (source.includes('runwayExit: window.__flightDeckArrivalExit || null')) return source;
  const anchor = "  return { mode, runway, destination: { type: 'feature', id: destination } };";
  if (!source.includes(anchor)) throw new Error('1.21.0 arrival request anchor missing.');
  return source.replace(anchor, "  return { mode, runway, runwayExit: window.__flightDeckArrivalExit || null, destination: { type: 'feature', id: destination } };");
});

await update('src/server.mjs', (source) => {
  if (source.includes('runwayExit: body.runwayExit || null,')) return source;
  const anchor = "          mode: body.mode,\n          runway: body.runway || null,";
  if (!source.includes(anchor)) throw new Error('1.21.0 taxi-plan metadata anchor missing.');
  return source.replace(anchor, "          mode: body.mode,\n          runway: body.runway || null,\n          runwayExit: body.runwayExit || null,");
});

console.log('Flight Deck EFB 1.21.0 arrival-exit and media lifecycle completion patch applied.');
