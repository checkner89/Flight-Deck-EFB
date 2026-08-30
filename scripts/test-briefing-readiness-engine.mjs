import assert from 'node:assert/strict';
import { evaluateBriefingReadiness } from '../src/briefing-readiness-engine.mjs';

const completeState = {
  flight: {
    origin: 'EDDM', destination: 'EDDL', departureRunway: '26R', arrivalRunway: '23L',
    flightPlanRoute: 'EDDM MODRU Y101 DKB T104 EDDL',
  },
  gate: { name: 'A12' },
  aircraft: { fuelWeightPounds: 8_380 },
  integrations: {
    simbrief: {
      imported: true,
      flight: {
        origin: 'EDDM', destination: 'EDDL', alternate: 'EDDK',
        route: 'EDDM MODRU Y101 DKB T104 EDDL', blockFuelPounds: 8_400,
        originMetar: 'EDDM METAR', destinationMetar: 'EDDL METAR', alternateMetar: 'EDDK METAR',
      },
    },
    aviationWeather: { airports: [] },
    sayIntentions: { weather: { airports: [] } },
    routeSync: { comparison: { status: 'match' } },
  },
};

const ready = evaluateBriefingReadiness(completeState);
assert.equal(ready.status, 'ready');
assert.equal(ready.blockingCount, 0);
assert.equal(ready.attentionCount, 0);
assert.equal(ready.ready, true);

const noOFP = evaluateBriefingReadiness({
  ...completeState,
  integrations: {
    ...completeState.integrations,
    simbrief: { imported: false, flight: {} },
  },
});
assert.equal(noOFP.status, 'attention');
assert.equal(noOFP.blockingCount, 0, 'SimBrief must remain optional when simulator flight data is usable');
assert.ok(noOFP.items.find((entry) => entry.id === 'ofp' && entry.status === 'attention'));

const missingRoute = evaluateBriefingReadiness({
  flight: {},
  aircraft: null,
  integrations: {
    simbrief: { imported: false, flight: null },
    aviationWeather: { airports: [] },
    sayIntentions: { weather: { airports: [] } },
    routeSync: { comparison: { status: 'waiting' } },
  },
});
assert.equal(missingRoute.status, 'blocking');
assert.equal(missingRoute.ready, false);
assert.ok(missingRoute.blockingCount >= 2);

const lowFuel = evaluateBriefingReadiness({
  ...completeState,
  aircraft: { fuelWeightPounds: 7_000 },
});
assert.equal(lowFuel.status, 'attention');
assert.equal(lowFuel.blockingCount, 0, 'fuel variance should be an operational attention item, not an artificial application lock');
assert.ok(lowFuel.items.find((entry) => entry.id === 'fuel' && entry.status === 'attention'));

const weatherPriority = evaluateBriefingReadiness({
  ...completeState,
  integrations: {
    ...completeState.integrations,
    aviationWeather: { airports: [{ airport: 'EDDL', metar: 'LIVE METAR' }] },
  },
});
assert.equal(weatherPriority.items.find((entry) => entry.id === 'arrival-weather')?.source, 'AviationWeather');

console.log('Briefing readiness engine regression checks passed.');
