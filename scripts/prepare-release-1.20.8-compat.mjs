import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

const compatibility = [
  ['scripts/apply-release-1.20.3.mjs', /if \(!\[[^\n]+\]\.includes\(version\)\) throw new Error\(`1\.20\.3 release materializer[^\n]+/, "if (!['1.20.3', '1.20.4', '1.20.5', '1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.3 release materializer requires a compatible 1.20.x chain, got ${version}.`);"],
  ['scripts/apply-release-1.20.4.mjs', /if \((?:version !== '1\.20\.4'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.4 release materializer[^\n]+/, "if (!['1.20.4', '1.20.5', '1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.4 release materializer requires a compatible 1.20.4+ chain, got ${version}.`);"],
  ['scripts/apply-release-1.20.5.mjs', /if \((?:version !== '1\.20\.5'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.5 release materializer[^\n]+/, "if (!['1.20.5', '1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.5 release materializer requires a compatible 1.20.5+ chain, got ${version}.`);"],
  ['scripts/apply-release-1.20.6.mjs', /if \((?:version !== '1\.20\.6'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.6 UI\/UX materializer[^\n]+/, "if (!['1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.6 UI/UX materializer requires a compatible 1.20.6+ chain, got ${version}.`);"],
];

for (const [filename, pattern, replacement] of compatibility) {
  await update(filename, (source) => source.replace(pattern, replacement));
}

await update('scripts/apply-release-1.20.7.mjs', (source) => source.replace(
  /if \((?:version !== '1\.20\.7'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.7 release materializer[^\n]+/,
  "if (!['1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.7 release materializer requires a compatible 1.20.7+ chain, got ${version}.`);",
));

await update('scripts/apply-release-1.20.8.mjs', (source) => source.replace(
  /if \((?:version !== '1\.20\.8'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.8 release materializer[^\n]+/,
  "if (!['1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.8 release materializer requires a compatible 1.20.8+ chain, got ${version}.`);",
));

await update('scripts/apply-release-1.20.9.mjs', (source) => {
  let next = source.replace(
    /if \((?:version !== '1\.20\.9'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.9 release materializer[^\n]+/,
    "if (!['1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.9 release materializer requires a compatible 1.20.9+ chain, got ${version}.`);",
  );
  if (!next.includes("label === 'waypoint toggle element'")) {
    const pattern = /function replaceRequired\(source, from, to, label\) \{\r?\n\s*if \(source\.includes\(to\)\) return source;/;
    if (!pattern.test(next)) throw new Error('1.20.9 compatibility patch could not locate replaceRequired().');
    next = next.replace(pattern,
      "function replaceRequired(source, from, to, label) {\n  if (label === 'waypoint toggle element' && source.includes(\"trackingWaypointsToggle: $('#tracking-waypoints-toggle')\")) return source;\n  if (label === 'waypoint visibility state' && source.includes(\"let trackingWaypointsVisible = localStorage.getItem('flight-deck-tracking-waypoints') !== 'hidden';\")) return source;\n  if (source.includes(to)) return source;"
    );
  }
  return next;
});

await update('scripts/apply-release-1.20.10.mjs', (source) => source.replace(
  /if \(version !== '1\.20\.10'\) throw new Error\(`1\.20\.10 release materializer[^\n]+/,
  "if (!['1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.10 release materializer requires a compatible 1.20.10+ chain, got ${version}.`);",
));

await update('scripts/test-release-1.20.9.mjs', (source) => {
  let test = source;
  test = test.replace(
    /if \((?:pkg\.version !== '1\.20\.9'|!\[[^\n]+\]\.includes\(pkg\.version\))\) throw new Error\(`Expected package version[^\n]+/,
    "if (!['1.20.9', '1.20.10', '1.20.11'].includes(pkg.version)) throw new Error(`Expected package version 1.20.9+, got ${pkg.version}.`);",
  );
  test = test.replace(
    /need\(server, .*Server version was not materialized[^\n]+/,
    "need(server, `const APP_VERSION = '${pkg.version}';`, `Server version was not materialized to ${pkg.version}.`);",
  );
  test = test.replace(
    /need\(html, .*release-1\.20\.9\.css[^\n]+/,
    "need(html, `release-1.20.9.css?v=${pkg.version}`, '1.20.9 tracking stylesheet is not wired for the active patch release.');",
  );
  return test;
});

await update('scripts/test-release-1.20.10.mjs', (source) => {
  let test = source;
  test = test.replace(
    "if (pkg.version !== '1.20.10') throw new Error(`Expected package version 1.20.10, got ${pkg.version}.`);",
    "if (!['1.20.10', '1.20.11'].includes(pkg.version)) throw new Error(`Expected package version 1.20.10+, got ${pkg.version}.`);",
  );
  test = test.replace(
    "need(server, \"const APP_VERSION = '1.20.10';\", 'Server version was not materialized to 1.20.10.');",
    "need(server, `const APP_VERSION = '${pkg.version}';`, `Server version was not materialized to ${pkg.version}.`);",
  );
  test = test.replace(
    "need(html, 'release-1.20.10.css?v=1.20.10', '1.20.10 stylesheet is not wired.');",
    "need(html, `release-1.20.10.css?v=${pkg.version}`, '1.20.10 stylesheet is not wired for the active patch release.');",
  );
  return test;
});

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

console.log('Prepared prior Flight Deck release materializers and regression suites for the 1.20.11 chain.');
