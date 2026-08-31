import fs from 'node:fs/promises';

const filename = 'scripts/apply-release-1.24.7.mjs';
let source = await fs.readFile(filename, 'utf8');

const unsafe = "  next = replaceBetween(next, '  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;', '  const renderKey = trackingSelectedId ?', ownship, 'persistent ownship marker');";
const safe = `  {\n    // Scope the ownship patch strictly to renderTrackingMap(). The same liveAircraft\n    // anchor exists in an earlier helper in the fully materialized renderer; a global\n    // lookup would otherwise delete the Traffic helper block between both anchors.\n    const mapStart = next.indexOf('function renderTrackingMap(record) {');\n    const renderKey = next.indexOf('  const renderKey = trackingSelectedId ?', mapStart);\n    const ownshipStart = next.lastIndexOf('  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;', renderKey);\n    if (mapStart < 0 || renderKey < 0 || ownshipStart < mapStart) throw new Error('1.24.7 scoped ownship anchors missing.');\n    next = next.slice(0, ownshipStart) + ownship + next.slice(renderKey);\n  }`;

let changed = false;
if (source.includes(unsafe)) {
  source = source.replace(unsafe, safe);
  changed = true;
} else if (!source.includes('const ownshipStart = next.lastIndexOf(')) {
  throw new Error('1.24.7 compatibility patch could not find the ownship materializer anchor.');
}

// Keep the established 1.24.2 Traffic-selection and sticky-popup contracts literal
// while retaining the persistent marker closure. `key` is block-scoped per marker.
if (source.includes('        selectedTrafficTrailId = currentKey;')) {
  source = source.replace('        selectedTrafficTrailId = currentKey;', '        selectedTrafficTrailId = key;');
  changed = true;
}
if (source.includes('        openTrafficPopupId = currentKey;')) {
  source = source.replace('        openTrafficPopupId = currentKey;', '        openTrafficPopupId = key;');
  changed = true;
}

if (changed) {
  await fs.writeFile(filename, source, 'utf8');
  console.log('FLYXORA 1.24.7 materializer compatibility scoping applied.');
} else {
  console.log('FLYXORA 1.24.7 materializer compatibility already applied.');
}

async function patchBaseline(filename, replacements) {
  let text = await fs.readFile(filename, 'utf8');
  let next = text;
  for (const [from, to] of replacements) next = next.replace(from, to);
  if (next !== text) {
    await fs.writeFile(filename, next, 'utf8');
    return true;
  }
  return false;
}

