import fs from 'node:fs/promises';

const [pkgRaw, main, index, server, serviceWorker, manifestRaw] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('public/manifest.webmanifest', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const manifest = JSON.parse(manifestRaw);
const need = (ok, message) => { if (!ok) throw new Error(message); };
const fileExists = async (filename) => fs.access(filename).then(() => true).catch(() => false);

need(pkg.version === '1.24.13', `Expected 1.24.13, got ${pkg.version}`);
need(pkg.productName === 'FLYXORA', 'Visible productName must remain FLYXORA.');
need(pkg.build?.appId === 'de.checkner.flightdeckefb', 'Stable Windows appId changed.');
need(pkg.build?.win?.executableName === 'FLYXORA', 'Windows executable must remain FLYXORA.exe.');
need(pkg.scripts?.['prepare:release'] === 'node scripts/prepare-release-1.24.13.mjs', '1.24.13 release orchestrator is not active.');

need(index.includes('data-app-version="1.24.13"'), 'Web app version was not bumped to 1.24.13.');
need(server.includes("const APP_VERSION = '1.24.13';"), 'Server version was not bumped to 1.24.13.');
need(serviceWorker.includes('flyxora-v1.24.13-news-removed-quit-on-close'), '1.24.13 service-worker cache key is missing.');
need(manifest.name === 'FLYXORA' && manifest.short_name === 'FLYXORA', 'PWA branding regressed.');

need(!/mainWindow\.on\('close'[\s\S]{0,240}event\.preventDefault\(\)/.test(main), 'Closing X is still intercepted by close-to-tray logic.');
need(main.includes("app.on('window-all-closed', () => {\n  app.quit();\n});"), 'Closing the last window no longer quits FLYXORA.');
need(!main.includes('notifyFlightDeckNews('), 'News notification integration remains in electron-main.');
need(!main.includes('newsStorageDirectory:'), 'News storage integration remains in electron-main.');
need(!main.includes('newsNotificationHandler:'), 'News notification option remains in electron-main.');

need(!/news-app\.(?:js|css)/i.test(index), 'News frontend asset is still loaded by index.html.');
need(!/news-app\.(?:js|css)/i.test(serviceWorker), 'News frontend assets remain in the service-worker cache list.');
need(!server.includes("from './news-feed-service.mjs'"), 'News backend service is still imported.');
need(!server.includes('/api/news/'), 'News API routes are still registered.');
need(!server.includes('newsService'), 'News backend lifecycle remains registered.');
need(!(await fileExists('public/news-app.js')), 'public/news-app.js still exists after release preparation.');
need(!(await fileExists('public/news-app.css')), 'public/news-app.css still exists after release preparation.');
need(!(await fileExists('src/news-feed-service.mjs')), 'src/news-feed-service.mjs still exists after release preparation.');

console.log('FLYXORA 1.24.13 News removal + complete exit regression passed.');
