import {
  EventFlag,
  FacilityDataType,
  open,
  Protocol,
  RawBuffer,
  SimConnectConstants,
  SimConnectDataType,
  SimConnectException,
  SimConnectPeriod,
  SimObjectType,
} from 'node-simconnect';

const AIRCRAFT_DATA_DEFINITION = 41;
const AIRCRAFT_DATA_REQUEST = 41;
const CUSTOM_DATA_DEFINITION = 42;
const CUSTOM_DATA_REQUEST = 42;
const CUSTOM_WRITE_DEFINITION = 43;
const SAYINTENTIONS_DATA_DEFINITION = 44;
const SAYINTENTIONS_DATA_REQUEST = 44;
const COM1_DATA_DEFINITION = 45;
const COM1_DATA_REQUEST = 45;
const COM2_DATA_DEFINITION = 46;
const COM2_DATA_REQUEST = 46;
const TRANSPONDER_DATA_DEFINITION = 47;
const TRANSPONDER_DATA_REQUEST = 47;
const TRAFFIC_DATA_DEFINITION = 48;
const TRAFFIC_DATA_REQUEST = 48;
const TRUSTED_WRITE_DEFINITION = 49;
const AIRPORT_FACILITY_DEFINITION = 3_100;
const INPUT_EVENTS_REQUEST = 3_200;
const TRAFFIC_RADIUS_METERS = 200_000;

function decodeBco16(value) {
  const encoded = Math.max(0, Math.round(Number(value) || 0));
  const digits = [12, 8, 4, 0].map((shift) => (encoded >> shift) & 0xF);
  return digits.every((digit) => digit <= 7) ? Number(digits.join('')) : encoded;
}

const SI_LVARS = [
  'L:SIAI_FLIGHT_PHASE',
  'L:SIAI_CLEARED_FOR_TAKEOFF',
  'L:SIAI_CLEARED_FOR_LANDING',
  'L:SIAI_TAXIPATH',
  'L:SIAI_COM1_POSITION',
  'L:SIAI_COM2_POSITION',
  'L:SIAI_INTERCOM1_POSITION',
  'L:SIAI_INTERCOM2_POSITION',
  'L:SIAI_INTERCOM3_POSITION',
  'L:SIAI_RADIO_PTT',
  'L:SIAI_INTERCOM_PTT',
  'L:SIAI_COM1_RECEIVING',
  'L:SIAI_COM2_RECEIVING',
];

