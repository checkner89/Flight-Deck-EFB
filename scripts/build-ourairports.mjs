import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const AIRPORTS_URL = 'https://ourairports.com/data/airports.csv';
const RUNWAYS_URL = 'https://ourairports.com/data/runways.csv';
const OUTPUT = path.resolve('data/ourairports.min.json.gz');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((entry) => entry.length > 1).map((entry) => Object.fromEntries(headers.map((key, index) => [key, entry[index] ?? ''])));
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const [airportsResponse, runwaysResponse] = await Promise.all([fetch(AIRPORTS_URL), fetch(RUNWAYS_URL)]);
if (!airportsResponse.ok || !runwaysResponse.ok) throw new Error('OurAirports data download failed.');
const [airportRows, runwayRows] = await Promise.all([
  airportsResponse.text().then(parseCsv),
  runwaysResponse.text().then(parseCsv),
]);

const airports = {};
for (const row of airportRows) {
  const icao = String(row.ident || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{3,4}$/.test(icao)) continue;
  const lat = number(row.latitude_deg);
  const lon = number(row.longitude_deg);
  if (lat === null || lon === null) continue;
  airports[icao] = {
    name: row.name || icao,
    lat,
    lon,
    type: row.type || null,
    municipality: row.municipality || null,
    country: row.iso_country || null,
    runways: [],
  };
}

for (const row of runwayRows) {
  const icao = String(row.airport_ident || '').trim().toUpperCase();
  const airport = airports[icao];
  if (!airport) continue;
  airport.runways.push({
    le: row.le_ident || null,
    he: row.he_ident || null,
    leLat: number(row.le_latitude_deg),
    leLon: number(row.le_longitude_deg),
    heLat: number(row.he_latitude_deg),
    heLon: number(row.he_longitude_deg),
    lengthFt: number(row.length_ft),
    widthFt: number(row.width_ft),
    surface: row.surface || null,
    lighted: row.lighted === '1',
  });
}

const document = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'OurAirports',
  sourceUrl: 'https://ourairports.com/data/',
  license: 'Public Domain',
  airports,
};
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, gzipSync(Buffer.from(JSON.stringify(document)), { level: 9 }));
console.log(`Bundled ${Object.keys(airports).length} OurAirports entries.`);
