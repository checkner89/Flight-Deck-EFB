import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.1') throw new Error(`1.24.1 materializer requires package version 1.24.1, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('public/index.html', (source) => {
  let next = source.replace(/data-app-version="[^"]+"/, 'data-app-version="1.24.1"');
  next = next.replaceAll('?v=1.24.0', '?v=1.24.1');
  next = next.replaceAll('Flight Deck EFB', 'FLYXORA');
  next = next.replaceAll('FLIGHT DECK EFB', 'FLYXORA');
  next = next.replaceAll('MSFS COMPANION', 'SIMULATION EFB');
  next = next.replaceAll('FLIGHT OPS', 'SIMULATION EFB');
  next = next.replaceAll('<span class="brand-mark"><span></span></span>', '<span class="brand-mark"><img src="/assets/flyxora-mark.svg" alt=""></span>');
  next = next.replace(
    /<div class="tracking-map-actions">[\s\S]*?<button id="tracking-fit"[\s\S]*?<\/button>\s*<\/div>/,
    `<div class="tracking-map-actions">
                  <label class="fd1241-map-style"><span>KARTENSTIL</span><select id="tracking-basemap-select" aria-label="Kartenstil"><option value="map">Karte</option><option value="satellite">Satellit</option><option value="weather">Wetter</option></select></label>
                  <details class="fd1241-layer-menu"><summary>EBENEN <span aria-hidden="true">⌄</span></summary><div class="fd1241-layer-popover"></div></details>
                  <button id="tracking-weather-toggle" class="fd1241-native-map-control" type="button" aria-pressed="false" tabindex="-1">WETTER</button>
                  <button id="tracking-waypoints-toggle" class="fd1241-native-map-control" type="button" aria-pressed="true" tabindex="-1">WEGPUNKTE</button>
                  <button id="tracking-follow" class="tracking-control active" type="button" data-i18n="follow">FOLGEN</button>
                  <button id="tracking-fit" class="tracking-control" type="button" data-i18n="fitFlight">GESAMTER FLUG</button>
                </div>`,
  );
  next = next.replace('<dt>TAKEOFF</dt><dd id="tracking-context-takeoff">—</dd>', '<dt>TAKE-OFF</dt><dd id="tracking-context-takeoff" class="fd1241-time-value">—</dd>');
  next = next.replace('<dt>LANDING</dt><dd id="tracking-context-landing">—</dd>', '<dt>LANDUNG</dt><dd id="tracking-context-landing" class="fd1241-time-value">—</dd>');
  return next;
});

await update('public/release-1.22.0.js', (source) => {
  let next = source;
  next = next.replace(
    "const bar = document.createElement('div'); bar.className = 'fd122-map-toolbar';\n    bar.innerHTML = `<button data-layer=\"planned\" aria-pressed=\"true\">PLAN</button><button data-layer=\"actual\" aria-pressed=\"true\">GEFLOGEN</button><button data-layer=\"taxi\" aria-pressed=\"true\">TAXI</button><button data-layer=\"waypoints\" aria-pressed=\"true\">WEGPUNKTE</button><button data-layer=\"events\" aria-pressed=\"true\">EREIGNISSE</button>`;\n    anchor.insertAdjacentElement('afterend', bar);",
    "const bar = document.createElement('div'); bar.className = 'fd122-map-toolbar';\n    bar.innerHTML = `<button data-layer=\"planned\" aria-pressed=\"true\"><span>Geplante Route</span><b>PLAN</b></button><button data-layer=\"actual\" aria-pressed=\"true\"><span>Flugspur</span><b>GEFLOGEN</b></button><button data-layer=\"taxi\" aria-pressed=\"true\"><span>Bodenroute</span><b>TAXI</b></button><button data-layer=\"waypoints\" aria-pressed=\"true\"><span>Navigation</span><b>WEGPUNKTE</b></button><button data-layer=\"events\" aria-pressed=\"true\"><span>Flugereignisse</span><b>EREIGNISSE</b></button>`;\n    const popover = document.querySelector('.fd1241-layer-popover');\n    if (popover) popover.append(bar); else anchor.insertAdjacentElement('afterend', bar);",
  );
  if (!next.includes("tracking-basemap-select")) {
    next = next.replace(
      "function layerEnabled(name) {",
      `function bindCompactMapControls() {
    const select = document.querySelector('#tracking-basemap-select');
    if (!select || select.dataset.bound === '1') return;
    select.dataset.bound = '1';
    select.onchange = () => {
      if (select.value === 'weather') {
        document.querySelector('[data-weather-overlay], #tracking-weather-toggle')?.click();
        select.value = document.querySelector('[data-tracking-basemap].active')?.dataset.trackingBasemap || 'map';
        return;
      }
      document.querySelector(\`[data-tracking-basemap="\${select.value}"]\`)?.click();
    };
  }
  function layerEnabled(name) {`,
    );
    next = next.replace('ensureMapControls();\n    const map = window.__flightDeckTrackingMap;', 'ensureMapControls();\n    bindCompactMapControls();\n    const map = window.__flightDeckTrackingMap;');
  }
  return next;
});

