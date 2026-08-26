import fs from 'node:fs/promises';
import path from 'node:path';

const CORE_PREFIXES = [
  'asobo-', 'microsoft-', 'fs-base', 'fs-base-', 'fs-base-genericairports',
  'fs-base-nav', 'fs-base-ui', 'fs-base-aircraft-common', 'fs-base-ingamepanels',
];

function normalize(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

async function fileExists(filename) {
  try { return (await fs.stat(filename)).isFile(); } catch { return false; }
}

async function directoryExists(filename) {
  try { return (await fs.stat(filename)).isDirectory(); } catch { return false; }
}

async function discoverUserCfgFiles(env = process.env) {
  const values = [];
  if (env.APPDATA) values.push(path.join(env.APPDATA, 'Microsoft Flight Simulator 2024', 'UserCfg.opt'));
  if (env.LOCALAPPDATA) {
    const packagesRoot = path.join(env.LOCALAPPDATA, 'Packages');
    try {
      const entries = await fs.readdir(packagesRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^Microsoft\.(?:Limitless|FlightSimulator)/i.test(entry.name)) continue;
        values.push(path.join(packagesRoot, entry.name, 'LocalCache', 'UserCfg.opt'));
      }
    } catch {}
  }
  return [...new Set(values)];
}

function installedPackagesPath(text) {
  return normalize(String(text || '').match(/(?:^|\r?\n)\s*InstalledPackagesPath\s+"([^"]+)"/i)?.[1]);
}

async function discoverPackagesRoot() {
  for (const cfg of await discoverUserCfgFiles()) {
    if (!await fileExists(cfg)) continue;
    try {
      const root = installedPackagesPath(await fs.readFile(cfg, 'utf8'));
      if (root) return { root, userCfg: cfg };
    } catch {}
  }
  return { root: null, userCfg: null };
}

async function readManifest(directory) {
  const filename = path.join(directory, 'manifest.json');
  if (!await fileExists(filename)) return null;
  try {
    const value = JSON.parse(await fs.readFile(filename, 'utf8'));
    return {
      title: normalize(value.title || value.package_name || value.content_type),
      creator: normalize(value.creator || value.manufacturer),
      version: normalize(value.package_version || value.version),
      contentType: normalize(value.content_type),
    };
  } catch {
    return null;
  }
}

function looksCorePackage(name) {
  const lower = String(name || '').toLowerCase();
  return CORE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

async function scanDirectory(directory, source, { includeCore = false, limit = 600 } = {}) {
  if (!await directoryExists(directory)) return [];
  let entries = [];
  try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch { return []; }
  const packages = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!includeCore && source === 'official' && looksCorePackage(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    const manifest = await readManifest(fullPath);
    packages.push({
      id: entry.name,
      folder: entry.name,
      source,
      path: fullPath,
      title: manifest?.title || entry.name,
      creator: manifest?.creator || '',
      version: manifest?.version || '',
      contentType: manifest?.contentType || '',
      searchable: `${entry.name} ${manifest?.title || ''} ${manifest?.creator || ''} ${manifest?.contentType || ''}`.toLowerCase(),
    });
    if (packages.length >= limit) break;
  }
  return packages;
}

function candidateDirectories(root) {
  if (!root) return [];
  return [
    ['community', path.join(root, 'Community2024')],
    ['community', path.join(root, 'Community')],
    ['official', path.join(root, 'Official2024')],
    ['official', path.join(root, 'Official', 'Steam')],
    ['official', path.join(root, 'Official', 'OneStore')],
  ];
}

export async function scanMsfsAddons({ includeCore = false } = {}) {
  if (process.platform !== 'win32') {
    return { supported: false, root: null, userCfg: null, packages: [], communityCount: 0, officialCount: 0, updatedAt: new Date().toISOString() };
  }
  const discovered = await discoverPackagesRoot();
  const packages = [];
  const seen = new Set();
  for (const [source, directory] of candidateDirectories(discovered.root)) {
    for (const item of await scanDirectory(directory, source, { includeCore })) {
      const key = item.path.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      packages.push(item);
    }
  }
  packages.sort((a, b) => a.title.localeCompare(b.title));
  return {
    supported: true,
    root: discovered.root,
    userCfg: discovered.userCfg,
    packages,
    communityCount: packages.filter((entry) => entry.source === 'community').length,
    officialCount: packages.filter((entry) => entry.source === 'official').length,
    updatedAt: new Date().toISOString(),
  };
}

export function matchSimPackages(scan, hints = []) {
  const normalized = hints.map((value) => String(value || '').toLowerCase()).filter(Boolean);
  if (!normalized.length) return [];
  return (scan?.packages || []).filter((entry) => normalized.some((hint) => entry.searchable.includes(hint)));
}