export class SimConnectClient {
  constructor(engine, { retryMs = 5_000 } = {}) {
    this.engine = engine;
    this.retryMs = retryMs;
    this.stopped = true;
    this.handle = null;
    this.retryTimer = null;
    this.lastEmitAt = 0;
    this.customVariables = [];
    this.variableGroups = new Map();
    this.nextVariableGroupDefinition = 5_000;
    this.eventIds = new Map();
    this.nextEventId = 1_000;
    this.protocol = null;
    this.facilityRequestId = 3_300;
    this.facilityRequests = new Map();
    this.inputEvents = new Map();
    this.inputEventEnumeration = null;
    this.lastAircraftTitle = null;
    this.aircraftSnapshot = null;
    this.radioSnapshot = {};
    this.trafficPollTimer = null;
    this.trafficPoll = null;
    this.trafficBatch = null;
    this.sentOperations = new Map();
    this.lastCoreDataAt = 0;
    this.watchdogTimer = null;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    clearInterval(this.watchdogTimer);
    this.watchdogTimer = setInterval(() => this.#watchConnection(), 5_000);
    this.#connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    clearInterval(this.trafficPollTimer);
    this.trafficPollTimer = null;
    this.trafficPoll = null;
    try {
      this.handle?.close();
    } catch {
      // Already closed.
    }
    this.handle = null;
    this.#rejectFacilityRequests(new Error('SimConnect-Verbindung wurde beendet.'));
  }

  async #connect() {
    if (this.stopped) return;
    this.engine.setConnection('simConnect', 'connecting', 'Verbinde mit MSFS');
    try {
      const { recvOpen, handle, protocol } = await this.#openCompatibleProtocol();
      this.handle = handle;
      this.protocol = protocol;
      this.lastCoreDataAt = 0;
      this.engine.setIntegration('simConnectHealth', { status: 'waiting', detail: `Transport verbunden · ${this.#protocolLabel(protocol)} · warte auf Telemetrie`, protocol: this.#protocolLabel(protocol), updatedAt: new Date().toISOString() });
      this.eventIds.clear();
      this.nextEventId = 1_000;
      this.engine.setConnection('simConnect', 'connected', `${recvOpen.applicationName || 'MSFS verbunden'} · ${this.#protocolLabel(protocol)}`);
      this.#registerAircraftData(handle);
      this.#registerRadioData(handle);
      this.#registerTrafficData(handle);
      this.#registerSayIntentionsData(handle);
      this.#registerCustomVariableHandler(handle);
      this.#registerVariableGroupHandler(handle);
      this.#registerCustomVariables(handle);
      for (const group of this.variableGroups.values()) this.#registerVariableGroup(handle, group);
      this.#registerFacilityHandler(handle);
      this.#registerInputEventHandler(handle);
      this.#enumerateInputEvents();

      let reconnectScheduled = false;
      const reconnect = () => {
        if (reconnectScheduled || this.stopped) return;
        reconnectScheduled = true;
        clearInterval(this.trafficPollTimer);
        this.trafficPollTimer = null;
        this.trafficPoll = null;
        this.handle = null;
        this.protocol = null;
        this.#rejectFacilityRequests(new Error('MSFS-Verbindung wurde getrennt.'));
        this.engine.setConnection('simConnect', 'disconnected', 'MSFS-Verbindung getrennt');
        this.retryTimer = setTimeout(() => this.#connect(), this.retryMs);
      };
      handle.on('quit', reconnect);
      handle.on('close', reconnect);
      handle.on('exception', (received) => {
        this.#handleException(received);
      });
    } catch {
      this.engine.setConnection('simConnect', 'disconnected', 'MSFS nicht erreichbar – neuer Versuch folgt');
      if (!this.stopped) this.retryTimer = setTimeout(() => this.#connect(), this.retryMs);
    }
  }

  async #openCompatibleProtocol() {
    const attempts = [Protocol.KittyHawk, Protocol.SunRise, Protocol.FSX_SP2];
    let lastError;
    for (const protocol of attempts) {
      try {
        return { ...(await open('Flight Deck EFB', protocol)), protocol };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('MSFS ist nicht erreichbar.');
  }

  #protocolLabel(protocol) {
    if (protocol === Protocol.KittyHawk) return 'MSFS 2024';
    if (protocol === Protocol.SunRise) return 'MSFS 2024 (Legacy)';
    return 'Legacy SimConnect';
  }

  #watchConnection() {
    if (!this.handle) return;
    const ageMs = this.lastCoreDataAt ? Date.now() - this.lastCoreDataAt : null;
    if (ageMs === null) {
      this.engine.setIntegration('simConnectHealth', {
        status: 'waiting',
        detail: `Transport verbunden · ${this.#protocolLabel(this.protocol)} · warte auf Telemetrie`,
        protocol: this.#protocolLabel(this.protocol),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (ageMs > 15_000) {
      this.engine.setIntegration('simConnectHealth', {
        status: 'limited',
        detail: `SimConnect verbunden · Telemetrie seit ${Math.round(ageMs / 1_000)} s unverändert`,
        protocol: this.#protocolLabel(this.protocol),
        lastCoreDataAt: new Date(this.lastCoreDataAt).toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    this.engine.setIntegration('simConnectHealth', {
      status: 'ready',
      detail: `SimConnect Telemetrie aktiv · ${this.#protocolLabel(this.protocol)}`,
      protocol: this.#protocolLabel(this.protocol),
      lastCoreDataAt: new Date(this.lastCoreDataAt).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  #rememberOperation(sendId, label, { optional = false } = {}) {
    if (!Number.isInteger(sendId)) return sendId;
    this.sentOperations.set(sendId, { label, optional, createdAt: Date.now() });
    if (this.sentOperations.size > 600) {
      const cutoff = Date.now() - 5 * 60_000;
      for (const [id, operation] of this.sentOperations) {
        if (operation.createdAt < cutoff) this.sentOperations.delete(id);
      }
    }
    return sendId;
  }

  #handleException(received = {}) {
    const operation = this.sentOperations.get(received.sendId);
    const name = received.exceptionName || `Fehler ${received.exception ?? '?'}`;
    const detail = operation?.label ? `${name} · ${operation.label}` : name;
    this.engine.setIntegration('simConnectHealth', {
      status: operation?.optional ? 'limited' : 'attention',
      detail,
      exception: received.exception ?? null,
      sendId: received.sendId ?? null,
      index: received.index ?? null,
      updatedAt: new Date().toISOString(),
    });

    const recoverable = operation?.optional
      || [SimConnectException.NAME_UNRECOGNIZED, SimConnectException.DATA_ERROR,
        SimConnectException.DEFINITION_ERROR, SimConnectException.OPERATION_INVALID_FOR_OBJECT_TYPE]
        .includes(received.exception);
    // A SimConnect exception is a data-operation error, not a transport disconnect.
    // Keep the transport usable until a real close/quit event occurs.
    if (this.handle) {
      const suffix = recoverable ? 'optionale Daten eingeschränkt' : `Datenhinweis: ${detail}`;
      this.engine.setConnection('simConnect', 'connected', `MSFS verbunden · ${this.#protocolLabel(this.protocol)} · ${suffix}`);
      return;
    }
    this.engine.setConnection('simConnect', 'disconnected', 'MSFS-Verbindung getrennt');
  }

  configureVariables(variables = []) {
    this.customVariables = (Array.isArray(variables) ? variables : []).slice(0, 60).map((entry) => ({
      name: String(entry?.name || '').trim().slice(0, 120),
      unit: String(entry?.unit || 'number').trim().slice(0, 32),
    })).filter((entry) => /^(?:L:|Z:|[A-Z])[A-Z0-9_ .:@/-]{1,119}$/i.test(entry.name));
    if (this.handle) this.#registerCustomVariables(this.handle);
  }

  configureVariableGroup(name, variables = []) {
    const groupName = String(name || '').trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(groupName)) throw new Error('Variable group name is invalid.');
    const normalized = (Array.isArray(variables) ? variables : []).slice(0, 80).map((entry) => ({
      name: String(entry?.name || '').trim().slice(0, 120),
      unit: String(entry?.unit || 'number').trim().slice(0, 32),
    })).filter((entry) => /^(?:L:|Z:|[A-Z])[A-Z0-9_ .:@/-]{1,119}$/i.test(entry.name));
    let group = this.variableGroups.get(groupName);
    if (!group) {
      group = {
        name: groupName,
        definitionId: this.nextVariableGroupDefinition++,
        requestId: this.nextVariableGroupDefinition++,
        variables: [],
      };
    }
    group.variables = normalized;
    this.variableGroups.set(groupName, group);
    if (this.handle) this.#registerVariableGroup(this.handle, group);
    return { name: groupName, count: normalized.length };
  }

  async setTrustedVariable(name, value, unit = 'number') {
    if (!this.handle) throw new Error('SimConnect ist nicht verbunden.');
    const target = String(name || '').trim();
    const numeric = Number(value);
    if (!/^(?:L:|Z:)[A-Z0-9_ .:@/-]{1,119}$/i.test(target)) throw new Error('Interne Variable ist nicht freigegeben.');
    if (!Number.isFinite(numeric)) throw new Error('Variablenwert ist ungültig.');
    try { this.handle.clearDataDefinition(TRUSTED_WRITE_DEFINITION); } catch { /* Definition may not exist yet. */ }
    this.handle.addToDataDefinition(
      TRUSTED_WRITE_DEFINITION,
      target,
      String(unit || 'number'),
      SimConnectDataType.FLOAT64,
      0,
      SimConnectConstants.UNUSED,
    );
    const buffer = new RawBuffer(16);
    buffer.writeFloat64(numeric);
    this.handle.setDataOnSimObject(TRUSTED_WRITE_DEFINITION, SimConnectConstants.OBJECT_ID_USER, {
      buffer,
      arrayCount: 0,
      tagged: false,
    });
    return { target, value: numeric };
  }

  async transmitEventNumber(eventNumber, value = 0) {
    if (!this.handle) throw new Error('SimConnect ist nicht verbunden.');
    const numericEvent = Math.round(Number(eventNumber));
    if (!Number.isInteger(numericEvent) || numericEvent <= 0 || numericEvent > 0x7FFFFFFF) throw new Error('Event-ID ist ungültig.');
    const eventName = `#${numericEvent}`;
    let eventId = this.eventIds.get(eventName);
    if (!eventId) {
      eventId = this.nextEventId++;
      this.handle.mapClientEventToSimEvent(eventId, eventName);
      this.eventIds.set(eventName, eventId);
    }
    const numericValue = Math.max(0, Math.min(0xFFFFFFFF, Math.round(Number(value) || 0)));
    this.handle.transmitClientEvent(
      SimConnectConstants.OBJECT_ID_USER,
      eventId,
      numericValue,
      1,
      EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY,
    );
    return { eventNumber: numericEvent, value: numericValue };
  }

  async setVariable(name, value, unit = 'number') {
    if (!this.handle) throw new Error('SimConnect ist nicht verbunden.');
    const target = String(name || '').trim();
    const numeric = Number(value);
    if (!this.customVariables.some((entry) => entry.name === target)) throw new Error('Variable ist nicht freigegeben.');
    if (!Number.isFinite(numeric)) throw new Error('Variablenwert ist ungültig.');
    this.handle.clearDataDefinition(CUSTOM_WRITE_DEFINITION);
    this.handle.addToDataDefinition(
      CUSTOM_WRITE_DEFINITION,
      target,
      String(unit || 'number'),
      SimConnectDataType.FLOAT64,
      0,
      SimConnectConstants.UNUSED,
    );
    const buffer = new RawBuffer(16);
    buffer.writeFloat64(numeric);
    this.handle.setDataOnSimObject(CUSTOM_WRITE_DEFINITION, SimConnectConstants.OBJECT_ID_USER, {
      buffer,
      arrayCount: 0,
      tagged: false,
    });
    return { target, value: numeric };
  }

  async transmitEvent(name, value = 0) {
    if (!this.handle) throw new Error('SimConnect ist nicht verbunden.');
    const eventName = String(name || '').trim().toUpperCase();
    if (!/^[A-Z0-9_]{2,80}$/.test(eventName)) throw new Error('SimConnect-Event ist ungültig.');
    let eventId = this.eventIds.get(eventName);
    if (!eventId) {
      eventId = this.nextEventId;
      this.nextEventId += 1;
      this.handle.mapClientEventToSimEvent(eventId, eventName);
      this.eventIds.set(eventName, eventId);
    }
    this.handle.transmitClientEvent(
      SimConnectConstants.OBJECT_ID_USER,
      eventId,
      Math.max(0, Math.min(0xFFFFFFFF, Math.round(Number(value) || 0))),
      1,
      EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY,
    );
    return { event: eventName, value: Number(value) || 0 };
  }

  async setComFrequency({ frequency, com = 1, mode = 'standby' } = {}) {
    const radio = Number(com);
    const normalizedMode = String(mode).toLowerCase();
    const mhz = Number(frequency);
    if (![1, 2].includes(radio)) throw new Error('COM muss 1 oder 2 sein.');
    if (!['active', 'standby'].includes(normalizedMode)) throw new Error('COM-Modus muss active oder standby sein.');
    if (!Number.isFinite(mhz) || mhz < 118 || mhz > 136.995) throw new Error('Frequenz muss zwischen 118.000 und 136.995 MHz liegen.');
    const event = radio === 1
      ? normalizedMode === 'active' ? 'COM_RADIO_SET_HZ' : 'COM_STBY_RADIO_SET_HZ'
      : normalizedMode === 'active' ? 'COM2_RADIO_SET_HZ' : 'COM2_STBY_RADIO_SET_HZ';
    return this.transmitEvent(event, Math.round(mhz * 1_000_000));
  }

  async swapCom(com = 1) {
    const radio = Number(com);
    if (![1, 2].includes(radio)) throw new Error('COM muss 1 oder 2 sein.');
    return this.transmitEvent(radio === 1 ? 'COM1_RADIO_SWAP' : 'COM2_RADIO_SWAP', 0);
  }

  async setComReceive(com = 1, enabled = true) {
    const radio = Number(com);
    if (![1, 2].includes(radio)) throw new Error('COM muss 1 oder 2 sein.');
    return this.transmitEvent(radio === 1 ? 'COM1_RECEIVE_SELECT' : 'COM2_RECEIVE_SELECT', enabled ? 1 : 0);
  }

  async setPilotTransmitter(com = 1) {
    const radio = Number(com);
    if (![1, 2].includes(radio)) throw new Error('COM muss 1 oder 2 sein.');
    return this.transmitEvent('PILOT_TRANSMITTER_SET', radio - 1);
  }

  refreshTraffic() {
    if (!this.handle) throw new Error('SimConnect ist nicht verbunden.');
    this.trafficPoll?.();
    return { requested: true };
  }

  listInputEvents(query = '', { limit = 200 } = {}) {
    const search = String(query || '').trim().toLowerCase();
    return [...this.inputEvents.values()]
      .filter((entry) => !search || entry.name.toLowerCase().includes(search))
      .sort((left, right) => left.name.localeCompare(right.name, 'en', { numeric: true }))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map(({ name, type }) => ({ name, type }));
  }

  async setInputEvent(name, value = 0) {
    if (!this.handle) throw new Error('SimConnect ist nicht verbunden.');
    const target = String(name || '').trim();
    const entry = this.inputEvents.get(target.toLowerCase());
    if (!entry) throw new Error('Input Event ist für das aktuell geladene Flugzeug nicht verfügbar.');
    const normalizedValue = entry.type === 1 ? String(value ?? '') : Number(value);
    if (entry.type !== 1 && !Number.isFinite(normalizedValue)) throw new Error('Input-Event-Wert ist ungültig.');
    this.handle.setInputEvent(entry.hash, normalizedValue);
    return { inputEvent: entry.name, value: normalizedValue };
  }

  async requestAirportFacility(icao, { timeoutMs = 8_000 } = {}) {
    if (!this.handle) return null;
    const normalized = String(icao || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(normalized)) throw new Error('Ungültiger Flughafen-ICAO-Code.');
    if (![Protocol.SunRise, Protocol.KittyHawk].includes(this.protocol)) return null;
    const existing = [...this.facilityRequests.values()].find((entry) => entry.icao === normalized);
    if (existing) return existing.promise;
    const requestId = this.facilityRequestId++;
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const raw = { icao: normalized, airport: null, names: [], points: [], parkings: [], paths: [], jetways: [], vdgs: [] };
    const timer = setTimeout(() => {
      this.facilityRequests.delete(requestId);
      rejectPromise(new Error(`MSFS-Flughafendaten für ${normalized} haben nicht rechtzeitig geantwortet.`));
    }, Math.max(2_000, Math.min(20_000, timeoutMs)));
    this.facilityRequests.set(requestId, { icao: normalized, raw, promise, resolve: resolvePromise, reject: rejectPromise, timer });
    try {
      this.handle.requestFacilityData(AIRPORT_FACILITY_DEFINITION, requestId, normalized);
    } catch (error) {
      clearTimeout(timer);
      this.facilityRequests.delete(requestId);
      rejectPromise(error);
    }
    return promise;
  }

  #registerAircraftData(handle) {
    const addFloat = (name, unit) => this.#rememberOperation(handle.addToDataDefinition(
      AIRCRAFT_DATA_DEFINITION,
      name,
      unit,
      SimConnectDataType.FLOAT64,
      0,
      SimConnectConstants.UNUSED,
    ), `Kerntelemetrie: ${name}`);
    const addInt = (name, unit = 'number') => this.#rememberOperation(handle.addToDataDefinition(
      AIRCRAFT_DATA_DEFINITION,
      name,
      unit,
      SimConnectDataType.INT32,
      0,
      SimConnectConstants.UNUSED,
    ), `Kerntelemetrie: ${name}`);
    const addString = (name, type) => this.#rememberOperation(handle.addToDataDefinition(
      AIRCRAFT_DATA_DEFINITION,
      name,
      null,
      type,
      0,
      SimConnectConstants.UNUSED,
    ), `Kerntelemetrie: ${name}`);

    addFloat('PLANE LATITUDE', 'degrees');
    addFloat('PLANE LONGITUDE', 'degrees');
    addFloat('PLANE HEADING DEGREES TRUE', 'degrees');
    addFloat('GROUND VELOCITY', 'knots');
    addInt('SIM ON GROUND', 'bool');
    addFloat('PLANE ALTITUDE', 'feet');
    addFloat('PLANE ALT ABOVE GROUND', 'feet');
    addFloat('AIRSPEED INDICATED', 'knots');
    addFloat('VERTICAL SPEED', 'feet per minute');
    addFloat('AMBIENT TEMPERATURE', 'celsius');
    addFloat('AMBIENT WIND DIRECTION', 'degrees');
    addFloat('AMBIENT WIND VELOCITY', 'knots');
    addFloat('AMBIENT VISIBILITY', 'meters');
    addFloat('SEA LEVEL PRESSURE', 'millibars');
    addFloat('LOCAL TIME', 'seconds');
    addFloat('ZULU TIME', 'seconds');
    addInt('GEAR HANDLE POSITION', 'bool');
    addFloat('FLAPS HANDLE INDEX', 'number');
    addInt('SPOILERS ARMED', 'bool');
    addInt('AUTOPILOT MASTER', 'bool');
    addInt('BRAKE PARKING POSITION', 'bool');
    for (let engine = 1; engine <= 4; engine += 1) addInt(`GENERAL ENG COMBUSTION:${engine}`, 'bool');
    addFloat('FUEL TOTAL QUANTITY WEIGHT', 'pounds');
    addFloat('TOTAL WEIGHT', 'pounds');
    addString('TITLE', SimConnectDataType.STRING128);
    addString('ATC ID', SimConnectDataType.STRING32);

    handle.on('simObjectData', (received) => {
      if (received.requestID !== AIRCRAFT_DATA_REQUEST) return;
      const position = {
        lat: received.data.readFloat64(),
        lon: received.data.readFloat64(),
        heading: received.data.readFloat64(),
        groundSpeed: received.data.readFloat64(),
        onGround: received.data.readInt32() === 1,
        altitudeFeet: received.data.readFloat64(),
        aglFeet: received.data.readFloat64(),
        indicatedAirspeed: received.data.readFloat64(),
        verticalSpeedFpm: received.data.readFloat64(),
        ambientTemperatureC: received.data.readFloat64(),
        ambientWindDirection: received.data.readFloat64(),
        ambientWindSpeedKnots: received.data.readFloat64(),
        visibilityMeters: received.data.readFloat64(),
        seaLevelPressureHpa: received.data.readFloat64(),
        localTimeSeconds: received.data.readFloat64(),
        zuluTimeSeconds: received.data.readFloat64(),
        gearDown: received.data.readInt32() === 1,
        flapsHandleIndex: received.data.readFloat64(),
        spoilersArmed: received.data.readInt32() === 1,
        autopilotMaster: received.data.readInt32() === 1,
        parkingBrake: received.data.readInt32() === 1,
      };
      const engines = [1, 2, 3, 4].map(() => received.data.readInt32() === 1);
      Object.assign(position, {
        enginesRunning: engines.some(Boolean),
        fuelWeightPounds: received.data.readFloat64(),
        grossWeightPounds: received.data.readFloat64(),
        aircraftTitle: received.data.readString128(),
        registration: received.data.readString32(),
        ...this.radioSnapshot,
      });
      if (position.aircraftTitle && position.aircraftTitle !== this.lastAircraftTitle) {
        this.lastAircraftTitle = position.aircraftTitle;
        this.#enumerateInputEvents();
      }
      const now = Date.now();
      this.lastCoreDataAt = now;
      this.aircraftSnapshot = position;
      if (now - this.lastEmitAt >= 180) {
        this.lastEmitAt = now;
        this.engine.setAircraft(position);
      }
    });

    this.#rememberOperation(handle.requestDataOnSimObject(
      AIRCRAFT_DATA_REQUEST,
      AIRCRAFT_DATA_DEFINITION,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.VISUAL_FRAME,
      0,
      0,
      4,
      0,
    ), 'Kerntelemetrie anfordern');
  }

  #registerRadioData(handle) {
    const registerRadio = (index, definitionId, requestId) => {
      const optional = { optional: true };
      const addFloat = (name, unit) => this.#rememberOperation(handle.addToDataDefinition(
        definitionId, `${name}:${index}`, unit, SimConnectDataType.FLOAT64, 0, SimConnectConstants.UNUSED,
      ), `COM${index}: ${name}`, optional);
      const addInt = (name, unit = 'number') => this.#rememberOperation(handle.addToDataDefinition(
        definitionId, `${name}:${index}`, unit, SimConnectDataType.INT32, 0, SimConnectConstants.UNUSED,
      ), `COM${index}: ${name}`, optional);
      const addString = (name) => this.#rememberOperation(handle.addToDataDefinition(
        definitionId, `${name}:${index}`, null, SimConnectDataType.STRING32, 0, SimConnectConstants.UNUSED,
      ), `COM${index}: ${name}`, optional);

      addFloat('COM ACTIVE FREQUENCY', 'MHz');
      addFloat('COM STANDBY FREQUENCY', 'MHz');
      addString('COM ACTIVE FREQ IDENT');
      addString('COM ACTIVE FREQ TYPE');
      addString('COM STANDBY FREQ IDENT');
      addString('COM STANDBY FREQ TYPE');
      addInt('COM RECEIVE', 'bool');
      addInt('COM TRANSMIT', 'bool');
      addInt('COM SPACING MODE', 'enum');

      this.#rememberOperation(handle.requestDataOnSimObject(
        requestId,
        definitionId,
        SimConnectConstants.OBJECT_ID_USER,
        SimConnectPeriod.SECOND,
        0,
        0,
        0,
        0,
      ), `COM${index}-Daten anfordern`, optional);
    };

    handle.on('simObjectData', (received) => {
      const index = received.requestID === COM1_DATA_REQUEST ? 1
        : received.requestID === COM2_DATA_REQUEST ? 2 : null;
      if (!index) return;
      try {
        const prefix = `com${index}`;
        Object.assign(this.radioSnapshot, {
          [`${prefix}Active`]: received.data.readFloat64(),
          [`${prefix}Standby`]: received.data.readFloat64(),
          [`${prefix}ActiveIdent`]: received.data.readString32(),
          [`${prefix}ActiveType`]: received.data.readString32(),
          [`${prefix}StandbyIdent`]: received.data.readString32(),
          [`${prefix}StandbyType`]: received.data.readString32(),
          [`${prefix}Receive`]: received.data.readInt32() === 1,
          [`${prefix}Transmit`]: received.data.readInt32() === 1,
          [`${prefix}Spacing`]: received.data.readInt32(),
          updatedAt: new Date().toISOString(),
        });
        this.#publishRadioState();
      } catch (error) {
        this.engine.setIntegration('com', { status: 'limited', detail: `COM${index}-Daten konnten nicht gelesen werden: ${error.message}` });
      }
    });

    handle.on('simObjectData', (received) => {
      if (received.requestID !== TRANSPONDER_DATA_REQUEST) return;
      try {
        this.radioSnapshot.transponderCode = decodeBco16(received.data.readInt32());
        this.#publishRadioState();
      } catch {
        // Optional on aircraft without a transponder definition.
      }
    });

    registerRadio(1, COM1_DATA_DEFINITION, COM1_DATA_REQUEST);
    registerRadio(2, COM2_DATA_DEFINITION, COM2_DATA_REQUEST);
    this.#rememberOperation(handle.addToDataDefinition(
      TRANSPONDER_DATA_DEFINITION,
      'TRANSPONDER CODE:1',
      'BCO16',
      SimConnectDataType.INT32,
      0,
      SimConnectConstants.UNUSED,
    ), 'Transponder-Code (BCO16)', { optional: true });
    this.#rememberOperation(handle.requestDataOnSimObject(
      TRANSPONDER_DATA_REQUEST,
      TRANSPONDER_DATA_DEFINITION,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SECOND,
      0,
      0,
      0,
      0,
    ), 'Transponder-Daten anfordern', { optional: true });
  }

  #publishRadioState() {
    this.engine.setIntegration('com', {
      status: 'ready',
      source: 'SimConnect',
      detail: 'COM-Funkgeräte werden live aus MSFS gelesen',
      ...this.radioSnapshot,
    });
    if (!this.aircraftSnapshot) return;
    this.aircraftSnapshot = { ...this.aircraftSnapshot, ...this.radioSnapshot };
    this.engine.setAircraft(this.aircraftSnapshot);
  }

  #registerTrafficData(handle) {
    const optional = { optional: true };
    const addFloat = (name, unit) => this.#rememberOperation(handle.addToDataDefinition(
      TRAFFIC_DATA_DEFINITION, name, unit, SimConnectDataType.FLOAT64, 0, SimConnectConstants.UNUSED,
    ), `Verkehr: ${name}`, optional);
    const addInt = (name, unit = 'number') => this.#rememberOperation(handle.addToDataDefinition(
      TRAFFIC_DATA_DEFINITION, name, unit, SimConnectDataType.INT32, 0, SimConnectConstants.UNUSED,
    ), `Verkehr: ${name}`, optional);
    const addString = (name, type) => this.#rememberOperation(handle.addToDataDefinition(
      TRAFFIC_DATA_DEFINITION, name, null, type, 0, SimConnectConstants.UNUSED,
    ), `Verkehr: ${name}`, optional);

    // Keep the primary traffic definition deliberately small and generic. Third-party injectors
    // such as SayIntentions Living World can create PassiveAircraft/AI objects that do not expose
    // every "AI TRAFFIC ..." SimVar. A single unsupported field can otherwise invalidate the
    // complete object request even though the aircraft itself is visible in MSFS/TCAS.
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

    handle.on('simObjectDataByType', (received) => {
      if (received.requestID !== TRAFFIC_DATA_REQUEST) return;
      if (!this.trafficBatch) this.trafficBatch = { startedAt: Date.now(), aircraft: [] };
      if (Number(received.outOf) === 0) {
        this.#publishTrafficBatch();
        return;
      }
      try {
        const data = received.data;
        const entry = {
          objectId: received.objectID,
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
          airline: '',
          flightNumber: '',
          state: '',
          currentAirport: '',
          runway: '',
          parking: '',
          origin: '',
          destination: '',
          etdSeconds: null,
          etaSeconds: null,
        };
        if (received.objectID !== SimConnectConstants.OBJECT_ID_USER) this.trafficBatch.aircraft.push(this.#normalizeTrafficEntry(entry));
      } catch (error) {
        this.engine.setIntegration('simTraffic', { status: 'limited', detail: `Verkehrsobjekt konnte nicht gelesen werden: ${error.message}` });
      }

      const receivedCount = Number(received.entryNumber ?? 0) + 1;
      const expectedCount = Number(received.outOf ?? 0);
      if (expectedCount === 0 || receivedCount >= expectedCount) this.#publishTrafficBatch();
    });

    const poll = () => {
      if (!this.handle || this.trafficBatch) return;
      this.trafficBatch = { startedAt: Date.now(), aircraft: [] };
      try {
        this.#rememberOperation(handle.requestDataOnSimObjectType(
          TRAFFIC_DATA_REQUEST,
          TRAFFIC_DATA_DEFINITION,
          TRAFFIC_RADIUS_METERS,
          SimObjectType.AIRCRAFT,
        ), 'Simulatorverkehr im Umkreis anfordern', optional);
        setTimeout(() => {
          if (this.trafficBatch && Date.now() - this.trafficBatch.startedAt >= 2_400) this.#publishTrafficBatch();
        }, 2_500);
      } catch (error) {
        this.trafficBatch = null;
        this.engine.setIntegration('simTraffic', { status: 'error', detail: error.message, aircraft: [] });
      }
    };
    poll();
    clearInterval(this.trafficPollTimer);
    this.trafficPoll = poll;
    this.trafficPollTimer = setInterval(poll, 5_000);
  }

  #normalizeTrafficEntry(entry) {
    const clean = (value) => String(value || '').replace(/\0/g, '').trim();
    const atcId = clean(entry.atcId);
    const airline = clean(entry.airline);
    const flightNumber = clean(entry.flightNumber);
    const callsign = atcId || [airline, flightNumber].filter(Boolean).join(' ') || `AI-${entry.objectId}`;
    const state = clean(entry.state).toLowerCase();
    const inferredState = state || (entry.onGround
      ? entry.groundSpeed > 3 ? 'taxi' : 'parked'
      : entry.aglFeet < 1_500 && entry.verticalSpeedFpm < -150 ? 'landing' : 'enroute');
    return {
      ...entry,
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
      title: clean(entry.title),
    };
  }

  #publishTrafficBatch() {
    const batch = this.trafficBatch;
    this.trafficBatch = null;
    if (!batch) return;
    const previousById = new Map((this.engine.publicState().integrations?.simTraffic?.aircraft || [])
      .map((entry) => [Number(entry?.objectId), entry])
      .filter(([id]) => Number.isFinite(id)));
    const metadataFields = ['airline', 'flightNumber', 'currentAirport', 'runway', 'parking', 'origin', 'destination'];
    const aircraft = batch.aircraft
      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
      .map((entry) => {
        const previous = previousById.get(Number(entry.objectId));
        const merged = { ...entry, source: 'simconnect-primary' };
        if (!previous) return merged;
        for (const field of metadataFields) merged[field] = String(entry[field] || '').trim() || String(previous[field] || '').trim();
        for (const field of ['etdSeconds', 'etaSeconds']) {
          const current = entry[field];
          const prior = previous[field];
          merged[field] = current !== null && current !== undefined && current !== '' ? current : prior ?? null;
        }
        if (previous.scheduleEnriched) {
          merged.scheduleEnriched = true;
          if (previous.state) merged.state = previous.state;
        }
        return merged;
      })
      .slice(0, 300)
      .sort((left, right) => left.callsign.localeCompare(right.callsign, 'en', { numeric: true }));
    this.engine.setIntegration('simTraffic', {
      status: 'ready',
      source: 'SimConnect',
      radiusKm: TRAFFIC_RADIUS_METERS / 1_000,
      updatedAt: new Date().toISOString(),
      detail: `${aircraft.length} Simulator-Flugzeuge im Umkreis`,
      aircraft,
    });
  }

  #registerSayIntentionsData(handle) {
    for (const name of SI_LVARS) {
      this.#rememberOperation(handle.addToDataDefinition(
        SAYINTENTIONS_DATA_DEFINITION,
        name,
        'number',
        SimConnectDataType.FLOAT64,
        0,
        SimConnectConstants.UNUSED,
      ), `SayIntentions LVar: ${name}`, { optional: true });
    }
    handle.on('simObjectData', (received) => {
      if (received.requestID !== SAYINTENTIONS_DATA_REQUEST) return;
      try {
        const values = Object.fromEntries(SI_LVARS.map((name) => [name, received.data.readFloat64()]));
        const siConnected = this.engine.publicState().connections?.sayIntentions?.status === 'connected';
        if (!siConnected && !Object.values(values).some((value) => Number(value) !== 0)) return;
        this.engine.setSayIntentionsRadioState({
          flightPhase: values['L:SIAI_FLIGHT_PHASE'],
          clearedForTakeoff: values['L:SIAI_CLEARED_FOR_TAKEOFF'] === 1,
          clearedForLanding: values['L:SIAI_CLEARED_FOR_LANDING'] === 1,
          taxiPathVisible: values['L:SIAI_TAXIPATH'] === 1,
          com1Position: values['L:SIAI_COM1_POSITION'],
          com2Position: values['L:SIAI_COM2_POSITION'],
          intercomPositions: [values['L:SIAI_INTERCOM1_POSITION'], values['L:SIAI_INTERCOM2_POSITION'], values['L:SIAI_INTERCOM3_POSITION']],
          radioPtt: values['L:SIAI_RADIO_PTT'] === 1,
          intercomPtt: values['L:SIAI_INTERCOM_PTT'] === 1,
          com1Receiving: values['L:SIAI_COM1_RECEIVING'] === 1,
          com2Receiving: values['L:SIAI_COM2_RECEIVING'] === 1,
        });
      } catch {
        // SI may not be installed; fixed LVAR reads are optional and must never interrupt telemetry.
      }
    });
    this.#rememberOperation(handle.requestDataOnSimObject(
      SAYINTENTIONS_DATA_REQUEST,
      SAYINTENTIONS_DATA_DEFINITION,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SECOND,
      0,
      0,
      0,
      0,
    ), 'SayIntentions LVars anfordern', { optional: true });
  }

  #registerFacilityHandler(handle) {
    const fields = [
      'OPEN AIRPORT', 'LATITUDE', 'LONGITUDE', 'NAME64',
      'OPEN TAXI_NAME', 'NAME', 'CLOSE TAXI_NAME',
      'OPEN TAXI_POINT', 'TYPE', 'ORIENTATION', 'BIAS_X', 'BIAS_Z', 'CLOSE TAXI_POINT',
      'OPEN TAXI_PARKING', 'TYPE', 'TAXI_POINT_TYPE', 'NAME', 'SUFFIX', 'NUMBER', 'ORIENTATION', 'HEADING', 'RADIUS', 'BIAS_X', 'BIAS_Z', 'CLOSE TAXI_PARKING',
      'OPEN TAXI_PATH', 'TYPE', 'WIDTH', 'RUNWAY_NUMBER', 'RUNWAY_DESIGNATOR', 'CENTER_LINE', 'CENTER_LINE_LIGHTED', 'START', 'END', 'NAME_INDEX', 'CLOSE TAXI_PATH',
      'OPEN JETWAY', 'PARKING_GATE', 'PARKING_SUFFIX', 'PARKING_SPOT', 'CLOSE JETWAY',
      'OPEN VDGS', 'LATITUDE', 'LONGITUDE', 'ALTITUDE', 'PARKING_NUMBER', 'PARKING_GATE', 'PARKING_SUFFIX', 'PARKING_INDEX', 'CLOSE VDGS',
      'CLOSE AIRPORT',
    ];
    for (const field of fields) handle.addToFacilityDefinition(AIRPORT_FACILITY_DEFINITION, field);
    handle.on('facilityData', (received) => {
      const pending = this.facilityRequests.get(received.userRequestId);
      if (!pending) return;
      try {
        const data = received.data;
        if (received.type === FacilityDataType.AIRPORT) {
          pending.raw.airport = { lat: data.readFloat64(), lon: data.readFloat64(), name: data.readString64() };
        } else if (received.type === FacilityDataType.TAXI_NAME) {
          pending.raw.names.push({ index: received.itemIndex, name: data.readString32() });
        } else if (received.type === FacilityDataType.TAXI_POINT) {
          pending.raw.points.push({ index: received.itemIndex, type: data.readInt32(), orientation: data.readInt32(), biasX: data.readFloat32(), biasZ: data.readFloat32() });
        } else if (received.type === FacilityDataType.TAXI_PARKING) {
          pending.raw.parkings.push({
            index: received.itemIndex,
            type: data.readInt32(), taxiPointType: data.readInt32(), name: data.readInt32(), suffix: data.readInt32(), number: data.readUint32(),
            orientation: data.readInt32(), heading: data.readFloat32(), radius: data.readFloat32(), biasX: data.readFloat32(), biasZ: data.readFloat32(),
          });
        } else if (received.type === FacilityDataType.TAXI_PATH) {
          pending.raw.paths.push({
            index: received.itemIndex,
            type: data.readInt32(), width: data.readFloat32(), runwayNumber: data.readInt32(), runwayDesignator: data.readInt32(),
            centerLine: data.readInt32(), centerLineLighted: data.readInt32(), start: data.readInt32(), end: data.readInt32(), nameIndex: data.readUint32(),
          });
        } else if (received.type === FacilityDataType.JETWAY) {
          pending.raw.jetways.push({ index: received.itemIndex, parkingGate: data.readInt32(), parkingSuffix: data.readInt32(), parkingSpot: data.readInt32() });
        } else if (received.type === FacilityDataType.VDGS) {
          pending.raw.vdgs.push({
            index: received.itemIndex, lat: data.readFloat64(), lon: data.readFloat64(), altitude: data.readFloat64(),
            parkingNumber: data.readInt32(), parkingGate: data.readInt32(), parkingSuffix: data.readInt32(), parkingIndex: data.readInt32(),
          });
        }
      } catch (error) {
        clearTimeout(pending.timer);
        this.facilityRequests.delete(received.userRequestId);
        pending.reject(error);
      }
    });
    handle.on('facilityDataEnd', (received) => {
      const pending = this.facilityRequests.get(received.userRequestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.facilityRequests.delete(received.userRequestId);
      pending.resolve(pending.raw.airport ? pending.raw : null);
    });
  }

  #rejectFacilityRequests(error) {
    for (const pending of this.facilityRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.facilityRequests.clear();
  }

  #registerInputEventHandler(handle) {
    handle.on('inputEventsList', (received) => {
      if (received.requestID !== INPUT_EVENTS_REQUEST || !this.inputEventEnumeration) return;
      for (const descriptor of received.inputEventDescriptors) {
        const name = String(descriptor.name || '').trim();
        if (!name) continue;
        this.inputEventEnumeration.events.set(name.toLowerCase(), { name, hash: descriptor.inputEventIdHash, type: descriptor.type });
      }
      const consumed = received.entryNumber + received.arraySize;
      if (consumed >= received.outOf) {
        this.inputEvents = this.inputEventEnumeration.events;
        this.inputEventEnumeration = null;
        this.engine.setIntegration('automations', {
          inputEventCount: this.inputEvents.size,
          inputEventsUpdatedAt: new Date().toISOString(),
        });
      }
    });
  }

  #enumerateInputEvents() {
    if (!this.handle || ![Protocol.SunRise, Protocol.KittyHawk].includes(this.protocol)) return;
    this.inputEventEnumeration = { events: new Map() };
    this.inputEvents.clear();
    try {
      this.handle.enumerateInputEvents(INPUT_EVENTS_REQUEST);
    } catch {
      this.inputEventEnumeration = null;
    }
  }

  #registerVariableGroupHandler(handle) {
    handle.on('simObjectData', (received) => {
      const group = [...this.variableGroups.values()].find((entry) => entry.requestId === received.requestID);
      if (!group) return;
      try {
        const values = {};
        for (const variable of group.variables) values[variable.name] = received.data.readFloat64();
        this.engine.setIntegration(`${group.name}Variables`, {
          status: 'ready',
          values,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        this.engine.setIntegration(`${group.name}Variables`, {
          status: 'limited',
          error: error.message,
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  #registerVariableGroup(handle, group) {
    try { handle.clearDataDefinition(group.definitionId); } catch { /* Definition may not exist yet. */ }
    if (!group.variables.length) {
      this.engine.setIntegration(`${group.name}Variables`, { status: 'idle', values: {}, updatedAt: null });
      return;
    }
    try {
      for (const variable of group.variables) {
        this.#rememberOperation(handle.addToDataDefinition(
          group.definitionId,
          variable.name,
          variable.unit,
          SimConnectDataType.FLOAT64,
          0,
          SimConnectConstants.UNUSED,
        ), `${group.name}: ${variable.name}`, { optional: true });
      }
      this.#rememberOperation(handle.requestDataOnSimObject(
        group.requestId,
        group.definitionId,
        SimConnectConstants.OBJECT_ID_USER,
        SimConnectPeriod.SECOND,
        0,
        0,
        0,
        0,
      ), `${group.name}: Variablen anfordern`, { optional: true });
    } catch (error) {
      this.engine.setIntegration(`${group.name}Variables`, { status: 'limited', error: error.message });
    }
  }

  #registerCustomVariableHandler(handle) {
    handle.on('simObjectData', (received) => {
      if (received.requestID !== CUSTOM_DATA_REQUEST) return;
      try {
        const values = {};
        for (const variable of this.customVariables) values[variable.name] = received.data.readFloat64();
        this.engine.setIntegration('automations', {
          values,
          variablesUpdatedAt: new Date().toISOString(),
        });
      } catch {
        this.engine.setIntegration('automations', {
          variableReadError: 'Variablendefinition wird nach Simulatorwechsel neu synchronisiert.',
        });
      }
    });
  }

  #registerCustomVariables(handle) {
    try { handle.clearDataDefinition(CUSTOM_DATA_DEFINITION); } catch { /* Definition may not exist yet. */ }
    if (!this.customVariables.length) {
      this.engine.setIntegration('automations', { values: {}, variablesUpdatedAt: null });
      return;
    }
    for (const variable of this.customVariables) {
      handle.addToDataDefinition(
        CUSTOM_DATA_DEFINITION,
        variable.name,
        variable.unit,
        SimConnectDataType.FLOAT64,
        0,
        SimConnectConstants.UNUSED,
      );
    }
    handle.requestDataOnSimObject(
      CUSTOM_DATA_REQUEST,
      CUSTOM_DATA_DEFINITION,
      SimConnectConstants.OBJECT_ID_USER,
      SimConnectPeriod.SECOND,
      0,
      0,
      0,
      0,
    );
  }
}
