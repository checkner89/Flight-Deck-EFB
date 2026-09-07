import fs from 'node:fs/promises';

const VERSION = '1.24.14';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`${VERSION} updated ${filename}`);
  }
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== VERSION) throw new Error(`${VERSION} expected package ${VERSION}, got ${pkg.version}.`);

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, `data-app-version="${VERSION}"`)
  .replace(/\?v=1\.24\.13\b/g, `?v=${VERSION}`));

await update('src/server.mjs', (source) => source
  .replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${VERSION}';`));

await update('public/service-worker.js', (source) => source
  .replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = 'flyxora-v${VERSION}-retired-news-source-cleanup';`)
  .replace(/\?v=1\.24\.13\b/g, `?v=${VERSION}`));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.14 — Retired News Source Cleanup')) return source;
  const notes = [
    '## 1.24.14 — Retired News Source Cleanup',
    '',
    '- Removes the retired News JavaScript, stylesheet and backend service from the repository source tree instead of carrying them as dead release-time cleanup targets.',
    '- Keeps the 1.24.13 runtime contract intact: no News UI/API/runtime and closing the main Windows window exits FLYXORA completely.',
    '- Adds a dedicated 1.24.14 release regression so future Windows builds must keep the retired News sources absent.',
    '- Republishes the Windows updater metadata and installer as a normal patch release so installed 1.24.13 clients can receive the cleanup through the existing GitHub update channel.',
  ].join('\n');
  const heading = source.match(/^# .*changelog\s*$/mi)?.[0];
  return heading ? source.replace(heading, `${heading}\n\n${notes}`) : `${notes}\n\n${source}`;
});

const [main, index, server, serviceWorker] = await Promise.all([
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
]);
const fileExists = async (filename) => fs.access(filename).then(() => true).catch(() => false);

if (/mainWindow\.on\('close'[\s\S]{0,240}event\.preventDefault\(\)/.test(main)) {
  throw new Error(`${VERSION} close-to-tray interception is still active.`);
}
if (!main.includes("app.on('window-all-closed', () => {\n  app.quit();\n});")) {
  throw new Error(`${VERSION} quit-on-window-close behavior is missing.`);
}
if (/news-app\.(?:js|css)/i.test(index) || /news-app\.(?:js|css)/i.test(serviceWorker) || /\/api\/news\//i.test(server)) {
  throw new Error(`${VERSION} still contains a News runtime reference.`);
}
if (await fileExists('public/news-app.js') || await fileExists('public/news-app.css') || await fileExists('src/news-feed-service.mjs')) {
  throw new Error(`${VERSION} still contains a retired News source file.`);
}

console.log(`FLYXORA ${VERSION} release metadata materialized.`);
