import { calculateFlightProgress, deriveAutomaticFlightPhase } from '../public/flight-phases.js';

const PHASES = new Set(['preflight', 'taxi-out', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing', 'taxi-in', 'postflight']);
const PHASE_DWELL_MS = Object.freeze({
  preflight: 2_500,
  'taxi-out': 1_800,
  takeoff: 700,
  climb: 1_800,
  cruise: 4_500,
  descent: 2_500,
  approach: 1_800,
  landing: 650,
  'taxi-in': 1_500,
  postflight: 3_000,
});
const SEVERITY = Object.freeze({ info: 0, caution: 1, warning: 2, critical: 3 });

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value, max = 180) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : '';
}

function service(state, id) {
  return state?.integrations?.gsx?.services?.find((entry) => entry.id === id) || null;
}

function weatherAvailable(state, airport) {
  const icao = String(airport || '').trim().toUpperCase();
  if (!icao) return false;
  const sayIntentions = state.integrations?.sayIntentions?.weather?.airports || [];
  if (sayIntentions.some((entry) => String(entry.airport || '').toUpperCase() === icao && (entry.metar || entry.atis))) return true;
  const official = state.integrations?.aviationWeather?.airports || [];
  if (official.some((entry) => String(entry.airport || entry.icao || '').toUpperCase() === icao && (entry.metar || entry.taf))) return true;
  const brief = state.integrations?.simbrief?.flight || {};
  if (icao === String(brief.origin || '').toUpperCase() && brief.originMetar) return true;
  if (icao === String(brief.destination || '').toUpperCase() && brief.destinationMetar) return true;
  return false;
}

function phaseEvidence(state, rawPhase) {
  const aircraft = state.aircraft || {};
  const evidence = [];
  evidence.push(aircraft.onGround === false ? 'AIRBORNE' : 'ON GROUND');
  if (Number.isFinite(Number(aircraft.groundSpeed))) evidence.push(`GS ${Math.round(Number(aircraft.groundSpeed))} KT`);
  if (Number.isFinite(Number(aircraft.aglFeet))) evidence.push(`AGL ${Math.round(Number(aircraft.aglFeet))} FT`);
  if (Number.isFinite(Number(aircraft.verticalSpeedFpm))) evidence.push(`VS ${Math.round(Number(aircraft.verticalSpeedFpm))} FPM`);
  if (aircraft.enginesRunning === true) evidence.push('ENGINES RUNNING');
  if (aircraft.enginesRunning === false) evidence.push('ENGINES OFF');
  if (aircraft.parkingBrake === true) evidence.push('PARK BRAKE SET');
  if (state.flight?.clearedForTakeoff) evidence.push('TAKEOFF CLEARANCE');
  if (state.flight?.clearedForLanding) evidence.push('LANDING CLEARANCE');
  const siPhase = finite(state.flight?.flightPhase ?? state.integrations?.sayIntentions?.flightPhase);
  if (siPhase !== null) evidence.push(`SI PHASE ${siPhase}`);
  evidence.push(`RAW ${String(rawPhase).toUpperCase()}`);
  return evidence.slice(0, 8);
}

function serviceDone(entry) {
  return entry?.completed === true || entry?.status === 'completed';
}

function serviceActive(entry) {
  return entry?.active === true || ['active', 'requested'].includes(entry?.status);
}

function knownPassengerProgress(gsx = {}) {
  const payload = gsx.payload || {};
  const target = finite(payload.passengerTarget);
  const boarded = finite(payload.boardingTotal ?? payload.boardingPassengers);
  if (target === null || target <= 0 || boarded === null) return null;
  return Math.max(0, Math.min(100, Math.round(boarded / target * 100)));
}

