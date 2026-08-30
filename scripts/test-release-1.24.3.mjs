import fs from 'node:fs/promises';

const [pkgRaw, orchestrator, server, electronMain, app, html, sw, changelog] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('scripts/prepare-release.mjs', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('src/electron-main.mjs', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

if (pkg.version !== '1.24.3') throw new Error(`Expected package version 1.24.3, got ${pkg.version}.`);
need(orchestrator, 'scripts/apply-release-1.24.3.mjs', '1.24.3 materializer is missing from the release orchestrator.');
need(pkg.scripts.dist, 'test-release-1.24.3.mjs', '1.24.3 regression is missing from dist.');

need(server, "pathname === '/api/desktop/session'", 'Desktop session recovery endpoint is missing.');
need(server, "mode: 'desktop'", 'Desktop session endpoint does not identify desktop mode.');
need(server, 'desktopAgent', 'Desktop session endpoint is not restricted to Electron.');
need(server, '!localRequest || !desktopAgent', 'Desktop session endpoint is not loopback/Electron restricted.');

need(electronMain, "desktopUrl.searchParams.set('desktop', '1');", 'Electron launch does not mark the desktop session.');
need(electronMain, "title: 'FLYXORA'", 'Windows window title is not FLYXORA.');
reject(electronMain, 'const hasSingleInstanceLock = app.requestSingleInstanceLock();', 'electron-main reacquires the single-instance lock.');

need(app, 'function isDesktopElectron()', 'Desktop renderer detection is missing.');
need(app, 'async function recoverDesktopHostToken(', 'Desktop host token recovery is missing.');
need(app, "fetch('/api/desktop/session'", 'Desktop recovery does not call the local session endpoint.');
need(app, 'async function validateDesktopSession(candidate)', 'Desktop validation fallback is missing.');
need(app, 'showDesktopRecovery(', 'Desktop-specific startup recovery UI is missing.');
need(app, 'Keine Pairing-PIN erforderlich.', 'Desktop recovery still implies that a PIN is required.');
need(app, "elements.pairError.textContent = 'Windows-App ist nicht erreichbar.';", 'Mobile/browser pairing fallback was unintentionally removed.');

need(html, 'data-app-version="1.24.3"', 'HTML app version is not 1.24.3.');
need(sw, "flyxora-v1.24.3-desktop-start", 'Service-worker cache is not bumped for 1.24.3.');
need(changelog, '## 1.24.3 — Desktop Start Recovery', '1.24.3 changelog section is missing.');

console.log('FLYXORA 1.24.3 desktop start recovery regression passed.');
