import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => {
  let next = source;
  if (!next.includes("import { FlightJourneyService } from './flight-journey-service.mjs';")) {
    const anchor = "import { FlightIntelligenceEngine } from './flight-intelligence-engine.mjs';";
    if (!next.includes(anchor)) throw new Error('1.23 journey import anchor missing.');
    next = next.replace(anchor, `${anchor}\nimport { FlightJourneyService } from './flight-journey-service.mjs';`);
  }
  if (!next.includes('const flightJourney = new FlightJourneyService(engine);')) {
    const anchor = '  const flightIntelligence = new FlightIntelligenceEngine(engine);';
    if (!next.includes(anchor)) throw new Error('1.23 journey service construction anchor missing.');
    next = next.replace(anchor, `${anchor}\n  const flightJourney = new FlightJourneyService(engine);`);
  }
  if (!next.includes('  flightJourney.start();')) {
    const anchor = '  flightIntelligence.start();';
    if (!next.includes(anchor)) throw new Error('1.23 journey service start anchor missing.');
    next = next.replace(anchor, `${anchor}\n  flightJourney.start();`);
  }
  if (!next.includes("{ id: 'flight-journey', label: 'Gate-to-Gate Flight Journey'")) {
    const anchor = "      { id: 'flight-intelligence', label: 'Automatic Flight Intelligence', status: state.integrations.flightIntelligence?.status === 'stable' ? 'ready' : state.integrations.flightIntelligence?.status || 'waiting', detail: state.integrations.flightIntelligence?.detail || '' },";
    if (!next.includes(anchor)) throw new Error('1.23 journey diagnostics anchor missing.');
    next = next.replace(anchor, `${anchor}\n      { id: 'flight-journey', label: 'Gate-to-Gate Flight Journey', status: ['active', 'complete'].includes(state.integrations.flightJourney?.status) ? 'ready' : state.integrations.flightJourney?.status || 'waiting', detail: state.integrations.flightJourney?.detail || '' },`);
  }
  return next;
});

await update('src/state-engine.mjs', (source) => {
  let next = source;
  const legacy = "const FLIGHT_PHASE_OVERRIDES = new Set(['auto', 'preflight', 'taxi-out', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing', 'taxi-in', 'postflight']);";
  const expanded = "const FLIGHT_PHASE_OVERRIDES = new Set(['auto', 'planning', 'preflight', 'boarding', 'pushback', 'taxi-out', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing', 'taxi-in', 'turnaround', 'shutdown', 'postflight']);";
  if (!next.includes(expanded)) {
    if (!next.includes(legacy)) throw new Error('1.23 phase override anchor missing.');
    next = next.replace(legacy, expanded);
  }
  if (!next.includes('flightJourney: {')) {
    const anchor = `        flightIntelligence: {\n          status: 'waiting',\n          phase: null,\n          rawPhase: null,\n          candidatePhase: null,\n          confidence: null,\n          evidence: [],\n          detail: 'Waiting for simulator flight-state data.',\n        },`;
    if (!next.includes(anchor)) throw new Error('1.23 journey integration default anchor missing.');
    const addition = `${anchor}\n        flightJourney: {\n          status: 'waiting',\n          phase: 'planning',\n          phaseIndex: 0,\n          confidence: 0,\n          evidence: [],\n          automatic: true,\n          departed: false,\n          landed: false,\n          phaseChangedAt: null,\n          completion: { ready: false, confidence: 0, reasons: ['flight-not-landed'] },\n          detail: 'Waiting for gate-to-gate flight state.',\n        },`;
    next = next.replace(anchor, addition);
  }
  return next;
});

console.log('Flight Deck EFB 1.23 gate-to-gate journey service materialized.');
