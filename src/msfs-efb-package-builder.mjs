import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PACKAGE_ID = 'flightdeck-efb-native';
const PROJECT_NAME = 'FlightDeckEFBProject';
const APP_DIRECTORY_NAME = 'FlightDeckEFB';
const DEFAULT_BUILD_TIMEOUT_MS = 20 * 60_000;
const MAX_CAPTURE_BYTES = 2_000_000;
const TEXT_EXTENSIONS = new Set([
  '.xml', '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.scss', '.css', '.env', '.txt', '.md', '.code-workspace', '.html', '.yml', '.yaml',
]);
const COPY_EXCLUDED_DIRECTORIES = new Set(['node_modules', 'dist', 'packages', '_packageint', '.git']);

function text(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim().replace(/^"|"$/g, '');
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.win32.normalize(value)))];
}

async function exists(filePath) {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(directoryPath) {
  try {
    return (await fs.stat(directoryPath)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function outputTail(value, maxLines = 50) {
  return String(value || '').split(/\r?\n/).filter(Boolean).slice(-maxLines).join('\n');
}

function cleanWindowsPath(value) {
  const normalized = text(value);
  return normalized ? path.win32.normalize(normalized) : null;
}

export function parseInstalledPackagesPath(userCfgText) {
  const match = String(userCfgText || '').match(/(?:^|\r?\n)\s*InstalledPackagesPath\s+"([^"]+)"/i);
  return match?.[1] ? path.win32.normalize(match[1]) : null;
}

export function isCommunityDirectory(value) {
  const candidate = cleanWindowsPath(value);
  if (!candidate || !path.win32.isAbsolute(candidate)) return false;
  const name = path.win32.basename(candidate).toLowerCase();
  return name === 'community2024' || name === 'community';
}

export function transformTemplateText(value) {
  return String(value)
    .replace(/EFBTemplateAppProject/g, PROJECT_NAME)
    .replace(/efb_apps_template/g, PACKAGE_ID)
    .replace(/TemplateApp/g, APP_DIRECTORY_NAME)
    .replace(/templateapp/g, 'flightdeckefb');
}

function transformName(value) {
  return transformTemplateText(value);
}

async function runProcess(command, args, {
  cwd,
  env = process.env,
  timeoutMs = DEFAULT_BUILD_TIMEOUT_MS,
  allowFailure = false,
  onOutput,
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const append = (target, chunk) => {
      const value = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      onOutput?.(value);
      const combined = `${target}${value}`;
      return combined.length > MAX_CAPTURE_BYTES ? combined.slice(-MAX_CAPTURE_BYTES) : combined;
    };
    child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`${path.basename(command)} timed out.`));
    }, timeoutMs);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = { code: Number(code), stdout, stderr, output: [stdout, stderr].filter(Boolean).join('\n') };
      if (code !== 0 && !allowFailure) {
        const detail = outputTail(result.output) || `exit code ${code}`;
        reject(new Error(`${path.basename(command)} failed: ${detail}`));
        return;
      }
      resolve(result);
    });
  });
}

async function findFile(root, predicate, maxDepth = 6, depth = 0) {
  if (!root || depth > maxDepth || !await directoryExists(root)) return null;
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isFile() && predicate(entry.name, path.join(root, entry.name))) return path.join(root, entry.name);
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (COPY_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
    const found = await findFile(path.join(root, entry.name), predicate, maxDepth, depth + 1);
    if (found) return found;
  }
  return null;
}

async function findDirectory(root, predicate, maxDepth = 6, depth = 0) {
  if (!root || depth > maxDepth || !await directoryExists(root)) return null;
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(root, entry.name);
    if (await predicate(entry.name, fullPath)) return fullPath;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (COPY_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
    const found = await findDirectory(path.join(root, entry.name), predicate, maxDepth, depth + 1);
    if (found) return found;
  }
  return null;
}

