import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 media capacity patch requires package version 1.21.0, got ${pkg.version}.`);

const filename = 'src/flight-media-service.mjs';
let source = await fs.readFile(filename, 'utf8');

if (!source.includes('async #recoverPartialRecordings()')) {
  source = source.replace(
    `  async start() {
    await fs.mkdir(this.storageDirectory, { recursive: true });
  }`,
    `  async start() {
    await fs.mkdir(this.storageDirectory, { recursive: true });
    await this.#recoverPartialRecordings();
  }

  async #recoverPartialRecordings() {
    const folders = await fs.readdir(this.storageDirectory, { withFileTypes: true }).catch(() => []);
    for (const folder of folders) {
      if (!folder.isDirectory()) continue;
      const directory = path.join(this.storageDirectory, folder.name);
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.part')) continue;
        const partial = path.join(directory, entry.name);
        const stat = await fs.stat(partial).catch(() => null);
        if (!stat?.size) {
          await fs.rm(partial, { force: true }).catch(() => {});
          continue;
        }
        const recovered = partial.replace(/\\.part$/, '').replace(/\\.(webm|mp4)$/i, '-recovered.$1');
        await fs.rename(partial, recovered).catch(() => {});
      }
    }
  }

  async #assertRecordingCapacity(directory) {
    if (typeof fs.statfs !== 'function') return;
    const info = await fs.statfs(directory).catch(() => null);
    if (!info) return;
    const available = Number(info.bavail ?? info.bfree ?? 0) * Number(info.bsize ?? 0);
    const minimum = 512 * 1024 * 1024;
    if (Number.isFinite(available) && available > 0 && available < minimum) {
      throw new Error('Für eine Bildschirmaufnahme sind mindestens 512 MB freier Speicher erforderlich.');
    }
  }`,
  );
}

if (!source.includes('await this.#assertRecordingCapacity(directory);')) {
  source = source.replace(
    `    const directory = await this.#flightDirectory(flightId);
    const id = \`rec-\${Date.now().toString(36)}-\${randomBytes(5).toString('hex')}\`;`,
    `    const directory = await this.#flightDirectory(flightId);
    await this.#assertRecordingCapacity(directory);
    const id = \`rec-\${Date.now().toString(36)}-\${randomBytes(5).toString('hex')}\`;`,
  );
}

await fs.writeFile(filename, source, 'utf8');
console.log('Flight Deck EFB 1.21.0 media free-space guard and crash recovery materialized.');
