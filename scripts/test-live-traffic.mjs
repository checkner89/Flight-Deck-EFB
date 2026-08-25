import assert from 'node:assert/strict';
import { buildLiveTrafficModel, classifyLiveTraffic, trafficAircraftLabel } from '../public/live-traffic.js';

const ownship = { lat: 51.2802, lon: 6.7573 };
const ground = { objectId: 1, lat: 51.281, lon: 6.758, onGround: true, groundSpeed: 0, state: '', callsign: 'DLH4TN', title: 'FSLTL_A320_Hop' };
const taxi = { objectId: 2, lat: 51.282, lon: 6.76, onGround: true, groundSpeed: 14, state: '', callsign: 'EWG7LX', title: 'AIGAI_Eurowings Airbus A319-100' };
const arriving = { objectId: 3, lat: 51.36, lon: 6.82, onGround: false, groundSpeed: 210, altitudeFeet: 4800, verticalSpeedFpm: -900, state: '', callsign: 'AFR87YU', title: 'FSLTL_E170_Hop' };
const cruise = { objectId: 4, lat: 51.45, lon: 6.95, onGround: false, groundSpeed: 430, altitudeFeet: 22000, verticalSpeedFpm: 0, state: 'enroute', callsign: 'BAW946', title: 'FSLTL_A320' };
const farAway = { objectId: 5, lat: 52.5, lon: 8.5, onGround: true, groundSpeed: 0, state: 'parked', callsign: 'AIGFAR', title: 'AIGAI_B737' };

assert.equal(classifyLiveTraffic(ground, ownship).label, 'PARKING');
assert.equal(classifyLiveTraffic(ground, ownship).inferred, true);
assert.equal(classifyLiveTraffic(taxi, ownship).label, 'TAXI');
assert.equal(classifyLiveTraffic(arriving, ownship).label, 'ARRIVING');
assert.equal(classifyLiveTraffic(cruise, ownship).label, 'ENROUTE');
assert.equal(trafficAircraftLabel(ground), 'A320');

const model = buildLiveTrafficModel([ground, taxi, arriving, cruise, farAway], ownship, 'nearby');
assert.equal(model.counts.ground, 2, 'far-away parked traffic must not pollute the airport ground view');
assert.equal(model.counts.arriving, 1, 'only plausible nearby descending traffic belongs in Arriving');
assert.equal(model.counts.nearby, 4, 'nearby view should exclude the distant object from the 200 km backend bubble');
assert.deepEqual(model.rows.map((entry) => entry.objectId), [1, 2, 3, 4], 'nearby rows should be distance sorted');

const groundModel = buildLiveTrafficModel([ground, taxi, arriving, cruise, farAway], ownship, 'ground');
assert.deepEqual(groundModel.rows.map((entry) => entry.objectId), [1, 2]);

const arrivingModel = buildLiveTrafficModel([ground, taxi, arriving, cruise], ownship, 'arriving');
assert.deepEqual(arrivingModel.rows.map((entry) => entry.objectId), [3]);

console.log('Live Traffic regression tests passed.');
