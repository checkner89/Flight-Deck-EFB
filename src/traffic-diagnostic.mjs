import {
  open,
  Protocol,
  SimConnectConstants,
  SimConnectDataType,
  SimObjectType,
} from 'node-simconnect';

const DIAGNOSTIC_DATA_DEFINITION = 88;
const DIAGNOSTIC_AIRCRAFT_REQUEST = 88;
const DIAGNOSTIC_ALL_REQUEST = 89;
const TRAFFIC_RADIUS_METERS = 200_000;

function protocolLabel(protocol) {
  if (protocol === Protocol.KittyHawk) return 'MSFS 2024';
  if (protocol === Protocol.SunRise) return 'MSFS 2024 (Legacy)';
  return 'Legacy SimConnect';
}

function finishBatch(batch) {
  if (!batch) return null;
  return {
    expected: batch.expected,
    objectIds: [...batch.objectIds].slice(0, 120),
    titles: [...batch.titles].slice(0, 60),
  };
}

export class TrafficDiagnostic {
  constructor(engine, { pollMs = 5_500, retryMs = 5_000 } = {}) {
    this.engine = engine;
    this.pollMs = pollMs;
    this.retryMs = retryMs;
    this.handle = null;
    this.protocol = null;
    this.stopped = true;
    this.pollTimer = null;
    this.retryTimer = null;
    this.aircraftBatch = null;
    this.allBatch = null;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.#connect();
  }

  stop() {
    this.stopped = true;
    clearInterval(this.pollTimer);
    clearTimeout(this.retryTimer);
    this.pollTimer = null;
    this.retryTimer = null;
    try {
      this.handle?.close();
    } catch {
      // Connection may already be closed by MSFS.
    }
    this.handle = null;
    this.protocol = null;
    this.aircraftBatch = null;
    this.allBatch = null;
  }

  async #connect() {
    if (this.stopped) return;
    this.engine.setIntegration('simTrafficDiagnostic', {
      status: 'connecting',
      detail: 'Traffic-Diagnose verbindet sich mit SimConnect',
    });

