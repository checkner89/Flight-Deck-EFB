import fs from 'node:fs/promises';

const filename = 'scripts/apply-release-1.24.2.mjs';
const source = await fs.readFile(filename, 'utf8');
const legacy = "  next = replaceBetween(next, '  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;', '  const renderKey = trackingSelectedId ?', ownshipBlock, 'red ownship aircraft');";
const marker = "const trackingMapStart = next.indexOf('function renderTrackingMap(record) {');";

if (source.includes(marker)) {
  console.log('FLYXORA 1.24.2 ownship materializer anchor is already scoped to renderTrackingMap.');
  process.exit(0);
}
if (!source.includes(legacy)) {
  throw new Error('1.24.2 ownship materializer compatibility anchor is missing.');
}

const fixed = `  const trackingMapStart = next.indexOf('function renderTrackingMap(record) {');
  const ownshipStart = next.indexOf('  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;', trackingMapStart);
  const ownshipEnd = next.indexOf('  const renderKey = trackingSelectedId ?', ownshipStart);
  if (trackingMapStart < 0 || ownshipStart < 0 || ownshipEnd < 0) throw new Error('1.24.2 red ownship aircraft range missing inside renderTrackingMap');
  next = next.slice(0, ownshipStart) + ownshipBlock + next.slice(ownshipEnd);`;

await fs.writeFile(filename, source.replace(legacy, fixed), 'utf8');
console.log('FLYXORA 1.24.2 ownship materializer anchor scoped to renderTrackingMap.');
