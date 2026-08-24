import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import QRCode from 'qrcode';
import { StateEngine } from './state-engine.mjs';
import { SayIntentionsClient } from './sayintentions-client.mjs';
import { BeyondAtcClient } from './beyondatc-client.mjs';
import { SimConnectClient } from './simconnect-client.mjs';
import { GsxClient } from './gsx-client.mjs';
import { SimBriefClient } from './simbrief-client.mjs';
import { OnlineNetworkClient } from './online-network-client.mjs';
import { FlightRecorder } from './flight-recorder.mjs';
import { AutomationEngine } from './automation-engine.mjs';
import { DeviceAccessManager } from './device-access-manager.mjs';
import { AviationWeatherClient } from './aviation-weather-client.mjs';
import { startDemo } from './demo-data.mjs';
import { AirportMapService, convertOverpassPayload, resolveAirportMapReference } from './airport-map-service.mjs';
import { convertMsfsAirportFacility, mergeMsfsFacilityMap } from './msfs-airport-facility.mjs';
import { OurAirportsCatalog } from './ourairports-catalog.mjs';
import {
  airportPlanningOptions,
  deriveTaxiRouteFromClearance,
  planTaxiRoutes,
} from './taxi-route-planner.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(MODULE_DIR, '..');
const PUBLIC_DIR = path.join(PROJECT_DIR, 'public');
const LEAFLET_DIR = path.join(PROJECT_DIR, 'node_modules', 'leaflet', 'dist');
const DEFAULT_PORT = 39_871;
const MAX_BODY_BYTES = 262_144;
const APP_VERSION = '1.4.1';

const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

function json(response, statusCode, value, headers = {}) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(body);
}

