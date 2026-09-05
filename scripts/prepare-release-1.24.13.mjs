import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const FINAL_VERSION = '1.24.13';
const BASE_VERSION = '1.24.12';
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

async function isMaterialized() {
  const [main, index, server, serviceWorker] = await Promise.all([
    readText('src/electron-main.mjs'),
    readText('public/index.html'),
    readText('src/server.mjs'),
    readText('public/service-worker.js'),
  ]);
  return index.includes('data-app-version="1.24.13"')
    && server.includes("const APP_VERSION = '1.24.13';")
    && serviceWorker.includes('flyxora-v1.24.13-news-removed-quit-on-close')
    && main.includes("app.on('window-all-closed', () => {\n  app.quit();\n});")
    && !/mainWindow\.on\('close'[\s\S]{0,240}event\.preventDefault\(\)/.test(main)
    && !/news-app\.(?:js|css)/i.test(index)
    && !/news-app\.(?:js|css)/i.test(serviceWorker)
    && !/\/api\/news\//i.test(server);
}

const pkg = await readPackage();
if (pkg.version !== FINAL_VERSION) {
  throw new Error(`FLYXORA ${FINAL_VERSION} release preparation expected package ${FINAL_VERSION}, got ${pkg.version}.`);
}

if (await isMaterialized()) {
  run('scripts/apply-release-1.24.13.mjs');
  console.log(`FLYXORA ${FINAL_VERSION} sources already materialized; 1.24.12 chain skipped.`);
} else {
  await writePackageVersion(BASE_VERSION);
  try {
    run('scripts/prepare-release-1.24.12.mjs');
  } finally {
    await writePackageVersion(FINAL_VERSION);
  }
  run('scripts/apply-release-1.24.13.mjs');
}

const finalPackage = await readPackage();
if (finalPackage.version !== FINAL_VERSION) {
  throw new Error(`FLYXORA ${FINAL_VERSION} preparation did not restore package version ${FINAL_VERSION}.`);
}

console.log(`FLYXORA ${FINAL_VERSION} release preparation completed.`);
