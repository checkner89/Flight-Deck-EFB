import fs from 'node:fs/promises';

const filename = 'src/state-engine.mjs';
let source = await fs.readFile(filename, 'utf8');

if (!source.includes('routedTaxiContinuationPattern')) {
  const startMarker = 'function findCurrentClearance(comms) {';
  const endMarker = 'function extractRunwayFromClearance(text) {';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error('1.24.8 candidate input normalization: findCurrentClearance range missing.');

  const replacement = `function findCurrentClearance(comms) {
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

  // Only actual ground-routing instructions are relevant for TaxiNow. In particular,
  // never let a later climb/descent/frequency call replace the active taxi clearance.
  const taxiPattern = /\\b(?:taxi(?:way)?|hold(?:ing)? short|holding point|cross (?:runway|rwy)|line up(?: and wait)?)\\b/i;
  const routedTaxiContinuationPattern = /\\b(?:continue|proceed|follow)\\b[\\s\\S]*\\b(?:via|taxiway|runway|rwy|gate|stand|parking|apron|ramp)\\b/i;
  const taxiMessages = candidates.filter((entry) => taxiPattern.test(entry.text) || routedTaxiContinuationPattern.test(entry.text));
  return taxiMessages.at(-1) ?? null;
}

`;
  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  await fs.writeFile(filename, source, 'utf8');
  console.log('FLYXORA 1.24.8 candidate SI taxi-clearance input normalized.');
} else {
  console.log('FLYXORA 1.24.8 candidate SI taxi-clearance input already normalized.');
}
