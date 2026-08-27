import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const html = await fs.readFile('public/index.html', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');
const serviceWorker = await fs.readFile('public/service-worker.js', 'utf8');
const documentsJs = await fs.readFile('public/documents-workspace.js', 'utf8');
const documentsCss = await fs.readFile('public/documents-workspace.css', 'utf8');
const changelog = await fs.readFile('CHANGELOG.md', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

if (pkg.version !== '1.20.3') throw new Error(`Unexpected package version: ${pkg.version}`);
need(html, 'data-app-version="1.20.3"', 'HTML application version was not materialized to 1.20.3.');
need(html, '/documents-workspace.css?v=1.20.3-docs1', 'Documents workspace stylesheet is not wired for 1.20.3.');
need(html, '/documents-workspace.js?v=1.20.3-docs1', 'Documents workspace script is not wired for 1.20.3.');
need(serviceWorker, "flight-deck-efb-v1203-docs1", '1.20.3 offline cache was not bumped.');
need(serviceWorker, '/documents-workspace.css?v=1.20.3-docs1', 'Documents CSS is missing from the offline shell.');
need(serviceWorker, '/documents-workspace.js?v=1.20.3-docs1', 'Documents JS is missing from the offline shell.');
need(server, "pathname === '/api/simbrief/document'", 'SimBrief OFP document proxy is missing.');
need(documentsJs, "const FD_DOCS_VERSION = '1.20.3-docs1';", 'Documents workspace asset version is stale.');
need(documentsJs, 'indexedDB', 'Local document storage implementation is missing.');
need(documentsJs, 'highlighter', 'Document highlighter support is missing.');
need(documentsJs, 'undo', 'Document undo support is missing.');
need(documentsCss, 'html[data-theme="light"]', 'Documents workspace Light Mode theme is missing.');
need(documentsCss, '--fd-docs-bg: #071019', 'Documents workspace Dark Mode theme is missing.');
if (!/^## 1\.20\.3\b/m.test(changelog)) throw new Error('CHANGELOG section for 1.20.3 is missing.');

console.log('Flight Deck EFB 1.20.3 OFP/Documents release checks passed.');