export function evaluateTurnaround(state = {}, phase = 'preflight') {
  const aircraft = state.aircraft || {};
  const gsx = state.integrations?.gsx || {};
  const simbrief = state.integrations?.simbrief || {};
  const departure = ['preflight', 'taxi-out'].includes(phase);
  const arrival = ['taxi-in', 'postflight'].includes(phase);
  if (!aircraft.onGround || (!departure && !arrival)) {
    return {
      status: 'inactive', stage: 'in-flight', progressPercent: 100,
      detail: 'Turnaround coordination is inactive while airborne.', blockers: [], recommendedNext: null, milestones: [],
    };
  }

  if (departure) {
    const boarding = service(state, 'boarding');
    const catering = service(state, 'catering');
    const refueling = service(state, 'refueling');
    const pushback = service(state, 'pushback');
    const passengerProgress = knownPassengerProgress(gsx);
    const milestones = [
      { id: 'flight-plan', label: 'Flight plan / OFP', complete: Boolean(simbrief.imported || state.flight?.origin && state.flight?.destination), optional: false },
      { id: 'payload', label: 'Payload target', complete: finite(simbrief.flight?.passengers) === null || Boolean(gsx.payload?.sync?.syncedAt) || !gsx.installed, optional: !gsx.installed },
      { id: 'boarding', label: 'Boarding', complete: serviceDone(boarding) || passengerProgress === 100 || !gsx.installed, optional: !gsx.installed },
      { id: 'catering', label: 'Catering', complete: serviceDone(catering) || !serviceActive(catering), optional: true },
      { id: 'refueling', label: 'Refueling', complete: serviceDone(refueling) || !serviceActive(refueling), optional: true },
      { id: 'aircraft-ready', label: 'Aircraft ready for push', complete: aircraft.enginesRunning === true || (aircraft.parkingBrake === true && Number(aircraft.groundSpeed || 0) < 1), optional: false },
    ];
    const required = milestones.filter((entry) => !entry.optional);
    const progressPercent = Math.round(required.filter((entry) => entry.complete).length / Math.max(1, required.length) * 100);
    const blockers = required.filter((entry) => !entry.complete).map((entry) => entry.label);
    let stage = 'setup';
    if (serviceActive(boarding) || passengerProgress !== null && passengerProgress < 100) stage = 'boarding';
    else if (serviceActive(refueling)) stage = 'refueling';
    else if (serviceActive(pushback) || phase === 'taxi-out') stage = 'pushback';
    else if (blockers.length === 0) stage = 'ready';
    const recommendedNext = blockers[0]
      || (stage === 'ready' ? 'Complete the native before-start / pushback flow.' : 'Monitor turnaround services.');
    return {
      status: blockers.length ? 'working' : 'ready',
      stage,
      progressPercent,
      passengerProgress,
      detail: blockers.length ? `${blockers.length} departure item${blockers.length === 1 ? '' : 's'} still open.` : 'Departure turnaround is ready for the next pilot-controlled step.',
      blockers,
      recommendedNext,
      milestones,
    };
  }

  const deboarding = service(state, 'deboarding');
  const deboardingTarget = finite(gsx.payload?.deboardingTotal);
  const deboardingCurrent = finite(gsx.payload?.deboardingPassengers);
  const passengerProgress = deboardingTarget && deboardingCurrent !== null
    ? Math.max(0, Math.min(100, Math.round(deboardingCurrent / deboardingTarget * 100)))
    : null;
  const milestones = [
    { id: 'stand', label: 'Aircraft at stand', complete: Number(aircraft.groundSpeed || 0) < 1 && aircraft.parkingBrake === true, optional: false },
    { id: 'engines', label: 'Engines shut down', complete: aircraft.enginesRunning === false, optional: false },
    { id: 'deboarding', label: 'Deboarding', complete: serviceDone(deboarding) || !gsx.installed, optional: !gsx.installed },
  ];
  const required = milestones.filter((entry) => !entry.optional);
  const progressPercent = Math.round(required.filter((entry) => entry.complete).length / Math.max(1, required.length) * 100);
  const blockers = required.filter((entry) => !entry.complete).map((entry) => entry.label);
  const stage = serviceActive(deboarding) ? 'deboarding' : blockers.length ? 'securing' : 'complete';
  return {
    status: blockers.length ? 'working' : 'complete',
    stage,
    progressPercent,
    passengerProgress,
    detail: blockers.length ? `${blockers.length} arrival item${blockers.length === 1 ? '' : 's'} still open.` : 'Arrival turnaround is complete.',
    blockers,
    recommendedNext: blockers[0] || 'Review the flight record and start New Flight when ready.',
    milestones,
  };
}

