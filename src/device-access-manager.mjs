import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const SCHEMA_VERSION = 1;

function defaultDirectory() {
  if (process.env.FLIGHT_DECK_EFB_DATA_DIR) return path.join(path.resolve(process.env.FLIGHT_DECK_EFB_DATA_DIR), 'access');
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'Flight Deck EFB', 'access');
  return path.join(os.homedir(), '.flight-deck-efb', 'access');
}

function hashToken(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function safeText(value, length = 80) {
  return String(value || '').trim().replace(/[\u0000-\u001f]/g, '').slice(0, length);
}

function publicDevice(device) {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform || null,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt || null,
  };
}

export class DeviceAccessManager {
  constructor({ storageDirectory = defaultDirectory(), now = () => new Date() } = {}) {
    this.storageDirectory = storageDirectory;
    this.filePath = path.join(storageDirectory, 'devices.json');
    this.now = now;
    this.sharingEnabled = true;
    this.devices = [];
    this.saveTimer = null;
  }

  async start() {
    try {
      const saved = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      this.sharingEnabled = saved.sharingEnabled !== false;
      this.devices = (Array.isArray(saved.devices) ? saved.devices : []).slice(0, 50).filter((entry) => (
        /^[a-f0-9-]{16,80}$/i.test(String(entry?.id || ''))
        && /^[a-f0-9]{64}$/.test(String(entry?.tokenHash || ''))
      )).map((entry) => ({
        id: String(entry.id), tokenHash: String(entry.tokenHash), name: safeText(entry.name) || 'Tablet',
        platform: safeText(entry.platform, 120) || null, createdAt: entry.createdAt || null, lastSeenAt: entry.lastSeenAt || null,
      }));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        try { await fs.rename(this.filePath, `${this.filePath}.corrupt-${Date.now()}`); } catch { /* Keep the safe empty state. */ }
      }
    }
    await this.#save();
  }

  stop() {
    clearTimeout(this.saveTimer);
    return this.#save();
  }

  async pair({ name = 'Tablet', platform = null } = {}) {
    const token = randomBytes(32).toString('base64url');
    const now = this.now().toISOString();
    const device = {
      id: randomUUID(),
      tokenHash: hashToken(token),
      name: safeText(name) || 'Tablet',
      platform: safeText(platform, 120) || null,
      createdAt: now,
      lastSeenAt: now,
    };
    this.devices.unshift(device);
    this.devices = this.devices.slice(0, 50);
    await this.#save();
    return { token, device: publicDevice(device) };
  }

  authenticate(token) {
    const candidateHash = hashToken(token);
    const candidate = Buffer.from(candidateHash);
    const device = this.devices.find((entry) => {
      const stored = Buffer.from(entry.tokenHash);
      return stored.length === candidate.length && timingSafeEqual(stored, candidate);
    });
    if (!device) return null;
    const now = this.now();
    if (!device.lastSeenAt || now.getTime() - Date.parse(device.lastSeenAt) > 60_000) {
      device.lastSeenAt = now.toISOString();
      this.#scheduleSave();
    }
    return publicDevice(device);
  }

  list() {
    return this.devices.map(publicDevice);
  }

  async revoke(id) {
    const prior = this.devices.length;
    this.devices = this.devices.filter((entry) => entry.id !== String(id || ''));
    if (this.devices.length === prior) return false;
    await this.#save();
    return true;
  }

  async setSharingEnabled(enabled) {
    this.sharingEnabled = Boolean(enabled);
    await this.#save();
    return this.sharingEnabled;
  }

  #scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.#save().catch(() => {}), 500);
  }

  async #save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    await fs.mkdir(this.storageDirectory, { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, sharingEnabled: this.sharingEnabled, devices: this.devices }, null, 2)}\n`, 'utf8');
    try {
      await fs.rename(temporary, this.filePath);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      await fs.rm(this.filePath, { force: true });
      await fs.rename(temporary, this.filePath);
    }
  }
}
