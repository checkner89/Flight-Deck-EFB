import fs from 'node:fs/promises';

const filename = 'src/flight-recorder.mjs';
const before = await fs.readFile(filename, 'utf8');
let source = before;

if (!source.includes('let landingRateFpm = finite(record.stats?.landingRateFpm);')) {
  const marker = 'function calculateStats(record) {';
  if (!source.includes(marker)) throw new Error('1.20.11 landing-rate compatibility patch cannot find calculateStats().');
  source = source.replace(
    marker,
    `${marker}\n  let landingRateFpm = finite(record.stats?.landingRateFpm);\n  let touchdownGroundSpeedKnots = finite(record.stats?.touchdownGroundSpeedKnots);`,
  );
}

if (!source.includes('const touchdownCandidates = [current, ...airborneWindow]')) {
  const touchdownPattern = /^(\s*)if\s*\(!previous\.onGround\s*&&\s*current\.onGround\)\s*landedAt\s*=\s*current\.time\s*;\s*$/m;
  const match = source.match(touchdownPattern);
  if (!match) throw new Error('1.20.11 landing-rate compatibility patch cannot find touchdown transition.');
  const indent = match[1];
  const block = `${indent}if (!previous.onGround && current.onGround) {\n${indent}  landedAt = current.time;\n${indent}  const airborneWindow = track.slice(Math.max(0, index - 4), index).reverse().filter((entry) => !entry.onGround);\n${indent}  const touchdownCandidates = [current, ...airborneWindow]\n${indent}    .map((entry) => finite(entry?.verticalSpeedFpm))\n${indent}    .filter((value) => value !== null);\n${indent}  const negativeRate = touchdownCandidates.find((value) => value < 0);\n${indent}  const touchdownRate = negativeRate ?? touchdownCandidates[0] ?? null;\n${indent}  landingRateFpm = touchdownRate === null ? null : Math.round(touchdownRate);\n${indent}  const touchdownSpeed = finite(current.groundSpeedKnots ?? current.groundSpeed)\n${indent}    ?? finite(previous.groundSpeedKnots ?? previous.groundSpeed);\n${indent}  touchdownGroundSpeedKnots = touchdownSpeed === null ? null : Math.round(touchdownSpeed);\n${indent}}`;
  source = source.replace(touchdownPattern, block);
}

if (!source.includes('landingRateFpm,\n    touchdownGroundSpeedKnots,')) {
  const returnPattern = /^(\s*)takeoffAt,\s*\r?\n\s*landedAt,\s*$/m;
  const match = source.match(returnPattern);
  if (!match) throw new Error('1.20.11 landing-rate compatibility patch cannot find stats return fields.');
  const indent = match[1];
  source = source.replace(
    returnPattern,
    `${indent}landingRateFpm,\n${indent}touchdownGroundSpeedKnots,\n${indent}takeoffAt,\n${indent}landedAt,`,
  );
}

if (source !== before) await fs.writeFile(filename, source, 'utf8');
console.log('Flight Deck EFB 1.20.11 landing-rate compatibility inputs normalized.');
