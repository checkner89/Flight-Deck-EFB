import { evaluateBriefingReadiness } from './briefing-readiness-engine.mjs';

export class BriefingReadinessService {
  constructor(engine) {
    this.engine = engine;
    this.started = false;
    this.publishing = false;
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
    const readiness = evaluateBriefingReadiness(state);
    const fingerprint = JSON.stringify(readiness);
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;
    this.publishing = true;
    try {
      this.engine.setIntegration('briefingReadiness', readiness);
    } finally {
      this.publishing = false;
    }
  }
}
