import fs from 'node:fs/promises';

const MARKER = 'FLYXORA 1.24.8 candidate · SI taxi + network traffic + tracking layout';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`1.24.8 candidate updated ${filename}`);
  }
}

await update('src/state-engine.mjs', (source) => {
  let next = source;

  if (!next.includes('routedTaxiContinuationPattern')) {
    const oldPattern = "  const taxiPattern = /\\b(taxi|hold(?:ing)? short|holding point|cross (?:runway|rwy)|line up|continue|proceed|follow)\\b/i;\n  const taxiMessages = candidates.filter((entry) => taxiPattern.test(entry.text));\n  return taxiMessages.at(-1) ?? candidates.at(-1) ?? null;";
    const newPattern = "  const taxiPattern = /\\b(?:taxi(?:way)?|hold(?:ing)? short|holding point|cross (?:runway|rwy)|line up(?: and wait)?)\\b/i;\n  const routedTaxiContinuationPattern = /\\b(?:continue|proceed|follow)\\b[\\s\\S]*\\b(?:via|taxiway|runway|rwy|gate|stand|parking|apron|ramp)\\b/i;\n  const taxiMessages = candidates.filter((entry) => taxiPattern.test(entry.text) || routedTaxiContinuationPattern.test(entry.text));\n  return taxiMessages.at(-1) ?? null;";
    if (!next.includes(oldPattern)) throw new Error('1.24.8 candidate: SI taxi-clearance filter anchor missing.');
    next = next.replace(oldPattern, newPattern);
  }

  if (!next.includes('clearanceId: currentSiClearance?.id ?? null')) {
    const oldExactPath = "      this.#setTaxiPath(path, 'sayintentions', { exact: true });";
    const newExactPath = "      const currentSiClearance = this.state.atc.providerClearances.sayintentions ?? this.state.taxi.clearance;\n      this.#setTaxiPath(path, 'sayintentions', {\n        exact: true,\n        clearanceId: currentSiClearance?.id ?? null,\n        clearanceText: currentSiClearance?.text ?? null,\n      });";
    if (!next.includes(oldExactPath)) throw new Error('1.24.8 candidate: SI exact-path anchor missing.');
    next = next.replace(oldExactPath, newExactPath);
  }

  const transientClear = "    } else if (this.state.taxi.pathSource === 'sayintentions') {\n      this.#setTaxiPath([], null, null);\n    }";
  const airborneClear = "    } else if (this.state.taxi.pathSource === 'sayintentions' && this.state.aircraft?.onGround === false) {\n      // SayIntentions can omit taxi_path in individual flightJSON polls. Keep the last exact\n      // ground route stable and only retire it once the aircraft is actually airborne.\n      this.#setTaxiPath([], null, null);\n    }";
  if (next.includes(transientClear)) next = next.replace(transientClear, airborneClear);
  else if (!next.includes(airborneClear)) throw new Error('1.24.8 candidate: SI transient path persistence anchor missing.');

  if (!next.includes('exactPathMatchesClearance')) {
    const anchor = "    const changed = previous?.provider !== normalizedProvider || previous?.text !== clearance.text;\n    if (changed && this.state.taxi.pathSource === 'clearance-map') this.#setTaxiPath([], null, null);";
    const replacement = "    const changed = previous?.provider !== normalizedProvider || previous?.text !== clearance.text;\n    if (changed && this.state.taxi.pathSource === 'clearance-map') this.#setTaxiPath([], null, null);\n    if (changed && normalizedProvider === 'sayintentions' && this.state.taxi.pathSource === 'sayintentions') {\n      const exactMeta = this.state.taxi.pathMetadata || {};\n      const exactPathMatchesClearance = (clearance.id !== null && exactMeta.clearanceId !== null && exactMeta.clearanceId !== undefined\n        && String(clearance.id) === String(exactMeta.clearanceId))\n        || (exactMeta.clearanceText && exactMeta.clearanceText === clearance.text);\n      if (!exactPathMatchesClearance) this.#setTaxiPath([], null, null);\n    }";
    if (!next.includes(anchor)) throw new Error('1.24.8 candidate: SI clearance/path freshness anchor missing.');
    next = next.replace(anchor, replacement);
  }

  return next;
});

