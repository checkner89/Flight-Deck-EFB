import fs from 'node:fs/promises';

const VERSION = '1.24.8';
const CACHE = 'flyxora-v1.24.8-taxi-vatsim-profile';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.8 release updated ${filename}`);
  }
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== VERSION) throw new Error(`1.24.8 release materializer expected package ${VERSION}, got ${pkg.version}.`);

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, `data-app-version="${VERSION}"`)
  .replace(/\?v=1\.24\.7\b/g, `?v=${VERSION}`));

await update('src/server.mjs', (source) => source
  .replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${VERSION}';`));

await update('src/electron-main.mjs', (source) => source
  .replace(/title: 'FLYXORA 1\.24\.7'/g, `title: 'FLYXORA ${VERSION}'`));

await update('public/service-worker.js', (source) => source
  .replace(/flyxora-v1\.24\.7-tracking-performance/g, CACHE)
  .replace(/\?v=1\.24\.7\b/g, `?v=${VERSION}`));

// Keep the established regression chain active for 1.24.8 instead of dropping old gates.
await update('scripts/test-release-1.24.0.mjs', (source) => {
  let next = source;
  next = next.replace("'1.24.7'].includes(pkg.version)", "'1.24.7', '1.24.8'].includes(pkg.version)");
  next = next.replace(/through 1\.24\.7/g, 'through 1.24.8');
  if (!next.includes("pkg.version === '1.24.8'")) {
    next = next.replace("const expectedCache = pkg.version === '1.24.7'\n  ? 'flyxora-v1.24.7-tracking-performance'", `const expectedCache = pkg.version === '1.24.8'\n  ? '${CACHE}'\n  : pkg.version === '1.24.7'\n  ? 'flyxora-v1.24.7-tracking-performance'`);
  }
  return next;
});

await update('scripts/test-release-1.24.1.mjs', (source) => source
  .replace("'1.24.7'].includes(pkg.version)", "'1.24.7', '1.24.8'].includes(pkg.version)"));

await update('scripts/test-release-1.24.2.mjs', (source) => {
  let next = source;
  next = next.replace("'1.24.7'].includes(pkg.version)", "'1.24.7', '1.24.8'].includes(pkg.version)");
  next = next.replace(/through 1\.24\.7/g, 'through 1.24.8');
  if (!next.includes("const is1248 = pkg.version === '1.24.8';")) {
    next = next.replace("const is1247 = pkg.version === '1.24.7';", "const is1247 = pkg.version === '1.24.7';\nconst is1248 = pkg.version === '1.24.8';");
  }
  if (!next.includes("if (is1248) need(sw")) {
    next = next.replace(
      "if (is1247) need(sw, 'flyxora-v1.24.7-tracking-performance', '1.24.7 service-worker cache marker is missing.');",
      `if (is1247) need(sw, 'flyxora-v1.24.7-tracking-performance', '1.24.7 service-worker cache marker is missing.');\nif (is1248) need(sw, '${CACHE}', '1.24.8 service-worker cache marker is missing.');`,
    );
  }
  return next;
});

await update('scripts/test-release-1.24.3.mjs', (source) => {
  let next = source;
  next = next.replace(/'1\.24\.7'\]\.includes\(pkg\.version\)/g, "'1.24.7', '1.24.8'].includes(pkg.version)");
  next = next.replace(/through 1\.24\.7/g, 'through 1.24.8');
  next = next.replace(
    "const title = pkg.version === '1.24.7' ? \"title: 'FLYXORA 1.24.7'\" : pkg.version === '1.24.6'",
    `const title = pkg.version === '1.24.8' ? "title: 'FLYXORA 1.24.8'" : pkg.version === '1.24.7' ? "title: 'FLYXORA 1.24.7'" : pkg.version === '1.24.6'`,
  );
  next = next.replace(
    "const expectedCache = pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6'",
    `const expectedCache = pkg.version === '1.24.8' ? '${CACHE}' : pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6'`,
  );
  return next;
});

await update('scripts/test-release-1.24.4.mjs', (source) => {
  let next = source;
  next = next.replace("'1.24.7'].includes(pkg.version)", "'1.24.7', '1.24.8'].includes(pkg.version)");
  next = next.replace(/through 1\.24\.7/g, 'through 1.24.8');
  next = next.replace(
    "const cache = pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6'",
    `const cache = pkg.version === '1.24.8' ? '${CACHE}' : pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6'`,
  );
  return next;
});

