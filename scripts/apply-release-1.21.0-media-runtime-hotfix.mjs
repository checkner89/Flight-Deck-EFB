import fs from 'node:fs/promises';

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));
if (pkg.version !== '1.21.0') throw new Error(`1.21.0 media runtime hotfix requires package version 1.21.0, got ${pkg.version}.`);

const filename = 'public/release-1.21.0.js';
let source = await fs.readFile(filename, 'utf8');

if (!source.includes('id="fd121-capture-source"')) {
  source = source.replace(
    '<div class="fd121-media-actions"><button id="fd121-screenshot" type="button">SCREENSHOT</button><button id="fd121-record" type="button">AUFNAHME STARTEN</button>',
    '<div class="fd121-media-actions"><select id="fd121-capture-source" aria-label="Aufnahmequelle"><option value="efb">NUR EFB</option><option value="window" selected>FENSTER</option><option value="screen">BILDSCHIRM</option></select><button id="fd121-screenshot" type="button">SCREENSHOT</button><button id="fd121-record" type="button">AUFNAHME STARTEN</button>',
  );
}

if (!source.includes("const sourceMode = document.querySelector('#fd121-capture-source')")) {
  source = source.replace(
    `  async function requestCaptureStream({ audio = false } = {}) {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Bildschirmaufnahme wird von diesem Gerät/Browser nicht unterstützt.');
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 }, displaySurface: 'window' },`,
    `  async function requestCaptureStream({ audio = false } = {}) {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Bildschirmaufnahme wird von diesem Gerät/Browser nicht unterstützt.');
    const sourceMode = document.querySelector('#fd121-capture-source')?.value || 'window';
    const displaySurface = sourceMode === 'screen' ? 'monitor' : sourceMode === 'efb' ? 'browser' : 'window';
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 }, displaySurface },`,
  );
}

const toggleStart = source.indexOf('  async function toggleRecording() {');
const stopStart = source.indexOf('  async function stopRecording()', toggleStart);
if (toggleStart >= 0 && stopStart > toggleStart) {
  let block = source.slice(toggleStart, stopStart);
  if (!block.includes('state.currentMediaFlightId = flight.id;')) {
    block = block.replace('      const flight = await activeFlightIdentity();', '      const flight = await activeFlightIdentity();\n      state.currentMediaFlightId = flight.id;');
    source = source.slice(0, toggleStart) + block + source.slice(stopStart);
  }
}

if (!source.includes('const recordingLostFlight = state.mediaRecorder')) {
  source = source.replace(
    '      await fetchCurrentFlight(false);\n      simplifyHome();',
    `      await fetchCurrentFlight(false);
      const recordingLostFlight = state.mediaRecorder && state.mediaRecorder.state !== 'inactive'
        && state.currentMediaFlightId && state.currentMediaFlightId !== 'unassigned'
        && (!state.currentFlight || state.currentFlight.id !== state.currentMediaFlightId);
      if (recordingLostFlight) await stopRecording();
      simplifyHome();`,
  );
}

await fs.writeFile(filename, source, 'utf8');
console.log('Flight Deck EFB 1.21.0 capture-source selector and flight-end recording stop materialized.');
