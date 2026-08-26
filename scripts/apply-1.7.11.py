from pathlib import Path
import json
import os
import shutil

ROOT = Path('.')
SOURCE = Path(os.environ['AIRLINE_SOURCE'])
VERSION = '1.7.11'
SOURCE_COMMIT = '7b001fb8d5d0a2f875d57b2b5a8a8056b2fbc63a'


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)


# ---------- Vendor complete available image set ----------
source_data = json.loads((SOURCE / 'airlines.json').read_text(encoding='utf-8'))
records = source_data.get('data', [])
if len(records) < 1500:
    raise SystemExit(f'airline catalog unexpectedly small: {len(records)} records')

logo_dir = ROOT / 'public' / 'assets' / 'airlines'
if logo_dir.exists():
    shutil.rmtree(logo_dir)
logo_dir.mkdir(parents=True, exist_ok=True)

output_records = []
logo_count = 0
for item in records:
    name = str(item.get('name') or '').strip()
    iata = str(item.get('iata_code') or '').strip().upper()
    icao = str(item.get('icao_code') or '').strip().upper()
    source_logo = item.get('logo')
    has_logo = False
    logo_name = None
    if source_logo:
        candidate = SOURCE / str(source_logo).replace('./', '')
        if candidate.is_file() and icao:
            logo_name = f'{icao}{candidate.suffix.lower()}'
            shutil.copy2(candidate, logo_dir / logo_name)
            has_logo = True
            logo_count += 1
    if name or iata or icao:
        output_records.append({
            'name': name,
            'iata': iata,
            'icao': icao,
            'logo': f'/assets/airlines/{logo_name}' if has_logo else '',
        })

if logo_count < 1000:
    raise SystemExit(f'airline logo catalog unexpectedly small: {logo_count} logos')

metadata = {
    'source': 'imgmongelli/airlines-logos-dataset',
    'sourceCommit': SOURCE_COMMIT,
    'recordCount': len(output_records),
    'logoCount': logo_count,
    'records': output_records,
}
write('public/data/airlines.json', json.dumps(metadata, ensure_ascii=False, separators=(',', ':')))

