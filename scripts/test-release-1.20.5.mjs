import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { FileBrowserService } from '../src/file-browser-service.mjs';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const html = await fs.readFile('public/index.html', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');
const serviceWorker = await fs.readFile('public/service-worker.js', 'utf8');
const browserJs = await fs.readFile('public/file-browser.js', 'utf8');
const browserCss = await fs.readFile('public/file-browser.css', 'utf8');
const routes = await fs.readFile('src/file-browser-routes.mjs', 'utf8');
const serviceSource = await fs.readFile('src/file-browser-service.mjs', 'utf8');
const changelog = await fs.readFile('CHANGELOG.md', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

if (pkg.version !== '1.20.5') throw new Error(`Unexpected package version: ${pkg.version}`);
need(html, 'data-app-version="1.20.5"', 'HTML version was not materialized to 1.20.5.');
need(html, '/file-browser.css?v=1.20.5', 'File browser stylesheet is not wired.');
need(html, '/file-browser.js?v=1.20.5', 'File browser script is not wired.');
need(serviceWorker, 'flight-deck-efb-v1205-files1', 'File browser offline cache was not bumped.');
need(serviceWorker, '/file-browser.css?v=1.20.5', 'File browser CSS is missing from offline shell.');
need(serviceWorker, '/file-browser.js?v=1.20.5', 'File browser JS is missing from offline shell.');
need(server, "from './file-browser-service.mjs'", 'File browser service import is missing.');
need(server, "pathname.startsWith('/api/files/')", 'File browser routes are not delegated.');
need(server, 'handleFileBrowserRequest', 'File browser route handler is missing.');
need(routes, "'/api/files/list'", 'Directory listing endpoint is missing.');
need(routes, "'/api/files/search'", 'File search endpoint is missing.');
need(routes, "'/api/files/content'", 'File streaming endpoint is missing.');
need(routes, "'/api/files/upload'", 'File upload endpoint is missing.');
need(routes, "'Accept-Ranges': 'bytes'", 'Range-enabled file streaming is missing.');
need(serviceSource, 'remoteAllowedRoots', 'Remote file boundary is missing.');
need(serviceSource, 'assertWritable', 'Host-only write guard is missing.');
need(serviceSource, 'receiveUpload', 'Streaming upload support is missing.');
need(browserJs, "data-fd-files-launcher", 'Files app launcher is missing.');
need(browserJs, 'installRailButton', 'Files cockpit rail integration is missing.');
need(browserJs, 'uploadFiles', 'File upload UI is missing.');
need(browserJs, 'renderPreview', 'File preview UI is missing.');
need(browserJs, 'runSearch', 'Recursive search UI is missing.');
need(browserCss, 'html[data-theme="light"]', 'File browser Light Mode is missing.');
need(browserCss, '.fd-files-list.grid', 'File browser grid view styling is missing.');
if (!/^## 1\.20\.5\b/m.test(changelog)) throw new Error('CHANGELOG section for 1.20.5 is missing.');

const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'flight-deck-files-test-'));
const home = path.join(sandbox, 'home');
const desktop = path.join(home, 'Desktop');
const documents = path.join(home, 'Documents');
const userData = path.join(sandbox, 'flight-deck-data');
await fs.mkdir(desktop, { recursive: true });
await fs.mkdir(documents, { recursive: true });
await fs.mkdir(userData, { recursive: true });
await fs.writeFile(path.join(documents, 'briefing.txt'), 'Flight Deck file browser test\n', 'utf8');

const service = new FileBrowserService({ homeDirectory: home, userDataDirectory: userData, platform: process.platform });
try {
  const roots = await service.roots({ host: true });
  if (!roots.quick.some((item) => item.id === 'documents')) throw new Error('Documents quick root was not detected.');
  if (!roots.capabilities.write) throw new Error('Host file browser must expose write capability.');

  const listing = await service.list(documents, { host: true });
  if (!listing.items.some((item) => item.name === 'briefing.txt')) throw new Error('Directory listing did not return briefing.txt.');

  const preview = await service.preview(path.join(documents, 'briefing.txt'), { host: true });
  if (preview.preview !== 'text' || !preview.text.includes('Flight Deck file browser test')) throw new Error('Text preview failed.');

  const folder = await service.mkdir(documents, 'Dispatch', { host: true });
  await service.createFile(folder.path, 'notes.txt', { host: true });
  await service.writeText(path.join(folder.path, 'notes.txt'), 'edited', { host: true });
  const renamed = await service.rename(path.join(folder.path, 'notes.txt'), 'crew-notes.txt', { host: true });
  if (renamed.name !== 'crew-notes.txt') throw new Error('Rename failed.');

  const copyTarget = await service.mkdir(documents, 'Copies', { host: true });
  const copied = await service.copyInto(renamed.path, copyTarget.path, { host: true });
  if (copied.name !== 'crew-notes.txt') throw new Error('Copy failed.');

  const moveTarget = await service.mkdir(documents, 'Moved', { host: true });
  const moved = await service.moveInto(copied.path, moveTarget.path, { host: true });
  if (moved.name !== 'crew-notes.txt') throw new Error('Move failed.');

  const uploaded = await service.receiveUpload(documents, 'upload.txt', Readable.from([Buffer.from('upload test')]), { host: true });
  if (uploaded.uploadedBytes !== 11) throw new Error('Streaming upload byte count is incorrect.');

  const search = await service.search(documents, 'crew-notes', { host: true });
  if (!search.items.some((item) => item.name === 'crew-notes.txt')) throw new Error('Recursive search failed.');

  let remoteBlocked = false;
  try { await service.list(sandbox, { host: false }); } catch { remoteBlocked = true; }
  if (!remoteBlocked) throw new Error('Remote read boundary allowed access outside Quick Access roots.');

  let remoteWriteBlocked = false;
  try { await service.mkdir(documents, 'RemoteWrite', { host: false }); } catch { remoteWriteBlocked = true; }
  if (!remoteWriteBlocked) throw new Error('Remote write guard failed.');

  await service.remove(path.join(documents, 'Dispatch'), { host: true });
  await service.remove(path.join(documents, 'Copies'), { host: true });
  await service.remove(path.join(documents, 'Moved'), { host: true });
  await service.remove(path.join(documents, 'upload.txt'), { host: true });
} finally {
  await fs.rm(sandbox, { recursive: true, force: true });
}

console.log('Flight Deck EFB 1.20.5 complete file browser checks passed.');
