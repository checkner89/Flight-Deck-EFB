import fs from 'node:fs/promises';
import path from 'node:path';

const PROFILE_EXTENSIONS = new Set(['.ini', '.py']);
const ICAO_BLACKLIST = new Set(['MSFS', 'ASOB', 'PACK', 'SCEN', 'AERO', 'CITY', 'WORLD', 'PORT', 'SIMU', 'FLIG']);
const MAX_COMMUNITY_PACKAGES = 5_000;
const MAX_PROFILE_FILES = 5_000;
const MAX_INSTALL_FILES = 120;
const MAX_INSTALL_BYTES = 24 * 1024 * 1024;

function clean(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

function normalizeWindowsPath(value) {
  const text = clean(value);
  return text ? path.win32.normalize(text) : null;
}

async function directoryExists(value) {
  if (!value) return false;
  try {
    return (await fs.stat(value)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(value) {
  if (!value) return false;
  try {
    return (await fs.stat(value)).isFile();
  } catch {
    return false;
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.win32.normalize(value)))];
}

function findIcao(value) {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
  const matches = normalized.match(/\b[A-Z]{4}\b/g) || [];
  return matches.find((entry) => !ICAO_BLACKLIST.has(entry)) || null;
}

function parseInstalledPackagesPath(value) {
  const match = String(value || '').match(/(?:^|\r?\n)\s*InstalledPackagesPath\s+"([^"]+)"/i);
  return match?.[1] ? path.win32.normalize(match[1]) : null;
}

async function userCfgCandidates(env) {
  const values = [];
  const appData = normalizeWindowsPath(env.APPDATA);
  const localAppData = normalizeWindowsPath(env.LOCALAPPDATA);
  if (appData) values.push(path.win32.join(appData, 'Microsoft Flight Simulator 2024', 'UserCfg.opt'));
  if (localAppData) {
    const packagesRoot = path.win32.join(localAppData, 'Packages');
    try {
      const entries = await fs.readdir(packagesRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !/^Microsoft\.(?:Limitless|FlightSimulator)/i.test(entry.name)) continue;
        values.push(path.win32.join(packagesRoot, entry.name, 'LocalCache', 'UserCfg.opt'));
      }
    } catch {
      // Microsoft Store package root is optional.
    }
  }
  return unique(values);
}

async function firstExistingDirectory(values) {
  for (const value of unique(values)) {
    if (await directoryExists(value)) return value;
  }
  return null;
}

async function discoverCommunityDirectory(env) {
  const explicit = await firstExistingDirectory([
    normalizeWindowsPath(env.MSFS_2024_COMMUNITY),
    normalizeWindowsPath(env.MSFS2024_COMMUNITY),
    normalizeWindowsPath(env.MSFS_COMMUNITY),
  ]);
  if (explicit) return { path: explicit, source: 'environment' };

  for (const userCfg of await userCfgCandidates(env)) {
    if (!await fileExists(userCfg)) continue;
    try {
      const installed = parseInstalledPackagesPath(await fs.readFile(userCfg, 'utf8'));
      if (!installed) continue;
      for (const name of ['Community2024', 'Community']) {
        const candidate = path.win32.join(installed, name);
        if (await directoryExists(candidate)) return { path: candidate, source: 'UserCfg.opt', userCfg };
      }
      // Preserve the documented MSFS 2024 target even before the folder is created.
      return { path: path.win32.join(installed, 'Community2024'), source: 'UserCfg.opt', userCfg, missing: true };
    } catch {
      // Continue with the next UserCfg candidate.
    }
  }
  return { path: null, source: null };
}

export async function discoverGsxPaths({ env = process.env, platform = process.platform } = {}) {
  if (platform !== 'win32') {
    return { supported: false, profileDirectory: null, handlerDirectory: null, communityDirectory: null, sources: {} };
  }
  const appData = normalizeWindowsPath(env.APPDATA);
  const profileDirectory = await firstExistingDirectory([
    normalizeWindowsPath(env.GSX_PROFILE_DIR),
    appData && path.win32.join(appData, 'Virtuali', 'GSX', 'MSFS'),
    appData && path.win32.join(appData, 'Virtuali', 'GSX', 'MSFS2024'),
    appData && path.win32.join(appData, 'Virtuali', 'GSX', 'MSFS 2024'),
  ]);
  const handlerDirectory = await firstExistingDirectory([
    normalizeWindowsPath(env.GSX_HANDLER_LIB),
    appData && path.win32.join(appData, 'Virtuali', 'Handlers', 'lib'),
  ]);
  const community = await discoverCommunityDirectory(env);
  return {
    supported: true,
    profileDirectory,
    handlerDirectory,
    communityDirectory: community.path,
    communityMissing: community.missing === true,
    sources: {
      profile: profileDirectory ? (env.GSX_PROFILE_DIR ? 'environment' : 'Virtuali default') : null,
      handler: handlerDirectory ? (env.GSX_HANDLER_LIB ? 'environment' : 'Virtuali default') : null,
      community: community.source,
      userCfg: community.userCfg || null,
    },
  };
}

