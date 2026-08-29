import fs from 'node:fs';
import process from 'node:process';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const bootstrap = fs.readFileSync(new URL('../src/electron-bootstrap.mjs', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../src/electron-main.mjs', import.meta.url), 'utf8');

const checks = [
  [packageJson.main === 'src/electron-bootstrap.mjs', 'package main must use the guarded Electron bootstrap'],
  [bootstrap.includes('app.requestSingleInstanceLock()'), 'bootstrap must acquire the single-instance lock before app startup'],
  [bootstrap.includes("await import('./electron-main.mjs')"), 'application lifecycle must only load after the lock is held'],
  [bootstrap.indexOf('requestSingleInstanceLock') < bootstrap.indexOf("import('./electron-main.mjs')"), 'lock acquisition must happen before importing electron-main'],
  [bootstrap.includes('if (!hasSingleInstanceLock)'), 'secondary launches must have an explicit rejection branch'],
  [bootstrap.includes('app.quit()'), 'secondary launches must quit immediately'],
  [main.includes("app.on('second-instance'"), 'primary app must handle a second launch'],
  [main.includes('showMainWindow();'), 'second launch must focus/show the existing window'],
];

const failures = checks.filter(([ok]) => !ok).map(([, message]) => message);
if (failures.length) {
  console.error('Single-instance lifecycle regression failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Single-instance lifecycle regression passed.');
