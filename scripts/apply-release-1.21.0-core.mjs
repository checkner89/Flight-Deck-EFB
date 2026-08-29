import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 core materializer requires package version 1.21.0, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`1.21.0 core anchor missing: ${label}`);
  return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim().slice(0, 96))) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.21.0 core range missing: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

await update('src/state-engine.mjs', (source) => {
  let next = source;
  next = next.replace(
    "  attentionMeters: 20,\n  offRouteMeters: 35,\n  warningDelayMs: 2_500,",
    "  attentionMeters: 32,\n  offRouteMeters: 58,\n  warningDelayMs: 6_000,",
  );

  const classifier = String.raw`function findCurrentClearance(comms) {
  if (!Array.isArray(comms)) return null;
  const candidates = comms
    .map((entry) => ({
      id: numberOrNull(entry.id),
      text: textOrEmpty(
        entry.outgoing_message_english,
        entry.outgoing_message,
        entry.atc_message_english,
        entry.atc_message,
        entry.response_english,
        entry.response,
        entry.message_english,
        entry.message,
        entry.text,
      ),
      station: textOrEmpty(entry.station_name, entry.station, entry.ident),
      time: firstDefined(entry.stamp_zulu, null),
    }))
    .filter((entry) => entry.text);

  const taxiPositive = /\b(?:taxi(?:ing)?(?:\s+to)?|hold(?:ing)? short|holding point|cross (?:runway|rwy)|continue taxi|proceed via|follow (?:the )?(?:taxiway|taxi route|traffic)|take (?:the )?(?:next |first |second )?exit|exit (?:via|at)|via taxiway|taxiways? [A-Z0-9])\b/i;
  const nonTaxi = /\b(?:cleared (?:for )?(?:takeoff|landing)|contact |monitor |frequency|climb|descend|maintain|turn (?:left|right)|heading|altitude|traffic (?:in sight|advisory)|pushback approved|startup approved)\b/i;
  return candidates.filter((entry) => taxiPositive.test(entry.text) && !nonTaxi.test(entry.text)).at(-1) ?? null;
}

`;
  next = replaceBetween(next, 'function findCurrentClearance(comms) {', 'function extractRunwayFromClearance(text) {', classifier, 'taxi clearance classifier');

  if (!next.includes("routes: { departure: null, arrival: null }")) {
    next = replaceRequired(next,
      "        pathMetadata: null,\n        clearance: null,",
      "        pathMetadata: null,\n        routes: { departure: null, arrival: null },\n        clearance: null,",
      'taxi route slots');
  }

  const plannedPath = `  setPlannedTaxiPath(value, metadata = {}) {
    if (EXACT_PATH_SOURCES.has(this.state.taxi.pathSource) && this.state.taxi.path.length > 1) return false;
    const path = normalizeTaxiPath(value);
    if (path.length < 2) return false;
    const mode = metadata.mode === 'arrival' ? 'arrival' : metadata.mode === 'departure' ? 'departure' : null;
    const routeMetadata = { ...metadata, mode, airport: textOrEmpty(metadata.airport, this.state.planning?.selectedAirport?.icao) || null };
    this.#setTaxiPath(path, metadata.source || 'manual', routeMetadata);
    if (!this.state.taxi.routes) this.state.taxi.routes = { departure: null, arrival: null };
    if (mode) {
      this.state.taxi.routes[mode] = {
        path: structuredClone(path),
        metadata: structuredClone(routeMetadata),
        updatedAt: new Date().toISOString(),
      };
    }
    this.state.planning.active = true;
    this.#refreshHoldShorts();
    this.#updateGuidance();
    this.#touch();
    return true;
  }

`;
  next = replaceBetween(next, '  setPlannedTaxiPath(value, metadata = {}) {', '  clearPlannedTaxiPath(', plannedPath, 'separate taxi routes');

  if (!next.includes('const maneuvering = taxiSpeed < 3.5')) {
    next = replaceRequired(next,
      "    let status = 'on-route';\n    if (deviation > this.thresholds.offRouteMeters) status = 'off-route';\n    else if (deviation > this.thresholds.attentionMeters) status = 'attention';",
      "    const taxiSpeed = Math.max(0, Number(aircraft.groundSpeed || 0));\n    const maneuvering = taxiSpeed < 3.5 || aircraft.parkingBrake === true;\n    let status = 'on-route';\n    if (!maneuvering && deviation > this.thresholds.offRouteMeters) status = 'off-route';\n    else if (!maneuvering && deviation > this.thresholds.attentionMeters) status = 'attention';",
      'maneuvering-aware guidance');
  }
  next = next.replace(
    "    const warning = status === 'off-route'\n      && Date.now() - this.offRouteSince >= this.thresholds.warningDelayMs;",
    "    const warning = status === 'off-route'\n      && !maneuvering\n      && Date.now() - this.offRouteSince >= this.thresholds.warningDelayMs;",
  );
  return next;
});

