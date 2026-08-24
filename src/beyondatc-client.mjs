import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseTaxiClearance } from './taxi-route-planner.mjs';

const MAX_LOG_TAIL_BYTES = 512 * 1024;
const TAXI_INSTRUCTION = /\b(?:taxi(?:\s+(?:to|via|runway|rwy|holding|gate|stand))?|hold(?:ing)? short|holding point|cross (?:runway|rwy)|continue taxi|give way|follow)\b/i;
const ATC_ROUTE_DETAIL = /\b(?:runway|rwy|via|hold(?:ing)? short|holding point|cross)\b/i;

export function defaultBeyondAtcDirectory() {
  const configured = process.env.BEYONDATC_LOG_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(os.homedir(), 'AppData', 'LocalLow', 'Skirmish Mode Games, Inc', 'BeyondATC');
}

function decodeQuoted(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value.replaceAll('\\n', ' ').replaceAll('\\"', '"');
  }
}

function valuesFromLine(line) {
  const values = [line];
  const expression = /"(?:message|text|content|response|instruction|transcript|atcMessage|atc_message)"\s*:\s*"((?:\\.|[^"\\])*)"/gi;
  for (const match of line.matchAll(expression)) values.push(decodeQuoted(match[1]));
  return values;
}

function normalizeLogText(value) {
  return String(value ?? '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .replace(/^\s*\[[^\]]{3,80}\]\s*/g, '')
    .replace(/^\s*\d{4}[-/]\d{2}[-/]\d{2}[T\s][0-9:.+Z-]+\s*/i, '')
    .replace(/^\s*(?:INFO|DEBUG|TRACE|WARN|LOG)\s*[:|-]\s*/i, '')
    .replace(/\\[rn]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractInstruction(value) {
  let text = normalizeLogText(value);
  if (!TAXI_INSTRUCTION.test(text) || !ATC_ROUTE_DETAIL.test(text)) return null;
  if (/\b(?:request|ready for|would like)\b.{0,45}\btaxi\b/i.test(text)
    && !/\b(?:cleared|taxi (?:to|via|runway|rwy)|hold short)\b/i.test(text)) return null;

  const start = text.search(TAXI_INSTRUCTION);
  if (start > 0 && /(?:player|pilot|user)\s*[:>]/i.test(text.slice(0, start))) return null;
  if (start > 0 && text.length > 500) text = text.slice(start);
  text = text.replace(/[}\]"',]+\s*$/, '').trim();
  if (text.length < 12 || text.length > 1_500) return null;
  const parsed = parseTaxiClearance(text);
  if (!parsed.runway && parsed.taxiways.length === 0 && !parsed.holdShort) return null;
  return text;
}

function fingerprint(value) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return `batc-${(hash >>> 0).toString(16)}`;
}

export function parseBeyondAtcLog(logText) {
  const lines = String(logText ?? '').split(/\r?\n/);
  const candidates = [];
  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (!TAXI_INSTRUCTION.test(rawLine)) continue;
    for (const value of valuesFromLine(rawLine)) {
      const text = extractInstruction(value);
      if (!text) continue;
      const station = normalizeLogText(value).match(/\b([A-Z][A-Za-zÀ-ÿ' -]{1,45}\s(?:Ground|Tower|Ramp|Delivery))\s*[:>]/)?.[1] ?? '';
      const time = rawLine.match(/\b(\d{4}-\d{2}-\d{2}T[0-9:.+-]+Z?)\b/)?.[1] ?? null;
      candidates.push({
        id: fingerprint(`${index}:${text}`),
        text,
        station,
        time,
      });
    }
  }
  return candidates.at(-1) ?? null;
}

async function readTail(filePath, limit = MAX_LOG_TAIL_BYTES) {
  const stat = await fs.stat(filePath);
  const length = Math.min(stat.size, limit);
  const start = Math.max(0, stat.size - length);
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return { text: buffer.subarray(0, bytesRead).toString('utf8'), stat };
  } finally {
    await handle.close();
  }
}

export class BeyondAtcClient {
  constructor(engine, {
    logDirectory = defaultBeyondAtcDirectory(),
    pollMs = 1_500,
    logFiles = ['Player.log', 'beyondATC.log', 'Player-prev.log'],
  } = {}) {
    this.engine = engine;
    this.logDirectory = logDirectory;
    this.pollMs = pollMs;
    this.logFiles = logFiles;
    this.timer = null;
    this.stopped = true;
    this.lastFingerprint = null;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.pollOnce();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  async pollOnce() {
    try {
      let readableLog = null;
      for (const fileName of this.logFiles) {
        try {
          const candidate = await readTail(path.join(this.logDirectory, fileName));
          if (!readableLog || candidate.stat.mtimeMs > readableLog.stat.mtimeMs) {
            readableLog = { ...candidate, fileName };
          }
        } catch (error) {
          if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
        }
      }

      if (!readableLog) {
        this.engine.setConnection('beyondAtc', 'waiting', 'BeyondATC-Log nicht gefunden · App starten oder Pfad prüfen');
        return;
      }

      this.engine.setConnection(
        'beyondAtc',
        'connected',
        `${readableLog.fileName} erkannt · lokaler Kompatibilitätsmodus`,
      );
      const clearance = parseBeyondAtcLog(readableLog.text);
      if (!clearance || clearance.id === this.lastFingerprint) return;
      this.lastFingerprint = clearance.id;
      this.engine.applyExternalClearance({ provider: 'beyondatc', ...clearance });
    } catch (error) {
      this.engine.setConnection('beyondAtc', 'attention', `BeyondATC-Log konnte nicht gelesen werden · ${error.message}`);
    } finally {
      if (!this.stopped) this.timer = setTimeout(() => this.pollOnce(), this.pollMs);
    }
  }
}
