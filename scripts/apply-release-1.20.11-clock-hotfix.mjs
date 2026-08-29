import fs from 'node:fs/promises';

async function replaceBlock(filename, startMarker, endMarker, replacement, label) {
  const source = await fs.readFile(filename, 'utf8');
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.20.11 clock hotfix anchor missing: ${label}`);
  const current = source.slice(start, end);
  if (current === replacement) return;
  await fs.writeFile(filename, `${source.slice(0, start)}${replacement}${source.slice(end)}`, 'utf8');
}

const dualClock = `function ensureDualClock() {
  const host = document.querySelector('.home-time');
  if (!host || document.getElementById('flight-overlay-utc')) return;
  host.classList.add('flight-overlay-clock');
  const clock = overlayNode('div', { className: 'flight-overlay-clock-values' });
  const utc = overlayNode('span', { className: 'flight-overlay-clock-item' });
  utc.append(overlayNode('small', { text: 'UTC' }), overlayNode('strong', { id: 'flight-overlay-utc', text: '—' }));
  const local = overlayNode('span', { className: 'flight-overlay-clock-item' });
  local.append(overlayNode('small', { text: 'LOCAL' }), overlayNode('strong', { id: 'flight-overlay-local', text: '—' }));
  clock.append(utc, local);
  host.append(clock);
}

`;

const updateClock = `function updateClock() {
  ensureDualClock();
  const now = new Date();
  const utc = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).format(now);
  const local = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now);
  overlaySet('flight-overlay-utc', utc);
  overlaySet('flight-overlay-local', local);
}

`;

await replaceBlock('public/flight-overlay.js', 'function ensureDualClock() {', 'function ensureHomeFlightPanel() {', dualClock, 'dual clock markup');
await replaceBlock('public/flight-overlay.js', 'function updateClock() {', 'function renderFlightOverlay(state = {}) {', updateClock, 'dual clock values');

console.log('Flight Deck EFB 1.20.11 readable UTC/local clock hotfix materialized.');
