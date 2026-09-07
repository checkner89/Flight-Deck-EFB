import fs from 'node:fs/promises';

// Legacy release preparation reconstructs runtime files. Apply reviewed, contextual
// changes last, and fail loudly if that baseline changes instead of silently skipping.
const patches = JSON.parse(await fs.readFile(new URL('./reliability-transforms.json', import.meta.url), 'utf8'));
for (const { file, before, after } of patches) {
  const source = await fs.readFile(file, 'utf8');
  if (source.includes(after)) continue;
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error(`Reliability baseline changed in ${file}; review the contextual transform.`);
  }
  await fs.writeFile(file, source.replace(before, () => after));
}
// Older reconstruction scripts can recreate these files even after News is removed.
for (const file of ['public/news-app.js', 'public/news-app.css', 'src/news-feed-service.mjs']) {
  await fs.rm(file, { force: true });
}
console.log('Updater, traffic and taxi reliability changes applied.');
