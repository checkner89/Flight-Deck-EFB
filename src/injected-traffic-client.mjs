import {
  open,
  Protocol,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectPeriod,
  SimObjectType,
} from 'node-simconnect';

const DISCOVERY_DEFINITION = 90;
const DISCOVERY_REQUEST = 90;
const TRAFFIC_DEFINITION = 91;
const TRAFFIC_PLAN_DEFINITION = 92;
const TRAFFIC_RADIUS_METERS = 200_000;
const AIRCRAFT_CATEGORIES = new Set([
  'airplane', 'airship', 'helicopter', 'hotairballoon',
  'aircraft', 'passiveaircraft', 'passive aircraft',
]);

function clean(value) {
  return String(value || '').replace(/\0/g, '').trim();
}


const TRAFFIC_TEXT_FIELDS = ['airline', 'flightNumber', 'currentAirport', 'runway', 'parking', 'origin', 'destination'];

function trafficNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeInjectedTrafficEntry(entry = {}) {
  const atcId = clean(entry.atcId);
  const title = clean(entry.title);
  const airline = clean(entry.airline);
  const flightNumber = clean(entry.flightNumber);
  const suppliedState = clean(entry.state).toLowerCase();
  const inferredState = suppliedState || (entry.onGround
    ? Number(entry.groundSpeed) > 3 ? 'taxi' : 'parked'
    : Number(entry.aglFeet) < 1_500 && Number(entry.verticalSpeedFpm) < -150 ? 'landing' : 'enroute');
  const callsign = atcId || [airline, flightNumber].filter(Boolean).join(' ') || title || `AI-${entry.objectId}`;
  return {
    ...entry,
    title,
    atcId,
    airline,
    flightNumber,
    callsign,
    state: inferredState,
    currentAirport: clean(entry.currentAirport).toUpperCase(),
    runway: clean(entry.runway).toUpperCase(),
    parking: clean(entry.parking),
    origin: clean(entry.origin).toUpperCase(),
    destination: clean(entry.destination).toUpperCase(),
    etdSeconds: trafficNumber(entry.etdSeconds),
    etaSeconds: trafficNumber(entry.etaSeconds),
    scheduleEnriched: Boolean(entry.scheduleEnriched),
    source: entry.source || 'simconnect-all',
  };
}

export function mergeTrafficSources(primary = [], fallback = []) {
  const supplementalById = new Map((Array.isArray(fallback) ? fallback : [])
    .map((entry) => [Number(entry?.objectId), entry])
    .filter(([id]) => Number.isFinite(id)));
  const used = new Set();
  const merged = (Array.isArray(primary) ? primary : []).map((entry) => {
    const id = Number(entry?.objectId);
    const supplemental = supplementalById.get(id);
    if (!supplemental) return entry;
    used.add(id);
    const combined = { ...supplemental, ...entry };
    for (const field of TRAFFIC_TEXT_FIELDS) {
      const primaryValue = clean(entry?.[field]);
      const supplementalValue = clean(supplemental?.[field]);
      combined[field] = primaryValue || supplementalValue;
      if (['currentAirport', 'runway', 'origin', 'destination'].includes(field)) combined[field] = combined[field].toUpperCase();
    }
    for (const field of ['etdSeconds', 'etaSeconds']) {
      combined[field] = trafficNumber(entry?.[field]) ?? trafficNumber(supplemental?.[field]);
    }
    if (supplemental.scheduleEnriched && clean(supplemental.state)) combined.state = clean(supplemental.state).toLowerCase();
    combined.scheduleEnriched = Boolean(entry?.scheduleEnriched || supplemental.scheduleEnriched);
    combined.source = entry?.source || 'simconnect-primary';
    return combined;
  });
  for (const entry of Array.isArray(fallback) ? fallback : []) {
    const id = Number(entry?.objectId);
    if (!Number.isFinite(id) || used.has(id)) continue;
    merged.push(entry);
  }
  return merged;
}

