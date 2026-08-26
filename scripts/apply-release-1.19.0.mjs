import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function requireAnchor(source, anchor, label) {
  if (!source.includes(anchor)) throw new Error(`1.19.0 patch anchor missing: ${label}`);
}

await update('public/pilot-tools.js', (source) => {
  let js = source;
  if (!js.includes('let legacyPilotTilesCleaned = false;')) {
    requireAnchor(js, "let craftOpen = false;", 'pilot tool state');
    js = js.replace("let craftOpen = false;", "let craftOpen = false;\nlet legacyPilotTilesCleaned = false;\nlet pilotTileSyncFrame = 0;");
  }

  const oldNormalize = `  heading.removeAttribute('data-i18n');\n  heading.textContent = labels().flightNotes;`;
  if (js.includes(oldNormalize)) {
    js = js.replace(oldNormalize, `  if (heading.hasAttribute('data-i18n')) heading.removeAttribute('data-i18n');\n  const nextLabel = labels().flightNotes;\n  if (heading.textContent !== nextLabel) heading.textContent = nextLabel;`);
  }

  const oldCleanup = `  grid.querySelectorAll('[data-ops-tool]').forEach((element) => element.remove());`;
  if (js.includes(oldCleanup)) {
    js = js.replace(oldCleanup, `  if (!legacyPilotTilesCleaned) {\n    grid.querySelectorAll('[data-ops-tool]').forEach((element) => element.remove());\n    legacyPilotTilesCleaned = true;\n  }`);
  }

  const oldInner = `    button.innerHTML = \`<span class="app-tile-icon">\${tileIcon(id)}</span><span class="app-tile-copy"><small>\${esc(subtitle)}</small><strong>\${esc(title)}</strong><span>FLIGHT DECK</span></span><i class="app-open-arrow">›</i>\`;`;
  if (!js.includes('pilotLabelSignature') && js.includes(oldInner)) {
    js = js.replace(oldInner, `    const tileSignature = \`\${title}|\${subtitle}\`;\n    if (button.dataset.pilotLabelSignature !== tileSignature) {\n      button.dataset.pilotLabelSignature = tileSignature;\n      button.innerHTML = \`<span class="app-tile-icon">\${tileIcon(id)}</span><span class="app-tile-copy"><small>\${esc(subtitle)}</small><strong>\${esc(title)}</strong><span>FLIGHT DECK</span></span><i class="app-open-arrow">›</i>\`;\n    }`);
  }

  if (!js.includes('function schedulePilotTileSync()')) {
    requireAnchor(js, 'function start() {', 'pilot start');
    js = js.replace('function start() {', `function schedulePilotTileSync() {\n  if (pilotTileSyncFrame) return;\n  pilotTileSyncFrame = requestAnimationFrame(() => {\n    pilotTileSyncFrame = 0;\n    installTiles();\n    normalizeExistingFlightNotes();\n  });\n}\n\nfunction start() {`);
  }

  const oldObserver = `  const observer = new MutationObserver(() => {\n    installTiles();\n    normalizeExistingFlightNotes();\n  });`;
  if (js.includes(oldObserver)) js = js.replace(oldObserver, `  const observer = new MutationObserver(schedulePilotTileSync);`);

  return js;
});

