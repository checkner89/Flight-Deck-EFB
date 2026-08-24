import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function unique(values) {
  return [...new Set(values.filter(Boolean).map((value) => path.resolve(value)))];
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

export class GsxClient {
  constructor(engine, {
    installCandidates = defaultGsxInstallCandidates(),
    pollMs = 15_000,
    processDetector = defaultProcessDetector,
  } = {}) {
    this.engine = engine;
    this.installCandidates = installCandidates;
    this.pollMs = pollMs;
    this.processDetector = processDetector;
    this.timer = null;
    this.stopped = true;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.pollOnce();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  async pollOnce() {
    try {
      const installPath = await firstExisting(this.installCandidates);
      if (!installPath) {
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
          detail,
          setupSteps: [
            { id: 'install', label: 'GSX Pro über den FSDT Universal Installer installieren/aktualisieren', complete: false },
            { id: 'community', label: 'GSX-Paket im MSFS Community-Ordner verknüpfen', complete: false },
            { id: 'sim', label: 'MSFS starten und einen Flug laden', complete: false },
            { id: 'couatl', label: 'Couatl/GSX über das MSFS Toolbar-Menü starten', complete: false },
          ],
          services: [],
        });
        return;
      }

      const manualPath = await firstExisting([
        path.join(installPath, 'couatl', 'GSX', 'GSX_manual_MSFS.pdf'),
        path.join(installPath, 'couatl64', 'GSX', 'GSX_manual_MSFS.pdf'),
        path.join(installPath, 'couatl', 'GSX', 'GSX_manual.pdf'),
      ]);
      const communityPackage = await firstExisting([
        path.join(installPath, 'MSFS', 'fsdreamteam-gsx-pro'),
        path.join(installPath, 'MSFS', 'fsdreamteam-gsx-world-of-jetways'),
        path.join(installPath, 'couatl64', 'GSX'),
      ]);
      const simConnected = this.engine.publicState().connections.simConnect?.status === 'connected';
      const runtimeDetected = await this.processDetector();
      const packageDetected = Boolean(communityPackage);
      const detail = simConnected && runtimeDetected && packageDetected
        ? 'GSX und Couatl erkannt · Services werden sicher über das native GSX/Fenix-Menü bedient'
        : !packageDetected
          ? 'Addon Manager erkannt · GSX-Paket/Verknüpfung bitte im FSDT Installer prüfen'
        : simConnected
          ? 'GSX erkannt · Couatl/GSX im Simulator noch starten'
        : 'GSX erkannt · warte auf MSFS/SimConnect';
      this.engine.setConnection('gsx', simConnected && runtimeDetected && packageDetected ? 'connected' : 'waiting', detail);
      this.engine.setIntegration('gsx', {
        status: simConnected && runtimeDetected && packageDetected ? 'runtime-ready' : simConnected || !packageDetected ? 'attention' : 'installed',
        installed: true,
        connected: simConnected && runtimeDetected && packageDetected,
        controlEnabled: false,
        installLocation: path.basename(installPath),
        manualDetected: Boolean(manualPath),
        packageDetected,
        runtimeDetected,
        detail,
        setupSteps: [
          { id: 'install', label: 'GSX Pro über den FSDT Universal Installer installieren/aktualisieren', complete: true },
          { id: 'community', label: 'GSX-Paket im FSDT Installer für MSFS verknüpfen', complete: packageDetected },
          { id: 'sim', label: 'MSFS starten und einen Flug laden', complete: simConnected },
          { id: 'couatl', label: 'Couatl/GSX über das MSFS Toolbar-Menü starten', complete: runtimeDetected },
        ],
        services: [
          { id: 'boarding', label: 'Boarding', available: false },
          { id: 'deboarding', label: 'Deboarding', available: false },
          { id: 'catering', label: 'Catering', available: false },
          { id: 'refueling', label: 'Refueling', available: false },
          { id: 'pushback', label: 'Pushback', available: false },
          { id: 'deicing', label: 'De-Icing', available: false },
        ],
      });
    } catch (error) {
      const detail = `GSX-Status konnte nicht ermittelt werden · ${error.message}`;
      this.engine.setConnection('gsx', 'attention', detail);
      this.engine.setIntegration('gsx', { status: 'error', detail });
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => this.pollOnce(), this.pollMs);
    }
  }
}