catalog_json = json.dumps(output_records, ensure_ascii=False, separators=(',', ':'))
catalog_js = """// Generated for Flight Deck EFB __VERSION__ from imgmongelli/airlines-logos-dataset @ __SOURCE_COMMIT__
// Airline names/logos are trademarks of their respective owners and are used for identification only.
export const AIRLINE_CATALOG_SOURCE = Object.freeze({ repository: 'imgmongelli/airlines-logos-dataset', commit: '__SOURCE_COMMIT__', records: __RECORD_COUNT__, logos: __LOGO_COUNT__ });

const AIRLINES = __CATALOG_JSON__;
const normalize = (value = '') => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const compact = (value = '') => normalize(value).replace(/\s+/g, '');
const BY_ICAO = new Map();
const BY_IATA = new Map();
const BY_NAME = new Map();
for (const airline of AIRLINES) {
  if (airline.icao) BY_ICAO.set(airline.icao, airline);
  if (airline.iata) BY_IATA.set(airline.iata, airline);
  const key = normalize(airline.name);
  if (key && key.length >= 4 && !BY_NAME.has(key)) BY_NAME.set(key, airline);
}
const NAME_MATCHERS = [...BY_NAME.entries()]
  .filter(([key]) => key.length >= 5)
  .sort((a, b) => b[0].length - a[0].length);

function directCode(value) {
  const raw = compact(value);
  if (!raw) return null;
  if (BY_ICAO.has(raw)) return BY_ICAO.get(raw);
  if (BY_IATA.has(raw)) return BY_IATA.get(raw);
  const icaoPrefix = raw.match(/^([A-Z]{3})(?:\d|$)/)?.[1];
  if (icaoPrefix && BY_ICAO.has(icaoPrefix)) return BY_ICAO.get(icaoPrefix);
  const iataPrefix = raw.match(/^([A-Z0-9]{2})(?:\d|$)/)?.[1];
  if (iataPrefix && BY_IATA.has(iataPrefix)) return BY_IATA.get(iataPrefix);
  return null;
}

export function resolveAirlineIdentity(entry = {}) {
  const explicitCandidates = [entry.icao, entry.airlineIcao, entry.iata, entry.airlineIata, entry.atcAirline, entry.airline];
  for (const candidate of explicitCandidates) {
    const direct = directCode(candidate);
    if (direct) return direct;
  }
  for (const candidate of [entry.callsign, entry.atcId, entry.flightNumber]) {
    const direct = directCode(candidate);
    if (direct) return direct;
  }
  const haystack = normalize([entry.airline, entry.atcAirline, entry.title, entry.callsign, entry.atcId].filter(Boolean).join(' '));
  if (haystack) {
    const exact = BY_NAME.get(haystack);
    if (exact) return exact;
    for (const [name, airline] of NAME_MATCHERS) {
      if (haystack.includes(name)) return airline;
    }
  }
  const rawAirline = String(entry.airline || entry.atcAirline || '').trim();
  const fallbackCode = compact(rawAirline).slice(0, 3) || compact(entry.callsign || entry.atcId).slice(0, 3) || 'AI';
  return { name: rawAirline || 'Simulator traffic', iata: '', icao: fallbackCode, logo: '' };
}

export function formatTrafficFlightNumber(entry = {}, identity = resolveAirlineIdentity(entry)) {
  const rawFlight = String(entry.flightNumber || '').trim().toUpperCase().replace(/\s+/g, '');
  if (rawFlight) {
    if (/^[A-Z0-9]{2,3}\d/.test(rawFlight)) return rawFlight;
    const prefix = identity.iata || identity.icao || '';
    return prefix ? `${prefix}${rawFlight}` : rawFlight;
  }
  const rawCallsign = String(entry.callsign || entry.atcId || '').trim().toUpperCase().replace(/\s+/g, '');
  if (rawCallsign && identity.icao && identity.iata && rawCallsign.startsWith(identity.icao)) {
    return `${identity.iata}${rawCallsign.slice(identity.icao.length)}`;
  }
  return rawCallsign || (identity.name !== 'Simulator traffic' ? identity.name : `AI-${entry.objectId ?? '—'}`);
}

export function airlineCatalogStats() { return AIRLINE_CATALOG_SOURCE; }
"""
catalog_js = (catalog_js
    .replace('__VERSION__', VERSION)
    .replace('__SOURCE_COMMIT__', SOURCE_COMMIT)
    .replace('__RECORD_COUNT__', str(len(output_records)))
    .replace('__LOGO_COUNT__', str(logo_count))
    .replace('__CATALOG_JSON__', catalog_json))
write('public/airline-catalog.js', catalog_js)

# ---------- app.js ----------
p = Path('public/app.js')
js = read(p)
js = js.replace("./i18n.js?v=1.7.10", "./i18n.js?v=1.7.11")
js = js.replace("./flight-phases.js?v=1.7.10", "./flight-phases.js?v=1.7.11")
js = js.replace("./live-traffic.js?v=1.7.10", "./live-traffic.js?v=1.7.11")
import_anchor = "import { buildLiveTrafficModel, trafficAircraftLabel, trafficPositionLabel } from './live-traffic.js?v=1.7.11';"
import_line = import_anchor + "\nimport { formatTrafficFlightNumber, resolveAirlineIdentity } from './airline-catalog.js?v=1.7.11';"
js = replace_once(js, import_anchor, import_line, 'airline catalog import')

start = js.find('const LIVE_TRAFFIC_AIRLINES = {')
end_marker = '\nfunction currentFlightboardAirport(state) {'
end = js.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('missing old live traffic airline resolver block')
replacement = '''function liveTrafficBadge(entry = {}, identity = resolveAirlineIdentity(entry)) {
  const code = identity.iata || identity.icao || 'AI';
  const image = identity.logo
    ? `<img data-airline-logo src="${escapeHtml(identity.logo)}" alt="" loading="lazy" decoding="async">`
    : '';
  return `<span class="traffic-airline-logo live-traffic-airline-badge" title="${escapeHtml(identity.name || code)}">${image}<b>${escapeHtml(code)}</b></span>`;
}
'''
js = js[:start] + replacement + js[end:]

