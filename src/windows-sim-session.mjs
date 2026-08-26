import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function candidate(...parts) {
  if (parts.some((part) => !part)) return null;
  return path.join(...parts);
}

function defaultTools() {
  const local = process.env.LOCALAPPDATA;
  const roaming = process.env.APPDATA;
  const programFiles = process.env.ProgramFiles || process.env.PROGRAMFILES;
  const programFilesX86 = process.env['ProgramFiles(x86)'] || process.env.PROGRAMFILES_X86;
  return [
    {
      id: 'msfs2024', label: 'Microsoft Flight Simulator 2024', processHints: ['flightsimulator2024.exe'],
      builtinUri: 'steam://rungameid/2537590',
      candidates: [],
    },
    {
      id: 'sayintentions', label: 'SayIntentions', processHints: ['sayintentions', 'skynet'],
      candidates: [
        candidate(local, 'Programs', 'SayIntentionsAI', 'SayIntentionsAI.exe'),
        candidate(local, 'SayIntentionsAI', 'SayIntentionsAI.exe'),
        candidate(programFiles, 'SayIntentionsAI', 'SayIntentionsAI.exe'),
      ],
    },
    {
      id: 'beyondatc', label: 'BeyondATC', processHints: ['beyondatc.exe', 'beyondatc'],
      candidates: [
        candidate(local, 'Programs', 'BeyondATC', 'BeyondATC.exe'),
        candidate(local, 'BeyondATC', 'BeyondATC.exe'),
        candidate(programFiles, 'BeyondATC', 'BeyondATC.exe'),
      ],
    },
    {
      id: 'vpilot', label: 'vPilot', processHints: ['vpilot.exe'],
      candidates: [
        candidate(local, 'vPilot', 'vPilot.exe'),
        candidate(local, 'Programs', 'vPilot', 'vPilot.exe'),
        candidate(programFilesX86, 'vPilot', 'vPilot.exe'),
      ],
    },
    {
      id: 'simlink', label: 'Navigraph Simlink', processHints: ['navigraph simlink.exe', 'simlink.exe'],
      candidates: [
        candidate(local, 'Programs', 'Navigraph Simlink', 'Navigraph Simlink.exe'),
        candidate(roaming, 'Navigraph Simlink', 'Navigraph Simlink.exe'),
        candidate(programFiles, 'Navigraph Simlink', 'Navigraph Simlink.exe'),
      ],
    },
    {
      id: 'volanta', label: 'Volanta', processHints: ['volanta.exe'],
      candidates: [
        candidate(local, 'Programs', 'Volanta', 'Volanta.exe'),
        candidate(local, 'Volanta', 'Volanta.exe'),
      ],
    },
    {
      id: 'littlenavmap', label: 'Little Navmap', processHints: ['littlenavmap.exe'],
      candidates: [
        candidate(local, 'Programs', 'Little Navmap', 'littlenavmap.exe'),
        candidate(programFiles, 'Little Navmap', 'littlenavmap.exe'),
        candidate(programFilesX86, 'Little Navmap', 'littlenavmap.exe'),
      ],
    },
    {
      id: 'couatl', label: 'GSX / Couatl', processHints: ['couatl64_msfs.exe', 'couatl64'],
      candidates: [
        candidate(programFilesX86, 'Addon Manager', 'couatl64', 'couatl64_MSFS.exe'),
        candidate(programFilesX86, 'Addon Manager', 'couatl64_MSFS.exe'),
        candidate(programFiles, 'Addon Manager', 'couatl64', 'couatl64_MSFS.exe'),
      ],
    },
  ].map((tool) => ({ ...tool, candidates: tool.candidates.filter(Boolean) }));
}

function publicTool(tool, runningProcesses = [], detectedPath = null) {
  const running = tool.processHints.some((hint) => runningProcesses.some((name) => name.includes(hint.toLowerCase())));
  return {
    id: tool.id,
    label: tool.label,
    running,
    launchable: Boolean(detectedPath || tool.builtinUri),
    detected: Boolean(detectedPath),
    path: detectedPath,
    launchMode: detectedPath ? 'executable' : tool.builtinUri ? 'uri' : null,
  };
}

