from pathlib import Path
import html as html_lib
import json
import os
import re
import shutil

ROOT = Path('.')
SOURCE = Path(os.environ['AIRLINE_SOURCE'])
SOURCE_2 = Path(os.environ['AIRLINE_SOURCE_2'])
VERSION = '1.7.11'
SOURCE_COMMIT = '7b001fb8d5d0a2f875d57b2b5a8a8056b2fbc63a'
SOURCE_2_COMMIT = '8c5f1ae3d25538bd1b649a7ad85b902528c612b6'


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch target: {label}')
    return text.replace(old, new, 1)


def clean_code(value):
    return re.sub(r'[^A-Z0-9]', '', str(value or '').upper())


def record_key(item):
    icao = clean_code(item.get('icao_code') or item.get('icao'))
    iata = clean_code(item.get('iata_code') or item.get('iata'))
    name = re.sub(r'[^A-Z0-9]+', '', str(item.get('name') or '').upper())
    if icao:
        return f'ICAO:{icao}'
    if iata:
        return f'IATA:{iata}'
    return f'NAME:{name}'


def make_generated_icon(path, code, name):
    safe_code = html_lib.escape(code or 'AI')
    safe_name = html_lib.escape(name or 'Airline')
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="{safe_name}">
  <rect width="200" height="200" rx="34" fill="#ffffff"/>
  <rect x="5" y="5" width="190" height="190" rx="29" fill="none" stroke="#b9c9d1" stroke-width="10"/>
  <path d="M42 112h116M100 46v108" stroke="#16a79d" stroke-width="12" stroke-linecap="round" opacity=".18"/>
  <text x="100" y="118" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="54" font-weight="800" fill="#173846">{safe_code[:4]}</text>
