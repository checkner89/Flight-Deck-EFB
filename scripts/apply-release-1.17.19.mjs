import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const targets = [
  'src/simconnect-client.mjs',
  'src/injected-traffic-client.mjs',
  'src/state-engine.mjs',
  'src/taxi-route-planner.mjs',
  'src/msfs-efb-package-builder.mjs',
  'src/server.mjs',
  'public/app.js',
  'public/live-traffic.js',
  'public/flight-overlay.js',
  'public/si-operations.js',
  'public/gsx-profile-manager.js',
  'public/index.html',
  'public/service-worker.js',
];

for (const relativePath of targets) {
  const filename = path.join(root, relativePath);
  try {
    const source = await fs.readFile(filename, 'utf8');
    const normalized = source.replace(/\r\n/g, '\n');
    if (normalized !== source) await fs.writeFile(filename, normalized, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

await import('./apply-release-1.7.19.mjs');

console.log('Flight Deck EFB 1.17.19 release migration applied.');
