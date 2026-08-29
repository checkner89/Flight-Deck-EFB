import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '1.21.0');
if (version !== '1.21.0') throw new Error(`1.21.0 materializer requires package version 1.21.0, got ${version}.`);

async function update(relativePath, transform) {
  const filename = path.join(root, relativePath);
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`1.21.0 patch anchor missing: ${label}`);
  return source.replace(from, to);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement.trim().slice(0, 100))) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.21.0 patch range missing: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

// Taxi/ATC state quality: only actual taxi instructions become taxi clearances;
// guidance waits for a sustained, meaningful deviation and keeps separate
// departure/arrival routes for tracking and archive replay.
await update('src/state-engine.mjs', (source) => {
  let next = source;
  next = next.replace(
    "  attentionMeters: 20,\n  offRouteMeters: 35,\n  warningDelayMs: 2_500,",
    "  attentionMeters: 32,\n  offRouteMeters: 58,\n  warningDelayMs: 6_000,",
  );

  const clearanceFunction = `function findCurrentClearance(comms) {
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

  const taxiPositive = /\\b(?:taxi(?:ing)?(?:\\s+to)?|hold(?:ing)? short|holding point|cross (?:runway|rwy)|continue taxi|proceed via|follow (?:the )?(?:taxiway|taxi route|traffic)|take (?:the )?(?:next |first |second )?exit|exit (?:via|at)|via taxiway|taxiways? [A-Z0-9])\\b/i;
  const nonTaxi = /\\b(?:cleared (?:for )?(?:takeoff|landing)|contact |monitor |frequency|climb|descend|maintain|turn (?:left|right)|heading|altitude|traffic (?:in sight|advisory)|pushback approved|startup approved)\\b/i;
  return candidates.filter((entry) => taxiPositive.test(entry.text) && !nonTaxi.test(entry.text)).at(-1) ?? null;
}

`;
  next = replaceBetween(next, 'function findCurrentClearance(comms) {', 'function extractRunwayFromClearance(text) {', clearanceFunction, 'taxi clearance classifier');

  if (!next.includes("routes: { departure: null, arrival: null }")) {
    next = replaceRequired(next,
      "        pathMetadata: null,\n        clearance: null,",
      "        pathMetadata: null,\n        routes: { departure: null, arrival: null },\n        clearance: null,",
      'taxi route slots');
  }

  const plannedPathFunction = `  setPlannedTaxiPath(value, metadata = {}) {
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
  next = replaceBetween(next, '  setPlannedTaxiPath(value, metadata = {}) {', '  clearPlannedTaxiPath(', plannedPathFunction, 'separate departure/arrival taxi routes');

  next = next.replace(
    "    let status = 'on-route';\n    if (deviation > this.thresholds.offRouteMeters) status = 'off-route';\n    else if (deviation > this.thresholds.attentionMeters) status = 'attention';",
    "    const taxiSpeed = Math.max(0, Number(aircraft.groundSpeed || 0));\n    const maneuvering = taxiSpeed < 3.5 || aircraft.parkingBrake === true;\n    let status = 'on-route';\n    if (!maneuvering && deviation > this.thresholds.offRouteMeters) status = 'off-route';\n    else if (!maneuvering && deviation > this.thresholds.attentionMeters) status = 'attention';",
  );
  next = next.replace(
    "    const warning = status === 'off-route'\n      && Date.now() - this.offRouteSince >= this.thresholds.warningDelayMs;",
    "    const warning = status === 'off-route'\n      && !maneuvering\n      && Date.now() - this.offRouteSince >= this.thresholds.warningDelayMs;",
  );
  return next;
});

// Ownship must never be treated as ground traffic, even if SimConnect exposes it
// once through the traffic list with a different callsign.
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
    next = replaceRequired(next, 'function authorizedRunwayMovement(clearance = \'\', flight = {}) {', helper + 'function authorizedRunwayMovement(clearance = \'\', flight = {}) {', 'ownship traffic helper');
  }
  next = next.replace(
    "  for (const traffic of state?.integrations?.simTraffic?.aircraft || []) {\n    if (!traffic?.onGround) continue;",
    "  for (const traffic of state?.integrations?.simTraffic?.aircraft || []) {\n    if (!traffic?.onGround || isOwnshipTraffic(traffic, aircraft)) continue;",
  );
  return next;
});

// Arrival runway exit support: an explicitly selected taxiway near the runway
// becomes the route start. Unknown exit keeps the existing auto anchor behavior.
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
  next = next.replace(
    "  } else if (mode === 'arrival') {\n    starts = runwayAnchorNodes(mapData, graph, runway);\n    endPoint = featureAnchor(mapData, request.destination);",
    "  } else if (mode === 'arrival') {\n    const selectedExit = runwayExitAnchor(mapData, runway, request.runwayExit);\n    starts = selectedExit\n      ? nearestNodes(graph, selectedExit, { limit: 2, maxDistanceMeters: 180 })\n      : runwayAnchorNodes(mapData, graph, runway);\n    startPoint = selectedExit;\n    endPoint = featureAnchor(mapData, request.destination);",
  );
  return next;
});

// Recorder lifecycle: preserve a single active flight across temporary source/
// callsign changes, persist taxi-route context and finish only after a stable
// parked state following landing.
await update('src/flight-recorder.mjs', (source) => {
  let next = source;
  if (!next.includes('this.parkedSince = null;')) {
    next = replaceRequired(next, '    this.flushTimer = null;\n    this.queue = Promise.resolve();', '    this.flushTimer = null;\n    this.parkedSince = null;\n    this.queue = Promise.resolve();', 'parked lifecycle timer');
  }
  next = next.replace(
    "      const identityChanged = activeIdentity && identity && activeIdentity !== identity;",
    "      const incomingFlight = flightFromState(state);\n      const sameRoute = Boolean(this.active.flight?.origin && this.active.flight?.destination\n        && incomingFlight.origin === this.active.flight.origin\n        && incomingFlight.destination === this.active.flight.destination);\n      const identityChanged = activeIdentity && identity && activeIdentity !== identity && !sameRoute;",
  );
  next = next.replace(
    "    this.active.updatedAt = timestamp;\n    this.active.stats = calculateStats(this.active);",
    "    this.active.updatedAt = timestamp;\n    this.active.taxiRoutes = structuredClone(state.taxi?.routes || this.active.taxiRoutes || { departure: null, arrival: null });\n    this.active.stats = calculateStats(this.active);",
  );
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
  if (!next.includes("taxiRoutes: structuredClone(state.taxi?.routes")) {
    next = next.replace(
      "      operations: operationsFromState(state),",
      "      operations: operationsFromState(state),\n      taxiRoutes: structuredClone(state.taxi?.routes || { departure: null, arrival: null }),",
    );
  }
  next = next.replace(
    "    this.active = null;\n    return saved;",
    "    this.active = null;\n    this.parkedSince = null;\n    return saved;",
  );
  return next;
});

// Persistent screenshots/video APIs tied to the current flight.
await update('src/server.mjs', (source) => {
  let next = source;
  if (!next.includes("import { FlightMediaService } from './flight-media-service.mjs';")) {
    next = replaceRequired(next, "import { FlightRecorder } from './flight-recorder.mjs';", "import { FlightRecorder } from './flight-recorder.mjs';\nimport { FlightMediaService } from './flight-media-service.mjs';", 'media service import');
  }
  if (!next.includes('async function readBinaryBody(request')) {
    const helper = `async function readBinaryBody(request, { maxBytes = 16 * 1024 * 1024 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

`;
    next = replaceRequired(next, 'function localIpv4Addresses() {', helper + 'function localIpv4Addresses() {', 'binary body reader');
  }
  next = next.replace("'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',", "'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), display-capture=(self)',");
  if (!next.includes('const media = new FlightMediaService')) {
    next = replaceRequired(next,
      "  const recorder = flightRecorder ?? new FlightRecorder(engine, { storageDirectory: flightStorageDirectory });\n  await recorder.start();",
      "  const recorder = flightRecorder ?? new FlightRecorder(engine, { storageDirectory: flightStorageDirectory });\n  await recorder.start();\n  const media = new FlightMediaService({ storageDirectory: flightStorageDirectory ? path.join(flightStorageDirectory, 'media') : undefined });\n  await media.start();",
      'media service initialization');
  }

  const mediaRoutes = `      if (pathname === '/api/media' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const current = await recorder.current({ includeTrack: false });
        const flightId = requestUrl.searchParams.get('flightId') || current?.id || 'unassigned';
        return json(response, 200, { items: await media.list({ flightId }) });
      }

      if (pathname === '/api/media/screenshot' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const current = await recorder.current({ includeTrack: false });
          const body = await readBinaryBody(request, { maxBytes: 24 * 1024 * 1024 });
          const item = await media.saveScreenshot(body, {
            flightId: requestUrl.searchParams.get('flightId') || current?.id || 'unassigned',
            callsign: requestUrl.searchParams.get('callsign') || current?.flight?.callsign || 'flight',
            contentType: request.headers['content-type'] || 'image/png',
          });
          return json(response, 201, { item });
        } catch (error) {
          return json(response, 400, { error: error.message });
        }
      }

      if (pathname === '/api/media/recordings/start' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const current = await recorder.current({ includeTrack: false });
          const body = await readJsonBody(request);
          const recording = await media.beginRecording({
            flightId: body.flightId || current?.id || 'unassigned',
            callsign: body.callsign || current?.flight?.callsign || 'flight',
            contentType: body.contentType || 'video/webm',
          });
          return json(response, 201, { recording });
        } catch (error) {
          return json(response, 400, { error: error.message });
        }
      }

      const mediaChunkMatch = pathname.match(/^\\/api\\/media\\/recordings\\/([a-z0-9-]+)\\/chunk$/i);
      if (mediaChunkMatch && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const body = await readBinaryBody(request, { maxBytes: 16 * 1024 * 1024 });
          return json(response, 200, await media.appendRecordingChunk(mediaChunkMatch[1], body));
        } catch (error) {
          return json(response, 400, { error: error.message });
        }
      }

      const mediaFinishMatch = pathname.match(/^\\/api\\/media\\/recordings\\/([a-z0-9-]+)\\/finish$/i);
      if (mediaFinishMatch && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          return json(response, 200, { item: await media.finishRecording(mediaFinishMatch[1]) });
        } catch (error) {
          return json(response, 400, { error: error.message });
        }
      }

      if (pathname.startsWith('/api/media/file/') && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const item = await media.read(pathname.slice('/api/media/file/'.length));
          response.writeHead(200, {
            'Content-Type': item.contentType,
            'Content-Length': item.body.length,
            'Cache-Control': 'private, max-age=60',
            'Content-Disposition': `inline; filename="${item.filename.replace(/[^A-Za-z0-9_.-]/g, '-')}"`,
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(item.body);
          return;
        } catch (error) {
          return json(response, 404, { error: error.message });
        }
      }

      if (pathname.startsWith('/api/media/') && request.method === 'DELETE') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          await media.delete(pathname.slice('/api/media/'.length));
          return json(response, 200, { deleted: true });
        } catch (error) {
          return json(response, 404, { error: error.message });
        }
      }