</svg>'''
    path.write_text(svg, encoding='utf-8')


# ---------- Merge broad airline/operator catalogs ----------
primary_payload = json.loads((SOURCE / 'airlines.json').read_text(encoding='utf-8'))
primary_records = primary_payload.get('data', [])
secondary_records = json.loads((SOURCE_2 / 'airlines.json').read_text(encoding='utf-8'))
if len(primary_records) < 1500:
    raise SystemExit(f'primary airline catalog unexpectedly small: {len(primary_records)} records')
if len(secondary_records) < 1000:
    raise SystemExit(f'secondary airline catalog unexpectedly small: {len(secondary_records)} records')

combined = {}
for item in secondary_records:
    key = record_key(item)
    combined[key] = {
        'name': str(item.get('name') or '').strip(),
        'iata': clean_code(item.get('iata_code')),
        'icao': clean_code(item.get('icao_code')),
    }
for item in primary_records:
    key = record_key(item)
    current = combined.get(key, {})
    combined[key] = {
        'name': str(item.get('name') or current.get('name') or '').strip(),
        'iata': clean_code(item.get('iata_code')) or current.get('iata', ''),
        'icao': clean_code(item.get('icao_code')) or current.get('icao', ''),
    }

# Cross-link records that share the same ICAO/IATA so lookups stay deterministic.
by_icao = {}
by_iata = {}
for item in combined.values():
    if item['icao']:
        by_icao.setdefault(item['icao'], item)
    if item['iata']:
        by_iata.setdefault(item['iata'], item)
for item in combined.values():
    if item['icao'] and item['icao'] in by_icao:
        canonical = by_icao[item['icao']]
        canonical['iata'] = canonical['iata'] or item['iata']
        canonical['name'] = canonical['name'] or item['name']
    if item['iata'] and item['iata'] in by_iata:
        canonical = by_iata[item['iata']]
        canonical['icao'] = canonical['icao'] or item['icao']
        canonical['name'] = canonical['name'] or item['name']

# Primary logos are keyed by ICAO; secondary v2 logos are keyed by IATA.
primary_logo_by_icao = {}
for item in primary_records:
    icao = clean_code(item.get('icao_code'))
    source_logo = item.get('logo')
    if not icao or not source_logo:
        continue
    candidate = SOURCE / str(source_logo).replace('./', '')
    if candidate.is_file():
        primary_logo_by_icao[icao] = candidate

secondary_logo_dir = SOURCE_2 / 'airlines-logo' / '200x200_v2'

logo_dir = ROOT / 'public' / 'assets' / 'airlines'
if logo_dir.exists():
    shutil.rmtree(logo_dir)
logo_dir.mkdir(parents=True, exist_ok=True)

output_records = []
official_logo_count = 0
generated_icon_count = 0
seen = set()
for item in sorted(combined.values(), key=lambda row: (row['icao'] or 'ZZZ', row['iata'] or 'ZZ', row['name'])):
    icao = item['icao']
    iata = item['iata']
    name = item['name']
    dedupe = (icao, iata, name)
    if dedupe in seen or not any(dedupe):
        continue
    seen.add(dedupe)

    file_stem = icao or (f'IATA_{iata}' if iata else f'NAME_{len(output_records):05d}')
    logo_path = ''
    logo_kind = 'generated'

    primary_logo = primary_logo_by_icao.get(icao)
    secondary_logo = secondary_logo_dir / f'{iata}.png' if iata else None
    if primary_logo and primary_logo.is_file():
        target = logo_dir / f'{file_stem}{primary_logo.suffix.lower()}'
        shutil.copy2(primary_logo, target)
        logo_path = f'/assets/airlines/{target.name}'
        logo_kind = 'official'
        official_logo_count += 1
    elif secondary_logo and secondary_logo.is_file():
        target = logo_dir / f'{file_stem}.png'
        shutil.copy2(secondary_logo, target)
        logo_path = f'/assets/airlines/{target.name}'
        logo_kind = 'official'
        official_logo_count += 1
    else:
        target = logo_dir / f'{file_stem}.svg'
        make_generated_icon(target, iata or icao or 'AI', name)
        logo_path = f'/assets/airlines/{target.name}'
        generated_icon_count += 1

    output_records.append({
        'name': name,
        'iata': iata,
        'icao': icao,
        'logo': logo_path,
        'logoKind': logo_kind,
    })

if len(output_records) < 1500:
    raise SystemExit(f'merged airline catalog unexpectedly small: {len(output_records)} records')
if official_logo_count < 900:
    raise SystemExit(f'official airline logo catalog unexpectedly small: {official_logo_count} logos')
if official_logo_count + generated_icon_count != len(output_records):
    raise SystemExit('not every airline record received a local icon')

metadata = {
    'sources': [
        {'repository': 'imgmongelli/airlines-logos-dataset', 'commit': SOURCE_COMMIT},
        {'repository': 'spydogenesis/airlines-logo', 'commit': SOURCE_2_COMMIT},
    ],
    'recordCount': len(output_records),
    'officialLogoCount': official_logo_count,
    'generatedIconCount': generated_icon_count,
    'iconCount': len(output_records),
    'records': output_records,
}
write('public/data/airlines.json', json.dumps(metadata, ensure_ascii=False, separators=(',', ':')))

catalog_json = json.dumps(output_records, ensure_ascii=False, separators=(',', ':'))
catalog_js = r"""// Generated for Flight Deck EFB __VERSION__.
// Airline names/logos are trademarks of their respective owners and are used for identification only.
export const AIRLINE_CATALOG_SOURCE = Object.freeze({ records: __RECORD_COUNT__, logos: __ICON_COUNT__, officialLogos: __OFFICIAL_COUNT__, generatedIcons: __GENERATED_COUNT__ });

const AIRLINES = __CATALOG_JSON__;
const normalize = (value = '') => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const compact = (value = '') => normalize(value).replace(/\s+/g, '');
const BY_ICAO = new Map();
const BY_IATA = new Map();
const BY_NAME = new Map();
for (const airline of AIRLINES) {
  if (airline.icao && !BY_ICAO.has(airline.icao)) BY_ICAO.set(airline.icao, airline);
  if (airline.iata && !BY_IATA.has(airline.iata)) BY_IATA.set(airline.iata, airline);
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
  return { name: rawAirline || 'Simulator traffic', iata: '', icao: fallbackCode, logo: '', logoKind: 'unknown' };
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
    .replace('__RECORD_COUNT__', str(len(output_records)))
    .replace('__ICON_COUNT__', str(len(output_records)))
    .replace('__OFFICIAL_COUNT__', str(official_logo_count))
    .replace('__GENERATED_COUNT__', str(generated_icon_count))
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
insert = '<div class="update-changelog"><section><b>1.7.11</b><div><strong>Complete local airline icon catalog</strong><ul><li>Merges two broad ICAO/IATA airline catalogs and ships every resulting airline/operator with a local icon.</li><li>Real airline logos are used whenever either pinned source provides one; records without an available official image receive a clean local code icon instead of a broken or empty placeholder.</li><li>Traffic resolves airline identity from ICAO/IATA codes, callsign, ATC airline, flight number and aircraft title.</li><li>Flight labels prefer IATA flight numbers such as LH123 or XQ456 when the simulator exposes enough identity data.</li><li>No external logo request is required during flight.</li></ul></div></section><section><b>1.7.10</b>'
html = replace_once(html, anchor, insert, 'in-app changelog')
write(p, html)

# ---------- CSS ----------
p = Path('public/styles.css')
css = read(p)
css += '''

