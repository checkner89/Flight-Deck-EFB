import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveFlightPhase } from '../public/flight-phases.js';

const MODES = new Set(['off', 'test', 'armed']);
const PHASES = new Set(['preflight', 'taxi-out', 'takeoff', 'climb', 'cruise', 'descent', 'approach', 'landing', 'taxi-in', 'postflight']);
const APPS = new Set(['home', 'taxi', 'flight', 'tracking', 'briefing', 'com', 'flightboard', 'charts', 'ground', 'atc', 'online', 'fenix', 'automations', 'settings']);
const TRIGGERS = new Set(['phase-enter', 'app-open', 'variable-condition', 'atc-station']);
const ACTIONS = new Set(['sim-event', 'set-variable', 'input-event']);
const OPERATORS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']);
const ATC_STATIONS = new Set(['clearance', 'ground', 'tower', 'departure', 'center', 'approach', 'ctaf']);
const GROUND_GUARDS = new Set(['any', 'yes', 'no']);

function defaultStorageDirectory() {
  if (process.env.FLIGHT_DECK_EFB_DATA_DIR) return path.resolve(process.env.FLIGHT_DECK_EFB_DATA_DIR);
  if (process.env.LOCALAPPDATA) return path.join(process.env.LOCALAPPDATA, 'Flight Deck EFB');
  if (process.platform === 'win32') return path.join(os.homedir(), 'AppData', 'Local', 'Flight Deck EFB');
  return path.join(process.cwd(), '.flight-deck-efb-data');
}

function text(value, length = 100) {
  return String(value ?? '').trim().slice(0, length);
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeVariableName(value) {
  const name = text(value, 120);
  if (!/^(?:L:|Z:|[A-Z])[A-Z0-9_ .:@/-]{1,119}$/i.test(name)) return null;
  return name;
}

function normalizeUnit(value) {
  const unit = text(value || 'number', 32);
  return /^[A-Z0-9 %_./-]{1,32}$/i.test(unit) ? unit : 'number';
}

function sanitizeVariable(value, index) {
  const name = normalizeVariableName(value?.name);
  if (!name) return null;
  return {
    id: /^[a-z0-9-]{8,80}$/i.test(String(value?.id || '')) ? String(value.id) : randomUUID(),
    label: text(value?.label || name, 80),
    name,
    unit: normalizeUnit(value?.unit),
    source: /^L:/i.test(name) ? 'lvar' : /^Z:/i.test(name) ? 'zvar' : 'simvar',
    index,
  };
}

function sanitizeRule(value, index) {
  const triggerType = TRIGGERS.has(value?.triggerType) ? value.triggerType : null;
  const actionType = ACTIONS.has(value?.actionType) ? value.actionType : null;
  if (!triggerType || !actionType) return null;
  let triggerValue = text(value.triggerValue, 120);
  if (triggerType === 'phase-enter' && !PHASES.has(triggerValue)) return null;
  if (triggerType === 'app-open' && !APPS.has(triggerValue)) return null;
  if (triggerType === 'variable-condition' && !normalizeVariableName(triggerValue)) return null;
  if (triggerType === 'atc-station' && !ATC_STATIONS.has(triggerValue)) return null;
  let actionTarget = text(value.actionTarget, 120);
  if (actionType === 'sim-event') {
    actionTarget = actionTarget.toUpperCase();
    if (!/^[A-Z0-9_]{2,80}$/.test(actionTarget)) return null;
  } else if (actionType === 'input-event') {
    if (!/^[A-Z0-9_.:/ -]{2,120}$/i.test(actionTarget)) return null;
  } else if (!normalizeVariableName(actionTarget)) return null;
  const maxGroundSpeed = value?.maxGroundSpeed === null || value?.maxGroundSpeed === '' || value?.maxGroundSpeed === undefined
    ? null
    : Math.max(0, Math.min(250, finite(value.maxGroundSpeed, 0)));
  return {
    id: /^[a-z0-9-]{8,80}$/i.test(String(value?.id || '')) ? String(value.id) : randomUUID(),
    name: text(value?.name || `Rule ${index + 1}`, 80),
    enabled: value?.enabled !== false,
    triggerType,
    triggerValue,
    operator: OPERATORS.has(value?.operator) ? value.operator : 'eq',
    comparisonValue: finite(value?.comparisonValue, 1),
    actionType,
    actionTarget,
    actionValue: finite(value?.actionValue, 0),
    cooldownSeconds: Math.max(5, Math.min(3_600, Math.round(finite(value?.cooldownSeconds, 15)))),
    requireOnGround: GROUND_GUARDS.has(value?.requireOnGround) ? value.requireOnGround : 'any',
    maxGroundSpeed,
    aircraftMatch: text(value?.aircraftMatch, 80),
  };
}

function sanitizeVariables(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).slice(0, 60).map(sanitizeVariable).filter((entry) => {
    if (!entry || seen.has(entry.name)) return false;
    seen.add(entry.name);
    return true;
  });
}