async function scanProfileDirectory(directory) {
  if (!await directoryExists(directory)) return [];
  const values = [];
  const queue = [{ directory, depth: 0 }];
  while (queue.length && values.length < MAX_PROFILE_FILES) {
    const current = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(current.directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current.directory, entry.name);
      if (entry.isDirectory() && current.depth < 2) {
        queue.push({ directory: fullPath, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile() || !PROFILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      let icao = findIcao(`${entry.name} ${path.relative(directory, fullPath)}`);
      if (!icao && path.extname(entry.name).toLowerCase() === '.ini') {
        try {
          const handle = await fs.open(fullPath, 'r');
          const buffer = Buffer.alloc(64 * 1024);
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
          await handle.close();
          const text = buffer.subarray(0, bytesRead).toString('utf8');
          const explicit = text.match(/^\s*(?:icao|airport)\s*=\s*([A-Z0-9]{4})\b/im);
          icao = explicit?.[1]?.toUpperCase() || findIcao(text.slice(0, 8_000));
        } catch {
          // Filename detection remains the fallback.
        }
      }
      values.push({
        name: entry.name,
        relativePath: path.relative(directory, fullPath),
        icao: icao || '----',
        type: path.extname(entry.name).slice(1).toUpperCase(),
      });
      if (values.length >= MAX_PROFILE_FILES) break;
    }
  }
  return values.sort((left, right) => left.name.localeCompare(right.name, 'en', { numeric: true }));
}

async function scanCommunityDirectory(directory) {
  if (!await directoryExists(directory)) return [];
  const values = [];
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return values;
  }
  let scanned = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    scanned += 1;
    if (scanned > MAX_COMMUNITY_PACKAGES) break;
    const packageDirectory = path.join(directory, entry.name);
    let title = entry.name;
    let packageName = entry.name;
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(packageDirectory, 'manifest.json'), 'utf8'));
      title = manifest.title || manifest.package_name || manifest.content_type || entry.name;
      packageName = manifest.package_name || entry.name;
    } catch {
      // Folder names still provide useful ICAO hints.
    }
    const icao = findIcao(`${entry.name} ${title} ${packageName}`);
    if (!icao) continue;
    values.push({ icao, name: title, packageName, source: 'Community' });
  }
  return [...new Map(values.map((entry) => [entry.icao, entry])).values()]
    .sort((left, right) => left.icao.localeCompare(right.icao));
}

export async function scanGsxProfileLibrary(options = {}) {
  const paths = await discoverGsxPaths(options);
  const [profiles, airports] = await Promise.all([
    scanProfileDirectory(paths.profileDirectory),
    scanCommunityDirectory(paths.communityDirectory),
  ]);
  return {
    paths,
    profiles,
    airports,
    scannedAt: new Date().toISOString(),
  };
}

function safeFilename(value) {
  const name = path.win32.basename(String(value || '')).replace(/[<>:"/\\|?*]/g, '_').trim();
  if (!name || name === '.' || name === '..') throw new Error('Invalid GSX profile filename.');
  if (!PROFILE_EXTENSIONS.has(path.extname(name).toLowerCase())) throw new Error(`Unsupported GSX profile file: ${name}`);
  return name;
}

export async function installGsxProfileFiles(files = [], options = {}) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('No GSX profile files supplied.');
  if (files.length > MAX_INSTALL_FILES) throw new Error(`Too many files. Maximum is ${MAX_INSTALL_FILES}.`);
  const paths = await discoverGsxPaths(options);
  if (!paths.profileDirectory) throw new Error('GSX profile directory was not detected automatically.');
  let totalBytes = 0;
  const prepared = files.map((entry) => {
    const filename = safeFilename(entry?.name);
    const data = Buffer.from(String(entry?.dataBase64 || ''), 'base64');
    if (!data.length) throw new Error(`${filename}: file is empty.`);
    totalBytes += data.length;
    return { filename, data, target: entry?.target === 'handler' ? 'handler' : 'profile' };
  });
  if (totalBytes > MAX_INSTALL_BYTES) throw new Error('GSX profile import is too large.');
  if (prepared.some((entry) => entry.target === 'handler') && !paths.handlerDirectory) {
    throw new Error('GSX handler library was not detected automatically.');
  }
  let profileCount = 0;
  let handlerCount = 0;
  for (const entry of prepared) {
    const directory = entry.target === 'handler' ? paths.handlerDirectory : paths.profileDirectory;
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, entry.filename), entry.data);
    if (entry.target === 'handler') handlerCount += 1;
    else profileCount += 1;
  }
  return { profileCount, handlerCount, totalBytes, paths };
}
