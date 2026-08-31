import fs from 'node:fs/promises';

const filename = 'public/app.js';
let source = await fs.readFile(filename, 'utf8');
let changed = false;

// Keep the established 1.24.8 renderer call literal so its baseline regression and
// repeat materialization remain valid. Apply the new spatial dedupe inside the
// fd1248 merged feed instead of wrapping the renderer call itself.
const wrappedRenderer = 'const entries = fd1249DedupeTraffic(fd1248TrafficEntries(state)).slice(0, 120);';
const baselineRenderer = 'const entries = fd1248TrafficEntries(state).slice(0, 120);';
if (source.includes(wrappedRenderer)) {
  source = source.replaceAll(wrappedRenderer, baselineRenderer);
  changed = true;
}

const oldReturn = 'return values.slice(0, 160);';
const dedupedReturn = 'return fd1249DedupeTraffic(values).slice(0, 160);';
if (source.includes(oldReturn)) {
  source = source.replace(oldReturn, dedupedReturn);
  changed = true;
} else if (!source.includes(dedupedReturn)) {
  throw new Error('1.24.9 idempotency: fd1248 Traffic merge return anchor missing.');
}

if (!source.includes(baselineRenderer)) throw new Error('1.24.9 idempotency: 1.24.8 renderer contract is missing.');
if (!source.includes(dedupedReturn)) throw new Error('1.24.9 idempotency: spatial dedupe is not active in the merged Traffic feed.');

if (changed) {
  await fs.writeFile(filename, source, 'utf8');
  console.log('FLYXORA 1.24.9 Traffic dedupe moved into the merged feed for repeat-safe materialization.');
} else {
  console.log('FLYXORA 1.24.9 repeat-safe Traffic dedupe already materialized.');
}
