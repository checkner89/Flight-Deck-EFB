import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.0');

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`1.20 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('public/pilot-tools.js', (source) => {
  let js = source;
  js = js.replace("session: 'Sim Session',\n    sessionSubtitle: 'Flight Deck & externe Tools starten',", "session: 'Flight Setup',\n    sessionSubtitle: 'Simulator, ATC und Add-ons vorbereiten',");
  js = js.replace("session: 'Sim Session',\n    sessionSubtitle: 'Launch Flight Deck & external tools',", "session: 'Flight Setup',\n    sessionSubtitle: 'Prepare simulator, ATC and add-ons',");
  const replacement = `function renderSimSession() {\n  const dictionary = labels();\n  const toolbar = shell.querySelector('#pilot-tools-toolbar');\n  const content = shell.querySelector('#pilot-tools-content');\n  toolbar.innerHTML = toolbarBase(dictionary.session, dictionary.sessionSubtitle);\n  content.innerHTML = '<div class="sim-session-grid flight-setup-grid"></div>';\n  wireCommonClose();\n  window.dispatchEvent(new CustomEvent('flightdeckflightsetupopen'));\n}`;
  const pattern = /function renderSimSession\(\) \{[\s\S]*?\n\}\n\nfunction onState/;
  if (!pattern.test(js)) throw new Error('1.20 patch anchor missing: renderSimSession');
  js = js.replace(pattern, `${replacement}\n\nfunction onState`);
  return js;
});

await update('public/app.js', (source) => {
  let js = source;
  js = js.replace("let airportFocusEnabled = localStorage.getItem('flight-deck-airport-focus') !== 'false';", 'let airportFocusEnabled = true;');
  js = js.replace('taxiBasemap.setOpacity(airportFocusEnabled ? 0.58 : 0.78);', 'taxiBasemap.setOpacity(0.22);');
  js = js.replace('fillOpacity: light ? 0.94 : 0.92,', 'fillOpacity: 1,');
  if (!js.includes('map.setMaxBounds(airportBounds.pad(0.35));')) {
    js = replaceRequired(js,
      '  const airportBounds = L.latLngBounds(hole);\n  const outer = airportBounds.pad(4.5);',
      "  const airportBounds = L.latLngBounds(hole);\n  map.setMaxBounds(airportBounds.pad(0.35));\n  map.options.maxBoundsViscosity = 1;\n  const outer = airportBounds.pad(4.5);",
      'airport bounds clamp');
  }
  js = js.replace("elements.airportFocusButton?.addEventListener('click', () => {\n  airportFocusEnabled = !airportFocusEnabled;\n  localStorage.setItem('flight-deck-airport-focus', String(airportFocusEnabled));\n  renderAirportFocus();\n});", "elements.airportFocusButton?.addEventListener('click', () => {\n  airportFocusEnabled = true;\n  renderAirportFocus();\n});");
  const oldOrder = "    const order = [...validOrder, ...DEFAULT_APP_ORDER.filter((id) => !validOrder.includes(id))];";
  if (js.includes(oldOrder)) js = js.replace(oldOrder, "    const mergedOrder = [...validOrder, ...DEFAULT_APP_ORDER.filter((id) => !validOrder.includes(id))];\n    const order = [...mergedOrder.filter((id) => id !== 'settings'), 'settings'];");
  js = js.replace("  appLayout = { order: [...profile.order], hidden: [...profile.hidden] };", "  appLayout = { order: [...profile.order.filter((entry) => entry !== 'settings'), 'settings'], hidden: [...profile.hidden] };");
  if (!js.includes("tileById.get('settings')?.style.setProperty('order', '9999')")) {
    js = replaceRequired(js, '  renderAppCustomization();\n}\n\nfunction moveApp', "  tileById.get('settings')?.style.setProperty('order', '9999');\n  renderAppCustomization();\n}\n\nfunction moveApp", 'settings final app order');
  }
  js = js.replace("function moveApp(id, direction) {\n  const current = appLayout.order.indexOf(id);", "function moveApp(id, direction) {\n  if (id === 'settings') return;\n  const current = appLayout.order.indexOf(id);");
  return js;
});

await update('src/server.mjs', (source) => {
  let server = source;
  if (!server.includes("from './news-feed-service.mjs'")) {
    const anchor = "import { WindowsSimSessionService } from './windows-sim-session.mjs';";
    server = replaceRequired(server, anchor, `${anchor}\nimport { NewsFeedService } from './news-feed-service.mjs';`, 'news import');
  }
  if (!server.includes('newsStorageDirectory,')) {
    server = replaceRequired(server, '  simSessionStorageDirectory,\n  screenshotProvider,', '  simSessionStorageDirectory,\n  newsStorageDirectory,\n  newsNotificationHandler,\n  screenshotProvider,', 'news server options');
  }
  if (!server.includes('const newsService = new NewsFeedService')) {
    const anchor = '  await simSession.start();\n  let lanDiscovery = null;';
    server = replaceRequired(server, anchor, `  await simSession.start();\n  const newsService = new NewsFeedService({\n    storageDirectory: newsStorageDirectory || (flightStorageDirectory ? path.join(path.dirname(flightStorageDirectory), 'news') : undefined),\n    onNewItems: newsNotificationHandler,\n  });\n  await newsService.start();\n  let lanDiscovery = null;`, 'news service init');
  }
  if (!server.includes("pathname === '/api/news/catalog'")) {
    const anchor = "      if (pathname === '/health') {";
    const routes = `      if (pathname === '/api/news/catalog' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        return json(response, 200, { feeds: newsService.catalog(), ...newsService.preferences() });\n      }\n\n      if (pathname === '/api/news/feed' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        const force = requestUrl.searchParams.get('refresh') === '1';\n        return json(response, 200, await newsService.refresh({ force, notify: false }));\n      }\n\n      if (pathname === '/api/news/subscriptions' && request.method === 'POST') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        try {\n          const body = await readJsonBody(request);\n          const feeds = await newsService.install(body.id, body.installed !== false);\n          return json(response, 200, { feeds });\n        } catch (error) { return json(response, 422, { error: error.message }); }\n      }\n\n      if (pathname === '/api/news/notifications' && request.method === 'POST') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        try {\n          const body = await readJsonBody(request);\n          return json(response, 200, await newsService.setNotifications(body.enabled));\n        } catch (error) { return json(response, 422, { error: error.message }); }\n      }\n\n`;
    server = replaceRequired(server, anchor, `${routes}${anchor}`, 'news API routes');
  }
  if (!server.includes('newsService,\n    lanDiscovery,')) {
    server = replaceRequired(server, '    simSession,\n    lanDiscovery,', '    simSession,\n    newsService,\n    lanDiscovery,', 'news return service');
  }
  if (!server.includes('await newsService.stop();')) {
    server = replaceRequired(server, '      await simSession.stop();\n      await lanDiscovery?.stop();', '      await simSession.stop();\n      await newsService.stop();\n      await lanDiscovery?.stop();', 'news shutdown');
  }
  return server;
});

await update('src/electron-main.mjs', (source) => {
  let electron = source;
  electron = electron.replace('BrowserWindow, desktopCapturer, dialog, Menu, nativeImage, screen, shell, Tray', 'BrowserWindow, desktopCapturer, dialog, Menu, nativeImage, Notification, screen, shell, Tray');
  if (!electron.includes('function notifyFlightDeckNews(')) {
    const anchor = 'async function captureMsfsWindow() {';
    electron = replaceRequired(electron, anchor, `function notifyFlightDeckNews(items = []) {\n  if (!Notification.isSupported() || !Array.isArray(items) || !items.length) return;\n  const first = items[0];\n  const title = items.length === 1 ? \`${'${first.sourceName}'} · Flight Deck News\` : 'Flight Deck News';\n  const body = items.length === 1 ? first.title : \`${'${items.length}'} neue Artikel · ${'${[...new Set(items.map((item) => item.sourceName))].slice(0, 3).join(\' · \')}'}\`;\n  new Notification({ title, body, silent: false }).show();\n}\n\n${anchor}`, 'news notification handler');
  }
  if (!electron.includes('newsStorageDirectory:')) {
    electron = replaceRequired(electron, "    simSessionStorageDirectory: path.join(app.getPath('userData'), 'sim-session'),\n    screenshotProvider: captureMsfsWindow,", "    simSessionStorageDirectory: path.join(app.getPath('userData'), 'sim-session'),\n    newsStorageDirectory: path.join(app.getPath('userData'), 'news'),\n    newsNotificationHandler: notifyFlightDeckNews,\n    screenshotProvider: captureMsfsWindow,", 'electron news options');
  }
  return electron;
});

