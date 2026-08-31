import fs from 'node:fs/promises';

const filename = 'scripts/apply-release-1.24.7.mjs';
let source = await fs.readFile(filename, 'utf8');

const unsafe = "  next = replaceBetween(next, '  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;', '  const renderKey = trackingSelectedId ?', ownship, 'persistent ownship marker');";
const safe = `  {\n    // Scope the ownship patch strictly to renderTrackingMap(). The same liveAircraft\n    // anchor exists in an earlier helper in the fully materialized renderer; a global\n    // lookup would otherwise delete the Traffic helper block between both anchors.\n    const mapStart = next.indexOf('function renderTrackingMap(record) {');\n    const renderKey = next.indexOf('  const renderKey = trackingSelectedId ?', mapStart);\n    const ownshipStart = next.lastIndexOf('  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;', renderKey);\n    if (mapStart < 0 || renderKey < 0 || ownshipStart < mapStart) throw new Error('1.24.7 scoped ownship anchors missing.');\n    next = next.slice(0, ownshipStart) + ownship + next.slice(renderKey);\n  }`;

if (source.includes(unsafe)) {
  source = source.replace(unsafe, safe);
  await fs.writeFile(filename, source, 'utf8');
  console.log('FLYXORA 1.24.7 ownship materializer scoped to renderTrackingMap.');
} else if (source.includes('const ownshipStart = next.lastIndexOf(')) {
  console.log('FLYXORA 1.24.7 ownship materializer already scoped.');
} else {
  throw new Error('1.24.7 compatibility patch could not find the ownship materializer anchor.');
}