await update('src/ground-safety-engine.mjs', (source) => {
  let next = source;
  if (!next.includes('function isOwnshipTraffic(traffic, aircraft)')) {
    const helper = `function normalizedIdentity(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isOwnshipTraffic(traffic, aircraft) {
  if (!traffic || !aircraft) return false;
  const ownIds = [aircraft.callsign, aircraft.atcId, aircraft.registration, aircraft.tailNumber].map(normalizedIdentity).filter(Boolean);
  const targetIds = [traffic.callsign, traffic.atcId, traffic.registration, traffic.tailNumber].map(normalizedIdentity).filter(Boolean);
  if (ownIds.some((value) => targetIds.includes(value))) return true;
  if (!Number.isFinite(Number(traffic.lat)) || !Number.isFinite(Number(traffic.lon))) return false;
  const distance = distanceMeters(aircraft, traffic);
  const altitudeDelta = Math.abs(finite(traffic.altitudeFeet ?? traffic.altitude, 0) - finite(aircraft.altitudeFeet ?? aircraft.altitude, 0));
  const speedDelta = Math.abs(finite(traffic.groundSpeed, 0) - finite(aircraft.groundSpeed, 0));
  return distance < 90 && altitudeDelta < 180 && speedDelta < 15;
}

`;
    next = replaceRequired(next, "function authorizedRunwayMovement(clearance = '', flight = {}) {", helper + "function authorizedRunwayMovement(clearance = '', flight = {}) {", 'ownship helper');
  }
  next = next.replace(
    "  for (const traffic of state?.integrations?.simTraffic?.aircraft || []) {\n    if (!traffic?.onGround) continue;",
    "  for (const traffic of state?.integrations?.simTraffic?.aircraft || []) {\n    if (!traffic?.onGround || isOwnshipTraffic(traffic, aircraft)) continue;",
  );
  return next;
});

await update('src/taxi-route-planner.mjs', (source) => {
  let next = source;
  if (!next.includes('function runwayExitAnchor(mapData, runway, exitRef)')) {
    const helper = `function runwayExitAnchor(mapData, runway, exitRef) {
  const wanted = String(exitRef ?? '').trim().toUpperCase();
  if (!wanted) return null;
  const lines = runwayLines(mapData, runway);
  if (!lines.length) return null;
  let best = null;
  for (const feature of mapData?.features ?? []) {
    if (feature.kind !== 'taxiway' || !refParts(feature.ref).includes(wanted)) continue;
    for (const point of feature.coordinates.map(finitePoint).filter(Boolean)) {
      const runwayDistance = distanceToLines(point, lines);
      if (runwayDistance > 220) continue;
      if (!best || runwayDistance < best.runwayDistance) best = { point, runwayDistance };
    }
  }
  return best?.point || null;
}

`;
    next = replaceRequired(next, 'function departureHoldingPoints(mapData, graph, runway) {', helper + 'function departureHoldingPoints(mapData, graph, runway) {', 'runway exit anchor');
  }
  if (!next.includes('const selectedExit = runwayExitAnchor(mapData, runway, request.runwayExit);')) {
    next = replaceRequired(next,
      "  } else if (mode === 'arrival') {\n    starts = runwayAnchorNodes(mapData, graph, runway);\n    endPoint = featureAnchor(mapData, request.destination);",
      "  } else if (mode === 'arrival') {\n    const selectedExit = runwayExitAnchor(mapData, runway, request.runwayExit);\n    starts = selectedExit\n      ? nearestNodes(graph, selectedExit, { limit: 2, maxDistanceMeters: 180 })\n      : runwayAnchorNodes(mapData, graph, runway);\n    startPoint = selectedExit;\n    endPoint = featureAnchor(mapData, request.destination);",
      'arrival runway exit routing');
  }
  return next;
});

