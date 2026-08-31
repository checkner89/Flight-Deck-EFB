import fs from 'node:fs/promises';

const filename = 'scripts/prepare-release.mjs';
let source = await fs.readFile(filename, 'utf8');
let changed = false;

function replaceOnce(from, to, label) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`1.24.8 compatibility anchor missing: ${label}`);
  source = source.replace(from, to);
  changed = true;
}

replaceOnce(
  "const alreadyMaterialized = targetVersion === '1.24.7'",
  "const alreadyMaterialized = targetVersion === '1.24.8'\n  ? app.includes('function fd1248TrafficEntries(state = {})')\n    && server.includes('scheduleAutomaticSayIntentionsTaxiRoute')\n    && html.includes('data-app-version=\"1.24.8\"')\n    && electronMain.includes(\"title: 'FLYXORA 1.24.8'\")\n  : targetVersion === '1.24.7'",
  '1.24.8 already-materialized branch',
);

replaceOnce(
  "const modernTargets = ['1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7'];",
  "const modernTargets = ['1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7', '1.24.8'];",
  'modern target list',
);

const listPatches = [
  ["['1.24.4', '1.24.5', '1.24.6', '1.24.7']", "['1.24.4', '1.24.5', '1.24.6', '1.24.7', '1.24.8']"],
  ["['1.24.5', '1.24.6', '1.24.7']", "['1.24.5', '1.24.6', '1.24.7', '1.24.8']"],
  ["['1.24.6', '1.24.7']", "['1.24.6', '1.24.7', '1.24.8']"],
  ["['1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7']", "['1.24.2', '1.24.3', '1.24.4', '1.24.5', '1.24.6', '1.24.7', '1.24.8']"],
];
for (const [from, to] of listPatches) {
  if (source.includes(from)) {
    source = source.split(from).join(to);
    changed = true;
  }
}

replaceOnce(
  "  if (targetVersion === '1.24.7') await writePackageVersion('1.24.6');",
  "  if (['1.24.7', '1.24.8'].includes(targetVersion)) await writePackageVersion('1.24.6');",
  '1.24.6 compatibility downgrade',
);
replaceOnce(
  "    if (targetVersion === '1.24.7') await writePackageVersion(targetVersion);",
  "    if (['1.24.7', '1.24.8'].includes(targetVersion)) await writePackageVersion(targetVersion);",
  '1.24.6 compatibility restore',
);
replaceOnce(
  "if (targetVersion === '1.24.7') runScript('scripts/apply-release-1.24.7.mjs');",
  "if (['1.24.7', '1.24.8'].includes(targetVersion)) {\n  if (targetVersion === '1.24.8') await writePackageVersion('1.24.7');\n  try {\n    runScript('scripts/apply-release-1.24.7.mjs');\n  } finally {\n    if (targetVersion === '1.24.8') await writePackageVersion(targetVersion);\n  }\n}",
  '1.24.7 materializer bridge',
);
replaceOnce(
  "if (targetVersion === '1.24.7' && !trackingPerformanceReady1247(finalApp, finalHtml, finalElectronMain)) {",
  "if (['1.24.7', '1.24.8'].includes(targetVersion) && !trackingPerformanceReady1247(finalApp, finalHtml, finalElectronMain)) {",
  'tracking performance invariant',
);

if (!source.includes("'1.24.8'")) throw new Error('1.24.8 release orchestrator compatibility was not applied.');

if (changed) {
  await fs.writeFile(filename, source, 'utf8');
  console.log('FLYXORA 1.24.8 release orchestrator compatibility applied.');
} else {
  console.log('FLYXORA 1.24.8 release orchestrator already compatible.');
}
