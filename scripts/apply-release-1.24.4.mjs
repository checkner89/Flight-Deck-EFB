import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.4') throw new Error(`1.24.4 materializer requires package version 1.24.4, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`1.24.4 patch anchor missing: ${label}`);
  return source.replace(search, replacement);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.24.4 patch range missing: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('src/server.mjs', (source) => {
  let next = source;

  if (!next.includes('function stringifyJson(value)')) {
    next = replaceRequired(
      next,
      'function json(response, statusCode, value, headers = {}) {\n  const body = JSON.stringify(value);',
      `function stringifyJson(value) {\n  return JSON.stringify(value, (_key, entry) => {\n    if (typeof entry !== 'bigint') return entry;\n    const numeric = Number(entry);\n    return Number.isSafeInteger(numeric) ? numeric : entry.toString();\n  });\n}\n\nfunction json(response, statusCode, value, headers = {}) {\n  const body = stringifyJson(value);`,
      'safe JSON serialization',
    );
  }

  if (!next.includes('const desktopSessionToken = randomBytes(24)')) {
    next = replaceRequired(
      next,
      "  const token = randomBytes(24).toString('base64url');\n  const pairingPin = String(randomInt(0, 1_000_000)).padStart(6, '0');",
      "  const token = randomBytes(24).toString('base64url');\n  const desktopSessionToken = randomBytes(24).toString('base64url');\n  const pairingPin = String(randomInt(0, 1_000_000)).padStart(6, '0');",
      'desktop session secret',
    );
  }

  next = next.replace('client.write(`event: state\\ndata: ${JSON.stringify(state)}\\n\\n`);', 'client.write(`event: state\\ndata: ${stringifyJson(state)}\\n\\n`);');

  const sessionBlock = `      if (pathname === '/api/session/validate' && request.method === 'GET') {\n        if (!authenticated) return json(response, 401, { error: 'Session nicht authentifiziert.' });\n        return json(response, 200, { authenticated: true, version: APP_VERSION, mode: hostAuthenticated ? 'desktop' : 'paired-device' });\n      }\n\n      if (pathname === '/api/desktop/session' && request.method === 'GET') {\n        const presentedDesktopSession = requestUrl.searchParams.get('desktop');\n        if (!localRequest || !secureEqual(presentedDesktopSession, desktopSessionToken)) {\n          return json(response, 403, { error: 'Desktop session recovery is only available to this local FLYXORA Windows instance.' });\n        }\n        return json(response, 200, { token, version: APP_VERSION, mode: 'desktop' });\n      }\n\n`;
  next = replaceBetween(
    next,
    "      if (pathname === '/api/desktop/session' && request.method === 'GET') {",
    "      if (pathname === '/health') {",
    sessionBlock,
    'desktop and lightweight session endpoints',
  );

  if (!next.includes('desktopSessionToken,\n    pairingPin,')) {
    next = replaceRequired(
      next,
      '    token,\n    pairingPin,',
      '    token,\n    desktopSessionToken,\n    pairingPin,',
      'desktop session secret server return',
    );
  }

  return next;
});

await update('src/electron-main.mjs', (source) => {
  let next = source;
  next = replaceRequired(
    next,
    "  desktopUrl.searchParams.set('desktop', '1');",
    "  desktopUrl.searchParams.set('desktop', taxiServer.desktopSessionToken);",
    'Electron desktop session secret',
  );
  next = next.replace(
    '  if (browserStateRestored) await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);',
    '  if (browserStateRestored) await mainWindow.loadURL(desktopUrl.toString());',
  );
  return next;
});

