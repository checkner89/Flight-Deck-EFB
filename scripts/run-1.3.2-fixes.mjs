import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const normalizeDirectory = (relative) => {
  const directory = path.join(root, relative);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      normalizeDirectory(rel);
      continue;
    }
    if (!/\.(?:mjs|js|html|css|json|md|webmanifest)$/i.test(entry.name)) continue;
    const absolute = path.join(root, rel);
    const current = fs.readFileSync(absolute, 'utf8');
    const normalized = current.replace(/\r\n/g, '\n');
    if (current !== normalized) fs.writeFileSync(absolute, normalized, 'utf8');
  }
};

normalizeDirectory('src');
normalizeDirectory('public');
for (const rel of ['THIRD_PARTY_NOTICES.md']) {
  const absolute = path.join(root, rel);
  const current = fs.readFileSync(absolute, 'utf8');
  const normalized = current.replace(/\r\n/g, '\n');
  if (current !== normalized) fs.writeFileSync(absolute, normalized, 'utf8');
}

await import('./apply-1.3.2-fixes.mjs');
