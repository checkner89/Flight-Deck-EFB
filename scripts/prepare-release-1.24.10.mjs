import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const FINAL_VERSION = '1.24.10';
const BASE_VERSION = '1.24.9';
const PACKAGE_FILE = 'package.json';

async function readPackage() {
  return JSON.parse(await fs.readFile(PACKAGE_FILE, 'utf8'));
}

async function writePackageVersion(version) {
  const pkg = await readPackage();
  pkg.version = version;
  await fs.writeFile(PACKAGE_FILE, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

async function readText(filename) {
  return fs.readFile(filename, 'utf8').catch(() => '');
}

function run(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${script} failed with exit code ${result.status}.`);
}

async function isRecoveryTreeMaterialized() {
  const [server, electronMain, html, serviceWorker, installer, app] = await Promise.all([
    readText('src/server.mjs'),
    readText('src/electron-main.mjs'),
    readText('public/index.html'),
    readText('public/service-worker.js'),
    readText('build/installer.nsh'),
    readText('public/app.js'),
  ]);

  return server.includes("const APP_VERSION = '1.24.10';")
    && html.includes('data-app-version="1.24.10"')
    && serviceWorker.includes('flyxora-v1.24.10-recovery')
    && electronMain.includes('autoUpdater.quitAndInstall(true, true)')
    && !electronMain.includes('app.requestSingleInstanceLock()')
    && installer.includes('/IM "FLYXORA.exe"')
    && installer.includes('/IM "flight-deck-efb.exe"')
    && app.includes('function fd1249DedupeTraffic(entries = [])')
    && app.includes('function trackingSimBriefPoints(record = null)');
}

const pkg = await readPackage();
if (pkg.version !== FINAL_VERSION) {
  throw new Error(`FLYXORA ${FINAL_VERSION} release preparation expected package ${FINAL_VERSION}, got ${pkg.version}.`);
}

if (await isRecoveryTreeMaterialized()) {
  // npm lifecycle/test/build commands can invoke prepare:release several times in
  // the same checkout. Once the recovery tree is materialized, never replay the
  // historical migration chain; only re-run the idempotent recovery finalizer.
  run('scripts/apply-release-1.24.10.mjs');
  console.log(`FLYXORA ${FINAL_VERSION} recovery sources already materialized; legacy chain skipped.`);
} else {
  await writePackageVersion(BASE_VERSION);
  try {
    run('scripts/prepare-release-1.24.9.mjs');
  } finally {
    await writePackageVersion(FINAL_VERSION);
  }
  run('scripts/apply-release-1.24.10.mjs');
}

const finalPackage = await readPackage();
if (finalPackage.version !== FINAL_VERSION) {
  throw new Error(`FLYXORA ${FINAL_VERSION} preparation did not restore package version ${FINAL_VERSION}.`);
}

console.log(`FLYXORA ${FINAL_VERSION} recovery release preparation completed.`);
