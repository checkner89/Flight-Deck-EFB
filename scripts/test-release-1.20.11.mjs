import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
const simconnect = await fs.readFile('src/simconnect-client.mjs', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

if (pkg.version !== '1.20.11') throw new Error(`Expected package version 1.20.11, got ${pkg.version}.`);
need(server, "const APP_VERSION = '1.20.11';", 'Server version was not materialized to 1.20.11.');
need(simconnect, "addFloat('INDICATED ALTITUDE', 'feet');", 'INDICATED ALTITUDE SimVar is missing.');
need(simconnect, "addFloat('KOHLSMAN SETTING MB:1', 'millibars');", 'Altimeter QNH/STD pressure setting is missing.');
need(simconnect, "addInt('KOHLSMAN SETTING STD:1', 'bool');", 'Altimeter STD-mode flag is missing.');
need(simconnect, 'trueAltitudeFeet: received.data.readFloat64(),', 'True/geometric altitude is not retained separately.');
need(simconnect, 'altitudeFeet: received.data.readFloat64(),', 'Primary altitude does not map to indicated altitude.');
need(simconnect, 'altimeterSettingHpa: received.data.readFloat64(),', 'Altimeter pressure setting is not exposed.');
need(simconnect, 'altimeterStandard: received.data.readInt32() === 1,', 'Altimeter STD state is not exposed.');

const trueIndex = simconnect.indexOf('trueAltitudeFeet: received.data.readFloat64()');
const indicatedIndex = simconnect.indexOf('altitudeFeet: received.data.readFloat64()', trueIndex + 1);
if (trueIndex < 0 || indicatedIndex <= trueIndex) throw new Error('Telemetry read order does not preserve PLANE ALTITUDE followed by INDICATED ALTITUDE.');

console.log('Flight Deck EFB 1.20.11 barometric altitude/QNH regression checks passed.');
