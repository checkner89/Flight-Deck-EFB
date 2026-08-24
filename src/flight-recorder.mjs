import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const SCHEMA_VERSION = 1;
const EARTH_RADIUS_NM = 3_440.065;
const MAX_TRACK_POINTS = 50_000;
const MAX_WEATHER_SNAPSHOTS = 180;

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value, maxLength = 500) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  if (!normalized || ['undefined', 'null', 'none', 'nan'].includes(normalized.toLowerCase())) return null;
  return normalized.slice(0, maxLength);
}

function upper(value, maxLength = 24) {
  return text(value, maxLength)?.toUpperCase() ?? null;
}

function validPoint(point) {
  const lat = finite(point?.lat);
  const lon = finite(point?.lon);
  return lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export function flightDistanceNm(a, b) {
  if (!validPoint(a) || !validPoint(b)) return 0;
  const toRadians = (degrees) => degrees * Math.PI / 180;
  const lat1 = toRadians(Number(a.lat));
  const lat2 = toRadians(Number(b.lat));
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(Number(b.lon) - Number(a.lon));
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function storageDirectoryFromEnvironment() {
  if (process.env.FLIGHT_DECK_EFB_DATA_DIR) {
    return path.resolve(process.env.FLIGHT_DECK_EFB_DATA_DIR, 'flights');
  }
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'Flight Deck EFB', 'flights');
  if (process.platform === 'win32') return path.join(os.homedir(), 'AppData', 'Local', 'Flight Deck EFB', 'flights');
  return path.join(process.cwd(), '.flight-deck-efb-data', 'flights');
}

function safeFileId(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{7,79}$/.test(normalized) ? normalized : null;
}

function waypoint(value, index) {
  const lat = finite(value?.lat);
  const lon = finite(value?.lon);
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return {
    index,
    ident: upper(value.ident ?? value.name, 20) || `WP${index + 1}`,
    name: text(value.name, 80),
    type: upper(value.type, 24),
    airway: upper(value.airway ?? value.viaAirway, 24),
    lat,
    lon,
    altitudeFeet: finite(value.altitudeFeet ?? value.altitude),
    plannedSpeedKnots: finite(value.plannedSpeedKnots ?? value.tas),
    distanceNm: finite(value.distanceNm ?? value.distance),
    stage: upper(value.stage, 20),
  };
}

function point(value, index) {
  if (!validPoint(value)) return null;
  return {
    index,
    time: value.time || new Date().toISOString(),
    lat: Number(value.lat),
    lon: Number(value.lon),
    altitudeFeet: finite(value.altitudeFeet),
    aglFeet: finite(value.aglFeet),
    groundSpeedKnots: finite(value.groundSpeedKnots ?? value.groundSpeed),
    indicatedAirspeedKnots: finite(value.indicatedAirspeedKnots ?? value.indicatedAirspeed),
    headingDegrees: finite(value.headingDegrees ?? value.heading),
    verticalSpeedFpm: finite(value.verticalSpeedFpm),
    ambientTemperatureC: finite(value.ambientTemperatureC),
    ambientWindDirection: finite(value.ambientWindDirection),
    ambientWindSpeedKnots: finite(value.ambientWindSpeedKnots),
    visibilityMeters: finite(value.visibilityMeters),
    seaLevelPressureHpa: finite(value.seaLevelPressureHpa),
    gearDown: value.gearDown === null || value.gearDown === undefined ? null : Boolean(value.gearDown),
    flapsHandleIndex: finite(value.flapsHandleIndex),
    spoilersArmed: value.spoilersArmed === null || value.spoilersArmed === undefined ? null : Boolean(value.spoilersArmed),
    autopilotMaster: value.autopilotMaster === null || value.autopilotMaster === undefined ? null : Boolean(value.autopilotMaster),
    onGround: Boolean(value.onGround),
    parkingBrake: value.parkingBrake === null || value.parkingBrake === undefined ? null : Boolean(value.parkingBrake),
    enginesRunning: value.enginesRunning === null || value.enginesRunning === undefined ? null : Boolean(value.enginesRunning),
    fuelWeightPounds: finite(value.fuelWeightPounds),
    grossWeightPounds: finite(value.grossWeightPounds),
  };
}

function planFromState(state) {
  const simbrief = state.integrations?.simbrief || {};
  const source = simbrief.flight || state.flight || {};
  const waypoints = (source.waypoints || []).map(waypoint).filter(Boolean);
  return {
    source: simbrief.imported ? 'simbrief' : state.flight?.flightPlanRoute ? 'sayintentions' : 'simulator',
    route: text(source.route ?? source.flightPlanRoute, 8_000),
    sid: upper(source.sid ?? state.flight?.sid, 32),
    star: upper(source.star ?? state.flight?.star, 32),
    initialAltitude: text(source.initialAltitude, 20),
    waypoints,
    originPosition: validPoint(source.originPosition ?? state.flight?.originPosition)
      ? { lat: Number((source.originPosition ?? state.flight.originPosition).lat), lon: Number((source.originPosition ?? state.flight.originPosition).lon) }
      : null,
    destinationPosition: validPoint(source.destinationPosition ?? state.flight?.destinationPosition)
      ? { lat: Number((source.destinationPosition ?? state.flight.destinationPosition).lat), lon: Number((source.destinationPosition ?? state.flight.destinationPosition).lon) }
      : null,
  };
}

function flightFromState(state) {
  const simbrief = state.integrations?.simbrief?.flight || {};
  const live = state.flight || {};
  const aircraft = state.aircraft || {};
  return {
    flightId: text(live.flightId, 80),
    callsign: upper(live.callsign ?? simbrief.callsign, 24),
    flightNumber: upper(simbrief.flightNumber, 20),
    origin: upper(live.origin ?? simbrief.origin, 4),
    originName: text(simbrief.originName, 100),
    destination: upper(live.destination ?? simbrief.destination, 4),
    destinationName: text(simbrief.destinationName, 100),
    alternate: upper(simbrief.alternate, 4),
    departureRunway: upper(live.departureRunway ?? simbrief.departureRunway, 8),
    arrivalRunway: upper(live.arrivalRunway ?? simbrief.arrivalRunway, 8),
    gate: text(state.gate?.name ?? state.taxi?.pathMetadata?.destination?.name, 40),
    aircraftType: upper(simbrief.aircraftType, 16),
    aircraftName: text(simbrief.aircraftName ?? aircraft.aircraftTitle, 120),
    registration: upper(aircraft.registration ?? simbrief.registration, 24),
    passengers: finite(simbrief.passengers),
    blockFuelPounds: finite(simbrief.blockFuelPounds),
    tripFuelPounds: finite(simbrief.tripFuelPounds),
    taxiFuelPounds: finite(simbrief.taxiFuelPounds),
    reserveFuelPounds: finite(simbrief.reserveFuelPounds),
    alternateFuelPounds: finite(simbrief.alternateFuelPounds),
    contingencyFuelPounds: finite(simbrief.contingencyFuelPounds),
    extraFuelPounds: finite(simbrief.extraFuelPounds),
    estimatedOut: finite(simbrief.estimatedOut),
    estimatedOff: finite(simbrief.estimatedOff),
    estimatedOn: finite(simbrief.estimatedOn),
    estimatedIn: finite(simbrief.estimatedIn),
    enrouteSeconds: finite(simbrief.enrouteSeconds),
  };
}

function identityFromState(state) {
  const flight = flightFromState(state);
  const generatedAt = text(state.integrations?.simbrief?.generatedAt, 60);
  if (flight.flightId) return `si:${flight.flightId}`;
  if (generatedAt && flight.origin && flight.destination) return `sb:${generatedAt}:${flight.origin}:${flight.destination}`;
  if (flight.callsign && flight.origin && flight.destination) return `route:${flight.callsign}:${flight.origin}:${flight.destination}`;
  if (flight.origin && flight.destination) return `route:${flight.origin}:${flight.destination}`;
  return null;
}

function operationsFromState(state) {
  const operations = state.integrations?.flightOperations || {};
  const checklist = operations.checklist && typeof operations.checklist === 'object' && !Array.isArray(operations.checklist)
    ? Object.fromEntries(Object.entries(operations.checklist).slice(0, 160).map(([key, checked]) => [String(key).slice(0, 80), Boolean(checked)]))
    : {};
  return {
    phaseOverride: text(operations.phaseOverride, 24) || 'auto',
    checklist,
    notes: text(operations.notes, 4_000) || '',
    updatedAt: operations.updatedAt || null,
  };
}

function canAutoStart(state) {
  if (!validPoint(state.aircraft)) return false;
  if (identityFromState(state)) return true;
  return state.aircraft.onGround === false || Number(state.aircraft.groundSpeed || 0) >= 30;
}

function summarize(record) {
  if (!record) return null;
  return {
    id: record.id,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    updatedAt: record.updatedAt,
    completionReason: record.completionReason || null,
    flight: record.flight,
    plan: {
      source: record.plan?.source || null,
      route: record.plan?.route || null,
      waypointCount: record.plan?.waypoints?.length || 0,
    },
    stats: record.stats,
  };
}

function publicRecord(record, { includeTrack = true, trackAfter = 0 } = {}) {
  if (!record) return null;
  const normalizedTrackAfter = Math.max(0, Math.min(
    record.track?.length || 0,
    Number.isFinite(Number(trackAfter)) ? Math.floor(Number(trackAfter)) : 0,
  ));
  const clone = structuredClone({ ...record, track: [] });
  clone.track = includeTrack ? structuredClone((record.track || []).slice(normalizedTrackAfter)) : [];
  clone.trackOffset = includeTrack ? normalizedTrackAfter : 0;
  clone.trackTotal = record.track?.length || 0;
  for (const snapshot of clone.weather || []) delete snapshot._signature;
  return clone;
}

function calculateStats(record) {
  const track = record.track || [];
  let distanceNm = 0;
  let airborneSeconds = 0;
  let takeoffAt = record.stats?.takeoffAt || null;
  let landedAt = record.stats?.landedAt || null;
  for (let index = 1; index < track.length; index += 1) {
    const previous = track[index - 1];
    const current = track[index];
    const segment = flightDistanceNm(previous, current);
    if (segment < 80) distanceNm += segment;
    const elapsed = Math.max(0, Math.min(120, (Date.parse(current.time) - Date.parse(previous.time)) / 1_000));
    if (!previous.onGround) airborneSeconds += elapsed;
    if (previous.onGround && !current.onGround && !takeoffAt) takeoffAt = current.time;
    if (!previous.onGround && current.onGround) landedAt = current.time;
  }
  const altitudes = track.map((entry) => finite(entry.altitudeFeet)).filter((value) => value !== null);
  const groundSpeeds = track.map((entry) => finite(entry.groundSpeedKnots)).filter((value) => value !== null);
  const indicatedSpeeds = track.map((entry) => finite(entry.indicatedAirspeedKnots)).filter((value) => value !== null);
  const verticalSpeeds = track.map((entry) => finite(entry.verticalSpeedFpm)).filter((value) => value !== null);
  const fuelValues = track.map((entry) => finite(entry.fuelWeightPounds)).filter((value) => value !== null);
  const startTime = Date.parse(record.startedAt);
  const endTime = Date.parse(record.endedAt || track.at(-1)?.time || record.updatedAt);
  const fuelStart = fuelValues[0] ?? null;
  const fuelEnd = fuelValues.at(-1) ?? null;
  return {
    pointCount: track.length,
    distanceNm: Math.round(distanceNm * 10) / 10,
    durationSeconds: Number.isFinite(startTime) && Number.isFinite(endTime) ? Math.max(0, Math.round((endTime - startTime) / 1_000)) : 0,
    airborneSeconds: Math.round(airborneSeconds),
    maxAltitudeFeet: altitudes.length ? Math.round(Math.max(...altitudes)) : null,
    maxGroundSpeedKnots: groundSpeeds.length ? Math.round(Math.max(...groundSpeeds)) : null,
    maxIndicatedAirspeedKnots: indicatedSpeeds.length ? Math.round(Math.max(...indicatedSpeeds)) : null,
    maxClimbFpm: verticalSpeeds.length ? Math.round(Math.max(...verticalSpeeds)) : null,
    maxDescentFpm: verticalSpeeds.length ? Math.round(Math.min(...verticalSpeeds)) : null,
    fuelStartPounds: fuelStart,
    fuelEndPounds: fuelEnd,
    fuelUsedPounds: fuelStart !== null && fuelEnd !== null ? Math.max(0, Math.round(fuelStart - fuelEnd)) : null,
    takeoffAt,
    landedAt,
  };
}

function xml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (character) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

export class FlightRecorder {
  constructor(engine, {
    storageDirectory = storageDirectoryFromEnvironment(),
    now = () => new Date(),
    minimumSampleMs = 2_500,
    stationarySampleMs = 30_000,
    flushDelayMs = 1_200,
  } = {}) {
    this.engine = engine;
    this.storageDirectory = storageDirectory;
    this.now = now;
    this.minimumSampleMs = minimumSampleMs;
    this.stationarySampleMs = stationarySampleMs;
    this.flushDelayMs = flushDelayMs;
    this.index = { schemaVersion: SCHEMA_VERSION, flights: [] };
    this.active = null;
    this.started = false;
    this.pendingState = null;
    this.pendingScheduled = false;
    this.flushTimer = null;
    this.queue = Promise.resolve();
    this.onChange = (state) => this.#scheduleCapture(state);
  }

  async start() {
    if (this.started) return;
    await fs.mkdir(this.storageDirectory, { recursive: true });
    let indexLoaded = false;
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(this.storageDirectory, 'index.json'), 'utf8'));
      if (Array.isArray(parsed.flights)) {
        this.index = { schemaVersion: SCHEMA_VERSION, flights: parsed.flights };
        indexLoaded = true;
      }
    } catch {
      // Rebuild below from individual, atomically written records.
    }
    if (!indexLoaded) await this.#rebuildIndexFromRecords();
    const activeMeta = this.index.flights.find((entry) => entry.status === 'recording');
    if (activeMeta?.id) {
      try {
        this.active = await this.#readRecord(activeMeta.id);
        if (this.active.operations) this.engine.setFlightOperations(this.active.operations);
      } catch {
        activeMeta.status = 'interrupted';
      }
    }
    this.started = true;
    this.engine.on('change', this.onChange);
    this.#scheduleCapture(this.engine.publicState());
  }

  async stop() {
    if (!this.started) return;
    this.started = false;
    this.engine.off('change', this.onChange);
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    await this.#settle();
    await this.#flush();
  }

  async beginManual(state = this.engine.publicState()) {
    return this.#enqueue(async () => {
      if (!validPoint(state.aircraft)) throw new Error('MSFS liefert noch keine gültige Flugzeugposition.');
      if (!this.active) this.active = this.#createRecord(state, { manual: true });
      await this.#capture(state, { forceSample: true });
      await this.#flush();
      return summarize(this.active);
    });
  }

  async finalize(reason = 'manual-save') {
    return this.#enqueue(async () => {
      const saved = await this.#finalizeInternal(reason);
      await this.#flush();
      return saved;
    });
  }

  async current({ includeTrack = true, trackAfter = 0 } = {}) {
    await this.#settle();
    if (!this.active) return null;
    return publicRecord(this.active, { includeTrack, trackAfter });
  }

  async list() {
    await this.#settle();
    return structuredClone(this.index.flights).sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)));
  }

  async get(id) {
    await this.#settle();
    const safeId = safeFileId(id);
    if (!safeId) return null;
    if (this.active?.id === safeId) return publicRecord(this.active);
    try {
      return publicRecord(await this.#readRecord(safeId));
    } catch {
      return null;
    }
  }

  async delete(id) {
    const safeId = safeFileId(id);
    if (!safeId) return false;
    return this.#enqueue(async () => {
      if (this.active?.id === safeId) throw new Error('Der aktive Flug muss zuerst gespeichert werden.');
      const index = this.index.flights.findIndex((entry) => entry.id === safeId);
      if (index < 0) return false;
      this.index.flights.splice(index, 1);
      await fs.rm(this.#recordPath(safeId), { force: true });
      await this.#writeIndex();
      return true;
    });
  }

  async exportJson(id) {
    const record = await this.get(id);
    return record ? `${JSON.stringify(record, null, 2)}\n` : null;
  }

  async exportGpx(id) {
    const record = await this.get(id);
    if (!record) return null;
    const name = [record.flight?.callsign, record.flight?.origin, record.flight?.destination].filter(Boolean).join(' ') || record.id;
    const route = (record.plan?.waypoints || []).map((entry) => `    <rtept lat="${entry.lat}" lon="${entry.lon}"><name>${xml(entry.ident)}</name>${entry.altitudeFeet === null ? '' : `<ele>${(entry.altitudeFeet * 0.3048).toFixed(1)}</ele>`}</rtept>`).join('\n');
    const track = (record.track || []).map((entry) => `      <trkpt lat="${entry.lat}" lon="${entry.lon}">${entry.altitudeFeet === null ? '' : `<ele>${(entry.altitudeFeet * 0.3048).toFixed(1)}</ele>`}<time>${xml(entry.time)}</time></trkpt>`).join('\n');
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gpx version="1.1" creator="Flight Deck EFB" xmlns="http://www.topografix.com/GPX/1/1">',
      `  <metadata><name>${xml(name)}</name><time>${xml(record.startedAt)}</time></metadata>`,
      route ? `  <rte><name>${xml(name)} planned route</name>\n${route}\n  </rte>` : '',
      `  <trk><name>${xml(name)} actual track</name><trkseg>\n${track}\n    </trkseg></trk>`,
      '</gpx>',
      '',
    ].filter(Boolean).join('\n');
  }

  async exportBackup() {
    await this.#settle();
    const ids = new Set(this.index.flights.map((entry) => entry.id));
    if (this.active?.id) ids.add(this.active.id);
    const records = [];
    for (const id of [...ids].slice(0, 500)) {
      try {
        const record = this.active?.id === id ? this.active : await this.#readRecord(id);
        const serializable = structuredClone(record);
        for (const snapshot of serializable.weather || []) delete snapshot._signature;
        records.push(serializable);
      } catch {
        // A single damaged flight must not prevent exporting the remaining archive.
      }
    }
    return {
      schemaVersion: 1,
      product: 'Flight Deck EFB',
      exportedAt: this.now().toISOString(),
      records,
    };
  }

  async importBackup(value, { replace = false } = {}) {
    if (!value || value.product !== 'Flight Deck EFB' || !Array.isArray(value.records)) throw new Error('Ungültige Flight-Deck-EFB-Sicherung.');
    if (value.records.length > 500) throw new Error('Die Sicherung enthält zu viele Flüge.');
    return this.#enqueue(async () => {
      if (replace && this.active) throw new Error('Der aktive Flug muss vor dem Ersetzen gespeichert werden.');
      const records = value.records.map((record) => this.#validateImportedRecord(record));
      if (replace) {
        for (const meta of this.index.flights) await fs.rm(this.#recordPath(meta.id), { force: true });
        this.index = { schemaVersion: SCHEMA_VERSION, flights: [] };
      }
      for (const record of records) {
        if (this.active?.id === record.id) continue;
        await this.#writeRecord(record);
        this.#upsertIndex(record);
      }
      await this.#writeIndex();
      return { imported: records.length, total: this.index.flights.length };
    });
  }

  #scheduleCapture(state) {
    this.pendingState = state;
    if (this.pendingScheduled) return;
    this.pendingScheduled = true;
    queueMicrotask(() => {
      this.pendingScheduled = false;
      const snapshot = this.pendingState;
      this.pendingState = null;
      if (snapshot) this.#enqueue(() => this.#capture(snapshot));
    });
  }

  async #settle() {
    if (this.pendingState) {
      const snapshot = this.pendingState;
      this.pendingState = null;
      this.pendingScheduled = false;
      await this.#enqueue(() => this.#capture(snapshot));
    }
    await this.queue;
  }

  #enqueue(operation) {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => {});
    return next;
  }

  async #capture(state, { forceSample = false } = {}) {
    if (!state || !validPoint(state.aircraft)) return;
    const identity = identityFromState(state);
    const sessionGeneration = Number(state.session?.generation || 1);
    if (this.active) {
      const activeIdentity = this.active.source?.identity || null;
      const sessionChanged = this.active.source?.sessionGeneration !== sessionGeneration;
      const identityChanged = activeIdentity && identity && activeIdentity !== identity;
      if (this.active.source?.manual && identity) {
        this.active.source.identity = identity;
        this.active.source.manual = false;
      } else if (sessionChanged || identityChanged) {
        await this.#finalizeInternal(sessionChanged ? 'new-flight-session' : 'flight-identity-change');
      }
    }
    if (!this.active && canAutoStart(state)) this.active = this.#createRecord(state);
    if (!this.active) return;

    this.#updateRecordContext(this.active, state);
    const now = this.now();
    const timestamp = now.toISOString();
    const last = this.active.track.at(-1);
    const elapsedMs = last ? now.getTime() - Date.parse(last.time) : Infinity;
    const movedNm = last ? flightDistanceNm(last, state.aircraft) : Infinity;
    const speed = Number(state.aircraft.groundSpeed || 0);
    const movementThresholdNm = state.aircraft.onGround ? 0.004 : 0.03;
    const due = forceSample
      || !last
      || (elapsedMs >= this.minimumSampleMs && movedNm >= movementThresholdNm)
      || elapsedMs >= this.stationarySampleMs
      || Boolean(last.onGround) !== Boolean(state.aircraft.onGround);
    if (due && this.active.track.length < MAX_TRACK_POINTS) {
      const sample = point({ ...state.aircraft, time: timestamp }, this.active.track.length);
      if (sample) this.active.track.push(sample);
    }
    this.active.updatedAt = timestamp;
    this.active.stats = calculateStats(this.active);
    this.#upsertIndex(this.active);
    this.#scheduleFlush();

    const landedForMs = this.active.stats.landedAt ? now.getTime() - Date.parse(this.active.stats.landedAt) : 0;
    const parkedAfterFlight = this.active.stats.takeoffAt
      && landedForMs >= 60_000
      && state.aircraft.onGround
      && speed < 1
      && state.aircraft.parkingBrake === true
      && state.aircraft.enginesRunning === false;
    if (parkedAfterFlight) await this.#finalizeInternal('parked-after-landing');
  }

  #createRecord(state, { manual = false } = {}) {
    const now = this.now().toISOString();
    const flight = flightFromState(state);
    const routeLabel = [flight.origin, flight.destination].filter(Boolean).join('-').toLowerCase() || 'flight';
    const id = `${now.replace(/\D/g, '').slice(0, 14)}-${routeLabel}-${randomBytes(3).toString('hex')}`.slice(0, 80);
    const record = {
      schemaVersion: SCHEMA_VERSION,
      id,
      status: 'recording',
      startedAt: now,
      endedAt: null,
      updatedAt: now,
      completionReason: null,
      source: {
        identity: identityFromState(state) || `manual:${state.session?.generation || 1}:${id}`,
        sessionGeneration: Number(state.session?.generation || 1),
        simbriefGeneratedAt: state.integrations?.simbrief?.generatedAt || null,
        manual,
      },
      flight,
      plan: planFromState(state),
      track: [],
      weather: [],
      atc: [],
      automations: [],
      operations: operationsFromState(state),
      stats: calculateStats({ startedAt: now, updatedAt: now, track: [] }),
    };
    this.#upsertIndex(record);
    return record;
  }

  #updateRecordContext(record, state) {
    const nextFlight = flightFromState(state);
    for (const [key, value] of Object.entries(nextFlight)) {
      if (value !== null && value !== undefined && value !== '') record.flight[key] = value;
    }
    const nextPlan = planFromState(state);
    if (nextPlan.route) record.plan.route = nextPlan.route;
    if (nextPlan.waypoints.length) record.plan.waypoints = nextPlan.waypoints;
    if (nextPlan.originPosition) record.plan.originPosition = nextPlan.originPosition;
    if (nextPlan.destinationPosition) record.plan.destinationPosition = nextPlan.destinationPosition;
    for (const key of ['source', 'sid', 'star', 'initialAltitude']) {
      if (nextPlan[key]) record.plan[key] = nextPlan[key];
    }
    record.atc = (state.integrations?.sayIntentions?.comms || []).slice(-80).map((entry) => ({
      id: finite(entry.id),
      station: text(entry.station ?? entry.ident, 100),
      frequency: text(entry.frequency, 20),
      time: entry.time || null,
      pilot: text(entry.pilot, 2_000),
      atc: text(entry.atc, 2_000),
    })).filter((entry) => entry.pilot || entry.atc);
    record.operations = operationsFromState(state);
    const automationLog = state.integrations?.automations?.log || [];
    record.automations = automationLog.slice(0, 100).map((entry) => ({
      time: entry.time || null,
      status: text(entry.status, 20),
      name: text(entry.name, 100),
      ruleId: text(entry.ruleId, 80),
      detail: text(entry.detail, 300),
    })).filter((entry) => entry.time && Date.parse(entry.time) >= Date.parse(record.startedAt)).reverse();

    const siWeather = state.integrations?.sayIntentions?.weather || {};
    const officialWeather = state.integrations?.aviationWeather || {};
    const simbrief = state.integrations?.simbrief?.flight || {};
    const weatherSnapshot = {
      capturedAt: siWeather.updatedAt || this.now().toISOString(),
      airports: (siWeather.airports || []).slice(0, 8).map((entry) => ({
        airport: upper(entry.airport, 4),
        activeRunway: upper(entry.activeRunway, 8),
        metar: text(entry.metar, 800),
        taf: text(entry.taf, 1_600),
        atis: text(entry.atis, 1_600),
        windDirection: finite(entry.windDirection),
        windSpeed: finite(entry.windSpeed),
      })).filter((entry) => entry.airport),
      officialAirports: (officialWeather.airports || []).slice(0, 8).map((entry) => ({
        airport: upper(entry.airport, 4), metar: text(entry.metar, 800), taf: text(entry.taf, 1_600),
        flightCategory: upper(entry.flightCategory, 8), observedAt: entry.observedAt || null,
      })).filter((entry) => entry.airport),
      simbrief: {
        origin: upper(simbrief.origin, 4),
        originMetar: text(simbrief.originMetar, 800),
        destination: upper(simbrief.destination, 4),
        destinationMetar: text(simbrief.destinationMetar, 800),
      },
    };
    const signature = JSON.stringify([weatherSnapshot.airports, weatherSnapshot.officialAirports, weatherSnapshot.simbrief]);
    const priorSignature = record.weather.at(-1)?._signature;
    if (signature !== priorSignature && (weatherSnapshot.airports.length || weatherSnapshot.officialAirports.length || weatherSnapshot.simbrief.originMetar || weatherSnapshot.simbrief.destinationMetar)) {
      weatherSnapshot._signature = signature;
      record.weather.push(weatherSnapshot);
      if (record.weather.length > MAX_WEATHER_SNAPSHOTS) record.weather.splice(1, record.weather.length - MAX_WEATHER_SNAPSHOTS);
    }
  }

  async #finalizeInternal(reason) {
    if (!this.active) return null;
    const now = this.now().toISOString();
    this.active.status = 'completed';
    this.active.endedAt = this.active.track.at(-1)?.time || now;
    this.active.updatedAt = now;
    this.active.completionReason = reason;
    this.active.stats = calculateStats(this.active);
    const saved = summarize(this.active);
    this.#upsertIndex(this.active);
    await this.#writeRecord(this.active);
    await this.#writeIndex();
    this.active = null;
    return saved;
  }

  #upsertIndex(record) {
    const summary = summarize(record);
    const index = this.index.flights.findIndex((entry) => entry.id === record.id);
    if (index >= 0) this.index.flights[index] = summary;
    else this.index.flights.unshift(summary);
    this.index.flights.sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)));
  }

  #scheduleFlush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.#enqueue(() => this.#flush());
    }, this.flushDelayMs);
  }

  async #flush() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.active) await this.#writeRecord(this.active);
    await this.#writeIndex();
  }

  async #writeIndex() {
    await this.#atomicWrite(path.join(this.storageDirectory, 'index.json'), this.index);
  }

  async #writeRecord(record) {
    const serializable = structuredClone(record);
    for (const snapshot of serializable.weather || []) delete snapshot._signature;
    await this.#atomicWrite(this.#recordPath(record.id), serializable);
  }

  async #readRecord(id) {
    const safeId = safeFileId(id);
    if (!safeId) throw new Error('Invalid flight id');
    const parsed = JSON.parse(await fs.readFile(this.#recordPath(safeId), 'utf8'));
    if (!parsed || parsed.id !== safeId || !Array.isArray(parsed.track)) throw new Error('Invalid flight record');
    for (const snapshot of parsed.weather || []) snapshot._signature = JSON.stringify([snapshot.airports || [], snapshot.officialAirports || [], snapshot.simbrief || {}]);
    return parsed;
  }

  #validateImportedRecord(value) {
    const id = safeFileId(value?.id);
    if (!id || !Array.isArray(value?.track) || value.track.length > MAX_TRACK_POINTS) throw new Error('Die Sicherung enthält einen ungültigen Flugdatensatz.');
    const record = structuredClone(value);
    record.id = id;
    record.schemaVersion = SCHEMA_VERSION;
    record.status = ['completed', 'interrupted'].includes(record.status) ? record.status : 'completed';
    record.track = record.track.map(point).filter(Boolean);
    record.weather = Array.isArray(record.weather) ? record.weather.slice(0, MAX_WEATHER_SNAPSHOTS) : [];
    record.atc = Array.isArray(record.atc) ? record.atc.slice(-100) : [];
    record.automations = Array.isArray(record.automations) ? record.automations.slice(-100) : [];
    record.operations = record.operations && typeof record.operations === 'object' ? record.operations : operationsFromState({});
    record.flight = record.flight && typeof record.flight === 'object' ? record.flight : {};
    record.plan = record.plan && typeof record.plan === 'object' ? record.plan : { waypoints: [] };
    record.startedAt = record.startedAt || this.now().toISOString();
    record.updatedAt = record.updatedAt || record.endedAt || record.startedAt;
    record.endedAt = record.endedAt || record.updatedAt;
    record.stats = calculateStats(record);
    return record;
  }

  async #rebuildIndexFromRecords() {
    let entries = [];
    try { entries = await fs.readdir(this.storageDirectory, { withFileTypes: true }); } catch { return; }
    const flights = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === 'index.json') continue;
      const id = safeFileId(entry.name.slice(0, -5));
      if (!id) continue;
      try {
        const record = await this.#readRecord(id);
        flights.push(summarize(record));
      } catch {
        // Leave damaged records untouched for support/recovery; omit them from the live index.
      }
    }
    flights.sort((left, right) => String(right.startedAt).localeCompare(String(left.startedAt)));
    this.index = { schemaVersion: SCHEMA_VERSION, flights };
    if (flights.length) await this.#writeIndex();
  }

  #recordPath(id) {
    return path.join(this.storageDirectory, `${id}.json`);
  }

  async #atomicWrite(destination, value) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value)}\n`, 'utf8');
    try {
      await fs.rename(temporary, destination);
    } catch (error) {
      if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
      await fs.rm(destination, { force: true });
      await fs.rename(temporary, destination);
    }
  }
}

export function flightArchiveSummary(record) {
  return summarize(record);
}
