import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.3') throw new Error(`1.24.3 materializer requires package version 1.24.3, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => {
  if (source.includes("pathname === '/api/desktop/session'")) return source;
  const anchor = "      if (pathname === '/health') {";
  if (!source.includes(anchor)) throw new Error('1.24.3 server desktop-session anchor missing.');
  const block = `      if (pathname === '/api/desktop/session' && request.method === 'GET') {\n        const desktopAgent = /\\bElectron\\/\\d+(?:\\.\\d+)*/i.test(String(request.headers['user-agent'] || ''));\n        if (!localRequest || !desktopAgent) return json(response, 403, { error: 'Desktop session recovery is only available to the local FLYXORA Windows app.' });\n        return json(response, 200, { token, version: APP_VERSION, mode: 'desktop' });\n      }\n\n`;
  return source.replace(anchor, `${block}${anchor}`);
});

await update('src/electron-main.mjs', (source) => {
  let next = source.replace("    title: 'Flight Deck EFB',", "    title: 'FLYXORA',");
  if (!next.includes("desktopUrl.searchParams.set('desktop', '1');")) {
    const anchor = '  await mainWindow.loadURL(taxiServer.authenticatedLocalUrl);';
    if (!next.includes(anchor)) throw new Error('1.24.3 Electron desktop URL anchor missing.');
    next = next.replace(anchor, `  const desktopUrl = new URL(taxiServer.authenticatedLocalUrl);\n  desktopUrl.searchParams.set('desktop', '1');\n  await mainWindow.loadURL(desktopUrl.toString());`);
  }
  return next;
});

await update('public/app.js', (source) => {
  let next = source.replaceAll('?v=1.24.2', '?v=1.24.3');
  if (!next.includes('async function recoverDesktopHostToken(')) {
    const startMarker = 'async function start() {';
    const serviceWorkerMarker = "  if ('serviceWorker' in navigator";
    const start = next.indexOf(startMarker);
    const serviceWorker = next.indexOf(serviceWorkerMarker, start);
    if (start < 0 || serviceWorker < 0) throw new Error('1.24.3 renderer startup range missing.');
    const replacement = `function isDesktopElectron() {\n  const url = new URL(window.location.href);\n  return /Electron\\//i.test(navigator.userAgent) || url.searchParams.get('desktop') === '1';\n}\n\nfunction completeAuthentication() {\n  elements.pairOverlay.hidden = true;\n  elements.pairOverlay.classList.remove('desktop-recovery');\n  connectEvents();\n  afterAuthentication().catch(() => {});\n}\n\nfunction showDesktopRecovery(message = 'Der lokale FLYXORA-Dienst antwortet noch nicht.') {\n  elements.pairOverlay.hidden = false;\n  elements.pairOverlay.classList.add('desktop-recovery');\n  const card = elements.pairOverlay.querySelector('.pair-card');\n  if (!card) return;\n  card.innerHTML = \`<div class="brand centered"><span class="brand-mark"><span></span></span><span class="brand-copy"><strong>FLYXORA</strong><small>SIMULATION EFB</small></span></div><small>WINDOWS APP</small><h1>FLYXORA wird verbunden</h1><p>\${escapeHtml(message)}</p><button id="desktop-retry" type="button">ERNEUT VERBINDEN</button><span class="pair-error">Keine Pairing-PIN erforderlich.</span>\`;\n  card.querySelector('#desktop-retry')?.addEventListener('click', () => window.location.reload());\n}\n\nasync function recoverDesktopHostToken({ attempts = 20, delayMs = 250 } = {}) {\n  if (!isDesktopElectron()) return null;\n  for (let attempt = 0; attempt < attempts; attempt += 1) {\n    try {\n      const response = await fetch('/api/desktop/session', { cache: 'no-store', credentials: 'same-origin' });\n      if (response.ok) {\n        const data = await response.json();\n        if (data?.token) {\n          token = data.token;\n          try { localStorage.setItem('si-taxi-token', token); } catch {}\n          return token;\n        }\n      }\n    } catch {}\n    await new Promise((resolve) => setTimeout(resolve, delayMs));\n  }\n  return null;\n}\n\nasync function validateDesktopSession(candidate) {\n  if (await validateToken(candidate)) return true;\n  const recovered = await recoverDesktopHostToken();\n  return recovered ? validateToken(recovered) : false;\n}\n\nasync function start() {\n  const desktop = isDesktopElectron();\n  let candidate = null;\n  try { candidate = loadToken(); } catch { candidate = null; }\n  try {\n    const valid = desktop ? await validateDesktopSession(candidate) : await validateToken(candidate);\n    if (valid) {\n      completeAuthentication();\n    } else if (desktop) {\n      showDesktopRecovery('Der lokale FLYXORA-Dienst konnte nicht authentifiziert werden. Bitte erneut verbinden.');\n    } else {\n      localStorage.removeItem('si-taxi-token');\n      token = null;\n      elements.pairOverlay.hidden = false;\n      setTimeout(() => elements.pinInput.focus(), 100);\n    }\n  } catch {\n    if (desktop) {\n      try {\n        const recovered = await recoverDesktopHostToken({ attempts: 24, delayMs: 250 });\n        if (recovered && await validateToken(recovered)) completeAuthentication();\n        else showDesktopRecovery('Der lokale FLYXORA-Dienst ist momentan nicht erreichbar.');\n      } catch {\n        showDesktopRecovery('Der lokale FLYXORA-Dienst ist momentan nicht erreichbar.');\n      }\n    } else {\n      elements.pairOverlay.hidden = false;\n      elements.pairError.textContent = 'Windows-App ist nicht erreichbar.';\n    }\n  }\n\n`;
    next = `${next.slice(0, start)}${replacement}${next.slice(serviceWorker)}`;
  }
  return next;
});

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, 'data-app-version="1.24.3"')
  .replaceAll('?v=1.24.2', '?v=1.24.3'));

await update('public/service-worker.js', (source) => source
  .replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flyxora-v1.24.3-desktop-start';")
  .replaceAll('?v=1.24.2', '?v=1.24.3'));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.3 — Desktop Start Recovery')) return source;
  const section = `## 1.24.3 — Desktop Start Recovery\n\n- Prevents the Windows app from falling into the mobile Pairing-PIN screen when its local host token is missing or stale.\n- Adds a loopback-only Electron desktop-session recovery endpoint and automatic token recovery/retry during startup.\n- Keeps the mobile Pairing-PIN flow unchanged for actual tablets and browsers.\n- Marks the Electron launch explicitly as desktop mode and uses FLYXORA as the Windows window title.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  const first = source.indexOf('## ');
  return first >= 0 ? `${source.slice(0, first)}${section}${source.slice(first)}` : `${section}${source}`;
});

console.log('FLYXORA 1.24.3 desktop start recovery materialized.');
