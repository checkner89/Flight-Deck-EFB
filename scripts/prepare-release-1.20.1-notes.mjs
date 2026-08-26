import fs from 'node:fs/promises';

const filename = 'CHANGELOG.md';
const before = await fs.readFile(filename, 'utf8');
if (!/^## 1\.20\.1\b/m.test(before)) {
  const notes = await fs.readFile('release-notes/1.20.1.md', 'utf8');
  const section = `${notes.trim()}\n\n`;
  const next = before.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${section}`);
  await fs.writeFile(filename, next, 'utf8');
}
console.log('Prepared Flight Deck EFB 1.20.1 changelog section.');
