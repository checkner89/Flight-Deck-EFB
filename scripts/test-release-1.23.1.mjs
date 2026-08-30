import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.23.1') throw new Error(`Expected package version 1.23.1, got ${pkg.version}.`);

const [html, server, sw, app, uiCss, uiJs, simbrief, state, briefing, changelog] = await Promise.all([
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.23.1-ui.css', 'utf8'),
  fs.readFile('public/release-1.23.1-ui.js', 'utf8'),
  fs.readFile('src/simbrief-client.mjs', 'utf8'),
  fs.readFile('src/state-engine.mjs', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('CHANGELOG.md', 'utf8'),
]);

const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

need(html, 'data-app-version="1.23.1"', 'HTML version is not 1.23.1.');
need(server, "const APP_VERSION = '1.23.1';", 'Server version is not 1.23.1.');
need(sw, 'flight-deck-efb-v1231-ui2', '1.23.1 service-worker cache name missing.');
need(html, 'release-1.23.1-ui.css?v=1.23.1', '1.23.1 UI CSS not wired.');
need(html, 'release-1.23.1-ui.js?v=1.23.1', '1.23.1 UI JS not wired.');
need(app, 'fd124-traffic-plane', 'Aircraft-only Live Traffic marker patch missing.');
need(app, 'bindTooltip(escapeHtml(flightLabel)', 'Live Traffic hover identity missing.');
need(app, 'bindPopup', 'Live Traffic click detail popup missing.');
need(uiCss, '.planner-modal{width:min(760px', 'Responsive Taxi planner sizing missing.');
need(uiCss, 'overflow-x:hidden!important', 'Taxi planner horizontal clipping guard missing.');
need(uiJs, 'removeNewsNavigation', 'News navigation removal missing.');
need(uiJs, 'removeGateAssignment', 'Gate Assignment removal guard missing.');
need(simbrief, 'summary.notamsText = this.latestOFP.notamsText', 'SimBrief NOTAM extraction not exposed.');
need(state, 'notamsText: summary.notamsText', 'SimBrief NOTAM state field missing.');
need(briefing, 'sb.notamsText', 'Briefing does not render SimBrief NOTAMs.');
need(briefing, 'fd1231BriefingFingerprintValue', 'Briefing render stabilization missing.');
reject(briefing, '<dt>Gate / Stand</dt>', 'Gate / Stand still visible in departure briefing.');
need(changelog, '## 1.23.1', '1.23.1 changelog section missing.');

console.log('Flight Deck EFB 1.23.1 cockpit UI and briefing hotfix regression checks passed.');
