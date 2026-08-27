import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.2');
const documentsAssetVersion = `${version}-docs1`;

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`1.20.2 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('public/pilot-tools.js', (source) => {
  let js = source;
  const old = `    const signature = \`${'${title}'}|${'${category}'}|${'${description}'}\`;\n    if (button.dataset.tileSignature === signature) continue;\n    button.dataset.tileSignature = signature;`;
  if (js.includes(old)) {
    js = js.replace(old, `    const tileSignature = \`${'${title}'}|${'${category}'}|${'${description}'}\`;\n    if (button.dataset.pilotLabelSignature === tileSignature) continue;\n    button.dataset.pilotLabelSignature = tileSignature;`);
  }
  return js;
});

await update('src/server.mjs', (source) => {
  let server = source;

  if (!server.includes("pathname === '/api/news/article'")) {
    const anchor = "      if (pathname === '/api/news/subscriptions' && request.method === 'POST') {";
    const route = `      if (pathname === '/api/news/article' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        const id = requestUrl.searchParams.get('id');\n        if (!id) return json(response, 400, { error: 'Article id required.' });\n        try { return json(response, 200, await newsService.article(id)); }\n        catch (error) { return json(response, 404, { error: error.message }); }\n      }\n\n`;
    server = replaceRequired(server, anchor, `${route}${anchor}`, 'enhanced news article route');
  }

  if (!server.includes('function binary(response, statusCode, body')) {
    const binaryHelper = `function binary(response, statusCode, body, { contentType = 'application/octet-stream', filename = 'document.bin', disposition = 'inline' } = {}) {\n  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);\n  response.writeHead(statusCode, {\n    'Content-Type': contentType,\n    'Content-Length': buffer.length,\n    'Content-Disposition': \`${'${disposition}'}; filename=\"${'${String(filename).replace(/[^A-Za-z0-9_.-]/g, \'-\')}'}\"\`,\n    'Cache-Control': 'no-store',\n    'X-Content-Type-Options': 'nosniff',\n  });\n  response.end(buffer);\n}\n\n`;
    server = replaceRequired(server, 'function secureEqual(left, right) {', `${binaryHelper}function secureEqual(left, right) {`, 'binary document response helper');
  }

  if (!server.includes("pathname === '/api/simbrief/document'")) {
    const simbriefAnchor = "      if (pathname === '/api/simbrief/import' && request.method === 'POST') {";
    const documentRoute = `      if (pathname === '/api/simbrief/document' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        const state = engine.publicState();\n        const link = state.integrations?.simbrief?.flight?.ofpLink;\n        if (!link) return json(response, 404, { error: 'Kein SimBrief-OFP-Dokument verfügbar.' });\n        try {\n          const sourceUrl = new URL(link);\n          if (sourceUrl.protocol !== 'https:' || !/(^|\\.)simbrief\\.com$/i.test(sourceUrl.hostname)) {\n            throw new Error('Ungültige SimBrief-Dokument-URL.');\n          }\n          const documentResponse = await fetch(sourceUrl, {\n            headers: { Accept: 'application/pdf,*/*', 'User-Agent': 'Flight-Deck-EFB' },\n            redirect: 'follow',\n            signal: AbortSignal.timeout(15_000),\n          });\n          if (!documentResponse.ok) throw new Error(\`SimBrief-Dokument antwortet mit HTTP ${'${documentResponse.status}'}\`);\n          const buffer = Buffer.from(await documentResponse.arrayBuffer());\n          const contentType = String(documentResponse.headers.get('content-type') || 'application/pdf').split(';')[0];\n          const callsign = String(state.integrations?.simbrief?.flight?.callsign || 'SimBrief').replace(/[^A-Za-z0-9_.-]/g, '-');\n          return binary(response, 200, buffer, { contentType, filename: \`${'${callsign}'}-OFP.pdf\`, disposition: 'inline' });\n        } catch (error) {\n          return json(response, 502, { error: error.message });\n        }\n      }\n\n`;
    server = replaceRequired(server, simbriefAnchor, `${documentRoute}${simbriefAnchor}`, 'SimBrief OFP document proxy');
  }

  server = server.replace(
    "frame-src http: https:; object-src 'none'",
    "frame-src 'self' blob: data: http: https:; object-src 'none'",
  );
  return server;
});

await update('public/index.html', (source) => {
  let html = source.replace(/\s*<link[^>]+release-1\.20\.2\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/release-1.20.2.css?v=${version}">\n  </head>`);

  html = html.replace(/\s*<link[^>]+documents-workspace\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/documents-workspace.css?v=${documentsAssetVersion}">\n  </head>`);
  html = html.replace(/\s*<script[^>]+documents-workspace\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace('</body>', `    <script type="module" src="/documents-workspace.js?v=${documentsAssetVersion}"></script>\n  </body>`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^\s*['\"]\/release-1\.20\.2\.css\?v=[^'\"\s,]+['\"],?\s*$/gm, '');
  const releaseAnchor = `  '/manifest.webmanifest',`;
  const releaseEntry = `  '/release-1.20.2.css?v=${version}',\n`;
  if (!sw.includes(`/release-1.20.2.css?v=${version}`)) {
    if (!sw.includes(releaseAnchor)) throw new Error('1.20.2 service worker anchor missing.');
    sw = sw.replace(releaseAnchor, `${releaseEntry}${releaseAnchor}`);
  }

  sw = sw.replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = 'flight-deck-efb-v1202-docs1';`);
  sw = sw.replace(/^\s*['\"]\/documents-workspace\.(?:css|js)\?v=[^'\"\s,]+['\"],?\s*$/gm, '');
  const docsEntries = `  '/documents-workspace.css?v=${documentsAssetVersion}',\n  '/documents-workspace.js?v=${documentsAssetVersion}',\n`;
  if (!sw.includes(`/documents-workspace.css?v=${documentsAssetVersion}`)) {
    if (!sw.includes(releaseAnchor)) throw new Error('Documents workspace service worker anchor missing.');
    sw = sw.replace(releaseAnchor, `${docsEntries}${releaseAnchor}`);
  }
  return sw.replace(/\n{3,}/g, '\n\n');
});

const changelogPath = path.join(root, 'CHANGELOG.md');
const releaseNotesPath = path.join(root, 'release-notes', '1.20.2.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.2\b/m.test(changelog)) {
  const notes = (await fs.readFile(releaseNotesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log(`Applied Flight Deck EFB ${version} UI consolidation, enhanced News reader integration and OFP/Documents workspace.`);