function advisory(id, severity, title, detail, action = null) {
  return { id, severity, title, detail, action };
}

export function evaluateAssistant(state = {}, phase = 'preflight', turnaround = null) {
  const advisories = [];
  const progress = calculateFlightProgress(state);
  const routeSync = state.integrations?.routeSync || {};
  const groundSafety = state.integrations?.groundSafety || {};
  const brief = state.integrations?.simbrief?.flight || {};
  const destination = state.flight?.destination || brief.destination;

  for (const alert of groundSafety.alerts || []) {
    advisories.push(advisory(
      `ground-${alert.id}`,
      alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'caution',
      alert.title || 'Ground Safety',
      alert.detail || 'Review the ground-safety advisory.',
      'taxi',
    ));
  }

  if (routeSync.comparison?.status === 'different') {
    advisories.push(advisory('route-mismatch', 'warning', 'ROUTE MISMATCH', routeSync.comparison.detail || 'MSFS EFB and Flight Deck routes differ.', 'flight'));
  } else if (routeSync.comparison?.status === 'partial') {
    advisories.push(advisory('route-partial', 'caution', 'ROUTE DIFFERENCES', routeSync.comparison.detail || 'Review route differences before departure.', 'flight'));
  }

  const reserve = finite(brief.reserveFuelPounds);
  const margin = finite(progress.projectedReserveMarginPounds);
  if (margin !== null && margin < 0) {
    advisories.push(advisory('fuel-reserve', 'warning', 'PROJECTED FUEL BELOW RESERVE', `Projected reserve margin ${Math.round(margin)} lb. Review fuel and diversion options.`, 'flight'));
  } else if (margin !== null && reserve && margin < reserve * 0.2) {
    advisories.push(advisory('fuel-margin', 'caution', 'LOW PROJECTED RESERVE MARGIN', `Projected reserve margin ${Math.round(margin)} lb.`, 'flight'));
  }

  if (['descent', 'approach', 'landing'].includes(phase) && destination && !weatherAvailable(state, destination)) {
    advisories.push(advisory('arrival-weather', 'caution', 'ARRIVAL WEATHER MISSING', `No current weather is available for ${destination}.`, 'briefing'));
  }

  if (phase === 'preflight' && !state.integrations?.simbrief?.imported && !(state.flight?.origin && state.flight?.destination)) {
    advisories.push(advisory('flight-plan', 'info', 'FLIGHT PLAN PENDING', 'Load a simulator flight plan or import the latest SimBrief OFP.', 'flight'));
  }

  if (phase === 'preflight' && state.integrations?.simbrief?.imported && !routeSync.nativeEfb?.connected) {
    advisories.push(advisory('native-route', 'info', 'MSFS EFB ROUTE NOT CHECKED', 'Open the native Flight Deck EFB in MSFS 2024 to compare the simulator EFB route.', 'flight'));
  }

  if (turnaround?.status === 'working' && turnaround.recommendedNext) {
    advisories.push(advisory('turnaround', 'info', 'TURNAROUND NEXT', turnaround.recommendedNext, 'ground'));
  }

  const intelligenceConfidence = finite(state.integrations?.flightIntelligence?.confidence);
  if (intelligenceConfidence !== null && intelligenceConfidence < 0.55) {
    advisories.push(advisory('phase-confidence', 'info', 'FLIGHT PHASE TRANSITION', 'Flight Deck is validating the next automatic flight phase before switching context.', 'flight'));
  }

  advisories.sort((left, right) => (SEVERITY[right.severity] ?? 0) - (SEVERITY[left.severity] ?? 0));
  const highestSeverity = advisories[0]?.severity || 'clear';
  return {
    status: advisories.length ? highestSeverity : 'clear',
    highestSeverity,
    advisories: advisories.slice(0, 10),
    detail: advisories[0]?.detail || `No operational advisories for ${String(phase).toUpperCase()}.`,
    advisoryOnly: true,
  };
}

