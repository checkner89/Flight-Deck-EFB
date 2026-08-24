import { distanceMeters } from './state-engine.mjs';

export const DEMO_PATH = [
  { lat: 51.280560, lon: 6.766270, label: 'Gate A12' },
  { lat: 51.280900, lon: 6.765980, label: 'T' },
  { lat: 51.281350, lon: 6.765570, label: 'T' },
  { lat: 51.282020, lon: 6.765120, label: 'T' },
  { lat: 51.282770, lon: 6.765620, label: 'M' },
  { lat: 51.283420, lon: 6.766530, label: 'M' },
  { lat: 51.284080, lon: 6.767520, label: 'M' },
  { lat: 51.284610, lon: 6.768280, label: 'M' },
  { lat: 51.285090, lon: 6.768920, label: 'L1', hold_short: true },
];

export const DEMO_FLIGHT_JSON = {
  flight_details: {
    flight_id: 882674360,
    callsign: 'BTI216',
    callsign_icao: 'BTI216',
    current_airport: 'EDDL',
    cleared_for_takeoff: false,
    current_flight: {
      flight_origin: 'EDDL',
      flight_destination: 'LPPT',
      flight_plan_origin_lat: '51.2895',
      flight_plan_origin_lon: '6.7668',
      flight_destination_lat: '38.7742',
      flight_destination_lon: '-9.1342',
      flight_plan_departing_runway: '23L',
      flight_plan_arriving_runway: '02',
      assigned_gate: 'A12',
      assigned_gate_lat: DEMO_PATH[0].lat,
      assigned_gate_lon: DEMO_PATH[0].lon,
      taxi_path: DEMO_PATH,
    },
  },
};

export const DEMO_COMMS = [{
  id: 101,
  ident: 'EDDL',
  station_name: 'Düsseldorf Ground',
  stamp_zulu: new Date().toISOString(),
  incoming_message_english: 'Düsseldorf Ground, airBaltic two one six, ready to taxi.',
  outgoing_message_english: 'airBaltic two one six, taxi to runway 23L via Tango, Mike and Lima One, hold short runway 23L.',
}];

function interpolate(a, b, progress) {
  return {
    lat: a.lat + (b.lat - a.lat) * progress,
    lon: a.lon + (b.lon - a.lon) * progress,
  };
}

function bearingDegrees(a, b) {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const deltaLon = (b.lon - a.lon) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function startDemo(engine) {
  engine.setMode('demo');
  engine.applyFlightJson(DEMO_FLIGHT_JSON);
  engine.applyComms(DEMO_COMMS);
  engine.setConnection('simConnect', 'demo', 'Simulierte Flugzeugposition');
  engine.setIntegration('com', {
    status: 'ready', source: 'Demo', detail: 'Simulierte MSFS-Funkgeräte',
    com1Active: 121.605, com1Standby: 118.305, com1ActiveIdent: 'EDDL GND', com1ActiveType: 'GROUND', com1Receive: true, com1Transmit: true,
    com2Active: 123.78, com2Standby: 121.5, com2ActiveIdent: 'EDDL ATIS', com2ActiveType: 'ATIS', com2Receive: true, com2Transmit: false,
    transponderCode: 7000,
  });
  engine.setIntegration('simTraffic', {
    status: 'ready', source: 'Demo', radiusKm: 200, updatedAt: new Date().toISOString(), detail: '4 simulierte Verkehrsflugzeuge',
    aircraft: [
      { objectId: 201, callsign: 'DLH4PT', airline: 'Lufthansa', origin: 'EDDL', destination: 'EDDM', currentAirport: 'EDDL', runway: '23L', parking: 'A18', state: 'push back', onGround: true, groundSpeed: 2, altitudeFeet: 140 },
      { objectId: 202, callsign: 'EWG7KA', airline: 'Eurowings', origin: 'EDDL', destination: 'LEPA', currentAirport: 'EDDL', runway: '23L', parking: '', state: 'taxi out', onGround: true, groundSpeed: 14, altitudeFeet: 145 },
      { objectId: 203, callsign: 'KLM85M', airline: 'KLM', origin: 'EHAM', destination: 'EDDL', currentAirport: 'EDDL', runway: '23R', parking: '', state: 'landing', onGround: false, groundSpeed: 138, altitudeFeet: 1_820 },
      { objectId: 204, callsign: 'BAW935', airline: 'British Airways', origin: 'EDDL', destination: 'EGLL', currentAirport: '', runway: '', parking: '', state: 'enroute', onGround: false, groundSpeed: 418, altitudeFeet: 24_000 },
    ],
  });

  let segment = 0;
  let progress = 0;
  let pauseTicks = 0;
  const interval = setInterval(() => {
    if (pauseTicks > 0) {
      pauseTicks -= 1;
      return;
    }

    const start = DEMO_PATH[segment];
    const end = DEMO_PATH[segment + 1];
    const point = interpolate(start, end, progress);
    const segmentMeters = Math.max(1, distanceMeters(start, end));
    const step = 2.2 / segmentMeters;
    engine.setAircraft({
      ...point,
      heading: bearingDegrees(start, end),
      groundSpeed: 8.5,
      onGround: true,
    });
    progress += step;

    if (progress >= 1) {
      progress = 0;
      segment += 1;
      if (segment >= DEMO_PATH.length - 1) {
        segment = 0;
        pauseTicks = 8;
      }
    }
  }, 500);

  return () => clearInterval(interval);
}
