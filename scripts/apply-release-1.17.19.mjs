import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
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
    const normalized = source.replace(/\r\n?/g, '\n');
    if (normalized !== source) await fs.writeFile(filename, normalized, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const legacyPath = path.join(scriptDirectory, 'apply-release-1.7.19.mjs');
const runtimePath = path.join(scriptDirectory, '.apply-release-1.17.19-runtime.mjs');
let legacy = (await fs.readFile(legacyPath, 'utf8')).replace(/\r\n?/g, '\n');
const helperStart = legacy.indexOf('function replaceRequired(');
const helperEnd = legacy.indexOf('\n\nawait patchFile', helperStart);
if (helperStart < 0 || helperEnd < 0) throw new Error('Legacy migration helper block could not be located.');

const robustHelpers = String.raw`function escapeMigrationRegExp(value) {
  return String(value).replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
}

function whitespaceMigrationPattern(search, global = false) {
  const parts = String(search).split(/(\s+)/).filter(Boolean);
  const source = parts.map((part) => /^\s+$/.test(part) ? '\\s+' : escapeMigrationRegExp(part)).join('');
  return new RegExp(source, global ? 'g' : '');
}

function replaceRequired(source, search, replacement, label) {
  if (source.includes(search)) return source.replace(search, replacement);
  const pattern = whitespaceMigrationPattern(search);
  if (!pattern.test(source)) throw new Error('Missing migration anchor: ' + label);
  return source.replace(pattern, () => replacement);
}

function replaceAllRequired(source, search, replacement, label) {
  if (source.includes(search)) return source.replaceAll(search, replacement);
  const pattern = whitespaceMigrationPattern(search, true);
  if (!pattern.test(source)) throw new Error('Missing migration anchor: ' + label);
  pattern.lastIndex = 0;
  return source.replace(pattern, () => replacement);
}`;

legacy = `${legacy.slice(0, helperStart)}${robustHelpers}${legacy.slice(helperEnd)}`;
await fs.writeFile(runtimePath, legacy, 'utf8');
try {
  await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
} finally {
  await fs.rm(runtimePath, { force: true });
}

console.log('Flight Deck EFB 1.17.19 release migration applied.');
