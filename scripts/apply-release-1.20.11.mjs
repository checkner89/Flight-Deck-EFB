import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.11');
if (version !== '1.20.11') throw new Error(`1.20.11 release materializer requires package version 1.20.11, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`1.20.11 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('src/server.mjs', (source) => source.replace(/^const APP_VERSION = '[^']+';$/m, `const APP_VERSION = '${version}';`));

await update('src/simconnect-client.mjs', (source) => {
  let next = source;
  next = replaceRequired(
    next,
    "    addFloat('PLANE ALTITUDE', 'feet');\n    addFloat('PLANE ALT ABOVE GROUND', 'feet');",
    "    // PLANE ALTITUDE is geometric/true altitude and can differ materially from the cockpit altimeter.\n    // Tracking must follow the same barometric reference the pilot sees: QNH below transition, STD in flight levels.\n    addFloat('PLANE ALTITUDE', 'feet');\n    addFloat('INDICATED ALTITUDE', 'feet');\n    addFloat('KOHLSMAN SETTING MB:1', 'millibars');\n    addInt('KOHLSMAN SETTING STD:1', 'bool');\n    addFloat('PLANE ALT ABOVE GROUND', 'feet');",
    'barometric altitude SimVars',
  );
  next = replaceRequired(
    next,
    "        altitudeFeet: received.data.readFloat64(),\n        aglFeet: received.data.readFloat64(),",
    "        trueAltitudeFeet: received.data.readFloat64(),\n        altitudeFeet: received.data.readFloat64(),\n        altimeterSettingHpa: received.data.readFloat64(),\n        altimeterStandard: received.data.readInt32() === 1,\n        aglFeet: received.data.readFloat64(),",
    'barometric altitude telemetry mapping',
  );
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (/^##\s+1\.20\.11\b/m.test(source)) return source;
  const notes = `## 1.20.11 — Barometric Altitude / QNH\n\n- Flight Tracking now uses MSFS **INDICATED ALTITUDE** as the primary displayed altitude instead of geometric **PLANE ALTITUDE**.\n- The altitude therefore follows the aircraft altimeter reference: the selected **QNH** below transition altitude and **STD / 1013.25 hPa** when standard pressure is selected.\n- Geometric/true altitude is retained separately as \`trueAltitudeFeet\` for diagnostics and future calculations instead of being shown as the pilot altitude.\n- The active altimeter pressure setting and STD state are exposed as telemetry, preventing cases where a flight at FL370 appears near 39,000 ft because of atmospheric conditions.\n\n`;
  const headingEnd = source.indexOf('\n') + 1;
  return `${source.slice(0, headingEnd)}\n${notes}${source.slice(headingEnd)}`;
});

console.log('Flight Deck EFB 1.20.11 barometric altitude/QNH telemetry materialized.');
