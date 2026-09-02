import fs from 'node:fs/promises';

const VERSION = '1.24.12';

async function read(filename) {
  return fs.readFile(filename, 'utf8');
}

async function update(filename, transform) {
  const before = await read(filename);
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.12 recovery updated ${filename}`);
  }
}

const pkg = JSON.parse(await read('package.json'));
if (pkg.version !== VERSION) throw new Error(`1.24.12 recovery expected package ${VERSION}, got ${pkg.version}.`);

pkg.name = 'flight-deck-efb';
pkg.productName = 'FLYXORA';
pkg.main = 'src/electron-bootstrap.mjs';
pkg.build = pkg.build || {};
pkg.build.appId = 'de.checkner.flightdeckefb';
pkg.build.productName = 'FLYXORA';
pkg.build.artifactName = 'FLYXORA-Setup-${version}.${ext}';
pkg.build.win = pkg.build.win || {};
pkg.build.win.executableName = 'FLYXORA';
pkg.build.nsis = pkg.build.nsis || {};
pkg.build.nsis.createDesktopShortcut = true;
pkg.build.nsis.createStartMenuShortcut = true;
pkg.build.nsis.runAfterFinish = true;
pkg.build.nsis.shortcutName = 'FLYXORA';
pkg.build.nsis.uninstallDisplayName = 'FLYXORA';
pkg.scripts = pkg.scripts || {};
pkg.scripts['prepare:release'] = 'node scripts/prepare-release-1.24.12.mjs';
pkg.scripts.prepare = 'npm run prepare:release';
pkg.scripts.start = 'npm run prepare:release && electron .';
pkg.scripts.dist = 'npm run prepare:release && node scripts/test-single-instance-bootstrap.mjs && node scripts/test-flight-journey-engine.mjs && node scripts/test-flight-journey-service.mjs && node scripts/test-briefing-readiness-engine.mjs && node scripts/test-update-state-persistence.mjs && node scripts/test-feature-1.24-flight-tracking.mjs && node scripts/test-release-1.24.12.mjs && electron-builder --win --x64 --publish never';
pkg.scripts.release = 'npm run prepare:release && node scripts/test-single-instance-bootstrap.mjs && node scripts/test-flight-journey-engine.mjs && node scripts/test-flight-journey-service.mjs && node scripts/test-briefing-readiness-engine.mjs && node scripts/test-update-state-persistence.mjs && node scripts/test-feature-1.24-flight-tracking.mjs && node scripts/test-release-1.24.12.mjs && electron-builder --win --x64 --publish always';
pkg.scripts['test:ui'] = 'npm run prepare:release && node scripts/test-ui-polish.mjs && node scripts/test-feature-1.24-flight-tracking.mjs && node scripts/test-release-1.24.12.mjs';
pkg.scripts['test:ops'] = 'npm run prepare:release && node scripts/test-single-instance-bootstrap.mjs && node scripts/test-flight-journey-engine.mjs && node scripts/test-flight-journey-service.mjs && node scripts/test-briefing-readiness-engine.mjs && node scripts/test-update-state-persistence.mjs && node scripts/test-pilot-tools.mjs && node scripts/test-feature-1.24-flight-tracking.mjs && node scripts/test-release-1.24.12.mjs';
await fs.writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

const bootstrap = `import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

let bootstrapFailureWindow = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

function escapeHtml(value = '') {
  return String(value).replace(/[&<>\"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;',
  }[char]));
}

