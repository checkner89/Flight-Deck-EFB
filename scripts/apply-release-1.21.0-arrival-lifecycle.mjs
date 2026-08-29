import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 arrival lifecycle patch requires package version 1.21.0, got ${pkg.version}.`);

const filename = 'src/state-engine.mjs';
let source = await fs.readFile(filename, 'utf8');

function replaceBetween(input, startMarker, endMarker, replacement, label) {
  const start = input.indexOf(startMarker);
  const end = input.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`1.21.0 arrival lifecycle range missing: ${label}`);
  return input.slice(0, start) + replacement + input.slice(end);
}

const setPath = `  setPlannedTaxiPath(value, metadata = {}) {
    if (EXACT_PATH_SOURCES.has(this.state.taxi.pathSource) && this.state.taxi.path.length > 1) return false;
    const path = normalizeTaxiPath(value);
    if (path.length < 2) return false;
    const mode = metadata.mode === 'arrival' ? 'arrival' : metadata.mode === 'departure' ? 'departure' : null;
    const routeMetadata = { ...metadata, mode, airport: textOrEmpty(metadata.airport, this.state.planning?.selectedAirport?.icao) || null };
    if (!this.state.taxi.routes) this.state.taxi.routes = { departure: null, arrival: null };
    if (mode) {
      this.state.taxi.routes[mode] = {
        path: structuredClone(path),
        metadata: structuredClone(routeMetadata),
        updatedAt: new Date().toISOString(),
      };
    }
    const arrivalDeferred = mode === 'arrival' && !this.state.aircraft?.onGround;
    const arrivalAirport = routeMetadata.airport || this.state.flight.destination || null;
    const currentAirport = textOrEmpty(this.state.flight.currentAirport).toUpperCase() || null;
    const aircraftNearRoute = this.state.aircraft && path.some((point) => distanceMeters(this.state.aircraft, point) < 5_000);
    const arrivalAtDestination = mode === 'arrival' && this.state.aircraft?.onGround
      && aircraftNearRoute
      && (!arrivalAirport || !currentAirport || currentAirport === arrivalAirport);
    if (mode !== 'arrival' || arrivalAtDestination) this.#setTaxiPath(path, metadata.source || 'manual', routeMetadata);
    this.state.planning.active = true;
    this.#refreshHoldShorts();
    this.#updateGuidance();
    this.#touch();
    return true;
  }

`;
source = replaceBetween(source, '  setPlannedTaxiPath(value, metadata = {}) {', '  clearPlannedTaxiPath()', setPath, 'deferred arrival route');

if (!source.includes('const storedArrival = this.state.taxi.routes?.arrival;')) {
  const anchor = "    this.#updateGuidance();\n    this.#touch();\n  }\n\n  publicState() {";
  const replacement = `    const storedArrival = this.state.taxi.routes?.arrival;
    if (this.state.aircraft.onGround && storedArrival?.path?.length > 1 && this.state.taxi.pathMetadata?.mode !== 'arrival') {
      const arrivalAirport = textOrEmpty(storedArrival.metadata?.airport, this.state.flight.destination).toUpperCase() || null;
      const currentAirport = textOrEmpty(this.state.flight.currentAirport).toUpperCase() || null;
      const aircraftNearArrival = storedArrival.path.some((point) => distanceMeters(this.state.aircraft, point) < 5_000);
      if (aircraftNearArrival && (!arrivalAirport || !currentAirport || currentAirport === arrivalAirport)) {
        this.#setTaxiPath(storedArrival.path, 'manual', storedArrival.metadata || { mode: 'arrival' });
        this.state.planning.active = true;
        this.#refreshHoldShorts();
      }
    }
    this.#updateGuidance();
    this.#touch();
  }

  publicState() {`;
  if (!source.includes(anchor)) throw new Error('1.21.0 setAircraft activation anchor missing.');
  source = source.replace(anchor, replacement);
}

source = source.replace(
  `    const flightChanged = (
      prior.flightId !== null && nextFlightId !== null && String(prior.flightId) !== String(nextFlightId)
    ) || (
      prior.callsign && nextCallsign && prior.callsign !== nextCallsign
    ) || (
      prior.origin && nextOrigin && prior.origin !== nextOrigin
    ) || (
      prior.destination && nextDestination && prior.destination !== nextDestination
    );`,
  `    const sameRoute = Boolean(prior.origin && nextOrigin && prior.destination && nextDestination
      && prior.origin === nextOrigin && prior.destination === nextDestination);
    const flightChanged = (
      prior.flightId !== null && nextFlightId !== null && String(prior.flightId) !== String(nextFlightId) && !sameRoute
    ) || (
      prior.origin && nextOrigin && prior.origin !== nextOrigin
    ) || (
      prior.destination && nextDestination && prior.destination !== nextDestination
    );`,
);

if (!source.includes("this.state.taxi.routes = { departure: null, arrival: null };")) {
  source = source.replace(
    "    this.state.taxi.clearance = null;\n    this.state.taxi.holdShorts = [];",
    "    this.state.taxi.clearance = null;\n    this.state.taxi.holdShorts = [];\n    this.state.taxi.routes = { departure: null, arrival: null };",
  );
}

await fs.writeFile(filename, source, 'utf8');
console.log('Flight Deck EFB 1.21.0 deferred arrival taxi activation and flight-session stability materialized.');
