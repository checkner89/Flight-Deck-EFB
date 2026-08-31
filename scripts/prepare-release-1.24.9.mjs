import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const FINAL_VERSION = '1.24.9';
const BASE_VERSION = '1.24.8';
const PACKAGE_FILE = 'package.json';

async function readPackage() {
  return JSON.parse(await fs.readFile(PACKAGE_FILE, 'utf8'));
}

async function writePackageVersion(version) {
  const pkg = await readPackage();
  pkg.version = version;
  await fs.writeFile(PACKAGE_FILE, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
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

const pkg = await readPackage();
if (pkg.version !== FINAL_VERSION) {
  throw new Error(`FLYXORA ${FINAL_VERSION} release preparation expected package ${FINAL_VERSION}, got ${pkg.version}.`);
}

const baseChain = [
  'scripts/prepare-release-1.24.7-compat.mjs',
  'scripts/prepare-release-1.24.8-compat.mjs',
  'scripts/prepare-release.mjs',
  'scripts/prepare-release-1.24.8-candidate-inputs.mjs',
  'scripts/prepare-release-1.24.9-compat.mjs',
  'scripts/apply-release-1.24.8-candidate.mjs',
  'scripts/apply-release-1.24.8-candidate-hotfix.mjs',
  'scripts/apply-release-1.24.8.mjs',
  'scripts/apply-release-1.24.9-candidate.mjs',
  'scripts/apply-release-1.24.9-idempotency.mjs',
];

// The established 1.24.8 chain contains intentional version guards. Materialize
// that known-good base under its published version, then restore the final version
// before applying the 1.24.9 branding/version finalizer.
await writePackageVersion(BASE_VERSION);
try {
  for (const script of baseChain) run(script);
} finally {
  await writePackageVersion(FINAL_VERSION);
}

run('scripts/apply-release-1.24.9.mjs');

const finalPackage = await readPackage();
if (finalPackage.version !== FINAL_VERSION) {
  throw new Error(`FLYXORA ${FINAL_VERSION} preparation did not restore package version ${FINAL_VERSION}.`);
}

console.log(`FLYXORA ${FINAL_VERSION} release preparation completed.`);
