import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.5');

if (version !== '1.20.5') throw new Error(`1.20.5 release materializer requires package version 1.20.5, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`1.20.5 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('src/file-browser-service.mjs', (source) => {
  let next = source;
  if (!next.includes("import { constants } from 'node:fs';")) next = next.replace("import fs from 'node:fs/promises';", "import fs from 'node:fs/promises';\nimport { constants } from 'node:fs';");
  next = next.replace('fs.constants.COPYFILE_EXCL', 'constants.COPYFILE_EXCL');
  return next;
});

await update('src/server.mjs', (source) => {
  let server = source;
  if (!server.includes("from './file-browser-service.mjs'")) {
    const anchor = "import { SimBriefClient } from './simbrief-client.mjs';";
    server = replaceRequired(server, anchor, `${anchor}\nimport { FileBrowserService } from './file-browser-service.mjs';\nimport { handleFileBrowserRequest } from './file-browser-routes.mjs';`, 'file browser imports');
  }
  if (!server.includes('const fileBrowser = new FileBrowserService')) {
    const anchor = '  const simBrief = new SimBriefClient(engine);';
    server = replaceRequired(server, anchor, `${anchor}\n  const fileBrowser = new FileBrowserService({\n    userDataDirectory: flightStorageDirectory ? path.dirname(flightStorageDirectory) : null,\n  });`, 'file browser service');
  }
  if (!server.includes('handleFileBrowserRequest({ request, response, requestUrl, pathname')) {
    const anchor = '      const authenticated = hostAuthenticated || Boolean(authenticatedDevice);';
    const route = `${anchor}\n\n      if (pathname.startsWith('/api/files/')) {\n        const handled = await handleFileBrowserRequest({\n          request, response, requestUrl, pathname, authenticated, hostAuthenticated, service: fileBrowser,\n        });\n        if (handled) return;\n      }`;
    server = replaceRequired(server, anchor, route, 'file browser route delegation');
  }
  return server;
});

await update('public/index.html', (source) => {
  let html = source;
  html = html.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  html = html.replace(/\s*<link[^>]+file-browser\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/file-browser.css?v=${version}">\n  </head>`);
  html = html.replace(/\s*<script[^>]+file-browser\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace('</body>', `    <script type="module" src="/file-browser.js?v=${version}"></script>\n  </body>`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v1205-files1';");
  sw = sw.replace(/^\s*['\"]\/file-browser\.(?:css|js)\?v=[^'\"\s,]+['\"],?\s*$/gm, '');
  const anchor = `  '/manifest.webmanifest',`;
  const entries = `  '/file-browser.css?v=${version}',\n  '/file-browser.js?v=${version}',\n`;
  if (!sw.includes(`/file-browser.css?v=${version}`)) sw = replaceRequired(sw, anchor, `${entries}${anchor}`, 'file browser offline shell');
  return sw.replace(/\n{3,}/g, '\n\n');
});

const changelogPath = path.join(root, 'CHANGELOG.md');
const releaseNotesPath = path.join(root, 'release-notes', '1.20.5.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.5\b/m.test(changelog)) {
  const notes = (await fs.readFile(releaseNotesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log(`Applied Flight Deck EFB ${version} complete local file browser.`);