`;
  if (!next.includes("pathname === '/api/media/screenshot'")) {
    next = replaceRequired(next, "      if (pathname === '/api/flights' && request.method === 'GET') {", mediaRoutes + "      if (pathname === '/api/flights' && request.method === 'GET') {", 'media API routes');
  }
  return next;
});

// Expose the two Leaflet maps and live state to the post-app release layer. This
// does not change app ownership; it only enables the 1.21 overlays.
await update('public/app.js', (source) => {
  let next = source;
  if (!next.includes('window.__flightDeckTaxiMap = map;')) {
    next = replaceRequired(next, "}).setView([51.2895, 6.7668], 16);", "}).setView([51.2895, 6.7668], 16);\nwindow.__flightDeckTaxiMap = map;", 'taxi map exposure');
  }
  if (!next.includes('window.__flightDeckLatestState = state;')) {
    next = replaceRequired(next, '  latestState = state;', '  latestState = state;\n  window.__flightDeckLatestState = state;', 'live state exposure');
  }
  if (!next.includes('window.__flightDeckLoadedAirportMapData = mapData;')) {
    next = replaceRequired(next, '  loadedAirportMapData = mapData;', '  loadedAirportMapData = mapData;\n  window.__flightDeckLoadedAirportMapData = mapData;\n  window.FlightDeckRelease121?.constrainTaxiMap?.();', 'airport map exposure');
  }
  if (!next.includes('window.__flightDeckTrackingMap = trackingMap;')) {
    next = replaceRequired(next,
      "  trackingMap = L.map('tracking-map', {",
      "  trackingMap = L.map('tracking-map', {",
      'tracking map anchor');
    const marker = "  trackingMap = L.map('tracking-map', {";
    const position = next.indexOf(marker);
    const setViewPosition = next.indexOf('.setView(', position);
    const semicolon = next.indexOf(';', setViewPosition);
    if (position >= 0 && setViewPosition >= 0 && semicolon >= 0) {
      next = next.slice(0, semicolon + 1) + "\n  window.__flightDeckTrackingMap = trackingMap;\n  window.__flightDeckTrackingLayers = trackingLayers;" + next.slice(semicolon + 1);
    } else {
      throw new Error('1.21.0 tracking map exposure could not locate Leaflet map terminator.');
    }
  }
  return next;
});

await update('public/index.html', (source) => {
  let html = source;
  html = html.replace(/\s*<link[^>]+release-1\.21\.0\.css\?v=[^>]+>\s*/g, '\n');
  html = html.replace(/\s*<script[^>]+release-1\.21\.0\.js\?v=[^>]+><\/script>\s*/g, '\n');
  html = html.replace('</head>', `    <link rel="stylesheet" href="/release-1.21.0.css?v=${version}">\n  </head>`);
  html = html.replace('</body>', `    <script src="/release-1.21.0.js?v=${version}"></script>\n  </body>`);
  html = html.replace(/(<html\b[^>]*\bdata-app-version=")[^"]+("[^>]*>)/i, `$1${version}$2`);
  return html;
});

await update('public/service-worker.js', (source) => {
  let sw = source.replace(/^const CACHE_NAME = .*;$/m, "const CACHE_NAME = 'flight-deck-efb-v1210-backlog1';");
  if (!sw.includes("'/release-1.21.0.css?v=1.21.0'")) sw = sw.replace("  '/manifest.webmanifest',", "  '/release-1.21.0.css?v=1.21.0',\n  '/release-1.21.0.js?v=1.21.0',\n  '/manifest.webmanifest',");
  return sw;
});

await update('src/server.mjs', (source) => source.replace(/^const APP_VERSION = '[^']+';/m, "const APP_VERSION = '1.21.0';"));

const changelogPath = path.join(root, 'CHANGELOG.md');
const notesPath = path.join(root, 'release-notes', '1.21.0.md');
const changelog = await fs.readFile(changelogPath, 'utf8');
if (!/^## 1\.21\.0\b/m.test(changelog)) {
  const notes = (await fs.readFile(notesPath, 'utf8')).trim();
  const clean = notes.replace(/\n?> Flight simulation use only — not for real-world navigation\.\s*$/i, '').trim();
  const next = changelog.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${clean}\n\n`);
  await fs.writeFile(changelogPath, next, 'utf8');
}

console.log('Flight Deck EFB 1.21.0 full backlog release materialized.');
