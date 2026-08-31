import fs from 'node:fs/promises';

const VERSION = '1.24.11';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.11 startup recovery updated ${filename}`);
  }
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== VERSION) throw new Error(`1.24.11 hotfix expected package ${VERSION}, got ${pkg.version}.`);

// Preserve the technical identity used by existing installations and the updater.
pkg.name = 'flight-deck-efb';
pkg.productName = 'FLYXORA';
pkg.build = pkg.build || {};
pkg.build.appId = 'de.checkner.flightdeckefb';
pkg.build.productName = 'FLYXORA';
pkg.build.artifactName = 'FLYXORA-Setup-${version}.${ext}';
pkg.build.win = pkg.build.win || {};
pkg.build.win.executableName = 'FLYXORA';
pkg.build.nsis = pkg.build.nsis || {};
pkg.build.nsis.shortcutName = 'FLYXORA';
pkg.build.nsis.uninstallDisplayName = 'FLYXORA';
await fs.writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

await update('src/electron-bootstrap.mjs', (source) => source
  .replace(/\[Flight Deck EFB\]/g, '[FLYXORA]'));

await update('src/electron-main.mjs', (source) => {
  let next = source;

  // The bootstrap is the sole owner of the single-instance lock. Keeping a second
  // lock request in electron-main made startup behavior dependent on timing and
  // could strand an already running process without a usable foreground window.
  next = next.replace(
    /\napp\.setAppUserModelId\('de\.checkner\.flightdeckefb'\);\nconst hasSingleInstanceLock = app\.requestSingleInstanceLock\(\);\nif \(!hasSingleInstanceLock\) app\.quit\(\);\n/,
    "\napp.setAppUserModelId('de.checkner.flightdeckefb');\n",
  );

  if (!next.includes('let startupWindow;')) {
    next = next.replace('let mainWindow;\n', 'let mainWindow;\nlet startupWindow;\n');
  }

  next = next.replace(
    `function showMainWindow() {\n  if (!mainWindow || mainWindow.isDestroyed()) return;\n  if (mainWindow.isMinimized()) mainWindow.restore();\n  mainWindow.show();\n  mainWindow.focus();\n}`,
    `function showMainWindow() {\n  const target = mainWindow && !mainWindow.isDestroyed()\n    ? mainWindow\n    : startupWindow && !startupWindow.isDestroyed()\n      ? startupWindow\n      : null;\n  if (!target) return;\n  if (target.isMinimized()) target.restore();\n  target.show();\n  target.focus();\n}`,
  );

  if (!next.includes('function createStartupWindow()')) {
    const anchor = 'async function clearDirectoryContents(directory) {';
    const helper = `function startupDocument({ failed = false, detail = '' } = {}) {\n  const safeDetail = String(detail || '').replace(/[&<>\"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;' }[char]));\n  return \`<!doctype html><html><head><meta charset="utf-8"><title>FLYXORA</title><style>html,body{margin:0;height:100%;background:#07121c;color:#eaf5ff;font-family:Segoe UI,Arial,sans-serif}body{display:grid;place-items:center}.box{width:min(560px,calc(100% - 56px));padding:34px;border:1px solid rgba(113,207,255,.22);border-radius:22px;background:rgba(10,30,46,.92);box-shadow:0 24px 70px rgba(0,0,0,.42)}h1{margin:0 0 10px;font-size:28px;letter-spacing:.08em}.state{color:#63d7ff;font-weight:700;margin-bottom:12px}.detail{color:#a9c4d8;line-height:1.5;white-space:pre-wrap}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#63d7ff;margin-right:8px;box-shadow:0 0 16px #63d7ff}</style></head><body><div class="box"><h1>FLYXORA</h1><div class="state"><span class="dot"></span>\${failed ? 'STARTFEHLER' : 'WIRD GESTARTET'}</div><div class="detail">\${failed ? safeDetail || 'FLYXORA konnte nicht vollständig gestartet werden.' : 'Desktop-Oberfläche und lokale Dienste werden initialisiert …'}</div></div></body></html>\`;\n}\n\nfunction createStartupWindow() {\n  if (startupWindow && !startupWindow.isDestroyed()) return startupWindow;\n  startupWindow = new BrowserWindow({\n    width: 620,\n    height: 360,\n    minWidth: 520,\n    minHeight: 300,\n    show: true,\n    backgroundColor: '#07121c',\n    icon: fileURLToPath(new URL('../public/assets/app-icon-512.png', import.meta.url)),\n    title: 'FLYXORA',\n    autoHideMenuBar: true,\n    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },\n  });\n  startupWindow.on('closed', () => { startupWindow = null; });\n  startupWindow.loadURL(\`data:text/html;charset=utf-8,\${encodeURIComponent(startupDocument())}\`).catch(() => {});\n  startupWindow.show();\n  startupWindow.focus();\n  return startupWindow;\n}\n\n`;
    if (!next.includes(anchor)) throw new Error('Startup helper insertion anchor is missing.');
    next = next.replace(anchor, `${helper}${anchor}`);
  }

  // Never keep the real BrowserWindow hidden while waiting for its renderer.
  next = next.replace("    show: false,\n    backgroundColor: '#07121c',", "    show: true,\n    backgroundColor: '#07121c',");
  next = next.replace("    title: 'Flight Deck EFB',", "    title: 'FLYXORA',");

  // Destroy the splash only after the real window is definitely visible.
  if (!next.includes('startupWindow?.destroy();')) {
    next = next.replace(
      `  mainWindow.maximize();\n  mainWindow.show();\n  mainWindow.focus();\n  createTray();`,
      `  mainWindow.maximize();\n  mainWindow.show();\n  mainWindow.focus();\n  if (startupWindow && !startupWindow.isDestroyed()) startupWindow.destroy();\n  startupWindow = null;\n  createTray();`,
    );
  }

  // A visible splash is created before any local service initialization. If a
  // machine-specific startup failure occurs, keep the window visible with the
  // error instead of leaving only background Electron processes in Task Manager.
  next = next.replace(
    `app.whenReady().then(createWindow).catch((error) => {\n  dialog.showErrorBox('Flight Deck EFB', \`Die Anwendung konnte nicht gestartet werden.\\n\\n\${error.message}\`);\n  app.quit();\n});`,
    `app.whenReady().then(async () => {\n  createStartupWindow();\n  try {\n    await createWindow();\n  } catch (error) {\n    console.error('[FLYXORA] Desktop startup failed:', error);\n    const target = startupWindow && !startupWindow.isDestroyed() ? startupWindow : createStartupWindow();\n    await target.loadURL(\`data:text/html;charset=utf-8,\${encodeURIComponent(startupDocument({ failed: true, detail: error?.stack || error?.message || String(error) }))}\`).catch(() => {});\n    target.show();\n    target.focus();\n  }\n}).catch((error) => {\n  console.error('[FLYXORA] Electron readiness failed:', error);\n  dialog.showErrorBox('FLYXORA', \`Die Anwendung konnte nicht gestartet werden.\\n\\n\${error.message}\`);\n  app.quit();\n});`,
  );

  next = next
    .replace(/Flight Deck EFB ist aktuell\./g, 'FLYXORA ist aktuell.')
    .replace(/Flight Deck EFB wird neu gestartet und aktualisiert\./g, 'FLYXORA wird neu gestartet und aktualisiert.')
    .replace(/title: 'Flight Deck EFB'/g, "title: 'FLYXORA'")
    .replace(/dialog\.showErrorBox\('Flight Deck EFB'/g, "dialog.showErrorBox('FLYXORA'")
    .replace(/tray\.setToolTip\('Flight Deck EFB/g, "tray.setToolTip('FLYXORA")
    .replace(/label: 'Flight Deck EFB öffnen'/g, "label: 'FLYXORA öffnen'");

  return next;
});

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, `data-app-version="${VERSION}"`)
  .replace(/\?v=1\.24\.10\b/g, `?v=${VERSION}`));

await update('src/server.mjs', (source) => source
  .replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${VERSION}';`));

await update('public/service-worker.js', (source) => source
  .replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = 'flyxora-v${VERSION}-foreground-recovery';`)
  .replace(/\?v=1\.24\.10\b/g, `?v=${VERSION}`));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.11 — Foreground Startup Recovery')) return source;
  const heading = '# FLYXORA changelog';
  const notes = `## 1.24.11 — Foreground Startup Recovery\n\n- Added an immediate visible FLYXORA startup window before local simulator services initialize, preventing apparently installed-but-invisible launches.\n- The real desktop BrowserWindow is no longer hidden while its renderer is loading.\n- Kept startup failures visible inside FLYXORA instead of leaving only background Electron processes.\n- Removed the redundant single-instance lock from electron-main so the bootstrap is the sole lock owner.\n- Preserved the stable Windows appId, installation directory, updater channel and FLYXORA branding for in-place repair upgrades.\n`;
  if (source.includes(heading)) return source.replace(heading, `${heading}\n\n${notes}`);
  return `${heading}\n\n${notes}\n${source}`;
});

console.log('FLYXORA 1.24.11 foreground startup recovery materialized.');
