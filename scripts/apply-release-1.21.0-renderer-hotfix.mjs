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

// Guard the observer callback against re-entrant child-list churn. The home
// simplifier deliberately changes the DOM, so schedule one coalesced pass per
// animation frame rather than recursively processing its own mutations.
const oldObserver = `  const observer = new MutationObserver(() => {\n    simplifyHome(); removeLargeAppHeadings(); ensureHomeButton(); removeSeparateTrafficNavigation(); ensureMediaPage(); ensureTrackingTimePanel(); ensureArrivalTaxiControls(); constrainTaxiMap();\n  });\n  observer.observe(document.documentElement, { childList: true, subtree: true });`;
const newObserver = `  let observerRefreshPending = false;\n  const observer = new MutationObserver(() => {\n    if (observerRefreshPending) return;\n    observerRefreshPending = true;\n    requestAnimationFrame(() => {\n      observerRefreshPending = false;\n      simplifyHome(); removeLargeAppHeadings(); ensureHomeButton(); removeSeparateTrafficNavigation(); ensureMediaPage(); ensureTrackingTimePanel(); ensureArrivalTaxiControls(); constrainTaxiMap();\n    });\n  });\n  observer.observe(document.documentElement, { childList: true, subtree: true });`;
if (!after.includes('let observerRefreshPending = false;')) {
  if (!after.includes(oldObserver)) throw new Error('1.21.0 mutation-observer hotfix anchor missing.');
  after = after.replace(oldObserver, newObserver);
}

if (after !== before) await fs.writeFile(filename, after, 'utf8');
console.log('Flight Deck EFB 1.21.0 renderer mutation-loop hotfix applied.');
