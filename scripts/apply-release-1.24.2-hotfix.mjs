import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.24.2') throw new Error(`1.24.2 hotfix requires package version 1.24.2, got ${pkg.version}.`);

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.24.2 hotfix range missing: ${label}`);
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

await update('public/live-traffic.js', (source) => {
  const replacement = String.raw`export function trafficAircraftLabel(entry = {}) {
  const raw = String(entry.aircraftType || entry.typeDesignator || entry.model || entry.title || entry.aircraftTitle || '').replace(/[_]+/g, ' ').trim();
  const upper = raw.toUpperCase();
  const compact = upper.replace(/\s+/g, '');
  if (/\bA20N\b|A320.*(?:NEO|LEAP|PW1)/i.test(raw)) return 'A320neo';
  if (/\bA21N\b|A321.*(?:NEO|LEAP|PW1)/i.test(raw)) return 'A321neo';
  if (/\bA319\b|AIRBUS\s+A?319/i.test(raw)) return 'A319-100';
  if (/\bA320\b|AIRBUS\s+A?320/i.test(raw)) return 'A320-200';
  if (/\bA321\b|AIRBUS\s+A?321/i.test(raw)) return 'A321-200';
  if (/\bA330\b|AIRBUS\s+A?330/i.test(raw)) return 'A330';
  if (/\bA350\b|AIRBUS\s+A?350/i.test(raw)) return 'A350';
  if (/\bB738\b|737[- ]?8(?:00)?\b|BOEING\s+737[- ]?800/i.test(raw)) return 'B737-800';
  if (/\bB739\b|737[- ]?9(?:00)?\b|BOEING\s+737[- ]?900/i.test(raw)) return 'B737-900';
  if (/\bB737\b|BOEING\s+737/i.test(raw)) return 'B737';
  if (/\bB77[78]\b|BOEING\s+777/i.test(raw)) return 'B777';
  if (/\bB78[89X]\b|BOEING\s+787/i.test(raw)) return 'B787';
  if (/\bE17[05]\b|EMBRAER\s+E?17[05]/i.test(raw)) return compact.includes('175') ? 'E175' : 'E170';
  if (/\bE19[05]\b|EMBRAER\s+E?19[05]/i.test(raw)) return compact.includes('195') ? 'E195' : 'E190';
  const icao = compact.match(/\b(A20N|A21N|A319|A320|A321|A330|A350|B738|B739|B737|B77[78]|B78[89X]|E17[05]|E19[05]|CRJ(?:2|5|7|9)|AT(?:42|72)|DH8[ABCD]?|C172|C208|PC12)\b/i);
  return icao ? icao[1].toUpperCase() : raw.slice(0, 24) || 'UNKNOWN';
}

`;
  return replaceBetween(source, 'export function trafficAircraftLabel(entry = {}) {', 'export function trafficPositionLabel(entry = {}) {', replacement, 'traffic aircraft type normalizer');
});

console.log('FLYXORA 1.24.2 traffic type hotfix materialized.');