await update('src/server.mjs', (source) => {
  let server = source;
  if (!server.includes("from './lan-discovery-service.mjs'")) {
    requireAnchor(server, "import { AviationWeatherClient } from './aviation-weather-client.mjs';", 'server imports');
    server = server.replace(
      "import { AviationWeatherClient } from './aviation-weather-client.mjs';",
      "import { AviationWeatherClient } from './aviation-weather-client.mjs';\nimport { LanDiscoveryService } from './lan-discovery-service.mjs';\nimport { WindowsSimSessionService } from './windows-sim-session.mjs';",
    );
  }

  if (!server.includes('function binary(response, statusCode, body')) {
    requireAnchor(server, 'function secureEqual(left, right) {', 'binary helper');
    server = server.replace('function secureEqual(left, right) {', `function binary(response, statusCode, body, { contentType = 'application/octet-stream', headers = {} } = {}) {\n  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);\n  response.writeHead(statusCode, {\n    'Content-Type': contentType,\n    'Content-Length': buffer.length,\n    'Cache-Control': 'no-store',\n    'X-Content-Type-Options': 'nosniff',\n    ...headers,\n  });\n  response.end(buffer);\n}\n\nfunction secureEqual(left, right) {`);
  }

  if (!server.includes('simSessionStorageDirectory,')) {
    requireAnchor(server, '  msfsEfbBuilderStorageDirectory,\n  updateService,', 'server options');
    server = server.replace('  msfsEfbBuilderStorageDirectory,\n  updateService,', '  msfsEfbBuilderStorageDirectory,\n  simSessionStorageDirectory,\n  screenshotProvider,\n  updateService,');
  }

  if (!server.includes('const simSession = new WindowsSimSessionService')) {
    requireAnchor(server, '  await accessManager.start();\n  const pairingAttempts = new Map();', 'sim session initialization');
    server = server.replace('  await accessManager.start();\n  const pairingAttempts = new Map();', `  await accessManager.start();\n  const simSession = new WindowsSimSessionService({\n    storageDirectory: simSessionStorageDirectory || (flightStorageDirectory ? path.join(path.dirname(flightStorageDirectory), 'sim-session') : undefined),\n  });\n  await simSession.start();\n  let lanDiscovery = null;\n  const pairingAttempts = new Map();`);
  }

  if (!server.includes("pathname === '/api/sim-session/status'")) {
    const authAnchor = `      const authenticated = hostAuthenticated || Boolean(authenticatedDevice);\n\n      if (pathname === '/health') {`;
    requireAnchor(server, authAnchor, 'authenticated API section');
    const apiBlock = `      const authenticated = hostAuthenticated || Boolean(authenticatedDevice);\n\n      if (pathname === '/api/sim-session/status' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        const force = requestUrl.searchParams.get('refresh') === '1';\n        return json(response, 200, { ...(await simSession.status({ force })), canConfigure: hostAuthenticated });\n      }\n\n      if (pathname === '/api/sim-session/launch' && request.method === 'POST') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        try {\n          const body = await readJsonBody(request);\n          return json(response, 202, await simSession.launch(body.id));\n        } catch (error) {\n          return json(response, 409, { error: error.message });\n        }\n      }\n\n      if (pathname === '/api/sim-session/configure' && ['POST', 'DELETE'].includes(request.method)) {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Tool-Pfade können nur in der Windows-App geändert werden.' });\n        try {\n          const body = await readJsonBody(request);\n          const value = request.method === 'DELETE'\n            ? await simSession.clearConfiguredPath(body.id)\n            : await simSession.configure(body.id, body.path);\n          return json(response, 200, { ...value, canConfigure: true });\n        } catch (error) {\n          return json(response, 422, { error: error.message });\n        }\n      }\n\n      if (pathname === '/api/sim-session/screenshot' && request.method === 'POST') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        if (typeof screenshotProvider !== 'function') return json(response, 501, { error: 'Screenshot capture is only available in the Windows app.' });\n        try {\n          const capture = await screenshotProvider();\n          const sourceName = String(capture?.sourceName || 'MSFS').replace(/[^\\x20-\\x7e]/g, '').slice(0, 120);\n          return binary(response, 200, capture.buffer, { contentType: 'image/png', headers: { 'X-Flight-Deck-Capture-Source': sourceName } });\n        } catch (error) {\n          return json(response, 409, { error: error.message });\n        }\n      }\n\n      if (pathname === '/api/discovery/status' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });\n        return json(response, 200, lanDiscovery?.status() || { status: 'starting', detail: 'LAN discovery is starting.' });\n      }\n\n      if (pathname === '/health') {`;
    server = server.replace(authAnchor, apiBlock);
  }

  if (!server.includes('lanDiscovery = new LanDiscoveryService')) {
    const portAnchor = `  const actualPort = await listenOnAvailablePort(server, host, port);\n  const localhostUrl = \`http://localhost:\${actualPort}/\`;\n  const lanUrls = localIpv4Addresses().map((address) => \`http://\${address}:\${actualPort}/\`);`;
    requireAnchor(server, portAnchor, 'LAN discovery startup');
    server = server.replace(portAnchor, `${portAnchor}\n  lanDiscovery = new LanDiscoveryService({ port: actualPort, addresses: localIpv4Addresses(), hostname: 'flightdeck' });\n  await lanDiscovery.start();`);
  }

  // Later releases may insert additional services between simSession and lanDiscovery.
  if (!server.includes('    simSession,')) {
    requireAnchor(server, '    accessManager,\n    openInDefaultBrowser,', 'server return services');
    server = server.replace('    accessManager,\n    openInDefaultBrowser,', '    accessManager,\n    simSession,\n    lanDiscovery,\n    openInDefaultBrowser,');
  }

  if (!server.includes('await simSession.stop();')) {
    requireAnchor(server, '      await accessManager.stop();\n      for (const client of sseClients) client.end();', 'server shutdown');
    server = server.replace('      await accessManager.stop();\n      for (const client of sseClients) client.end();', '      await accessManager.stop();\n      await simSession.stop();\n      await lanDiscovery?.stop();\n      for (const client of sseClients) client.end();');
  }

  return server;
});