await update('public/index.html', (source) => {
  let html = source;
  html = html.replace(/\s*<link[^>]+news-app\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace(/\s*<link[^>]+release-1\.20\.0\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace(/\s*<script[^>]+news-app\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/news-app.css?v=${version}">\n    <link rel="stylesheet" href="/release-1.20.0.css?v=${version}">\n  </head>`);
  html = html.replace('</body>', `    <script type="module" src="/news-app.js?v=${version}"></script>\n  </body>`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source;
  for (const file of ['news-app.js', 'news-app.css', 'release-1.20.0.css']) {
    sw = sw.replace(new RegExp(`^\\s*['\"]/${file.replaceAll('.', '\\.') }\\?v=[^'\"\\s,]+['\"],?\\s*$`, 'gm'), '');
  }
  const anchor = `  '/manifest.webmanifest',`;
  const entries = `  '/news-app.js?v=${version}',\n  '/news-app.css?v=${version}',\n  '/release-1.20.0.css?v=${version}',\n`;
  if (!sw.includes(`/news-app.js?v=${version}`)) sw = replaceRequired(sw, anchor, `${entries}${anchor}`, 'service worker news assets');
  return sw.replace(/\n{3,}/g, '\n\n');
});

console.log(`Applied Flight Deck EFB ${version} airport-only, Flight Setup and News integration.`);
