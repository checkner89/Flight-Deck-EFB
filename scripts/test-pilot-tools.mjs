import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await fs.readFile(path.join(root, 'public', 'index.html'), 'utf8');
const js = await fs.readFile(path.join(root, 'public', 'pilot-tools.js'), 'utf8');
const css = await fs.readFile(path.join(root, 'public', 'pilot-tools.css'), 'utf8');

function requireMatch(source, pattern, message) {
  if (!pattern.test(source)) throw new Error(message);
}

function rejectMatch(source, pattern, message) {
  if (pattern.test(source)) throw new Error(message);
}

requireMatch(html, /pilot-tools\.css\?v=1\.18\.1/, 'pilot-tools.css is not wired for 1.18.1');
requireMatch(html, /pilot-tools\.js\?v=1\.18\.1/, 'pilot-tools.js is not wired for 1.18.1');
rejectMatch(html, /operations-suite\.(?:js|css)\?v=/, 'duplicate 1.18.0 Operations Suite is still wired');
requireMatch(html, /data-i18n="flightNotes">Flight Notes<\/h3>/, 'Flight Hub note area was not renamed to Flight Notes');

for (const token of ['pointerdown', 'pointermove', 'pointerup', 'data-scratch-tool', 'data-scratch-undo', 'data-scratch-redo', 'exportScratchpadPng']) {
  if (!js.includes(token)) throw new Error(`Real scratchpad capability missing: ${token}`);
}
for (const duplicate of ['SMART CHECKLISTS', 'VATSIM_URL', 'currentFlightLog', 'Fuel Receipt']) {
  if (js.includes(duplicate)) throw new Error(`Duplicate 1.18 feature leaked into pilot-tools.js: ${duplicate}`);
}
requireMatch(js, /data-pilot-tool="\$\{id\}"/, 'Pilot tool tiles are not installed');
requireMatch(css, /touch-action:none/, 'Scratchpad does not explicitly support touch/pen drawing');
requireMatch(css, /scratchpad-paper/, 'Scratchpad paper styling is missing');

console.log('Pilot tools 1.18.1 regression checks passed.');
