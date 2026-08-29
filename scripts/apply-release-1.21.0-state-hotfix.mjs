import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 state hotfix requires package version 1.21.0, got ${pkg.version}.`);

const filename = 'src/state-engine.mjs';
let source = await fs.readFile(filename, 'utf8');

function replaceBetween(input, startMarker, endMarker, replacement, label) {
  const start = input.indexOf(startMarker);
  const end = input.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.21.0 state hotfix range missing: ${label}`);
  return input.slice(0, start) + replacement + input.slice(end);
}

const classifier = String.raw`function findCurrentClearance(comms) {
  if (!Array.isArray(comms)) return null;
  const candidates = comms
    .map((entry) => ({
      id: numberOrNull(entry.id),
      text: textOrEmpty(
        entry.outgoing_message_english,
        entry.outgoing_message,
        entry.atc_message_english,
        entry.atc_message,
        entry.response_english,
        entry.response,
        entry.message_english,
        entry.message,
        entry.text,
      ),
      station: textOrEmpty(entry.station_name, entry.station, entry.ident),
      time: firstDefined(entry.stamp_zulu, null),
    }))
    .filter((entry) => entry.text);

  const taxiPositive = /\b(?:taxi(?:ing)?(?:\s+to)?|hold(?:ing)? short|holding point|cross (?:runway|rwy)|continue taxi|proceed via|follow (?:the )?(?:taxiway|taxi route|traffic)|take (?:the )?(?:next |first |second )?exit|exit (?:via|at)|via taxiway|taxiways? [A-Z0-9])\b/i;
  const nonTaxi = /\b(?:cleared (?:for )?(?:takeoff|landing)|contact |monitor |frequency|climb|descend|maintain|turn (?:left|right)|heading|altitude|traffic (?:in sight|advisory)|pushback approved|startup approved)\b/i;
  return candidates.filter((entry) => taxiPositive.test(entry.text) && !nonTaxi.test(entry.text)).at(-1) ?? null;
}

`;
source = replaceBetween(source, 'function findCurrentClearance(comms) {', 'function extractRunwayFromClearance(text) {', classifier, 'taxi clearance classifier');

if (!source.includes("routes: { departure: null, arrival: null }")) {
  source = source.replace(
    "        pathMetadata: null,\n        clearance: null,",
    "        pathMetadata: null,\n        routes: { departure: null, arrival: null },\n        clearance: null,",
  );
}

const setPath = `  setPlannedTaxiPath(value, metadata = {}) {
    if (EXACT_PATH_SOURCES.has(this.state.taxi.pathSource) && this.state.taxi.path.length > 1) return false;
    const path = normalizeTaxiPath(value);
    if (path.length < 2) return false;
    const mode = metadata.mode === 'arrival' ? 'arrival' : metadata.mode === 'departure' ? 'departure' : null;
    const routeMetadata = { ...metadata, mode, airport: textOrEmpty(metadata.airport, this.state.planning?.selectedAirport?.icao) || null };
    this.#setTaxiPath(path, metadata.source || 'manual', routeMetadata);
    if (!this.state.taxi.routes) this.state.taxi.routes = { departure: null, arrival: null };
    if (mode) {
      this.state.taxi.routes[mode] = {
        path: structuredClone(path),
        metadata: structuredClone(routeMetadata),
        updatedAt: new Date().toISOString(),
      };
    }
    this.state.planning.active = true;
    this.#refreshHoldShorts();
    this.#updateGuidance();
    this.#touch();
    return true;
  }

`;
source = replaceBetween(source, '  setPlannedTaxiPath(value, metadata = {}) {', '  clearPlannedTaxiPath()', setPath, 'taxi route persistence');

await fs.writeFile(filename, source, 'utf8');
console.log('Flight Deck EFB 1.21.0 taxi state hotfix materialized.');
