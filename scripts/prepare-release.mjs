import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const targetVersion = pkg.version;
const app = await fs.readFile('public/app.js', 'utf8').catch(() => '');
const html = await fs.readFile('public/index.html', 'utf8').catch(() => '');
const server = await fs.readFile('src/server.mjs', 'utf8').catch(() => '');

const trafficInvariant = (source) => ({
  renderTraffic: source.includes('function renderTrackingTraffic('),
  renderTrail: source.includes('function renderSelectedTrafficTrail('),
  popup: source.includes('fd1242-traffic-popup'),
  select: source.includes('selectedTrafficTrailId = key;'),
  updateTrails: source.includes('function updateTrafficTrails('),
});
const rendererHas1242Traffic = (source) => Object.values(trafficInvariant(source)).every(Boolean);
const desktopRecoveryReady = (appSource, serverSource) => appSource.includes('async function recoverDesktopHostToken(')
  && serverSource.includes("pathname === '/api/desktop/session'");
const desktopSessionReady1244 = (appSource, serverSource) => desktopRecoveryReady(appSource, serverSource)
  && appSource.includes("authenticatedUrl('/api/session/validate')")
  && appSource.includes('function desktopSessionSecret()')
  && serverSource.includes('const desktopSessionToken = randomBytes(24)')
  && serverSource.includes("pathname === '/api/session/validate'");
const desktopUpgradeReady1245 = (appSource, htmlSource, serverSource) => desktopSessionReady1244(appSource, serverSource)
  && appSource.includes('WINDOWS APP · v1.24.5')
  && htmlSource.includes('data-app-version="1.24.5"');

const alreadyMaterialized = targetVersion === '1.24.5'
  ? app.includes('function trackingScheduleMarkup(')
    && rendererHas1242Traffic(app)
    && desktopUpgradeReady1245(app, html, server)
  : targetVersion === '1.24.4'
    ? app.includes('function trackingScheduleMarkup(')
      && rendererHas1242Traffic(app)
      && desktopSessionReady1244(app, server)
      && html.includes('data-app-version="1.24.4"')
    : targetVersion === '1.24.3'
      ? app.includes('function trackingScheduleMarkup(')
        && rendererHas1242Traffic(app)
        && desktopRecoveryReady(app, server)
        && html.includes('data-app-version="1.24.3"')
      : targetVersion === '1.24.2'
        && app.includes('function trackingScheduleMarkup(')
        && rendererHas1242Traffic(app)
        && html.includes('/release-1.24.2.css?v=1.24.2');

if (alreadyMaterialized) {
  console.log(`FLYXORA ${targetVersion} release sources are already materialized; skipping repeated legacy patch chain.`);
  process.exit(0);
}

const legacyChain = [
  'scripts/prepare-release-1.23.0-compat.mjs',
  'scripts/prepare-release-1.22.1-compat.mjs',
  'scripts/prepare-release-1.22.0-compat.mjs',
  'scripts/prepare-release-1.21.0-compat.mjs',
  'scripts/prepare-release-1.20.5-compat.mjs',
  'scripts/normalize-release-1.19.0-inputs.mjs',
  'scripts/apply-release-1.19.0.mjs',
  'scripts/prepare-release-1.19.0-notes.mjs',
  'scripts/apply-release-1.17.19.mjs',
  'scripts/prepare-release-ui.mjs',
  'scripts/prepare-operations-suite.mjs',
  'scripts/apply-release-1.20.0.mjs',
  'scripts/apply-release-1.20.1.mjs',
  'scripts/apply-release-1.20.2.mjs',
  'scripts/apply-release-1.20.3.mjs',
  'scripts/apply-release-1.20.4.mjs',
  'scripts/apply-release-1.20.5.mjs',
  'scripts/apply-release-1.20.6.mjs',
  'scripts/apply-release-1.20.7.mjs',
  'scripts/prepare-release-1.20.8-compat.mjs',
  'scripts/prepare-release-1.21.0-compat.mjs',
  'scripts/prepare-release-1.22.0-compat.mjs',
  'scripts/apply-release-1.20.8.mjs',
  'scripts/apply-release-1.20.8-route-hotfix.mjs',
  'scripts/apply-release-1.20.8-layout-hotfix.mjs',
  'scripts/apply-release-1.20.9.mjs',
  'scripts/apply-release-1.20.10.mjs',
  'scripts/apply-release-1.20.11.mjs',
  'scripts/apply-release-1.20.11-clock-hotfix.mjs',
  'scripts/apply-release-1.20.11-landing-rate-compat.mjs',
  'scripts/apply-release-1.20.11-flight-profile.mjs',
  'scripts/apply-release-1.21.0.mjs',
  'scripts/apply-release-1.21.0-state-hotfix.mjs',
  'scripts/apply-release-1.21.0-completion.mjs',
  'scripts/apply-release-1.21.0-test-compat.mjs',
  'scripts/apply-release-1.21.0-renderer-hotfix.mjs',
  'scripts/apply-release-1.22.0.mjs',
  'scripts/apply-release-1.22.1.mjs',
  'scripts/apply-feature-1.23-flight-journey.mjs',
  'scripts/apply-feature-1.23-briefing-readiness.mjs',
  'scripts/apply-release-1.23.0.mjs',
  'scripts/apply-release-1.23.1.mjs',
  'scripts/apply-feature-1.23.2-update-persistence.mjs',
  'scripts/apply-release-1.23.2.mjs',
  'scripts/apply-feature-1.24-flight-tracking.mjs',
  'scripts/apply-release-1.24.0.mjs',
  'scripts/apply-release-1.24.1.mjs',
  'scripts/prepare-release-1.24.2-materializer-fix.mjs',
  'scripts/apply-release-1.24.2.mjs',
  'scripts/apply-release-1.24.2-hotfix.mjs',
];

