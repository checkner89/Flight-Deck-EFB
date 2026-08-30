import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { FlightJourneyService } from '../src/flight-journey-service.mjs';

class FakeEngine extends EventEmitter {
  constructor(state) {
    super();
    this.state = structuredClone(state);
    this.publications = [];
  }

  publicState() {
    return structuredClone(this.state);
  }

  setIntegration(name, value) {
    const current = this.state.integrations?.[name] || {};
    if (JSON.stringify(current) === JSON.stringify({ ...current, ...value })) return;
    this.state.integrations ||= {};
    this.state.integrations[name] = { ...current, structured: true, ...structuredClone(value) };
    delete this.state.integrations[name].structured;
    this.publications.push({ name, value: structuredClone(value) });
    this.emit('change', this.publicState());
  }

  patch(patch) {
    this.state = {
      ...this.state,
      ...patch,
      aircraft: patch.aircraft === undefined ? this.state.aircraft : { ...(this.state.aircraft || {}), ...(patch.aircraft || {}) },
      session: patch.session === undefined ? this.state.session : { ...(this.state.session || {}), ...(patch.session || {}) },
    };
    this.emit('change', this.publicState());
  }
}

const initial = {
  session: { generation: 1 },
  flight: { origin: 'EDDM', destination: 'EDDL' },
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

let clock = Date.parse('2026-08-29T20:00:00.000Z');
const engine = new FakeEngine(initial);
const service = new FlightJourneyService(engine, { now: () => new Date(clock) });
service.start();
assert.equal(engine.publications.length, 1);
assert.equal(engine.state.integrations.flightJourney.phase, 'preflight');

engine.emit('change', engine.publicState());
assert.equal(engine.publications.length, 1, 'unchanged state must not republish journey integration');

clock += 1_000;
engine.patch({ aircraft: { groundSpeed: 18, enginesRunning: true, parkingBrake: false } });
assert.equal(engine.state.integrations.flightJourney.phase, 'taxi-out');
assert.equal(engine.publications.length, 2);

clock += 1_000;
engine.patch({ aircraft: { onGround: false, groundSpeed: 180, aglFeet: 2_000, verticalSpeedFpm: 1_800 } });
assert.equal(engine.state.integrations.flightJourney.phase, 'climb');
assert.equal(engine.state.integrations.flightJourney.departed, true);

clock += 1_000;
engine.patch({ session: { generation: 2 }, aircraft: { onGround: true, groundSpeed: 0, aglFeet: 0, verticalSpeedFpm: 0, parkingBrake: true, enginesRunning: false } });
assert.equal(engine.state.integrations.flightJourney.phase, 'preflight');
assert.equal(engine.state.integrations.flightJourney.departed, false, 'new session must reset historical flight flags');

service.stop();
const beforeStop = engine.publications.length;
engine.patch({ aircraft: { groundSpeed: 20, enginesRunning: true, parkingBrake: false } });
assert.equal(engine.publications.length, beforeStop, 'stopped service must not publish');

console.log('Flight journey service regression checks passed.');