await update('src/taxi-route-planner.mjs', (source) => {
  if (source.includes('1.24.8 candidate arrival-to-gate fallback')) return source;
  const start = source.indexOf('export function deriveTaxiRouteFromClearance(mapData, state) {');
  if (start < 0) throw new Error('1.24.8 candidate: deriveTaxiRouteFromClearance anchor missing.');
  const replacement = `// 1.24.8 candidate arrival-to-gate fallback\nexport function deriveTaxiRouteFromClearance(mapData, state) {\n  const clearanceText = String(state?.taxi?.clearance?.text || '').trim();\n  const parsed = parseTaxiClearance(clearanceText);\n  if (parsed.taxiways.length === 0) {\n    return { routes: [], parsed, error: 'Die Freigabe enthält keine auswertbare Taxiway-Folge.' };\n  }\n\n  const graph = buildTaxiGraph(mapData);\n  if (graph.size < 2) return { routes: [], parsed, error: 'Für diesen Flughafen ist kein routbares Taxiway-Netz verfügbar.' };\n\n  const startPoint = finitePoint(state?.aircraft) ?? finitePoint(state?.gate);\n  const starts = nearestNodes(graph, startPoint, { limit: 3, maxDistanceMeters: 650 });\n  if (starts.length === 0) {\n    return { routes: [], parsed, error: 'Der aktuelle Flugzeugstandort konnte nicht dem Taxiway-Netz zugeordnet werden.' };\n  }\n\n  const gatePoint = finitePoint(state?.gate);\n  const explicitGateDestination = /\\b(?:gate|stand|parking|apron|ramp)\\b/i.test(clearanceText);\n  const taxiInContext = Boolean(gatePoint && !parsed.runway && state?.aircraft?.onGround\n    && (explicitGateDestination || state?.flight?.clearedForLanding || state?.flight?.landingRunway));\n\n  let goals = [];\n  let endPoint = null;\n  let mode = 'departure';\n  if (gatePoint && (explicitGateDestination || taxiInContext)) {\n    mode = 'arrival';\n    endPoint = gatePoint;\n    goals = nearestNodes(graph, gatePoint, { limit: 3, maxDistanceMeters: 650 });\n  } else if (parsed.runway) {\n    goals = runwayAnchorNodes(mapData, graph, parsed.runway);\n  } else {\n    return { routes: [], parsed, error: 'Die Freigabe enthält weder eine Runway noch ein erreichbares Gate-Ziel.' };\n  }\n\n  if (goals.length === 0) {\n    return { routes: [], parsed, mode, error: mode === 'arrival'\n      ? 'Das zugewiesene Gate konnte nicht dem Taxiway-Netz zugeordnet werden.'\n      : 'Die Holding-Position konnte nicht dem Taxiway-Netz zugeordnet werden.' };\n  }\n\n  const routes = routeOptions(graph, starts, goals, {\n    startPoint,\n    endPoint,\n    requiredTaxiways: parsed.taxiways,\n    source: 'clearance-map',\n  });\n  for (const route of routes) {\n    route.label = \`Via \${parsed.taxiways.join(' – ')}\`;\n    route.taxiways = [...parsed.taxiways];\n  }\n  return { routes, parsed, mode, graphNodes: graph.size };\n}\n`;
  return `${source.slice(0, start)}${replacement}`;
});

