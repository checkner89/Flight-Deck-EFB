import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const check = spawnSync(process.execPath, ['--check', 'public/operations-suite.js'], { encoding: 'utf8' });
if (check.status !== 0) throw new Error(check.stderr || check.stdout || 'operations-suite.js syntax check failed');

const js = await fs.readFile('public/operations-suite.js', 'utf8');
const css = await fs.readFile('public/operations-suite.css', 'utf8');
const html = await fs.readFile('public/index.html', 'utf8');
const sw = await fs.readFile('public/service-worker.js', 'utf8');

for (const token of [
  'SCRATCHPAD',
  'SMART CHECKLISTS',
  'FLIGHT DOCUMENTS',
  'VATSIM_URL',
  'FLIGHT LOG',
  'SIM SESSION',
  'Fuel Receipt',
  'stageComFrequency',
  'flightdeckstate',
]) {
  if (!js.includes(token)) throw new Error(`Operations suite missing feature token: ${token}`);
}

if (!css.includes('.operations-suite') || !css.includes('data-focus-mode')) throw new Error('Operations suite styling/focus integration missing.');
if (!/operations-suite\.js\?v=/.test(html) || !/operations-suite\.css\?v=/.test(html)) throw new Error('Operations suite assets are not wired into index.html.');
if (!/operations-suite\.js\?v=/.test(sw) || !/operations-suite\.css\?v=/.test(sw)) throw new Error('Operations suite assets are not cached by the service worker.');

console.log('Operations suite regression checks passed.');
