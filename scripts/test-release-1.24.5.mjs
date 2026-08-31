import fs from 'node:fs/promises';

const [pkgRaw, orchestrator, materializer, installer, electronMain, app, html, sw, changelog] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('scripts/prepare-release.mjs', 'utf8'),
  fs.readFile('scripts/apply-release-1.24.5.mjs', 'utf8'),
  fs.readFile('build/installer.nsh', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
if (!['1.24.5', '1.24.6'].includes(pkg.version)) throw new Error(`Expected package version 1.24.5 or 1.24.6, got ${pkg.version}.`);
need(orchestrator, "runScript('scripts/apply-release-1.24.5.mjs')", '1.24.5 materializer is missing from the release orchestrator.');
need(pkg.scripts.dist, 'test-release-1.24.5.mjs', '1.24.5 regression is missing from dist.');
need(materializer, 'WINDOWS APP · v1.24.5', '1.24.5 materializer does not expose its running build version.');
need(installer, '/IM "FLYXORA.exe" /T /F', 'Setup does not terminate stale FLYXORA processes.');
need(installer, '/IM "Flight Deck EFB.exe" /T /F', 'Setup does not terminate stale legacy Flight Deck EFB processes.');
need(installer, 'Delete "$DESKTOP\\Flight Deck EFB.lnk"', 'Setup does not remove the legacy desktop shortcut.');
need(installer, 'Delete "$SMPROGRAMS\\Flight Deck EFB.lnk"', 'Setup does not remove the legacy Start Menu shortcut.');
const title = pkg.version === '1.24.6' ? "title: 'FLYXORA 1.24.6'" : "title: 'FLYXORA 1.24.5'";
need(electronMain, title, 'Windows title does not identify the current FLYXORA build.');
need(electronMain, "desktopUrl.searchParams.set('desktop', taxiServer.desktopSessionToken);", 'Hardened desktop session startup is missing.');
need(app, pkg.version === '1.24.6' ? 'WINDOWS APP · v1.24.6' : 'WINDOWS APP · v1.24.5', 'Desktop build marker is missing.');
need(app, "authenticatedUrl('/api/session/validate')", 'Lightweight desktop session validation is missing.');
need(html, `data-app-version="${pkg.version}"`, 'HTML app version is incorrect.');
need(sw, pkg.version === '1.24.6' ? 'flyxora-v1.24.6-desktop-shell' : 'flyxora-v1.24.5-stale-process', 'Service-worker cache marker is incorrect.');
need(changelog, '## 1.24.5 — Windows Upgrade Process', '1.24.5 changelog section is missing.');

console.log(`FLYXORA 1.24.5 stale-instance upgrade regression passed for ${pkg.version}.`);