js = replace_once(
    js,
    "    const [airlineCode, airlineName] = liveTrafficAirline(entry);",
    "    const airline = resolveAirlineIdentity(entry);\n    const flightLabel = formatTrafficFlightNumber(entry, airline);",
    'traffic airline row identity',
)
old_row = "    row.innerHTML = `<span class=\"flightboard-flight\">${liveTrafficBadge(entry)}<span><strong>${escapeHtml(entry.callsign || entry.atcId || `AI-${entry.objectId}`)}</strong><small>${escapeHtml(airlineName || airlineCode || 'Simulator traffic')}</small></span></span><b>${escapeHtml(trafficAircraftLabel(entry))}</b><span class=\"live-traffic-position\"><strong>${escapeHtml(trafficPositionLabel(entry))}</strong><small>${escapeHtml(entry.currentAirport || (entry.onGround ? 'GROUND' : 'AIRBORNE'))}</small></span><span class=\"live-traffic-motion\"><strong>${Number.isFinite(altitude) && !entry.onGround ? `${Math.round(altitude).toLocaleString(localeFor(currentLanguage))} ft` : 'GROUND'}</strong><small>${Number.isFinite(groundSpeed) ? `${Math.round(groundSpeed)} kt` : '—'}</small></span><b class=\"live-traffic-distance\">${Number.isFinite(distance) ? `${distance.toFixed(distance < 10 ? 1 : 0)} NM` : '—'}</b><em class=\"traffic-status ${escapeHtml(liveTrafficStatusClass(status.kind))}\"><span>${escapeHtml(status.label || 'UNKNOWN')}</span><small>${status.inferred ? 'INFERRED' : 'REPORTED'}</small></em>`;"
new_row = "    row.innerHTML = `<span class=\"flightboard-flight\">${liveTrafficBadge(entry, airline)}<span><strong>${escapeHtml(flightLabel)}</strong><small>${escapeHtml(airline.name || airline.iata || airline.icao || 'Simulator traffic')}</small></span></span><b>${escapeHtml(trafficAircraftLabel(entry))}</b><span class=\"live-traffic-position\"><strong>${escapeHtml(trafficPositionLabel(entry))}</strong><small>${escapeHtml(entry.currentAirport || (entry.onGround ? 'GROUND' : 'AIRBORNE'))}</small></span><span class=\"live-traffic-motion\"><strong>${Number.isFinite(altitude) && !entry.onGround ? `${Math.round(altitude).toLocaleString(localeFor(currentLanguage))} ft` : 'GROUND'}</strong><small>${Number.isFinite(groundSpeed) ? `${Math.round(groundSpeed)} kt` : '—'}</small></span><b class=\"live-traffic-distance\">${Number.isFinite(distance) ? `${distance.toFixed(distance < 10 ? 1 : 0)} NM` : '—'}</b><em class=\"traffic-status ${escapeHtml(liveTrafficStatusClass(status.kind))}\"><span>${escapeHtml(status.label || 'UNKNOWN')}</span><small>${status.inferred ? 'INFERRED' : 'REPORTED'}</small></em>`;\n    row.querySelector('img[data-airline-logo]')?.addEventListener('error', (event) => event.currentTarget.remove(), { once: true });"
js = replace_once(js, old_row, new_row, 'traffic row markup')
js = js.replace("navigator.serviceWorker.register('/service-worker.js?v=1.7.10'", "navigator.serviceWorker.register('/service-worker.js?v=1.7.11'")
write(p, js)

# ---------- index.html ----------
p = Path('public/index.html')
html = read(p)
html = html.replace('data-app-version="1.7.10"', 'data-app-version="1.7.11"', 1)
html = html.replace('/styles.css?v=1.7.10', '/styles.css?v=1.7.11')
html = html.replace('/si-operations.css?v=1.7.10', '/si-operations.css?v=1.7.11')
html = html.replace('/app.js?v=1.7.10', '/app.js?v=1.7.11')
html = html.replace('/si-operations.js?v=1.7.10', '/si-operations.js?v=1.7.11')
html = html.replace('id="update-version">v1.7.10', 'id="update-version">v1.7.11', 1)
html = html.replace('CURRENT v1.7.10', 'CURRENT v1.7.11', 1)
anchor = '<div class="update-changelog"><section><b>1.7.10</b>'
insert = '<div class="update-changelog"><section><b>1.7.11</b><div><strong>Complete local airline logo catalog</strong><ul><li>Ships the complete available airline/operator logo set from a pinned 1,500+ record ICAO/IATA catalog locally with the app.</li><li>Traffic resolves airline identity from ICAO/IATA codes, callsign, ATC airline, flight number and aircraft title.</li><li>Real airline logos replace generic code badges whenever a catalog logo exists; unknown traffic still receives a clean fallback badge.</li><li>Flight labels prefer IATA flight numbers such as LH123 or XQ456 when the simulator exposes enough identity data.</li><li>No external logo request is required during flight.</li></ul></div></section><section><b>1.7.10</b>'
html = replace_once(html, anchor, insert, 'in-app changelog')
write(p, html)

