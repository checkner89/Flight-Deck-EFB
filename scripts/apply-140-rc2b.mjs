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
  const guidancePattern = /\n\s*const closest = closestPointOnPath\(aircraft, path\);\s*\n\s*if \(!closest\) return;\s*\n\s*const deviation = closest\.distanceMeters;/;
  if (!guidancePattern.test(state)) throw new Error('Original #updateGuidance closest-path block not found.');
  state = state.replace(guidancePattern, `
    const previousSegment = Number.isInteger(this.guidanceSegmentIndex) ? this.guidanceSegmentIndex : null;
    const closest = previousSegment === null
      ? closestPointOnPath(aircraft, path)
      : closestPointOnPath(aircraft, path, {
        minSegment: Math.max(0, previousSegment - 2),
        maxSegment: Math.min(path.length - 2, previousSegment + 14),
      });
    if (!closest) return;
    const deviation = closest.distanceMeters;
    if (deviation < 180) this.guidanceSegmentIndex = closest.segmentIndex;`);
}

const requirements = [
  ['this.guidanceSegmentIndex = null;', 'Progressive guidance segment state was not inserted.'],
  ['const previousSegment = Number.isInteger(this.guidanceSegmentIndex)', 'Progressive guidance lookup is missing from #updateGuidance.'],
  ['this.guidanceSegmentIndex = closest.segmentIndex', 'Progressive guidance segment update is missing.'],
  ['minSegment: Math.max(0, previousSegment - 2)', 'Progressive guidance lower window is missing.'],
  ['maxSegment: Math.min(path.length - 2, previousSegment + 14)', 'Progressive guidance upper window is missing.'],
];
for (const [needle, message] of requirements) {
  if (!state.includes(needle)) throw new Error(message);
}

fs.writeFileSync(file, state, 'utf8');
console.log('Applied strict progressive taxi guidance state and lookup fix.');
