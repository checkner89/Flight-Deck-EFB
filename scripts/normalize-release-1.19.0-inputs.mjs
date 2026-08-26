import fs from 'node:fs/promises';

for (const filename of ['public/pilot-tools.js', 'src/server.mjs', 'src/electron-main.mjs']) {
  const before = await fs.readFile(filename, 'utf8');
  const after = before.replace(/\r\n/g, '\n');
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

console.log('Normalized 1.19 patch inputs to LF.');
