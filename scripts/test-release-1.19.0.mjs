import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createTaxiServer } from '../src/server.mjs';

const pilot = await fs.readFile('public/pilot-tools.js', 'utf8');
const nativeUi = await fs.readFile('public/sim-session-native.js', 'utf8');
const html = await fs.readFile('public/index.html', 'utf8');
const serverSource = await fs.readFile('src/server.mjs', 'utf8');
const electronSource = await fs.readFile('src/electron-main.mjs', 'utf8');

function requireText(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

function rejectText(source, token, message) {
  if (source.includes(token)) throw new Error(message);
}

requireText(pilot, 'function schedulePilotTileSync()', 'Pilot tile synchronization is not throttled.');
requireText(pilot, 'pilotLabelSignature', 'Pilot tile labels are still rewritten on every observer callback.');
requireText(pilot, "if (heading.textContent !== nextLabel)", 'Flight Notes normalization is not mutation-safe.');
requireText(pilot, 'legacyPilotTilesCleaned', 'Legacy tile cleanup is not one-shot.');
rejectText(pilot, `const observer = new MutationObserver(() => {\n    installTiles();\n    normalizeExistingFlightNotes();`, 'Recursive MutationObserver renderer loop is still present.');

requireText(nativeUi, '/api/sim-session/status', 'Native Sim Session status UI is missing.');
requireText(nativeUi, '/api/sim-session/screenshot', 'Remote MSFS screenshot UI is missing.');
requireText(nativeUi, '/api/discovery/status', 'LAN discovery UI is missing.');
requireText(html, 'sim-session-native.js?v=1.19.0', '1.19 native Sim Session script is not wired.');
requireText(html, 'sim-session-native.css?v=1.19.0', '1.19 native Sim Session styles are not wired.');
requireText(serverSource, "pathname === '/api/sim-session/status'", 'Sim Session API was not patched into the server.');
requireText(serverSource, 'LanDiscoveryService', 'LAN discovery service was not patched into the server.');
requireText(electronSource, 'captureMsfsWindow', 'Electron MSFS window capture provider is missing.');
requireText(electronSource, 'desktopCapturer', 'Electron desktopCapturer integration is missing.');

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'flight-deck-119-'));
const application = await createTaxiServer({
  demo: true,
  port: 18_930,
  mapCacheDirectory: path.join(temp, 'maps'),
  flightStorageDirectory: path.join(temp, 'flights'),
  automationStorageDirectory: path.join(temp, 'automations'),
  accessStorageDirectory: path.join(temp, 'access'),
  simSessionStorageDirectory: path.join(temp, 'sim-session'),
  msfsEfbBuilderStorageDirectory: path.join(temp, 'builder'),
  screenshotProvider: async () => ({ buffer: Buffer.from('89504e470d0a1a0a', 'hex'), sourceName: 'Microsoft Flight Simulator 2024' }),
});

try {
  const auth = `?token=${encodeURIComponent(application.token)}`;
  const unauthorized = await fetch(`${application.localhostUrl}api/sim-session/status`);
  if (unauthorized.status !== 401) throw new Error(`Sim Session API must require pairing, got ${unauthorized.status}.`);

  const status = await fetch(`${application.localhostUrl}api/sim-session/status${auth}`).then((response) => response.json());
  if (!Array.isArray(status.tools)) throw new Error('Sim Session status does not expose a tool list.');
  if (status.canConfigure !== true) throw new Error('Windows-host token must be allowed to configure tool paths.');

  const discovery = await fetch(`${application.localhostUrl}api/discovery/status${auth}`).then((response) => response.json());
  if (!discovery.status) throw new Error('Discovery status endpoint returned no state.');

  const screenshot = await fetch(`${application.localhostUrl}api/sim-session/screenshot${auth}`, { method: 'POST' });
  if (screenshot.status !== 200 || !String(screenshot.headers.get('content-type')).includes('image/png')) {
    throw new Error(`Screenshot endpoint failed: ${screenshot.status}`);
  }

  const unknownLaunch = await fetch(`${application.localhostUrl}api/sim-session/launch${auth}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: '__missing__' }),
  });
  if (unknownLaunch.status !== 409) throw new Error(`Unknown launch target should be rejected, got ${unknownLaunch.status}.`);
} finally {
  await application.close();
  await fs.rm(temp, { recursive: true, force: true });
}

console.log('Flight Deck EFB 1.19.0 renderer recovery + native session regression checks passed.');
