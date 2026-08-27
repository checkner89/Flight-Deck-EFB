import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.log', '.md', '.markdown', '.json', '.xml', '.csv', '.tsv', '.ini', '.cfg', '.conf', '.yaml', '.yml',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.css', '.scss', '.html', '.htm', '.svg', '.sql', '.bat', '.cmd', '.ps1',
]);

const MIME_BY_EXTENSION = new Map([
  ['.pdf', 'application/pdf'], ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'],
  ['.gif', 'image/gif'], ['.svg', 'image/svg+xml'], ['.bmp', 'image/bmp'], ['.ico', 'image/x-icon'], ['.mp3', 'audio/mpeg'],
  ['.wav', 'audio/wav'], ['.ogg', 'audio/ogg'], ['.m4a', 'audio/mp4'], ['.mp4', 'video/mp4'], ['.webm', 'video/webm'],
  ['.mov', 'video/quicktime'], ['.json', 'application/json; charset=utf-8'], ['.xml', 'application/xml; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'], ['.htm', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'], ['.csv', 'text/csv; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'], ['.md', 'text/markdown; charset=utf-8'], ['.zip', 'application/zip'],
]);

function cleanName(value) {
  const name = String(value || '').trim();
  if (!name || name === '.' || name === '..' || /[\\/\0]/.test(name)) throw new Error('Ungültiger Datei- oder Ordnername.');
  return name.slice(0, 240);
}

function isHiddenName(name) {
  return String(name || '').startsWith('.') || /^desktop\.ini$/i.test(name) || /^thumbs\.db$/i.test(name);
}

function within(parent, target) {
  const rel = path.relative(parent, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function itemType(stats) {
  if (stats.isDirectory()) return 'directory';
  if (stats.isFile()) return 'file';
  if (stats.isSymbolicLink()) return 'link';
  return 'other';
}

function extensionOf(filename) {
  return path.extname(filename || '').toLowerCase();
}

function mimeFor(filename) {
  return MIME_BY_EXTENSION.get(extensionOf(filename)) || 'application/octet-stream';
}

function previewKind(filename, stats) {
  if (stats.isDirectory()) return 'directory';
  const extension = extensionOf(filename);
  const mime = mimeFor(filename);
  if (TEXT_EXTENSIONS.has(extension) || mime.startsWith('text/')) return 'text';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'binary';
}

async function realpathOrParent(target) {
  try {
    return await fs.realpath(target);
  } catch {
    const parent = path.dirname(target);
    if (parent === target) return path.resolve(target);
    try {
      return path.join(await fs.realpath(parent), path.basename(target));
    } catch {
      return path.resolve(target);
    }
  }
}

export class FileBrowserService {
  constructor({ userDataDirectory = null, homeDirectory = os.homedir(), platform = process.platform } = {}) {
    this.platform = platform;
    this.homeDirectory = path.resolve(homeDirectory || os.homedir());
    const dataRoot = userDataDirectory ? path.resolve(userDataDirectory) : path.join(this.homeDirectory, '.flight-deck-efb');
    this.appRootDirectory = path.join(dataRoot, 'files');
    this.managedFolders = [
      ['briefings', 'Briefings', 'Briefings'],
      ['flight-plans', 'Flight Plans', 'Flight Plans'],
      ['documents', 'Documents', 'Documents'],
      ['imports', 'Imports', 'Imports'],
      ['exports', 'Exports', 'Exports'],
      ['screenshots', 'Screenshots', 'Screenshots'],
    ];
    this.maxTextPreviewBytes = 1_500_000;
    this.maxSearchResults = 500;
    this.maxSearchDirectories = 2_500;
    this.maxUploadBytes = 2 * 1024 * 1024 * 1024;
  }

  normalize(target) {
    const value = String(target || '').trim();
    if (!value || value.includes('\0')) throw new Error('Kein gültiger App-Pfad angegeben.');
    if (!path.isAbsolute(value)) throw new Error('Es wird ein gültiger Flight-Deck-App-Pfad benötigt.');
    return path.normalize(value);
  }

  async ensureStructure() {
    await fs.mkdir(this.appRootDirectory, { recursive: true });
    for (const [, , folder] of this.managedFolders) {
      await fs.mkdir(path.join(this.appRootDirectory, folder), { recursive: true });
    }
  }

  virtualPath(target) {
    const normalized = path.normalize(target);
    const rel = path.relative(this.appRootDirectory, normalized);
    if (!rel || rel === '.') return '/';
    return `/${rel.split(path.sep).join('/')}`;
  }

  async quickRoots() {
    await this.ensureStructure();
    return [
      { id: 'home', label: 'My EFB', path: this.appRootDirectory, displayPath: '/', kind: 'app' },
      ...this.managedFolders.map(([id, label, folder]) => ({
        id,
        label,
        path: path.join(this.appRootDirectory, folder),
        displayPath: `/${folder}`,
        kind: 'app',
      })),
    ];
  }

  async driveRoots() {
    return [];
  }

  async roots({ host = false } = {}) {
    const quick = await this.quickRoots();
    return {
      quick,
      drives: [],
      rootPath: this.appRootDirectory,
      rootLabel: 'My EFB',
      capabilities: {
        write: Boolean(host),
        fullFilesystem: false,
        appScoped: true,
        remoteReadOnly: !host,
        search: true,
        preview: true,
        upload: Boolean(host),
        maxUploadBytes: this.maxUploadBytes,
      },
    };
  }

  async canonicalAppRoot() {
    await this.ensureStructure();
    try { return await fs.realpath(this.appRootDirectory); }
    catch { return path.resolve(this.appRootDirectory); }
  }

  async assertReadable(target) {
    const normalized = this.normalize(target);
    const canonical = await realpathOrParent(normalized);
    const root = await this.canonicalAppRoot();
    if (!within(root, canonical)) throw new Error('Dieser Pfad gehört nicht zum Flight-Deck-EFB-Speicher.');
    return normalized;
  }

  async assertWritable(target, { host = false } = {}) {
    if (!host) throw new Error('Dateiänderungen sind nur in der Windows-App erlaubt.');
    const normalized = this.normalize(target);
    const canonical = await realpathOrParent(normalized);
    const root = await this.canonicalAppRoot();
    if (!within(root, canonical)) throw new Error('Dateien können nur innerhalb des Flight-Deck-EFB-Speichers geändert werden.');
    return normalized;
  }

  async metadata(target, { host = false } = {}) {
    const resolved = await this.assertReadable(target);
    const stats = await fs.lstat(resolved);
    const root = path.normalize(this.appRootDirectory);
    return {
      name: resolved === root ? 'My EFB' : path.basename(resolved),
      path: resolved,
      displayPath: this.virtualPath(resolved),
      parent: resolved === root ? root : path.dirname(resolved),
      type: itemType(stats),
      size: stats.isFile() ? stats.size : null,
      modifiedAt: stats.mtime?.toISOString?.() || null,
      createdAt: stats.birthtime?.toISOString?.() || null,
      extension: extensionOf(resolved),
      mime: mimeFor(resolved),
      preview: previewKind(resolved, stats),
      hidden: isHiddenName(path.basename(resolved)),
      readonly: !host,
    };
  }

  async list(target, { host = false, showHidden = false } = {}) {
    const resolved = await this.assertReadable(target);
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) throw new Error('Der angegebene Pfad ist kein Ordner.');
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!showHidden && isHiddenName(entry.name)) continue;
      const fullPath = path.join(resolved, entry.name);
      let stat;
      try { stat = await fs.lstat(fullPath); }
      catch { continue; }
      items.push({
        name: entry.name,
        path: fullPath,
        displayPath: this.virtualPath(fullPath),
        type: itemType(stat),
        size: stat.isFile() ? stat.size : null,
        modifiedAt: stat.mtime?.toISOString?.() || null,
        extension: extensionOf(entry.name),
        mime: mimeFor(entry.name),
        preview: previewKind(entry.name, stat),
        hidden: isHiddenName(entry.name),
        readonly: !host,
      });
    }
    const root = path.normalize(this.appRootDirectory);
    return {
      path: resolved,
      displayPath: this.virtualPath(resolved),
      parent: resolved === root ? root : path.dirname(resolved),
      items,
    };
  }

  async search(target, query, { host = false, showHidden = false, limit = this.maxSearchResults } = {}) {
    const root = await this.assertReadable(target);
    const needle = String(query || '').trim().toLocaleLowerCase();
    if (!needle) return { path: root, displayPath: this.virtualPath(root), query: '', items: [], truncated: false };
    const resultLimit = Math.max(1, Math.min(this.maxSearchResults, Number(limit) || this.maxSearchResults));
    const queue = [root];
    const items = [];
    let scannedDirectories = 0;
    while (queue.length && items.length < resultLimit && scannedDirectories < this.maxSearchDirectories) {
      const directory = queue.shift();
      scannedDirectories += 1;
      let entries;
      try { entries = await fs.readdir(directory, { withFileTypes: true }); }
      catch { continue; }
      for (const entry of entries) {
        if (!showHidden && isHiddenName(entry.name)) continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) queue.push(fullPath);
        if (!entry.name.toLocaleLowerCase().includes(needle)) continue;
        let stat;
        try { stat = await fs.lstat(fullPath); }
        catch { continue; }
        items.push({
          name: entry.name,
          path: fullPath,
          displayPath: this.virtualPath(fullPath),
          type: itemType(stat),
          size: stat.isFile() ? stat.size : null,
          modifiedAt: stat.mtime?.toISOString?.() || null,
          extension: extensionOf(entry.name),
          mime: mimeFor(entry.name),
          preview: previewKind(entry.name, stat),
          hidden: isHiddenName(entry.name),
          readonly: !host,
        });
        if (items.length >= resultLimit) break;
      }
    }
    return {
      path: root,
      displayPath: this.virtualPath(root),
      query: String(query),
      items,
      truncated: queue.length > 0 || scannedDirectories >= this.maxSearchDirectories,
      scannedDirectories,
    };
  }

  async preview(target, { host = false } = {}) {
    const meta = await this.metadata(target, { host });
    if (meta.preview !== 'text' || meta.size === null) return { ...meta, text: null, truncated: false };
    const buffer = await fs.readFile(meta.path);
    const truncated = buffer.length > this.maxTextPreviewBytes;
    const text = buffer.subarray(0, this.maxTextPreviewBytes).toString('utf8');
    return { ...meta, text, truncated };
  }

  async mkdir(directory, name, { host = false } = {}) {
    const parent = await this.assertWritable(directory, { host });
    const target = path.join(parent, cleanName(name));
    await this.assertWritable(target, { host });
    await fs.mkdir(target, { recursive: false });
    return this.metadata(target, { host: true });
  }

  async createFile(directory, name, { host = false } = {}) {
    const parent = await this.assertWritable(directory, { host });
    const target = path.join(parent, cleanName(name));
    await this.assertWritable(target, { host });
    const handle = await fs.open(target, 'wx');
    await handle.close();
    return this.metadata(target, { host: true });
  }

  async writeText(target, content, { host = false } = {}) {
    const resolved = await this.assertWritable(target, { host });
    const value = String(content ?? '');
    if (Buffer.byteLength(value, 'utf8') > 8 * 1024 * 1024) throw new Error('Textdateien können bis 8 MB direkt bearbeitet werden.');
    await fs.writeFile(resolved, value, 'utf8');
    return this.metadata(resolved, { host: true });
  }

  async rename(target, name, { host = false } = {}) {
    const source = await this.assertWritable(target, { host });
    const protectedRoots = new Set((await this.quickRoots()).map((item) => path.normalize(item.path).toLocaleLowerCase()));
    if (protectedRoots.has(path.normalize(source).toLocaleLowerCase())) throw new Error('Ein fester Flight-Deck-Ordner kann nicht umbenannt werden.');
    const destination = path.join(path.dirname(source), cleanName(name));
    await this.assertWritable(destination, { host });
    await fs.rename(source, destination);
    return this.metadata(destination, { host: true });
  }

  async copyInto(source, destinationDirectory, { host = false } = {}) {
    const from = await this.assertWritable(source, { host });
    const destination = await this.assertWritable(destinationDirectory, { host });
    const target = path.join(destination, path.basename(from));
    await this.assertWritable(target, { host });
    try { await fs.access(target); throw new Error('Am Ziel existiert bereits ein Eintrag mit diesem Namen.'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const stat = await fs.lstat(from);
    if (stat.isDirectory()) await fs.cp(from, target, { recursive: true, force: false, errorOnExist: true, preserveTimestamps: true });
    else await fs.copyFile(from, target, constants.COPYFILE_EXCL);
    return this.metadata(target, { host: true });
  }

  async moveInto(source, destinationDirectory, { host = false } = {}) {
    const from = await this.assertWritable(source, { host });
    const protectedRoots = new Set((await this.quickRoots()).map((item) => path.normalize(item.path).toLocaleLowerCase()));
    if (protectedRoots.has(path.normalize(from).toLocaleLowerCase())) throw new Error('Ein fester Flight-Deck-Ordner kann nicht verschoben werden.');
    const destination = await this.assertWritable(destinationDirectory, { host });
    const target = path.join(destination, path.basename(from));
    await this.assertWritable(target, { host });
    try { await fs.access(target); throw new Error('Am Ziel existiert bereits ein Eintrag mit diesem Namen.'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    try {
      await fs.rename(from, target);
    } catch (error) {
      if (error?.code !== 'EXDEV') throw error;
      await this.copyInto(from, destination, { host: true });
      await fs.rm(from, { recursive: true, force: false });
    }
    return this.metadata(target, { host: true });
  }

  async remove(target, { host = false } = {}) {
    const resolved = await this.assertWritable(target, { host });
    const protectedRoots = new Set((await this.quickRoots()).map((item) => path.normalize(item.path).toLocaleLowerCase()));
    if (protectedRoots.has(path.normalize(resolved).toLocaleLowerCase())) throw new Error('Ein fester Flight-Deck-Ordner kann nicht gelöscht werden.');
    await fs.rm(resolved, { recursive: true, force: false, maxRetries: 2, retryDelay: 100 });
    return { removed: true, path: resolved, displayPath: this.virtualPath(resolved) };
  }

  async receiveUpload(directory, name, readable, { host = false, overwrite = false } = {}) {
    const parent = await this.assertWritable(directory, { host });
    const target = path.join(parent, cleanName(name));
    await this.assertWritable(target, { host });
    if (!overwrite) {
      try { await fs.access(target); throw new Error('Am Ziel existiert bereits eine Datei mit diesem Namen.'); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
    }
    const temp = path.join(parent, `.${path.basename(target)}.${randomUUID()}.upload`);
    const handle = await fs.open(temp, 'wx');
    let bytes = 0;
    try {
      for await (const chunk of readable) {
        bytes += chunk.length;
        if (bytes > this.maxUploadBytes) throw new Error('Upload überschreitet das 2-GB-Limit.');
        await handle.write(chunk);
      }
      await handle.close();
      if (overwrite) await fs.rm(target, { recursive: true, force: true });
      await fs.rename(temp, target);
      return { ...(await this.metadata(target, { host: true })), uploadedBytes: bytes };
    } catch (error) {
      try { await handle.close(); } catch { /* already closed */ }
      await fs.rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }
}

export { mimeFor };
