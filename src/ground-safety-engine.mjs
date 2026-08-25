import { resolveFlightPhase } from '../public/flight-phases.js';
import { distanceMeters } from './state-engine.mjs';

const SEVERITY = Object.freeze({ info: 0, caution: 1, warning: 2, critical: 3 });
const DEFAULT_THRESHOLDS = Object.freeze({
  taxiCautionKnots: 20,
  taxiCriticalKnots: 30,
  holdAdvisoryMeters: 120,
  holdWarningMeters: 55,
  holdCriticalMeters: 25,
  gateAdvisoryMeters: 150,
  gateWarningMeters: 60,
  gateCriticalMeters: 25,
  trafficWarningMeters: 60,
  trafficCriticalMeters: 35,
});

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function alert(id, severity, title, detail, extra = {}) {
  return { id, severity, title, detail, ...extra };
}

function authorizedRunwayMovement(clearance = '', flight = {}) {
  const text = String(clearance || '').toLowerCase();
  if (flight.clearedForTakeoff) return true;
  return /\b(?:cleared for takeoff|line up(?: and wait)?|cross (?:runway|rwy)|cleared to cross)\b/i.test(text);
}

function sortAlerts(left, right) {
  return (SEVERITY[right.severity] ?? 0) - (SEVERITY[left.severity] ?? 0)
    || String(left.id).localeCompare(String(right.id));
}

