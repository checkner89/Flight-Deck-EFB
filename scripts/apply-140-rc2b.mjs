import fs from 'node:fs';

const file = 'src/state-engine.mjs';
let state = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

if (!state.includes('this.guidanceSegmentIndex = null;')) {
  const constructorPattern = /(this\.thresholds\s*=\s*\{\s*\.\.\.DEFAULT_THRESHOLDS,\s*\.\.\.thresholds\s*\};\s*\n\s*this\.offRouteSince\s*=\s*null;)/;
  if (!constructorPattern.test(state)) throw new Error('StateEngine constructor anchor for guidance progress not found.');
  state = state.replace(constructorPattern, '$1\n    this.guidanceSegmentIndex = null;');
}

const pathRevisionPattern = /(this\.state\.taxi\.pathRevision\s*\+=\s*1;\s*\n\s*this\.offRouteSince\s*=\s*null;)(?!\s*\n\s*this\.guidanceSegmentIndex)/;
if (pathRevisionPattern.test(state)) {
  state = state.replace(pathRevisionPattern, '$1\n    this.guidanceSegmentIndex = null;');
}

if (!state.includes('export function closestPointOnPath(position, path, { minSegment = 0, maxSegment = null } = {})')) {
  throw new Error('Segment-window closestPointOnPath signature is missing.');
}
if (!state.includes('const previousSegment = Number.isInteger(this.guidanceSegmentIndex)')) {
  throw new Error('Progressive guidance lookup is missing from #updateGuidance.');
}
if (!state.includes('this.guidanceSegmentIndex = closest.segmentIndex')) {
  throw new Error('Progressive guidance segment update is missing.');
}
if (!state.includes('this.guidanceSegmentIndex = null;')) {
  throw new Error('Progressive guidance segment state was not inserted.');
}

fs.writeFileSync(file, state, 'utf8');
console.log('Applied strict progressive taxi guidance state fix.');
