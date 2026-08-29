import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 renderer hotfix requires package version 1.21.0, got ${pkg.version}.`);

const filename = 'public/release-1.21.0.js';
const before = await fs.readFile(filename, 'utf8');
let after = before;

const unsafeHeading = "      if (strong && label) strong.textContent = label;";
const safeHeading = "      if (strong && label && strong.textContent.trim() !== label) strong.textContent = label;";
if (!after.includes(safeHeading)) {
  if (!after.includes(unsafeHeading)) throw new Error('1.21.0 heading mutation hotfix anchor missing.');
  after = after.replace(unsafeHeading, safeHeading);
}

const unsafeExitOptions = "      select.innerHTML = '<option value=\"\">Exit noch unbekannt</option>' + exits.map((entry) => `<option value=\"${escapeHtml(entry.ref)}\">${escapeHtml(entry.ref)}</option>`).join('');";
const safeExitOptions = "      const exitOptionsMarkup = '<option value=\"\">Exit noch unbekannt</option>' + exits.map((entry) => `<option value=\"${escapeHtml(entry.ref)}\">${escapeHtml(entry.ref)}</option>`).join('');\n      if (select.innerHTML !== exitOptionsMarkup) select.innerHTML = exitOptionsMarkup;";
if (!after.includes('const exitOptionsMarkup =')) {
  if (!after.includes(unsafeExitOptions)) throw new Error('1.21.0 runway-exit mutation hotfix anchor missing.');
  after = after.replace(unsafeExitOptions, safeExitOptions);
}

// The release runtime observes child-list changes. Only mutate text/options when
// their content actually changes; otherwise the observer feeds itself forever
// and starves the Electron renderer/DevTools protocol during packaged startup.
if (after !== before) await fs.writeFile(filename, after, 'utf8');
console.log('Flight Deck EFB 1.21.0 renderer mutation-loop hotfix applied.');
