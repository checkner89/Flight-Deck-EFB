import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.7');
const docsVersion = `${version}-docs3`;

if (version !== '1.20.7') throw new Error(`1.20.7 materializer requires package version 1.20.7, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`1.20.7 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${version}';`));

await update('public/release-1.20.4.js', (source) => {
  let js = source;
  if (!js.includes('body:has(#app-toolbar:not([hidden])) .fd-global-rail.fd26-rail')) {
    js = replaceRequired(
      js,
      '.fd26-bottom-nav{display:none}',
      `.fd26-bottom-nav{display:none}\nbody:has(#app-toolbar:not([hidden])) .fd-global-rail.fd26-rail{top:126px!important}\nbody:has(#app-toolbar:not([hidden])) #fd-docs-workspace,body:has(#app-toolbar:not([hidden])) #fd-files-workspace{inset:116px 0 0 92px!important}`,
      'rail/app-toolbar vertical alignment',
    );
  }
  return js;
});

await update('public/documents-workspace.js', (source) => {
  let js = source.replace(/^const FD_DOCS_VERSION = '[^']+';$/m, `const FD_DOCS_VERSION = '${docsVersion}';`);

  if (!js.includes('function makeFlightDeckOFPHtml')) {
    const anchor = 'function makeBriefingTextHtml(title, value, fallback) {';
    const helpers = `function fdOfpAltitude(value) {
  const altitude = numeric(value);
  if (altitude === null) return '—';
  if (altitude >= 10000) return 'FL' + Math.round(altitude / 100);
  return Math.round(altitude).toLocaleString() + ' ft';
}

function fdOfpPercent(value, maximum) {
  const current = numeric(value);
  const max = numeric(maximum);
  if (current === null || max === null || max <= 0) return 0;
  return Math.max(0, Math.min(100, (current / max) * 100));
}

function fdOfpMetric(label, value, detail = '') {
  const detailHtml = detail ? '<span>' + htmlEscape(detail) + '</span>' : '';
  return '<article class="fd-custom-ofp-metric"><small>' + htmlEscape(label) + '</small><strong>' + htmlEscape(safe(value)) + '</strong>' + detailHtml + '</article>';
}

function fdOfpWeightCard(label, value, maximum) {
  const percent = fdOfpPercent(value, maximum);
  const maxLabel = numeric(maximum) === null ? 'PLANNED' : 'MAX ' + formatWeight(maximum);
  return '<article class="fd-custom-ofp-weight"><header><small>' + htmlEscape(label) + '</small><strong>' + htmlEscape(formatWeight(value)) + '</strong></header><span class="fd-custom-ofp-bar"><i style="width:' + percent.toFixed(1) + '%"></i></span><footer>' + htmlEscape(maxLabel) + '</footer></article>';
}

function fdOfpWeatherCard(label, icao, runway, metar, taf) {
  return '<article class="fd-custom-ofp-weather"><header><div><small>' + htmlEscape(label) + '</small><strong>' + htmlEscape(safe(icao)) + '</strong></div><b>RWY ' + htmlEscape(safe(runway)) + '</b></header><section><small>METAR</small><p>' + htmlEscape(safe(metar, 'No METAR in current SimBrief briefing')) + '</p></section><section><small>TAF</small><p>' + htmlEscape(safe(taf, 'No TAF in current SimBrief briefing')) + '</p></section></article>';
}

function fdOfpNavlogRows(plan) {
  const waypoints = Array.isArray(plan?.waypoints) ? plan.waypoints : [];
  if (!waypoints.length) return '<tr><td colspan="7" class="fd-custom-ofp-empty">No navlog waypoints were supplied by SimBrief.</td></tr>';
  return waypoints.slice(0, 500).map((fix, index) => {
    const speed = numeric(fix.plannedSpeedKnots) === null ? '—' : Math.round(fix.plannedSpeedKnots) + ' kt';
    const distance = numeric(fix.distanceNm) === null ? '—' : Math.round(fix.distanceNm) + ' NM';
    return '<tr><td>' + String(index + 1).padStart(2, '0') + '</td><td><strong>' + htmlEscape(safe(fix.ident)) + '</strong><small>' + htmlEscape(safe(fix.stage, '')) + '</small></td><td>' + htmlEscape(safe(fix.airway, 'DCT')) + '</td><td>' + htmlEscape(fdOfpAltitude(fix.altitudeFeet)) + '</td><td>' + htmlEscape(speed) + '</td><td>' + htmlEscape(distance) + '</td><td>' + htmlEscape(safe(fix.type, 'FIX')) + '</td></tr>';
  }).join('');
}

function makeFlightDeckOFPHtml(plan) {
  const generated = fdDocsSimBriefOFP?.generatedAt ? new Date(fdDocsSimBriefOFP.generatedAt) : null;
  const generatedLabel = generated && !Number.isNaN(generated.valueOf()) ? generated.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Latest import';
  const route = safe(plan.route, 'No filed route available');
  const fuelRows = [
    ['Taxi', plan.taxiFuelPounds], ['Trip', plan.tripFuelPounds], ['Contingency', plan.contingencyFuelPounds],
    ['Alternate', plan.alternateFuelPounds], ['Final reserve', plan.reserveFuelPounds], ['Extra', plan.extraFuelPounds], ['Block', plan.blockFuelPounds],
  ];
  const timeRows = [
    ['OUT', formatEpoch(plan.estimatedOut)], ['OFF', formatEpoch(plan.estimatedOff)], ['ON', formatEpoch(plan.estimatedOn)], ['IN', formatEpoch(plan.estimatedIn)],
  ];
  const registration = plan.registration ? ' · ' + htmlEscape(plan.registration) : '';
  const distance = numeric(plan.routeDistanceNm) === null ? '—' : Math.round(plan.routeDistanceNm) + ' NM';
  const mach = plan.cruiseMach ? 'M' + Number(plan.cruiseMach).toFixed(2) : '';
  const fixes = Array.isArray(plan.waypoints) ? plan.waypoints.length : 0;
  const timesHtml = timeRows.map(([label, value]) => '<span><small>' + label + '</small><strong>' + htmlEscape(value) + '</strong></span>').join('');
  const fuelHtml = fuelRows.map(([label, value], index) => '<tr class="' + (index === fuelRows.length - 1 ? 'total' : '') + '"><td>' + htmlEscape(label) + '</td><td>' + htmlEscape(formatWeight(value)) + '</td></tr>').join('');
  const notamsHtml = fdDocsSimBriefOFP?.notamsText ? '<details class="fd-custom-ofp-details"><summary><span><small>SIMBRIEF BRIEFING</small><strong>NOTAMs</strong></span><b>SHOW</b></summary><pre>' + htmlEscape(fdDocsSimBriefOFP.notamsText) + '</pre></details>' : '';

  return '<div class="fd-custom-ofp">' +
    '<header class="fd-custom-ofp-hero">' +
      '<div class="fd-custom-ofp-ident"><small>FLIGHT DECK · SIMBRIEF OFP</small><h1>' + htmlEscape(safe(plan.callsign, plan.flightNumber || 'FLIGHT')) + '</h1><span>' + htmlEscape(safe(plan.aircraftType)) + registration + '</span></div>' +
      '<div class="fd-custom-ofp-route"><strong>' + htmlEscape(safe(plan.origin)) + '</strong><span><i></i><b>' + htmlEscape(distance) + '</b></span><strong>' + htmlEscape(safe(plan.destination)) + '</strong></div>' +
      '<div class="fd-custom-ofp-release"><small>OFP IMPORT</small><strong>' + htmlEscape(generatedLabel) + '</strong><span>' + htmlEscape(safe(fdDocsSimBriefOFP?.planFormat, 'SimBrief')) + '</span></div>' +
    '</header>' +
    '<section class="fd-custom-ofp-metrics">' +
      fdOfpMetric('CRUISE', fdOfpAltitude(plan.cruiseAltitudeFeet), mach) +
      fdOfpMetric('COST INDEX', plan.costIndex) +
      fdOfpMetric('EET', formatDuration(plan.enrouteSeconds)) +
      fdOfpMetric('BLOCK', formatDuration(plan.blockSeconds)) +
      fdOfpMetric('SID', plan.sid) +
      fdOfpMetric('STAR', plan.star) +
    '</section>' +
    '<div class="fd-custom-ofp-two">' +
      '<section class="fd-custom-ofp-card fd-custom-ofp-route-card"><header><div><small>FILED ROUTE</small><strong>ATC Flight Plan</strong></div><span>AIRAC ' + htmlEscape(safe(plan.airacCycle)) + '</span></header><pre>' + htmlEscape(route) + '</pre></section>' +
      '<section class="fd-custom-ofp-card"><header><div><small>PLANNED TIMES</small><strong>UTC Schedule</strong></div><span>' + htmlEscape(formatDuration(plan.enrouteSeconds)) + ' ENROUTE</span></header><div class="fd-custom-ofp-times">' + timesHtml + '</div></section>' +
    '</div>' +
    '<div class="fd-custom-ofp-two">' +
      '<section class="fd-custom-ofp-card"><header><div><small>FUEL PLAN</small><strong>Dispatch Fuel</strong></div><span>' + htmlEscape(formatWeight(plan.blockFuelPounds)) + ' BLOCK</span></header><table class="fd-custom-ofp-table compact"><tbody>' + fuelHtml + '</tbody></table></section>' +
      '<section class="fd-custom-ofp-card"><header><div><small>WEIGHTS</small><strong>Aircraft Loading</strong></div><span>' + htmlEscape(safe(plan.passengers)) + ' PAX</span></header><div class="fd-custom-ofp-weights">' + fdOfpWeightCard('ZFW', plan.zeroFuelWeightPounds, plan.maxZeroFuelWeightPounds) + fdOfpWeightCard('TOW', plan.takeoffWeightPounds, plan.maxTakeoffWeightPounds) + fdOfpWeightCard('LDW', plan.landingWeightPounds, plan.maxLandingWeightPounds) + '</div></section>' +
    '</div>' +
    '<section class="fd-custom-ofp-card fd-custom-ofp-navlog"><header><div><small>NAVLOG</small><strong>Route Waypoints</strong></div><span>' + fixes + ' FIXES</span></header><div class="fd-custom-ofp-table-wrap"><table class="fd-custom-ofp-table"><thead><tr><th>#</th><th>FIX</th><th>VIA</th><th>ALT</th><th>SPEED</th><th>DIST</th><th>TYPE</th></tr></thead><tbody>' + fdOfpNavlogRows(plan) + '</tbody></table></div></section>' +
    '<section class="fd-custom-ofp-airports">' +
      fdOfpWeatherCard('DEPARTURE', plan.origin, plan.departureRunway, plan.originMetar, plan.originTaf) +
      fdOfpWeatherCard('DESTINATION', plan.destination, plan.arrivalRunway, plan.destinationMetar, plan.destinationTaf) +
      fdOfpWeatherCard('ALTERNATE', plan.alternate, '—', plan.alternateMetar, plan.alternateTaf) +
    '</section>' +
    notamsHtml +
    '<footer class="fd-custom-ofp-footer"><span>Structured by Flight Deck EFB from the imported SimBrief dataset.</span><span>Use ORIGINAL OFP or OFP PDF for the unmodified dispatch document.</span></footer>' +
  '</div>';
}

`;
    js = replaceRequired(js, anchor, `${helpers}${anchor}`, 'Flight Deck formatted OFP helpers');
  }

  const currentOfpEntry = `{ id: 'simbrief-ofp', label: 'OPERATIONAL FLIGHT PLAN', title: 'Operational Flight Plan', chip: 'OFP', kind: 'html', html: () => fullSimBriefOfpHtml() },`;
  if (js.includes(currentOfpEntry)) {
    js = js.replace(currentOfpEntry, `{ id: 'simbrief-ofp', label: 'OFP', title: 'Flight Deck OFP', chip: 'OFP', kind: 'html', html: () => makeFlightDeckOFPHtml(plan) },\n    { id: 'simbrief-original', label: 'ORIGINAL OFP', title: 'Original SimBrief OFP', chip: 'Original', kind: 'html', html: () => fullSimBriefOfpHtml() },`);
  }

  js = js.replace(
    "['general', 'simbrief-ofp', 'simbrief-pdf', 'weather', 'departure', 'destination', 'notams', 'sigwx']",
    "['general', 'simbrief-ofp', 'simbrief-original', 'simbrief-pdf', 'weather', 'departure', 'destination', 'notams', 'sigwx']",
  );

  return js;
});

await update('public/release-1.20.4.css', (source) => {
  if (source.includes('/* Flight Deck EFB 1.20.7 — formatted SimBrief OFP */')) return source;
  return `${source.trimEnd()}\n\n/* Flight Deck EFB 1.20.7 — formatted SimBrief OFP */\n.fd-custom-ofp{display:grid;gap:12px;width:min(1180px,calc(100% - 24px));margin:12px auto 30px;color:var(--fd-docs-text)}\n.fd-custom-ofp-hero{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(360px,1.6fr) minmax(170px,.8fr);align-items:center;gap:18px;padding:20px;border:1px solid var(--fd-docs-line);border-radius:14px;background:linear-gradient(145deg,color-mix(in srgb,var(--fd-docs-accent) 8%,var(--fd-docs-panel)),var(--fd-docs-panel));box-shadow:0 16px 36px color-mix(in srgb,var(--fd-docs-shadow) 26%,transparent)}\n.fd-custom-ofp-ident,.fd-custom-ofp-release{display:grid;gap:4px}.fd-custom-ofp-ident small,.fd-custom-ofp-release small,.fd-custom-ofp-card header small,.fd-custom-ofp-weather small,.fd-custom-ofp-details small,.fd-custom-ofp-metric small,.fd-custom-ofp-weight small{font-size:9px;font-weight:850;letter-spacing:.1em;color:var(--fd-docs-muted)}.fd-custom-ofp-ident h1{margin:0;font-size:26px;line-height:1}.fd-custom-ofp-ident span,.fd-custom-ofp-release span{font-size:11px;color:var(--fd-docs-muted)}.fd-custom-ofp-release{text-align:right}.fd-custom-ofp-release strong{font-size:12px}\n.fd-custom-ofp-route{display:grid;grid-template-columns:auto minmax(140px,1fr) auto;align-items:center;gap:12px}.fd-custom-ofp-route>strong{font-size:25px;letter-spacing:.05em}.fd-custom-ofp-route>span{display:grid;grid-template-columns:1fr;justify-items:center;gap:5px;color:var(--fd-docs-muted);font-size:10px}.fd-custom-ofp-route i{display:block;width:100%;height:4px;border-radius:99px;background:linear-gradient(90deg,var(--fd-docs-accent),var(--fd-docs-accent-2))}.fd-custom-ofp-route b{font-size:10px}\n.fd-custom-ofp-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border:1px solid var(--fd-docs-line);border-radius:12px;background:var(--fd-docs-panel);overflow:hidden}.fd-custom-ofp-metric{display:grid;gap:5px;min-width:0;padding:13px 14px;border-right:1px solid var(--fd-docs-line)}.fd-custom-ofp-metric:last-child{border-right:0}.fd-custom-ofp-metric strong{overflow:hidden;font-size:14px;text-overflow:ellipsis;white-space:nowrap}.fd-custom-ofp-metric span{font-size:10px;color:var(--fd-docs-muted)}\n.fd-custom-ofp-two{display:grid;grid-template-columns:1.25fr .75fr;gap:12px}.fd-custom-ofp-card{min-width:0;border:1px solid var(--fd-docs-line);border-radius:12px;background:var(--fd-docs-panel);overflow:hidden}.fd-custom-ofp-card>header{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border-bottom:1px solid var(--fd-docs-line);background:color-mix(in srgb,var(--fd-docs-panel-2) 78%,transparent)}.fd-custom-ofp-card>header>div{display:grid;gap:3px}.fd-custom-ofp-card>header strong{font-size:13px}.fd-custom-ofp-card>header>span{font-size:9px;font-weight:800;color:var(--fd-docs-accent-2);letter-spacing:.06em}.fd-custom-ofp-route-card pre{margin:0;padding:16px;white-space:pre-wrap;word-break:break-word;background:transparent;color:var(--fd-docs-text);font:11px/1.55 "SFMono-Regular",Consolas,monospace}\n.fd-custom-ofp-times{display:grid;grid-template-columns:repeat(4,1fr);min-height:108px}.fd-custom-ofp-times span{display:grid;place-content:center;gap:6px;text-align:center;border-right:1px solid var(--fd-docs-line)}.fd-custom-ofp-times span:last-child{border-right:0}.fd-custom-ofp-times small{font-size:9px;color:var(--fd-docs-muted);font-weight:850}.fd-custom-ofp-times strong{font-size:17px;font-variant-numeric:tabular-nums}\n.fd-custom-ofp-table-wrap{overflow:auto}.fd-custom-ofp-table{width:100%;border-collapse:collapse;font-size:10px}.fd-custom-ofp-table th{position:sticky;top:0;z-index:1;padding:9px 10px;border-bottom:1px solid var(--fd-docs-line);background:var(--fd-docs-panel-2);color:var(--fd-docs-muted);font-size:8px;text-align:left;letter-spacing:.08em}.fd-custom-ofp-table td{padding:9px 10px;border-bottom:1px solid var(--fd-docs-line);color:var(--fd-docs-text);font-variant-numeric:tabular-nums}.fd-custom-ofp-table tr:last-child td{border-bottom:0}.fd-custom-ofp-table td:nth-child(n+4){white-space:nowrap}.fd-custom-ofp-table td strong{display:block}.fd-custom-ofp-table td small{display:block;margin-top:2px;color:var(--fd-docs-muted);font-size:8px}.fd-custom-ofp-table.compact td:last-child{text-align:right;font-weight:800}.fd-custom-ofp-table.compact tr.total td{border-top:1px solid var(--fd-docs-line-strong);color:var(--fd-docs-accent-2);font-size:11px}.fd-custom-ofp-empty{text-align:center!important;color:var(--fd-docs-muted)!important}\n.fd-custom-ofp-weights{display:grid;gap:10px;padding:13px}.fd-custom-ofp-weight{display:grid;gap:6px}.fd-custom-ofp-weight header{display:flex;justify-content:space-between;gap:10px}.fd-custom-ofp-weight strong{font-size:11px}.fd-custom-ofp-weight footer{font-size:8px;color:var(--fd-docs-muted);text-align:right}.fd-custom-ofp-bar{height:5px;border-radius:99px;background:var(--fd-docs-surface);overflow:hidden}.fd-custom-ofp-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--fd-docs-accent),var(--fd-docs-accent-2))}\n.fd-custom-ofp-navlog .fd-custom-ofp-table-wrap{max-height:420px}.fd-custom-ofp-airports{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.fd-custom-ofp-weather{min-width:0;border:1px solid var(--fd-docs-line);border-radius:12px;background:var(--fd-docs-panel);overflow:hidden}.fd-custom-ofp-weather>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--fd-docs-line);background:var(--fd-docs-panel-2)}.fd-custom-ofp-weather>header>div{display:grid;gap:2px}.fd-custom-ofp-weather>header strong{font-size:16px}.fd-custom-ofp-weather>header b{font-size:9px;color:var(--fd-docs-accent-2)}.fd-custom-ofp-weather section{padding:11px 14px;border-bottom:1px solid var(--fd-docs-line)}.fd-custom-ofp-weather section:last-child{border-bottom:0}.fd-custom-ofp-weather p{margin:5px 0 0;color:var(--fd-docs-text);font:10px/1.45 "SFMono-Regular",Consolas,monospace;white-space:pre-wrap;word-break:break-word}\n.fd-custom-ofp-details{border:1px solid var(--fd-docs-line);border-radius:12px;background:var(--fd-docs-panel);overflow:hidden}.fd-custom-ofp-details summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;cursor:pointer;list-style:none}.fd-custom-ofp-details summary::-webkit-details-marker{display:none}.fd-custom-ofp-details summary>span{display:grid;gap:2px}.fd-custom-ofp-details summary strong{font-size:12px}.fd-custom-ofp-details summary b{font-size:9px;color:var(--fd-docs-accent-2)}.fd-custom-ofp-details pre{max-height:420px;margin:0;padding:14px;border-top:1px solid var(--fd-docs-line);overflow:auto;white-space:pre-wrap;background:color-mix(in srgb,var(--fd-docs-panel-2) 72%,transparent);color:var(--fd-docs-text);font:10px/1.45 "SFMono-Regular",Consolas,monospace}.fd-custom-ofp-footer{display:flex;justify-content:space-between;gap:16px;padding:5px 2px;color:var(--fd-docs-muted);font-size:9px}\n@media(max-width:1200px){.fd-custom-ofp-hero{grid-template-columns:1fr}.fd-custom-ofp-release{text-align:left}.fd-custom-ofp-metrics{grid-template-columns:repeat(3,1fr)}.fd-custom-ofp-metric:nth-child(3n){border-right:0}.fd-custom-ofp-two{grid-template-columns:1fr}.fd-custom-ofp-airports{grid-template-columns:1fr}}\n@media(max-width:760px){.fd-custom-ofp{width:calc(100% - 12px);margin-top:6px}.fd-custom-ofp-route{grid-template-columns:auto 1fr auto}.fd-custom-ofp-route>strong{font-size:20px}.fd-custom-ofp-metrics{grid-template-columns:repeat(2,1fr)}.fd-custom-ofp-metric:nth-child(odd){border-right:1px solid var(--fd-docs-line)}.fd-custom-ofp-metric:nth-child(even){border-right:0}.fd-custom-ofp-times{grid-template-columns:repeat(2,1fr)}.fd-custom-ofp-airports{grid-template-columns:1fr}.fd-custom-ofp-footer{display:grid}}\n`;
});

await update('public/index.html', (source) => {
  let html = source.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  for (const asset of ['release-1.20.4.css', 'release-1.20.4.js', 'file-browser.css', 'file-browser.js']) {
    const escaped = asset.replaceAll('.', '\\.');
    html = html.replace(new RegExp(`${escaped}\\?v=[^"']+`, 'g'), `${asset}?v=${version}`);
  }
  html = html.replace(/documents-workspace\.css\?v=[^"']+/g, `documents-workspace.css?v=${docsVersion}`);
  html = html.replace(/documents-workspace\.js\?v=[^"']+/g, `documents-workspace.js?v=${docsVersion}`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v1207-formatted-ofp1';");
  for (const asset of ['release-1.20.4.css', 'release-1.20.4.js', 'file-browser.css', 'file-browser.js']) {
    const escaped = asset.replaceAll('.', '\\.');
    sw = sw.replace(new RegExp(`${escaped}\\?v=[^'"\\s,]+`, 'g'), `${asset}?v=${version}`);
  }
  sw = sw.replace(/documents-workspace\.css\?v=[^'"\s,]+/g, `documents-workspace.css?v=${docsVersion}`);
  sw = sw.replace(/documents-workspace\.js\?v=[^'"\s,]+/g, `documents-workspace.js?v=${docsVersion}`);
  return sw;
});

const changelogPath = path.join(root, 'CHANGELOG.md');
const notesPath = path.join(root, 'release-notes', '1.20.7.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.7\b/m.test(changelog)) {
  const notes = (await fs.readFile(notesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log(`Applied Flight Deck EFB ${version} formatted SimBrief OFP + rail alignment.`);
