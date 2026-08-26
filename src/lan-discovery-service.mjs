import dgram from 'node:dgram';
import os from 'node:os';

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;

function encodeName(value) {
  const labels = String(value || '').replace(/\.$/, '').split('.').filter(Boolean);
  const parts = [];
  for (const label of labels) {
    const bytes = Buffer.from(label, 'utf8');
    if (bytes.length > 63) throw new Error(`mDNS label too long: ${label}`);
    parts.push(Buffer.from([bytes.length]), bytes);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

function readName(buffer, offset, seen = new Set()) {
  const labels = [];
  let cursor = offset;
  let consumed = 0;
  while (cursor < buffer.length) {
    const length = buffer[cursor];
    if ((length & 0xc0) === 0xc0) {
      if (cursor + 1 >= buffer.length) break;
      const pointer = ((length & 0x3f) << 8) | buffer[cursor + 1];
      if (seen.has(pointer)) break;
      seen.add(pointer);
      const pointed = readName(buffer, pointer, seen);
      if (pointed.name) labels.push(pointed.name);
      consumed += 2;
      return { name: labels.filter(Boolean).join('.').toLowerCase(), bytes: consumed };
    }
    cursor += 1;
    consumed += 1;
    if (length === 0) break;
    if (cursor + length > buffer.length) break;
    labels.push(buffer.subarray(cursor, cursor + length).toString('utf8'));
    cursor += length;
    consumed += length;
  }
  return { name: labels.join('.').toLowerCase(), bytes: consumed };
}

function parseQuestions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return [];
  const count = buffer.readUInt16BE(4);
  const questions = [];
  let offset = 12;
  for (let index = 0; index < count && offset < buffer.length; index += 1) {
    const parsed = readName(buffer, offset);
    offset += parsed.bytes;
    if (offset + 4 > buffer.length) break;
    const type = buffer.readUInt16BE(offset);
    offset += 4;
    questions.push({ name: parsed.name, type });
  }
  return questions;
}

function ipv4Bytes(address) {
  const parts = String(address || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return Buffer.from(parts);
}

function resourceRecord(name, type, data, { ttl = 120, flush = true } = {}) {
  const nameBuffer = encodeName(name);
  const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const header = Buffer.alloc(10);
  header.writeUInt16BE(type, 0);
  header.writeUInt16BE(flush ? 0x8001 : 0x0001, 2);
  header.writeUInt32BE(ttl, 4);
  header.writeUInt16BE(body.length, 8);
  return Buffer.concat([nameBuffer, header, body]);
}

function ptrRecord(service, instance) {
  return resourceRecord(service, 12, encodeName(instance), { flush: false });
}

function srvRecord(instance, port, host) {
  const fixed = Buffer.alloc(6);
  fixed.writeUInt16BE(0, 0);
  fixed.writeUInt16BE(0, 2);
  fixed.writeUInt16BE(port, 4);
  return resourceRecord(instance, 33, Buffer.concat([fixed, encodeName(host)]));
}

function txtRecord(instance) {
  const entries = ['product=Flight Deck EFB', 'pairing=required', 'path=/'];
  const chunks = entries.map((entry) => {
    const bytes = Buffer.from(entry, 'utf8');
    return Buffer.concat([Buffer.from([Math.min(255, bytes.length)]), bytes.subarray(0, 255)]);
  });
  return resourceRecord(instance, 16, Buffer.concat(chunks));
}

function buildResponse({ host, port, addresses }) {
  const customService = '_flightdeck._tcp.local';
  const httpService = '_http._tcp.local';
  const customInstance = `Flight Deck EFB.${customService}`;
  const httpInstance = `Flight Deck EFB.${httpService}`;
  const records = [
    ptrRecord(customService, customInstance),
    srvRecord(customInstance, port, host),
    txtRecord(customInstance),
    ptrRecord(httpService, httpInstance),
    srvRecord(httpInstance, port, host),
    txtRecord(httpInstance),
  ];
  for (const address of addresses) {
    const bytes = ipv4Bytes(address);
    if (bytes) records.push(resourceRecord(host, 1, bytes));
  }
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(0, 4);
  header.writeUInt16BE(records.length, 6);
  header.writeUInt16BE(0, 8);
  header.writeUInt16BE(0, 10);
  return Buffer.concat([header, ...records]);
}

function normalizedAddresses(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter((value) => ipv4Bytes(value)))];
}

export class LanDiscoveryService {
  constructor({ port, addresses = [], hostname = 'flightdeck', logger = console } = {}) {
    this.port = Number(port) || 0;
    this.addresses = normalizedAddresses(addresses);
    this.hostname = `${String(hostname || 'flightdeck').replace(/[^a-z0-9-]/gi, '-').replace(/^-+|-+$/g, '') || 'flightdeck'}.local`.toLowerCase();
    this.logger = logger;
    this.socket = null;
    this.state = 'stopped';
    this.detail = 'mDNS discovery is not running.';
    this.startedAt = null;
  }

  async start() {
    if (this.socket || !this.port || this.addresses.length === 0) {
      if (this.addresses.length === 0) {
        this.state = 'unavailable';
        this.detail = 'No LAN IPv4 address is available for mDNS discovery.';
      }
      return this.status();
    }
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket = socket;
    socket.on('error', (error) => {
      this.state = 'degraded';
      this.detail = `mDNS unavailable: ${error.message}`;
    });
    socket.on('message', (message) => this.#handleQuery(message));
    await new Promise((resolve) => {
      const finish = () => resolve();
      socket.once('listening', () => {
        try {
          socket.addMembership(MDNS_ADDRESS);
          socket.setMulticastTTL(255);
          socket.setMulticastLoopback(false);
          this.state = 'ready';
          this.detail = `${this.hostname}:${this.port}`;
          this.startedAt = new Date().toISOString();
          this.#announce();
        } catch (error) {
          this.state = 'degraded';
          this.detail = `mDNS multicast could not be enabled: ${error.message}`;
        }
        finish();
      });
      socket.once('error', finish);
      try { socket.bind(MDNS_PORT); } catch { finish(); }
    });
    return this.status();
  }

  #handleQuery(message) {
    if (!this.socket || this.state !== 'ready') return;
    const questions = parseQuestions(message);
    const names = new Set(questions.map((question) => question.name));
    const interested = names.has(this.hostname)
      || names.has('_flightdeck._tcp.local')
      || names.has('_http._tcp.local')
      || [...names].some((name) => name.startsWith('flight deck efb.'));
    if (interested) this.#announce();
  }

  #announce() {
    if (!this.socket || this.state !== 'ready') return;
    const packet = buildResponse({ host: this.hostname, port: this.port, addresses: this.addresses });
    try {
      this.socket.send(packet, MDNS_PORT, MDNS_ADDRESS, () => {});
    } catch {
      // Discovery is best effort and never blocks the EFB host.
    }
  }

  status() {
    const friendlyUrl = this.port ? `http://${this.hostname}:${this.port}/` : null;
    return {
      status: this.state,
      hostname: this.hostname,
      port: this.port || null,
      url: friendlyUrl,
      addresses: [...this.addresses],
      service: '_flightdeck._tcp.local',
      startedAt: this.startedAt,
      detail: this.detail,
      computerName: os.hostname(),
    };
  }

  async stop() {
    const socket = this.socket;
    this.socket = null;
    this.state = 'stopped';
    if (!socket) return;
    await new Promise((resolve) => {
      try { socket.close(resolve); } catch { resolve(); }
    });
  }
}