function bootstrapFailureDocument(detail = '') {
  const safeDetail = escapeHtml(detail || 'Unbekannter Startfehler.');
  return \`<!doctype html><html><head><meta charset="utf-8"><title>FLYXORA Startfehler</title><style>html,body{margin:0;height:100%;background:#07121c;color:#eaf5ff;font-family:Segoe UI,Arial,sans-serif}body{display:grid;place-items:center}.box{width:min(680px,calc(100% - 56px));padding:34px;border:1px solid rgba(255,122,122,.35);border-radius:22px;background:rgba(10,30,46,.96);box-shadow:0 24px 70px rgba(0,0,0,.45)}h1{margin:0 0 10px;font-size:28px;letter-spacing:.08em}.state{color:#ff9a9a;font-weight:800;margin-bottom:14px}.detail{color:#d6e7f3;line-height:1.5;white-space:pre-wrap;max-height:330px;overflow:auto}.hint{margin-top:18px;color:#8fb0c7;font-size:13px}</style></head><body><div class="box"><h1>FLYXORA</h1><div class="state">STARTFEHLER</div><div class="detail">\${safeDetail}</div><div class="hint">Ein Diagnoseprotokoll wurde als startup-error.log im FLYXORA-Datenordner gespeichert.</div></div></body></html>\`;
}

async function persistBootstrapFailure(error) {
  try {
    const directory = app.getPath('userData');
    await fs.mkdir(directory, { recursive: true });
    const detail = error?.stack || error?.message || String(error);
    await fs.writeFile(path.join(directory, 'startup-error.log'), \`[\${new Date().toISOString()}] FLYXORA bootstrap failure\\n\${detail}\\n\`, 'utf8');
  } catch (writeError) {
    console.error('[FLYXORA] Could not persist bootstrap failure:', writeError);
  }
}

async function showBootstrapFailure(error) {
  await app.whenReady();
  await persistBootstrapFailure(error);
  const detail = error?.stack || error?.message || String(error);
  if (!bootstrapFailureWindow || bootstrapFailureWindow.isDestroyed()) {
    bootstrapFailureWindow = new BrowserWindow({
      width: 760,
      height: 520,
      minWidth: 620,
      minHeight: 420,
      show: true,
      backgroundColor: '#07121c',
      title: 'FLYXORA Startfehler',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    bootstrapFailureWindow.on('closed', () => {
      bootstrapFailureWindow = null;
      app.quit();
    });
  }
  await bootstrapFailureWindow.loadURL(\`data:text/html;charset=utf-8,\${encodeURIComponent(bootstrapFailureDocument(detail))}\`);
  bootstrapFailureWindow.show();
  bootstrapFailureWindow.focus();
}

app.on('second-instance', () => {
  if (!bootstrapFailureWindow || bootstrapFailureWindow.isDestroyed()) return;
  if (bootstrapFailureWindow.isMinimized()) bootstrapFailureWindow.restore();
  bootstrapFailureWindow.show();
  bootstrapFailureWindow.focus();
});

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  try {
    await import('./electron-main.mjs');
  } catch (error) {
    console.error('[FLYXORA] Electron bootstrap failed:', error);
    try {
      await showBootstrapFailure(error);
    } catch (fallbackError) {
      console.error('[FLYXORA] Failure UI could not be shown:', fallbackError);
      try {
        await app.whenReady();
        dialog.showErrorBox('FLYXORA Startfehler', \`FLYXORA konnte nicht gestartet werden.\\n\\n\${error?.message || error}\`);
      } finally {
        app.quit();
      }
    }
  }
}
`;
await fs.writeFile('src/electron-bootstrap.mjs', bootstrap, 'utf8');
console.log('1.24.12 recovery updated src/electron-bootstrap.mjs');

await update('src/simconnect-client.mjs', (source) => {
  let next = source;
  if (next.includes("from 'node-simconnect';")) {
    next = next.replace(
      /import \{[\s\S]*?\} from 'node-simconnect';\n/,
      `let EventFlag;\nlet FacilityDataType;\nlet open;\nlet Protocol;\nlet RawBuffer;\nlet SimConnectConstants;\nlet SimConnectDataType;\nlet SimConnectException;\nlet SimConnectPeriod;\nlet SimObjectType;\nlet simConnectRuntimePromise = null;\n\nasync function ensureSimConnectRuntime() {\n  if (!simConnectRuntimePromise) {\n    simConnectRuntimePromise = import('node-simconnect').then((module) => {\n      ({\n        EventFlag, FacilityDataType, open, Protocol, RawBuffer, SimConnectConstants,\n        SimConnectDataType, SimConnectException, SimConnectPeriod, SimObjectType,\n      } = module);\n      return module;\n    }).catch((error) => {\n      simConnectRuntimePromise = null;\n      throw error;\n    });\n  }\n  return simConnectRuntimePromise;\n}\n`,
    );
  }
  if (!next.includes('await ensureSimConnectRuntime();')) {
    next = next.replace(
      `    this.engine.setConnection('simConnect', 'connecting', 'Verbinde mit MSFS');\n    try {\n      const { recvOpen, handle, protocol } = await this.#openCompatibleProtocol();`,
      `    this.engine.setConnection('simConnect', 'connecting', 'Verbinde mit MSFS');\n    try {\n      await ensureSimConnectRuntime();\n      const { recvOpen, handle, protocol } = await this.#openCompatibleProtocol();`,
    );
  }
  if (next.includes("from 'node-simconnect';")) throw new Error('Static node-simconnect import remains after 1.24.12 recovery.');
  if (!next.includes("import('node-simconnect')") || !next.includes('await ensureSimConnectRuntime();')) {
    throw new Error('Lazy SimConnect runtime loading was not materialized.');
  }
  return next;
});

await update('build/installer.nsh', (source) => {
  let next = source;
  if (!next.includes('/IM "flight-deck-efb.exe"')) {
    const anchor = `  nsExec::ExecToStack '\"$SYSDIR\\taskkill.exe\" /IM \"Flight Deck EFB.exe\" /T /F'\n  Pop $0\n  Pop $1\n`;
    if (next.includes(anchor)) {
      next = next.replace(anchor, `${anchor}  nsExec::ExecToStack '\"$SYSDIR\\taskkill.exe\" /IM \"flight-deck-efb.exe\" /T /F'\n  Pop $0\n  Pop $1\n`);
    }
  }

  const installMacro = `!macro customInstall\n  ; Remove branding-era shortcuts that can still point to an obsolete install.\n  Delete \"$DESKTOP\\Flight Deck EFB.lnk\"\n  Delete \"$DESKTOP\\flight-deck-efb.lnk\"\n  Delete \"$SMPROGRAMS\\Flight Deck EFB.lnk\"\n  Delete \"$SMPROGRAMS\\flight-deck-efb.lnk\"\n\n  ; Do not rely only on electron-builder's remembered shortcut state during a\n  ; repair/update. Explicitly recreate the shortcuts from the installed EXE.\n  \${If} $DesktopShortcutSelection == \${BST_CHECKED}\n    CreateShortCut \"$DESKTOP\\FLYXORA.lnk\" \"$INSTDIR\\FLYXORA.exe\"\n  \${Else}\n    Delete \"$DESKTOP\\FLYXORA.lnk\"\n  \${EndIf}\n  CreateShortCut \"$SMPROGRAMS\\FLYXORA.lnk\" \"$INSTDIR\\FLYXORA.exe\"\n!macroend`;

  if (!next.includes('CreateShortCut "$DESKTOP\\FLYXORA.lnk"')) {
    const pattern = /!macro customInstall[\s\S]*?!macroend/;
    if (!pattern.test(next)) throw new Error('NSIS customInstall macro is missing.');
    next = next.replace(pattern, installMacro);
  }
  return next;
});

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, `data-app-version="${VERSION}"`)
  .replace(/\?v=1\.24\.11\b/g, `?v=${VERSION}`));

