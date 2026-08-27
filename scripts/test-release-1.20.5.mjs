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

if (!['1.20.5', '1.20.6'].includes(pkg.version)) throw new Error(`Unexpected package version: ${pkg.version}`);
need(html, `data-app-version="${pkg.version}"`, `HTML version was not materialized to ${pkg.version}.`);
need(html, `/file-browser.css?v=${pkg.version}`, 'File browser stylesheet is not wired to the current release version.');
need(html, `/file-browser.js?v=${pkg.version}`, 'File browser script is not wired to the current release version.');
const validFileCache = serviceWorker.includes('flight-deck-efb-v1205-files1') || (pkg.version === '1.20.6' && serviceWorker.includes('flight-deck-efb-v1206-unified-ui1'));
if (!validFileCache) throw new Error('File browser offline cache is not valid for the active release chain.');
need(serviceWorker, `/file-browser.css?v=${pkg.version}`, 'File browser CSS is missing from offline shell.');
need(serviceWorker, `/file-browser.js?v=${pkg.version}`, 'File browser JS is missing from offline shell.');
need(server, "from './file-browser-service.mjs'", 'File browser service import is missing.');
need(server, "pathname.startsWith('/api/files/')", 'File browser routes are not delegated.');
need(server, 'handleFileBrowserRequest', 'File browser route handler is missing.');
need(routes, "'/api/files/list'", 'Directory listing endpoint is missing.');
need(routes, "'/api/files/search'", 'File search endpoint is missing.');
need(routes, "'/api/files/content'", 'File streaming endpoint is missing.');
need(routes, "'/api/files/upload'", 'File upload endpoint is missing.');
need(routes, "'Accept-Ranges': 'bytes'", 'Range-enabled file streaming is missing.');
need(serviceSource, 'appRootDirectory', 'Dedicated Flight Deck app storage root is missing.');
need(serviceSource, 'fullFilesystem: false', 'Files app still advertises full filesystem access.');
need(serviceSource, 'assertWritable', 'Host-only write guard is missing.');
need(serviceSource, 'receiveUpload', 'Streaming upload support is missing.');
need(browserJs, 'data-fd-files-launcher', 'Files app launcher is missing.');
need(browserJs, 'EFB STORAGE · BRIEFINGS · EXPORTS', 'Files launcher still describes PC-wide browsing.');
need(browserJs, "section('EFB STORAGE'", 'Files sidebar is not app-storage oriented.');
need(browserJs, 'Flight Deck App-Pfad', 'Physical path entry is still editable.');
need(browserJs, 'APP-PFAD', 'Preview still exposes the physical Windows path.');
need(browserJs, 'installRailButton', 'Files cockpit rail integration is missing.');
need(browserJs, 'uploadFiles', 'File upload UI is missing.');
need(browserJs, 'renderPreview', 'File preview UI is missing.');
need(browserJs, 'runSearch', 'Recursive search UI is missing.');
need(browserCss, 'html[data-theme="light"]', 'File browser Light Mode is missing.');
need(browserCss, '.fd-files-list.grid', 'File browser grid view styling is missing.');
if (!/^## 1\.20\.5\b/m.test(changelog)) throw new Error('CHANGELOG section for 1.20.5 is missing.');

const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), 'flight-deck-files-test-'));
const home = path.join(sandbox, 'home');
const userData = path.join(sandbox, 'flight-deck-data');
const outside = path.join(sandbox, 'outside');
await fs.mkdir(home, { recursive: true });
await fs.mkdir(userData, { recursive: true });
await fs.mkdir(outside, { recursive: true });
await fs.writeFile(path.join(outside, 'private.txt'), 'outside app storage', 'utf8');

const service = new FileBrowserService({ homeDirectory: home, userDataDirectory: userData, platform: process.platform });
try {
  const roots = await service.roots({ host: true });
  if (!roots.quick.some((item) => item.id === 'home' && item.label === 'My EFB')) throw new Error('My EFB root is missing.');
  if (!roots.quick.some((item) => item.id === 'briefings')) throw new Error('Briefings app folder is missing.');
  if (!roots.quick.some((item) => item.id === 'documents')) throw new Error('Documents app folder is missing.');
  if (roots.drives.length !== 0) throw new Error('Files app still exposes Windows drives.');
  if (!roots.capabilities.write) throw new Error('Windows host must retain write capability inside app storage.');
  if (roots.capabilities.fullFilesystem) throw new Error('Files app must never advertise full filesystem access.');
  if (!roots.capabilities.appScoped) throw new Error('Files app scope flag is missing.');

  const documents = roots.quick.find((item) => item.id === 'documents').path;
  await fs.writeFile(path.join(documents, 'briefing.txt'), 'Flight Deck file browser test\n', 'utf8');

  const listing = await service.list(documents, { host: true });
  if (!listing.items.some((item) => item.name === 'briefing.txt')) throw new Error('App directory listing did not return briefing.txt.');
  if (listing.displayPath !== '/Documents') throw new Error(`Unexpected virtual app path: ${listing.displayPath}`);

  const preview = await service.preview(path.join(documents, 'briefing.txt'), { host: true });
  if (preview.preview !== 'text' || !preview.text.includes('Flight Deck file browser test')) throw new Error('Text preview failed.');
  if (preview.displayPath !== '/Documents/briefing.txt') throw new Error('Preview does not expose the virtual app path.');

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

  let hostOutsideBlocked = false;
  try { await service.list(outside, { host: true }); } catch { hostOutsideBlocked = true; }
  if (!hostOutsideBlocked) throw new Error('Windows host can still browse outside Flight Deck app storage.');

  let remoteOutsideBlocked = false;
  try { await service.list(outside, { host: false }); } catch { remoteOutsideBlocked = true; }
  if (!remoteOutsideBlocked) throw new Error('Paired device can read outside Flight Deck app storage.');

  const remoteInside = await service.list(documents, { host: false });
  if (!remoteInside.items.some((item) => item.name === 'briefing.txt')) throw new Error('Paired device cannot read app-scoped files.');

  let remoteWriteBlocked = false;
  try { await service.mkdir(documents, 'RemoteWrite', { host: false }); } catch { remoteWriteBlocked = true; }
  if (!remoteWriteBlocked) throw new Error('Remote write guard failed.');

  let protectedRootBlocked = false;
  try { await service.remove(documents, { host: true }); } catch { protectedRootBlocked = true; }
  if (!protectedRootBlocked) throw new Error('Managed app folder can be deleted.');

  await service.remove(path.join(documents, 'Dispatch'), { host: true });
  await service.remove(path.join(documents, 'Copies'), { host: true });
  await service.remove(path.join(documents, 'Moved'), { host: true });
  await service.remove(path.join(documents, 'upload.txt'), { host: true });
} finally {
  await fs.rm(sandbox, { recursive: true, force: true });
}

console.log(`Flight Deck EFB ${pkg.version} app-scoped file browser checks passed.`);
