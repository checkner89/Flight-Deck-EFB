import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.22.0') throw new Error(`1.22.0 materializer requires package version 1.22.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => source.replace(/const APP_VERSION = '[^']+';/, "const APP_VERSION = '1.22.0';"));

await update('public/app.js', (source) => {
  if (source.includes('button.dataset.flightId = flight.id;')) return source;
  const anchor = "    button.className = `flight-archive-entry ${flight.status === 'recording' ? 'recording' : ''}${flight.id === trackingSelectedId ? ' active' : ''}`;";
  if (!source.includes(anchor)) throw new Error('1.22.0 archive flight-id anchor missing.');
  return source.replace(anchor, `${anchor}\n    button.dataset.flightId = flight.id;\n    button.dataset.flightStatus = flight.status || '';`);
});

await update('src/flight-recorder.mjs', (source) => {
  let next = source;
  if (!next.includes('const initialPlan = planFromState(state);')) {
    const anchor = '    const flight = flightFromState(state);\n    const routeLabel =';
    if (!next.includes(anchor)) throw new Error('1.22.0 initial plan anchor missing.');
    next = next.replace(anchor, '    const flight = flightFromState(state);\n    const initialPlan = planFromState(state);\n    const routeLabel =');
  }
  if (!next.includes('originalPlan: structuredClone(initialPlan)')) {
    const anchor = '      plan: planFromState(state),';
    if (!next.includes(anchor)) throw new Error('1.22.0 record plan anchor missing.');
    next = next.replace(anchor, "      plan: structuredClone(initialPlan),\n      originalPlan: structuredClone(initialPlan),\n      planHistory: [{ capturedAt: now, plan: structuredClone(initialPlan) }],");
  }
  if (!next.includes('groundEvents: [],')) {
    const anchor = '      automations: [],\n      operations:';
    if (!next.includes(anchor)) throw new Error('1.22.0 ground event record anchor missing.');
    next = next.replace(anchor, '      automations: [],\n      groundEvents: [],\n      operations:');
  }
  if (!next.includes('const previousPlanSignature = JSON.stringify')) {
    const anchor = '    const nextPlan = planFromState(state);';
    if (!next.includes(anchor)) throw new Error('1.22.0 plan history update anchor missing.');
    next = next.replace(anchor, "    const previousPlanSignature = JSON.stringify([record.plan?.source, record.plan?.route, record.plan?.sid, record.plan?.star, record.plan?.waypoints]);\n    const nextPlan = planFromState(state);");
  }
  if (!next.includes('record.planHistory.push({ capturedAt: this.now().toISOString()')) {
    const anchor = "    for (const key of ['source', 'sid', 'star', 'initialAltitude']) {\n      if (nextPlan[key]) record.plan[key] = nextPlan[key];\n    }";
    if (!next.includes(anchor)) throw new Error('1.22.0 plan history persistence anchor missing.');
    next = next.replace(anchor, `${anchor}\n    const currentPlanSignature = JSON.stringify([record.plan?.source, record.plan?.route, record.plan?.sid, record.plan?.star, record.plan?.waypoints]);\n    if (currentPlanSignature !== previousPlanSignature) {\n      record.planHistory = Array.isArray(record.planHistory) ? record.planHistory : [];\n      record.planHistory.push({ capturedAt: this.now().toISOString(), plan: structuredClone(record.plan) });\n      if (record.planHistory.length > 40) record.planHistory.splice(1, record.planHistory.length - 40);\n    }`);
  }
  if (!next.includes('const groundServiceSignature = JSON.stringify')) {
    const anchor = '    const siWeather = state.integrations?.sayIntentions?.weather || {};';
    if (!next.includes(anchor)) throw new Error('1.22.0 ground event update anchor missing.');
    const groundPatch = `    const gsxState = state.integrations?.gsx || {};\n    const rawGroundServices = gsxState.services || gsxState.serviceStates || {};\n    const groundServiceSignature = JSON.stringify([gsxState.status || null, rawGroundServices]);\n    if (groundServiceSignature !== record.source?.groundServiceSignature) {\n      record.source.groundServiceSignature = groundServiceSignature;\n      record.groundEvents = Array.isArray(record.groundEvents) ? record.groundEvents : [];\n      record.groundEvents.push({\n        time: this.now().toISOString(),\n        source: 'gsx',\n        status: text(gsxState.status, 30),\n        services: structuredClone(rawGroundServices),\n      });\n      if (record.groundEvents.length > 160) record.groundEvents.splice(0, record.groundEvents.length - 160);\n    }\n\n`;
    next = next.replace(anchor, groundPatch + anchor);
  }
  return next;
});

await update('public/index.html', (source) => {
  let next = source.replace(/data-app-version="[^"]+"/, 'data-app-version="1.22.0"');
  if (!next.includes('release-1.22.0.css?v=1.22.0')) next = next.replace('</head>', '    <link rel="stylesheet" href="/release-1.22.0.css?v=1.22.0">\n  </head>');
  if (!next.includes('release-1.22.0.js?v=1.22.0')) next = next.replace('</body>', '    <script src="/release-1.22.0.js?v=1.22.0"></script>\n  </body>');
  return next;
});

await update('public/service-worker.js', (source) => {
  let next = source.replace(/const CACHE_NAME = '[^']+';/, "const CACHE_NAME = 'flight-deck-efb-v1220-pilotops1';");
  if (!next.includes("'/release-1.22.0.css?v=1.22.0'")) {
    next = next.replace("  '/manifest.webmanifest',", "  '/release-1.22.0.css?v=1.22.0',\n  '/release-1.22.0.js?v=1.22.0',\n  '/manifest.webmanifest',");
  }
  return next;
});

await update('CHANGELOG.md', (source) => {
  if (source.includes('## 1.22.0')) return source;
  const section = `## 1.22.0 — Flight Analysis, Guided Briefing, Scratchpad & Ground Services\n\n- Rebuilds the flight profile with planned/actual vertical profiles, selectable X-axis, ft/m units, TOC/TOD markers and richer point inspection.\n- Adds altitude-colored flown-route segments, archive route layers and map/profile point synchronization.\n- Preserves the original plan plus bounded plan history in new flight records.\n- Restores a flight-bound drawing scratchpad with pen, text, eraser, undo/redo, templates, pages and image/PDF-print export.\n- Replaces Briefing with a source-aware ten-step preflight workflow, status tracking, compact OFP, weather, fuel, mass/performance documentation and threat summary.\n- Reworks Ground Services around phase-aware turnaround priorities, compact GSX state and manual fallback states.\n- Improves Light Mode contrast with separate semantic accent variables.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  return section + source;
});

console.log('Flight Deck EFB 1.22.0 pilot workflow release materialized.');