await update('src/server.mjs', (source) => {
  if (source.includes('scheduleAutomaticSayIntentionsTaxiRoute')) return source;
  const anchor = '  const server = http.createServer(async (request, response) => {';
  if (!source.includes(anchor)) throw new Error('1.24.8 candidate: server auto-taxi insertion anchor missing.');
  const automation = `  // ${MARKER}\n  const automaticTaxiRouteAttempts = new Map();\n  let automaticTaxiRouteTimer = null;\n  let automaticTaxiRoutePendingKey = null;\n  let automaticTaxiRouteAppliedKey = null;\n\n  const scheduleAutomaticSayIntentionsTaxiRoute = (snapshot = engine.publicState()) => {\n    const clearance = snapshot?.taxi?.clearance;\n    const selectedProvider = snapshot?.atc?.selectedProvider || 'auto';\n    if (clearance?.provider !== 'sayintentions' || !['auto', 'sayintentions'].includes(selectedProvider)) return;\n\n    const text = String(clearance.text || '').trim();\n    if (!text) return;\n    const exactMeta = snapshot?.taxi?.pathMetadata || {};\n    const exactMatchesClearance = snapshot?.taxi?.pathSource === 'sayintentions'\n      && (snapshot?.taxi?.path?.length || 0) > 1\n      && ((clearance.id !== null && clearance.id !== undefined && exactMeta.clearanceId !== null && exactMeta.clearanceId !== undefined\n        && String(clearance.id) === String(exactMeta.clearanceId))\n        || (exactMeta.clearanceText && exactMeta.clearanceText === text));\n    if (exactMatchesClearance) return;\n\n    const airport = snapshot?.flight?.currentAirport || snapshot?.flight?.origin || snapshot?.flight?.destination || '';\n    const generation = snapshot?.session?.generation ?? 0;\n    const key = [generation, airport, clearance.id ?? '', text].join('|');\n    if (key === automaticTaxiRouteAppliedKey || key === automaticTaxiRoutePendingKey) return;\n    const lastAttempt = automaticTaxiRouteAttempts.get(key) || 0;\n    if (Date.now() - lastAttempt < 10_000) return;\n\n    clearTimeout(automaticTaxiRouteTimer);\n    automaticTaxiRoutePendingKey = key;\n    automaticTaxiRouteTimer = setTimeout(async () => {\n      automaticTaxiRouteAttempts.set(key, Date.now());\n      try {\n        const current = engine.publicState();\n        const activeClearance = current?.taxi?.clearance;\n        if (activeClearance?.provider !== 'sayintentions' || String(activeClearance.text || '').trim() !== text) return;\n\n        const currentMeta = current?.taxi?.pathMetadata || {};\n        const currentExactMatches = current?.taxi?.pathSource === 'sayintentions'\n          && (current?.taxi?.path?.length || 0) > 1\n          && ((activeClearance.id !== null && activeClearance.id !== undefined && currentMeta.clearanceId !== null && currentMeta.clearanceId !== undefined\n            && String(activeClearance.id) === String(currentMeta.clearanceId))\n            || (currentMeta.clearanceText && currentMeta.clearanceText === text));\n        if (currentExactMatches) {\n          automaticTaxiRouteAppliedKey = key;\n          return;\n        }\n\n        const mapData = await loadCurrentAirportMap();\n        const result = deriveTaxiRouteFromClearance(mapData, current);\n        const route = result.routes?.[0];\n        if (!route) return;\n        const applied = engine.setDerivedTaxiPath(route.path, {\n          provider: 'sayintentions',\n          automatic: true,\n          clearanceId: activeClearance.id ?? null,\n          clearanceText: text,\n          mode: result.mode || null,\n          runway: result.parsed?.runway || null,\n          taxiways: result.parsed?.taxiways || [],\n          label: route.label,\n        });\n        if (applied) {\n          automaticTaxiRouteAppliedKey = key;\n          engine.setIntegration('sayIntentions', {\n            taxiRouteAuto: {\n              status: 'ready',\n              source: 'clearance-map',\n              mode: result.mode || null,\n              updatedAt: new Date().toISOString(),\n              detail: \`Taxi route automatically derived from SayIntentions: \${route.label}\`,\n            },\n          });\n        }\n      } catch (error) {\n        engine.setIntegration('sayIntentions', {\n          taxiRouteAuto: {\n            status: 'waiting',\n            updatedAt: new Date().toISOString(),\n            detail: String(error?.message || error).slice(0, 240),\n          },\n        });\n      } finally {\n        if (automaticTaxiRoutePendingKey === key) automaticTaxiRoutePendingKey = null;\n      }\n    }, 300);\n    automaticTaxiRouteTimer.unref?.();\n  };\n\n  engine.on('change', scheduleAutomaticSayIntentionsTaxiRoute);\n  scheduleAutomaticSayIntentionsTaxiRoute();\n\n`;
  return source.replace(anchor, `${automation}${anchor}`);
});