async function fileExists(filename) {
  if (!filename) return false;
  try {
    const stat = await fs.stat(filename);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function firstExisting(candidates) {
  for (const filename of candidates) if (await fileExists(filename)) return filename;
  return null;
}

function normalizeConfiguredPath(value) {
  const resolved = path.resolve(String(value || '').trim());
  if (!/\.exe$/i.test(resolved)) throw new Error('Only Windows .exe files can be configured.');
  return resolved;
}

export class WindowsSimSessionService {
  constructor({ storageDirectory, now = () => new Date() } = {}) {
    this.storageDirectory = storageDirectory || path.join(os.homedir(), '.flight-deck-efb', 'sim-session');
    this.configFile = path.join(this.storageDirectory, 'tools.json');
    this.now = now;
    this.tools = defaultTools();
    this.overrides = {};
    this.statusCache = null;
    this.statusCacheAt = 0;
  }

  async start() {
    try {
      const saved = JSON.parse(await fs.readFile(this.configFile, 'utf8'));
      this.overrides = saved?.overrides && typeof saved.overrides === 'object' ? saved.overrides : {};
    } catch {
      this.overrides = {};
    }
    return this.status({ force: true });
  }

  async stop() {}

  async #processNames() {
    if (process.platform !== 'win32') return [];
    try {
      const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 4_000, maxBuffer: 2 * 1024 * 1024 });
      return String(stdout || '').split(/\r?\n/).map((line) => /^"([^"]+)"/.exec(line)?.[1]?.toLowerCase()).filter(Boolean);
    } catch {
      return [];
    }
  }

  async #detectedPath(tool) {
    const override = this.overrides[tool.id];
    if (override && await fileExists(override)) return override;
    return firstExisting(tool.candidates);
  }

  async status({ force = false } = {}) {
    if (!force && this.statusCache && Date.now() - this.statusCacheAt < 4_000) return this.statusCache;
    if (process.platform !== 'win32') {
      this.statusCache = { supported: false, platform: process.platform, tools: [], updatedAt: this.now().toISOString() };
      this.statusCacheAt = Date.now();
      return this.statusCache;
    }
    const runningProcesses = await this.#processNames();
    const tools = [];
    for (const tool of this.tools) tools.push(publicTool(tool, runningProcesses, await this.#detectedPath(tool)));
    this.statusCache = { supported: true, platform: process.platform, tools, updatedAt: this.now().toISOString() };
    this.statusCacheAt = Date.now();
    return this.statusCache;
  }

  async configure(toolId, executablePath) {
    const tool = this.tools.find((entry) => entry.id === toolId);
    if (!tool) throw new Error('Unknown tool.');
    const resolved = normalizeConfiguredPath(executablePath);
    if (!await fileExists(resolved)) throw new Error('Executable was not found at the configured path.');
    this.overrides[tool.id] = resolved;
    await fs.mkdir(this.storageDirectory, { recursive: true });
    await fs.writeFile(this.configFile, `${JSON.stringify({ overrides: this.overrides }, null, 2)}\n`, 'utf8');
    this.statusCache = null;
    return this.status({ force: true });
  }

  async clearConfiguredPath(toolId) {
    if (!(toolId in this.overrides)) return this.status({ force: true });
    delete this.overrides[toolId];
    await fs.mkdir(this.storageDirectory, { recursive: true });
    await fs.writeFile(this.configFile, `${JSON.stringify({ overrides: this.overrides }, null, 2)}\n`, 'utf8');
    this.statusCache = null;
    return this.status({ force: true });
  }

  async launch(toolId) {
    if (process.platform !== 'win32') throw new Error('Windows tool launching is only available on Windows.');
    const tool = this.tools.find((entry) => entry.id === toolId);
    if (!tool) throw new Error('Unknown tool.');
    const detectedPath = await this.#detectedPath(tool);
    if (detectedPath) {
      const child = spawn(detectedPath, [], { detached: true, stdio: 'ignore', windowsHide: false, cwd: path.dirname(detectedPath) });
      child.unref();
      this.statusCache = null;
      return { accepted: true, id: tool.id, mode: 'executable', label: tool.label };
    }
    if (tool.builtinUri) {
      const child = spawn('explorer.exe', [tool.builtinUri], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
      this.statusCache = null;
      return { accepted: true, id: tool.id, mode: 'uri', label: tool.label };
    }
    throw new Error(`${tool.label} was not found. Configure its executable path in the Windows app first.`);
  }
}