await update('src/flight-recorder.mjs', (source) => {
  let next = source;
  if (!next.includes('this.parkedSince = null;')) {
    next = replaceRequired(next, '    this.flushTimer = null;\n    this.queue = Promise.resolve();', '    this.flushTimer = null;\n    this.parkedSince = null;\n    this.queue = Promise.resolve();', 'parked timer');
  }
  if (!next.includes('const sameRoute = Boolean(this.active.flight?.origin')) {
    next = replaceRequired(next,
      "      const identityChanged = activeIdentity && identity && activeIdentity !== identity;",
      "      const incomingFlight = flightFromState(state);\n      const sameRoute = Boolean(this.active.flight?.origin && this.active.flight?.destination\n        && incomingFlight.origin === this.active.flight.origin\n        && incomingFlight.destination === this.active.flight.destination);\n      const identityChanged = activeIdentity && identity && activeIdentity !== identity && !sameRoute;",
      'flight identity stability');
  }
  if (!next.includes('this.active.taxiRoutes = structuredClone')) {
    next = replaceRequired(next,
      "    this.active.updatedAt = timestamp;\n    this.active.stats = calculateStats(this.active);",
      "    this.active.updatedAt = timestamp;\n    this.active.taxiRoutes = structuredClone(state.taxi?.routes || this.active.taxiRoutes || { departure: null, arrival: null });\n    this.active.stats = calculateStats(this.active);",
      'taxi route capture');
  }
  const oldParked = `    const landedForMs = this.active.stats.landedAt ? now.getTime() - Date.parse(this.active.stats.landedAt) : 0;
    const parkedAfterFlight = this.active.stats.takeoffAt
      && landedForMs >= 60_000
      && state.aircraft.onGround
      && speed < 1
      && state.aircraft.parkingBrake === true
      && state.aircraft.enginesRunning === false;
    if (parkedAfterFlight) await this.#finalizeInternal('parked-after-landing');`;
  const newParked = `    const landedForMs = this.active.stats.landedAt ? now.getTime() - Date.parse(this.active.stats.landedAt) : 0;
    const hasParkingContext = Boolean(state.gate?.name || state.taxi?.pathMetadata?.destination?.name || state.flight?.currentAirport);
    const parkedSignal = Boolean(this.active.stats.takeoffAt)
      && landedForMs >= 60_000
      && state.aircraft.onGround
      && speed < 2
      && state.aircraft.enginesRunning === false
      && (state.aircraft.parkingBrake === true || hasParkingContext);
    if (parkedSignal) this.parkedSince ??= now.getTime();
    else this.parkedSince = null;
    const stableParkedForMs = this.parkedSince ? now.getTime() - this.parkedSince : 0;
    const finishAtGate = parkedSignal && hasParkingContext && stableParkedForMs >= 60_000;
    const finishWithoutGate = parkedSignal && stableParkedForMs >= 180_000;
    if (finishAtGate || finishWithoutGate) {
      this.parkedSince = null;
      await this.#finalizeInternal(finishAtGate ? 'stable-parked-at-gate' : 'stable-parked-after-flight');
    }`;
  if (next.includes(oldParked)) next = next.replace(oldParked, newParked);
  if (!next.includes('taxiRoutes: structuredClone(state.taxi?.routes')) {
    next = replaceRequired(next,
      '      operations: operationsFromState(state),',
      "      operations: operationsFromState(state),\n      taxiRoutes: structuredClone(state.taxi?.routes || { departure: null, arrival: null }),",
      'taxi routes in record');
  }
  next = next.replace(
    "    this.active = null;\n    return saved;",
    "    this.active = null;\n    this.parkedSince = null;\n    return saved;",
  );
  return next;
});

console.log('Flight Deck EFB 1.21.0 flight/taxi core materialized.');
