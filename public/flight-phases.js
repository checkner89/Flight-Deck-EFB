export const FLIGHT_PHASES = [
  { id: 'preflight', labelKey: 'phasePreflight', shortKey: 'phasePreflightShort' },
  { id: 'taxi-out', labelKey: 'phaseTaxiOut', shortKey: 'phaseTaxiOutShort' },
  { id: 'takeoff', labelKey: 'phaseTakeoff', shortKey: 'phaseTakeoffShort' },
  { id: 'climb', labelKey: 'phaseClimb', shortKey: 'phaseClimbShort' },
  { id: 'cruise', labelKey: 'phaseCruise', shortKey: 'phaseCruiseShort' },
  { id: 'descent', labelKey: 'phaseDescent', shortKey: 'phaseDescentShort' },
  { id: 'approach', labelKey: 'phaseApproach', shortKey: 'phaseApproachShort' },
  { id: 'landing', labelKey: 'phaseLanding', shortKey: 'phaseLandingShort' },
  { id: 'taxi-in', labelKey: 'phaseTaxiIn', shortKey: 'phaseTaxiInShort' },
  { id: 'postflight', labelKey: 'phasePostflight', shortKey: 'phasePostflightShort' },
];

const PHASE_IDS = new Set(FLIGHT_PHASES.map((phase) => phase.id));
const EARTH_RADIUS_NM = 3_440.065;

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validPoint(value) {
  const lat = finite(value?.lat);
  const lon = finite(value?.lon);
  return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function distanceNm(left, right) {
  if (!validPoint(left) || !validPoint(right)) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const lat1 = radians(Number(left.lat));
  const lat2 = radians(Number(right.lat));
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(Number(right.lon) - Number(left.lon));
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function simBriefFlight(state) {
  return state?.integrations?.simbrief?.flight || {};
}

function destinationPoint(state) {
  return simBriefFlight(state).destinationPosition || state?.flight?.destinationPosition || null;
}

function originPoint(state) {
  return simBriefFlight(state).originPosition || state?.flight?.originPosition || null;
}

function phaseFromGroundState(state, activeRecord) {
  const aircraft = state.aircraft || {};
  const siPhase = finite(state.flight?.flightPhase ?? state.integrations?.sayIntentions?.flightPhase);
  const hasLanded = Boolean(activeRecord?.stats?.landedAt);
  const atDestination = siPhase === 5 || hasLanded;
  if (atDestination) {
    const secured = aircraft.parkingBrake === true
      && aircraft.enginesRunning === false
      && Number(aircraft.groundSpeed || 0) < 1;
    return secured ? 'postflight' : 'taxi-in';
  }
  const moving = Number(aircraft.groundSpeed || 0) >= 3;
  const leavingStand = aircraft.enginesRunning === true && aircraft.parkingBrake === false;
  return moving || leavingStand ? 'taxi-out' : 'preflight';
}

export function deriveAutomaticFlightPhase(state = {}, activeRecord = null) {
  const aircraft = state.aircraft || {};
  if (!validPoint(aircraft)) return 'preflight';
  if (aircraft.onGround !== false) return phaseFromGroundState(state, activeRecord);

  const siPhase = finite(state.flight?.flightPhase ?? state.integrations?.sayIntentions?.flightPhase);
  const agl = finite(aircraft.aglFeet);
  const altitude = finite(aircraft.altitudeFeet) ?? 0;
  const verticalSpeed = finite(aircraft.verticalSpeedFpm) ?? 0;
  const destinationDistance = distanceNm(aircraft, destinationPoint(state));
  const originDistance = distanceNm(aircraft, originPoint(state));
  const clearedToLand = Boolean(state.flight?.clearedForLanding);

  if (clearedToLand && (agl === null || agl < 2_000)) return agl !== null && agl < 350 ? 'landing' : 'approach';
  if ((agl !== null && agl < 350) && verticalSpeed < 0) return 'landing';
  if (siPhase === 4) {
    if ((agl !== null && agl < 3_500) || (destinationDistance !== null && destinationDistance < 22 && altitude < 11_000)) return 'approach';
    return 'descent';
  }
  if (siPhase === 2) {
    if ((agl !== null && agl < 1_500) || (originDistance !== null && originDistance < 12 && altitude < 5_000)) return 'takeoff';
    return 'climb';
  }
  if (destinationDistance !== null && destinationDistance < 24 && (agl === null || agl < 5_000) && altitude < 12_000) return 'approach';
  if (verticalSpeed < -500 && (destinationDistance === null || destinationDistance < 280)) return 'descent';
  if (verticalSpeed > 650 && (altitude < 28_000 || siPhase !== 3)) return 'climb';
  if ((agl !== null && agl < 1_500) && verticalSpeed > 200) return 'takeoff';
  return 'cruise';
}

export function resolveFlightPhase(state, activeRecord, override = 'auto') {
  return PHASE_IDS.has(override) ? override : deriveAutomaticFlightPhase(state, activeRecord);
}

function routePoints(state) {
  const flight = simBriefFlight(state);
  const waypoints = Array.isArray(flight.waypoints) ? flight.waypoints.filter(validPoint) : [];
  if (waypoints.length > 1) return waypoints;
  return [flight.originPosition || state?.flight?.originPosition, flight.destinationPosition || state?.flight?.destinationPosition]
    .filter(validPoint);
}

function sumRoute(points, fromIndex = 0) {
  let total = 0;
  for (let index = Math.max(1, fromIndex + 1); index < points.length; index += 1) {
    total += distanceNm(points[index - 1], points[index]) || 0;
  }
  return total;
}

export function calculateFlightProgress(state = {}) {
  const aircraft = state.aircraft || {};
  const points = routePoints(state);
  const flight = simBriefFlight(state);
  const result = {
    routePointCount: points.length,
    totalRouteNm: points.length > 1 ? sumRoute(points) : null,
    remainingRouteNm: null,
    completedPercent: null,
    destinationDistanceNm: distanceNm(aircraft, destinationPoint(state)),
    nextWaypoint: null,
    nextWaypointDistanceNm: null,
    etaSeconds: null,
    fuelRemainingPounds: finite(aircraft.fuelWeightPounds),
    plannedBlockFuelPounds: finite(flight.blockFuelPounds),
    plannedTripFuelPounds: finite(flight.tripFuelPounds),
    reserveFuelPounds: finite(flight.reserveFuelPounds),
    taxiFuelPounds: finite(flight.taxiFuelPounds),
    fuelUsedPounds: null,
    fuelDeltaToPlannedPounds: null,
    plannedRemainingTripBurnPounds: null,
    projectedLandingFuelPounds: null,
    projectedReserveMarginPounds: null,
  };
  if (result.plannedBlockFuelPounds !== null && result.fuelRemainingPounds !== null) {
    result.fuelUsedPounds = Math.max(0, result.plannedBlockFuelPounds - result.fuelRemainingPounds);
    if (result.plannedTripFuelPounds !== null) result.fuelDeltaToPlannedPounds = result.plannedTripFuelPounds - result.fuelUsedPounds;
  }
  if (!validPoint(aircraft) || points.length === 0) return result;

  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (const [index, waypoint] of points.entries()) {
    const distance = distanceNm(aircraft, waypoint);
    if (distance !== null && distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  const nextIndex = nearestDistance < 4 && nearestIndex < points.length - 1 ? nearestIndex + 1 : nearestIndex;
  const nextWaypoint = points[nextIndex];
  const directToNext = distanceNm(aircraft, nextWaypoint) || 0;
  const remainingAfterNext = sumRoute(points, nextIndex);
  result.nextWaypoint = nextWaypoint;
  result.nextWaypointDistanceNm = directToNext;
  result.remainingRouteNm = directToNext + remainingAfterNext;
  if (result.totalRouteNm && result.totalRouteNm > 0) {
    result.completedPercent = Math.max(0, Math.min(100, (1 - result.remainingRouteNm / result.totalRouteNm) * 100));
  }
  const groundSpeed = finite(aircraft.groundSpeed);
  if (groundSpeed !== null && groundSpeed >= 30 && result.remainingRouteNm !== null) {
    result.etaSeconds = Math.round(result.remainingRouteNm / groundSpeed * 3_600);
  }
  if (result.plannedTripFuelPounds !== null
    && result.fuelRemainingPounds !== null
    && result.totalRouteNm > 0
    && result.remainingRouteNm !== null) {
    const remainingRatio = Math.max(0, Math.min(1, result.remainingRouteNm / result.totalRouteNm));
    result.plannedRemainingTripBurnPounds = result.plannedTripFuelPounds * remainingRatio;
    result.projectedLandingFuelPounds = result.fuelRemainingPounds - result.plannedRemainingTripBurnPounds;
    if (result.reserveFuelPounds !== null) {
      result.projectedReserveMarginPounds = result.projectedLandingFuelPounds - result.reserveFuelPounds;
    }
  }
  return result;
}

function timeFromSimBrief(value) {
  const parsed = finite(value);
  if (parsed === null || parsed <= 0) return null;
  const milliseconds = parsed > 10_000_000_000 ? parsed : parsed * 1_000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function phaseTimelineIndex(phase) {
  if (phase === 'preflight') return 0;
  if (['taxi-out', 'takeoff'].includes(phase)) return 1;
  if (['climb', 'cruise', 'descent', 'approach'].includes(phase)) return 2;
  if (['landing', 'taxi-in'].includes(phase)) return 3;
  return 3;
}

export function calculateFlightTimeline(state = {}, activeRecord = null, phase = 'preflight', nowValue = new Date()) {
  const flight = simBriefFlight(state);
  const track = Array.isArray(activeRecord?.track) ? activeRecord.track : [];
  const actualOutPoint = track.find((point) => point.onGround && Number(point.groundSpeedKnots ?? point.groundSpeed ?? 0) >= 2);
  const lastPoint = track.at(-1) || null;
  const actualOn = activeRecord?.stats?.landedAt || null;
  const actualIn = activeRecord?.endedAt
    || (actualOn && lastPoint?.onGround && lastPoint.parkingBrake === true && lastPoint.enginesRunning === false ? lastPoint.time : null);
  const planned = {
    out: timeFromSimBrief(flight.estimatedOut),
    off: timeFromSimBrief(flight.estimatedOff),
    on: timeFromSimBrief(flight.estimatedOn),
    in: timeFromSimBrief(flight.estimatedIn),
  };
  const progress = calculateFlightProgress(state);
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const predictedOn = !actualOn && Number.isFinite(progress.etaSeconds)
    ? new Date(now.getTime() + progress.etaSeconds * 1_000).toISOString()
    : null;
  const plannedTaxiInSeconds = planned.on && planned.in
    ? Math.max(0, Math.min(7_200, (Date.parse(planned.in) - Date.parse(planned.on)) / 1_000))
    : 600;
  const predictedIn = predictedOn
    ? new Date(Date.parse(predictedOn) + plannedTaxiInSeconds * 1_000).toISOString()
    : null;
  const actual = {
    out: actualOutPoint?.time || null,
    off: activeRecord?.stats?.takeoffAt || null,
    on: actualOn,
    in: actualIn,
  };
  const predicted = { out: null, off: null, on: predictedOn, in: predictedIn };
  const activeIndex = phaseTimelineIndex(phase);
  const events = ['out', 'off', 'on', 'in'].map((id, index) => {
    const comparison = actual[id] || predicted[id];
    let deltaMinutes = comparison && planned[id]
      ? Math.round((Date.parse(comparison) - Date.parse(planned[id])) / 60_000)
      : null;
    if (!comparison && planned[id] && index === activeIndex && now.getTime() > Date.parse(planned[id])) {
      deltaMinutes = Math.round((now.getTime() - Date.parse(planned[id])) / 60_000);
    }
    return {
      id,
      plannedAt: planned[id],
      actualAt: actual[id],
      predictedAt: predicted[id],
      deltaMinutes,
      status: actual[id] ? 'complete' : index === activeIndex ? 'current' : index < activeIndex ? 'missed' : 'upcoming',
    };
  });
  return {
    events,
    activeEvent: events[Math.min(activeIndex, events.length - 1)] || null,
    hasPlan: Object.values(planned).some(Boolean),
  };
}

export const PHASE_ACTIONS = {
  preflight: ['flight', 'briefing', 'atc', 'ground'],
  'taxi-out': ['taxi', 'atc', 'com'],
  takeoff: ['tracking', 'atc', 'com'],
  climb: ['tracking', 'atc', 'flight'],
  cruise: ['tracking', 'briefing', 'atc', 'flight'],
  descent: ['briefing', 'planner', 'tracking', 'atc'],
  approach: ['briefing', 'planner', 'tracking', 'atc'],
  landing: ['tracking', 'planner', 'briefing'],
  'taxi-in': ['planner', 'taxi', 'ground'],
  postflight: ['tracking', 'flight', 'new-flight'],
};

function hasWeather(state, airport) {
  const icao = String(airport || '').toUpperCase();
  const siAirports = state.integrations?.sayIntentions?.weather?.airports || [];
  if (siAirports.some((entry) => String(entry.airport).toUpperCase() === icao && (entry.metar || entry.atis))) return true;
  const flight = simBriefFlight(state);
  if (icao && icao === String(flight.origin || '').toUpperCase() && flight.originMetar) return true;
  return Boolean(icao && icao === String(flight.destination || '').toUpperCase() && flight.destinationMetar);
}

function autoItem(id, labelKey, complete, detailKey = null) {
  return { id, labelKey, complete: Boolean(complete), automatic: true, detailKey };
}

function manualItem(id, labelKey) {
  return { id, labelKey, complete: false, automatic: false, detailKey: null };
}

export function phaseChecklist(phase, state = {}, activeRecord = null) {
  const brief = simBriefFlight(state);
  const live = state.flight || {};
  const flight = {
    ...brief,
    ...live,
    origin: live.origin || brief.origin || null,
    destination: live.destination || brief.destination || null,
    departureRunway: live.departureRunway || brief.departureRunway || null,
    arrivalRunway: live.arrivalRunway || brief.arrivalRunway || null,
  };
  const aircraft = state.aircraft || {};
  const simulatorOnline = ['connected', 'demo'].includes(state.connections?.simConnect?.status);
  const routeReady = Boolean((state.integrations?.simbrief?.imported && simBriefFlight(state).waypoints?.length)
    || (flight.origin && flight.destination));
  const departureWeather = hasWeather(state, flight.origin);
  const destinationWeather = hasWeather(state, flight.destination);
  const taxiRouteReady = (state.taxi?.path?.length || 0) > 1;
  const recording = activeRecord?.status === 'recording';
  const arrivalTaxiReady = taxiRouteReady && (state.planning?.selectedAirport?.icao === flight.destination || state.flight?.currentAirport === flight.destination);
  const common = {
    routeReady,
    simulatorOnline,
    departureWeather,
    destinationWeather,
    taxiRouteReady,
    recording,
    arrivalTaxiReady,
  };
  const checklists = {
    preflight: [
      autoItem('route', 'checkRouteLoaded', common.routeReady),
      autoItem('simulator', 'checkSimulatorConnected', common.simulatorOnline),
      autoItem('departure-weather', 'checkDepartureWeather', common.departureWeather),
      autoItem('departure-runway', 'checkDepartureRunway', Boolean(flight.departureRunway)),
      manualItem('departure-briefing', 'checkDepartureBriefing'),
      manualItem('charts', 'checkChartsReviewed'),
    ],
    'taxi-out': [
      autoItem('clearance', 'checkTaxiClearance', Boolean(state.taxi?.clearance?.text)),
      autoItem('taxi-route', 'checkTaxiRoute', common.taxiRouteReady),
      manualItem('hold-short', 'checkHoldShortReviewed'),
      manualItem('takeoff-briefing', 'checkTakeoffBriefing'),
      manualItem('cabin-ready', 'checkCabinReady'),
    ],
    takeoff: [
      autoItem('takeoff-clearance', 'checkTakeoffClearance', Boolean(flight.clearedForTakeoff)),
      manualItem('runway-verified', 'checkRunwayVerified'),
      manualItem('takeoff-briefing', 'checkTakeoffBriefing'),
    ],
    climb: [
      autoItem('tracking', 'checkTrackingActive', common.recording),
      manualItem('departure-procedure', 'checkDepartureProcedure'),
      manualItem('transition-altitude', 'checkTransitionAltitude'),
    ],
    cruise: [
      autoItem('tracking', 'checkTrackingActive', common.recording),
      autoItem('destination-weather', 'checkDestinationWeather', common.destinationWeather),
      manualItem('fuel-check', 'checkFuelReviewed'),
      manualItem('arrival-briefing', 'checkArrivalBriefing'),
    ],
    descent: [
      autoItem('destination-weather', 'checkDestinationWeather', common.destinationWeather),
      autoItem('arrival-runway', 'checkArrivalRunway', Boolean(flight.arrivalRunway)),
      autoItem('arrival-taxi', 'checkArrivalTaxiPlan', common.arrivalTaxiReady),
      manualItem('arrival-briefing', 'checkArrivalBriefing'),
      manualItem('landing-data', 'checkLandingData'),
    ],
    approach: [
      autoItem('landing-clearance', 'checkLandingClearance', Boolean(flight.clearedForLanding)),
      autoItem('arrival-taxi', 'checkArrivalTaxiPlan', common.arrivalTaxiReady),
      manualItem('approach-briefing', 'checkApproachBriefing'),
      manualItem('missed-approach', 'checkMissedApproach'),
    ],
    landing: [
      autoItem('landing-clearance', 'checkLandingClearance', Boolean(flight.clearedForLanding)),
      manualItem('runway-vacated', 'checkRunwayVacated'),
    ],
    'taxi-in': [
      autoItem('arrival-taxi', 'checkArrivalTaxiPlan', common.arrivalTaxiReady || common.taxiRouteReady),
      autoItem('gate', 'checkGateAssigned', Boolean(state.gate?.name || state.taxi?.pathMetadata?.destination?.name)),
      manualItem('ground-services', 'checkGroundServices'),
    ],
    postflight: [
      autoItem('parking-brake', 'checkParkingBrake', aircraft.parkingBrake === true),
      autoItem('engines-off', 'checkEnginesOff', aircraft.enginesRunning === false),
      autoItem('flight-saved', 'checkFlightSaved', !activeRecord),
      manualItem('postflight-review', 'checkPostflightReview'),
    ],
  };
  return checklists[phase] || checklists.preflight;
}
