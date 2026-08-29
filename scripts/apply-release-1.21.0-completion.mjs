import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 completion patch requires package version 1.21.0, got ${pkg.version}.`);

await import('./apply-release-1.21.0-arrival-lifecycle.mjs');
await import('./apply-release-1.21.0-media-capacity.mjs');
await import('./apply-release-1.21.0-media-runtime-hotfix.mjs');

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('public/app.js', (source) => {
  let next = source;
  if (!next.includes('runwayExit: window.__flightDeckArrivalExit || null')) {
    const anchor = "  return { mode, runway, destination: { type: 'feature', id: destination } };";
    if (!next.includes(anchor)) throw new Error('1.21.0 arrival request anchor missing.');
    next = next.replace(anchor, "  return { mode, runway, runwayExit: window.__flightDeckArrivalExit || null, destination: { type: 'feature', id: destination } };");
  }
  if (!next.includes('runwayExit: request.runwayExit || null, destination')) {
    const startAnchor = "body: JSON.stringify({ route, mode: request.mode, runway: request.runway || null, destination }),";
    if (!next.includes(startAnchor)) throw new Error('1.21.0 taxi start request anchor missing.');
    next = next.replace(startAnchor, "body: JSON.stringify({ route, mode: request.mode, runway: request.runway || null, runwayExit: request.runwayExit || null, destination }),");
  }
  return next;
});

await update('src/server.mjs', (source) => {
  if (source.includes('runwayExit: body.runwayExit || null,')) return source;
  const anchor = "          mode: body.mode,\n          runway: body.runway || null,";
  if (!source.includes(anchor)) throw new Error('1.21.0 taxi-plan metadata anchor missing.');
  return source.replace(anchor, "          mode: body.mode,\n          runway: body.runway || null,\n          runwayExit: body.runwayExit || null,");
});

console.log('Flight Deck EFB 1.21.0 runway-exit and media lifecycle completion patch applied.');