async function findProjectRoot(projectXml) {
  let cursor = path.dirname(projectXml);
  for (let index = 0; index < 7; index += 1) {
    if (await directoryExists(path.join(cursor, 'PackageSources'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return path.dirname(projectXml);
}

async function collectPaths(root, values = []) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return values;
  }
  for (const entry of entries) {
    if (COPY_EXCLUDED_DIRECTORIES.has(entry.name.toLowerCase())) continue;
    const fullPath = path.join(root, entry.name);
    values.push({ path: fullPath, name: entry.name, directory: entry.isDirectory() });
    if (entry.isDirectory()) await collectPaths(fullPath, values);
  }
  return values;
}

async function renameTemplatePaths(root) {
  const entries = await collectPaths(root);
  entries.sort((left, right) => right.path.split(path.sep).length - left.path.split(path.sep).length);
  for (const entry of entries) {
    const renamed = transformName(entry.name);
    if (renamed === entry.name) continue;
    const target = path.join(path.dirname(entry.path), renamed);
    if (await exists(target)) await fs.rm(target, { recursive: true, force: true });
    await fs.rename(entry.path, target);
  }
}

async function patchTemplateFiles(root) {
  const entries = await collectPaths(root);
  for (const entry of entries) {
    if (entry.directory) continue;
    const extension = entry.name.toLowerCase().endsWith('.code-workspace') ? '.code-workspace' : path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTENSIONS.has(extension)) continue;
    let content;
    try {
      content = await fs.readFile(entry.path, 'utf8');
    } catch {
      continue;
    }
    const patched = transformTemplateText(content);
    if (patched !== content) await fs.writeFile(entry.path, patched, 'utf8');
  }
}

async function updateTemplatePackageJson(appDirectory, version) {
  const packageFile = path.join(appDirectory, 'package.json');
  if (!await fileExists(packageFile)) return;
  try {
    const value = JSON.parse(await fs.readFile(packageFile, 'utf8'));
    value.name = 'flightdeck-efb-native-app';
    value.version = version;
    await fs.writeFile(packageFile, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } catch {
    // The SDK template remains authoritative if its package.json is not plain JSON.
  }
}

async function copyFlightDeckSource(sourceDirectory, appDirectory, version) {
  const sourceRoot = path.join(appDirectory, 'src');
  const assetsRoot = path.join(sourceRoot, 'Assets');
  await fs.mkdir(assetsRoot, { recursive: true });
  for (const file of ['FlightDeckEFB.tsx', 'FlightDeckEFB.scss']) {
    const source = path.join(sourceDirectory, 'src', file);
    if (!await fileExists(source)) throw new Error(`Flight Deck native EFB source is missing: ${file}`);
    await fs.copyFile(source, path.join(sourceRoot, file));
  }
  const icon = path.join(sourceDirectory, 'src', 'Assets', 'app-icon.svg');
  if (!await fileExists(icon)) throw new Error('Flight Deck native EFB icon source is missing.');
  await fs.copyFile(icon, path.join(assetsRoot, 'app-icon.svg'));
  await updateTemplatePackageJson(appDirectory, version);
}

async function findBuiltPackages(root, maxDepth = 7, depth = 0, values = []) {
  if (depth > maxDepth || !await directoryExists(root)) return values;
  const manifest = path.join(root, 'manifest.json');
  const layout = path.join(root, 'layout.json');
  if (await fileExists(manifest) && await fileExists(layout)) {
    values.push(root);
    return values;
  }
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return values;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    await findBuiltPackages(path.join(root, entry.name), maxDepth, depth + 1, values);
  }
  return values;
}

async function discoverUserCfgFiles(env) {
  const values = [];
  const appData = cleanWindowsPath(env.APPDATA);
  const localAppData = cleanWindowsPath(env.LOCALAPPDATA);
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
      // Store package location is optional; Steam/standalone uses APPDATA.
    }
  }
  return unique(values);
}

async function resolveCommunityDirectory(configured, env) {
  if (configured) {
    const candidate = cleanWindowsPath(configured);
    if (!isCommunityDirectory(candidate)) throw new Error('Community path must end in Community2024 or Community.');
    return { directory: candidate, source: 'configured', userCfg: null, installedPackagesPath: path.win32.dirname(candidate) };
  }
  for (const userCfg of await discoverUserCfgFiles(env)) {
    if (!await fileExists(userCfg)) continue;
    try {
      const installedPackagesPath = parseInstalledPackagesPath(await fs.readFile(userCfg, 'utf8'));
      if (!installedPackagesPath) continue;
      return {
        directory: path.win32.join(installedPackagesPath, 'Community2024'),
        source: 'UserCfg.opt',
        userCfg,
        installedPackagesPath,
      };
    } catch {
      // Continue with the next UserCfg.opt candidate.
    }
  }
  return { directory: null, source: null, userCfg: null, installedPackagesPath: null };
}

