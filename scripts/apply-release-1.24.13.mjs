import fs from 'node:fs/promises';

const VERSION = '1.24.13';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.13 updated ${filename}`);
  }
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== VERSION) throw new Error(`1.24.13 expected package ${VERSION}, got ${pkg.version}.`);

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, `data-app-version="${VERSION}"`)
  .replace(/\?v=1\.24\.12\b/g, `?v=${VERSION}`));

await update('src/server.mjs', (source) => source
  .replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${VERSION}';`));

await update('public/service-worker.js', (source) => source
  .replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = 'flyxora-v${VERSION}-news-removed-quit-on-close';`)
  .replace(/\?v=1\.24\.12\b/g, `?v=${VERSION}`));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.13 — News Removal & Complete Exit')) return source;
  const notes = [
    '## 1.24.13 — News Removal & Complete Exit',
    '',
    '- Removes the News app completely from the shipped FLYXORA runtime, including its UI assets, service-worker cache entries, backend feed service, API routes and desktop News notifications.',
    '- Removes the background News refresh lifecycle so no News polling or News persistence remains active after release preparation.',
    '- Closing the main FLYXORA window with the Windows **X** now exits the application completely instead of hiding it in the system tray.',
    '- The existing graceful shutdown path still closes the local EFB server and destroys the tray instance before Electron terminates.',
    '- Adds release regression checks that prevent the News runtime or close-to-tray interception from returning unnoticed.',
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

if (/mainWindow\.on\('close'[\s\S]{0,240}event\.preventDefault\(\)/.test(main)) {
  throw new Error('1.24.13 close-to-tray interception is still active.');
}
if (!main.includes("app.on('window-all-closed', () => {\n  app.quit();\n});")) {
  throw new Error('1.24.13 quit-on-window-close behavior is missing.');
}
if (/news-app\.(?:js|css)/i.test(index) || /news-app\.(?:js|css)/i.test(serviceWorker) || /\/api\/news\//i.test(server)) {
  throw new Error('1.24.13 still contains a News runtime reference.');
}

console.log('FLYXORA 1.24.13 release metadata materialized.');
