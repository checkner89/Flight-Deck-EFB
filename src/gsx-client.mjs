import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const GSX_VARIABLES = Object.freeze([
  { name: 'L:FSDT_GSX_DEBOARDING_STATE', unit: 'number' },
  { name: 'L:FSDT_GSX_CATERING_STATE', unit: 'number' },
  { name: 'L:FSDT_GSX_REFUELING_STATE', unit: 'number' },
  { name: 'L:FSDT_GSX_BOARDING_STATE', unit: 'number' },
  { name: 'L:FSDT_GSX_DEPARTURE_STATE', unit: 'number' },
  { name: 'L:FSDT_GSX_DEICING_STATE', unit: 'number' },
  { name: 'L:FSDT_GSX_NUMPASSENGERS', unit: 'number' },
  { name: 'L:FSDT_GSX_NUMPASSENGERS_BOARDING', unit: 'number' },
  { name: 'L:FSDT_GSX_NUMPASSENGERS_DEBOARDING', unit: 'number' },
  { name: 'L:FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL', unit: 'number' },
  { name: 'L:FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL', unit: 'number' },
  { name: 'L:FSDT_GSX_BOARDING_CARGO_PERCENT', unit: 'number' },
  { name: 'L:FSDT_GSX_DEBOARDING_CARGO_PERCENT', unit: 'number' },
]);

const SERVICE_DEFINITIONS = Object.freeze([
  ['boarding', 'Boarding', 'L:FSDT_GSX_BOARDING_STATE'],
  ['deboarding', 'Deboarding', 'L:FSDT_GSX_DEBOARDING_STATE'],
  ['catering', 'Catering', 'L:FSDT_GSX_CATERING_STATE'],
  ['refueling', 'Refueling', 'L:FSDT_GSX_REFUELING_STATE'],
  ['pushback', 'Pushback', 'L:FSDT_GSX_DEPARTURE_STATE'],
  ['deicing', 'De-Icing', 'L:FSDT_GSX_DEICING_STATE'],
]);

const SERVICE_STATES = Object.freeze({
  1: { status: 'available', label: 'AVAILABLE' },
  2: { status: 'unavailable', label: 'UNAVAILABLE' },
  3: { status: 'bypassed', label: 'BYPASSED' },
  4: { status: 'requested', label: 'REQUESTED' },
  5: { status: 'active', label: 'ACTIVE' },
  6: { status: 'completed', label: 'COMPLETED' },
});

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.resolve(value)))];
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function defaultGsxInstallCandidates() {
  const configured = process.env.GSX_ADDON_MANAGER?.trim();
  const programFilesX86 = process.env['ProgramFiles(x86)'] || process.env.PROGRAMFILES_X86;
  const programFiles = process.env.ProgramFiles || process.env.PROGRAMFILES;
  return unique([
    configured,
    programFilesX86 && path.join(programFilesX86, 'Addon Manager'),
    programFiles && path.join(programFiles, 'Addon Manager'),
    'C:\\Program Files (x86)\\Addon Manager',
    'C:\\Program Files\\Addon Manager',
  ]);
}

async function firstExisting(paths) {
  for (const candidate of paths) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile() || stat.isDirectory()) return candidate;
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
  }
  return null;
}

async function defaultProcessDetector() {
  if (process.platform !== 'win32') return false;
  try {
    const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], {
      windowsHide: true,
      timeout: 4_000,
      maxBuffer: 1_000_000,
    });
    return /(?:couatl|couatl64).*\.exe/i.test(stdout);
  } catch {
    return false;
  }
}

function normalizeService(id, label, variable, values, runtimeDetected) {
  const numeric = Math.round(finite(values?.[variable], 0));
  const state = SERVICE_STATES[numeric] || { status: runtimeDetected ? 'waiting' : 'offline', label: runtimeDetected ? 'WAITING' : 'OFFLINE' };
  return {
    id,
    label,
    variable,
    state: numeric || null,
    status: state.status,
    statusLabel: state.label,
    available: numeric === 1,
    active: numeric === 5,
    completed: numeric === 6,
  };
}