async function probeSdkRoot(root) {
  const sdkRoot = cleanWindowsPath(root);
  if (!sdkRoot) return null;
  const packageTool = path.win32.join(sdkRoot, 'Tools', 'bin', 'fspackagetool.exe');
  const efbRoot = path.win32.join(sdkRoot, 'Samples', 'DevmodeProjects', 'EFB');
  if (!await fileExists(packageTool) || !await directoryExists(efbRoot)) {
    return { sdkRoot, ready: false, packageTool, efbRoot, detail: 'Package Tool or EFB SDK sample is missing.' };
  }
  const projectXml = await findFile(
    efbRoot,
    (name) => name.toLowerCase() === 'efbtemplateappproject.xml',
    7,
  ) || await findFile(efbRoot, (name) => /efb.*project\.xml$/i.test(name), 7);
  const templateApp = path.win32.join(efbRoot, 'PackageSources', 'TemplateApp');
  const efbApi = path.win32.join(efbRoot, 'PackageSources', 'efb_api');
  const effectiveTemplateApp = await directoryExists(templateApp)
    ? templateApp
    : await findDirectory(efbRoot, async (name, fullPath) => name === 'TemplateApp' && await fileExists(path.join(fullPath, 'package.json')), 7);
  const effectiveEfbApi = await directoryExists(efbApi)
    ? efbApi
    : await findDirectory(efbRoot, async (name, fullPath) => name === 'efb_api' && await fileExists(path.join(fullPath, 'package.json')), 7);
  if (!projectXml || !effectiveTemplateApp || !effectiveEfbApi) {
    return {
      sdkRoot,
      ready: false,
      packageTool,
      efbRoot,
      projectXml,
      templateApp: effectiveTemplateApp,
      efbApi: effectiveEfbApi,
      detail: 'The installed SDK does not contain the complete EFB template sample.',
    };
  }
  return {
    sdkRoot,
    ready: true,
    packageTool,
    efbRoot,
    projectXml,
    projectRoot: await findProjectRoot(projectXml),
    templateApp: effectiveTemplateApp,
    efbApi: effectiveEfbApi,
    detail: 'MSFS 2024 SDK and EFB template are ready.',
  };
}

export class MsfsEfbPackageBuilder {
  constructor(engine, {
    sourceDirectory,
    storageDirectory,
    appVersion,
    platform = process.platform,
    env = process.env,
  } = {}) {
    this.engine = engine;
    this.sourceDirectory = sourceDirectory;
    this.storageDirectory = storageDirectory;
    this.appVersion = appVersion;
    this.platform = platform;
    this.env = env;
    this.configFile = storageDirectory ? path.join(storageDirectory, 'settings.json') : null;
    this.lastBuildFile = storageDirectory ? path.join(storageDirectory, 'last-build.json') : null;
    this.logFile = storageDirectory ? path.join(storageDirectory, 'last-build.log') : null;
    this.configuration = { sdkRoot: null, communityDirectory: null };
    this.lastBuild = null;
    this.started = false;
    this.building = false;
    this.current = {
      status: platform === 'win32' ? 'not-checked' : 'unsupported',
      supported: platform === 'win32',
      canBuild: false,
      canInstall: false,
      progressPercent: 0,
      step: 'idle',
      detail: platform === 'win32' ? 'MSFS 2024 SDK has not been checked yet.' : 'Community package builder is available only on Windows.',
      sdkRoot: null,
      packageTool: null,
      sampleProject: null,
      communityDirectory: null,
      communitySource: null,
      lastBuild: null,
    };
  }

  async start() {
    if (this.started) return this.publicStatus();
    this.started = true;
    if (this.storageDirectory) await fs.mkdir(this.storageDirectory, { recursive: true });
    try {
      if (this.configFile && await fileExists(this.configFile)) {
        const config = JSON.parse(await fs.readFile(this.configFile, 'utf8'));
        this.configuration = {
          sdkRoot: cleanWindowsPath(config.sdkRoot),
          communityDirectory: cleanWindowsPath(config.communityDirectory),
        };
      }
    } catch {
      // Invalid local settings are ignored and can be replaced from Settings.
    }
    try {
      if (this.lastBuildFile && await fileExists(this.lastBuildFile)) {
        this.lastBuild = JSON.parse(await fs.readFile(this.lastBuildFile, 'utf8'));
      }
    } catch {
      this.lastBuild = null;
    }
    await this.detect();
    return this.publicStatus();
  }

