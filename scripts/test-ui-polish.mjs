import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeBasicEntities, isTurnaroundInactive, normalizeAircraftView } from '../public/ui-polish.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [css, js, prepareUi, electronMain, groundCss] = await Promise.all([
  fs.readFile(path.join(root, 'public/ui-polish.css'), 'utf8'),
  fs.readFile(path.join(root, 'public/ui-polish.js'), 'utf8'),
  fs.readFile(path.join(root, 'scripts/prepare-release-ui.mjs'), 'utf8'),
  fs.readFile(path.join(root, 'src/electron-main.mjs'), 'utf8'),
  fs.readFile(path.join(root, 'public/ground-polish.css'), 'utf8'),
]);

assert.equal(normalizeAircraftView('pmdg'), 'pmdg');
assert.equal(normalizeAircraftView('status'), 'status');
assert.equal(normalizeAircraftView('invalid'), 'fenix');
assert.equal(isTurnaroundInactive('INACTIVE', 'IN FLIGHT'), true);
assert.equal(isTurnaroundInactive('working', 'boarding'), false);
assert.equal(decodeBasicEntities('Ground Services &amp; GSX'), 'Ground Services & GSX');

const requiredCssTokens = [
  '.ground-polished .ground-layout[hidden]',
  '.ground-polished .gsx-remote-workspace[hidden]',
  'display: none !important;',
  'turnaround-inactive',
  'traffic-offline-state',
  'leaflet-airportFocusMask-pane',
  'fill-opacity: .995',
  'data-stable-aircraft-view="pmdg"',
  'data-stable-aircraft-view="status"',
  '.settings-primary-tile',
  '.update-changelog-card',
  '.legal-card',
  '#legal-dialog .legal-content',
  'overflow-x: hidden',
  '.ui-polish-v2 input:not',
  '.ui-polish-v2 textarea',
  '.ui-polish-v2 select',
  'border-radius: 10px !important',
  '.update-dialog-notes ul',
  'list-style: disc outside !important',
];
for (const token of requiredCssTokens) assert.ok(css.includes(token), `Missing UI polish CSS contract: ${token}`);

const requiredJsTokens = [
  'AIRCRAFT_VIEW_KEY',
  'stableAircraftView',
  'MutationObserver',
  "progress.textContent = '—'",
  "bar.style.width = '0%'",
  'traffic-offline-state',
  'settings-primary-tile',
  'ÄLTERE VERSIONEN',
  'changelog-dialog',
];
for (const token of requiredJsTokens) assert.ok(js.includes(token), `Missing UI polish JS contract: ${token}`);

assert.ok(groundCss.includes('.ground-polished .ground-layout'), 'Ground dashboard layout contract is missing.');
assert.ok(groundCss.includes('display: grid !important;'), 'Ground dashboard must keep its explicit grid display rule.');

assert.ok(electronMain.includes('decodeReleaseEntities'), 'Updater entity decoding is missing.');
assert.ok(electronMain.includes('<li[^>]*>'), 'Updater HTML list conversion is missing.');
assert.ok(electronMain.includes('&amp;'), 'Updater HTML entity handling is missing.');

for (const asset of ['ui-polish.js', 'ui-polish.css']) {
  assert.ok(prepareUi.includes(asset), `Release preparation must include ${asset}`);
}

console.log('Global UI polish regression checks passed.');
