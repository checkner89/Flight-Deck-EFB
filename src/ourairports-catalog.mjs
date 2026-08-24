import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_PATH = path.resolve(MODULE_DIR, '..', 'data', 'ourairports.min.json.gz');

export class OurAirportsCatalog {
  constructor({ dataPath = DEFAULT_DATA_PATH, document = null } = {}) {
    this.dataPath = dataPath;
    this.document = document;
    this.loading = null;
    this.searchEntries = null;
  }

  async #load() {
    if (this.document) return this.document;
    if (!this.loading) {
      this.loading = fs.readFile(this.dataPath)
        .then((buffer) => JSON.parse(gunzipSync(buffer).toString('utf8')))
        .then((document) => {
          if (document?.schemaVersion !== 1 || !document.airports) throw new Error('Unsupported OurAirports catalog');
          this.document = document;
          return document;
        })
        .finally(() => {
          this.loading = null;
        });
    }
    return this.loading;
  }

  async getAirport(value) {
    const icao = String(value ?? '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(icao)) return null;
    try {
      const document = await this.#load();
      const airport = document.airports[icao];
      return airport ? { icao, ...airport } : null;
    } catch {
      return null;
    }
  }

  async search(query, { limit = 12 } = {}) {
    const normalized = String(query ?? '').trim().toLocaleLowerCase('en-US');
    if (normalized.length < 2) return [];
    try {
      const document = await this.#load();
      this.searchEntries ??= Object.entries(document.airports).map(([icao, airport]) => ({
        icao,
        airport,
        haystack: `${icao} ${airport.name ?? ''} ${airport.municipality ?? ''} ${airport.country ?? ''}`
          .toLocaleLowerCase('en-US'),
      }));
      return this.searchEntries
        .map((entry) => {
          let score = 0;
          if (entry.icao.toLowerCase() === normalized) score = 100;
          else if (entry.icao.toLowerCase().startsWith(normalized)) score = 80;
          else if ((entry.airport.name ?? '').toLowerCase().startsWith(normalized)) score = 65;
          else if (entry.haystack.includes(normalized)) score = 40;
          return { ...entry, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((left, right) => right.score - left.score
          || String(left.airport.name).localeCompare(String(right.airport.name)))
        .slice(0, Math.max(1, Math.min(30, limit)))
        .map(({ icao, airport }) => ({
          icao,
          name: airport.name,
          lat: airport.lat,
          lon: airport.lon,
          type: airport.type,
          municipality: airport.municipality,
          country: airport.country,
          runways: (airport.runways ?? []).map((runway) => ({ le: runway.le, he: runway.he })),
        }));
    } catch {
      return [];
    }
  }

  async nearest(latValue, lonValue, { limit = 5, maxDistanceKm = 80 } = {}) {
    const lat = Number(latValue);
    const lon = Number(lonValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    try {
      const document = await this.#load();
      const latitudeScale = 111.32;
      const longitudeScale = latitudeScale * Math.cos(lat * Math.PI / 180);
      return Object.entries(document.airports)
        .map(([icao, airport]) => ({
          icao,
          airport,
          distanceKm: Math.hypot(
            (airport.lat - lat) * latitudeScale,
            (airport.lon - lon) * longitudeScale,
          ),
        }))
        .filter((entry) => entry.distanceKm <= maxDistanceKm)
        .sort((left, right) => left.distanceKm - right.distanceKm)
        .slice(0, Math.max(1, Math.min(20, limit)))
        .map(({ icao, airport, distanceKm }) => ({
          icao,
          name: airport.name,
          lat: airport.lat,
          lon: airport.lon,
          type: airport.type,
          municipality: airport.municipality,
          country: airport.country,
          distanceKm: Math.round(distanceKm * 10) / 10,
        }));
    } catch {
      return [];
    }
  }

  async metadata() {
    try {
      const document = await this.#load();
      return {
        generatedAt: document.generatedAt,
        source: document.source,
        license: document.license,
        airports: Object.keys(document.airports).length,
      };
    } catch {
      return null;
    }
  }
}
