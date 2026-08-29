import fs from 'node:fs/promises';
import path from 'node:path';

const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (packageJson.version !== '1.21.0') throw new Error(`1.21 compatibility preparation requires package version 1.21.0, got ${packageJson.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

const scripts = (await fs.readdir('scripts'))
  .filter((name) => /^(?:apply-release-1\.20\.|test-release-1\.20\.)/.test(name) && name.endsWith('.mjs'))
  .map((name) => path.join('scripts', name));

for (const filename of scripts) {
  await update(filename, (source) => {
    let next = source;
    next = next.replace(/\[(('1\.20\.[^\]]+?))\]\.includes\((version|pkg\.version)\)/g, (match, list, _inner, variable) => {
      if (list.includes("'1.21.0'")) return match;
      return `[${list}, '1.21.0'].includes(${variable})`;
    });
    next = next.replace(/if \(version !== '(1\.20\.\d+)'\) throw new Error\(([^\n]+)\);/g, (match, release, message) =>
      `if (!['${release}', '1.21.0'].includes(version)) throw new Error(${message});`);
    next = next.replace(/if \(pkg\.version !== '(1\.20\.\d+)'\) throw new Error\(([^\n]+)\);/g, (match, release, message) =>
      `if (!['${release}', '1.21.0'].includes(pkg.version)) throw new Error(${message});`);
    next = next.replace(/const compatibleVersions = \[([^\]]+)\];/g, (match, list) =>
      list.includes("'1.21.0'") ? match : `const compatibleVersions = [${list}, '1.21.0'];`);
    next = next.replace(/\?v=1\.20\.11/g, '?v=${pkg.version}');
    return next;
  });
}

// Previous compatibility scripts deliberately rewrite old guards. When this
// helper is run after them, keep their generated lists open for 1.21.0 too.
for (const filename of ['scripts/prepare-release-1.20.5-compat.mjs', 'scripts/prepare-release-1.20.8-compat.mjs']) {
  await update(filename, (source) => source.replace(/'1\.20\.11'\]/g, "'1.20.11', '1.21.0']"));
}

console.log('Prepared prior Flight Deck 1.20.x release materializers and tests for the 1.21.0 chain.');
