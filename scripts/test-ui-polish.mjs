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

// GSX tabs must truly replace one another even though both workspaces use explicit display rules.
assert.match(css, /\.ground-polished\s+\.ground-layout\[hidden\][\s\S]*display:\s*none\s*!important/);
assert.match(css, /\.ground-polished\s+\.gsx-remote-workspace\[hidden\][\s\S]*display:\s*none\s*!important/);
assert.match(groundCss, /\.ground-polished\s+\.ground-layout\s*\{[\s\S]*display:\s*grid\s*!important/);

// Turnaround must not display the backend's inactive 100% as operational progress.
assert.match(js, /isTurnaroundInactive/);
assert.match(js, /progress\.textContent\s*=\s*['"]—['"]/);
assert.match(js, /bar\.style\.width\s*=\s*['"]0%['"]/);

// Aircraft connector selection must survive live state re-renders.
assert.match(js, /AIRCRAFT_VIEW_KEY/);
assert.match(js, /data-stable-aircraft-view|stableAircraftView/);
assert.match(js, /MutationObserver/);
assert.match(css, /data-stable-aircraft-view=["']pmdg["']/);
assert.match(css, /data-stable-aircraft-view=["']status["']/);

// Live Traffic offline state and Taxi focus must use intentional visual states.
assert.match(js, /traffic-offline-state/);
assert.match(css, /traffic-offline-state/);
assert.match(css, /leaflet-airportFocusMask-pane/);
assert.match(css, /fill-opacity:\s*\.995/);

// Settings layout: equal primary tiles, full-width changelog/legal and older-version modal.
assert.match(js, /settings-primary-tile/);
assert.match(js, /ÄLTERE VERSIONEN/);
assert.match(js, /changelog-dialog/);
assert.match(css, /\.settings-polished\s+\.settings-primary-tile[\s\S]*grid-column:\s*span\s+6/);
assert.match(css, /\.settings-polished\s+\.update-changelog-card[\s\S]*grid-column:\s*1\s*\/\s*-1/);
assert.match(css, /\.settings-polished\s+\.legal-card[\s\S]*grid-column:\s*1\s*\/\s*-1/);
assert.match(css, /#legal-dialog\s+\.legal-content[\s\S]*overflow-x:\s*hidden/);

// Form controls must share the modern Flight Deck appearance across the app.
assert.match(css, /\.ui-polish-v2\s+input:not/);
assert.match(css, /\.ui-polish-v2\s+textarea/);
assert.match(css, /\.ui-polish-v2\s+select/);
assert.match(css, /border-radius:\s*10px\s*!important/);

// Updater must preserve list semantics from electron-updater HTML and decode entities.
assert.match(electronMain, /decodeReleaseEntities/);
assert.ok(electronMain.includes('<li[^>]*>'), 'Updater normalization must recognize HTML list items.');
assert.ok(electronMain.includes("'\\n- '"), 'Updater normalization must convert list items to bullet lines.');
assert.ok(electronMain.includes('&amp;'), 'Updater normalization must decode HTML entities.');
assert.match(css, /update-dialog-notes\s+ul/);
assert.match(css, /list-style:\s*disc\s+outside\s*!important/);

// Release preparation must inject/version/cache both UI polish assets.
for (const asset of ['ui-polish.js', 'ui-polish.css']) {
  assert.match(prepareUi, new RegExp(asset.replace('.', '\\.')), `Release preparation must include ${asset}`);
}

console.log('Global UI polish regression checks passed.');
