import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

function safeId(value, fallback = 'unassigned') {
  const text = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return text ? text.slice(0, 96) : fallback;
}

function mediaExtension(contentType, kind) {
  const type = String(contentType || '').toLowerCase();
  if (kind === 'screenshot') return type.includes('jpeg') ? 'jpg' : 'png';
  if (type.includes('mp4')) return 'mp4';
  return 'webm';
}

function isoFileStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

export class FlightMediaService {
  constructor({ storageDirectory } = {}) {
    this.storageDirectory = path.resolve(storageDirectory || path.join(process.cwd(), '.flight-deck-efb-data', 'media'));
    this.recordings = new Map();
  }

  async start() {
    await fs.mkdir(this.storageDirectory, { recursive: true });
  }

  async #flightDirectory(flightId) {
    const directory = path.join(this.storageDirectory, safeId(flightId));
    await fs.mkdir(directory, { recursive: true });
    return directory;
  }

  async saveScreenshot(buffer, { flightId, callsign, contentType = 'image/png' } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new Error('Screenshot enthält keine Bilddaten.');
    const directory = await this.#flightDirectory(flightId);
    const ext = mediaExtension(contentType, 'screenshot');
    const filename = `${isoFileStamp()}-${safeId(callsign, 'flight')}-screenshot.${ext}`;
    const filepath = path.join(directory, filename);
    await fs.writeFile(filepath, buffer);
    return this.#metadata(filepath, { flightId, kind: 'screenshot', contentType });
  }

  async beginRecording({ flightId, callsign, contentType = 'video/webm' } = {}) {
    const directory = await this.#flightDirectory(flightId);
    const id = `rec-${Date.now().toString(36)}-${randomBytes(5).toString('hex')}`;
    const ext = mediaExtension(contentType, 'recording');
    const filename = `${isoFileStamp()}-${safeId(callsign, 'flight')}-recording.${ext}`;
    const finalPath = path.join(directory, filename);
    const partialPath = `${finalPath}.part`;
    await fs.writeFile(partialPath, Buffer.alloc(0));
    this.recordings.set(id, {
      id,
      flightId: safeId(flightId),
      contentType,
      finalPath,
      partialPath,
      startedAt: new Date().toISOString(),
      bytes: 0,
    });
    return { id, filename, startedAt: this.recordings.get(id).startedAt };
  }

  async appendRecordingChunk(id, buffer) {
    const recording = this.recordings.get(String(id));
    if (!recording) throw new Error('Aufnahme wurde nicht gefunden oder bereits beendet.');
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { id: recording.id, bytes: recording.bytes };
    await fs.appendFile(recording.partialPath, buffer);
    recording.bytes += buffer.length;
    return { id: recording.id, bytes: recording.bytes };
  }

  async finishRecording(id) {
    const recording = this.recordings.get(String(id));
    if (!recording) throw new Error('Aufnahme wurde nicht gefunden oder bereits beendet.');
    this.recordings.delete(String(id));
    const stat = await fs.stat(recording.partialPath);
    if (!stat.size) {
      await fs.rm(recording.partialPath, { force: true });
      throw new Error('Die Bildschirmaufnahme enthält keine Videodaten.');
    }
    await fs.rename(recording.partialPath, recording.finalPath);
    return this.#metadata(recording.finalPath, {
      flightId: recording.flightId,
      kind: 'recording',
      contentType: recording.contentType,
      startedAt: recording.startedAt,
    });
  }

  async abortRecording(id) {
    const recording = this.recordings.get(String(id));
    if (!recording) return false;
    this.recordings.delete(String(id));
    try {
      const stat = await fs.stat(recording.partialPath);
      if (stat.size > 0) {
        const recoveredPath = recording.finalPath.replace(/\.(webm|mp4)$/i, '-recovered.$1');
        await fs.rename(recording.partialPath, recoveredPath);
      } else {
        await fs.rm(recording.partialPath, { force: true });
      }
    } catch {
      // Best-effort recovery only.
    }
    return true;
  }

  async list({ flightId = null } = {}) {
    const folders = flightId ? [safeId(flightId)] : await fs.readdir(this.storageDirectory).catch(() => []);
    const items = [];
    for (const folder of folders) {
      const directory = path.join(this.storageDirectory, folder);
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile() || entry.name.endsWith('.part')) continue;
        const filepath = path.join(directory, entry.name);
        const stat = await fs.stat(filepath).catch(() => null);
        if (!stat) continue;
        const lower = entry.name.toLowerCase();
        const kind = /\.(png|jpe?g)$/.test(lower) ? 'screenshot' : 'recording';
        const contentType = lower.endsWith('.png') ? 'image/png'
          : /\.jpe?g$/.test(lower) ? 'image/jpeg'
            : lower.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
        items.push({
          id: `${folder}/${entry.name}`,
          flightId: folder,
          filename: entry.name,
          kind,
          contentType,
          size: stat.size,
          createdAt: stat.birthtime?.toISOString?.() || stat.mtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
        });
      }
    }
    return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async read(id) {
    const safe = this.#resolveMediaId(id);
    const stat = await fs.stat(safe.filepath);
    if (!stat.isFile()) throw new Error('Mediendatei wurde nicht gefunden.');
    return {
      ...safe,
      body: await fs.readFile(safe.filepath),
      contentType: safe.filename.toLowerCase().endsWith('.png') ? 'image/png'
        : /\.jpe?g$/i.test(safe.filename) ? 'image/jpeg'
          : safe.filename.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'video/webm',
    };
  }

  async delete(id) {
    const safe = this.#resolveMediaId(id);
    await fs.rm(safe.filepath, { force: true });
    return true;
  }

  #resolveMediaId(id) {
    const decoded = decodeURIComponent(String(id ?? ''));
    const [flightId, ...nameParts] = decoded.split('/');
    const filename = nameParts.join('/');
    if (!flightId || !filename || filename.includes('..') || /[\\]/.test(filename)) throw new Error('Ungültige Medienkennung.');
    const folder = safeId(flightId);
    const filepath = path.resolve(this.storageDirectory, folder, filename);
    const base = `${path.resolve(this.storageDirectory)}${path.sep}`;
    if (!filepath.startsWith(base)) throw new Error('Ungültige Medienkennung.');
    return { flightId: folder, filename, filepath };
  }

  async #metadata(filepath, { flightId, kind, contentType, startedAt = null } = {}) {
    const stat = await fs.stat(filepath);
    const folder = path.basename(path.dirname(filepath));
    const filename = path.basename(filepath);
    return {
      id: `${folder}/${filename}`,
      flightId: safeId(flightId),
      filename,
      kind,
      contentType,
      size: stat.size,
      createdAt: stat.birthtime?.toISOString?.() || stat.mtime.toISOString(),
      startedAt,
    };
  }
}