await update('src/online-network-client.mjs', (source) => {
  let next = source;

  if (!next.includes('pollMs = 15_000')) {
    next = next.replace(
      "  constructor(engine, { fetchImpl = globalThis.fetch, timeoutMs = 10_000, cacheMs = 15_000 } = {}) {",
      "  constructor(engine, { fetchImpl = globalThis.fetch, timeoutMs = 10_000, cacheMs = 15_000, pollMs = 15_000 } = {}) {",
    );
    next = next.replace(
      '    this.cache = new Map();',
      "    this.cache = new Map();\n    this.pollMs = pollMs;\n    this.selected = 'off';\n    this.refreshTimer = null;",
    );
  }

  if (!next.includes('this.#scheduleRefresh();')) {
    const anchor = "    if (!ENDPOINTS[selected]) throw new Error('Unbekanntes Online-Netzwerk.');";
    const replacement = `${anchor}\n    this.selected = selected;\n    this.#scheduleRefresh();`;
    if (!next.includes(anchor)) throw new Error('1.24.8 candidate: online-network refresh anchor missing.');
    next = next.replace(anchor, replacement);
  }

  if (!next.includes('#scheduleRefresh()')) {
    const anchor = '  disable() {';
    const method = `  #scheduleRefresh() {\n    clearTimeout(this.refreshTimer);\n    if (!ENDPOINTS[this.selected]) return;\n    this.refreshTimer = setTimeout(() => {\n      const selected = this.selected;\n      this.refresh(selected).catch((error) => {\n        this.engine.setIntegration('onlineNetworks', {\n          selected,\n          status: 'error',\n          detail: \`\${selected.toUpperCase()} refresh failed: \${error.message}\`,\n        });\n        this.#scheduleRefresh();\n      });\n    }, this.pollMs);\n    this.refreshTimer.unref?.();\n  }\n\n  stop() {\n    this.selected = 'off';\n    clearTimeout(this.refreshTimer);\n    this.refreshTimer = null;\n  }\n\n`;
    if (!next.includes(anchor)) throw new Error('1.24.8 candidate: online-network disable anchor missing.');
    next = next.replace(anchor, `${method}${anchor}`);
  }

  if (!next.includes("this.selected = 'off';\n    clearTimeout(this.refreshTimer);\n    this.engine.setIntegration('onlineNetworks'")) {
    next = next.replace(
      "  disable() {\n    this.engine.setIntegration('onlineNetworks', {",
      "  disable() {\n    this.selected = 'off';\n    clearTimeout(this.refreshTimer);\n    this.refreshTimer = null;\n    this.engine.setIntegration('onlineNetworks', {",
    );
  }

  if (!next.includes('onGround: typeof item.on_ground')) {
    next = next.replace(
      '    heading: numeric(item.heading ?? last.heading),',
      "    heading: numeric(item.heading ?? last.heading),\n    onGround: typeof item.on_ground === 'boolean' ? item.on_ground : typeof item.onGround === 'boolean' ? item.onGround : null,",
    );
  }

  return next;
});

await update('src/server.mjs', (source) => {
  if (source.includes('onlineNetworks.stop();')) return source;
  return source.replace('      aviationWeather.stop();', '      aviationWeather.stop();\n      onlineNetworks.stop();');
});

