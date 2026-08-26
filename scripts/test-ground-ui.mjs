import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDefaultGsxRemoteUrl, normalizeGsxRemoteUrl } from '../public/ground-polish.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [html, css, js, prepareUi] = await Promise.all([
  fs.readFile(path.join(root, 'public/index.html'), 'utf8'),
  fs.readFile(path.join(root, 'public/ground-polish.css'), 'utf8'),
  fs.readFile(path.join(root, 'public/ground-polish.js'), 'utf8'),
  fs.readFile(path.join(root, 'scripts/prepare-release-ui.mjs'), 'utf8'),
]);

assert.equal(buildDefaultGsxRemoteUrl('127.0.0.1'), 'http://127.0.0.1:8744/');
assert.equal(buildDefaultGsxRemoteUrl('192.168.1.15', 9000), 'http://192.168.1.15:9000/');
assert.equal(buildDefaultGsxRemoteUrl('::1'), 'http://[::1]:8744/');
assert.equal(normalizeGsxRemoteUrl('192.168.1.15:8744', '127.0.0.1'), 'http://192.168.1.15:8744/');
assert.equal(normalizeGsxRemoteUrl('http://localhost', '127.0.0.1'), 'http://localhost:8744/');
assert.equal(normalizeGsxRemoteUrl('ftp://localhost:8744', '127.0.0.1'), null);

assert.match(html, /data-page=["']ground["']/);
for (const selector of ['ground-overview', 'turnaround-card', 'ground-safety-card', 'gsx-payload-card', 'service-panel']) {
  assert.match(html, new RegExp(`class=["'][^"']*${selector}`), `Ground DOM contract missing .${selector}`);
}

assert.match(js, /data-ground-view-button/);
assert.match(js, /GSX_REMOTE_URL_KEY/);
assert.match(js, /DEFAULT_GSX_REMOTE_PORT\s*=\s*8744/);
assert.match(js, /GSX Settings → Network/);
assert.match(js, /document\.createElement\(['"]iframe['"]\)/);
assert.match(js, /OPEN SEPARATELY/);
assert.match(js, /window\.location\.hostname/);
assert.match(js, /loadGsxRemote/);

assert.match(css, /\.ground-polished\s+\.ground-layout\s*\{/);
assert.match(css, /grid-template-columns:\s*repeat\(12/);
assert.match(css, /\.gsx-remote-frame-shell\s*\{/);
assert.match(css, /html\[data-theme=["']light["']\]\s+\.gsx-remote-url-field/);
assert.match(css, /@media\s*\(max-width:\s*860px\)/);
assert.match(css, /@media\s*\(max-width:\s*560px\)/);

assert.match(prepareUi, /ground-polish\.css/, 'Release UI preparation must version/inject ground-polish.css');
assert.match(prepareUi, /ground-polish\.js/, 'Release UI preparation must version/inject ground-polish.js');

console.log('Ground Services / GSX Remote UI regression checks passed.');