# ---------- CSS ----------
p = Path('public/styles.css')
css = read(p)
css += '''

/* 1.7.11 — complete local airline logo catalog */
.traffic-airline-logo { width: 46px; height: 34px; flex-basis: 46px; border-radius: 9px; }
.traffic-airline-logo img { inset: 3px; width: calc(100% - 6px); height: calc(100% - 6px); object-fit: contain; object-position: center; background: #fff; border-radius: 5px; }
.traffic-airline-logo b { max-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flightboard-flight > span:last-child > strong { font-variant-numeric: tabular-nums; }
'''
write(p, css)

# ---------- service worker ----------
p = Path('public/service-worker.js')
sw = read(p)
sw = sw.replace("const CACHE_NAME = 'flight-deck-efb-v1710';", "const CACHE_NAME = 'flight-deck-efb-v1711';")
sw = sw.replace('1.7.10', '1.7.11')
shell_anchor = "  '/live-traffic.js?v=1.7.11',"
sw = replace_once(sw, shell_anchor, shell_anchor + "\n  '/airline-catalog.js?v=1.7.11',", 'airline catalog service worker shell')
write(p, sw)

# ---------- server ----------
p = Path('src/server.mjs')
server = read(p)
server = server.replace("const APP_VERSION = '1.7.10';", "const APP_VERSION = '1.7.11';", 1)
write(p, server)

# ---------- docs ----------
p = Path('CHANGELOG.md')
changelog = read(p)
marker = '# Flight Deck EFB changelog\n\n'
section = f'''## 1.7.11 — Complete Airline Logos

- Bundles **all {logo_count} available logo files** from the pinned {len(output_records)}-record airline/operator catalog locally in the installer; no external logo service is needed during a flight.
- Resolves airline identity using **ICAO, IATA, callsign, ATC AIRLINE, flight number and aircraft title** instead of a tiny hand-maintained list.
- Shows the real airline logo when available and a deterministic code badge only for traffic that genuinely cannot be mapped to a catalog logo.
- Flight labels prefer familiar **IATA flight numbers** (for example `LH123`, `XQ456`) whenever the simulator exposes enough information.
- Catalog source is pinned to `imgmongelli/airlines-logos-dataset@{SOURCE_COMMIT}` for reproducible builds. Airline names and logos remain trademarks/property of their respective owners and are used only to identify simulated traffic.

'''
if '## 1.7.11 — Complete Airline Logos' not in changelog:
    changelog = replace_once(changelog, marker, marker + section, 'changelog header')
write(p, changelog)

p = Path('README.md')
readme = read(p)
readme = readme.replace('**Current release: 1.7.10 — Airport Focus & Taxi Readability**', '**Current release: 1.7.11 — Complete Airline Logos**', 1)
readme = readme.replace('## 1.7.10 highlights', '## 1.7.11 highlights', 1)
readme = readme.replace('Flight-Deck-EFB-Setup-1.7.10.exe', 'Flight-Deck-EFB-Setup-1.7.11.exe')
write(p, readme)

p = Path('THIRD_PARTY_NOTICES.md')
notices = read(p)
notices = notices.replace('# Third-party notices — Flight Deck EFB 1.7.10', '# Third-party notices — Flight Deck EFB 1.7.11', 1)
if '## Airline logo identification catalog' not in notices:
    notices += f'''

## Airline logo identification catalog

Flight Deck EFB 1.7.11 bundles the available airline/operator logo images and ICAO/IATA metadata from `imgmongelli/airlines-logos-dataset`, pinned to commit `{SOURCE_COMMIT}`. The repository describes its dataset under the MIT License. Airline names, logos, trade dress and trademarks remain the property of their respective owners; inclusion in Flight Deck EFB is solely for identification of simulated traffic and does not imply affiliation, sponsorship or endorsement. If a rights holder requests removal or correction, the corresponding asset can be removed from a future release.
'''
write(p, notices)

print(f'Prepared {len(output_records)} airline records with {logo_count} local logos')
