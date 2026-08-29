import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 renderer hotfix requires package version 1.21.0, got ${pkg.version}.`);

const filename = 'public/release-1.21.0.js';
const before = await fs.readFile(filename, 'utf8');
const unsafe = "      if (strong && label) strong.textContent = label;";
const safe = "      if (strong && label && strong.textContent.trim() !== label) strong.textContent = label;";

let after = before;
if (!after.includes(safe)) {
  if (!after.includes(unsafe)) throw new Error('1.21.0 renderer hotfix anchor missing.');
  after = after.replace(unsafe, safe);
}

// The MutationObserver watches child-list changes. Avoid writing the same
// heading text on every observer pass: setting textContent recreates the text
// node and otherwise feeds the observer indefinitely, starving Electron/CDP.
if (after !== before) await fs.writeFile(filename, after, 'utf8');
console.log('Flight Deck EFB 1.21.0 renderer mutation-loop hotfix applied.');
