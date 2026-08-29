import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.20.8');

if (version !== '1.20.8') throw new Error(`1.20.8 release materializer requires package version 1.20.8, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`1.20.8 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

await update('src/server.mjs', (source) => source.replace(/^const APP_VERSION = '[^']+';$/m, `const APP_VERSION = '${version}';`));

await update('src/simbrief-client.mjs', (source) => {
  let js = source;
  if (!js.includes("url.searchParams.set('_fd_refresh'")) {
    js = replaceRequired(js, "    url.searchParams.set('json', 'v2');", "    url.searchParams.set('json', 'v2');\n    // Force a fresh lookup of the latest *generated* OFP instead of reusing an intermediary cache.\n    url.searchParams.set('_fd_refresh', String(Date.now()));", 'SimBrief cache buster');
  }
  if (!js.includes("cache: 'no-store'")) {
    js = replaceRequired(js, "    const response = await this.fetchImpl(url, {\n      headers:", "    const response = await this.fetchImpl(url, {\n      cache: 'no-store',\n      headers:", 'SimBrief no-store fetch');
  }
  return js;
});

await update('src/state-engine.mjs', (source) => {
  let js = source.replace(
    "detail: flight ? `${flight.origin || '—'} → ${flight.destination || '—'} automatisch ergänzt` : 'Kein gültiger OFP gefunden',",
    "detail: flight ? `${flight.origin || '—'} → ${flight.destination || '—'} · SimBrief OFP importiert` : 'Kein gültiger OFP gefunden',",
  );
  const oldBlock = `      this.state.flight = {\n        ...this.state.flight,\n        callsign: this.state.flight.callsign || flight.callsign || null,\n        origin: this.state.flight.origin || flight.origin || null,\n        destination: this.state.flight.destination || flight.destination || null,\n        originPosition: this.state.flight.originPosition || flight.originPosition || null,\n        destinationPosition: this.state.flight.destinationPosition || flight.destinationPosition || null,\n        departureRunway: this.state.flight.departureRunway || flight.departureRunway || null,\n        arrivalRunway: this.state.flight.arrivalRunway || flight.arrivalRunway || null,\n        sid: this.state.flight.sid || flight.sid || null,\n        star: this.state.flight.star || flight.star || null,\n        flightPlanRoute: this.state.flight.flightPlanRoute || flight.route || null,\n      };`;
  const newBlock = `      // An explicit SimBrief import is authoritative for the planned flight. Live-only\n      // state (current airport, phase, clearances, etc.) stays intact through the spread.\n      this.state.flight = {\n        ...this.state.flight,\n        callsign: flight.callsign || this.state.flight.callsign || null,\n        origin: flight.origin || this.state.flight.origin || null,\n        destination: flight.destination || this.state.flight.destination || null,\n        originPosition: flight.originPosition || this.state.flight.originPosition || null,\n        destinationPosition: flight.destinationPosition || this.state.flight.destinationPosition || null,\n        departureRunway: flight.departureRunway || this.state.flight.departureRunway || null,\n        arrivalRunway: flight.arrivalRunway || this.state.flight.arrivalRunway || null,\n        sid: flight.sid || this.state.flight.sid || null,\n        star: flight.star || this.state.flight.star || null,\n        flightPlanRoute: flight.route || this.state.flight.flightPlanRoute || null,\n      };`;
  if (js.includes(oldBlock)) js = js.replace(oldBlock, newBlock);
  else if (!js.includes('An explicit SimBrief import is authoritative for the planned flight.')) throw new Error('1.20.8 patch anchor missing: SimBrief state priority');
  return js;
});

await update('public/flight-overlay.js', (source) => {
  let js = source;
  js = js.replace(
    "  const origin = normalizedIcao(flight.origin || plan.origin);\n  const destination = normalizedIcao(flight.destination || plan.destination || state.planning?.selectedAirport?.icao);",
    "  const hasSimBriefPlan = Boolean(state.integrations?.simbrief?.imported && plan.origin && plan.destination);\n  const origin = normalizedIcao((hasSimBriefPlan ? plan.origin : null) || flight.origin);\n  const destination = normalizedIcao((hasSimBriefPlan ? plan.destination : null) || flight.destination || state.planning?.selectedAirport?.icao);",
  );
  js = js.replace(
    "  const departureRunway = flight.departureRunway || plan.departureRunway;\n  const arrivalRunway = flight.arrivalRunway || plan.arrivalRunway;",
    "  const departureRunway = (hasSimBriefPlan ? plan.departureRunway : null) || flight.departureRunway;\n  const arrivalRunway = (hasSimBriefPlan ? plan.arrivalRunway : null) || flight.arrivalRunway;",
  );
  js = js.replace(
    "  const callsign = flight.callsign || plan.callsign || overlayValue('#home-callsign', '—');",
    "  const callsign = (hasSimBriefPlan ? plan.callsign : null) || flight.callsign || overlayValue('#home-callsign', '—');",
  );
  return js;
});

await update('public/documents-workspace.js', (source) => {
  let js = source;
  js = js.replace(
    "  const origin = safe(flight.origin || plan.origin);\n  const destination = safe(flight.destination || plan.destination);\n  const callsign = safe(flight.callsign || plan.callsign);",
    "  const origin = safe(plan.origin || flight.origin);\n  const destination = safe(plan.destination || flight.destination);\n  const callsign = safe(plan.callsign || flight.callsign);",
  );
  js = js.replace(
    "  const runway = airborne ? (flight.arrivalRunway || plan.arrivalRunway || flight.departureRunway || plan.departureRunway) : (flight.departureRunway || plan.departureRunway || flight.arrivalRunway || plan.arrivalRunway);",
    "  const runway = airborne ? (plan.arrivalRunway || flight.arrivalRunway || plan.departureRunway || flight.departureRunway) : (plan.departureRunway || flight.departureRunway || plan.arrivalRunway || flight.arrivalRunway);",
  );
  js = js.replace(
    "    setStatus('SimBrief OFP imported. Briefing documents are ready for annotation.', 'success');",
    "    const imported = currentPlan();\n    setStatus(`SimBrief OFP ${safe(imported.origin)} → ${safe(imported.destination)} imported · latest generated plan.`, 'success');",
  );
  return js;
});

await update('public/app.js', (source) => {
  let app = source;
  if (!app.includes("button.dataset.flightId = flight.id;")) {
    const anchor = "    const button = document.createElement('button');\n    button.type = 'button';\n    button.className = `flight-archive-entry";
    const replacement = "    const button = document.createElement('button');\n    button.type = 'button';\n    button.dataset.flightId = flight.id;\n    button.className = `flight-archive-entry";
    app = replaceRequired(app, anchor, replacement, 'archive flight id');
  }

  if (!app.includes('function airportDiagramBounds(mapData)')) {
    const helper = `function airportDiagramBounds(mapData) {\n  const centerLat = Number(mapData?.center?.lat);\n  const centerLon = Number(mapData?.center?.lon);\n  const points = [];\n  const relevant = new Set(['aerodrome','runway','taxiway','apron','terminal','building','gate','stand','parking']);\n  const visit = (value) => {\n    if (!Array.isArray(value)) return;\n    if (value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {\n      const lat = Number(value[0]); const lon = Number(value[1]);\n      const near = !Number.isFinite(centerLat) || !Number.isFinite(centerLon) || (Math.abs(lat - centerLat) < 0.30 && Math.abs(lon - centerLon) < 0.45);\n      if (near && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) points.push([lat, lon]);\n      return;\n    }\n    value.forEach(visit);\n  };\n  for (const feature of mapData?.features || []) {\n    if (!feature?.graphOnly && relevant.has(feature.kind)) visit(feature.coordinates);\n  }\n  if (points.length >= 4) return L.latLngBounds(points).pad(0.08);\n  return Array.isArray(mapData?.bounds) ? L.latLngBounds(mapData.bounds) : null;\n}\n\n`;
    app = replaceRequired(app, 'function syncAirportFocusButton() {', `${helper}function syncAirportFocusButton() {`, 'airport diagram bounds helper');
  }
  app = app.replace("  taxiBasemap.setOpacity(airportFocusEnabled ? 0.58 : 0.78);", "  taxiBasemap.setOpacity(airportFocusEnabled ? 0.07 : 0.72);");
  app = app.replace("    runwayOutline: '#536a78', runway: '#6f818c', runwayCenter: '#f7fafb', taxiOutline: '#7f919a',\n    taxi: '#aab8c0', taxiCenter: '#9b7a00',", "    runwayOutline: '#17232b', runway: '#303a42', runwayCenter: '#edf2f4', taxiOutline: '#a3afb5',\n    taxi: '#d8e0e4', taxiCenter: '#d4b900',");
  app = app.replace("    runwayOutline: '#d9dee3', runway: '#323b49', runwayCenter: '#f5f6f7', taxiOutline: '#657184',\n    taxi: '#2d3948', taxiCenter: '#dbc95e',", "    runwayOutline: '#dce2e7', runway: '#242e37', runwayCenter: '#f5f6f7', taxiOutline: '#596675',\n    taxi: '#35414c', taxiCenter: '#e0c719',");
  app = app.replace("  latestAirportBounds = Array.isArray(mapData.bounds) ? L.latLngBounds(mapData.bounds) : null;", "  latestAirportBounds = airportDiagramBounds(mapData);");
  app = app.replaceAll("maxZoom: 15.5", "maxZoom: 17.2");
  return app;
});

await update('public/index.html', (source) => {
  let html = source;
  html = html.replace(/\s*<p>Flight Deck EFB erkennt den aktiven Flug automatisch über SayIntentions und MSFS\. SimBrief wird nur optional ergänzt, wenn bereits eine Kennung gespeichert ist\.<\/p>/g, '');
  html = html.replace(/\s*<div class="auto-flight-detection"><i><\/i><span><strong>AUTOMATISCHE FLUGERKENNUNG<\/strong><small>Keine Pilot-ID erforderlich<\/small><\/span><\/div>/g, '');
  html = html.replace(/\s*<div class="auto-flight-detection compact"><i><\/i><span><strong>AUTOMATISCHE FLUGERKENNUNG<\/strong><small>SayIntentions \/ MSFS · SimBrief optional im Hintergrund<\/small><\/span><\/div>/g, '');
  html = html.replace(/\s*<link[^>]+release-1\.20\.8\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/release-1.20.8.css?v=${version}">\n  </head>`);
  html = html.replace(/\s*<script[^>]+release-1\.20\.8\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace('</body>', `    <script type="module" src="/release-1.20.8.js?v=${version}"></script>\n  </body>`);
  html = html.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v1208-flightops1';");
  if (!sw.includes("'/release-1.20.8.css?v=1.20.8'")) {
    sw = sw.replace("  '/manifest.webmanifest',", "  '/release-1.20.8.css?v=1.20.8',\n  '/release-1.20.8.js?v=1.20.8',\n  '/manifest.webmanifest',");
  }
  return sw;
});

const changelogPath = path.join(root, 'CHANGELOG.md');
const notesPath = path.join(root, 'release-notes', '1.20.8.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.20\.8\b/m.test(changelog)) {
  const notes = (await fs.readFile(notesPath, 'utf8')).trim();
  const withoutDisclaimer = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${withoutDisclaimer}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log('Flight Deck EFB 1.20.8 flight-ops, SimBrief, Taxi, archive and news refinements materialized.');
