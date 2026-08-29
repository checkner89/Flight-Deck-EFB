import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const html = await fs.readFile('public/index.html', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');
const serviceWorker = await fs.readFile('public/service-worker.js', 'utf8');
const shellJs = await fs.readFile('public/release-1.20.4.js', 'utf8');
const docsJs = await fs.readFile('public/documents-workspace.js', 'utf8');
const filesJs = await fs.readFile('public/file-browser.js', 'utf8');
const filesService = await fs.readFile('src/file-browser-service.mjs', 'utf8');
const changelog = await fs.readFile('CHANGELOG.md', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

function reject(source, token, message) {
  if (source.includes(token)) throw new Error(message);
}

if (!['1.20.6', '1.20.7', '1.20.8', '1.20.9'].includes(pkg.version)) throw new Error(`Unexpected package version: ${pkg.version}`);
const version = pkg.version;
need(html, `data-app-version="${version}"`, `HTML version is not ${version}.`);
need(html, `/release-1.20.4.js?v=${version}`, `Unified shell script is not versioned for ${version}.`);
need(html, `/file-browser.js?v=${version}`, `Files script is not versioned for ${version}.`);
need(server, `const APP_VERSION = '${version}';`, 'Server APP_VERSION is not synchronized.');
const compatibleCaches = [
  'flight-deck-efb-v1206-unified-ui1',
  'flight-deck-efb-v1207-formatted-ofp1',
  'flight-deck-efb-v1208-flightops1',
  'flight-deck-efb-v1209-tracking1',
];
if (!compatibleCaches.some((cache) => serviceWorker.includes(cache))) {
  throw new Error('Unified UI compatibility service-worker cache is missing for the active release.');
}

need(shellJs, 'const FD26_NAV = [', 'Unified navigation model is missing.');
need(shellJs, "['documents', 'docs', 'Briefing']", 'Briefing navigation entry is missing.');
need(shellJs, "['files', 'files', 'Files']", 'Files navigation entry is missing.');
reject(shellJs, "['apps', 'apps', 'Apps']", 'Duplicate Apps navigation entry is still present.');
need(shellJs, 'fd26-bottom-nav', 'Tablet/mobile bottom navigation is missing.');
need(shellJs, 'fd26-global-clock', 'Global UTC/local clock is missing.');
need(shellJs, 'fd26-flight-ops', 'Simplified Flight operational panel is missing.');
need(shellJs, '[data-page="flight"] .flight-journey-hub{display:none!important}', 'Legacy flight-phase journey is still visible.');
need(shellJs, '#fd-docs-workspace{inset:64px 0 0 92px!important', 'Briefing workspace is not integrated into the global shell.');
need(shellJs, '#fd-files-workspace{inset:64px 0 0 92px!important', 'Files workspace is not integrated into the global shell.');
need(shellJs, '--fd-ui-touch:44px', 'Minimum primary touch target token is missing.');
need(shellJs, 'html[data-theme="light"]', 'Unified Light Mode tokens are missing.');
need(shellJs, '.charts-app[disabled]{display:none!important}', 'Unavailable Charts is still shown in the primary launcher.');
need(shellJs, "document.querySelector('.fd-global-rail [data-fd-files-rail]')?.remove();", 'Unified shell does not prevent a duplicate legacy Files rail item.');

need(docsJs, '<strong>Briefing</strong>', 'Documents launcher was not renamed to Briefing.');
need(docsJs, '<span>BRIEFING</span>', 'Flight-page briefing action was not normalized.');
need(filesJs, "section('EFB STORAGE'", 'Files is not presented as EFB storage.');
need(filesService, 'appRootDirectory', 'App-scoped Files boundary is missing.');
need(filesService, 'drives: []', 'Files service still exposes filesystem drives.');
need(filesService, 'fullFilesystem: false', 'Files advertises full filesystem access.');

if (!/^## 1\.20\.6\b/m.test(changelog)) throw new Error('CHANGELOG section for 1.20.6 is missing.');

console.log(`Flight Deck EFB ${version} unified UI/UX compatibility checks passed.`);
