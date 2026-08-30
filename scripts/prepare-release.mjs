import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const app = await fs.readFile('public/app.js', 'utf8').catch(() => '');
const html = await fs.readFile('public/index.html', 'utf8').catch(() => '');

const rendererHas1242Traffic = (source) => source.includes('function renderTrackingTraffic(')
  && source.includes('function renderSelectedTrafficTrail(')
  && source.includes('fd1242-traffic-popup')
  && source.includes('selectedTrafficTrailId = key;');

const alreadyMaterialized = pkg.version === '1.24.2'
  && app.includes('function trackingScheduleMarkup(')
  && rendererHas1242Traffic(app)
  && html.includes('/release-1.24.2.css?v=1.24.2');

if (alreadyMaterialized) {
  console.log('FLYXORA 1.24.2 release sources are already materialized; skipping repeated legacy patch chain.');
  process.exit(0);
}

const chain = [
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
  'scripts/apply-release-1.24.2.mjs',
  'scripts/apply-release-1.24.2-hotfix.mjs',
];

for (const script of chain) {
  const result = spawnSync(process.execPath, [script], {
    stdio: 'inherit',
    windowsHide: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Release materializer failed: ${script} (exit ${result.status})`);
  }
  if (script.includes('1.24')) {
    const currentApp = await fs.readFile('public/app.js', 'utf8');
    console.log(`[1.24 renderer invariant] ${script}: traffic=${rendererHas1242Traffic(currentApp)} schedule=${currentApp.includes('function trackingScheduleMarkup(')}`);
  }
}

const finalApp = await fs.readFile('public/app.js', 'utf8');
if (pkg.version === '1.24.2' && !rendererHas1242Traffic(finalApp)) {
  throw new Error('FLYXORA 1.24.2 materialization completed without the required Traffic route/popup renderer.');
}

console.log(`FLYXORA ${pkg.version} release materialization completed.`);
