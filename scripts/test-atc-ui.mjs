import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(packageJson.version || '').trim();
const [html, baseCss, polishCss, polishJs, appJs, prepareUi, releaseNotes] = await Promise.all([
  fs.readFile(path.join(root, 'public/index.html'), 'utf8'),
  fs.readFile(path.join(root, 'public/styles.css'), 'utf8'),
  fs.readFile(path.join(root, 'public/atc-polish.css'), 'utf8'),
  fs.readFile(path.join(root, 'public/atc-polish.js'), 'utf8'),
  fs.readFile(path.join(root, 'public/app.js'), 'utf8'),
  fs.readFile(path.join(root, 'scripts/prepare-release-ui.mjs'), 'utf8'),
  fs.readFile(path.join(root, 'release-notes', `${version}.md`), 'utf8'),
]);

for (const contract of [
  'data-page="atc"',
  'class="atc-layout combined-atc-layout"',
  'id="atc-provider-section"',
  'id="atc-clearance-section"',
  'class="efb-card manual-clearance"',
  'class="compatibility-note atc-compatibility-note"',
]) {
  assert.ok(html.includes(contract), `ATC DOM contract missing: ${contract}`);
}

assert.match(baseCss, /\.combined-atc-layout\s*\{[\s\S]*?grid-template-columns:\s*repeat\(12,/);
assert.match(baseCss, /\.combined-atc-layout\s+\.manual-clearance\s*\{\s*grid-column:\s*span\s*5;/);
assert.match(baseCss, /\.combined-atc-layout\s+\.atc-compatibility-note\s*\{\s*grid-column:\s*1\s*\/\s*-1;/);
assert.match(appJs, /querySelectorAll\('\[data-atc-panel\]'\)/, 'ATC tabs must hide/show data-atc-panel content');

assert.match(polishJs, /card\.dataset\.atcPanel\s*=\s*['"]clearance['"]/, 'SI controls must belong to the clearance tab');
assert.match(polishJs, /layout\.insertBefore\(card,\s*compatibility\)/, 'SI controls must be placed before the compatibility note');
assert.match(polishJs, /card\.hidden\s*=\s*activeAtcTab\(page\)\s*!==\s*['"]clearance['"]/, 'SI controls must follow the active ATC tab');
assert.match(polishJs, /MutationObserver/, 'ATC polish must tolerate SI controls being injected after page creation');
assert.match(polishJs, /\[data-atc-tab\]/, 'ATC polish must react to ATC tab changes');

assert.match(polishCss, /\.combined-atc-layout\s*>\s*\.si-atc-ops-card\s*\{[\s\S]*?grid-column:\s*span\s*7;/, 'Desktop SI controls must occupy the intended seven-column slot');
assert.match(polishCss, /@media\s*\(max-width:\s*1180px\)[\s\S]*?\.si-atc-ops-card\s*\{[\s\S]*?grid-column:\s*span\s*6;/, 'Medium ATC layout must balance to six columns');
assert.match(polishCss, /@media\s*\(max-width:\s*980px\)[\s\S]*?grid-column:\s*1\s*\/\s*-1\s*!important;/, 'Tablet ATC layout must become full width');
assert.match(polishCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?grid-template-columns:\s*1fr;/, 'Mobile SI controls must stack cleanly');
assert.match(polishCss, /html\[data-theme=["']light["']\][\s\S]*?\.si-atc-ops-card\s+select/, 'Light theme ATC controls must be explicitly readable');

assert.match(prepareUi, /atc-polish\.css/, 'Release UI preparation must version/inject atc-polish.css');
assert.match(prepareUi, /atc-polish\.js/, 'Release UI preparation must version/inject atc-polish.js');

const noteLines = releaseNotes.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
assert.match(noteLines[0] || '', new RegExp(`^##\\s+${version.replaceAll('.', '\\.')}(?:\\s|$)`), 'Release notes heading must match package version');
const bodyLines = noteLines.slice(1);
assert.ok(bodyLines.length >= 3, 'Release notes should contain several useful bullet points');
for (const line of bodyLines) {
  assert.match(line, /^-\s+\S/, `Changelog entries must use bullet points: ${line}`);
}

console.log(`ATC Center UI and bullet-point changelog regression checks passed for ${version}.`);
