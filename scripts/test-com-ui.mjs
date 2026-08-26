import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatComFrequency, parseComFrequency } from '../public/com-polish.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [html, css, js, prepareUi] = await Promise.all([
  fs.readFile(path.join(root, 'public/index.html'), 'utf8'),
  fs.readFile(path.join(root, 'public/com-polish.css'), 'utf8'),
  fs.readFile(path.join(root, 'public/com-polish.js'), 'utf8'),
  fs.readFile(path.join(root, 'scripts/prepare-release-ui.mjs'), 'utf8'),
]);

assert.equal(parseComFrequency('118.305'), 118.305);
assert.equal(parseComFrequency('121,605'), 121.605);
assert.equal(parseComFrequency('136.990 MHz'), 136.99);
assert.equal(parseComFrequency('117.995'), null);
assert.equal(parseComFrequency('137.000'), null);
assert.equal(parseComFrequency('abc'), null);
assert.equal(formatComFrequency(118.3), '118.300');
assert.equal(formatComFrequency('0.000'), '—');

for (const id of [
  'com-status-pill',
  'com1-active',
  'com1-standby',
  'com1-frequency-input',
  'com2-active',
  'com2-standby',
  'com2-frequency-input',
  'com-next-station-card',
  'com-next-frequency',
  'com-next-tune',
  'com-frequency-presets',
  'com-message',
]) {
  assert.match(html, new RegExp(`id=["']${id}["']`), `COM DOM contract missing #${id}`);
}

assert.match(html, /data-page=["']com["']/);
assert.match(html, /data-com-action=["']set["']/);
assert.match(html, /data-mode=["']standby["']/);
assert.match(css, /#com-frequency-presets\s*\{/);
assert.match(css, /\.com-preset-row\s*>\s*span/);
assert.match(css, /html\[data-theme=["']light["']\]\s+\[data-page=["']com["']\]/);
assert.match(css, /@media\s*\(max-width:\s*720px\)/);
assert.match(css, /@media\s*\(max-width:\s*520px\)/);
assert.match(js, /MutationObserver/);
assert.match(js, /addEventListener\(['"]click['"],\s*\(\)\s*=>\s*activatePreset/);
assert.match(js, /event\.key\s*!==\s*['"]Enter['"]/);
assert.match(js, /stageFrequency\(frequency,\s*preferredCom\)/);
assert.match(js, /requested\.click\(\)/);
assert.match(js, /button\.click\(\)/);

assert.match(prepareUi, /com-polish\.css/,
  'Release UI preparation must version/inject com-polish.css');
assert.match(prepareUi, /com-polish\.js/,
  'Release UI preparation must version/inject com-polish.js');

console.log('COM UI regression checks passed.');
