import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.23.2') throw new Error(`Expected package version 1.23.2, got ${pkg.version}.`);

const [html, server, sw, electronMain, changelog] = await Promise.all([
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
]);

const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };

need(html, 'data-app-version="1.23.2"', 'HTML version is not 1.23.2.');
need(server, "const APP_VERSION = '1.23.2';", 'Server version is not 1.23.2.');
need(sw, 'flight-deck-efb-v1232-persistence', '1.23.2 service-worker cache name missing.');
need(html, 'release-1.23.1-ui.css?v=1.23.2', '1.23.1 UI compatibility CSS is not cache-busted for 1.23.2.');
need(html, 'release-1.23.1-ui.js?v=1.23.2', '1.23.1 UI compatibility JS is not cache-busted for 1.23.2.');
need(electronMain, "const BROWSER_STATE_BACKUP_FILE = 'browser-state-backup.json';", 'Update-safe browser backup is missing.');
need(electronMain, "persistBrowserStateSnapshot({ reason: 'update', restoreAll: true })", 'Update snapshot is missing.');
need(electronMain, 'restoreBrowserStateSnapshot(mainWindow)', 'Startup state restore is missing.');
need(electronMain, "persistBrowserStateSnapshot({ reason: 'startup-migration', restoreAll: false })", 'First-upgrade startup migration snapshot is missing.');
need(changelog, '## 1.23.2', '1.23.2 changelog section missing.');

console.log('Flight Deck EFB 1.23.2 update persistence release regression passed.');
