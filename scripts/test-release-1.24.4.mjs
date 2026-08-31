import fs from 'node:fs/promises';

const [pkgRaw, orchestrator, materializer, server, electronMain, app, html, sw, changelog, rendererSmoke] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('scripts/prepare-release.mjs', 'utf8'),
  fs.readFile('scripts/apply-release-1.24.4.mjs', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
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
if (!['1.24.4', '1.24.5', '1.24.6'].includes(pkg.version)) throw new Error(`Expected package version 1.24.4 through 1.24.6, got ${pkg.version}.`);
need(orchestrator, "runScript('scripts/apply-release-1.24.4.mjs')", '1.24.4 materializer is missing from the release orchestrator.');
need(pkg.scripts.dist, 'test-release-1.24.4.mjs', '1.24.4 regression is missing from dist.');
need(materializer, "pathname === '/api/session/validate'", '1.24.4 materializer does not create lightweight session validation.');
need(server, 'const desktopSessionToken = randomBytes(24)', 'Per-process desktop session secret is missing.');
need(server, "pathname === '/api/session/validate'", 'Lightweight session validation endpoint is missing.');
need(server, "requestUrl.searchParams.get('desktop')", 'Desktop recovery does not verify the desktop session secret.');
need(server, 'secureEqual(presentedDesktopSession, desktopSessionToken)', 'Desktop session secret is not timing-safe verified.');
need(server, 'desktopSessionToken,\n    pairingPin,', 'Desktop session secret is not returned to Electron main.');
need(server, 'function stringifyJson(value)', 'BigInt-safe JSON serialization is missing.');
need(server, 'stringifyJson(state)', 'SSE live state does not use resilient serialization.');
reject(server, 'desktopAgent', 'Desktop recovery still depends on the Electron User-Agent.');
need(electronMain, "desktopUrl.searchParams.set('desktop', taxiServer.desktopSessionToken);", 'Electron does not pass the per-process desktop session secret.');
need(electronMain, 'if (browserStateRestored) await mainWindow.loadURL(desktopUrl.toString());', 'Restored browser state reload drops the desktop session secret.');
need(app, 'function desktopSessionSecret()', 'Renderer desktop session secret persistence is missing.');
need(app, "sessionStorage.setItem('flyxora-desktop-session'", 'Desktop session secret is not kept for renderer reloads.');
need(app, "authenticatedUrl('/api/session/validate')", 'Token validation still depends on the full /api/state payload.');
need(app, "endpoint.searchParams.set('desktop', desktop);", 'Desktop token recovery does not present the per-process desktop session secret.');
need(app, 'async function validateDesktopSession(candidate)', 'Desktop session validation fallback is missing.');
need(html, `data-app-version="${pkg.version}"`, `HTML app version is not ${pkg.version}.`);
const cache = pkg.version === '1.24.6' ? 'flyxora-v1.24.6-desktop-shell' : pkg.version === '1.24.5' ? 'flyxora-v1.24.5-stale-process' : 'flyxora-v1.24.4-host-session';
need(sw, cache, 'Service worker cache is not bumped for the current build.');
need(changelog, '## 1.24.4 — Windows Host Session', '1.24.4 changelog section is missing.');
need(rendererSmoke, 'desktopSessionRecovery', 'Packaged renderer smoke test does not exercise desktop session recovery.');
need(rendererSmoke, "localStorage.removeItem('si-taxi-token')", 'Packaged renderer smoke test does not remove the host token.');
need(rendererSmoke, "'/api/desktop/session'", 'Packaged renderer smoke test does not call the desktop recovery endpoint.');

console.log(`FLYXORA 1.24.4 Windows host session regression passed for ${pkg.version}.`);
