import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const html = await fs.readFile('public/index.html', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');
const sw = await fs.readFile('public/service-worker.js', 'utf8');
const shell = await fs.readFile('public/release-1.20.4.js', 'utf8');
const docs = await fs.readFile('public/documents-workspace.js', 'utf8');
const css = await fs.readFile('public/release-1.20.4.css', 'utf8');
const filesService = await fs.readFile('src/file-browser-service.mjs', 'utf8');
const changelog = await fs.readFile('CHANGELOG.md', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

function reject(source, token, message) {
  if (source.includes(token)) throw new Error(message);
}

if (pkg.version !== '1.20.7') throw new Error(`Unexpected package version: ${pkg.version}`);
need(html, 'data-app-version="1.20.7"', 'HTML version is not 1.20.7.');
need(html, '/release-1.20.4.js?v=1.20.7', 'Unified shell JS is not versioned for 1.20.7.');
need(html, '/release-1.20.4.css?v=1.20.7', 'Unified shell CSS is not versioned for 1.20.7.');
need(html, '/documents-workspace.js?v=1.20.7-docs3', 'Formatted OFP workspace JS is not wired.');
need(html, '/documents-workspace.css?v=1.20.7-docs3', 'Formatted OFP workspace CSS is not wired.');
need(server, "const APP_VERSION = '1.20.7';", 'Server version is not synchronized.');
need(sw, 'flight-deck-efb-v1207-formatted-ofp1', '1.20.7 service worker cache is missing.');
need(sw, '/documents-workspace.js?v=1.20.7-docs3', 'Formatted OFP JS is not in offline cache.');

need(shell, 'body:has(#app-toolbar:not([hidden])) .fd-global-rail.fd26-rail{top:126px!important}', 'Rail is not moved below the visible app toolbar.');
need(shell, 'body:has(#app-toolbar:not([hidden])) #fd-docs-workspace', 'Briefing workspace does not align below the shared app toolbar.');
need(shell, '.fd-global-rail.fd26-rail{top:74px!important', 'Home rail baseline was unexpectedly removed.');

need(docs, 'function makeFlightDeckOFPHtml', 'Flight Deck formatted OFP renderer is missing.');
need(docs, "id: 'simbrief-original'", 'Original SimBrief OFP fallback document is missing.');
need(docs, "label: 'OFP'", 'Formatted OFP is not the primary OFP entry.');
need(docs, 'fd-custom-ofp-navlog', 'Formatted OFP navlog is missing.');
need(docs, 'fdOfpWeatherCard', 'Formatted OFP airport/weather cards are missing.');
need(docs, 'fdOfpWeightCard', 'Formatted OFP weight cards are missing.');
need(docs, 'fdDocsSimBriefOFP?.notamsText', 'Formatted OFP does not expose imported NOTAM text.');
need(docs, 'fullSimBriefOfpHtml()', 'Original raw SimBrief OFP renderer was removed.');

need(css, '/* Flight Deck EFB 1.20.7 — formatted SimBrief OFP */', '1.20.7 formatted OFP styling is missing.');
need(css, '.fd-custom-ofp-hero', 'Formatted OFP hero styling is missing.');
need(css, '.fd-custom-ofp-airports', 'Formatted OFP airport layout styling is missing.');
need(css, '@media(max-width:760px)', 'Formatted OFP responsive layout is missing.');

need(filesService, 'appRootDirectory', 'My EFB app-scoped Files boundary regressed.');
need(filesService, 'fullFilesystem: false', 'Files unexpectedly exposes full filesystem access.');
reject(filesService, 'return await this.driveRoots()', 'Files drive browsing regressed.');

if (!/^## 1\.20\.7\b/m.test(changelog)) throw new Error('CHANGELOG section for 1.20.7 is missing.');

console.log('Flight Deck EFB 1.20.7 formatted SimBrief OFP checks passed.');