  publicStatus() {
    return {
      ...this.current,
      building: this.building,
      configuredSdkRoot: this.configuration.sdkRoot,
      configuredCommunityDirectory: this.configuration.communityDirectory,
      lastBuild: this.lastBuild,
    };
  }

  #publish(patch = {}) {
    this.current = { ...this.current, ...patch, lastBuild: this.lastBuild };
    this.engine?.setIntegration('msfsEfbBuilder', this.publicStatus());
  }

  async #saveConfiguration() {
    if (!this.configFile) return;
    await fs.mkdir(path.dirname(this.configFile), { recursive: true });
    await fs.writeFile(this.configFile, `${JSON.stringify(this.configuration, null, 2)}\n`, 'utf8');
  }

  async configure({ sdkRoot, communityDirectory } = {}) {
    if (sdkRoot !== undefined) {
      const candidate = cleanWindowsPath(sdkRoot);
      if (candidate && !path.win32.isAbsolute(candidate)) throw new Error('SDK path must be an absolute Windows path.');
      this.configuration.sdkRoot = candidate;
    }
    if (communityDirectory !== undefined) {
      const candidate = cleanWindowsPath(communityDirectory);
      if (candidate && !isCommunityDirectory(candidate)) throw new Error('Community path must end in Community2024 or Community.');
      this.configuration.communityDirectory = candidate;
    }
    await this.#saveConfiguration();
    return this.detect();
  }

  async #sdkCandidates(explicitRoot) {
    if (explicitRoot) return [cleanWindowsPath(explicitRoot)];
    const configured = this.configuration.sdkRoot;
    const drive = text(this.env.SystemDrive) || 'C:';
    const values = [
      configured,
      cleanWindowsPath(this.env.MSFS2024_SDK_ROOT),
      cleanWindowsPath(this.env.MSFS_SDK_ROOT),
      path.win32.join(drive, 'MSFS 2024 SDK'),
      path.win32.join(drive, 'MSFS2024 SDK'),
      path.win32.join(drive, 'Program Files', 'MSFS 2024 SDK'),
      path.win32.join(drive, 'Program Files (x86)', 'MSFS 2024 SDK'),
    ];
    try {
      const found = await runProcess('where.exe', ['fspackagetool.exe'], { allowFailure: true, timeoutMs: 8_000 });
      for (const line of found.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
        const toolPath = cleanWindowsPath(line);
        if (!toolPath) continue;
        values.push(path.win32.dirname(path.win32.dirname(path.win32.dirname(toolPath))));
      }
    } catch {
      // PATH lookup is only an additional convenience.
    }
    return unique(values);
  }

  async detect({ sdkRoot, communityDirectory } = {}) {
    if (this.platform !== 'win32') {
      this.#publish({
        status: 'unsupported', supported: false, canBuild: false, canInstall: false,
        progressPercent: 0, step: 'idle', detail: 'Community package builder is available only on Windows.',
      });
      return this.publicStatus();
    }
    let sdk = null;
    for (const candidate of await this.#sdkCandidates(sdkRoot)) {
      const probe = await probeSdkRoot(candidate);
      if (!sdk) sdk = probe;
      if (probe?.ready) { sdk = probe; break; }
    }
    const community = await resolveCommunityDirectory(
      communityDirectory !== undefined ? communityDirectory : this.configuration.communityDirectory,
      this.env,
    );
    const status = sdk?.ready ? 'ready' : 'sdk-missing';
    const detail = sdk?.ready
      ? community.directory
        ? 'MSFS 2024 SDK, EFB template and Community2024 target are ready.'
        : 'MSFS 2024 SDK is ready. Community2024 was not detected; package build is still available.'
      : sdk?.detail || 'MSFS 2024 SDK was not found. Install it from MSFS Developer Mode or set the SDK path below.';
    this.#publish({
      status,
      supported: true,
      canBuild: Boolean(sdk?.ready),
      canInstall: Boolean(sdk?.ready && community.directory),
      progressPercent: 0,
      step: 'idle',
      detail,
      sdkRoot: sdk?.sdkRoot || null,
      packageTool: sdk?.packageTool || null,
      sampleProject: sdk?.projectXml || null,
      sdk,
      communityDirectory: community.directory,
      communitySource: community.source,
      userCfg: community.userCfg,
    });
    return this.publicStatus();
  }

  async #prepareWorkspace(sdk) {
    if (!this.storageDirectory) throw new Error('Builder storage directory is unavailable.');
    const buildRoot = path.join(this.storageDirectory, 'build');
    const workspace = path.join(buildRoot, 'workspace');
    const packageToolOutput = path.join(buildRoot, 'package-output');
    const tempDirectory = path.join(buildRoot, 'temp');
    await fs.rm(buildRoot, { recursive: true, force: true });
    await fs.mkdir(buildRoot, { recursive: true });
    const sampleRoot = sdk.projectRoot || await findProjectRoot(sdk.projectXml);
    await fs.cp(sampleRoot, workspace, {
      recursive: true,
      filter: (source) => !COPY_EXCLUDED_DIRECTORIES.has(path.basename(source).toLowerCase()),
    });
    await renameTemplatePaths(workspace);
    await patchTemplateFiles(workspace);
    const appDirectory = path.join(workspace, 'PackageSources', APP_DIRECTORY_NAME);
    const efbApiDirectory = path.join(workspace, 'PackageSources', 'efb_api');
    if (!await directoryExists(appDirectory) || !await directoryExists(efbApiDirectory)) {
      throw new Error('Copied SDK project does not contain FlightDeckEFB and efb_api source folders after preparation.');
    }
    await copyFlightDeckSource(this.sourceDirectory, appDirectory, this.appVersion);
    const projectXml = await findFile(
      workspace,
      (name) => name.toLowerCase() === `${PROJECT_NAME.toLowerCase()}.xml`,
      5,
    ) || await findFile(workspace, (name) => /project\.xml$/i.test(name), 5);
    if (!projectXml) throw new Error('Prepared EFB SDK project XML was not found.');
    await fs.mkdir(packageToolOutput, { recursive: true });
    await fs.mkdir(tempDirectory, { recursive: true });
    return { buildRoot, workspace, packageToolOutput, tempDirectory, appDirectory, efbApiDirectory, projectXml };
  }

  async #writeBuildLog(lines) {
    if (!this.logFile) return;
    await fs.mkdir(path.dirname(this.logFile), { recursive: true });
    await fs.writeFile(this.logFile, lines.join('\n').slice(-MAX_CAPTURE_BYTES), 'utf8');
  }

  async build({ install = false, sdkRoot, communityDirectory } = {}) {
    if (this.building) throw new Error('An MSFS EFB package build is already running.');
    if (sdkRoot !== undefined || communityDirectory !== undefined) await this.configure({ sdkRoot, communityDirectory });
    const detected = await this.detect();
    if (!detected.canBuild || !detected.sdk?.ready) throw new Error(detected.detail || 'MSFS 2024 SDK is not ready.');
    if (install && !detected.communityDirectory) {
      throw new Error('Community2024 was not detected. Set the Community2024 path before using Build & Install.');
    }
    this.building = true;
    const logLines = [];
    const log = (value) => {
      for (const line of String(value || '').split(/\r?\n/).filter(Boolean)) logLines.push(line);
      if (logLines.length > 2_000) logLines.splice(0, logLines.length - 2_000);
    };
    const progress = (step, progressPercent, detail) => {
      log(`[${step}] ${detail}`);
      this.#publish({ status: 'building', step, progressPercent, detail });
    };
    try {
      progress('prepare', 5, 'Copying the installed MSFS 2024 EFB template into an isolated Flight Deck workspace.');
      const workspace = await this.#prepareWorkspace(detected.sdk);
      progress('efb-api-dependencies', 15, 'Installing the SDK EFB API dependencies in the isolated workspace.');
      await runProcess('npm.cmd', ['install', '--no-audit', '--no-fund'], {
        cwd: workspace.efbApiDirectory,
        onOutput: log,
      });
      progress('app-dependencies', 28, 'Installing Flight Deck native EFB build dependencies from the SDK template.');
      await runProcess('npm.cmd', ['install', '--no-audit', '--no-fund'], {
        cwd: workspace.appDirectory,
        onOutput: log,
      });
      progress('native-app', 42, 'Building Flight Deck EFB with the installed Microsoft EFB template.');
      await runProcess('npm.cmd', ['run', 'build'], {
        cwd: workspace.appDirectory,
        onOutput: log,
      });
      const distDirectory = path.join(workspace.appDirectory, 'dist');
      if (!await directoryExists(distDirectory) || !(await fs.readdir(distDirectory)).length) {
        throw new Error('The MSFS EFB template build completed without a dist output.');
      }
      progress('package-tool', 58, 'Compiling the Community package with the installed MSFS 2024 Package Tool.');
      await runProcess(detected.packageTool, [
        workspace.projectXml,
        '-outputdir', workspace.packageToolOutput,
        '-tempdir', workspace.tempDirectory,
        '-rebuild',
        '-mirroring',
        '-nopause',
      ], {
        cwd: workspace.workspace,
        onOutput: log,
      });
      const builtPackages = await findBuiltPackages(workspace.packageToolOutput);
      if (!builtPackages.length) throw new Error('Package Tool finished but no package containing manifest.json and layout.json was found.');
      const builtPackage = builtPackages.find((candidate) => path.basename(candidate).toLowerCase().includes('flightdeck')) || builtPackages[0];
      progress('export', 78, 'Creating the reusable Flight Deck Community package and ZIP export.');
      const exportRoot = path.join(this.storageDirectory, 'exports', `v${this.appVersion}`);
      await fs.rm(exportRoot, { recursive: true, force: true });
      await fs.mkdir(exportRoot, { recursive: true });
      const packageName = path.basename(builtPackage);
      const exportedPackage = path.join(exportRoot, packageName);
      await fs.cp(builtPackage, exportedPackage, { recursive: true });
      const zipPath = path.join(exportRoot, `Flight-Deck-EFB-MSFS-2024-EFB-${this.appVersion}.zip`);
      await runProcess('tar.exe', ['-a', '-c', '-f', zipPath, '-C', exportRoot, packageName], {
        onOutput: log,
        timeoutMs: 5 * 60_000,
      });
      let installedPath = null;
      if (install) {
        progress('install', 90, `Installing the package into ${detected.communityDirectory}.`);
        await fs.mkdir(detected.communityDirectory, { recursive: true });
        installedPath = path.join(detected.communityDirectory, packageName);
        await fs.rm(installedPath, { recursive: true, force: true });
        await fs.cp(exportedPackage, installedPath, { recursive: true });
      }
      this.lastBuild = {
        version: this.appVersion,
        packageName,
        builtAt: new Date().toISOString(),
        zipPath,
        packagePath: exportedPackage,
        installedPath,
        installed: Boolean(installedPath),
      };
      if (this.lastBuildFile) {
        await fs.mkdir(path.dirname(this.lastBuildFile), { recursive: true });
        await fs.writeFile(this.lastBuildFile, `${JSON.stringify(this.lastBuild, null, 2)}\n`, 'utf8');
      }
      await this.#writeBuildLog(logLines);
      await fs.rm(workspace.buildRoot, { recursive: true, force: true });
      this.#publish({
        status: install ? 'installed' : 'built',
        step: 'complete',
        progressPercent: 100,
        canBuild: true,
        canInstall: Boolean(detected.communityDirectory),
        detail: install
          ? 'Flight Deck EFB was built and installed into Community2024. Restart/reload the simulator package list before using the app.'
          : 'Flight Deck EFB Community package and ZIP were built successfully.',
      });
      return this.publicStatus();
    } catch (error) {
      log(error?.stack || error?.message || error);
      await this.#writeBuildLog(logLines).catch(() => {});
      this.#publish({
        status: 'error',
        step: 'failed',
        progressPercent: 0,
        detail: error.message || 'MSFS EFB package build failed.',
        lastError: outputTail(logLines.join('\n'), 30),
      });
      throw error;
    } finally {
      this.building = false;
      this.engine?.setIntegration('msfsEfbBuilder', this.publicStatus());
    }
  }

  async openOutput() {
    if (this.platform !== 'win32') throw new Error('Output folder can only be opened from the Windows host.');
    const target = this.lastBuild?.zipPath && await fileExists(this.lastBuild.zipPath)
      ? this.lastBuild.zipPath
      : this.storageDirectory ? path.join(this.storageDirectory, 'exports') : null;
    if (!target) throw new Error('No builder output is available yet.');
    const args = await fileExists(target) ? [`/select,${target}`] : [target];
    const child = spawn('explorer.exe', args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
    return { opened: true, path: target };
  }
}

export const MSFS_EFB_PACKAGE_ID = PACKAGE_ID;