function sanitizeRules(values, variables) {
  const ids = new Set();
  const variableNames = new Set(variables.map((entry) => entry.name));
  return (Array.isArray(values) ? values : []).slice(0, 100).map(sanitizeRule).filter((entry) => {
    if (!entry || ids.has(entry.id)) return false;
    if (entry.triggerType === 'variable-condition' && !variableNames.has(entry.triggerValue)) return false;
    if (entry.actionType === 'set-variable' && !variableNames.has(entry.actionTarget)) return false;
    ids.add(entry.id);
    return true;
  });
}

function compare(left, operator, right) {
  if (!Number.isFinite(Number(left))) return false;
  const a = Number(left);
  if (operator === 'ne') return a !== right;
  if (operator === 'gt') return a > right;
  if (operator === 'gte') return a >= right;
  if (operator === 'lt') return a < right;
  if (operator === 'lte') return a <= right;
  return a === right;
}

export class AutomationEngine {
  constructor(engine, { simConnect = null, storageDirectory = defaultStorageDirectory(), now = () => new Date() } = {}) {
    this.engine = engine;
    this.simConnect = simConnect;
    this.storageDirectory = storageDirectory;
    this.filePath = path.join(storageDirectory, 'automations.json');
    this.now = now;
    this.mode = 'test';
    this.variables = [];
    this.rules = [];
    this.log = [];
    this.activeApp = 'home';
    this.lastPhase = null;
    this.lastAtcStation = null;
    this.sessionGeneration = null;
    this.aircraftTitle = null;
    this.conditionStates = new Map();
    this.lastRuns = new Map();
    this.started = false;
    this.stateListener = (state) => this.#onState(state);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    try {
      const saved = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      this.mode = MODES.has(saved.mode) && saved.mode !== 'armed' ? saved.mode : 'test';
      this.variables = sanitizeVariables(saved.variables);
      this.rules = sanitizeRules(saved.rules, this.variables);
      if (saved.mode === 'armed') this.#appendLog('safety', 'Safe start', null, 'Armed wurde nach dem Neustart automatisch auf Test zurückgesetzt.');
    } catch (error) {
      if (error.code !== 'ENOENT') this.#appendLog('error', 'Konfiguration konnte nicht geladen werden.', null, error.message);
    }
    this.simConnect?.configureVariables(this.variables);
    const state = this.engine.publicState();
    this.lastPhase = resolveFlightPhase(state, null, state.integrations?.flightOperations?.phaseOverride);
    this.lastAtcStation = atcStationFromState(state);
    this.sessionGeneration = Number(state.session?.generation || 1);
    this.aircraftTitle = text(state.aircraft?.aircraftTitle, 120) || null;
    this.engine.on('change', this.stateListener);
    this.#publish();
    await this.#save();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    this.engine.off('change', this.stateListener);
  }

  publicConfiguration() {
    return {
      mode: this.mode,
      activeApp: this.activeApp,
      variables: structuredClone(this.variables),
      rules: structuredClone(this.rules),
      log: structuredClone(this.log),
    };
  }

  async updateConfiguration(value = {}) {
    if (value.mode !== undefined) this.mode = MODES.has(value.mode) ? value.mode : this.mode;
    if (Array.isArray(value.variables)) {
      this.variables = sanitizeVariables(value.variables);
      this.simConnect?.configureVariables(this.variables);
    }
    if (Array.isArray(value.rules)) {
      this.rules = sanitizeRules(value.rules, this.variables);
      this.conditionStates.clear();
    } else if (Array.isArray(value.variables)) {
      // Removing a variable must also remove rules which would otherwise retain
      // a stale read/write target outside the current allowlist.
      this.rules = sanitizeRules(this.rules, this.variables);
      this.conditionStates.clear();
    }
    await this.#save();
    this.#publish();
    return this.publicConfiguration();
  }

  setContext(app) {
    const next = APPS.has(app) ? app : 'home';
    if (next === this.activeApp) return;
    this.activeApp = next;
    this.#runMatching((rule) => rule.triggerType === 'app-open' && rule.triggerValue === next, `app:${next}`);
    this.#publish();
  }

  async runRule(id) {
    const rule = this.rules.find((entry) => entry.id === id);
    if (!rule) throw new Error('Automationsregel wurde nicht gefunden.');
    return this.#execute(rule, 'manual', { ignoreCooldown: true });
  }

  #onState(state) {
    const sessionGeneration = Number(state.session?.generation || 1);
    const aircraftTitle = text(state.aircraft?.aircraftTitle, 120) || null;
    const sessionChanged = this.sessionGeneration !== null && sessionGeneration !== this.sessionGeneration;
    const aircraftChanged = this.aircraftTitle && aircraftTitle && this.aircraftTitle !== aircraftTitle;
    this.sessionGeneration = sessionGeneration;
    this.aircraftTitle = aircraftTitle;
    if ((sessionChanged || aircraftChanged) && this.mode === 'armed') {
      this.mode = 'test';
      this.#appendLog('safety', 'Safety reset', null, sessionChanged
        ? 'Neuer Flug: Automationen wurden auf Test zurückgesetzt.'
        : 'Flugzeugwechsel: Automationen wurden auf Test zurückgesetzt.');
      this.#save().catch(() => {});
    }
    const phase = resolveFlightPhase(state, null, state.integrations?.flightOperations?.phaseOverride);
    if (this.lastPhase === null) this.lastPhase = phase;
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      this.#runMatching((rule) => rule.triggerType === 'phase-enter' && rule.triggerValue === phase, `phase:${phase}`);
    }
    const station = atcStationFromState(state);
    if (station && station !== this.lastAtcStation) {
      this.lastAtcStation = station;
      this.#runMatching((rule) => rule.triggerType === 'atc-station' && rule.triggerValue === station, `atc:${station}`);
    } else if (!station) {
      this.lastAtcStation = null;
    }
    const values = state.integrations?.automations?.values || {};
    for (const rule of this.rules.filter((entry) => entry.enabled && entry.triggerType === 'variable-condition')) {
      const current = compare(values[rule.triggerValue], rule.operator, rule.comparisonValue);
      const previous = this.conditionStates.get(rule.id);
      this.conditionStates.set(rule.id, current);
      if (previous === false && current) this.#execute(rule, `variable:${rule.triggerValue}`).catch(() => {});
    }
  }

  #runMatching(predicate, trigger) {
    for (const rule of this.rules.filter((entry) => entry.enabled && predicate(entry))) {
      this.#execute(rule, trigger).catch(() => {});
    }
  }

  async #execute(rule, trigger, { ignoreCooldown = false } = {}) {
    if (this.mode === 'off') throw new Error('Automationen sind ausgeschaltet.');
    const now = this.now();
    const lastRun = this.lastRuns.get(rule.id) || 0;
    if (!ignoreCooldown && now.getTime() - lastRun < rule.cooldownSeconds * 1_000) return { skipped: true, reason: 'cooldown' };
    this.lastRuns.set(rule.id, now.getTime());
    try {
      const state = this.engine.publicState();
      const guardFailure = guardFailureReason(rule, state);
      if (guardFailure) {
        this.#appendLog('guarded', rule.name, rule.id, `${trigger} · ${guardFailure}`);
        this.#publish();
        return { skipped: true, reason: 'guard', detail: guardFailure };
      }
      if (this.mode === 'armed') {
        if (!this.simConnect) throw new Error('SimConnect ist nicht verfügbar.');
        if (rule.actionType === 'sim-event') {
          await this.simConnect.transmitEvent(rule.actionTarget, rule.actionValue);
        } else if (rule.actionType === 'set-variable') {
          const allowed = this.variables.some((entry) => entry.name === rule.actionTarget);
          if (!allowed) throw new Error('Zielvariable ist nicht in der Variablen-Allowlist enthalten.');
          await this.simConnect.setVariable(rule.actionTarget, rule.actionValue, this.variables.find((entry) => entry.name === rule.actionTarget)?.unit);
        } else {
          await this.simConnect.setInputEvent(rule.actionTarget, rule.actionValue);
        }
      }
      const status = this.mode === 'test' ? 'simulated' : 'executed';
      this.#appendLog(status, rule.name, rule.id, `${trigger} → ${rule.actionTarget} = ${rule.actionValue}`);
      this.#publish();
      return { status, rule: structuredClone(rule) };
    } catch (error) {
      this.#appendLog('error', rule.name, rule.id, error.message);
      this.#publish();
      throw error;
    }
  }

  #appendLog(status, name, ruleId, detail) {
    this.log.unshift({ time: this.now().toISOString(), status, name, ruleId, detail: text(detail, 240) });
    this.log = this.log.slice(0, 40);
  }

  #publish() {
    this.engine.setIntegration('automations', {
      status: this.mode === 'off' ? 'off' : this.mode === 'test' ? 'test' : 'armed',
      mode: this.mode,
      activeApp: this.activeApp,
      variableDefinitions: structuredClone(this.variables),
      rules: structuredClone(this.rules),
      log: structuredClone(this.log),
      detail: this.mode === 'armed'
        ? 'Regeln sind scharf und dürfen freigegebene Simulatoraktionen auslösen.'
        : this.mode === 'test' ? 'Testmodus: Auslöser werden protokolliert, aber nicht an MSFS gesendet.' : 'Automationen sind ausgeschaltet.',
    });
  }

  async #save() {
    await fs.mkdir(this.storageDirectory, { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, mode: this.mode, variables: this.variables, rules: this.rules }, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, this.filePath);
  }
}

