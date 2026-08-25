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
const TRAFFIC_RADIUS_METERS = 200_000;
const AIRCRAFT_CATEGORIES = new Set(['airplane', 'airship', 'helicopter', 'hotairballoon']);

function clean(value) {
  return String(value || '').replace(/\0/g, '').trim();
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
      this.handle.on('simObjectData', (received) => this.#handleDetail(received));

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
      if (AIRCRAFT_CATEGORIES.has(category)
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
    this.#publishMergedTraffic();
  }

  #normalizeTrafficEntry(entry) {
    const atcId = clean(entry.atcId);
    const title = clean(entry.title);
    const callsign = atcId || title || `AI-${entry.objectId}`;
    const inferredState = entry.onGround
      ? entry.groundSpeed > 3 ? 'taxi' : 'parked'
      : entry.aglFeet < 1_500 && entry.verticalSpeedFpm < -150 ? 'landing' : 'enroute';
    return {
      ...entry,
      title,
      atcId,
      airline: '',
      flightNumber: '',
      callsign,
      state: inferredState,
      currentAirport: '',
      runway: '',
      parking: '',
      origin: '',
      destination: '',
      etdSeconds: null,
      etaSeconds: null,
      source: 'simconnect-all',
    };
  }

  #publishMergedTraffic() {
    const integration = this.engine.publicState().integrations?.simTraffic || {};
    const primary = Array.isArray(integration.aircraft)
      ? integration.aircraft.filter((entry) => entry?.source !== 'simconnect-all')
      : [];
    const primaryIds = new Set(primary.map((entry) => Number(entry.objectId)).filter(Number.isFinite));
    const fallback = this.fallbackAircraft.filter((entry) => !primaryIds.has(Number(entry.objectId)));
    const aircraft = [...primary, ...fallback]
      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
      .slice(0, 300)
      .sort((left, right) => String(left.callsign || '').localeCompare(String(right.callsign || ''), 'en', { numeric: true }));

    this.engine.setIntegration('simTraffic', {
      status: 'ready',
      source: 'SimConnect',
      radiusKm: TRAFFIC_RADIUS_METERS / 1_000,
      updatedAt: new Date().toISOString(),
      detail: fallback.length > 0
        ? `${aircraft.length} Simulator-Flugzeuge im Umkreis · ${fallback.length} über Injector-Fallback`
        : `${aircraft.length} Simulator-Flugzeuge im Umkreis`,
      injectedFallbackCount: fallback.length,
      aircraft,
    });
  }

  #restoreMergedTrafficIfNeeded() {
    if (this.stopped || this.fallbackAircraft.length === 0) return;
    const current = this.engine.publicState().integrations?.simTraffic;
    const currentIds = new Set((Array.isArray(current?.aircraft) ? current.aircraft : [])
      .map((entry) => Number(entry.objectId)).filter(Number.isFinite));
    if (this.fallbackAircraft.some((entry) => !currentIds.has(Number(entry.objectId)))) {
      queueMicrotask(() => {
        if (!this.stopped) this.#publishMergedTraffic();
      });
    }
  }
}
