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

if (pkg.version !== '1.24.5') throw new Error(`Expected package version 1.24.5, got ${pkg.version}.`);
need(orchestrator, "runScript('scripts/apply-release-1.24.5.mjs')", '1.24.5 materializer is missing from the release orchestrator.');
need(pkg.scripts.dist, 'test-release-1.24.5.mjs', '1.24.5 regression is missing from dist.');
need(materializer, 'WINDOWS APP · v1.24.5', '1.24.5 materializer does not expose the running build version.');

need(installer, '/IM "FLYXORA.exe" /T /F', 'Setup does not terminate stale FLYXORA processes.');
need(installer, '/IM "Flight Deck EFB.exe" /T /F', 'Setup does not terminate stale legacy Flight Deck EFB processes.');
need(installer, 'Delete "$DESKTOP\\Flight Deck EFB.lnk"', 'Setup does not remove the legacy desktop shortcut.');
need(installer, 'Delete "$SMPROGRAMS\\Flight Deck EFB.lnk"', 'Setup does not remove the legacy Start Menu shortcut.');

need(electronMain, "title: 'FLYXORA 1.24.5'", 'Windows title does not identify FLYXORA 1.24.5.');
need(electronMain, "desktopUrl.searchParams.set('desktop', taxiServer.desktopSessionToken);", '1.24.5 lost hardened desktop session startup.');
need(app, 'WINDOWS APP · v1.24.5', 'Desktop recovery screen does not identify build 1.24.5.');
need(app, "authenticatedUrl('/api/session/validate')", '1.24.5 lost lightweight desktop session validation.');
need(html, 'data-app-version="1.24.5"', 'HTML app version is not 1.24.5.');
need(sw, 'flyxora-v1.24.5-stale-process', '1.24.5 service-worker cache marker is missing.');
need(changelog, '## 1.24.5 — Windows Upgrade Process', '1.24.5 changelog section is missing.');

console.log('FLYXORA 1.24.5 stale-instance upgrade regression passed.');
