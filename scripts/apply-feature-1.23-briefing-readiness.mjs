import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('src/server.mjs', (source) => {
  let next = source;
  if (!next.includes("import { BriefingReadinessService } from './briefing-readiness-service.mjs';")) {
    const anchor = "import { FlightJourneyService } from './flight-journey-service.mjs';";
    if (!next.includes(anchor)) throw new Error('1.23 briefing readiness import anchor missing.');
    next = next.replace(anchor, `${anchor}\nimport { BriefingReadinessService } from './briefing-readiness-service.mjs';`);
  }
  if (!next.includes('const briefingReadiness = new BriefingReadinessService(engine);')) {
    const anchor = '  const flightJourney = new FlightJourneyService(engine);';
    if (!next.includes(anchor)) throw new Error('1.23 briefing readiness construction anchor missing.');
    next = next.replace(anchor, `${anchor}\n  const briefingReadiness = new BriefingReadinessService(engine);`);
  }
  if (!next.includes('  briefingReadiness.start();')) {
    const anchor = '  flightJourney.start();';
    if (!next.includes(anchor)) throw new Error('1.23 briefing readiness start anchor missing.');
    next = next.replace(anchor, `${anchor}\n  briefingReadiness.start();`);
  }
  if (!next.includes("{ id: 'briefing-readiness', label: 'Operational Briefing Readiness'")) {
    const anchor = "      { id: 'flight-journey', label: 'Gate-to-Gate Flight Journey', status: ['active', 'complete'].includes(state.integrations.flightJourney?.status) ? 'ready' : state.integrations.flightJourney?.status || 'waiting', detail: state.integrations.flightJourney?.detail || '' },";
    if (!next.includes(anchor)) throw new Error('1.23 briefing readiness diagnostics anchor missing.');
    next = next.replace(anchor, `${anchor}\n      { id: 'briefing-readiness', label: 'Operational Briefing Readiness', status: state.integrations.briefingReadiness?.status === 'ready' ? 'ready' : state.integrations.briefingReadiness?.status || 'waiting', detail: state.integrations.briefingReadiness?.summary || '' },`);
  }
  return next;
});

await update('src/state-engine.mjs', (source) => {
  if (source.includes('briefingReadiness: {')) return source;
  const anchor = `        flightJourney: {\n          status: 'waiting',\n          phase: 'planning',\n          phaseIndex: 0,\n          confidence: 0,\n          evidence: [],\n          automatic: true,\n          departed: false,\n          landed: false,\n          phaseChangedAt: null,\n          completion: { ready: false, confidence: 0, reasons: ['flight-not-landed'] },\n          detail: 'Waiting for gate-to-gate flight state.',\n        },`;
  if (!source.includes(anchor)) throw new Error('1.23 briefing readiness state anchor missing.');
  const addition = `${anchor}\n        briefingReadiness: {\n          status: 'blocking',\n          ready: false,\n          blockingCount: 2,\n          attentionCount: 0,\n          items: [],\n          summary: 'Waiting for flight planning data.',\n        },`;
  return source.replace(anchor, addition);
});

console.log('Flight Deck EFB 1.23 operational briefing readiness materialized.');