export class GsxClient {
  constructor(engine, {
    simConnect = null,
    installCandidates = defaultGsxInstallCandidates(),
    pollMs = 8_000,
    processDetector = defaultProcessDetector,
  } = {}) {
    this.engine = engine;
    this.simConnect = simConnect;
    this.installCandidates = installCandidates;
    this.pollMs = Math.max(4_000, Number(pollMs) || 8_000);
    this.processDetector = processDetector;
    this.timer = null;
    this.stopped = true;
    this.installPath = null;
    this.manualPath = null;
    this.communityPackage = null;
    this.runtimeDetected = false;
    this.payloadSync = null;
    this.stateListener = (state) => this.#publishRuntime(state);
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.simConnect?.configureVariableGroup('gsx', GSX_VARIABLES);
    this.engine.on('change', this.stateListener);
    this.pollOnce();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = null;
    this.engine.off('change', this.stateListener);
  }

  async pollOnce() {
    try {
      this.installPath = await firstExisting(this.installCandidates);
      if (!this.installPath) {
        this.runtimeDetected = false;
        const detail = 'GSX Pro nicht im Standardpfad erkannt · optional GSX_ADDON_MANAGER setzen';
        this.engine.setConnection('gsx', 'waiting', detail);
        this.engine.setIntegration('gsx', {
          status: 'not-detected',
          installed: false,
          connected: false,
          controlEnabled: false,
          installLocation: null,
          manualDetected: false,
          runtimeDetected: false,
          liveData: false,
          detail,
          setupSteps: [
            { id: 'install', label: 'GSX Pro über den FSDT Universal Installer installieren/aktualisieren', complete: false },
            { id: 'community', label: 'GSX-Paket im MSFS Community-Ordner verknüpfen', complete: false },
            { id: 'sim', label: 'MSFS starten und einen Flug laden', complete: false },
            { id: 'couatl', label: 'Couatl/GSX über das MSFS Toolbar-Menü starten', complete: false },
          ],
          services: SERVICE_DEFINITIONS.map(([id, label]) => ({ id, label, status: 'offline', statusLabel: 'OFFLINE', available: false })),
        });
        return;
      }

      this.manualPath = await firstExisting([
        path.join(this.installPath, 'couatl', 'GSX', 'GSX_manual_MSFS.pdf'),
        path.join(this.installPath, 'couatl64', 'GSX', 'GSX_manual_MSFS.pdf'),
        path.join(this.installPath, 'couatl', 'GSX', 'GSX_manual.pdf'),
      ]);
      this.communityPackage = await firstExisting([
        path.join(this.installPath, 'MSFS', 'fsdreamteam-gsx-pro'),
        path.join(this.installPath, 'MSFS', 'fsdreamteam-gsx-world-of-jetways'),
        path.join(this.installPath, 'couatl64', 'GSX'),
      ]);
      this.runtimeDetected = await this.processDetector();
      this.#publishRuntime(this.engine.publicState());
    } catch (error) {
      const detail = `GSX-Status konnte nicht ermittelt werden · ${error.message}`;
      this.engine.setConnection('gsx', 'attention', detail);
      this.engine.setIntegration('gsx', { status: 'error', detail });
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => this.pollOnce(), this.pollMs);
    }
  }

  async syncPayload({ passengers } = {}) {
    const pax = Math.round(finite(passengers, -1));
    if (pax < 0 || pax > 1_000) throw new Error('Passagierzahl für GSX ist ungültig.');
    if (!this.simConnect?.handle) throw new Error('SimConnect ist nicht verbunden.');
    await this.simConnect.setTrustedVariable('L:FSDT_GSX_NUMPASSENGERS', pax, 'number');
    this.payloadSync = { passengers: pax, syncedAt: new Date().toISOString(), source: 'SimBrief / Flight Deck EFB' };
    this.#publishRuntime(this.engine.publicState());
    return structuredClone(this.payloadSync);
  }

  #publishRuntime(state) {
    if (this.stopped) return;
    const simConnected = state.connections?.simConnect?.status === 'connected';
    const packageDetected = Boolean(this.communityPackage);
    const variables = state.integrations?.gsxVariables?.values || {};
    const valuesUpdatedAt = state.integrations?.gsxVariables?.updatedAt || null;
    const liveData = this.runtimeDetected && valuesUpdatedAt && Date.now() - Date.parse(valuesUpdatedAt) < 15_000;
    const services = SERVICE_DEFINITIONS.map(([id, label, variable]) => normalizeService(id, label, variable, variables, this.runtimeDetected));
    const activeServices = services.filter((service) => service.active).map((service) => service.label);
    const passengerTarget = finite(variables['L:FSDT_GSX_NUMPASSENGERS']);
    const boardingPassengers = finite(variables['L:FSDT_GSX_NUMPASSENGERS_BOARDING']);
    const deboardingPassengers = finite(variables['L:FSDT_GSX_NUMPASSENGERS_DEBOARDING']);
    const boardingTotal = finite(variables['L:FSDT_GSX_NUMPASSENGERS_BOARDING_TOTAL']);
    const deboardingTotal = finite(variables['L:FSDT_GSX_NUMPASSENGERS_DEBOARDING_TOTAL']);
    const boardingCargoPercent = finite(variables['L:FSDT_GSX_BOARDING_CARGO_PERCENT']);
    const deboardingCargoPercent = finite(variables['L:FSDT_GSX_DEBOARDING_CARGO_PERCENT']);

    const ready = Boolean(this.installPath && packageDetected && this.runtimeDetected && simConnected);
    const detail = ready
      ? activeServices.length
        ? `GSX live · aktiv: ${activeServices.join(', ')}`
        : liveData ? 'GSX live · Services und Turnaround-Status werden aus dokumentierten LVars gelesen' : 'GSX/Couatl erkannt · warte auf GSX-Live-Daten'
      : !this.installPath
        ? 'GSX Pro nicht erkannt'
        : !packageDetected
          ? 'Addon Manager erkannt · GSX-Paket/Verknüpfung bitte im FSDT Installer prüfen'
          : !simConnected
            ? 'GSX erkannt · warte auf MSFS/SimConnect'
            : 'GSX erkannt · Couatl/GSX im Simulator noch starten';

    this.engine.setConnection('gsx', ready ? 'connected' : 'waiting', detail);
    this.engine.setIntegration('gsx', {
      status: ready ? (liveData ? 'runtime-ready' : 'installed') : simConnected || !packageDetected ? 'attention' : 'installed',
      installed: Boolean(this.installPath),
      connected: ready,
      controlEnabled: false,
      installLocation: this.installPath ? path.basename(this.installPath) : null,
      manualDetected: Boolean(this.manualPath),
      packageDetected,
      runtimeDetected: this.runtimeDetected,
      liveData: Boolean(liveData),
      valuesUpdatedAt,
      detail,
      setupSteps: [
        { id: 'install', label: 'GSX Pro über den FSDT Universal Installer installieren/aktualisieren', complete: Boolean(this.installPath) },
        { id: 'community', label: 'GSX-Paket im FSDT Installer für MSFS verknüpfen', complete: packageDetected },
        { id: 'sim', label: 'MSFS starten und einen Flug laden', complete: simConnected },
        { id: 'couatl', label: 'Couatl/GSX über das MSFS Toolbar-Menü starten', complete: this.runtimeDetected },
        { id: 'live', label: 'GSX-Live-Status über SimConnect empfangen', complete: Boolean(liveData) },
      ],
      services,
      payload: {
        passengerTarget,
        boardingPassengers,
        deboardingPassengers,
        boardingTotal,
        deboardingTotal,
        boardingCargoPercent,
        deboardingCargoPercent,
        sync: this.payloadSync,
      },
    });
  }
}