function atcStationFromState(state) {
  const clearanceStation = String(state?.taxi?.clearance?.station || '').toLowerCase();
  const textMatches = [
    ['clearance', /\b(?:clearance|delivery|clnc|del)\b/],
    ['ground', /\b(?:ground|gnd|ramp)\b/],
    ['tower', /\b(?:tower|twr)\b/],
    ['departure', /\b(?:departure|dep)\b/],
    ['approach', /\b(?:approach|app)\b/],
    ['center', /\b(?:center|centre|ctr)\b/],
    ['ctaf', /\b(?:ctaf|unicom|multicom)\b/],
  ];
  const textual = textMatches.find(([, pattern]) => pattern.test(clearanceStation))?.[0];
  if (textual) return textual;
  const position = Number(state?.integrations?.sayIntentions?.radioPositions?.com1);
  if (position === 1) return 'ctaf';
  if (position === 2) return 'clearance';
  if (position === 3) return 'ground';
  if (position === 4) return 'tower';
  if (position === 16) return 'center';
  if (position === 5) {
    const phase = resolveFlightPhase(state, null, state?.integrations?.flightOperations?.phaseOverride);
    return ['descent', 'approach', 'landing'].includes(phase) ? 'approach' : 'departure';
  }
  return null;
}

function guardFailureReason(rule, state) {
  const aircraft = state?.aircraft || {};
  if (rule.requireOnGround === 'yes' && aircraft.onGround !== true) return 'Nur am Boden erlaubt.';
  if (rule.requireOnGround === 'no' && aircraft.onGround !== false) return 'Nur in der Luft erlaubt.';
  if (rule.maxGroundSpeed !== null && Number(aircraft.groundSpeed || 0) > rule.maxGroundSpeed) {
    return `Groundspeed über ${rule.maxGroundSpeed} kt.`;
  }
  if (rule.aircraftMatch && !String(aircraft.aircraftTitle || '').toLowerCase().includes(rule.aircraftMatch.toLowerCase())) {
    return `Flugzeug passt nicht zu „${rule.aircraftMatch}“.`;
  }
  return null;
}