export function evaluateGroundSafety(state, thresholds = {}) {
  const config = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const aircraft = state?.aircraft;
  if (!aircraft?.onGround || !Number.isFinite(Number(aircraft.lat)) || !Number.isFinite(Number(aircraft.lon))) {
    return { status: 'clear', highestSeverity: null, alerts: [], thresholds: config };
  }

  const alerts = [];
  const speed = Math.max(0, finite(aircraft.groundSpeed, 0));
  const phase = resolveFlightPhase(state, null, state?.integrations?.flightOperations?.phaseOverride);
  const taxiPhase = ['preflight', 'taxi-out', 'taxi-in', 'postflight'].includes(phase);
  const guidance = state?.guidance || {};

  if (guidance.reason === 'route-position-mismatch') {
    alerts.push(alert(
      'route-position-mismatch',
      'caution',
      'ROUTE / POSITION PRÜFEN',
      'Taxiweg und Flugzeugposition passen nicht zusammen. Guidance wurde sicher eingeschränkt.',
    ));
  } else if (guidance.warning) {
    alerts.push(alert(
      'off-route',
      'warning',
      'TAXIWEG VERLASSEN',
      `${Math.round(finite(guidance.deviationMeters, 0))} m von der freigegebenen/geplanten Route entfernt`,
      { distanceMeters: finite(guidance.deviationMeters) },
    ));
  }

  if (taxiPhase && speed >= config.taxiCriticalKnots) {
    alerts.push(alert('taxi-speed', 'critical', 'TAXI SPEED', `${Math.round(speed)} kt Groundspeed · Geschwindigkeit deutlich reduzieren`, { speedKnots: speed }));
  } else if (taxiPhase && speed >= config.taxiCautionKnots) {
    alerts.push(alert('taxi-speed', 'caution', 'TAXI SPEED', `${Math.round(speed)} kt Groundspeed · erhöhte Taxigeschwindigkeit`, { speedKnots: speed }));
  }

  const runwayAuthorized = authorizedRunwayMovement(state?.taxi?.clearance?.text, state?.flight || {});
  if (!runwayAuthorized) {
    const currentSegment = Number.isInteger(guidance.closestSegment) ? guidance.closestSegment : null;
    let nearestHold = null;
    for (const hold of state?.taxi?.holdShorts || []) {
      if (!Number.isFinite(Number(hold.lat)) || !Number.isFinite(Number(hold.lon))) continue;
      if (currentSegment !== null && Number.isInteger(hold.index) && currentSegment > hold.index + 1) continue;
      const distance = distanceMeters(aircraft, hold);
      if (!nearestHold || distance < nearestHold.distance) nearestHold = { hold, distance };
    }
    if (nearestHold && nearestHold.distance <= config.holdAdvisoryMeters) {
      const label = nearestHold.hold.label || 'HOLD SHORT';
      const meters = Math.round(nearestHold.distance);
      if (nearestHold.distance <= config.holdCriticalMeters && speed > 2) {
        alerts.push(alert('hold-short', 'critical', 'HOLD SHORT', `${label} · ${meters} m · keine Runway-Freigabe erkannt`, { distanceMeters: nearestHold.distance }));
      } else if (nearestHold.distance <= config.holdWarningMeters && speed > 4) {
        alerts.push(alert('hold-short', 'warning', 'HOLD SHORT AHEAD', `${label} in ${meters} m · Geschwindigkeit reduzieren`, { distanceMeters: nearestHold.distance }));
      } else if (speed > 7) {
        alerts.push(alert('hold-short', 'caution', 'HOLD SHORT AHEAD', `${label} in ${meters} m`, { distanceMeters: nearestHold.distance }));
      }
    }
  }

  const gate = state?.gate;
  if (Number.isFinite(Number(gate?.lat)) && Number.isFinite(Number(gate?.lon))) {
    const gateDistance = distanceMeters(aircraft, gate);
    if (gateDistance <= config.gateCriticalMeters && speed > 5) {
      alerts.push(alert('gate-speed', 'critical', 'STAND APPROACH', `${Math.round(gateDistance)} m bis ${gate.name || 'Stand'} · ${Math.round(speed)} kt`, { distanceMeters: gateDistance }));
    } else if (gateDistance <= config.gateWarningMeters && speed > 8) {
      alerts.push(alert('gate-speed', 'warning', 'STAND APPROACH', `${Math.round(gateDistance)} m bis ${gate.name || 'Stand'} · Geschwindigkeit reduzieren`, { distanceMeters: gateDistance }));
    } else if (gateDistance <= config.gateAdvisoryMeters && speed > 12) {
      alerts.push(alert('gate-speed', 'caution', 'STAND AHEAD', `${Math.round(gateDistance)} m bis ${gate.name || 'Stand'} · ${Math.round(speed)} kt`, { distanceMeters: gateDistance }));
    }
  } else if (guidance.available && finite(guidance.remainingMeters) !== null && guidance.remainingMeters <= 70 && speed > 10) {
    alerts.push(alert('route-end-speed', 'caution', 'ROUTE END AHEAD', `${Math.round(guidance.remainingMeters)} m verbleibend · ${Math.round(speed)} kt`, { distanceMeters: guidance.remainingMeters }));
  }

  let nearestMovingTraffic = null;
  for (const traffic of state?.integrations?.simTraffic?.aircraft || []) {
    if (!traffic?.onGround) continue;
    const trafficSpeed = Math.max(0, finite(traffic.groundSpeed, 0));
    if (trafficSpeed < 5 && speed < 5) continue;
    if (!Number.isFinite(Number(traffic.lat)) || !Number.isFinite(Number(traffic.lon))) continue;
    const distance = distanceMeters(aircraft, traffic);
    if (distance > config.trafficWarningMeters) continue;
    if (!nearestMovingTraffic || distance < nearestMovingTraffic.distance) nearestMovingTraffic = { traffic, distance, trafficSpeed };
  }
  if (nearestMovingTraffic) {
    const callsign = nearestMovingTraffic.traffic.callsign || nearestMovingTraffic.traffic.atcId || 'Traffic';
    const meters = Math.round(nearestMovingTraffic.distance);
    const severity = nearestMovingTraffic.distance <= config.trafficCriticalMeters ? 'critical' : 'warning';
    alerts.push(alert('ground-traffic', severity, 'GROUND TRAFFIC', `${callsign} in ${meters} m · visuell prüfen`, { distanceMeters: nearestMovingTraffic.distance }));
  }

  alerts.sort(sortAlerts);
  const highestSeverity = alerts[0]?.severity || null;
  return {
    status: highestSeverity || 'clear',
    highestSeverity,
    alerts: alerts.slice(0, 8),
    thresholds: config,
    phase,
  };
}

export class GroundSafetyEngine {
  constructor(engine, { thresholds = {} } = {}) {
    this.engine = engine;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.started = false;
    this.fingerprint = '';
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
    const evaluated = evaluateGroundSafety(state, this.thresholds);
    const fingerprint = JSON.stringify(evaluated);
    if (fingerprint === this.fingerprint) return;
    this.fingerprint = fingerprint;
    this.publishing = true;
    try {
      this.engine.setIntegration('groundSafety', {
        ...evaluated,
        updatedAt: new Date().toISOString(),
        detail: evaluated.alerts[0]?.detail || 'Keine aktiven Ground-Safety-Warnungen',
      });
    } finally {
      this.publishing = false;
    }
  }
}