/* 1.7.11 — complete local airline icon catalog */
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
section = f'''## 1.7.11 — Complete Airline Icons

- Merges two pinned ICAO/IATA catalogs and ships **an icon for every one of the {len(output_records)} airline/operator records** in the resulting local catalog.
- Uses **{official_logo_count} supplied airline logo images** where available; the remaining **{generated_icon_count} records** get a deterministic local code icon so the Traffic UI never has a missing/broken airline icon.
- Resolves airline identity using **ICAO, IATA, callsign, ATC AIRLINE, flight number and aircraft title** instead of a tiny hand-maintained list.
- Flight labels prefer familiar **IATA flight numbers** (for example `LH123`, `XQ456`) whenever the simulator exposes enough information.
- Sources are pinned to `imgmongelli/airlines-logos-dataset@{SOURCE_COMMIT}` and `spydogenesis/airlines-logo@{SOURCE_2_COMMIT}` for reproducible builds. Airline names and logos remain trademarks/property of their respective owners and are used only to identify simulated traffic.

'''
if '## 1.7.11 — Complete Airline Icons' not in changelog:
    changelog = replace_once(changelog, marker, marker + section, 'changelog header')
write(p, changelog)

p = Path('README.md')
readme = read(p)
readme = readme.replace('**Current release: 1.7.10 — Airport Focus & Taxi Readability**', '**Current release: 1.7.11 — Complete Airline Icons**', 1)
readme = readme.replace('## 1.7.10 highlights', '## 1.7.11 highlights', 1)
readme = readme.replace('Flight-Deck-EFB-Setup-1.7.10.exe', 'Flight-Deck-EFB-Setup-1.7.11.exe')
write(p, readme)

p = Path('THIRD_PARTY_NOTICES.md')
notices = read(p)
notices = notices.replace('# Third-party notices — Flight Deck EFB 1.7.10', '# Third-party notices — Flight Deck EFB 1.7.11', 1)
if '## Airline logo identification catalogs' not in notices:
    notices += f'''

## Airline logo identification catalogs

Flight Deck EFB 1.7.11 uses ICAO/IATA metadata and available airline/operator logo images from `imgmongelli/airlines-logos-dataset` pinned to `{SOURCE_COMMIT}`, supplemented by the `spydogenesis/airlines-logo` collection pinned to `{SOURCE_2_COMMIT}`. The first repository describes its dataset under the MIT License; the second explicitly notes that airline logos remain the property of their respective airlines. Flight Deck EFB uses these marks solely to identify simulated traffic and does not claim ownership, affiliation, sponsorship or endorsement. When neither source contains an image, Flight Deck EFB generates a neutral local code icon rather than reproducing another third-party mark. Rights holders can request correction or removal in a future release.
'''
write(p, notices)

print(f'Prepared {len(output_records)} airline/operator records: {official_logo_count} supplied logos + {generated_icon_count} generated fallback icons')