export class InjectedTrafficClient {
  constructor(engine, { pollMs = 3_000, retryMs = 5_000 } = {}) {
    this.engine = engine;
    this.pollMs = pollMs;
    this.retryMs = retryMs;
    this.stopped = true;
    this.handle = null;
    this.protocol = null;
    this.pollTimer = null;
    this.retryTimer = null;
    this.discoveryBatch = null;
    this.detailBatch = null;
    this.pendingRequests = new Map();
    this.pendingPlanRequests = new Map();
    this.trafficPlanByObjectId = new Map();
    this.nextRequestId = 10_000;
    this.fallbackAircraft = [];
    this.onEngineChange = () => this.#restoreMergedTrafficIfNeeded();
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.engine.on('change', this.onEngineChange);
    this.#connect();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.pollTimer);
    clearTimeout(this.retryTimer);
    this.pollTimer = null;
    this.retryTimer = null;
    this.discoveryBatch = null;
    this.detailBatch = null;
    this.pendingRequests.clear();
    this.pendingPlanRequests.clear();
    this.trafficPlanByObjectId.clear();
    this.fallbackAircraft = [];
    this.engine.off('change', this.onEngineChange);
    try {
      this.handle?.close();
    } catch {
      // SimConnect may already be closed.
    }
    this.handle = null;
    this.protocol = null;
  }