await update('scripts/test-release-1.24.5.mjs', (source) => {
  let next = source;
  next = next.replace("'1.24.7'].includes(pkg.version)", "'1.24.7', '1.24.8'].includes(pkg.version)");
  next = next.replace(/through 1\.24\.7/g, 'through 1.24.8');
  next = next.replace(
    "const title = pkg.version === '1.24.7' ? \"title: 'FLYXORA 1.24.7'\" : pkg.version === '1.24.6'",
    `const title = pkg.version === '1.24.8' ? "title: 'FLYXORA 1.24.8'" : pkg.version === '1.24.7' ? "title: 'FLYXORA 1.24.7'" : pkg.version === '1.24.6'`,
  );
  next = next.replace(
    "need(sw, pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6'",
    `need(sw, pkg.version === '1.24.8' ? '${CACHE}' : pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : pkg.version === '1.24.6'`,
  );
  return next;
});

await update('scripts/test-release-1.24.6.mjs', (source) => {
  let next = source;
  next = next.replace("['1.24.6', '1.24.7'].includes(pkg.version)", "['1.24.6', '1.24.7', '1.24.8'].includes(pkg.version)");
  next = next.replace('1.24.6 or 1.24.7', '1.24.6 through 1.24.8');
  next = next.replace(
    "pkg.version === '1.24.7' ? \"title: 'FLYXORA 1.24.7'\" : \"title: 'FLYXORA 1.24.6'\"",
    `pkg.version === '1.24.8' ? "title: 'FLYXORA 1.24.8'" : pkg.version === '1.24.7' ? "title: 'FLYXORA 1.24.7'" : "title: 'FLYXORA 1.24.6'"`,
  );
  next = next.replace(
    "pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : 'flyxora-v1.24.6-desktop-shell'",
    `pkg.version === '1.24.8' ? '${CACHE}' : pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance' : 'flyxora-v1.24.6-desktop-shell'`,
  );
  return next;
});

await update('scripts/test-release-1.24.7.mjs', (source) => {
  let next = source;
  next = next.replace(
    "if (pkg.version !== '1.24.7') throw new Error(`Expected package version 1.24.7, got ${pkg.version}.`);",
    "if (!['1.24.7', '1.24.8'].includes(pkg.version)) throw new Error(`Expected package version 1.24.7 or 1.24.8, got ${pkg.version}.`);",
  );
  next = next.replace(
    "need(html, 'data-app-version=\"1.24.7\"', 'HTML app version is not 1.24.7.');",
    "need(html, `data-app-version=\"${pkg.version}\"`, `HTML app version is not ${pkg.version}.`);",
  );
  next = next.replace(
    "need(html, '/release-1.24.7.css?v=1.24.7', '1.24.7 stylesheet is not loaded.');",
    "need(html, `/release-1.24.7.css?v=${pkg.version}`, `${pkg.version} tracking stylesheet is not loaded.`);",
  );
  next = next.replace(
    "need(electronMain, \"title: 'FLYXORA 1.24.7'\", 'Windows title does not identify FLYXORA 1.24.7.');",
    "need(electronMain, `title: 'FLYXORA ${pkg.version}'`, `Windows title does not identify FLYXORA ${pkg.version}.`);",
  );
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.8 — TaxiNow, Network Traffic & Tracking Polish')) return source;
  const heading = '# Flight Deck EFB changelog';
  if (!source.includes(heading)) throw new Error('1.24.8 changelog heading missing.');
  const notes = `## 1.24.8 — TaxiNow, Network Traffic & Tracking Polish\n\n- SayIntentions TaxiNow now keeps exact taxi paths stable across transient flightJSON polls and automatically derives a taxi route from genuine taxi clearances when no exact path is supplied.\n- Taxi clearance ingestion ignores unrelated airborne/frequency radio calls and handles both clearance-before-path and path-before-clearance ordering safely.\n- Added automatic arrival taxi routing toward the assigned gate when the clearance contains a usable taxiway sequence.\n- Live Tracking merges enabled VATSIM/IVAO pilots with simulator traffic, deduplicates callsigns and refreshes the selected online network continuously.\n- Restored the planned route in the Tracking context and reorganized DEP/ARR so both fit cleanly below the route.\n- Aligned Flight Profile controls and MAX ALT metrics and removed the obsolete no-planned-profile footer note.\n- Added dedicated regressions for SayIntentions taxi routing, VATSIM refresh/merge behavior, route context and Flight Profile layout.\n`;
  return source.replace(heading, `${heading}\n\n${notes}`);
});

console.log('FLYXORA 1.24.8 release materialization completed.');
