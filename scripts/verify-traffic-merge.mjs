import assert from 'node:assert/strict';
import { mergeTrafficSources, normalizeInjectedTrafficEntry } from '../src/injected-traffic-client.mjs';

const base = normalizeInjectedTrafficEntry({
  objectId: 42, lat: 51.2, lon: 6.7, altitudeFeet: 0, aglFeet: 0, groundSpeed: 0,
  verticalSpeedFpm: 0, onGround: true, title: 'FSLTL_A320', atcId: 'DLH4AB',
});
assert.equal(base.origin, '');
assert.equal(base.destination, '');
assert.equal(base.state, 'parked');

const enriched = normalizeInjectedTrafficEntry({
  ...base, airline: 'DLH', flightNumber: '4AB', state: 'preflight support', currentAirport: 'EDDL',
  origin: 'EDDL', destination: 'EDDM', runway: '23L', parking: 'Gate A 12', etdSeconds: 600,
  etaSeconds: 4200, scheduleEnriched: true,
});
assert.equal(enriched.origin, 'EDDL');
assert.equal(enriched.destination, 'EDDM');
assert.equal(enriched.airline, 'DLH');
assert.equal(enriched.state, 'preflight support');

const primary = [{ ...base, source: 'simconnect-primary', callsign: 'DLH4AB' }];
const merged = mergeTrafficSources(primary, [enriched]);
assert.equal(merged.length, 1, 'same object id must not duplicate the aircraft');
assert.equal(merged[0].origin, 'EDDL', 'FROM must survive merge');
assert.equal(merged[0].destination, 'EDDM', 'TO must survive merge');
assert.equal(merged[0].runway, '23L');
assert.equal(merged[0].parking, 'Gate A 12');
assert.equal(merged[0].state, 'preflight support', 'schedule state must beat generic parked/enroute inference');
assert.equal(merged[0].source, 'simconnect-primary');

const fallbackOnly = normalizeInjectedTrafficEntry({ ...base, objectId: 99, atcId: 'AFR87YU', origin: 'LFPG', destination: 'EDDL', scheduleEnriched: true });
const withFallback = mergeTrafficSources(primary, [enriched, fallbackOnly]);
assert.equal(withFallback.length, 2);
assert.equal(withFallback.find((entry) => entry.objectId === 99)?.destination, 'EDDL');

console.log('Traffic merge regression OK');
