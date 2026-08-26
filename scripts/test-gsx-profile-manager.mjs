import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFile(path.join(root, file), 'utf8');

for (const file of [
  'public/gsx-profile-manager.js',
  'public/ground-polish.js',
  'public/ui-polish.js',
  'src/electron-main.mjs',
]) {
  execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
}

const [profileJs, profileCss, groundJs, uiJs, uiFixes, electronMain, prepareUi, index] = await Promise.all([
  read('public/gsx-profile-manager.js'),
  read('public/gsx-profile-manager.css'),
  read('public/ground-polish.js'),
  read('public/ui-polish.js'),
  read('public/ui-fixes.css'),
  read('src/electron-main.mjs'),
  read('scripts/prepare-release-ui.mjs'),
  read('public/index.html'),
]);

assert.match(profileJs, /GSX Profile Manager/);
assert.match(profileJs, /showDirectoryPicker/);
assert.match(profileJs, /DecompressionStream\('deflate-raw'\)/);
assert.match(profileJs, /readZip/);
assert.match(profileJs, /PROFILE_DIR_KEY/);
assert.match(profileJs, /HANDLER_DIR_KEY/);
assert.match(profileJs, /getFileHandle\(safeName, \{ create: true \}\)/);
assert.match(profileCss, /\.gsxp-dropzone/);
assert.match(profileCss, /\.gsxp-library-row/);

assert.match(prepareUi, /gsx-profile-manager\.js/);
assert.match(prepareUi, /gsx-profile-manager\.css/);
assert.match(prepareUi, /ui-fixes\.css/);
assert.ok(index.indexOf('gsx-profile-manager.js') >= 0, 'Prepared index must include GSX profile manager');
assert.ok(index.indexOf('gsx-profile-manager.js') < index.indexOf('/app.js'), 'GSX profile manager bootstrap must run before app.js captures launcher/pages');

assert.match(groundJs, /data-gsx-setup-toggle|gsxSetupToggle/);
assert.match(groundJs, /setRemoteSetupVisible\(page, false\)/);
assert.match(uiFixes, /gsx-remote-connect-strip\[hidden\]/);
assert.match(uiFixes, /remote-connected/);

assert.match(uiJs, /version: '1\.7\.18'/);
assert.match(uiJs, /removeHomeInstruction/);
assert.match(uiJs, /settings-msfs-cache-tools/);
assert.match(uiFixes, /setup-assistant-card[\s\S]*align-items:\s*flex-start/);
assert.match(uiFixes, /#changelog-dialog\[open\][\s\S]*place-items:\s*center/);
assert.match(uiFixes, /adapter-overview-card\s*>\s*\.primary-card-action[\s\S]*margin-top/);

assert.match(electronMain, /flightdeck:\/\/clear-msfs-cache/);
for (const cache of ['GLCache', 'DXCache', 'ComputeCache', 'D3DSCache']) assert.match(electronMain, new RegExp(cache));
assert.match(electronMain, /MSFS-Rolling-Cache/);

console.log('GSX Profile Manager, GSX Remote, Settings and MSFS cache regression checks passed.');
