import { createJourneyTracker, deriveFlightCompletion } from './flight-journey-engine.mjs';

function detailFor(journey, completion) {
  const phase = String(journey?.phase || 'planning').replaceAll('-', ' ').toUpperCase();
  if (completion?.ready) return `${phase} · flight completion conditions satisfied.`;
  if (journey?.automatic === false) return `${phase} · manual phase correction active.`;
  return `${phase} · automatically derived from existing flight state.`;
}

function publicSnapshot(journey, completion, changedAt) {
  return {
    status: completion.ready ? 'complete' : journey.phase === 'planning' ? 'waiting' : 'active',
    phase: journey.phase,
    phaseIndex: journey.phaseIndex,
    confidence: Math.round(Number(journey.confidence || 0) * 100) / 100,
    evidence: Array.isArray(journey.evidence) ? journey.evidence.slice(0, 8) : [],
    automatic: journey.automatic !== false,
    departed: Boolean(journey.departed),
    landed: Boolean(journey.landed),
    phaseChangedAt: changedAt,
    completion,
    detail: detailFor(journey, completion),
  };
}

export class FlightJourneyService {
  constructor(engine, { now = () => new Date() } = {}) {
    this.engine = engine;
    this.now = now;
    this.started = false;
    this.publishing = false;
    this.tracker = createJourneyTracker();
    this.sessionGeneration = null;
    this.lastPhase = null;
    this.phaseChangedAt = null;
    this.lastFingerprint = '';
    this.listener = (state) => this.#onState(state);
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.engine.on('change', this.listener);
    this.#onState(this.engine.publicState());
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.engine.off('change', this.listener);
  }

  #onState(state) {
    if (this.publishing) return;
    const generation = Number(state.session?.generation || 1);
    if (this.sessionGeneration !== null && generation !== this.sessionGeneration) {
      this.tracker.reset();
      this.lastPhase = null;
      this.phaseChangedAt = null;
      this.lastFingerprint = '';
    }
    this.sessionGeneration = generation;

    const journey = this.tracker.update(state);
    if (journey.phase !== this.lastPhase) {
      this.lastPhase = journey.phase;
      this.phaseChangedAt = this.now().toISOString();
    }
    const completion = deriveFlightCompletion(state, journey);
    const snapshot = publicSnapshot(journey, completion, this.phaseChangedAt);
    const fingerprint = JSON.stringify(snapshot);
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;

    this.publishing = true;
    try {
      this.engine.setIntegration('flightJourney', snapshot);
    } finally {
      this.publishing = false;
    }
  }
}
