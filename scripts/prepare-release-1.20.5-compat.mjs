import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('scripts/apply-release-1.20.3.mjs', (source) => source
  .replace(
    /if \(!\[[^\n]+\]\.includes\(version\)\) throw new Error\(`1\.20\.3 release materializer[^\n]+/,
    "if (!['1.20.3', '1.20.4', '1.20.5', '1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.3 release materializer requires a compatible 1.20.x chain, got ${version}.`);",
  ));

await update('scripts/apply-release-1.20.4.mjs', (source) => source
  .replace(
    /if \((?:version !== '1\.20\.4'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.4 release materializer[^\n]+/,
    "if (!['1.20.4', '1.20.5', '1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.4 release materializer requires a compatible 1.20.4+ chain, got ${version}.`);",
  )
  .replace(
    "  if (!js.includes(\"label: 'OPERATIONAL FLIGHT PLAN'\")) {",
    "  if (!js.includes(\"label: 'OPERATIONAL FLIGHT PLAN'\") && !js.includes(\"title: 'Flight Deck OFP'\")) {",
  ));

await update('scripts/apply-release-1.20.5.mjs', (source) => source
  .replace(
    /if \((?:version !== '1\.20\.5'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.5 release materializer[^\n]+/,
    "if (!['1.20.5', '1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.5 release materializer requires a compatible 1.20.5+ chain, got ${version}.`);",
  ));

await update('scripts/apply-release-1.20.6.mjs', (source) => source
  .replace(
    /if \((?:version !== '1\.20\.6'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.6 UI\/UX materializer[^\n]+/,
    "if (!['1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.6 UI/UX materializer requires a compatible 1.20.6+ chain, got ${version}.`);",
  ));

await update('scripts/apply-release-1.20.7.mjs', (source) => source
  .replace(
    /if \((?:version !== '1\.20\.7'|!\[[^\n]+\]\.includes\(version\))\) throw new Error\(`1\.20\.7 materializer[^\n]+/,
    "if (!['1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(version)) throw new Error(`1.20.7 materializer requires a compatible 1.20.7+ chain, got ${version}.`);",
  ));

await update('scripts/test-release-1.20.5.mjs', (source) => {
  let next = source.replace(
    /const compatibleVersions = \[[^\n]+\];/,
    "const compatibleVersions = ['1.20.5', '1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'];",
  );
  if (!next.includes("'flight-deck-efb-v12011-weather-altitude1',")) {
    next = next.replace("  'flight-deck-efb-v1209-tracking1',", "  'flight-deck-efb-v1209-tracking1',\n  'flight-deck-efb-v12011-weather-altitude1',");
  }
  return next;
});

await update('scripts/test-release-1.20.6.mjs', (source) => {
  let next = source.replace(
    /if \(!\[[^\n]+\]\.includes\(pkg\.version\)\) throw new Error\(`Unexpected package version: \$\{pkg\.version\}`\);/,
    "if (!['1.20.6', '1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(pkg.version)) throw new Error(`Unexpected package version: ${pkg.version}`);",
  );
  if (!next.includes("'flight-deck-efb-v12011-weather-altitude1',")) {
    next = next.replace("  'flight-deck-efb-v1209-tracking1',", "  'flight-deck-efb-v1209-tracking1',\n  'flight-deck-efb-v12011-weather-altitude1',");
  }
  return next;
});

await update('scripts/test-release-1.20.7.mjs', (source) => {
  let next = source.replace(
    /if \(!\[[^\n]+\]\.includes\(pkg\.version\)\) throw new Error\(`Unexpected package version: \$\{pkg\.version\}`\);/,
    "if (!['1.20.7', '1.20.8', '1.20.9', '1.20.10', '1.20.11'].includes(pkg.version)) throw new Error(`Unexpected package version: ${pkg.version}`);",
  );
  if (!next.includes("'flight-deck-efb-v12011-weather-altitude1',")) {
    next = next.replace("  'flight-deck-efb-v1209-tracking1',", "  'flight-deck-efb-v1209-tracking1',\n  'flight-deck-efb-v12011-weather-altitude1',");
  }
  next = next.replace(
    "if (version === '1.20.9') await import('./test-release-1.20.9.mjs');",
    "if (['1.20.9', '1.20.10', '1.20.11'].includes(version)) await import('./test-release-1.20.9.mjs');",
  );
  return next;
});

console.log('Prepared prior Flight Deck release materializers and regression suites for the 1.20.11 chain.');
