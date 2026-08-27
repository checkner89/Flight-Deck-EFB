import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const html = await fs.readFile('public/index.html', 'utf8');
const app = await fs.readFile('public/app.js', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');
const simbrief = await fs.readFile('src/simbrief-client.mjs', 'utf8');
const serviceWorker = await fs.readFile('public/service-worker.js', 'utf8');
const documentsJs = await fs.readFile('public/documents-workspace.js', 'utf8');
const documentsCss = await fs.readFile('public/documents-workspace.css', 'utf8');
const releaseCss = await fs.readFile('public/release-1.20.4.css', 'utf8');
const releaseJs = await fs.readFile('public/release-1.20.4.js', 'utf8');
const changelog = await fs.readFile('CHANGELOG.md', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

if (pkg.version !== '1.20.4') throw new Error(`Unexpected package version: ${pkg.version}`);
need(html, 'data-app-version="1.20.4"', 'HTML application version was not materialized to 1.20.4.');
need(html, '/release-1.20.4.css?v=1.20.4', 'Cockpit-wide 1.20.4 stylesheet is not wired.');
need(html, '/release-1.20.4.js?v=1.20.4', 'Cockpit-wide 1.20.4 script is not wired.');
need(html, '/documents-workspace.css?v=1.20.4-docs2', 'Documents stylesheet cache key is stale.');
need(html, '/documents-workspace.js?v=1.20.4-docs2', 'Documents script cache key is stale.');
need(serviceWorker, "flight-deck-efb-v1204-ofp2", '1.20.4 offline cache was not bumped.');
need(serviceWorker, '/release-1.20.4.css?v=1.20.4', '1.20.4 stylesheet is missing from offline shell.');
need(serviceWorker, '/release-1.20.4.js?v=1.20.4', '1.20.4 navigation script is missing from offline shell.');
need(simbrief, "url.searchParams.set('json', 'v2')", 'SimBrief importer is not using JSON v2.');
need(simbrief, 'payload?.text?.plan_html', 'Complete SimBrief plan_html import is missing.');
need(simbrief, 'latestDocument()', 'On-demand SimBrief OFP cache is missing.');
need(simbrief, 'simBriefFileLink', 'Relative SimBrief PDF link resolver is missing.');
need(server, "pathname === '/api/simbrief/ofp'", 'Complete SimBrief OFP endpoint is missing.');
need(server, 'simBrief.latestDocument()', 'SimBrief OFP endpoint is not using cached briefing data.');
need(documentsJs, "const FD_DOCS_VERSION = '1.20.4-docs2';", 'Documents workspace asset version is stale.');
need(documentsJs, 'sanitizeSimBriefHtml', 'SimBrief OFP HTML sanitizer is missing.');
need(documentsJs, 'fullSimBriefOfpHtml', 'Original OFP renderer is missing.');
need(documentsJs, "label: 'OPERATIONAL FLIGHT PLAN'", 'Operational Flight Plan section is missing.');
need(documentsJs, "class: 'fd-docs-commandbar'", 'OFP command bar is missing.');
need(documentsJs, 'relabelCurrentDocument', 'Document label editor is missing.');
need(documentsJs, 'fdDocsSimBriefOFP?.notamsText', 'SimBrief NOTAM briefing integration is missing.');
need(app, 'flightdeck:modulechange', 'App does not publish cockpit module changes.');
need(app, 'flightdeck:navigate', 'App does not accept cockpit navigation events.');
need(releaseJs, 'fd-global-rail', 'Persistent cockpit rail is missing.');
need(releaseJs, "module === 'map' ? 'tracking'", 'Live Map cockpit shortcut is missing.');
need(releaseCss, '.fd-global-rail', 'Cockpit rail styling is missing.');
need(releaseCss, '#home-phase-card{display:none!important}', 'Legacy home Flight Phase card is still visible.');
need(releaseCss, 'html[data-theme="light"]', '1.20.4 Light Mode styling is missing.');
need(documentsCss, 'html[data-theme="light"]', 'Documents Light Mode base styling is missing.');
if (!/^## 1\.20\.4\b/m.test(changelog)) throw new Error('CHANGELOG section for 1.20.4 is missing.');

console.log('Flight Deck EFB 1.20.4 complete SimBrief OFP + cockpit UI release checks passed.');