function download(response, statusCode, body, { contentType, filename }) {
  const buffer = Buffer.from(body, 'utf8');
  response.writeHead(statusCode, {
    'Content-Type': contentType,
    'Content-Length': buffer.length,
    'Content-Disposition': `attachment; filename="${String(filename).replace(/[^A-Za-z0-9_.-]/g, '-')}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(buffer);
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left ?? ''));
  const rightBuffer = Buffer.from(String(right ?? ''));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readToken(requestUrl, request) {
  const queryToken = requestUrl.searchParams.get('token');
  const authHeader = request.headers.authorization;
  if (queryToken) return queryToken;
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

async function readJsonBody(request, { maxBytes = MAX_BODY_BYTES } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function localIpv4Addresses() {
  const values = [];
  let interfaces;
  try {
    interfaces = os.networkInterfaces();
  } catch {
    // Some hardened runtimes do not expose interface metadata. Local access still works.
    return values;
  }
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      values.push(entry.address);
    }
  }
  const privateNetworkScore = (address) => {
    if (address.startsWith('192.168.')) return 0;
    if (address.startsWith('10.')) return 1;
    const secondOctet = Number(address.split('.')[1]);
    if (address.startsWith('172.') && secondOctet >= 16 && secondOctet <= 31) return 2;
    if (address.startsWith('169.254.')) return 9;
    return 5;
  };
  return [...new Set(values)].sort((left, right) => privateNetworkScore(left) - privateNetworkScore(right));
}

function remoteAddress(request) {
  return String(request.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

function isLoopbackAddress(value) {
  return value === '127.0.0.1' || value === '::1' || value === 'localhost';
}

function activeConnectionStatus(state) {
  const selected = state?.atc?.selectedProvider || 'auto';
  const active = selected === 'auto' ? state?.atc?.activeProvider : selected;
  if (active === 'sayintentions') return state.connections?.sayIntentions?.status || 'waiting';
  if (active === 'beyondatc') return state.connections?.beyondAtc?.status || 'waiting';
  if (active === 'manual') return 'connected';
  return state.connections?.sayIntentions?.status === 'connected' || state.connections?.beyondAtc?.status === 'connected'
    ? 'connected' : 'waiting';
}

function safeStaticPath(baseDirectory, relativePath) {
  const decoded = decodeURIComponent(relativePath).replace(/^\/+/, '');
  const resolved = path.resolve(baseDirectory, decoded || 'index.html');
  const normalizedBase = `${path.resolve(baseDirectory)}${path.sep}`;
  return resolved === path.resolve(baseDirectory) || resolved.startsWith(normalizedBase)
    ? resolved
    : null;
}

async function serveFile(response, filePath) {
  try {
    const stat = await fs.stat(filePath);
    const resolved = stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    const body = await fs.readFile(resolved);
    const extension = path.extname(resolved).toLowerCase();
    const cacheControl = resolved.endsWith('index.html') || resolved.endsWith('service-worker.js')
      ? 'no-cache'
      : 'public, max-age=3600';
    response.writeHead(200, {
      'Content-Type': MIME_TYPES.get(extension) ?? 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self'; frame-src http: https:; object-src 'none'; base-uri 'self'; form-action 'self'",
    });
    response.end(body);
    return true;
  } catch {
    return false;
  }
}

function openInDefaultBrowser(url) {
  const options = { detached: true, stdio: 'ignore', windowsHide: true };
  let child;
  if (process.platform === 'win32') child = spawn('explorer.exe', [url], options);
  else if (process.platform === 'darwin') child = spawn('open', [url], options);
  else child = spawn('xdg-open', [url], options);
  child.unref();
}

async function listenOnAvailablePort(server, host, preferredPort) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
      return port;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  throw new Error('No free port available');
}

export async function createTaxiServer({
  demo = false,
  host = '0.0.0.0',
  port = DEFAULT_PORT,
  mapCacheDirectory,
  airportMapService,
  ourAirportsCatalog,
  flightStorageDirectory,
  flightRecorder,
  automationStorageDirectory,
  accessStorageDirectory,
  updateService,
} = {}) {
  const engine = new StateEngine();
  const mapService = airportMapService ?? new AirportMapService({ cacheDirectory: mapCacheDirectory });
  const airportCatalog = ourAirportsCatalog ?? new OurAirportsCatalog();
  const token = randomBytes(24).toString('base64url');
  const pairingPin = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const accessManager = new DeviceAccessManager({
    storageDirectory: accessStorageDirectory || (flightStorageDirectory ? path.join(flightStorageDirectory, '.access') : undefined),
  });
  await accessManager.start();
  const pairingAttempts = new Map();
  const sseClients = new Set();
  let stopDataSources = () => {};
  let sayIntentions = null;
  let gsx = null;
  const simConnect = demo ? null : new SimConnectClient(engine);
  const facilityMapCache = new Map();
  const navigraph = {
    start() {
      engine.setConnection('navigraph', 'disabled', 'Navigraph ist in diesem Build bewusst deaktiviert.');
      engine.setIntegration('navigraph', { status: 'disabled', configured: false, authenticated: false, detail: 'Navigraph ist vorerst deaktiviert.' });
    },
    stop() {},
    async beginLogin() { throw new Error('Navigraph ist in diesem Build vorerst deaktiviert.'); },
    async logout() {
      engine.setConnection('navigraph', 'disabled', 'Navigraph ist in diesem Build bewusst deaktiviert.');
      engine.setIntegration('navigraph', { status: 'disabled', configured: false, authenticated: false, detail: 'Navigraph ist vorerst deaktiviert.' });
    },
  };
  const simBrief = new SimBriefClient(engine);
  const onlineNetworks = new OnlineNetworkClient(engine);
  const aviationWeather = new AviationWeatherClient(engine);
  const recorder = flightRecorder ?? new FlightRecorder(engine, { storageDirectory: flightStorageDirectory });
  await recorder.start();
  const automation = new AutomationEngine(engine, {
    simConnect,
    storageDirectory: automationStorageDirectory || (flightStorageDirectory ? path.join(flightStorageDirectory, 'automation-settings') : undefined),
  });

  const sendEvent = (client, state) => {
    client.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
  };
  engine.on('change', (state) => {
    for (const client of sseClients) sendEvent(client, state);
  });
  await automation.start();
  const updater = updateService || {
    status: () => ({
      state: 'manual', currentVersion: APP_VERSION, configured: false,
      detail: 'Der Windows-Installer aktualisiert die App unter Beibehaltung der lokalen Daten. Ein automatischer Release-Kanal ist noch nicht konfiguriert.',
    }),
    check: async () => ({ state: 'manual', currentVersion: APP_VERSION, configured: false }),
    download: async () => ({ state: 'manual', currentVersion: APP_VERSION, configured: false }),
    install: async () => { throw new Error('Noch kein heruntergeladenes Update verfügbar.'); },
  };

  const diagnostics = async () => {
    const state = engine.publicState();
    let mapFiles = 0;
    let mapBytes = 0;
    try {
      for (const entry of await fs.readdir(mapService.cacheDirectory, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        mapFiles += 1;
        mapBytes += (await fs.stat(path.join(mapService.cacheDirectory, entry.name))).size;
      }
    } catch {
      // Empty or unavailable cache is reported as zero.
    }
    const flights = await recorder.list();
    const checks = [
      { id: 'msfs', label: 'Microsoft Flight Simulator / SimConnect', status: state.connections.simConnect?.status || 'waiting', detail: state.connections.simConnect?.detail || '' },
      { id: 'atc', label: 'ATC source', status: activeConnectionStatus(state), detail: state.taxi?.clearance?.provider || state.atc?.selectedProvider || 'auto' },
      { id: 'gsx', label: 'GSX Pro readiness', status: state.integrations.gsx?.status || 'waiting', detail: state.integrations.gsx?.detail || '' },
      { id: 'navigraph', label: 'Navigraph account', status: state.integrations.navigraph?.status || 'configuration-required', detail: state.integrations.navigraph?.detail || '' },
      { id: 'airport-map', label: 'Airport map data', status: state.integrations.airportFacility?.status || (mapFiles ? 'cached' : 'waiting'), detail: state.integrations.airportFacility?.detail || `${mapFiles} Offline-Flughäfen` },
    ];
    return {
      generatedAt: new Date().toISOString(),
      product: 'Flight Deck EFB',
      version: APP_VERSION,
      runtime: { platform: process.platform, architecture: process.arch, osRelease: os.release(), node: process.version },
      checks,
      data: { flightCount: flights.length, mapFiles, mapBytes, pairedDevices: accessManager.list().length, sharingEnabled: accessManager.sharingEnabled },
      safety: { automationMode: automation.publicConfiguration().mode, gsxRemoteControl: false, secretsIncluded: false },
    };
  };

  const wait = (milliseconds, value = null) => new Promise((resolve) => setTimeout(resolve, milliseconds, value));

  const loadSimulatorFacilityMap = async (icao) => {
    if (!simConnect || engine.publicState().connections.simConnect?.status !== 'connected') return null;
    const cached = facilityMapCache.get(icao);
    if (cached && Date.now() - cached.storedAt < 6 * 60 * 60 * 1_000) return cached.map;
    try {
      const raw = await simConnect.requestAirportFacility(icao);
      if (!raw) return null;
      const map = convertMsfsAirportFacility(raw);
      facilityMapCache.set(icao, { storedAt: Date.now(), map });
      engine.setIntegration('airportFacility', {
        status: 'ready', icao, detail: `${map.facility.pathCount} MSFS-Taxipfade · ${map.facility.parkingCount} Stände`,
        ...map.facility,
      });
      return map;
    } catch (error) {
      engine.setIntegration('airportFacility', { status: 'fallback', icao, detail: error.message });
      return null;
    }
  };

  const loadCurrentAirportMap = async ({ forceRefresh = false } = {}) => {
    const reference = resolveAirportMapReference(engine.publicState());
    if (!reference) {
      const error = new Error('Noch keine Flughafenposition verfügbar.');
      error.code = 'AIRPORT_REFERENCE_UNAVAILABLE';
      throw error;
    }
    const catalogAirport = await airportCatalog.getAirport(reference.icao);
    const resolvedReference = {
      ...reference,
      lat: Number.isFinite(reference.lat) ? reference.lat : catalogAirport?.lat,
      lon: Number.isFinite(reference.lon) ? reference.lon : catalogAirport?.lon,
      airport: catalogAirport,
    };
    if (!Number.isFinite(resolvedReference.lat) || !Number.isFinite(resolvedReference.lon)) {
      const error = new Error(`Keine Koordinaten für ${reference.icao} verfügbar.`);
      error.code = 'AIRPORT_COORDINATES_UNAVAILABLE';
      throw error;
    }
    const basePromise = mapService.getMap(resolvedReference, { forceRefresh })
      .then((map) => ({ map, error: null }))
      .catch((error) => ({ map: null, error }));
    const facilityPromise = loadSimulatorFacilityMap(reference.icao)
      .then((map) => ({ map, error: null }))
      .catch((error) => ({ map: null, error }));
    const first = await Promise.race([
      basePromise.then((result) => ({ type: 'base', ...result })),
      facilityPromise.then((result) => ({ type: 'facility', ...result })),
    ]);
    let baseMap;
    let facilityMap;
    if (first.type === 'base') {
      baseMap = first.map;
      const facilityWaitMs = first.error ? 8_000 : 1_200;
      facilityMap = (await Promise.race([facilityPromise, wait(facilityWaitMs, { map: null })])).map;
    } else if (first.map) {
      facilityMap = first.map;
      baseMap = (await Promise.race([basePromise, wait(900, { map: null })])).map;
    } else {
      baseMap = (await basePromise).map;
    }
    if (!baseMap) {
      baseMap = convertOverpassPayload({ elements: [] }, { icao: reference.icao, lat: resolvedReference.lat, lon: resolvedReference.lon }, {
        airportMetadata: catalogAirport,
      });
      baseMap.cache = { status: 'preview', offlineReady: false };
    }
    const mapData = facilityMap ? mergeMsfsFacilityMap(baseMap, facilityMap) : baseMap;
    return {
      ...mapData,
      planning: airportPlanningOptions(mapData),
    };
  };

  const loadCurrentAirportPreview = async () => {
    const reference = resolveAirportMapReference(engine.publicState());
    if (!reference) throw new Error('Noch keine Flughafenposition verfügbar.');
    const airport = await airportCatalog.getAirport(reference.icao);
    const lat = Number.isFinite(reference.lat) ? reference.lat : airport?.lat;
    const lon = Number.isFinite(reference.lon) ? reference.lon : airport?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error(`Keine Koordinaten für ${reference.icao} verfügbar.`);
    const preview = convertOverpassPayload({ elements: [] }, { icao: reference.icao, lat, lon }, {
      airportMetadata: airport,
    });
    const cachedFacility = facilityMapCache.get(reference.icao)?.map || null;
    const result = cachedFacility ? mergeMsfsFacilityMap(preview, cachedFacility) : preview;
    return {
      ...result,
      cache: { status: 'preview', offlineReady: false },
      planning: airportPlanningOptions(result),
    };
  };

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://localhost');
      const pathname = requestUrl.pathname;
      const requestAddress = remoteAddress(request);
      const localRequest = isLoopbackAddress(requestAddress);
      if (!localRequest && !accessManager.sharingEnabled) {
        return json(response, 403, { error: 'Tablet-/Netzwerkzugriff ist auf dem Windows-Host deaktiviert.' });
      }
      const presentedToken = readToken(requestUrl, request);
      const hostAuthenticated = secureEqual(presentedToken, token);
      const authenticatedDevice = hostAuthenticated ? null : accessManager.authenticate(presentedToken);
      const authenticated = hostAuthenticated || Boolean(authenticatedDevice);

      if (pathname === '/health') {
        return json(response, 200, { status: 'ok', mode: engine.publicState().mode });
      }

      if (pathname === '/api/info') {
        return json(response, 200, {
          name: 'Flight Deck EFB',
          pairingRequired: true,
          version: APP_VERSION,
        });
      }

      if (pathname === '/api/update/status' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        return json(response, 200, { ...(await updater.status()), canManage: hostAuthenticated });
      }

      if (pathname === '/api/update/check' && request.method === 'POST') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Updates können nur in der Windows-App verwaltet werden.' });
        try {
          return json(response, 202, await updater.check());
        } catch (error) {
          return json(response, 409, { error: error.message, ...(await updater.status()) });
        }
      }

      if (pathname === '/api/update/download' && request.method === 'POST') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Updates können nur in der Windows-App heruntergeladen werden.' });
        try {
          return json(response, 202, await updater.download());
        } catch (error) {
          return json(response, 409, { error: error.message, ...(await updater.status()) });
        }
      }

      if (pathname === '/api/update/install' && request.method === 'POST') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Updates können nur in der Windows-App installiert werden.' });
        try {
          const result = await updater.install();
          return json(response, 202, result);
        } catch (error) {
          return json(response, 409, { error: error.message, ...(await updater.status()) });
        }
      }

      if (pathname === '/api/pair' && request.method === 'POST') {
        const now = Date.now();
        const attempt = pairingAttempts.get(requestAddress) || { count: 0, resetAt: now + 5 * 60_000 };
        if (now >= attempt.resetAt) Object.assign(attempt, { count: 0, resetAt: now + 5 * 60_000 });
        if (attempt.count >= 5) return json(response, 429, { error: 'Zu viele Versuche. Bitte fünf Minuten warten.' }, { 'Retry-After': '300' });
        const body = await readJsonBody(request);
        if (!secureEqual(body.pin, pairingPin)) {
          attempt.count += 1;
          pairingAttempts.set(requestAddress, attempt);
          return json(response, 401, { error: 'PIN ist nicht korrekt.' });
        }
        pairingAttempts.delete(requestAddress);
        const paired = await accessManager.pair({
          name: body.deviceName || (localRequest ? 'Local browser' : 'Tablet'),
          platform: request.headers['user-agent'],
        });
        engine.setSharing({ deviceCount: accessManager.list().length, enabled: accessManager.sharingEnabled });
        return json(response, 200, paired);
      }

      if (pathname === '/api/devices' && request.method === 'GET') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Geräteverwaltung ist nur in der Windows-App verfügbar.' });
        return json(response, 200, { devices: accessManager.list(), sharingEnabled: accessManager.sharingEnabled });
      }

      const deviceMatch = pathname.match(/^\/api\/devices\/([a-f0-9-]{16,80})$/i);
      if (deviceMatch && request.method === 'DELETE') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Geräteverwaltung ist nur in der Windows-App verfügbar.' });
        const revoked = await accessManager.revoke(deviceMatch[1]);
        engine.setSharing({ deviceCount: accessManager.list().length, enabled: accessManager.sharingEnabled });
        return json(response, revoked ? 200 : 404, revoked ? { revoked: true } : { error: 'Gerät wurde nicht gefunden.' });
      }

      if (pathname === '/api/sharing' && request.method === 'PUT') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Freigaben können nur in der Windows-App geändert werden.' });
        const body = await readJsonBody(request);
        const enabled = await accessManager.setSharingEnabled(body.enabled !== false);
        engine.setSharing({ deviceCount: accessManager.list().length, enabled });
        return json(response, 200, { enabled, devices: accessManager.list() });
      }

      if (pathname === '/api/state') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        return json(response, 200, engine.publicState());
      }

      if (pathname === '/api/integrations' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const state = engine.publicState();
        return json(response, 200, {
          atc: state.atc,
          connections: state.connections,
          integrations: state.integrations,
          simulatorConnected: state.connections.simConnect?.status === 'connected',
          currentAirport: state.flight.currentAirport || state.planning.selectedAirport?.icao || null,
        });
      }

      if (pathname === '/api/diagnostics' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        return json(response, 200, await diagnostics());
      }

      if (pathname === '/api/support-bundle' && request.method === 'GET') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Support-Daten können nur in der Windows-App exportiert werden.' });
        const bundle = {
          ...(await diagnostics()),
          configuration: {
            atcProvider: engine.publicState().atc?.selectedProvider || 'auto',
            automationRules: automation.publicConfiguration().rules.length,
            automationVariables: automation.publicConfiguration().variables.length,
            gsxSetup: engine.publicState().integrations.gsx?.setupSteps || [],
          },
          note: 'Enthält keine API-Schlüssel, Tokens, ATC-Nachrichten, Flugnotizen oder vollständigen Dateipfade.',
        };
        return download(response, 200, `${JSON.stringify(bundle, null, 2)}\n`, {
          contentType: 'application/json; charset=utf-8',
          filename: `Flight-Deck-EFB-Support-${new Date().toISOString().slice(0, 10)}.json`,
        });
      }

      if (pathname === '/api/backup/export' && request.method === 'POST') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Sicherungen können nur in der Windows-App erstellt werden.' });
        const body = await readJsonBody(request, { maxBytes: 512_000 });
        const allowedPreferenceKeys = new Set([
          'language', 'theme', 'textSize', 'weightUnit', 'distanceUnit', 'pressureUnit', 'temperatureUnit', 'clockFormat',
          'displayName', 'showHelpTexts', 'alertMode', 'arrivalTriggerNm', 'fuelBufferPounds', 'focusMode', 'showPhaseHome', 'appLayout', 'simbriefIdentifier',
          'simbriefAutoImport', 'destinationPrefetch',
        ]);
        const preferences = body.preferences && typeof body.preferences === 'object'
          ? Object.fromEntries(Object.entries(body.preferences).filter(([key]) => allowedPreferenceKeys.has(key))) : {};
        const configuration = automation.publicConfiguration();
        const backup = {
          schemaVersion: 1,
          product: 'Flight Deck EFB',
          version: APP_VERSION,
          exportedAt: new Date().toISOString(),
          preferences,
          automations: { mode: 'test', variables: configuration.variables, rules: configuration.rules },
          archive: await recorder.exportBackup(),
        };
        return download(response, 200, `${JSON.stringify(backup)}\n`, {
          contentType: 'application/json; charset=utf-8',
          filename: `Flight-Deck-EFB-Backup-${new Date().toISOString().slice(0, 10)}.json`,
        });
      }

      if (pathname === '/api/backup/import' && request.method === 'POST') {
        if (!hostAuthenticated) return json(response, 403, { error: 'Sicherungen können nur in der Windows-App eingelesen werden.' });
        const body = await readJsonBody(request, { maxBytes: 32 * 1_024 * 1_024 });
        const backup = body.backup || body;
        if (backup?.product !== 'Flight Deck EFB' || !backup.archive) return json(response, 422, { error: 'Ungültige Flight-Deck-EFB-Sicherung.' });
        const archive = await recorder.importBackup(backup.archive, { replace: body.replace === true });
        if (backup.automations) await automation.updateConfiguration({
          mode: 'test', variables: backup.automations.variables, rules: backup.automations.rules,
        });
        return json(response, 200, { imported: true, archive, preferences: backup.preferences || {}, state: engine.publicState() });
      }

      if (pathname === '/api/automations' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        return json(response, 200, { configuration: automation.publicConfiguration(), state: engine.publicState() });
      }

      if (pathname === '/api/simconnect/input-events' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const query = requestUrl.searchParams.get('q') || '';
        return json(response, 200, {
          connected: Boolean(simConnect?.handle),
          events: simConnect?.listInputEvents(query, { limit: requestUrl.searchParams.get('limit') }) || [],
        });
      }

      if (pathname === '/api/automations' && request.method === 'PUT') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        try {
          const configuration = await automation.updateConfiguration(body);
          return json(response, 200, { configuration, state: engine.publicState() });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

      if (pathname === '/api/automations/context' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        automation.setContext(String(body.app || 'home'));
        return json(response, 200, { context: automation.publicConfiguration().activeApp });
      }

      const automationRunMatch = pathname.match(/^\/api\/automations\/rules\/([a-z0-9-]{8,80})\/run$/i);
      if (automationRunMatch && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          return json(response, 200, { result: await automation.runRule(automationRunMatch[1]), state: engine.publicState() });
        } catch (error) {
          return json(response, 409, { error: error.message });
        }
      }

      if (pathname === '/api/flight/operations' && request.method === 'PUT') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        engine.setFlightOperations({
          phaseOverride: body.phaseOverride,
          checklist: body.checklist,
          notes: body.notes,
        });
        const state = engine.publicState();
        return json(response, 200, {
          operations: state.integrations.flightOperations,
          state,
        });
      }

      if (pathname === '/api/flight/reset' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const savedFlight = await recorder.finalize('manual-new-flight');
        engine.resetFlight({ reason: 'manual-new-flight', preserveAircraft: true, suppressCurrent: false });
        return json(response, 200, { reset: true, savedFlight, state: engine.publicState() });
      }

      if (pathname === '/api/flights' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        return json(response, 200, {
          current: await recorder.current({ includeTrack: false }),
          flights: await recorder.list(),
        });
      }

      if (pathname === '/api/flights/current' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const requestedOffset = Number(requestUrl.searchParams.get('after'));
        const trackAfter = Number.isInteger(requestedOffset) && requestedOffset >= 0
          ? Math.min(requestedOffset, 50_000)
          : 0;
        return json(response, 200, { flight: await recorder.current({ trackAfter }) });
      }

      if (pathname === '/api/flights/current/start' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const current = await recorder.beginManual(engine.publicState());
          return json(response, 200, { current, flight: await recorder.current() });
        } catch (error) {
          return json(response, 409, { error: error.message });
        }
      }

      if (pathname === '/api/flights/current/save' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const saved = await recorder.finalize('manual-save');
        return json(response, saved ? 200 : 409, saved ? { saved } : { error: 'Es wird aktuell kein Flug aufgezeichnet.' });
      }

      const flightExportMatch = pathname.match(/^\/api\/flights\/([a-z0-9-]{8,80})\/export\.(gpx|json)$/i);
      if (flightExportMatch && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const [, id, format] = flightExportMatch;
        const body = format.toLowerCase() === 'gpx' ? await recorder.exportGpx(id) : await recorder.exportJson(id);
        if (!body) return json(response, 404, { error: 'Gespeicherter Flug wurde nicht gefunden.' });
        return download(response, 200, body, {
          contentType: format.toLowerCase() === 'gpx' ? 'application/gpx+xml; charset=utf-8' : 'application/json; charset=utf-8',
          filename: `Flight-Deck-EFB-${id}.${format.toLowerCase()}`,
        });
      }

      const flightRecordMatch = pathname.match(/^\/api\/flights\/([a-z0-9-]{8,80})$/i);
      if (flightRecordMatch && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const flight = await recorder.get(flightRecordMatch[1]);
        return flight ? json(response, 200, { flight }) : json(response, 404, { error: 'Gespeicherter Flug wurde nicht gefunden.' });
      }

      if (flightRecordMatch && request.method === 'DELETE') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const deleted = await recorder.delete(flightRecordMatch[1]);
          return json(response, deleted ? 200 : 404, deleted ? { deleted: true } : { error: 'Gespeicherter Flug wurde nicht gefunden.' });
        } catch (error) {
          return json(response, 409, { error: error.message });
        }
      }

      if (pathname === '/api/simbrief/import' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        try {
          const summary = await simBrief.importLatest(body.identifier);
          if (body.prefetchDestination !== false) {
            const destination = String(summary?.flight?.destination || '').trim().toUpperCase();
            const origin = String(summary?.flight?.origin || '').trim().toUpperCase();
            const airports = [origin, destination].filter(Boolean);
            aviationWeather.refresh(airports, { force: true }).catch(() => {});
            if (destination) {
              airportCatalog.getAirport(destination).then(async (airport) => {
                if (!airport || !Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return;
                await Promise.allSettled([
                  mapService.getMap({ icao: destination, lat: airport.lat, lon: airport.lon, airport }),
                  loadSimulatorFacilityMap(destination),
                ]);
              }).catch(() => {});
            }
          }
          return json(response, 200, { summary, state: engine.publicState() });
        } catch (error) {
          engine.setIntegration('simbrief', { status: 'error', detail: error.message });
          return json(response, 422, { error: error.message });
        }
      }

      if (pathname === '/api/navigraph/login' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const login = await navigraph.beginLogin();
          return json(response, 200, { login, state: engine.publicState() });
        } catch (error) {
          return json(response, 409, { error: error.message });
        }
      }

      if (pathname === '/api/navigraph/logout' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        navigraph.logout();
        return json(response, 200, { state: engine.publicState() });
      }

      if (pathname === '/api/sayintentions/frequency' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!sayIntentions) return json(response, 409, { error: 'SayIntentions-Connector ist im Demo-Modus nicht aktiv.' });
        try {
          const body = await readJsonBody(request);
          const result = await sayIntentions.setFrequency({
            frequency: body.frequency,
            com: body.com,
            mode: body.mode || 'standby',
          });
          return json(response, 200, { applied: true, result });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

      if (pathname === '/api/com' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!simConnect?.handle) return json(response, 409, { error: 'SimConnect ist nicht verbunden.' });
        try {
          const body = await readJsonBody(request);
          const action = String(body.action || 'set').trim().toLowerCase();
          let result;
          if (action === 'set') result = await simConnect.setComFrequency(body);
          else if (action === 'swap') result = await simConnect.swapCom(body.com);
          else if (action === 'receive') result = await simConnect.setComReceive(body.com, body.enabled !== false);
          else if (action === 'transmit') result = await simConnect.setPilotTransmitter(body.com);
          else return json(response, 422, { error: 'Unbekannte COM-Aktion.' });
          return json(response, 200, { applied: true, action, result, state: engine.publicState() });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

      if (pathname === '/api/traffic/refresh' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          return json(response, 202, simConnect?.refreshTraffic() || { requested: false });
        } catch (error) {
          return json(response, 409, { error: error.message });
        }
      }

      if (pathname === '/api/networks/refresh' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        if (String(body.network).toLowerCase() === 'off') {
          onlineNetworks.disable();
          return json(response, 200, { network: engine.publicState().integrations.onlineNetworks });
        }
        try {
          return json(response, 200, { network: await onlineNetworks.refresh(body.network) });
        } catch (error) {
          engine.setIntegration('onlineNetworks', { status: 'error', detail: error.message });
          return json(response, 502, { error: error.message });
        }
      }

      if (pathname === '/api/weather/refresh' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        try {
          const weather = await aviationWeather.refresh(body.airports, { force: true });
          return json(response, 200, { weather, state: engine.publicState() });
        } catch (error) {
          return json(response, 502, { error: error.message });
        }
      }

      if (pathname === '/api/gsx/refresh' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!gsx) return json(response, 409, { error: 'GSX-Connector ist im Demo-Modus nicht aktiv.' });
        await gsx.pollOnce();
        return json(response, 200, { gsx: engine.publicState().integrations.gsx });
      }

      if (pathname === '/api/fenix/check' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        let fenixUrl;
        try {
          fenixUrl = new URL(String(body.url || 'http://127.0.0.1:8083/'));
          const privateHost = fenixUrl.hostname === 'localhost'
            || fenixUrl.hostname === '127.0.0.1'
            || fenixUrl.hostname.startsWith('10.')
            || fenixUrl.hostname.startsWith('192.168.')
            || /^172\.(1[6-9]|2\d|3[01])\./.test(fenixUrl.hostname);
          if (fenixUrl.protocol !== 'http:' || String(fenixUrl.port || '80') !== '8083' || !privateHost) throw new Error();
          fenixUrl.pathname = '/';
          fenixUrl.search = '';
          fenixUrl.hash = '';
        } catch {
          return json(response, 400, { error: 'Fenix Remote EFB muss eine lokale HTTP-Adresse auf Port 8083 sein.' });
        }
        try {
          const check = await fetch(fenixUrl, { redirect: 'manual', signal: AbortSignal.timeout(2_500) });
          const reachable = check.status >= 200 && check.status < 500;
          const detail = reachable ? 'Fenix Remote EFB ist erreichbar' : `Fenix antwortet mit HTTP ${check.status}`;
          engine.setIntegration('fenix', { status: reachable ? 'connected' : 'attention', reachable, url: fenixUrl.toString(), detail });
          return json(response, reachable ? 200 : 502, { reachable, url: fenixUrl.toString(), detail });
        } catch {
          const detail = 'Fenix A32X ist nicht erreichbar · Flug laden und Fenix App starten';
          engine.setIntegration('fenix', { status: 'disconnected', reachable: false, url: fenixUrl.toString(), detail });
          return json(response, 502, { reachable: false, url: fenixUrl.toString(), detail });
        }
      }

      if (pathname === '/api/atc/provider' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        if (!engine.setAtcProvider(body.provider)) {
          return json(response, 400, { error: 'Unbekannte ATC-Quelle.' });
        }
        return json(response, 200, { state: engine.publicState() });
      }

      if (pathname === '/api/atc/clearance' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        const text = String(body.text ?? '').trim();
        if (text.length < 4 || text.length > 1_500) {
          return json(response, 400, { error: 'Die Freigabe muss 4 bis 1.500 Zeichen lang sein.' });
        }
        engine.setAtcProvider('manual');
        engine.applyExternalClearance({
          provider: 'manual',
          text,
          station: String(body.station ?? 'Manual ATC').slice(0, 100),
          time: new Date().toISOString(),
        });
        return json(response, 200, { state: engine.publicState() });
      }

      if (pathname === '/api/airports/search' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const query = requestUrl.searchParams.get('q')?.trim() ?? '';
        const state = engine.publicState();
        const airports = query.length >= 2
          ? await airportCatalog.search(query, { limit: 14 })
          : Number.isFinite(state.aircraft?.lat) && Number.isFinite(state.aircraft?.lon)
            ? await airportCatalog.nearest(state.aircraft.lat, state.aircraft.lon, { limit: 8, maxDistanceKm: 120 })
            : [];
        return json(response, 200, { airports });
      }

      if (pathname === '/api/planning/airport' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        if (!body.icao) {
          engine.clearPlannedTaxiPath();
          engine.setPlanningAirport(null);
          return json(response, 200, { planning: engine.publicState().planning });
        }
        const airport = await airportCatalog.getAirport(body.icao);
        if (!airport) return json(response, 404, { error: 'Flughafen wurde nicht gefunden.' });
        engine.clearPlannedTaxiPath();
        engine.setPlanningAirport(airport);
        return json(response, 200, { planning: engine.publicState().planning, airport });
      }

      if (pathname === '/api/airport-map/current' && (request.method === 'GET' || request.method === 'POST')) {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const mapData = await loadCurrentAirportMap({ forceRefresh: request.method === 'POST' });
          return json(response, 200, mapData);
        } catch (error) {
          if (error.code === 'AIRPORT_REFERENCE_UNAVAILABLE' || error.code === 'AIRPORT_COORDINATES_UNAVAILABLE') {
            return json(response, 409, { error: error.message, code: error.code });
          }
          return json(response, 502, {
            error: 'Flughafenkarte konnte nicht geladen werden.',
            detail: error.message,
          });
        }
      }

      if (pathname === '/api/airport-map/preview' && request.method === 'GET') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          return json(response, 200, await loadCurrentAirportPreview());
        } catch (error) {
          return json(response, 409, { error: error.message });
        }
      }

      if (pathname === '/api/taxi-plan/routes' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        try {
          const mapData = await loadCurrentAirportMap();
          const result = planTaxiRoutes(mapData, body, { aircraft: engine.publicState().aircraft });
          return json(response, result.routes.length > 0 ? 200 : 422, result);
        } catch (error) {
          return json(response, error.code ? 409 : 502, { error: error.message, code: error.code });
        }
      }

      if (pathname === '/api/taxi-plan/start' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        if (!Array.isArray(body.route?.path) || body.route.path.length > 5_000) {
          return json(response, 400, { error: 'Die Route ist ungültig.' });
        }
        const accepted = engine.setPlannedTaxiPath(body.route.path, {
          source: 'manual',
          mode: body.mode,
          runway: body.runway || null,
          label: body.route.label || null,
          routeId: body.route.id || null,
          taxiways: Array.isArray(body.route.taxiways) ? body.route.taxiways.slice(0, 80) : [],
          destination: body.destination && typeof body.destination === 'object' ? {
            id: String(body.destination.id || '').slice(0, 120),
            name: String(body.destination.name || '').slice(0, 60),
          } : null,
        });
        if (!accepted) return json(response, 409, { error: 'Die geplante Route konnte nicht aktiviert werden.' });
        return json(response, 200, { state: engine.publicState() });
      }

      if (pathname === '/api/taxi-plan/clear' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const cleared = engine.clearPlannedTaxiPath();
        return json(response, 200, { cleared, state: engine.publicState() });
      }

      if (pathname === '/api/taxi-route/derive' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        try {
          const state = engine.publicState();
          if (['sayintentions', 'beyondatc'].includes(state.taxi?.pathSource) && state.taxi.path.length > 1) {
            return json(response, 200, { applied: false, exactPathAvailable: true, routes: [] });
          }
          const mapData = await loadCurrentAirportMap();
          const result = deriveTaxiRouteFromClearance(mapData, state);
          const route = result.routes[0];
          const applied = route ? engine.setDerivedTaxiPath(route.path, {
            runway: result.parsed.runway,
            taxiways: result.parsed.taxiways,
            label: route.label,
            routeId: route.id,
            inferred: true,
          }) : false;
          return json(response, route ? 200 : 422, { ...result, applied });
        } catch (error) {
          return json(response, error.code ? 409 : 502, { error: error.message, code: error.code });
        }
      }

      if (pathname === '/api/events') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        response.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        response.write('retry: 1500\n\n');
        sseClients.add(response);
        sendEvent(response, engine.publicState());
        request.on('close', () => sseClients.delete(response));
        return;
      }

      if (pathname.startsWith('/api/')) {
        return json(response, 404, { error: 'Nicht gefunden.' });
      }

      if (pathname.startsWith('/vendor/leaflet/')) {
        const relative = pathname.slice('/vendor/leaflet/'.length);
        const filePath = safeStaticPath(LEAFLET_DIR, relative);
        if (filePath && await serveFile(response, filePath)) return;
        response.writeHead(404).end();
        return;
      }

      const requestedPath = pathname === '/' ? '/index.html' : pathname;
      const filePath = safeStaticPath(PUBLIC_DIR, requestedPath);
      if (filePath && await serveFile(response, filePath)) return;

      // Client-side routes always fall back to the app shell.
      if (await serveFile(response, path.join(PUBLIC_DIR, 'index.html'))) return;
      response.writeHead(404).end('Not found');
    } catch (error) {
      json(response, 500, { error: 'Interner Fehler', detail: error.message });
    }
  });

  const actualPort = await listenOnAvailablePort(server, host, port);
  const localhostUrl = `http://localhost:${actualPort}/`;
  const lanUrls = localIpv4Addresses().map((address) => `http://${address}:${actualPort}/`);
  const primaryMobileUrl = lanUrls[0] ?? localhostUrl;
  const qrDataUrl = await QRCode.toDataURL(primaryMobileUrl, {
    margin: 1,
    width: 360,
    color: { dark: '#041524', light: '#ffffff' },
  });

  engine.setSharing({
    urls: lanUrls,
    pairingPin,
    qrDataUrl,
    enabled: accessManager.sharingEnabled,
    deviceCount: accessManager.list().length,
  });

  if (demo) {
    navigraph.start();
    const stopDemo = startDemo(engine);
    stopDataSources = () => {
      stopDemo();
      navigraph.stop();
    };
  } else {
    sayIntentions = new SayIntentionsClient(engine);
    const beyondAtc = new BeyondAtcClient(engine);
    gsx = new GsxClient(engine);
    sayIntentions.start();
    beyondAtc.start();
    simConnect.start();
    gsx.start();
    navigraph.start();
    aviationWeather.start();
    stopDataSources = () => {
      sayIntentions.stop();
      beyondAtc.stop();
      simConnect.stop();
      gsx.stop();
      navigraph.stop();
      aviationWeather.stop();
    };
  }

  const keepAlive = setInterval(() => {
    for (const client of sseClients) client.write(': keepalive\n\n');
  }, 15_000);

  return {
    engine,
    server,
    token,
    pairingPin,
    port: actualPort,
    localhostUrl,
    authenticatedLocalUrl: `${localhostUrl}?token=${encodeURIComponent(token)}`,
    lanUrls,
    mapCacheDirectory: mapService.cacheDirectory,
    flightRecorder: recorder,
    automationEngine: automation,
    accessManager,
    openInDefaultBrowser,
    async close() {
      clearInterval(keepAlive);
      stopDataSources();
      automation.stop();
      await recorder.stop();
      await accessManager.stop();
      for (const client of sseClients) client.end();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function readCliOptions(argv) {
  const portIndex = argv.indexOf('--port');
  const parsedPort = portIndex >= 0 ? Number(argv[portIndex + 1]) : DEFAULT_PORT;
  return {
    demo: argv.includes('--demo'),
    open: argv.includes('--open'),
    port: Number.isInteger(parsedPort) ? parsedPort : DEFAULT_PORT,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = readCliOptions(process.argv.slice(2));
  const standaloneDataDirectory = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'Flight Deck EFB')
    : path.join(os.homedir(), '.flight-deck-efb');
  const application = await createTaxiServer({
    ...options,
  });
  process.stdout.write(`Flight Deck EFB: ${application.authenticatedLocalUrl}\n`);
  process.stdout.write(`Mobile PIN: ${application.pairingPin}\n`);
  if (options.open) openInDefaultBrowser(application.authenticatedLocalUrl);
  const shutdown = async () => {
    await application.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