await update('src/electron-main.mjs', (source) => {
  let electron = source;
  if (!electron.includes('desktopCapturer')) {
    requireAnchor(electron, "import { app, BrowserWindow, dialog, Menu, nativeImage, screen, shell, Tray } from 'electron';", 'Electron import');
    electron = electron.replace(
      "import { app, BrowserWindow, dialog, Menu, nativeImage, screen, shell, Tray } from 'electron';",
      "import { app, BrowserWindow, desktopCapturer, dialog, Menu, nativeImage, screen, shell, Tray } from 'electron';",
    );
  }

  if (!electron.includes('async function captureMsfsWindow()')) {
    requireAnchor(electron, 'async function clearDirectoryContents(directory) {', 'MSFS capture function');
    electron = electron.replace('async function clearDirectoryContents(directory) {', `async function captureMsfsWindow() {\n  const sources = await desktopCapturer.getSources({\n    types: ['window'],\n    thumbnailSize: { width: 1920, height: 1080 },\n    fetchWindowIcons: false,\n  });\n  const preferred = sources.find((source) => /Microsoft Flight Simulator 2024/i.test(source.name))\n    || sources.find((source) => /Microsoft Flight Simulator/i.test(source.name))\n    || sources.find((source) => /FlightSimulator2024/i.test(source.name));\n  if (!preferred) throw new Error('MSFS-Fenster wurde nicht gefunden. Starte den Simulator und lasse das Fenster geöffnet.');\n  const image = preferred.thumbnail;\n  if (!image || image.isEmpty()) throw new Error('MSFS-Fenster konnte nicht aufgenommen werden.');\n  return {\n    buffer: image.toPNG(),\n    sourceName: preferred.name,\n    size: image.getSize(),\n    capturedAt: new Date().toISOString(),\n  };\n}\n\nasync function clearDirectoryContents(directory) {`);
  }

  if (!electron.includes('simSessionStorageDirectory:')) {
    requireAnchor(electron, "    msfsEfbBuilderStorageDirectory: path.join(app.getPath('userData'), 'msfs-efb-builder'),\n    updateService,", 'Electron server options');
    electron = electron.replace(
      "    msfsEfbBuilderStorageDirectory: path.join(app.getPath('userData'), 'msfs-efb-builder'),\n    updateService,",
      "    msfsEfbBuilderStorageDirectory: path.join(app.getPath('userData'), 'msfs-efb-builder'),\n    simSessionStorageDirectory: path.join(app.getPath('userData'), 'sim-session'),\n    screenshotProvider: captureMsfsWindow,\n    updateService,",
    );
  }
  return electron;
});

console.log('Applied Flight Deck EFB 1.19.0 native session + renderer recovery patch.');
