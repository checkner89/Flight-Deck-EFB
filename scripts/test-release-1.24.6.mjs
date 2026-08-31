import fs from 'node:fs/promises';

const [pkgRaw, orchestrator, materializer, electronMain, app, html, sw, changelog, rendererSmoke] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('scripts/prepare-release.mjs', 'utf8'),
  fs.readFile('scripts/apply-release-1.24.6.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
  fs.readFile('scripts/verify-packaged-renderer.mjs', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

if (!['1.24.6', '1.24.7', '1.24.8'].includes(pkg.version)) throw new Error(`Expected package version 1.24.6 through 1.24.8, got ${pkg.version}.`);
need(orchestrator, "runScript('scripts/apply-release-1.24.6.mjs')", '1.24.6 materializer is missing from release orchestration.');
need(pkg.scripts.dist, 'test-release-1.24.6.mjs', '1.24.6 regression is missing from dist.');
need(materializer, 'the Electron desktop shell never blocks on pairing/recovery UI', '1.24.6 materializer does not define the non-blocking desktop startup.');
need(materializer, 'function connectEvents()', '1.24.6 materializer does not restore the SSE event bridge removed by 1.24.4.');
need(materializer, "#pair-overlay{display:none!important;pointer-events:none!important}", '1.24.6 materializer lacks the Electron-only overlay suppression guard.');

const title = pkg.version === '1.24.8' ? "title: 'FLYXORA 1.24.8'"
  : pkg.version === '1.24.7' ? "title: 'FLYXORA 1.24.7'"
  : "title: 'FLYXORA 1.24.6'";
need(electronMain, title, `Windows title does not identify FLYXORA ${pkg.version}.`);
need(electronMain, "#pair-overlay{display:none!important;pointer-events:none!important}", 'Electron does not suppress the pairing/recovery overlay.');
need(electronMain, "webContents.on('did-finish-load'", 'Overlay suppression is not reapplied after renderer reload/navigation.');
need(electronMain, 'await mainWindow.webContents.insertCSS(desktopOverlayCss)', 'Overlay suppression is not applied before the native shell is shown.');

need(app, 'function connectEvents()', 'SSE live event bridge is missing from the final renderer.');
need(app, "eventSource = new EventSource(authenticatedUrl('/api/events'));", 'SSE live event bridge is not connected to the authenticated host stream.');
need(app, '1.24.6: the Electron desktop shell never blocks on pairing/recovery UI.', 'Desktop startup is still using a blocking auth gate.');
need(app, 'async function bootstrapDesktopState()', 'Desktop live state is not bootstrapped independently of shell visibility.');
need(app, 'async function attachRecoveredDesktopSession()', 'Background desktop session recovery is missing.');
need(app, 'if (candidate) {\n      token = candidate;\n      completeAuthentication();', 'Fresh Electron launch token is not accepted immediately.');
need(app, 'elements.pairOverlay.hidden = true;', 'Desktop startup does not explicitly hide the pairing overlay.');
need(app, "elements.pairError.textContent = 'Windows-App ist nicht erreichbar.';", 'Browser/tablet pairing error flow was removed.');
need(app, 'setTimeout(() => elements.pinInput.focus(), 100);', 'External-device PIN pairing flow was removed.');
reject(app, "showDesktopRecovery('Die lokale FLYXORA-Sitzung konnte nicht hergestellt werden.');", 'Desktop startup can still enter the blocking recovery overlay.');

need(html, `data-app-version="${pkg.version}"`, `HTML app version is not ${pkg.version}.`);
const cache = pkg.version === '1.24.8' ? 'flyxora-v1.24.8-taxi-vatsim-profile'
  : pkg.version === '1.24.7' ? 'flyxora-v1.24.7-tracking-performance'
  : 'flyxora-v1.24.6-desktop-shell';
need(sw, cache, `Service worker cache is not bumped for ${pkg.version}.`);
need(changelog, '## 1.24.6 — Desktop Shell Startup', '1.24.6 changelog section is missing.');
need(rendererSmoke, 'pairOverlayVisible', 'Packaged renderer gate does not inspect pairing/recovery overlay visibility.');
need(rendererSmoke, 'Desktop pairing/recovery overlay is visible in packaged Electron', 'Packaged renderer gate does not fail on a visible desktop overlay.');

console.log(`FLYXORA 1.24.6 non-blocking desktop shell + SSE event bridge regression passed for ${pkg.version}.`);