await update('public/app.js', (source) => {
  let next = source;
  next = next.replace(
    "['TAKEOFF', formatTime(stats.takeoffAt) || '—'],\n    ['LANDING', formatTime(stats.landedAt) || '—'],",
    "['TAKEOFF', `<span><em>PLAN</em><b>${formatTime(record?.flight?.estimatedOff) || '—'}</b></span><span><em>IST</em><b>${formatTime(stats.takeoffAt) || '—'}</b></span>`],\n    ['LANDING', `<span><em>PLAN</em><b>${formatTime(record?.flight?.estimatedOn) || '—'}</b></span><span><em>IST</em><b>${formatTime(stats.landedAt) || '—'}</b></span>`],",
  );
  next = next.replace(
    "if (node) node.textContent = value;",
    "if (node) { if (index >= 4) node.innerHTML = value; else node.textContent = value; }",
  );
  return next;
});

await update('public/release-1.21.0.js', (source) => {
  let next = source;
  next = next.replace("    if (document.querySelector('#tracking-schedule-card')) return;", "    document.querySelector('#tracking-schedule-card')?.remove();\n    return;");
  return next;
});

await update('public/release-1.22.0.css', (source) => {
  if (source.includes('/* 1.24.1 tracking layout */')) return source;
  return `${source}\n\n/* 1.24.1 tracking layout */
.tracking-map-toolbar{min-height:74px!important;padding:14px 18px!important;gap:20px!important}
.brand-mark{width:38px!important;height:38px!important;filter:none!important}.brand-mark::before,.brand-mark>span{display:none!important}.brand-mark img{display:block;width:38px;height:38px}.brand-copy strong{letter-spacing:.18em!important}.brand-copy small{letter-spacing:.22em!important}
.tracking-map-actions{gap:8px!important;flex-wrap:nowrap!important}
.tracking-basemap-selector{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important}
.fd1241-native-map-control{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important}
.fd1241-map-style{display:grid;grid-template-columns:auto 118px;align-items:center;gap:8px;color:#8fa7b3;font-size:9px;font-weight:850;letter-spacing:.08em}
.fd1241-map-style select{min-height:38px;border:1px solid rgba(151,193,216,.24);border-radius:9px;background:#0d222e;color:#edf8fa;padding:0 32px 0 11px;font:inherit;font-size:11px;cursor:pointer}
.fd1241-layer-menu{position:relative}.fd1241-layer-menu summary{display:flex;min-height:38px;align-items:center;gap:9px;padding:0 12px;border:1px solid rgba(151,193,216,.24);border-radius:9px;color:#d8e8ed;font-size:10px;font-weight:850;letter-spacing:.07em;cursor:pointer;list-style:none}.fd1241-layer-menu summary::-webkit-details-marker{display:none}
.fd1241-layer-popover{position:absolute;z-index:900;top:44px;right:0;width:250px;padding:8px;border:1px solid rgba(151,193,216,.25);border-radius:12px;background:#102631;box-shadow:0 16px 40px rgba(0,0,0,.38)}
.fd1241-layer-popover .fd122-map-toolbar{display:grid!important;gap:4px!important;margin:0!important}.fd1241-layer-popover .fd122-map-toolbar button{display:flex;min-height:42px;align-items:center;justify-content:space-between;border-color:transparent!important;padding:7px 9px!important;text-align:left}.fd1241-layer-popover .fd122-map-toolbar button span{font-size:10px;color:#91a8b3}.fd1241-layer-popover .fd122-map-toolbar button b{font-size:10px;letter-spacing:.06em}.fd1241-layer-popover .fd122-map-toolbar button[aria-pressed='true']{background:rgba(87,200,207,.12)!important}
.tracking-legend{top:88px!important;bottom:auto!important;left:18px!important;background:rgba(8,25,35,.94)!important;backdrop-filter:none!important}
.tracking-live-strip,.tracking-flight-strip{position:relative;z-index:2;background:var(--fd122-card,#f8fbfc)!important}
.tracking-schedule-card{display:none!important}
.tracking-flight-strip>div:nth-child(5),.tracking-flight-strip>div:nth-child(6){min-width:150px}
.fd1241-time-value{display:grid!important;gap:4px!important}.fd1241-time-value>span{display:grid;grid-template-columns:32px 1fr;align-items:baseline;gap:7px}.fd1241-time-value em{color:var(--fd122-muted);font-size:8px;font-style:normal;font-weight:850;letter-spacing:.06em}.fd1241-time-value b{font-size:12px;font-weight:850;white-space:nowrap}
.tracking-profile-card{padding:22px!important}.tracking-profile-card>.section-title{margin-bottom:14px!important}.fd124-time-strip{gap:12px!important;margin:0 0 18px!important}.fd124-time-item{padding:13px 15px!important;border-radius:12px!important;background:rgba(110,145,160,.045)!important}.fd124-time-item>small{margin-bottom:10px!important}.fd122-profile-toolbar{padding:12px 0!important;margin-bottom:16px!important}.fd124-profile-controls{gap:10px!important}.tracking-profile-metrics{gap:10px!important;margin:0 0 16px!important}.tracking-profile-metrics>span{min-width:140px!important;padding:11px 13px!important}.fd122-profile-wrap{min-height:350px!important}.fd122-profile-svg{min-height:330px!important}
html[data-theme='light'] .fd1241-map-style select,html[data-theme='light'] .fd1241-layer-menu summary{border-color:#b9cbd3;background:#fff;color:#19313b}html[data-theme='light'] .fd1241-layer-popover{border-color:#c6d5db;background:#fff;box-shadow:0 16px 36px rgba(23,52,65,.16)}
@media(max-width:1050px){.tracking-map-toolbar{align-items:flex-start!important;flex-direction:column!important}.tracking-map-actions{width:100%;flex-wrap:wrap!important}.tracking-legend{top:142px!important}.fd1241-map-style{margin-right:auto}.fd124-time-strip{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
@media(max-width:680px){.tracking-map-actions{display:grid!important;grid-template-columns:1fr 1fr}.fd1241-map-style{grid-column:1/-1;grid-template-columns:1fr}.tracking-map-actions>.tracking-control{width:100%}.tracking-legend{display:none!important}.tracking-profile-card{padding:16px!important}.fd124-time-strip{grid-template-columns:1fr!important}.fd124-altitude-legend{min-width:100%!important}.fd122-profile-wrap{min-height:300px!important}.fd122-profile-svg{min-height:280px!important}}
`;
});

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '1.24.1';"));
await update('src/electron-main.mjs', (source) => source.replaceAll('Flight Deck EFB', 'FLYXORA'));
await update('public/service-worker.js', (source) => source.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flight-deck-efb-v1241-tracking-layout';").replaceAll('?v=1.24.0', '?v=1.24.1'));

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.24.1')) return source;
  const section = `## 1.24.1 — FLYXORA Branding & Tracking UI\n\n- Introduces the new **FLYXORA · Simulation EFB** branding, including the wordmark, app mark and updated Windows product/shortcut names.\n- Keeps the existing technical app ID and local data paths so settings, cached data and flight archives remain available after the update.\n- Modernizes the Live Map header with a compact map-style selector and layer dropdown.\n- Prevents the map legend and map content from visually bleeding behind the flight-data strips.\n- Shows planned and actual Take-off/Landing times directly in the top flight strip and removes the redundant schedule card.\n- Relaxes Flight Profile spacing and improves responsive layout behavior.\n- Publishes the Windows installer as **FLYXORA-Setup-1.24.1.exe** while preserving the existing GitHub updater channel.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  if (source.startsWith('# Flight Deck EFB changelog\n')) {
    return source.replace('# Flight Deck EFB changelog\n', `# FLYXORA changelog\n\n${section}`);
  }
  if (source.startsWith('# FLYXORA changelog\n')) {
    return source.replace('# FLYXORA changelog\n', `# FLYXORA changelog\n\n${section}`);
  }
  return section + source;
});

console.log('FLYXORA 1.24.1 tracking layout materialized.');
