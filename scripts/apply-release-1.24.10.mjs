import fs from 'node:fs/promises';

const VERSION = '1.24.10';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.10 recovery updated ${filename}`);
  }
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== VERSION) throw new Error(`1.24.10 hotfix expected package ${VERSION}, got ${pkg.version}.`);

// Keep the historical technical package identity for Electron/NSIS/update-state
// compatibility. The user-visible product name remains FLYXORA everywhere.
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

await update('src/electron-main.mjs', (source) => source
  // The bootstrap already owns the single-instance lock. A second lock request
  // can terminate the packaged app immediately on affected Windows installs.
  .replace(/\napp\.setAppUserModelId\('de\.checkner\.flightdeckefb'\);\nconst hasSingleInstanceLock = app\.requestSingleInstanceLock\(\);\nif \(!hasSingleInstanceLock\) app\.quit\(\);\n/, "\napp.setAppUserModelId('de.checkner.flightdeckefb');\n")
  // In-app updates must use the silent NSIS path. The old call opened the
  // assisted installer even though the installer hooks were written for /S.
  .replace('autoUpdater.quitAndInstall(false, true)', 'autoUpdater.quitAndInstall(true, true)')
  .replace(/Flight Deck EFB ist aktuell\./g, 'FLYXORA ist aktuell.')
  .replace(/Flight Deck EFB wird neu gestartet und aktualisiert\./g, 'FLYXORA wird neu gestartet und aktualisiert.')
  .replace(/title: 'Flight Deck EFB'/g, "title: 'FLYXORA'")
  .replace(/dialog\.showErrorBox\('Flight Deck EFB'/g, "dialog.showErrorBox('FLYXORA'")
  .replace(/tray\.setToolTip\('Flight Deck EFB/g, "tray.setToolTip('FLYXORA")
  .replace(/label: 'Flight Deck EFB öffnen'/g, "label: 'FLYXORA öffnen'"));

await update('src/electron-bootstrap.mjs', (source) => source
  .replace(/\[Flight Deck EFB\]/g, '[FLYXORA]'));

await update('build/installer.nsh', (source) => {
  let next = source.replace(/Flight Deck EFB/g, 'FLYXORA');
  if (!next.includes('/IM "flight-deck-efb.exe"')) {
    const legacyKill = `  nsExec::ExecToStack '\"$SYSDIR\\taskkill.exe\" /IM \"flight-deck-efb.exe\" /T /F'\n  Pop $0\n  Pop $1\n`;
    if (next.includes('  Sleep 450')) {
      next = next.replace('  Sleep 450', `${legacyKill}  Sleep 450`);
    } else {
      throw new Error('Installer process-cleanup anchor is missing.');
    }
  }
  return next.replace(/flight-deck-third-party-notices/g, 'flyxora-third-party-notices');
});

await update('public/index.html', (source) => source
  .replace(/data-app-version="[^"]+"/, `data-app-version="${VERSION}"`)
  .replace(/\?v=1\.24\.9\b/g, `?v=${VERSION}`));

await update('src/server.mjs', (source) => source
  .replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${VERSION}';`));

await update('public/service-worker.js', (source) => source
  .replace(/^const CACHE_NAME = .*;$/m, `const CACHE_NAME = 'flyxora-v${VERSION}-recovery';`)
  .replace(/\?v=1\.24\.9\b/g, `?v=${VERSION}`));

// The generic release-branch workflow still executes a small set of historical
// regression contracts for older releases. Extending their version guards is
// harmless and keeps manual invocations from failing only because of 1.24.10.
for (const filename of [
  'scripts/test-release-1.20.5.mjs',
  'scripts/test-release-1.20.6.mjs',
  'scripts/test-release-1.20.7.mjs',
  'scripts/test-release-1.20.9.mjs',
  'scripts/test-release-1.20.10.mjs',
  'scripts/test-release-1.20.11.mjs',
  'scripts/test-release-1.21.0.mjs',
  'scripts/test-release-1.22.0.mjs',
  'scripts/test-release-1.22.1.mjs',
]) {
  await update(filename, (source) => {
    if (source.includes(`'${VERSION}'`)) return source;
    if (source.includes('const compatibleVersions = [')) {
      return source.replace('const compatibleVersions = [', `const compatibleVersions = ['${VERSION}', `);
    }
    return source.replace(/if \(!\[([^\n]+)\]\.includes\(pkg\.version\)\)/, (match, versions) =>
      `if (!['${VERSION}', ${versions}].includes(pkg.version))`);
  });
}

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.10 — Windows Startup & Updater Recovery')) return source;
  const heading = '# FLYXORA changelog';
  const notes = `## 1.24.10 — Windows Startup & Updater Recovery\n\n- Restored the historical technical package identity while keeping FLYXORA as the complete visible product name.\n- Removed the duplicate Electron single-instance lock acquisition that could make an installed Windows build exit immediately.\n- Switched in-app updates to the intended silent NSIS install path and forced FLYXORA to relaunch after a successful update.\n- Hardened the installer cleanup for FLYXORA and legacy executable names so stale tray processes cannot block a repair install.\n- Kept the existing appId and GitHub update channel unchanged for in-place repair upgrades.\n`;
  if (source.includes(heading)) return source.replace(heading, `${heading}\n\n${notes}`);
  return `${heading}\n\n${notes}\n${source}`;
});

console.log('FLYXORA 1.24.10 Windows startup/updater recovery hotfix materialized.');
