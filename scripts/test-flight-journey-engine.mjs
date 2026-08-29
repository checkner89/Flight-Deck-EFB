import assert from 'node:assert/strict';
import { createJourneyTracker, deriveFlightCompletion, deriveFlightJourney } from '../src/flight-journey-engine.mjs';

function state(overrides = {}) {
  const base = {
    flight: { origin: 'EDDM', destination: 'EDDL', clearedForTakeoff: false, clearedForLanding: false },
    gate: { name: 'A12', lat: 48.3538, lon: 11.7861 },
    aircraft: {
      lat: 48.3538,
      lon: 11.7861,
      onGround: true,
      groundSpeed: 0,
      aglFeet: 0,
      verticalSpeedFpm: 0,
      parkingBrake: true,
      enginesRunning: false,
      gearDown: true,
      flapsHandleIndex: 0,
    },
    integrations: {
      simbrief: { flight: { origin: 'EDDM', destination: 'EDDL', route: 'EDDM DCT EDDL' } },
      flightOperations: { phaseOverride: 'auto' },
      turnaround: { status: 'inactive', stage: 'waiting' },
      gsx: { services: [] },
    },
  };
  return {
    ...base,
    ...overrides,
    flight: { ...base.flight, ...(overrides.flight || {}) },
    aircraft: overrides.aircraft === null ? null : { ...base.aircraft, ...(overrides.aircraft || {}) },
    integrations: {
      ...base.integrations,
      ...(overrides.integrations || {}),
      flightOperations: { ...base.integrations.flightOperations, ...(overrides.integrations?.flightOperations || {}) },
      turnaround: { ...base.integrations.turnaround, ...(overrides.integrations?.turnaround || {}) },
      gsx: { ...base.integrations.gsx, ...(overrides.integrations?.gsx || {}) },
    },
  };
}

assert.equal(deriveFlightJourney({ flight: {}, aircraft: null, integrations: {} }).phase, 'planning');
assert.equal(deriveFlightJourney(state()).phase, 'preflight');
assert.equal(deriveFlightJourney(state({ integrations: { turnaround: { status: 'active', stage: 'boarding' } } })).phase, 'boarding');
assert.equal(deriveFlightJourney(state({ aircraft: { parkingBrake: false, enginesRunning: true }, integrations: { turnaround: { status: 'active', stage: 'pushback' } } })).phase, 'pushback');
assert.equal(deriveFlightJourney(state({ aircraft: { parkingBrake: false, enginesRunning: true, groundSpeed: 18 } })).phase, 'taxi-out');
assert.equal(deriveFlightJourney(state({ aircraft: { enginesRunning: true, parkingBrake: false, groundSpeed: 75 }, flight: { clearedForTakeoff: true } })).phase, 'takeoff');

const tracker = createJourneyTracker();
tracker.update(state({ aircraft: { enginesRunning: true, parkingBrake: false, groundSpeed: 75 } }));
assert.equal(tracker.update(state({ aircraft: { onGround: false, aglFeet: 1_800, verticalSpeedFpm: 1_700, groundSpeed: 155 } })).phase, 'climb');
assert.equal(tracker.update(state({ aircraft: { onGround: false, aglFeet: 32_000, verticalSpeedFpm: 20, groundSpeed: 445 } })).phase, 'cruise');
assert.equal(tracker.update(state({ aircraft: { onGround: false, aglFeet: 12_000, verticalSpeedFpm: -1_400, groundSpeed: 300 } })).phase, 'descent');
assert.equal(tracker.update(state({ aircraft: { onGround: false, aglFeet: 1_200, verticalSpeedFpm: -650, groundSpeed: 145, flapsHandleIndex: 2 }, flight: { clearedForLanding: true } })).phase, 'approach');
assert.equal(tracker.update(state({ aircraft: { onGround: true, aglFeet: 0, verticalSpeedFpm: -100, groundSpeed: 105, enginesRunning: true, parkingBrake: false } })).phase, 'landing');
assert.equal(tracker.update(state({ aircraft: { groundSpeed: 17, enginesRunning: true, parkingBrake: false } })).phase, 'taxi-in');
const shutdownJourney = tracker.update(state());
assert.equal(shutdownJourney.phase, 'shutdown');

const completion = deriveFlightCompletion(state(), shutdownJourney);
assert.equal(completion.ready, true);
assert.equal(completion.confidence, 1);
assert.deepEqual(completion.reasons, []);

const notReady = deriveFlightCompletion(state({ aircraft: { groundSpeed: 9, parkingBrake: false, enginesRunning: true } }), { landed: true });
assert.equal(notReady.ready, false);
assert.ok(notReady.reasons.includes('stationary'));
assert.ok(notReady.reasons.includes('parkingBrake'));
assert.ok(notReady.reasons.includes('enginesOff'));

const manual = deriveFlightJourney(state({ integrations: { flightOperations: { phaseOverride: 'taxi-in' } } }));
assert.equal(manual.phase, 'taxi-in');
assert.equal(manual.automatic, false);

console.log('Flight journey engine regression checks passed.');