await update('public/app.js', (source) => {
  let next = source;
  if (!next.includes('function fd1248TrafficEntries(state = {})')) {
    const anchor = 'function trackingTrafficFingerprint(entries = []) {';
    if (!next.includes(anchor)) throw new Error('1.24.8 candidate: tracking Traffic helper anchor missing.');
    const helpers = `// ${MARKER}\nfunction fd1248TrafficEntries(state = {}) {\n  const simEntries = Array.isArray(state?.integrations?.simTraffic?.aircraft)\n    ? state.integrations.simTraffic.aircraft\n    : [];\n  const online = state?.integrations?.onlineNetworks || {};\n  const network = String(online.selected || 'off').trim().toLowerCase();\n  const pilots = ['vatsim', 'ivao'].includes(network) && Array.isArray(online.pilots) ? online.pilots : [];\n  const own = state?.aircraft || {};\n  const ownCallsign = String(state?.flight?.callsign || '').trim().toUpperCase();\n  const ownAltitude = Number(own.altitudeFeet);\n  const merged = new Map();\n\n  const keyFor = (entry, fallback) => {\n    const callsign = String(entry?.callsign || entry?.atcId || '').trim().toUpperCase();\n    return callsign ? \`CALL:\${callsign}\` : fallback;\n  };\n\n  simEntries.forEach((entry, index) => {\n    const callsign = String(entry?.callsign || entry?.atcId || '').trim().toUpperCase();\n    if (ownCallsign && callsign === ownCallsign) return;\n    const key = keyFor(entry, \`SIM:\${entry?.objectId ?? entry?.id ?? index}\`);\n    merged.set(key, { ...entry, trafficSource: entry.trafficSource || 'simconnect' });\n  });\n\n  pilots.forEach((pilot, index) => {\n    const callsign = String(pilot?.callsign || '').trim().toUpperCase();\n    if (!callsign || (ownCallsign && callsign === ownCallsign)) return;\n    const groundSpeed = Number(pilot.groundSpeedKnots ?? pilot.groundSpeed);\n    const altitudeFeet = Number(pilot.altitudeFeet);\n    const inferredOnGround = typeof pilot.onGround === 'boolean'\n      ? pilot.onGround\n      : Boolean(own.onGround && Number.isFinite(groundSpeed) && groundSpeed <= 55\n        && Number.isFinite(altitudeFeet) && Number.isFinite(ownAltitude)\n        && Math.abs(altitudeFeet - ownAltitude) <= 600);\n    const networkEntry = {\n      ...pilot,\n      id: \`NET:\${network}:\${callsign || index}\`,\n      callsign,\n      atcId: callsign,\n      aircraftType: pilot.aircraftType || pilot.aircraft || null,\n      origin: pilot.origin || pilot.departure || null,\n      destination: pilot.destination || pilot.arrival || null,\n      groundSpeed: Number.isFinite(groundSpeed) ? groundSpeed : null,\n      onGround: inferredOnGround,\n      network,\n      trafficSource: network,\n    };\n    const key = keyFor(networkEntry, \`NET:\${network}:\${index}\`);\n    const simEntry = merged.get(key);\n    if (!simEntry) {\n      merged.set(key, networkEntry);\n      return;\n    }\n    merged.set(key, {\n      ...networkEntry,\n      ...simEntry,\n      aircraftType: simEntry.aircraftType || simEntry.typeDesignator || networkEntry.aircraftType,\n      origin: simEntry.origin || networkEntry.origin,\n      destination: simEntry.destination || networkEntry.destination,\n      network,\n      trafficSource: \`\${simEntry.trafficSource || 'simconnect'}+\${network}\`,\n    });\n  });\n\n  const values = [...merged.values()];\n  if (Number.isFinite(Number(own.lat)) && Number.isFinite(Number(own.lon))) {\n    values.sort((left, right) => {\n      const leftPoint = { lat: Number(left.lat ?? left.latitude), lon: Number(left.lon ?? left.longitude) };\n      const rightPoint = { lat: Number(right.lat ?? right.latitude), lon: Number(right.lon ?? right.longitude) };\n      const leftDistance = Number.isFinite(leftPoint.lat) && Number.isFinite(leftPoint.lon) ? approximateDistanceMeters(own, leftPoint) : Infinity;\n      const rightDistance = Number.isFinite(rightPoint.lat) && Number.isFinite(rightPoint.lon) ? approximateDistanceMeters(own, rightPoint) : Infinity;\n      return leftDistance - rightDistance;\n    });\n  }\n  return values.slice(0, 160);\n}\n\nfunction trackingRouteContext1248(record) {\n  const flight = record?.flight || {};\n  const plan = record?.plan || {};\n  const originalPlan = record?.originalPlan || record?.planOriginal || {};\n  const liveFlight = latestState?.flight || {};\n  const waypoints = (Array.isArray(originalPlan.waypoints) ? originalPlan.waypoints : Array.isArray(plan.waypoints) ? plan.waypoints : [])\n    .map((entry) => String(entry?.ident || entry?.name || '').trim().toUpperCase())\n    .filter(Boolean)\n    .slice(0, 40)\n    .join(' ');\n  const routeText = String(originalPlan.route || plan.route || flight.route || liveFlight.flightPlanRoute || waypoints || '').trim() || '—';\n  const departureRunway = flight.departureRunway || liveFlight.departureRunway;\n  const arrivalRunway = flight.arrivalRunway || liveFlight.arrivalRunway;\n  const sid = plan.sid || originalPlan.sid || liveFlight.sid;\n  const star = plan.star || originalPlan.star || liveFlight.star;\n  const departure = [departureRunway ? \`RWY \${departureRunway}\` : null, sid ? \`SID \${sid}\` : null].filter(Boolean).join(' · ') || '—';\n  const arrival = [arrivalRunway ? \`RWY \${arrivalRunway}\` : null, star ? \`STAR \${star}\` : null].filter(Boolean).join(' · ') || '—';\n  return \`<span class="fd1248-route-main" title="\${escapeHtml(routeText)}"><small>ROUTE</small><b>\${escapeHtml(routeText)}</b></span><div class="fd1248-route-endpoints"><span><small>DEP</small> \${escapeHtml(departure)}</span><span><small>ARR</small> \${escapeHtml(arrival)}</span></div>\`;\n}\n\n`;
    next = next.replace(anchor, `${helpers}${anchor}`);
  }

  const simOnlyEntries = "  const entries = Array.isArray(state?.integrations?.simTraffic?.aircraft) ? state.integrations.simTraffic.aircraft.slice(0, 120) : [];";
  if (next.includes(simOnlyEntries)) {
    next = next.replace(simOnlyEntries, '  const entries = fd1248TrafficEntries(state).slice(0, 120);');
  } else if (!next.includes('const entries = fd1248TrafficEntries(state).slice(0, 120);')) {
    throw new Error('1.24.8 candidate: tracking Traffic source replacement anchor missing.');
  }

  if (next.includes('route.innerHTML = trackingRouteContext(record);')) {
    next = next.replace('route.innerHTML = trackingRouteContext(record);', 'route.innerHTML = trackingRouteContext1248(record);');
  } else if (!next.includes('route.innerHTML = trackingRouteContext1248(record);')) {
    throw new Error('1.24.8 candidate: tracking route-context renderer anchor missing.');
  }

  return next;
});

