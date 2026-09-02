import fs from 'node:fs/promises';

const VERSION = '1.24.12';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.12 repair updated ${filename}`);
  }
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== VERSION) throw new Error(`1.24.12 repair expected package ${VERSION}, got ${pkg.version}.`);

pkg.name = 'flight-deck-efb';
pkg.productName = 'FLYXORA';
pkg.build = pkg.build || {};
pkg.build.appId = 'de.checkner.flightdeckefb';
pkg.build.productName = 'FLYXORA';
pkg.build.artifactName = 'FLYXORA-Setup-${version}.${ext}';
pkg.build.win = pkg.build.win || {};
pkg.build.win.executableName = 'FLYXORA';
pkg.build.nsis = pkg.build.nsis || {};
pkg.build.nsis.createDesktopShortcut = true;
pkg.build.nsis.createStartMenuShortcut = true;
pkg.build.nsis.shortcutName = 'FLYXORA';
pkg.build.nsis.uninstallDisplayName = 'FLYXORA';
pkg.build.nsis.runAfterFinish = true;
await fs.writeFile('package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

await update('src/electron-bootstrap.mjs', (source) => {
  let next = source.replace("import { app } from 'electron';", "import { app, dialog } from 'electron';");
  if (!next.includes("dialog.showErrorBox('FLYXORA Startfehler'")) {
    next = next.replace(
      /  } catch \(error\) \{\n    console\.error\('\[FLYXORA\] Electron bootstrap failed:', error\);\n    app\.quit\(\);\n    process\.exitCode = 1;\n  }/,
      `  } catch (error) {\n    console.error('[FLYXORA] Electron bootstrap failed:', error);\n    const detail = error?.stack || error?.message || String(error);\n    try {\n      dialog.showErrorBox('FLYXORA Startfehler', \`FLYXORA konnte die Desktop-Oberfläche nicht initialisieren.\\n\\n\${detail}\`);\n    } catch {}\n    app.quit();\n    process.exitCode = 1;\n  }`,
    );
  }
  return next;
});

await update('src/electron-main.mjs', (source) => {
  let next = source.replace("import { createTaxiServer } from './server.mjs';\n", '');

  if (!next.includes("await import('./server.mjs')")) {
    next = next.replace(
      `async function createWindow() {\n  const demo = process.env.SI_TAXI_DEMO === '1' || process.argv.includes('--demo');\n  updateService ||= createUpdateService();`,
      `async function createWindow() {\n  const demo = process.env.SI_TAXI_DEMO === '1' || process.argv.includes('--demo');\n  updateService ||= createUpdateService();\n  // Load the local service stack only after Electron is ready and the visible\n  // startup window exists. A machine-specific server/native-module failure is\n  // therefore rendered in FLYXORA instead of occurring before any window exists.\n  const { createTaxiServer } = await import('./server.mjs');`,
    );
  }

  return next;
});

await update('build/installer.nsh', (source) => {
  let next = source;
  if (!next.includes('SetShellVarContext current')) {
    next = next.replace('!macro customInit\n', '!macro customInit\n  SetShellVarContext current\n');
  }

  const replacement = [
    '!macro customInstall',
    '  SetShellVarContext current',
    '',
    '  ; Remove branding-era or stale shortcuts first.',
    '  Delete "$DESKTOP\\Flight Deck EFB.lnk"',
    '  Delete "$SMPROGRAMS\\Flight Deck EFB.lnk"',
    '  Delete "$DESKTOP\\FLYXORA.lnk"',
    '  Delete "$SMPROGRAMS\\FLYXORA.lnk"',
    '',
    "  ; Do not depend solely on electron-builder's shortcut phase. Recreate the",
    '  ; current-user shortcuts explicitly against the stable installed executable.',
    '  ${If} $DesktopShortcutSelection == ${BST_CHECKED}',
    '    CreateShortCut "$DESKTOP\\FLYXORA.lnk" "$INSTDIR\\FLYXORA.exe" "" "$INSTDIR\\FLYXORA.exe" 0 SW_SHOWNORMAL "" "FLYXORA"',
    '  ${EndIf}',
    '  CreateShortCut "$SMPROGRAMS\\FLYXORA.lnk" "$INSTDIR\\FLYXORA.exe" "" "$INSTDIR\\FLYXORA.exe" 0 SW_SHOWNORMAL "" "FLYXORA"',
    '!macroend',
  ].join('\n');

  next = next.replace(/!macro customInstall[\s\S]*?!macroend/, replacement);
  return next;
});

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, `data-app-version="${VERSION}"`)
  .replace(/\?v=1\.24\.11\b/g, `?v=${VERSION}`));

await update('src/server.mjs', (source) => source
  .replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${VERSION}';`));

await update('public/service-worker.js', (source) => source
  .replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = 'flyxora-v${VERSION}-desktop-start-repair';`)
  .replace(/\?v=1\.24\.11\b/g, `?v=${VERSION}`));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.12 — Desktop & Startup Repair')) return source;
  const heading = '# FLYXORA changelog';
  const notes = `## 1.24.12 — Desktop & Startup Repair\n\n- Explicitly recreates the FLYXORA desktop and Start Menu shortcuts during assisted installs and silent repair updates, targeting the stable installed FLYXORA.exe.\n- Keeps the Desktop Shortcut task enabled by default and explicitly enables Run after finish for assisted installations.\n- Defers the local server/native-module import until after Electron is ready and the visible FLYXORA startup window already exists.\n- Adds a bootstrap-level Windows error dialog for failures that happen before electron-main can create the normal startup window.\n- Preserves the existing updater identity and all local user data while repairing launchability and shortcut creation.\n`;
  if (source.includes(heading)) return source.replace(heading, `${heading}\n\n${notes}`);
  return `${heading}\n\n${notes}\n${source}`;
});

console.log('FLYXORA 1.24.12 desktop/startup repair materialized.');
