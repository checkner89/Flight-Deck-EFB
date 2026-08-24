import fs from 'node:fs';

const VERSION = '1.4.1';
const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, value) => fs.writeFileSync(file, value.replace(/\r\n/g, '\n'), 'utf8');

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

if (fs.existsSync('package-lock.json')) {
  const lock = JSON.parse(read('package-lock.json'));
  lock.version = VERSION;
  if (lock.packages?.['']) lock.packages[''].version = VERSION;
  write('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

for (const file of [
  'public/index.html',
  'public/app.js',
  'public/service-worker.js',
  'src/server.mjs',
  'README.md',
  'PRIVACY.md',
  'THIRD_PARTY_NOTICES.md',
  'CHANGELOG.md',
]) {
  if (!fs.existsSync(file)) continue;
  write(file, read(file).replaceAll('1.4.0', VERSION));
}

const changelog = read('CHANGELOG.md');
if (!changelog.includes('## 1.4.1 — 24 August 2026')) {
  throw new Error('CHANGELOG was not promoted to 1.4.1.');
}
if (!read('public/index.html').includes('v1.4.1')) throw new Error('UI version was not promoted to 1.4.1.');
if (!read('src/server.mjs').includes("const APP_VERSION = '1.4.1'")) throw new Error('Server version was not promoted to 1.4.1.');

console.log('Promoted Flight Deck EFB release candidate to 1.4.1.');
