import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.4');
const docsVersion = `${version}-docs2`;

if (version !== '1.20.4') throw new Error(`1.20.4 release materializer requires package version 1.20.4, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`1.20.4 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

function replaceRegexRequired(source, pattern, replacement, label) {
  if (!pattern.test(source)) throw new Error(`1.20.4 patch anchor missing: ${label}`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

await update('src/server.mjs', (source) => {
  if (source.includes("pathname === '/api/simbrief/ofp'")) return source;
  const anchor = "      if (pathname === '/api/simbrief/document' && request.method === 'GET') {";
  const route = `      if (pathname === '/api/simbrief/ofp' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        const state = engine.publicState();\n        if (!state.integrations?.simbrief?.imported) return json(response, 404, { error: 'Kein SimBrief-OFP importiert.' });\n        const document = simBrief.latestDocument();\n        if (!document || (!document.planHtml && !document.planText)) return json(response, 404, { error: 'Der importierte SimBrief-Flug enthält keinen OFP-Text.' });\n        return json(response, 200, document);\n      }\n\n`;
  return replaceRequired(source, anchor, `${route}${anchor}`, 'complete SimBrief OFP route');
});

await update('public/app.js', (source) => {
  let app = source;
  if (!app.includes('flightdeck:modulechange')) {
    const allowed = /(^\s*const allowed = new Set\(\['home', 'taxi', 'flight', 'briefing', 'com', 'flightboard', 'ground', 'atc', 'fenix', 'automations', 'settings'\]\);)/m;
    app = replaceRegexRequired(app, allowed, `$1\n  document.documentElement.dataset.flightdeckModule = moduleName;\n  window.dispatchEvent(new CustomEvent('flightdeck:modulechange', { detail: { module: moduleName } }));`, 'module change event');
  }
  if (!app.includes("window.addEventListener('flightdeck:navigate'")) {
    const anchor = "for (const button of document.querySelectorAll('[data-open-module]')) {";
    const listener = `window.addEventListener('flightdeck:navigate', (event) => {\n  const module = String(event.detail?.module || 'home');\n  switchModule(module);\n});\n\n`;
    app = replaceRequired(app, anchor, `${listener}${anchor}`, 'global cockpit navigation listener');
  }
  return app;
});

await update('public/documents-workspace.js', (source) => {
  let js = source.replace(/^const FD_DOCS_VERSION = '[^']+';$/m, `const FD_DOCS_VERSION = '${docsVersion}';`);

  if (!js.includes('let fdDocsSimBriefOFP = null;')) {
    js = replaceRequired(js, 'let fdDocsCustomDocuments = [];', 'let fdDocsCustomDocuments = [];\nlet fdDocsSimBriefOFP = null;', 'SimBrief OFP cache state');
  }

  if (!js.includes('function sanitizeSimBriefHtml')) {
    const helpers = `function sanitizeSimBriefHtml(value) {\n  const parser = new DOMParser();\n  const parsed = parser.parseFromString(String(value || ''), 'text/html');\n  parsed.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button,textarea,select,video,audio').forEach((node) => node.remove());\n  for (const node of parsed.body.querySelectorAll('*')) {\n    for (const attr of [...node.attributes]) {\n      const name = attr.name.toLowerCase();\n      const unsafeStyle = name === 'style' && /url\\s*\\(|expression\\s*\\(|javascript:/i.test(attr.value);\n      if (name.startsWith('on') || ['src','href','action','formaction','srcdoc'].includes(name) || unsafeStyle) node.removeAttribute(attr.name);\n    }\n  }\n  return parsed.body.innerHTML;\n}\n\nfunction fullSimBriefOfpHtml() {\n  const document = fdDocsSimBriefOFP;\n  if (document?.planHtml) {\n    return \`<div class="fd-simbrief-ofp-shell"><header class="fd-simbrief-ofp-head"><small>SIMBRIEF · ORIGINAL OFP</small><b>${'${htmlEscape(safe(document.planFormat, \'OFP\'))}'}</b></header><div class="fd-simbrief-ofp">${'${sanitizeSimBriefHtml(document.planHtml)}'}</div></div>\`;\n  }\n  if (document?.planText) {\n    return \`<div class="fd-simbrief-ofp-shell"><header class="fd-simbrief-ofp-head"><small>SIMBRIEF · ORIGINAL OFP</small><b>TEXT</b></header><pre class="fd-ofp-plain">${'${htmlEscape(document.planText)}'}</pre></div>\`;\n  }\n  return makeOfpHtml(currentPlan());\n}\n\nfunction makeBriefingTextHtml(title, value, fallback) {\n  if (!value) return makePlaceholderHtml(title, fallback);\n  return \`<article class="fd-briefing-text"><h2>${'${htmlEscape(title)}'}</h2><pre>${'${htmlEscape(value)}'}</pre></article>\`;\n}\n\nasync function loadSimBriefOFP() {\n  try { fdDocsSimBriefOFP = await fdApi('/api/simbrief/ofp'); }\n  catch { fdDocsSimBriefOFP = null; }\n  return fdDocsSimBriefOFP;\n}\n\n`;
    js = replaceRequired(js, 'function makeOfpHtml(plan) {', `${helpers}function makeOfpHtml(plan) {`, 'full OFP rendering helpers');
  }

  if (!js.includes("label: 'OPERATIONAL FLIGHT PLAN'")) {
    const entry = /\s*\{ id: 'simbrief-ofp', label: 'GENERAL', title: 'SimBrief OFP', chip: 'SimBrief OFP', kind: 'html', html: \(\) => makeOfpHtml\(plan\) \},/;
    const replacement = `\n    { id: 'general', label: 'GENERAL', title: 'Flight Summary', chip: 'General', kind: 'html', html: () => makeOfpHtml(plan) },\n    { id: 'simbrief-ofp', label: 'OPERATIONAL FLIGHT PLAN', title: 'Operational Flight Plan', chip: 'OFP', kind: 'html', html: () => fullSimBriefOfpHtml() },`;
    js = replaceRegexRequired(js, entry, replacement, 'built-in OFP summary entry');
  }
  js = js.replace(/if \(plan\.ofpLink\) docs\.push\(/, 'if (plan.ofpLink || fdDocsSimBriefOFP?.pdfLink) docs.push(');

  if (!js.includes('fdDocsSimBriefOFP?.notamsText')) {
    const notam = /\{ id: 'notams', label: 'NOTAMS', title: 'NOTAMs', chip: 'NOTAMs', kind: 'html', html: \(\) => makePlaceholderHtml\('NOTAMs', '[^']*'\) \},/;
    const replacement = `{ id: 'notams', label: 'NOTAMS', title: 'NOTAMs', chip: 'NOTAMs', kind: 'html', html: () => makeBriefingTextHtml('NOTAMs', fdDocsSimBriefOFP?.notamsText, 'No NOTAM text is present in the current SimBrief briefing. You can still import a PDF or image manually.') },`;
    js = replaceRegexRequired(js, notam, replacement, 'SimBrief NOTAM document');
  }

  js = js.replace(
    "['simbrief-ofp', 'simbrief-pdf', 'weather', 'departure', 'destination', 'notams', 'sigwx']",
    "['general', 'simbrief-ofp', 'simbrief-pdf', 'weather', 'departure', 'destination', 'notams', 'sigwx']",
  );

  if (!js.includes('async function relabelCurrentDocument')) {
    const relabel = `async function relabelCurrentDocument() {\n  const record = fdDocsCustomDocuments.find((item) => item.id === fdDocsCurrentId);\n  if (!record) { setStatus('Built-in SimBrief sections keep their standard labels. Select an imported document to rename it.'); return; }\n  const name = (window.prompt('Document name:', record.name) || '').trim();\n  if (!name) return;\n  const category = (window.prompt('Category / label:', record.category || 'CUSTOM') || record.category || 'CUSTOM').trim().toUpperCase().slice(0, 40);\n  const db = await openDb();\n  await new Promise((resolve, reject) => {\n    const tx = db.transaction(FD_DOCS_STORE, 'readwrite');\n    tx.objectStore(FD_DOCS_STORE).put({ ...record, name: name.slice(0, 160), category });\n    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);\n  });\n  db.close();\n  await loadCustomDocuments();\n  renderNavigation(); renderCurrentDocument(false);\n  setStatus('Document label updated.', 'success');\n}\n\n`;
    js = replaceRequired(js, 'async function deleteDocument(id) {', `${relabel}async function deleteDocument(id) {`, 'custom document relabel action');
  }

  if (!js.includes("class: 'fd-docs-commandbar'")) {
    const tabsLine = "  const tabs = el('div', { id: 'fd-docs-tabs', class: 'fd-docs-tabs' });";
    const commands = `  const commandBar = el('div', { class: 'fd-docs-commandbar' });\n  const commandImport = el('button', { class: 'primary', type: 'button', title: 'Import latest SimBrief flight' }); commandImport.innerHTML = \`${'${svgIcon(\'refresh\')}'}<span>IMPORT SIMBRIEF</span>\`;\n  const commandPdf = el('button', { type: 'button', title: 'Open original OFP PDF' }); commandPdf.innerHTML = \`${'${svgIcon(\'external\')}'}<span>OPEN OFP PDF</span>\`;\n  const commandDocs = el('button', { type: 'button', title: 'Import local briefing documents' }); commandDocs.innerHTML = \`${'${svgIcon(\'upload\')}'}<span>IMPORT DOCUMENTS</span>\`;\n  const commandLabel = el('button', { type: 'button', title: 'Rename / label imported document' }); commandLabel.innerHTML = \`${'${svgIcon(\'text\')}'}<span>LABEL</span>\`;\n  const commandSync = el('button', { type: 'button', title: 'Refresh flight and document context' }); commandSync.innerHTML = \`${'${svgIcon(\'refresh\')}'}<span>SYNC</span>\`;\n  commandBar.append(commandImport, commandPdf, commandDocs, commandLabel, commandSync);\n`;
    js = replaceRequired(js, tabsLine, `${commands}${tabsLine}`, 'documents command bar');
    js = replaceRequired(js, '  center.append(tabs, viewerHeader, viewerWrap, status);', '  center.append(commandBar, tabs, viewerHeader, viewerWrap, status);', 'documents center layout');

    const assign = '  Object.assign(fdDocs, { overlay, shell, nav, tabs, add, file, viewer, viewerWrap, canvas, status, importBtn, themeBtn, closeBtn, externalBtn, deleteBtn });';
    const events = `\n  commandImport.addEventListener('click', () => importBtn.click());\n  commandPdf.addEventListener('click', () => externalBtn.click());\n  commandDocs.addEventListener('click', () => file.click());\n  commandLabel.addEventListener('click', () => relabelCurrentDocument().catch((error) => setStatus(error.message, 'error')));\n  commandSync.addEventListener('click', async () => {\n    setStatus('Synchronizing flight and briefing …');\n    await refreshState(); await loadSimBriefOFP(); await loadCustomDocuments();\n    renderNavigation(); renderCurrentDocument(false);\n    setStatus('Flight and briefing synchronized.', 'success');\n  });`;
    js = replaceRequired(js, assign, `${assign}${events}`, 'documents command events');
  }

  js = js.replace('  fdDocs.externalBtn.hidden = !currentPlan().ofpLink;', '  fdDocs.externalBtn.hidden = !(fdDocsSimBriefOFP?.pdfLink || currentPlan().ofpLink);');
  js = js.replace('  const url = currentPlan().ofpLink;', '  const url = fdDocsSimBriefOFP?.pdfLink || currentPlan().ofpLink;');

  js = js.replace(
    `    fdDocsState = result.state || await fdApi('/api/state');\n    await loadCustomDocuments();`,
    `    fdDocsState = result.state || await fdApi('/api/state');\n    await loadSimBriefOFP();\n    await loadCustomDocuments();`,
  );
  js = js.replace(
    `  await refreshState();\n  await loadCustomDocuments();`,
    `  await refreshState();\n  await loadSimBriefOFP();\n  await loadCustomDocuments();`,
  );

  if (!js.includes("window.dispatchEvent(new CustomEvent('flightdeck:documents-open'))")) {
    js = js.replace(
      `  fdDocs.overlay.hidden = false;\n  document.documentElement.classList.add('fd-docs-open');`,
      `  fdDocs.overlay.hidden = false;\n  document.documentElement.classList.add('fd-docs-open');\n  window.dispatchEvent(new CustomEvent('flightdeck:documents-open'));`,
    );
    js = js.replace(
      `  fdDocs.overlay.hidden = true;\n  document.documentElement.classList.remove('fd-docs-open');`,
      `  fdDocs.overlay.hidden = true;\n  document.documentElement.classList.remove('fd-docs-open');\n  window.dispatchEvent(new CustomEvent('flightdeck:documents-close'));`,
    );
  }
  return js;
});

await update('public/index.html', (source) => {
  let html = source.replace(/\s*<link[^>]+release-1\.20\.4\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/release-1.20.4.css?v=${version}">\n  </head>`);
  html = html.replace(/\s*<script[^>]+release-1\.20\.4\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace('</body>', `    <script type="module" src="/release-1.20.4.js?v=${version}"></script>\n  </body>`);
  html = html.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  html = html.replace(/documents-workspace\.css\?v=[^"']+/g, `documents-workspace.css?v=${docsVersion}`);
  html = html.replace(/documents-workspace\.js\?v=[^"']+/g, `documents-workspace.js?v=${docsVersion}`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = 'flight-deck-efb-v1204-ofp2';`);
  sw = sw.replace(/^\s*['\"]\/release-1\.20\.4\.(?:css|js)\?v=[^'\"\s,]+['\"],?\s*$/gm, '');
  sw = sw.replace(/^\s*['\"]\/documents-workspace\.(?:css|js)\?v=[^'\"\s,]+['\"],?\s*$/gm, '');
  const anchor = `  '/manifest.webmanifest',`;
  const entries = `  '/release-1.20.4.css?v=${version}',\n  '/release-1.20.4.js?v=${version}',\n  '/documents-workspace.css?v=${docsVersion}',\n  '/documents-workspace.js?v=${docsVersion}',\n`;
  if (!sw.includes(`/release-1.20.4.css?v=${version}`)) sw = replaceRequired(sw, anchor, `${entries}${anchor}`, '1.20.4 offline shell');
  return sw.replace(/\n{3,}/g, '\n\n');
});

const changelogPath = path.join(root, 'CHANGELOG.md');
const releaseNotesPath = path.join(root, 'release-notes', '1.20.4.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.4\b/m.test(changelog)) {
  const notes = (await fs.readFile(releaseNotesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log(`Applied Flight Deck EFB ${version} complete SimBrief OFP + cockpit UI release.`);
