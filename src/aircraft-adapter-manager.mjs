import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_FENIX_URL = 'http://127.0.0.1:8083/';
const MAX_PMDG_CONTROLS = 5_000;

function text(value, max = 200) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : '';
}

function normalizeLocalFenixUrl(value = DEFAULT_FENIX_URL) {
  const url = new URL(String(value || DEFAULT_FENIX_URL));
  const privateHost = url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '::1'
    || url.hostname === '[::1]'
    || url.hostname.startsWith('10.')
    || url.hostname.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  if (url.protocol !== 'http:' || String(url.port || '80') !== '8083' || !privateHost) {
    throw new Error('Fenix Remote EFB muss eine lokale/private HTTP-Adresse auf Port 8083 sein.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url;
}

function numericLiteral(value) {
  const raw = String(value || '').trim();
  if (/^0x[0-9a-f]+$/i.test(raw)) return Number.parseInt(raw, 16);
  if (/^\d+$/.test(raw)) return Number(raw);
  return null;
}

function controlLabel(name) {
  return String(name || '')
    .replace(/^EVT_/, '')
    .replace(/_/g, ' ')
    .replace(/\b([A-Z])([A-Z]+)\b/g, (_, first, rest) => `${first}${rest.toLowerCase()}`)
    .slice(0, 120);
}

export function parsePmdgSdkHeader(content, { family = 'PMDG', source = null } = {}) {
  const sourceText = String(content || '');
  const baseMatch = sourceText.match(/#define\s+THIRD_PARTY_EVENT_ID_MIN\s+(0x[0-9a-f]+|\d+)/i)
    || sourceText.match(/THIRD_PARTY_EVENT_ID_MIN\s+(0x[0-9a-f]+|\d+)/i);
  const base = numericLiteral(baseMatch?.[1]);
  if (!Number.isFinite(base)) return { family, source, baseEventId: null, controls: [] };

  const controls = [];
  const seen = new Set();
  const pattern = /#define\s+(EVT_[A-Z0-9_]+)\s+\(\s*THIRD_PARTY_EVENT_ID_MIN\s*\+\s*(\d+)\s*\)/gi;
  let match;
  while ((match = pattern.exec(sourceText)) && controls.length < MAX_PMDG_CONTROLS) {
    const id = match[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const offset = Number(match[2]);
    controls.push({
      id,
      label: controlLabel(id),
      eventNumber: base + offset,
      offset,
      family,
    });
  }
  return { family, source, baseEventId: base, controls };
}

function familyFromPath(value) {
  const lower = String(value || '').toLowerCase();
  if (lower.includes('777') || lower.includes('77w') || lower.includes('77f') || lower.includes('772')) return 'PMDG 777';
  if (lower.includes('737') || lower.includes('738') || lower.includes('736') || lower.includes('739')) return 'PMDG 737';
  return 'PMDG';
}

function uniquePaths(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.resolve(value)))];
}

export function defaultPmdgPackageRoots() {
  const local = process.env.LOCALAPPDATA;
  const roaming = process.env.APPDATA;
  return uniquePaths([
    process.env.PMDG_PACKAGES_DIR,
    local && path.join(local, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalCache', 'Packages'),
    local && path.join(local, 'Packages', 'Microsoft.FlightSimulator_8wekyb3d8bbwe', 'LocalState', 'packages'),
    local && path.join(local, 'Packages', 'Microsoft.Limitless_8wekyb3d8bbwe', 'LocalCache', 'Packages'),
    local && path.join(local, 'Packages', 'Microsoft.Limitless_8wekyb3d8bbwe', 'LocalState', 'WASM', 'MSFS2024'),
    roaming && path.join(roaming, 'Microsoft Flight Simulator', 'Packages'),
    roaming && path.join(roaming, 'Microsoft Flight Simulator 2024', 'Packages'),
  ]);
}

async function directoryEntries(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function readIfFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function findSdkHeaders(packageDirectory) {
  const candidates = [
    path.join(packageDirectory, 'Documentation', 'SDK'),
    path.join(packageDirectory, 'documentation', 'SDK'),
    path.join(packageDirectory, 'Docs', 'SDK'),
    path.join(packageDirectory, 'docs', 'SDK'),
  ];
  const found = [];
  for (const directory of candidates) {
    for (const entry of await directoryEntries(directory)) {
      if (!entry.isFile() || !/_SDK\.h$/i.test(entry.name)) continue;
      found.push(path.join(directory, entry.name));
    }
  }
  return found;
}

async function findOptionsIni(packageDirectory) {
  const work = path.join(packageDirectory, 'work');
  const entries = await directoryEntries(work);
  const preferred = entries.find((entry) => entry.isFile() && /(?:737|777)_Options\.ini$/i.test(entry.name));
  return preferred ? path.join(work, preferred.name) : null;
}

function sdkBroadcastEnabled(content) {
  if (!content) return null;
  const sdk = String(content).match(/\[SDK\]([\s\S]*?)(?=\n\s*\[[^\]]+\]|$)/i)?.[1] || '';
  return /EnableDataBroadcast\s*=\s*1/i.test(sdk);
}

async function discoverPmdg(rootPaths) {
  const packages = [];
  const visited = new Set();
  for (const root of rootPaths) {
    for (const container of [root, path.join(root, 'Community')]) {
      for (const entry of await directoryEntries(container)) {
        if (!entry.isDirectory() || !/^pmdg-aircraft-/i.test(entry.name)) continue;
        const packageDirectory = path.join(container, entry.name);
        const key = packageDirectory.toLowerCase();
        if (visited.has(key)) continue;
        visited.add(key);
        const headers = await findSdkHeaders(packageDirectory);
        const optionsPath = await findOptionsIni(packageDirectory);
        const optionsContent = optionsPath ? await readIfFile(optionsPath) : null;
        for (const headerPath of headers) {
          const header = await readIfFile(headerPath);
          if (!header) continue;
          const family = familyFromPath(`${entry.name} ${headerPath}`);
          const parsed = parsePmdgSdkHeader(header, { family, source: path.basename(headerPath) });
          packages.push({
            family,
            packageName: entry.name,
            sdkHeader: path.basename(headerPath),
            sdkAvailable: parsed.controls.length > 0,
            baseEventId: parsed.baseEventId,
            controls: parsed.controls,
            controlCount: parsed.controls.length,
            broadcastEnabled: sdkBroadcastEnabled(optionsContent),
            optionsDetected: Boolean(optionsPath),
          });
        }
      }
    }
  }
  return packages;
}

function adapterFromTitle(title) {
  const value = String(title || '').toLowerCase();
  if (/fenix|fnx-aircraft|fnx.*a3(?:19|20|21)|a3(?:19|20|21).*fenix/.test(value)) return 'fenix';
  if (/pmdg/.test(value) && /737|736|738|739/.test(value)) return 'pmdg-737';
  if (/pmdg/.test(value) && /777|77w|77f|772/.test(value)) return 'pmdg-777';
  if (/pmdg/.test(value)) return 'pmdg';
  return 'generic';
}

export class AircraftAdapterManager {
  constructor(engine, {
    simConnect = null,
    pmdgRoots = defaultPmdgPackageRoots(),
    fetchImpl = globalThis.fetch,
    refreshMs = 30_000,
  } = {}) {
    this.engine = engine;
    this.simConnect = simConnect;
    this.pmdgRoots = pmdgRoots;
    this.fetchImpl = fetchImpl;
    this.refreshMs = Math.max(10_000, Number(refreshMs) || 30_000);
    this.timer = null;
    this.stopped = true;
    this.pmdgPackages = [];
    this.fenixUrl = normalizeLocalFenixUrl();
    this.fenixReachable = false;
    this.lastAircraftTitle = null;
    this.listener = (state) => this.#handleState(state);
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.engine.on('change', this.listener);
    this.refresh().catch(() => {});
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
    this.engine.off('change', this.listener);
  }

  async refresh() {
    clearTimeout(this.timer);
    this.pmdgPackages = await discoverPmdg(this.pmdgRoots);
    const state = this.engine.publicState();
    const active = adapterFromTitle(state.aircraft?.aircraftTitle);
    if (active === 'fenix') {
      try {
        await this.checkFenixRemote(this.fenixUrl.toString());
      } catch {
        this.fenixReachable = false;
      }
    }
    this.#publish(state);
    if (!this.stopped) this.timer = setTimeout(() => this.refresh().catch(() => {}), this.refreshMs);
    return this.publicStatus();
  }

  async checkFenixRemote(value = DEFAULT_FENIX_URL) {
    const url = normalizeLocalFenixUrl(value);
    this.fenixUrl = url;
    const response = await this.fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(2_500),
    });
    const reachable = response.status >= 200 && response.status < 500;
    this.fenixReachable = reachable;
    const detail = reachable ? 'Fenix Remote EFB ist erreichbar' : `Fenix antwortet mit HTTP ${response.status}`;
    this.engine.setIntegration('fenix', {
      status: reachable ? 'connected' : 'attention',
      reachable,
      url: url.toString(),
      detail,
    });
    this.#publish(this.engine.publicState());
    if (!reachable) throw new Error(detail);
    return { reachable, url: url.toString(), detail };
  }

  publicStatus() {
    return this.engine.publicState().integrations?.aircraftAdapter || {};
  }

  listControls(query = '', { limit = 300 } = {}) {
    const state = this.engine.publicState();
    const adapter = adapterFromTitle(state.aircraft?.aircraftTitle);
    const search = String(query || '').trim().toLowerCase();
    const capped = Math.max(1, Math.min(500, Number(limit) || 300));
    if (adapter === 'fenix') {
      return (this.simConnect?.listInputEvents(query, { limit: capped }) || []).map((entry) => ({
        id: entry.name,
        label: entry.name,
        type: 'input-event',
        valueType: entry.type === 1 ? 'string' : 'number',
      }));
    }
    if (adapter.startsWith('pmdg')) {
      const family = adapter === 'pmdg-737' ? 'PMDG 737' : adapter === 'pmdg-777' ? 'PMDG 777' : 'PMDG';
      return this.pmdgPackages
        .filter((entry) => family === 'PMDG' || entry.family === family)
        .flatMap((entry) => entry.controls)
        .filter((entry) => !search || entry.id.toLowerCase().includes(search) || entry.label.toLowerCase().includes(search))
        .slice(0, capped)
        .map((entry) => ({ id: entry.id, label: entry.label, type: 'pmdg-event', eventNumber: entry.eventNumber, family: entry.family, valueType: 'number' }));
    }
    return [];
  }

  async executeControl({ id, value = 0 } = {}) {
    if (!this.simConnect?.handle) throw new Error('SimConnect ist nicht verbunden.');
    const state = this.engine.publicState();
    const adapter = adapterFromTitle(state.aircraft?.aircraftTitle);
    if (adapter === 'fenix') {
      const available = this.simConnect.listInputEvents('', { limit: 500 }).find((entry) => entry.name === id);
      if (!available) throw new Error('Dieses Fenix/MSFS Input Event ist für das geladene Flugzeug nicht verfügbar.');
      return this.simConnect.setInputEvent(id, value);
    }
    if (adapter.startsWith('pmdg')) {
      const family = adapter === 'pmdg-737' ? 'PMDG 737' : adapter === 'pmdg-777' ? 'PMDG 777' : null;
      const control = this.pmdgPackages
        .filter((entry) => !family || entry.family === family)
        .flatMap((entry) => entry.controls)
        .find((entry) => entry.id === id);
      if (!control) throw new Error('PMDG-Steuerbefehl ist nicht im lokal installierten SDK freigegeben.');
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0xFFFFFFFF) throw new Error('PMDG-Steuerwert ist ungültig.');
      return this.simConnect.transmitEventNumber(control.eventNumber, Math.round(numeric));
    }
    throw new Error('Für das aktuell geladene Flugzeug ist kein spezieller Adapter aktiv.');
  }

  #handleState(state) {
    const title = text(state.aircraft?.aircraftTitle, 160) || null;
    if (title === this.lastAircraftTitle) return;
    this.lastAircraftTitle = title;
    this.#publish(state);
  }

  #publish(state) {
    const title = text(state.aircraft?.aircraftTitle, 160) || null;
    const active = adapterFromTitle(title);
    const pmdgFamily = active === 'pmdg-737' ? 'PMDG 737' : active === 'pmdg-777' ? 'PMDG 777' : null;
    const matchingPackages = pmdgFamily
      ? this.pmdgPackages.filter((entry) => entry.family === pmdgFamily)
      : this.pmdgPackages;
    const controlCount = active === 'fenix'
      ? (this.simConnect?.listInputEvents('', { limit: 500 }).length || 0)
      : matchingPackages.reduce((sum, entry) => sum + entry.controlCount, 0);
    const pmdgDetected = this.pmdgPackages.length > 0;
    const knownBroadcastPackages = matchingPackages.filter((entry) => entry.broadcastEnabled !== null);
    const pmdgBroadcast = knownBroadcastPackages.length
      ? knownBroadcastPackages.some((entry) => entry.broadcastEnabled === true)
      : null;
    const status = active === 'fenix'
      ? (this.fenixReachable ? 'ready' : 'attention')
      : active.startsWith('pmdg')
        ? (matchingPackages.some((entry) => entry.sdkAvailable) ? 'ready' : 'attention')
        : 'idle';
    const detail = active === 'fenix'
      ? `${title || 'Fenix A32X'} · ${this.fenixReachable ? 'Remote EFB erreichbar' : 'Remote EFB noch nicht erreichbar'} · ${controlCount} MSFS Input Events`
      : active.startsWith('pmdg')
        ? `${title || pmdgFamily || 'PMDG'} · ${controlCount} lokale SDK-Steuerbefehle${pmdgBroadcast === false ? ' · Data Broadcast aus' : pmdgBroadcast === true ? ' · Data Broadcast an' : ''}`
        : title ? `${title} · Generic SimConnect Adapter` : 'Warte auf geladenes Flugzeug';

    this.engine.setIntegration('aircraftAdapter', {
      status,
      active,
      title,
      controlCount,
      detail,
      fenix: {
        detected: active === 'fenix',
        reachable: this.fenixReachable,
        url: this.fenixUrl.toString(),
        inputEventCount: active === 'fenix' ? controlCount : 0,
      },
      pmdg: {
        detected: pmdgDetected,
        activeFamily: pmdgFamily,
        broadcastEnabled: pmdgBroadcast,
        packages: this.pmdgPackages.map(({ controls, ...entry }) => entry),
        controlCount: matchingPackages.reduce((sum, entry) => sum + entry.controlCount, 0),
      },
      updatedAt: new Date().toISOString(),
    });
  }
}
