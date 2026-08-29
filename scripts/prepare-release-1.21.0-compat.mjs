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
    next = next.replace(/\[([^\]\n]*'1\.20\.[^\]\n]*)\]\.includes\((version|pkg\.version)\)/g, (match, list, variable) => {
      if (list.includes("'1.21.0'")) return match;
      return `[${list}, '1.21.0'].includes(${variable})`;
    });
    next = next.replace(/if \(version !== '(1\.20\.\d+)'\) throw new Error\(([^\n]+)\);/g, (match, release, message) =>
      `if (!['${release}', '1.21.0'].includes(version)) throw new Error(${message});`);
    next = next.replace(/if \(pkg\.version !== '(1\.20\.\d+)'\) throw new Error\(([^\n]+)\);/g, (match, release, message) =>
      `if (!['${release}', '1.21.0'].includes(pkg.version)) throw new Error(${message});`);
    next = next.replace(/const compatibleVersions = \[([^\]]+)\];/g, (match, list) =>
      list.includes("'1.21.0'") ? match : `const compatibleVersions = [${list}, '1.21.0'];`);
    return next;
  });
}

// Previous compatibility scripts rewrite legacy guards during the prepare chain.
// Rewrite their generated version lists as well, then run this helper a second
// time after 1.20.8 compatibility preparation (see package.json).
for (const filename of ['scripts/prepare-release-1.20.5-compat.mjs', 'scripts/prepare-release-1.20.8-compat.mjs']) {
  await update(filename, (source) => source.replace(/'1\.20\.11'\]/g, "'1.20.11', '1.21.0']"));
}

await update('scripts/test-release-1.20.11.mjs', (source) => {
  let next = source;
  next = next.replace(
    "if (pkg.version !== '1.20.11') throw new Error(`Expected package version 1.20.11, got ${pkg.version}.`);",
    "if (!['1.20.11', '1.21.0'].includes(pkg.version)) throw new Error(`Expected package version 1.20.11+, got ${pkg.version}.`);",
  );
  next = next.replace(
    "need(server, \"const APP_VERSION = '1.20.11';\", 'Server version was not materialized to 1.20.11.');",
    "need(server, `const APP_VERSION = '${pkg.version}';`, `Server version was not materialized to ${pkg.version}.`);",
  );
  next = next.replace(
    "need(html, 'release-1.20.11.css?v=1.20.11', '1.20.11 stylesheet is not wired.');",
    "need(html, `release-1.20.11.css?v=${pkg.version}`, '1.20.11 compatibility stylesheet is not wired.');",
  );
  next = next.replace(
    "need(serviceWorker, \"flight-deck-efb-v12011-profile-landing1\", 'Service-worker cache was not bumped for flight-profile assets.');",
    "if (!serviceWorker.includes('flight-deck-efb-v12011-profile-landing1') && !serviceWorker.includes('flight-deck-efb-v1210-backlog1')) throw new Error('Service-worker cache was not bumped for flight-profile assets.');",
  );
  return next;
});

console.log('Prepared prior Flight Deck 1.20.x release materializers and tests for the 1.21.0 chain.');
