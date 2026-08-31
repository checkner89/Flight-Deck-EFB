import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { StateEngine } from '../src/state-engine.mjs';
import { deriveTaxiRouteFromClearance } from '../src/taxi-route-planner.mjs';
import { OnlineNetworkClient } from '../src/online-network-client.mjs';

const [pkgRaw, stateSource, serverSource, plannerSource, networkSource, app, profile, css] = await Promise.all([
  fs.readFile('package.json', 'utf8'),
  fs.readFile('src/state-engine.mjs', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('src/taxi-route-planner.mjs', 'utf8'),
  fs.readFile('src/online-network-client.mjs', 'utf8'),
  fs.readFile('public/app.js', 'utf8'),
  fs.readFile('public/release-1.22.0.js', 'utf8'),
  fs.readFile('public/release-1.24.7.css', 'utf8'),
]);

const pkg = JSON.parse(pkgRaw);
const need = (source, value, message) => { if (!source.includes(value)) throw new Error(message); };
const reject = (source, value, message) => { if (source.includes(value)) throw new Error(message); };

assert.equal(pkg.version, '1.24.7', 'Candidate stays on 1.24.7 until it is explicitly released.');
need(pkg.scripts['prepare:release'], 'apply-release-1.24.8-candidate.mjs', 'Candidate materializer is not wired into prepare:release.');
need(pkg.scripts.dist, 'test-release-1.24.8-candidate.mjs', 'Candidate regression is missing from dist.');

need(stateSource, 'routedTaxiContinuationPattern', 'Non-taxi SayIntentions calls are not filtered out.');
reject(stateSource, 'taxiMessages.at(-1) ?? candidates.at(-1)', 'Arbitrary radio calls can still become taxi clearances.');
need(stateSource, "this.state.aircraft?.onGround === false", 'Exact SI taxi paths are still dropped on transient flightJSON polls.');
need(stateSource, 'exactPathMatchesClearance', 'Exact SI paths are not tied to their taxi clearance.');
need(stateSource, 'adoptUnboundExactTaxiPath', 'An exact SI taxi path cannot be bound when flightJSON arrives before the clearance.');
need(serverSource, 'scheduleAutomaticSayIntentionsTaxiRoute', 'SayIntentions clearances do not trigger automatic taxi route derivation.');
need(plannerSource, '1.24.8 candidate arrival-to-gate fallback', 'Arrival taxi-to-gate fallback is missing.');
need(networkSource, 'pollMs = 15_000', 'Enabled VATSIM/IVAO traffic is not refreshed continuously.');
need(networkSource, '  #scheduleRefresh() {', 'Online-network refresh scheduler is missing.');
need(app, 'function fd1248TrafficEntries(state = {})', 'Tracking map does not merge simulator and online-network traffic.');
need(app, 'fd1248TrafficEntries(state).slice(0, 120)', 'Tracking map still reads simulator-only traffic.');
need(app, 'function trackingRouteContext1248(record)', 'Tracking flight-plan route renderer is missing.');
need(app, 'route.innerHTML = trackingRouteContext1248(record);', 'Tracking route context is not using the expanded renderer.');
reject(profile, 'Keine geplanten Profildaten verfügbar · tatsächlicher Flug bleibt vollständig sichtbar.', 'Obsolete Flight Profile footer note is still rendered.');
need(css, '.tracking-profile-metrics {', 'Flight Profile alignment override is missing.');
need(css, 'padding-left: 0 !important;', 'MAX ALT row is not aligned with PROFIL NACH.');
need(css, '.fd1248-route-endpoints', 'DEP/ARR responsive route layout is missing.');

// Only ground-routing radio messages may drive taxi clearances.
const clearanceEngine = new StateEngine();
clearanceEngine.applyComms([{ id: 1, outgoing_message_english: 'Climb and maintain flight level one two zero.' }]);
assert.equal(clearanceEngine.publicState().taxi.clearance, null, 'An airborne radio call became a taxi clearance.');
clearanceEngine.applyComms([{ id: 2, outgoing_message_english: 'Taxi to runway 23L via Alpha, Bravo. Hold short runway 23L.' }]);
assert.equal(clearanceEngine.publicState().taxi.clearance?.provider, 'sayintentions');
assert.match(clearanceEngine.publicState().taxi.clearance?.text || '', /Taxi to runway/i);

// An exact SI path must survive both path-before-clearance ordering and an empty ground flightJSON poll.
const exactPathEngine = new StateEngine();
exactPathEngine.setAtcProvider('sayintentions');
exactPathEngine.setAircraft({ lat: 51.2800, lon: 6.7600, onGround: true, groundSpeed: 5 });
const baseFlight = {
  flight_id: 'candidate-si-1',
  callsign_icao: 'TEST123',
  current_flight: {
    flight_origin: 'EDDL',
    flight_destination: 'EDDM',
  },
};
exactPathEngine.applyFlightJson({
  flight_details: {
    ...baseFlight,
    current_flight: {
      ...baseFlight.current_flight,
      taxi_path: [
        { lat: 51.2800, lon: 6.7600 },
        { lat: 51.2803, lon: 6.7610 },
      ],
    },
  },
});
assert.equal(exactPathEngine.publicState().taxi.pathSource, 'sayintentions');
assert.equal(exactPathEngine.publicState().taxi.path.length, 2);
assert.equal(exactPathEngine.publicState().taxi.pathMetadata?.clearanceId ?? null, null);
exactPathEngine.applyComms([{ id: 77, outgoing_message_english: 'Taxi to runway 23L via Alpha.' }]);
assert.equal(exactPathEngine.publicState().taxi.path.length, 2, 'A taxi clearance arriving after flightJSON erased the exact SI path.');
assert.equal(String(exactPathEngine.publicState().taxi.pathMetadata?.clearanceId), '77');
exactPathEngine.applyFlightJson({ flight_details: baseFlight });
assert.equal(exactPathEngine.publicState().taxi.path.length, 2, 'Transient missing taxi_path erased the live route.');
exactPathEngine.setAircraft({ lat: 51.2803, lon: 6.7610, onGround: false, groundSpeed: 145, altitudeFeet: 2500 });
exactPathEngine.applyFlightJson({ flight_details: baseFlight });
assert.equal(exactPathEngine.publicState().taxi.path.length, 0, 'Completed departure taxi route was not retired after takeoff.');

// Arrival taxi clearances without a runway can be routed to the assigned SI gate.
const simpleMap = {
  features: [{
    id: 'taxiway-A',
    kind: 'taxiway',
    geometry: 'line',
    ref: 'A',
    coordinates: [
      { lat: 51.2800, lon: 6.7600 },
      { lat: 51.2800, lon: 6.7620 },
      { lat: 51.2800, lon: 6.7640 },
    ],
  }],
};
const arrivalResult = deriveTaxiRouteFromClearance(simpleMap, {
  aircraft: { lat: 51.2800, lon: 6.7600, onGround: true },
  gate: { name: '42', lat: 51.2800, lon: 6.7640 },
  flight: { clearedForLanding: true },
  taxi: { clearance: { text: 'Taxi to gate 42 via Alpha.' } },
});
assert.equal(arrivalResult.mode, 'arrival');
assert.ok(arrivalResult.routes.length > 0, arrivalResult.error || 'No arrival taxi route was derived.');
assert.deepEqual(arrivalResult.parsed.taxiways, ['A']);

// Once VATSIM is switched on it stays live through the backend refresh scheduler.
const integrations = [];
const networkEngine = {
  publicState: () => ({
    flight: { currentAirport: 'EDDL', origin: 'EDDL', destination: 'EDDM' },
    planning: { selectedAirport: null },
    aircraft: { lat: 51.28, lon: 6.76 },
  }),
  setIntegration: (name, value) => integrations.push({ name, value }),
};
const networkClient = new OnlineNetworkClient(networkEngine, {
  pollMs: 60_000,
  cacheMs: 0,
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({
      general: { update_timestamp: new Date().toISOString(), connected_clients: 1 },
      controllers: [],
      atis: [],
      pilots: [{
        callsign: 'DLH1AB',
        latitude: 51.281,
        longitude: 6.761,
        altitude: 150,
        groundspeed: 18,
        heading: 230,
        flight_plan: { departure: 'EDDL', arrival: 'EDDM', aircraft_short: 'A20N', route: 'COL DCT' },
      }],
    }),
  }),
});
const vatsim = await networkClient.refresh('vatsim');
assert.equal(networkClient.selected, 'vatsim');
assert.equal(vatsim.pilots.length, 1);
assert.equal(vatsim.pilots[0].callsign, 'DLH1AB');
assert.equal(vatsim.pilots[0].groundSpeedKnots, 18);
assert.ok(integrations.some((entry) => entry.name === 'onlineNetworks' && entry.value.status === 'ready'));
networkClient.stop();

console.log('FLYXORA 1.24.8 candidate taxi/VATSIM/tracking regression passed.');
