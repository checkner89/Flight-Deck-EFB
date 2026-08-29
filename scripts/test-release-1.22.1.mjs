import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.22.1') throw new Error(`Expected package version 1.22.1, got ${pkg.version}.`);

const [html, css, server, sw, runtime] = await Promise.all([
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('public/release-1.22.1.css', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
]);

const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };

need(html, 'data-app-version="1.22.1"', 'HTML version not materialized.');
need(html, 'release-1.22.0.css?v=1.22.1', '1.22 pilot workflow stylesheet was not carried forward.');
need(html, 'release-1.22.0.js?v=1.22.1', '1.22 pilot workflow runtime was not carried forward.');
need(html, 'release-1.22.1.css?v=1.22.1', '1.22.1 UI stylesheet not wired.');
need(server, "const APP_VERSION = '1.22.1';", 'Server version not materialized.');
need(sw, 'flight-deck-efb-v1221-ui1', 'Service-worker cache not bumped.');
need(sw, "'/release-1.22.1.css?v=1.22.1'", '1.22.1 stylesheet not cached.');

need(css, "[data-page='flight'] .flight-hub-nav [data-flight-hub-tab='operations']", 'Retired Flight Operations tab is not explicitly suppressed.');
need(css, "[data-page='flight'] .flight-journey-hub", 'Retired manual Flight Journey UI is not explicitly suppressed.');
need(css, '.tracking-profile-card', 'Flight profile harmonization missing.');
need(css, '.flight-archive-entry', 'Flight Archive harmonization missing.');
need(css, '.fd122-briefing-shell', 'Guided Briefing harmonization missing.');
need(css, '.fd122-scratch-toolbar', 'Scratchpad harmonization missing.');
need(css, '.fd122-service', 'Ground Services harmonization missing.');
need(css, '.clearance-card', 'Taxi moving-map harmonization missing.');
need(css, '.planner-scroll', 'Taxi planner responsive layout missing.');
need(css, '.news-card', 'News presentation harmonization missing.');
need(css, "html[data-theme='light']", 'Light Mode harmonization missing.');
need(css, '--fd123-accent-strong: #07535b', 'Readable Light Mode petrol accent missing.');
need(css, '--fd123-control: 40px', 'Shared cockpit control sizing token missing.');

need(runtime, 'fd122-profile-axis', '1.22 Flight Profile runtime regressed.');
need(runtime, 'fd122-scratch-canvas', '1.22 Scratchpad runtime regressed.');
need(runtime, 'BRIEF_STEPS', '1.22 Guided Briefing runtime regressed.');
need(runtime, 'SERVICE_DEFS', '1.22 Ground Services runtime regressed.');

console.log('Flight Deck EFB 1.22.1 cockpit UI regression checks passed.');