export class FlightIntelligenceEngine {
  constructor(engine, { now = () => new Date() } = {}) {
    this.engine = engine;
    this.now = now;
    this.started = false;
    this.stablePhase = null;
    this.candidatePhase = null;
    this.candidateSince = null;
    this.phaseChangedAt = null;
    this.sessionGeneration = null;
    this.lastFingerprint = '';
    this.publishing = false;
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
    const now = this.now();
    const generation = Number(state.session?.generation || 1);
    const sessionChanged = this.sessionGeneration !== null && generation !== this.sessionGeneration;
    this.sessionGeneration = generation;
    const rawPhase = deriveAutomaticFlightPhase(state, null);
    if (!PHASES.has(rawPhase)) return;

    if (!this.stablePhase || sessionChanged) {
      this.stablePhase = rawPhase;
      this.candidatePhase = null;
      this.candidateSince = null;
      this.phaseChangedAt = now.toISOString();
    } else if (rawPhase === this.stablePhase) {
      this.candidatePhase = null;
      this.candidateSince = null;
    } else if (rawPhase !== this.candidatePhase) {
      this.candidatePhase = rawPhase;
      this.candidateSince = now.getTime();
    } else {
      const dwell = PHASE_DWELL_MS[rawPhase] ?? 2_500;
      if (now.getTime() - this.candidateSince >= dwell) {
        this.stablePhase = rawPhase;
        this.candidatePhase = null;
        this.candidateSince = null;
        this.phaseChangedAt = now.toISOString();
      }
    }

    const candidateDwell = this.candidatePhase && this.candidateSince
      ? now.getTime() - this.candidateSince
      : null;
    const requiredDwell = this.candidatePhase ? PHASE_DWELL_MS[this.candidatePhase] ?? 2_500 : null;
    const confidence = this.candidatePhase
      ? Math.max(0.45, Math.min(0.9, 0.45 + 0.45 * (candidateDwell / requiredDwell)))
      : 0.97;
    const intelligence = {
      status: this.candidatePhase ? 'transition' : 'stable',
      phase: this.stablePhase,
      rawPhase,
      candidatePhase: this.candidatePhase,
      confidence: Math.round(confidence * 100) / 100,
      evidence: phaseEvidence(state, rawPhase),
      phaseChangedAt: this.phaseChangedAt,
      source: 'MSFS + ATC + route context',
      detail: this.candidatePhase
        ? `Validating ${this.candidatePhase} before automatic phase change.`
        : `${this.stablePhase} is stable.`,
      updatedAt: now.toISOString(),
    };
    const stateForDerived = {
      ...state,
      integrations: {
        ...state.integrations,
        flightIntelligence: intelligence,
      },
    };
    const turnaround = {
      ...evaluateTurnaround(stateForDerived, this.stablePhase),
      updatedAt: now.toISOString(),
      remoteServiceControl: false,
    };
    const assistant = {
      ...evaluateAssistant(stateForDerived, this.stablePhase, turnaround),
      updatedAt: now.toISOString(),
    };
    const fingerprint = JSON.stringify({
      intelligence: { ...intelligence, updatedAt: null },
      turnaround: { ...turnaround, updatedAt: null },
      assistant: { ...assistant, updatedAt: null },
    });
    if (fingerprint === this.lastFingerprint) return;
    this.lastFingerprint = fingerprint;
    this.publishing = true;
    try {
      this.engine.setIntegration('flightIntelligence', intelligence);
      this.engine.setIntegration('turnaround', turnaround);
      this.engine.setIntegration('flightAssistant', assistant);
    } finally {
      this.publishing = false;
    }
  }
}