await update('src/server.mjs', (source) => source
  .replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${VERSION}';`));

await update('public/service-worker.js', (source) => source
  .replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = 'flyxora-v${VERSION}-installed-startup-recovery';`)
  .replace(/\?v=1\.24\.11\b/g, `?v=${VERSION}`));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.12 — Installed Startup & Shortcut Recovery')) return source;
  const heading = '# FLYXORA changelog';
  const notes = `## 1.24.12 — Installed Startup & Shortcut Recovery\n\n- Recreates the FLYXORA desktop and Start Menu shortcuts explicitly during install and repair updates instead of relying on remembered NSIS shortcut state.\n- Keeps the post-install launch enabled for assisted installations.\n- Loads the optional native SimConnect runtime lazily, so a machine-specific SimConnect/native-module failure cannot prevent the FLYXORA desktop UI from starting.\n- Adds a bootstrap-level visible startup error window and writes startup-error.log even when a dependency fails before the normal desktop lifecycle is imported.\n- Extends Windows release validation with an actual silent installer test that verifies the installed executable and shortcuts, not only the unpacked build.\n`;
  if (source.includes(heading)) return source.replace(heading, `${heading}\n\n${notes}`);
  return `${heading}\n\n${notes}\n${source}`;
});

console.log('FLYXORA 1.24.12 installed startup and shortcut recovery materialized.');
