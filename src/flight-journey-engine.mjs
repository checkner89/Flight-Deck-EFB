const PHASES = Object.freeze([
  'planning',
  'preflight',
  'boarding',
  'pushback',
  'taxi-out',
  'takeoff',
  'climb',
  'cruise',
  'descent',
  'approach',
  'landing',
  'taxi-in',
  'turnaround',
  'shutdown',
]);

const LEGACY_OVERRIDE_MAP = Object.freeze({
  preflight: 'preflight',
  'taxi-out': 'taxi-out',
  takeoff: 'takeoff',
  climb: 'climb',
  cruise: 'cruise',
  descent: 'descent',
  approach: 'approach',
  landing: 'landing',
  'taxi-in': 'taxi-in',
  postflight: 'shutdown',
});

const PHASE_INDEX = new Map(PHASES.map((phase, index) => [phase, index]));

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bool(value) {
  return value === true || value === 1 || String(value).trim().toLowerCase() === 'true';
}

function hasFlightPlan(state) {
  const flight = state?.flight || {};
  const simbrief = state?.integrations?.simbrief?.flight || {};
  return Boolean(
    (flight.origin && flight.destination)
    || (simbrief.origin && simbrief.destination)
    || flight.flightPlanRoute
    || simbrief.route,
  );
}

function activeService(service) {
  const status = String(service?.status || service?.state || '').toLowerCase();
  return ['active', 'running', 'boarding', 'deboarding', 'requested', 'in-progress', 'in_progress'].includes(status);
}

function turnaroundEvidence(state) {
  const turnaround = state?.integrations?.turnaround || {};
  const gsx = state?.integrations?.gsx || {};
  const services = Array.isArray(gsx.services) ? gsx.services : [];
  const stage = String(turnaround.stage || '').toLowerCase();
  return {
    boarding: stage.includes('board') || services.some((service) => /board/i.test(service?.name || service?.type || '') && activeService(service)),
    pushback: stage.includes('push') || services.some((service) => /push/i.test(service?.name || service?.type || '') && activeService(service)),
    active: ['active', 'running', 'in-progress', 'in_progress'].includes(String(turnaround.status || '').toLowerCase())
      || services.some(activeService),
  };
}