const baselinePatches = [
  ['scripts/test-release-1.24.0.mjs', [
    ["['1.24.0', '1.24.1', '1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6'].includes(pkg.version)", "['1.24.0', '1.24.1', '1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7'].includes(pkg.version)"],
    ['Expected package version 1.24.0 through 1.24.6', 'Expected package version 1.24.0 through 1.24.7'],
    ["['1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6'].includes(pkg.version)", "['1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7'].includes(pkg.version)"],
    ["const expectedCache = pkg.version === '1.24.6'", "const expectedCache = pkg.version === '1.24.7'\n  ? 'flyxora-v1.24.7-tracking-performance'\n  : pkg.version === '1.24.6'"],
  ]],
  ['scripts/test-release-1.24.1.mjs', [
    ["['1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6'].includes(pkg.version)", "['1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7'].includes(pkg.version)"],
  ]],
  ['scripts/test-release-1.24.2.mjs', [
    ["const is1246 = pkg.version === '1.24.6';", "const is1246 = pkg.version === '1.24.6';\nconst is1247 = pkg.version === '1.24.7';"],
    ["['1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6'].includes(pkg.version)", "['1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7'].includes(pkg.version)"],
    ['Expected package version 1.24.2 through 1.24.6', 'Expected package version 1.24.2 through 1.24.7'],
    ["if (is1246) need(sw, 'flyxora-v1.24.6-desktop-shell', '1.24.6 service-worker cache marker is missing.');", "if (is1246) need(sw, 'flyxora-v1.24.6-desktop-shell', '1.24.6 service-worker cache marker is missing.');\nif (is1247) need(sw, 'flyxora-v1.24.7-tracking-performance', '1.24.7 service-worker cache marker is missing.');"],
  ]],
  ['scripts/test-release-1.24.3.mjs', [
    ["['1.24.4', '1.24.5', '1.24.6'].includes(pkg.version)", "['1.24.4', '1.24.5', '1.24.6', '1.24.7'].includes(pkg.version)"],
    ["['1.24.3', '1.24.4', '1.24.5', '1.24.6'].includes(pkg.version)", "['1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7'].includes(pkg.version)"],
    ['Expected package version 1.24.3 through 1.24.6', 'Expected package version 1.24.3 through 1.24.7'],
    ["const title = pkg.version === '1.24.6'", "const title = pkg.version === '1.24.7' ? \"title: 'FLYXORA 1.24.7'\" : pkg.version === '1.24.6'"],
    ["const expectedCache = pkg.version === '1.24.6'", "const expectedCache = pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6'"],
  ]],
  ['scripts/test-release-1.24.4.mjs', [
    ["['1.24.4', '1.24.5', '1.24.6'].includes(pkg.version)", "['1.24.4', '1.24.5', '1.24.6', '1.24.7'].includes(pkg.version)"],
    ['Expected package version 1.24.4 through 1.24.6', 'Expected package version 1.24.4 through 1.24.7'],
    ["const cache = pkg.version === '1.24.6'", "const cache = pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6'"],
  ]],
  ['scripts/test-release-1.24.5.mjs', [
    ["['1.24.5', '1.24.6'].includes(pkg.version)", "['1.24.5', '1.24.6', '1.24.7'].includes(pkg.version)"],
    ['Expected package version 1.24.5 or 1.24.6', 'Expected package version 1.24.5 through 1.24.7'],
    ["const title = pkg.version === '1.24.6'", "const title = pkg.version === '1.24.7' ? \"title: 'FLYXORA 1.24.7'\" : pkg.version === '1.24.6'"],
    ["need(app, pkg.version === '1.24.6' ? 'WINDOWS APP · v1.24.6' : 'WINDOWS APP · v1.24.5'", "need(app, pkg.version === '1.24.7' ? 'WINDOWS APP · v1.24.7' : pkg.version === '1.24.6' ? 'WINDOWS APP · v1.24.6' : 'WINDOWS APP · v1.24.5'"],
    ["need(sw, pkg.version === '1.24.6' ? 'flyxora-v1.24.6-desktop-shell' : 'flyxora-v1.24.5-stale-process'", "need(sw, pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6' ? 'flyxora-v1.24.6-desktop-shell' : 'flyxora-v1.24.5-stale-process'"],
  ]],
  ['scripts/test-release-1.24.6.mjs', [
    ["if (pkg.version !== '1.24.6') throw new Error(`Expected package version 1.24.6, got ${pkg.version}.`);", "if (!['1.24.6', '1.24.7'].includes(pkg.version)) throw new Error(`Expected package version 1.24.6 or 1.24.7, got ${pkg.version}.`);"],
    ["need(electronMain, \"title: 'FLYXORA 1.24.6'\"", "need(electronMain, pkg.version === '1.24.7' ? \"title: 'FLYXORA 1.24.7'\" : \"title: 'FLYXORA 1.24.6'\""],
    ["need(html, 'data-app-version=\"1.24.6\"'", "need(html, `data-app-version=\"${pkg.version}\"`"],
    ["need(sw, 'flyxora-v1.24.6-desktop-shell'", "need(sw, pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : 'flyxora-v1.24.6-desktop-shell'"],
  ]],
];

let patchedBaselines = 0;
for (const [testFile, replacements] of baselinePatches) {
  if (await patchBaseline(testFile, replacements)) patchedBaselines += 1;
}
console.log(patchedBaselines
  ? `FLYXORA 1.24.7 baseline compatibility applied to ${patchedBaselines} regression files.`
  : 'FLYXORA 1.24.7 baseline regressions already compatible.');