  async #connect() {
    if (this.stopped) return;
    try {
      const attempts = [Protocol.KittyHawk, Protocol.SunRise, Protocol.FSX_SP2];
      let opened = null;
      let lastError = null;
      for (const protocol of attempts) {
        try {
          opened = { ...(await open('Flight Deck EFB Injected Traffic', protocol)), protocol };
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!opened) throw lastError || new Error('SimConnect ist nicht erreichbar.');

      this.handle = opened.handle;
      this.protocol = opened.protocol;
      this.#registerDefinitions(this.handle);
      this.handle.on('simObjectDataByType', (received) => this.#handleDiscovery(received));
      this.handle.on('simObjectData', (received) => { this.#handleDetail(received); this.#handlePlanDetail(received); });

      let reconnectScheduled = false;
      const reconnect = () => {
        if (reconnectScheduled || this.stopped) return;
        reconnectScheduled = true;
        clearInterval(this.pollTimer);
        this.pollTimer = null;
        this.handle = null;
        this.protocol = null;
        this.discoveryBatch = null;
        this.detailBatch = null;
        this.pendingRequests.clear();
        this.pendingPlanRequests.clear();
        this.trafficPlanByObjectId.clear();
        this.retryTimer = setTimeout(() => this.#connect(), this.retryMs);
      };
      this.handle.on('quit', reconnect);
      this.handle.on('close', reconnect);
      this.handle.on('exception', () => {
        // The normal SimConnect traffic reader remains active. A failed fallback request is retried
        // on the next cycle and must never degrade the primary simulator connection.
      });

      this.#poll();
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.#poll(), this.pollMs);
    } catch {
      this.handle = null;
      this.protocol = null;
      if (!this.stopped) this.retryTimer = setTimeout(() => this.#connect(), this.retryMs);
    }
  }

  refresh() {
    if (!this.handle) return { requested: false, reason: 'not-connected' };
    if (this.discoveryBatch || this.detailBatch) return { requested: true, pending: true };
    this.#poll();
    return { requested: true };
  }

  #registerDefinitions(handle) {
    handle.addToDataDefinition(
      DISCOVERY_DEFINITION,
      'CATEGORY',
      null,
      SimConnectDataType.STRING32,
      0,
      SimConnectConstants.UNUSED,
    );

    const addFloat = (name, unit) => handle.addToDataDefinition(
      TRAFFIC_DEFINITION, name, unit, SimConnectDataType.FLOAT64, 0, SimConnectConstants.UNUSED,
    );
    const addInt = (name, unit = 'number') => handle.addToDataDefinition(
      TRAFFIC_DEFINITION, name, unit, SimConnectDataType.INT32, 0, SimConnectConstants.UNUSED,
    );
    const addString = (name, type) => handle.addToDataDefinition(
      TRAFFIC_DEFINITION, name, null, type, 0, SimConnectConstants.UNUSED,
    );

    addFloat('PLANE LATITUDE', 'degrees');
    addFloat('PLANE LONGITUDE', 'degrees');
    addFloat('PLANE ALTITUDE', 'feet');
    addFloat('PLANE ALT ABOVE GROUND', 'feet');
    addFloat('GROUND VELOCITY', 'knots');
    addFloat('PLANE HEADING DEGREES TRUE', 'degrees');
    addInt('SIM ON GROUND', 'bool');
    addFloat('VERTICAL SPEED', 'feet per minute');
    addString('TITLE', SimConnectDataType.STRING128);
    addString('ATC ID', SimConnectDataType.STRING32);

    const addPlanString = (name, type = SimConnectDataType.STRING32) => handle.addToDataDefinition(
      TRAFFIC_PLAN_DEFINITION, name, null, type, 0, SimConnectConstants.UNUSED,
    );
    const addPlanFloat = (name, unit) => handle.addToDataDefinition(
      TRAFFIC_PLAN_DEFINITION, name, unit, SimConnectDataType.FLOAT64, 0, SimConnectConstants.UNUSED,
    );
    addPlanString('ATC AIRLINE', SimConnectDataType.STRING64);
    addPlanString('ATC FLIGHT NUMBER', SimConnectDataType.STRING32);
    addPlanString('AI TRAFFIC STATE', SimConnectDataType.STRING64);
    addPlanString('AI TRAFFIC CURRENT AIRPORT', SimConnectDataType.STRING32);
    addPlanString('AI TRAFFIC ASSIGNED RUNWAY', SimConnectDataType.STRING32);
    addPlanString('AI TRAFFIC ASSIGNED PARKING', SimConnectDataType.STRING64);
    addPlanString('AI TRAFFIC FROMAIRPORT', SimConnectDataType.STRING32);
    addPlanString('AI TRAFFIC TOAIRPORT', SimConnectDataType.STRING32);
    addPlanFloat('AI TRAFFIC ETD', 'seconds');
    addPlanFloat('AI TRAFFIC ETA', 'seconds');
  }

  #poll() {
    if (!this.handle || this.discoveryBatch || this.detailBatch) return;
    this.discoveryBatch = {
      startedAt: Date.now(),
      objectIds: new Set(),
    };
    try {
      this.handle.requestDataOnSimObjectType(
        DISCOVERY_REQUEST,
        DISCOVERY_DEFINITION,
        TRAFFIC_RADIUS_METERS,
        SimObjectType.ALL,
      );
      setTimeout(() => {
        if (this.discoveryBatch && Date.now() - this.discoveryBatch.startedAt >= 1_700) {
          this.#finishDiscovery();
        }
      }, 1_800);
    } catch {
      this.discoveryBatch = null;
    }
  }

  #handleDiscovery(received) {
    if (received.requestID !== DISCOVERY_REQUEST || !this.discoveryBatch) return;
    const expected = Number(received.outOf ?? 0);
    if (expected === 0) {
      this.#finishDiscovery();
      return;
    }

    try {
      const category = clean(received.data.readString32()).toLowerCase();
      const objectId = Number(received.objectID);
      const aircraftCategory = AIRCRAFT_CATEGORIES.has(category)
        || category.includes('aircraft')
        || category.includes('airplane')
        || category.includes('helicopter');
      if (aircraftCategory
        && Number.isInteger(objectId)
        && objectId !== SimConnectConstants.OBJECT_ID_USER) {
        this.discoveryBatch.objectIds.add(objectId);
      }
    } catch {
      // One malformed object does not invalidate the rest of the discovery batch.
    }

    const receivedCount = Number(received.entryNumber ?? 0) + 1;
    if (receivedCount >= expected) this.#finishDiscovery();
  }

  #finishDiscovery() {
    const batch = this.discoveryBatch;
    this.discoveryBatch = null;
    if (!batch || !this.handle) return;

    const objectIds = [...batch.objectIds].slice(0, 300);
    if (objectIds.length === 0) {
      this.fallbackAircraft = [];
      this.#publishMergedTraffic();
      return;
    }

    const cycle = Symbol('traffic-cycle');
    this.detailBatch = {
      cycle,
      startedAt: Date.now(),
      expected: objectIds.length,
      aircraft: [],
    };

    for (const objectId of objectIds) {
      const requestId = this.#nextDetailRequestId();
      this.pendingRequests.set(requestId, { objectId, cycle });
      try {
        this.handle.requestDataOnSimObject(
          requestId,
          TRAFFIC_DEFINITION,
          objectId,
          SimConnectPeriod.ONCE,
          0,
          0,
          0,
          0,
        );
      } catch {
        this.pendingRequests.delete(requestId);
      }
    }

    if (this.pendingRequests.size === 0) {
      this.#finishDetails(cycle);
      return;
    }

    setTimeout(() => {
      if (this.detailBatch?.cycle === cycle) this.#finishDetails(cycle);
    }, 1_900);
  }

  #nextDetailRequestId() {
    const value = this.nextRequestId;
    this.nextRequestId += 1;
    if (this.nextRequestId > 2_000_000_000) this.nextRequestId = 10_000;
    return value;
  }