function distanceMeters(left, right) {
  if (!left || !right) return null;
  const lat1 = finite(left.lat);
  const lon1 = finite(left.lon);
  const lat2 = finite(right.lat);
  const lon2 = finite(right.lon);
  if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return null;
  const radius = 6_371_000;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gateDistanceMeters(state) {
  const aircraft = state?.aircraft;
  const gate = state?.gate;
  return distanceMeters(aircraft, gate);
}

function normalizeOverride(state) {
  const override = String(state?.integrations?.flightOperations?.phaseOverride || 'auto').trim().toLowerCase();
  if (override === 'auto') return null;
  return PHASE_INDEX.has(override) ? override : LEGACY_OVERRIDE_MAP[override] || null;
}

function historicalFlags(previous = {}) {
  const phase = String(previous.phase || '');
  const index = PHASE_INDEX.get(phase) ?? -1;
  return {
    departed: Boolean(previous.departed) || index >= PHASE_INDEX.get('takeoff'),
    landed: Boolean(previous.landed) || index >= PHASE_INDEX.get('landing'),
  };
}

function phaseResult(phase, confidence, evidence, flags, extras = {}) {
  return {
    phase,
    phaseIndex: PHASE_INDEX.get(phase),
    confidence,
    evidence,
    departed: Boolean(flags.departed),
    landed: Boolean(flags.landed),
    ...extras,
  };
}

export function deriveFlightJourney(state = {}, previous = {}) {
  const aircraft = state.aircraft;
  const override = normalizeOverride(state);
  const prior = historicalFlags(previous);
  const services = turnaroundEvidence(state);

  if (override) {
    const overrideIndex = PHASE_INDEX.get(override);
    return phaseResult(override, 1, ['manual-override'], {
      departed: prior.departed || overrideIndex >= PHASE_INDEX.get('takeoff'),
      landed: prior.landed || overrideIndex >= PHASE_INDEX.get('landing'),
    }, { automatic: false });
  }

  if (!aircraft) {
    return phaseResult('planning', hasFlightPlan(state) ? 0.9 : 0.65, [hasFlightPlan(state) ? 'flight-plan-available' : 'waiting-for-aircraft'], prior, { automatic: true });
  }

  const onGround = bool(aircraft.onGround);
  const groundSpeed = Math.max(0, finite(aircraft.groundSpeed, 0));
  const agl = Math.max(0, finite(aircraft.aglFeet, onGround ? 0 : null) ?? 0);
  const verticalSpeed = finite(aircraft.verticalSpeedFpm, 0);
  const parkingBrake = bool(aircraft.parkingBrake);
  const enginesRunning = bool(aircraft.enginesRunning);
  const gearDown = aircraft.gearDown === undefined ? null : bool(aircraft.gearDown);
  const flaps = Math.max(0, finite(aircraft.flapsHandleIndex, 0));
  const gateDistance = gateDistanceMeters(state);
  const atGate = gateDistance !== null ? gateDistance <= 90 : Boolean(state.gate && groundSpeed <= 0.5 && parkingBrake);
  const flight = state.flight || {};

  let departed = prior.departed || !onGround;
  let landed = prior.landed;

  if (!onGround) {
    departed = true;
    const landingConfigured = bool(flight.clearedForLanding) || gearDown === true || flaps > 0;
    if (agl <= 1_500 && verticalSpeed < 500) {
      return phaseResult('approach', 0.95, ['airborne', 'low-agl', landingConfigured ? 'landing-configured' : 'final-segment'], { departed, landed }, { automatic: true });
    }
    if (agl <= 500 && verticalSpeed > 250 && !prior.departed) {
      return phaseResult('takeoff', 0.94, ['airborne-transition', 'low-agl', 'positive-climb'], { departed, landed }, { automatic: true });
    }
    if (verticalSpeed <= -350) {
      return phaseResult(agl <= 4_000 ? 'approach' : 'descent', 0.9, ['airborne', 'descending'], { departed, landed }, { automatic: true });
    }
    if (verticalSpeed >= 350) {
      return phaseResult('climb', 0.9, ['airborne', 'climbing'], { departed, landed }, { automatic: true });
    }
    return phaseResult('cruise', 0.84, ['airborne', 'stable-vertical-speed'], { departed, landed }, { automatic: true });
  }

  if (prior.departed && !prior.landed && groundSpeed >= 25) {
    landed = true;
    return phaseResult('landing', 0.96, ['on-ground-after-flight', 'landing-roll'], { departed: true, landed }, { automatic: true });
  }

  if (prior.departed) landed = true;

  if (landed) {
    if (groundSpeed > 0.8) {
      return phaseResult('taxi-in', 0.96, ['on-ground-after-landing', 'moving'], { departed: true, landed: true }, { automatic: true });
    }
    if (parkingBrake && !enginesRunning && atGate) {
      if (services.active) {
        return phaseResult('turnaround', 0.94, ['at-gate', 'parking-brake', 'engines-off', 'ground-services-active'], { departed: true, landed: true }, { automatic: true });
      }
      return phaseResult('shutdown', 0.98, ['at-gate', 'parking-brake', 'engines-off', 'stationary'], { departed: true, landed: true }, { automatic: true });
    }
    return phaseResult('taxi-in', 0.82, ['on-ground-after-landing', groundSpeed <= 0.8 ? 'temporarily-stopped' : 'moving'], { departed: true, landed: true }, { automatic: true });
  }

  if (groundSpeed >= 35 || bool(flight.clearedForTakeoff)) {
    return phaseResult('takeoff', groundSpeed >= 35 ? 0.91 : 0.76, ['on-ground', groundSpeed >= 35 ? 'takeoff-speed' : 'takeoff-clearance'], { departed, landed }, { automatic: true });
  }

  if (groundSpeed > 1.5) {
    const phase = services.pushback && groundSpeed < 8 ? 'pushback' : 'taxi-out';
    return phaseResult(phase, phase === 'pushback' ? 0.87 : 0.94, ['on-ground', 'moving', phase === 'pushback' ? 'pushback-service' : 'taxi-speed'], { departed, landed }, { automatic: true });
  }

  if (!parkingBrake && enginesRunning && services.pushback) {
    return phaseResult('pushback', 0.88, ['pushback-service', 'parking-brake-released'], { departed, landed }, { automatic: true });
  }

  if (services.boarding) {
    return phaseResult('boarding', 0.92, ['boarding-service'], { departed, landed }, { automatic: true });
  }

  if (!enginesRunning && parkingBrake && hasFlightPlan(state)) {
    return phaseResult('preflight', 0.88, ['flight-plan-available', 'stationary', 'engines-off'], { departed, landed }, { automatic: true });
  }

  return phaseResult(hasFlightPlan(state) ? 'preflight' : 'planning', 0.72, [hasFlightPlan(state) ? 'ground-preparation' : 'no-flight-plan'], { departed, landed }, { automatic: true });
}

export function deriveFlightCompletion(state = {}, journey = {}) {
  const aircraft = state.aircraft;
  if (!aircraft || !journey?.landed) {
    return { ready: false, confidence: 0, reasons: ['flight-not-landed'] };
  }

  const speed = Math.max(0, finite(aircraft.groundSpeed, 0));
  const gateDistance = gateDistanceMeters(state);
  const atGate = gateDistance !== null ? gateDistance <= 90 : Boolean(state.gate && speed <= 0.5 && bool(aircraft.parkingBrake));
  const checks = {
    onGround: bool(aircraft.onGround),
    stationary: speed <= 0.5,
    parkingBrake: bool(aircraft.parkingBrake),
    enginesOff: !bool(aircraft.enginesRunning),
    gateReached: atGate,
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const ready = Object.values(checks).every(Boolean);
  return {
    ready,
    confidence: passed / Object.keys(checks).length,
    checks,
    reasons: Object.entries(checks).filter(([, value]) => !value).map(([key]) => key),
    gateDistanceMeters: gateDistance === null ? null : Math.round(gateDistance),
  };
}

export function createJourneyTracker() {
  let current = null;
  return {
    update(state) {
      current = deriveFlightJourney(state, current || {});
      return { ...current };
    },
    reset() {
      current = null;
    },
    value() {
      return current ? { ...current } : null;
    },
  };
}

export { PHASES as FLIGHT_JOURNEY_PHASES };