function runScript(script) {
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Release materializer failed: ${script} (exit ${result.status})`);
}

async function writePackageVersion(version) {
  const value = JSON.parse(await fs.readFile('package.json', 'utf8'));
  value.version = version;
  await fs.writeFile('package.json', `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

let compatibilityVersionApplied = false;
try {
  if (['1.24.3', '1.24.4', '1.24.5'].includes(targetVersion)) {
    await writePackageVersion('1.24.2');
    compatibilityVersionApplied = true;
  }

  for (const script of legacyChain) runScript(script);
} finally {
  if (compatibilityVersionApplied) await writePackageVersion(targetVersion);
}

if (['1.24.3', '1.24.4', '1.24.5'].includes(targetVersion)) {
  if (['1.24.4', '1.24.5'].includes(targetVersion)) await writePackageVersion('1.24.3');
  try {
    runScript('scripts/apply-release-1.24.3.mjs');
  } finally {
    if (['1.24.4', '1.24.5'].includes(targetVersion)) await writePackageVersion(targetVersion);
  }
}
if (['1.24.4', '1.24.5'].includes(targetVersion)) {
  if (targetVersion === '1.24.5') await writePackageVersion('1.24.4');
  try {
    runScript('scripts/apply-release-1.24.4.mjs');
  } finally {
    if (targetVersion === '1.24.5') await writePackageVersion(targetVersion);
  }
}
if (targetVersion === '1.24.5') runScript('scripts/apply-release-1.24.5.mjs');

const finalApp = await fs.readFile('public/app.js', 'utf8');
const finalHtml = await fs.readFile('public/index.html', 'utf8');
const finalServer = await fs.readFile('src/server.mjs', 'utf8');
if (['1.24.2', '1.24.3', '1.24.4', '1.24.5'].includes(targetVersion) && !rendererHas1242Traffic(finalApp)) {
  throw new Error(`FLYXORA ${targetVersion} materialization completed without the required Traffic route/popup renderer: ${JSON.stringify(trafficInvariant(finalApp))}`);
}
if (targetVersion === '1.24.3' && !desktopRecoveryReady(finalApp, finalServer)) {
  throw new Error('FLYXORA 1.24.3 materialization completed without desktop session recovery.');
}
if (['1.24.4', '1.24.5'].includes(targetVersion) && !desktopSessionReady1244(finalApp, finalServer)) {
  throw new Error(`FLYXORA ${targetVersion} materialization completed without hardened desktop session recovery.`);
}
if (targetVersion === '1.24.5' && !desktopUpgradeReady1245(finalApp, finalHtml, finalServer)) {
  throw new Error('FLYXORA 1.24.5 materialization completed without stale-instance upgrade markers.');
}

console.log(`FLYXORA ${targetVersion} release materialization completed.`);