    try {
      const attempts = [Protocol.KittyHawk, Protocol.SunRise, Protocol.FSX_SP2];
      let opened = null;
      let lastError = null;
      for (const protocol of attempts) {
        try {
          opened = { ...(await open('Flight Deck EFB Traffic Diagnostic', protocol)), protocol };
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!opened) throw lastError || new Error('SimConnect ist nicht erreichbar.');

      const { handle, protocol } = opened;
      this.handle = handle;
      this.protocol = protocol;
      handle.addToDataDefinition(
        DIAGNOSTIC_DATA_DEFINITION,
        'TITLE',
        null,
        SimConnectDataType.STRING128,
        0,
        SimConnectConstants.UNUSED,
      );

      handle.on('simObjectDataByType', (received) => this.#handleObject(received));
      let reconnectScheduled = false;
      const reconnect = () => {
        if (reconnectScheduled || this.stopped) return;
        reconnectScheduled = true;
        clearInterval(this.pollTimer);
        this.pollTimer = null;
        this.handle = null;
        this.protocol = null;
        this.engine.setIntegration('simTrafficDiagnostic', {
          status: 'disconnected',
          detail: 'Traffic-Diagnose: SimConnect-Verbindung getrennt',
          updatedAt: new Date().toISOString(),
        });
        this.retryTimer = setTimeout(() => this.#connect(), this.retryMs);
      };
      handle.on('quit', reconnect);
      handle.on('close', reconnect);
      handle.on('exception', (received) => {
        this.engine.setIntegration('simTrafficDiagnostic', {
          status: 'limited',
          detail: `Traffic-Diagnose SimConnect-Fehler ${received?.exceptionName || received?.exception || '?'}`,
          updatedAt: new Date().toISOString(),
        });
      });

      this.engine.setIntegration('simTrafficDiagnostic', {
        status: 'ready',
        source: 'Independent SimConnect discovery',
        protocol: protocolLabel(protocol),
        radiusKm: TRAFFIC_RADIUS_METERS / 1_000,
        detail: 'Traffic-Diagnose ist bereit',
        updatedAt: new Date().toISOString(),
      });
      this.#poll();
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.#poll(), this.pollMs);
    } catch (error) {
      this.handle = null;
      this.protocol = null;
      this.engine.setIntegration('simTrafficDiagnostic', {
        status: 'disconnected',
        detail: `Traffic-Diagnose nicht verbunden: ${error.message}`,
        updatedAt: new Date().toISOString(),
      });
      if (!this.stopped) this.retryTimer = setTimeout(() => this.#connect(), this.retryMs);
    }
  }

  #newBatch() {
    return {
      startedAt: Date.now(),
      expected: 0,
      objectIds: new Set(),
      titles: new Set(),
      complete: false,
    };
  }

  #poll() {
    if (!this.handle || this.aircraftBatch || this.allBatch) return;
    this.aircraftBatch = this.#newBatch();
    this.allBatch = this.#newBatch();
    try {
      this.handle.requestDataOnSimObjectType(
        DIAGNOSTIC_AIRCRAFT_REQUEST,
        DIAGNOSTIC_DATA_DEFINITION,
        TRAFFIC_RADIUS_METERS,
        SimObjectType.AIRCRAFT,
      );
      this.handle.requestDataOnSimObjectType(
        DIAGNOSTIC_ALL_REQUEST,
        DIAGNOSTIC_DATA_DEFINITION,
        TRAFFIC_RADIUS_METERS,
        SimObjectType.ALL ?? SimObjectType.AIRCRAFT,
      );
      setTimeout(() => {
        if (this.aircraftBatch || this.allBatch) this.#publish();
      }, 2_800);
    } catch (error) {
      this.aircraftBatch = null;
      this.allBatch = null;
      this.engine.setIntegration('simTrafficDiagnostic', {
        status: 'error',
        detail: `Traffic-Diagnose konnte Objekte nicht anfordern: ${error.message}`,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  #handleObject(received) {
    const batch = received.requestID === DIAGNOSTIC_AIRCRAFT_REQUEST
      ? this.aircraftBatch
      : received.requestID === DIAGNOSTIC_ALL_REQUEST
        ? this.allBatch
        : null;
    if (!batch) return;

    const objectId = Number(received.objectID);
    const expected = Number(received.outOf ?? 0);
    batch.expected = Math.max(batch.expected, Number.isFinite(expected) ? expected : 0);
    if (Number.isInteger(objectId) && objectId !== SimConnectConstants.OBJECT_ID_USER) {
      batch.objectIds.add(objectId);
    }
    try {
      const title = String(received.data.readString128() || '').replace(/\0/g, '').trim();
      if (title) batch.titles.add(title);
    } catch {
      // Object metadata itself is enough for the diagnostic; TITLE is only a convenience.
    }

    const receivedCount = Number(received.entryNumber ?? 0) + 1;
    if (expected === 0 || receivedCount >= expected) batch.complete = true;
    if (this.aircraftBatch?.complete && this.allBatch?.complete) this.#publish();
  }

  #publish() {
    if (!this.aircraftBatch && !this.allBatch) return;
    const aircraft = finishBatch(this.aircraftBatch) || { expected: 0, objectIds: [], titles: [] };
    const all = finishBatch(this.allBatch) || { expected: 0, objectIds: [], titles: [] };
    this.aircraftBatch = null;
    this.allBatch = null;

    const rawAircraftCount = aircraft.objectIds.length;
    const rawAllCount = all.objectIds.length;
    const normalTraffic = this.engine.publicState().integrations?.simTraffic;
    const parsedCount = Array.isArray(normalTraffic?.aircraft) ? normalTraffic.aircraft.length : 0;
    const diagnosis = rawAircraftCount > 0
      ? `${rawAircraftCount} rohe AIRCRAFT-Objekte von SimConnect erkannt`
      : rawAllCount > 0
        ? `0 AIRCRAFT, aber ${rawAllCount} sonstige SimObjects erkannt`
        : 'Keine fremden SimObjects im Diagnose-Radius erkannt';
    const updatedAt = new Date().toISOString();

    const diagnostic = {
      status: 'ready',
      source: 'Independent SimConnect discovery',
      protocol: protocolLabel(this.protocol),
      radiusKm: TRAFFIC_RADIUS_METERS / 1_000,
      rawAircraftCount,
      rawAllCount,
      parsedTrafficCount: parsedCount,
      aircraftExpected: aircraft.expected,
      allExpected: all.expected,
      aircraftObjectIds: aircraft.objectIds,
      allObjectIds: all.objectIds,
      aircraftTitles: aircraft.titles,
      allTitles: all.titles,
      detail: diagnosis,
      updatedAt,
    };

    this.engine.setIntegration('simTrafficDiagnostic', diagnostic);
    this.engine.setIntegration('simTraffic', {
      diagnostic: {
        rawAircraftCount,
        rawAllCount,
        aircraftExpected: aircraft.expected,
        allExpected: all.expected,
        aircraftObjectIds: aircraft.objectIds,
        allObjectIds: all.objectIds,
        detail: diagnosis,
        updatedAt,
      },
      diagnosticDetail: diagnosis,
      diagnosticUpdatedAt: updatedAt,
    });
  }
}