await update('public/app.js', (source) => {
  let next = source.replaceAll('?v=1.24.3', '?v=1.24.4');

  const validateReplacement = `async function validateToken(candidate) {\n  if (!candidate) return false;\n  token = candidate;\n  const response = await fetch(authenticatedUrl('/api/session/validate'), { cache: 'no-store' });\n  return response.ok;\n}\n\n`;
  next = replaceBetween(next, 'async function validateToken(candidate) {', 'function isDesktopElectron() {', validateReplacement, 'lightweight token validation');

  const desktopHelpers = `function desktopSessionSecret() {\n  const url = new URL(window.location.href);\n  const fromUrl = url.searchParams.get('desktop');\n  if (fromUrl) {\n    try { sessionStorage.setItem('flyxora-desktop-session', fromUrl); } catch {}\n    return fromUrl;\n  }\n  try { return sessionStorage.getItem('flyxora-desktop-session'); } catch { return null; }\n}\n\nfunction isDesktopElectron() {\n  return Boolean(desktopSessionSecret()) || /Electron\\//i.test(navigator.userAgent);\n}\n\nfunction completeAuthentication() {\n  elements.pairOverlay.hidden = true;\n  elements.pairOverlay.classList.remove('desktop-recovery');\n  connectEvents();\n  afterAuthentication().catch(() => {});\n}\n\nfunction showDesktopRecovery(message = 'Die lokale FLYXORA-Sitzung konnte noch nicht hergestellt werden.') {\n  elements.pairOverlay.hidden = false;\n  elements.pairOverlay.classList.add('desktop-recovery');\n  const card = elements.pairOverlay.querySelector('.pair-card');\n  if (!card) return;\n  card.innerHTML = \`<div class="brand centered"><span class="brand-mark"><span></span></span><span class="brand-copy"><strong>FLYXORA</strong><small>SIMULATION EFB</small></span></div><small>WINDOWS APP</small><h1>FLYXORA wird gestartet</h1><p>\${escapeHtml(message)}</p><button id="desktop-retry" type="button">ERNEUT VERSUCHEN</button><span class="pair-error">Keine Pairing-PIN erforderlich.</span>\`;\n  card.querySelector('#desktop-retry')?.addEventListener('click', () => window.location.reload());\n}\n\nasync function recoverDesktopHostToken({ attempts = 24, delayMs = 250 } = {}) {\n  const desktop = desktopSessionSecret();\n  if (!desktop) return null;\n  for (let attempt = 0; attempt < attempts; attempt += 1) {\n    try {\n      const endpoint = new URL('/api/desktop/session', window.location.origin);\n      endpoint.searchParams.set('desktop', desktop);\n      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });\n      if (response.ok) {\n        const data = await response.json();\n        if (data?.token) {\n          token = data.token;\n          try { localStorage.setItem('si-taxi-token', token); } catch {}\n          return token;\n        }\n      }\n    } catch {}\n    await new Promise((resolve) => setTimeout(resolve, delayMs));\n  }\n  return null;\n}\n\nasync function validateDesktopSession(candidate) {\n  try {\n    if (candidate && await validateToken(candidate)) return true;\n  } catch {}\n  const recovered = await recoverDesktopHostToken();\n  if (!recovered) return false;\n  try { return await validateToken(recovered); } catch { return false; }\n}\n\n`;
  next = replaceBetween(next, 'function isDesktopElectron() {', 'async function start() {', desktopHelpers, 'desktop session helpers');
  next = next
    .replace("showDesktopRecovery('Der lokale FLYXORA-Dienst konnte nicht authentifiziert werden. Bitte erneut verbinden.');", "showDesktopRecovery('Die lokale FLYXORA-Sitzung konnte nicht authentifiziert werden. Bitte erneut versuchen.');")
    .replaceAll("showDesktopRecovery('Der lokale FLYXORA-Dienst ist momentan nicht erreichbar.');", "showDesktopRecovery('Die lokale FLYXORA-Sitzung konnte nicht hergestellt werden.');");
  return next;
});

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, 'data-app-version="1.24.4"')
  .replaceAll('?v=1.24.3', '?v=1.24.4'));

await update('public/service-worker.js', (source) => source
  .replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flyxora-v1.24.4-host-session';")
  .replaceAll('?v=1.24.3', '?v=1.24.4'));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.4 — Windows Host Session')) return source;
  const section = `## 1.24.4 — Windows Host Session\n\n- Separates authentication validation from the full live-state payload so a state/data error can no longer force the Windows app into the startup fallback.\n- Replaces User-Agent-based desktop recovery with a per-process cryptographic desktop-session secret shared only between the local Electron window and its local host.\n- Reuses the same desktop session after update-state restoration and renderer reloads.\n- Makes host JSON/SSE serialization tolerant of BigInt simulator values.\n- Keeps tablet/browser PIN pairing isolated from the Windows desktop session.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  const first = source.indexOf('## ');
  return first >= 0 ? `${source.slice(0, first)}${section}${source.slice(first)}` : `${section}${source}`;
});

console.log('FLYXORA 1.24.4 hardened Windows host session materialized.');