  #handleDetail(received) {
    const pending = this.pendingRequests.get(received.requestID);
    if (!pending || !this.detailBatch || pending.cycle !== this.detailBatch.cycle) return;
    this.pendingRequests.delete(received.requestID);

    try {
      const data = received.data;
      const entry = this.#normalizeTrafficEntry({
        objectId: Number(received.objectID ?? pending.objectId),
        lat: data.readFloat64(),
        lon: data.readFloat64(),
        altitudeFeet: data.readFloat64(),
        aglFeet: data.readFloat64(),
        groundSpeed: data.readFloat64(),
        heading: data.readFloat64(),
        onGround: data.readInt32() !== 0,
        verticalSpeedFpm: data.readFloat64(),
        title: data.readString128(),
        atcId: data.readString32(),
      });
      if (Number.isFinite(entry.lat) && Number.isFinite(entry.lon)) this.detailBatch.aircraft.push(entry);
    } catch {
      // Keep the remaining injected aircraft even if this object disappeared between requests.
    }

    const cyclePending = [...this.pendingRequests.values()].some((entry) => entry.cycle === this.detailBatch?.cycle);
    if (!cyclePending) this.#finishDetails(pending.cycle);
  }

  #finishDetails(cycle) {
    if (!this.detailBatch || this.detailBatch.cycle !== cycle) return;
    const batch = this.detailBatch;
    this.detailBatch = null;
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.cycle === cycle) this.pendingRequests.delete(requestId);
    }

    this.fallbackAircraft = batch.aircraft
      .sort((left, right) => left.callsign.localeCompare(right.callsign, 'en', { numeric: true }))
      .slice(0, 300);
    this.#requestPlanEnrichment(this.fallbackAircraft);
    this.#publishMergedTraffic();
  }

  #requestPlanEnrichment(aircraft = []) {
    if (!this.handle) return;
    for (const entry of aircraft.slice(0, 120)) {
      const objectId = Number(entry.objectId);
      if (!Number.isInteger(objectId) || [...this.pendingPlanRequests.values()].includes(objectId)) continue;
      const requestId = this.#nextDetailRequestId();
      this.pendingPlanRequests.set(requestId, objectId);
      try {
        this.handle.requestDataOnSimObject(requestId, TRAFFIC_PLAN_DEFINITION, objectId, SimConnectPeriod.ONCE, 0, 0, 0, 0);
      } catch {
        this.pendingPlanRequests.delete(requestId);
      }
    }
  }

  #handlePlanDetail(received) {
    const objectId = this.pendingPlanRequests.get(received.requestID);
    if (!objectId) return;
    this.pendingPlanRequests.delete(received.requestID);
    try {
      const data = received.data;
      const plan = {
        airline: clean(data.readString64()),
        flightNumber: clean(data.readString32()),
        state: clean(data.readString64()),
        currentAirport: clean(data.readString32()).toUpperCase(),
        runway: clean(data.readString32()).toUpperCase(),
        parking: clean(data.readString64()),
        origin: clean(data.readString32()).toUpperCase(),
        destination: clean(data.readString32()).toUpperCase(),
        etdSeconds: data.readFloat64(),
        etaSeconds: data.readFloat64(),
        scheduleEnriched: true,
      };
      this.trafficPlanByObjectId.set(Number(objectId), plan);
      this.fallbackAircraft = this.fallbackAircraft.map((entry) => Number(entry.objectId) === Number(objectId)
        ? this.#normalizeTrafficEntry({ ...entry, ...plan }) : entry);
      this.#publishMergedTraffic();
    } catch {
      // Optional AI schedule fields are not available for every PassiveAircraft/injector object.
    }
  }

  #normalizeTrafficEntry(entry) {
    return normalizeInjectedTrafficEntry(entry);
  }

  #publishMergedTraffic() {
    const integration = this.engine.publicState().integrations?.simTraffic || {};
    const currentAircraft = Array.isArray(integration.aircraft) ? integration.aircraft : [];
    const primary = currentAircraft.filter((entry) => entry?.source !== 'simconnect-all');
    const primaryIds = new Set(primary.map((entry) => Number(entry.objectId)).filter(Number.isFinite));
    const fallbackOnlyCount = this.fallbackAircraft.filter((entry) => !primaryIds.has(Number(entry.objectId))).length;
    const aircraft = mergeTrafficSources(primary, this.fallbackAircraft)
      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
      .slice(0, 300)
      .sort((left, right) => String(left.callsign || '').localeCompare(String(right.callsign || ''), 'en', { numeric: true }));

    this.engine.setIntegration('simTraffic', {
      status: 'ready',
      source: 'SimConnect',
      radiusKm: TRAFFIC_RADIUS_METERS / 1_000,
      updatedAt: new Date().toISOString(),
      detail: fallbackOnlyCount > 0
        ? `${aircraft.length} Simulator-Flugzeuge im Umkreis · ${fallbackOnlyCount} über Injector-Fallback`
        : `${aircraft.length} Simulator-Flugzeuge im Umkreis`,
      injectedFallbackCount: fallbackOnlyCount,
      aircraft,
    });
  }

  #restoreMergedTrafficIfNeeded() {
    if (this.stopped || this.fallbackAircraft.length === 0) return;
    const current = this.engine.publicState().integrations?.simTraffic;
    const currentById = new Map((Array.isArray(current?.aircraft) ? current.aircraft : [])
      .map((entry) => [Number(entry?.objectId), entry])
      .filter(([id]) => Number.isFinite(id)));
    const needsRestore = this.fallbackAircraft.some((fallback) => {
      const existing = currentById.get(Number(fallback.objectId));
      if (!existing) return true;
      if (fallback.scheduleEnriched && clean(fallback.state) && clean(existing.state).toLowerCase() !== clean(fallback.state).toLowerCase()) return true;
      return TRAFFIC_TEXT_FIELDS.some((field) => clean(fallback[field]) && !clean(existing[field]))
        || (trafficNumber(fallback.etdSeconds) !== null && trafficNumber(existing.etdSeconds) === null)
        || (trafficNumber(fallback.etaSeconds) !== null && trafficNumber(existing.etaSeconds) === null);
    });
    if (needsRestore) {
      queueMicrotask(() => {
        if (!this.stopped) this.#publishMergedTraffic();
      });
    }
  }
}
