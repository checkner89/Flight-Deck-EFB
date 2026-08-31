import fs from 'node:fs/promises';

// The 1.24.9 candidate wraps the established 1.24.8 Traffic feed with a spatial
// dedupe pass. prepare:release intentionally runs more than once in CI/builds, so
// normalize only that call site before the 1.24.8 candidate materializer reruns.
// The 1.24.9 materializer reapplies dedupe at the end of the chain.
const filename = 'public/app.js';
let source = await fs.readFile(filename, 'utf8');
const candidateLine = 'const entries = fd1249DedupeTraffic(fd1248TrafficEntries(state)).slice(0, 120);';
const baselineLine = 'const entries = fd1248TrafficEntries(state).slice(0, 120);';

if (source.includes(candidateLine)) {
  source = source.replaceAll(candidateLine, baselineLine);
  await fs.writeFile(filename, source, 'utf8');
  console.log('FLYXORA 1.24.9 repeat-run Traffic source normalized for 1.24.8 compatibility.');
} else {
  console.log('FLYXORA 1.24.9 repeat-run compatibility already normalized.');
}
