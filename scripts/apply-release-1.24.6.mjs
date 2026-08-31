import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.6') throw new Error(`1.24.6 materializer requires package version 1.24.6, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.24.6 patch range missing: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('src/electron-main.mjs', (source) => {
  let next = source
    .replace("    title: 'FLYXORA 1.24.5',", "    title: 'FLYXORA 1.24.6',")
    .replace("    title: 'FLYXORA',", "    title: 'FLYXORA 1.24.6',");

  if (!next.includes("const desktopOverlayCss = '#pair-overlay{display:none!important;pointer-events:none!important}';")) {
    const anchor = "  await mainWindow.loadURL(desktopUrl.toString());";
    if (!next.includes(anchor)) throw new Error('1.24.6 Electron desktop URL anchor missing.');
    next = next.replace(anchor, `  // 1.24.6: pairing/recovery is a remote-device concern and must never cover the native Windows shell.\n  const desktopOverlayCss = '#pair-overlay{display:none!important;pointer-events:none!important}';\n  mainWindow.webContents.on('did-finish-load', () => {\n    mainWindow?.webContents?.insertCSS(desktopOverlayCss).catch(() => {});\n  });\n  await mainWindow.loadURL(desktopUrl.toString());\n  await mainWindow.webContents.insertCSS(desktopOverlayCss).catch(() => {});`);
  }
  return next;
});

await update('public/app.js', (source) => {
  let next = source
    .replaceAll('?v=1.24.5', '?v=1.24.6')
    .replace('WINDOWS APP · v1.24.5', 'WINDOWS APP · v1.24.6');

  // 1.24.4 replaced the range between validateToken() and the desktop helpers.
  // In the legacy source, connectEvents() lived inside that range and was therefore
  // accidentally deleted. Restore the SSE bridge before any authentication path can
  // call completeAuthentication().
  const eventBridge = next.includes('function connectEvents()') ? '' : `function connectEvents() {\n  eventSource?.close();\n  eventSource = new EventSource(authenticatedUrl('/api/events'));\n  eventSource.addEventListener('state', (event) => {\n    try {\n      renderState(JSON.parse(event.data));\n    } catch {\n      // Ignore a malformed update and keep the last valid state.\n    }\n  });\n}\n\n`;

  const desktopStart = `${eventBridge}async function bootstrapDesktopState() {\n  if (!token) return;\n  try {\n    const response = await fetch(authenticatedUrl('/api/state'), { cache: 'no-store' });\n    if (response.ok) renderState(await response.json());\n  } catch {\n    // The native shell stays usable; live state can recover via SSE/background retry.\n  }\n}\n\nasync function attachRecoveredDesktopSession() {\n  const recovered = await recoverDesktopHostToken({ attempts: 24, delayMs: 250 }).catch(() => null);\n  if (!recovered) return false;\n  token = recovered;\n  completeAuthentication();\n  bootstrapDesktopState().catch(() => {});\n  return true;\n}\n\nasync function start() {\n  const desktop = isDesktopElectron();\n  let candidate = null;\n  try { candidate = loadToken(); } catch { candidate = null; }\n\n  if (desktop) {\n    // 1.24.6: the Electron desktop shell never blocks on pairing/recovery UI.\n    elements.pairOverlay.hidden = true;\n    elements.pairOverlay.classList.remove('desktop-recovery');\n    if (candidate) {\n      token = candidate;\n      completeAuthentication();\n      bootstrapDesktopState().catch(() => {});\n    } else if (!await attachRecoveredDesktopSession()) {\n      // Keep the real application visible while the local host/session retries in the background.\n      elements.pairOverlay.hidden = true;\n      setTimeout(async () => {\n        for (let attempt = 0; attempt < 12 && !token; attempt += 1) {\n          if (await attachRecoveredDesktopSession()) return;\n          await new Promise((resolve) => setTimeout(resolve, 1_000));\n        }\n      }, 500);\n    }\n  } else {\n    try {\n      if (await validateToken(candidate)) {\n        completeAuthentication();\n      } else {\n        localStorage.removeItem('si-taxi-token');\n        token = null;\n        elements.pairOverlay.hidden = false;\n        setTimeout(() => elements.pinInput.focus(), 100);\n      }\n    } catch {\n      elements.pairOverlay.hidden = false;\n      elements.pairError.textContent = 'Windows-App ist nicht erreichbar.';\n    }\n  }\n\n`;

  next = replaceBetween(next, 'async function start() {', "  if ('serviceWorker' in navigator", desktopStart, 'non-blocking desktop startup');
  return next;
});

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, 'data-app-version="1.24.6"')
  .replaceAll('?v=1.24.5', '?v=1.24.6'));

await update('public/service-worker.js', (source) => source
  .replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flyxora-v1.24.6-desktop-shell';")
  .replaceAll('?v=1.24.5', '?v=1.24.6'));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.6 — Desktop Shell Startup')) return source;
  const section = `## 1.24.6 — Desktop Shell Startup\n\n- Restores the renderer SSE event bridge that was inadvertently removed by the 1.24.4 session-validation materializer; this was the root cause of the repeated Windows recovery overlay.\n- Removes the pairing/recovery overlay as a blocking state from the native Windows application. The Electron window now always exposes the real FLYXORA shell while its local host/session initializes.\n- Uses the fresh process token embedded in the Electron launch URL immediately instead of requiring a blocking preflight validation before showing the application.\n- Keeps host-token recovery as a background fallback and preserves PIN authentication for actual browser, tablet and mobile clients.\n- Adds a native Electron CSS guard so the remote-device pairing overlay cannot cover the Windows application even if renderer recovery logic is triggered unexpectedly.\n- Extends the packaged Windows renderer gate to fail whenever the pairing/recovery overlay is visible in Electron.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  const first = source.indexOf('## ');
  return first >= 0 ? `${source.slice(0, first)}${section}${source.slice(first)}` : `${section}${source}`;
});

console.log('FLYXORA 1.24.6 non-blocking desktop shell + SSE event bridge materialized.');