await update('public/release-1.22.0.js', (source) => source
  .replace(/<div class="fd122-layer-note">Keine geplanten Profildaten verfügbar · tatsächlicher Flug bleibt vollständig sichtbar\.<\/div>/g, ''));

await update('public/release-1.24.7.css', (source) => {
  if (source.includes('1.24.8 candidate · route context + profile alignment')) return source;
  return `${source}\n\n/* 1.24.8 candidate · route context + profile alignment */\n.tracking-flight-strip > div.fd1242-wide-context { min-width: 300px !important; }\n.fd1242-route-context {\n  display: grid !important;\n  grid-template-rows: minmax(0, auto) minmax(0, auto);\n  gap: 5px !important;\n  min-width: 0 !important;\n  overflow: hidden !important;\n}\n.fd1248-route-main {\n  display: grid !important;\n  grid-template-columns: auto minmax(0, 1fr);\n  align-items: baseline;\n  gap: 6px;\n  min-width: 0;\n}\n.fd1248-route-main b {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 11px;\n  font-weight: 850;\n}\n.fd1248-route-endpoints {\n  display: grid !important;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);\n  gap: 10px;\n  min-width: 0;\n}\n.fd1248-route-endpoints > span {\n  display: block !important;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.tracking-profile-metrics {\n  padding-left: 0 !important;\n  padding-right: 0 !important;\n}\n.tracking-profile-card .fd122-layer-note { display: none !important; }\n\n@media (min-width: 1120px) {\n  .tracking-flight-strip {\n    grid-template-columns: minmax(90px, .7fr) minmax(105px, .8fr) minmax(300px, 2.35fr) minmax(88px, .65fr) repeat(4, minmax(108px, .82fr)) !important;\n  }\n}\n`;
});

console.log('FLYXORA 1.24.8 candidate materialized: automatic SI taxi routing, VATSIM/IVAO Traffic merge, route context and Flight Profile polish.');
