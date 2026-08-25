from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'Patch anchor missing: {label}')
    return text.replace(old, new, 1)


# Official MSFS Planned Route shapes: FsRouteIcao/IcaoValue, RunwayIdentifier,
# EnrouteLeg.fixIcao and cruiseAltitude object.
path = Path('src/route-sync-service.mjs')
text = path.read_text(encoding='utf-8')

old = '''function airportIdent(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.toUpperCase().match(/\\b[A-Z][A-Z0-9]{3}\\b/);
    return match?.[0] || upper(value, 8);
  }
  return upper(
    value.icao
      ?? value.icaoIdent
      ?? value.ident
      ?? value.icao_code
      ?? value.airportIdent
      ?? value.name,
    8,
  );
}

function runwayIdent(value) {
  if (!value) return null;
  const raw = typeof value === 'string'
    ? value
    : value.designation ?? value.ident ?? value.runway ?? value.name ?? value.number;
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toUpperCase().replace(/^RWY\\s*/, '').replace(/^RUNWAY\\s*/, '');
  const match = normalized.match(/(?:^|\\s)([0-3]?\\d(?:[LCR])?)(?:\\s|$)/);
  return match?.[1] || normalized.slice(0, 8) || null;
}
'''
new = '''function icaoIdent(value) {
  if (!value) return null;
  if (typeof value === 'string') return upper(value, 16);
  return upper(
    value.ident
      ?? value.icaoIdent
      ?? value.icao
      ?? value.icao_code
      ?? value.fixIdent
      ?? value.name,
    16,
  );
}

function airportIdent(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.toUpperCase().match(/\\b[A-Z][A-Z0-9]{3}\\b/);
    return match?.[0] || upper(value, 8);
  }
  const ident = icaoIdent(value);
  const airport = upper(value.airport ?? value.airportIdent, 8);
  // FsRouteIcao/IcaoValue airport facilities use ident; terminal/runway
  // facilities may carry the parent airport in the airport field.
  return ident || airport;
}

function runwayDesignator(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number' || /^\\d+$/.test(String(value).trim())) {
    return ({ 0: '', 1: 'L', 2: 'R', 3: 'C', 4: 'W', 5: 'A', 6: 'B' })[Number(value)] ?? '';
  }
  const normalized = String(value).trim().toUpperCase();
  return ({ NONE: '', LEFT: 'L', RIGHT: 'R', CENTER: 'C', CENTRE: 'C', WATER: 'W', L: 'L', R: 'R', C: 'C', W: 'W', A: 'A', B: 'B' })[normalized] ?? normalized.slice(0, 1);
}

function runwayIdent(value) {
  if (!value) return null;
  if (typeof value === 'object' && value.number !== undefined && value.number !== null) {
    const numeric = Number(value.number);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 36) {
      return `${String(numeric).padStart(2, '0')}${runwayDesignator(value.designator)}`;
    }
  }
  const raw = typeof value === 'string'
    ? value
    : value.designation ?? value.ident ?? value.runway ?? value.name ?? value.number;
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toUpperCase().replace(/^RWY\\s*/, '').replace(/^RUNWAY\\s*/, '');
  const match = normalized.match(/(?:^|\\s)([0-3]?\\d(?:[LCRWAB])?)(?:\\s|$)/);
  if (match?.[1]) {
    const parts = match[1].match(/^(\\d{1,2})([LCRWAB]?)$/);
    return parts ? `${parts[1].padStart(2, '0')}${parts[2]}` : match[1];
  }
  return normalized.slice(0, 8) || null;
}
'''
text = replace_once(text, old, new, 'official ICAO/runway normalization')

old = '''function waypointIdent(value, index) {
  if (!value) return null;
  if (typeof value === 'string') return upper(value, 24);
  return upper(value.ident ?? value.icaoIdent ?? value.name ?? value.fixIdent ?? value.fix ?? `WP${index + 1}`, 24);
}
'''
new = '''function waypointIdent(value, index) {
  if (!value) return null;
  if (typeof value === 'string') return upper(value, 24);
  return icaoIdent(value.fixIcao)
    || upper(value.ident ?? value.icaoIdent ?? value.name ?? value.fixIdent ?? value.fix ?? `WP${index + 1}`, 24);
}
'''
text = replace_once(text, old, new, 'official enroute fixIcao normalization')

text = replace_once(
    text,
    "    cruiseAltitude: finite(route.cruiseAltitude),",
    "    cruiseAltitude: finite(route.cruiseAltitude?.altitude ?? route.cruiseAltitude),",
    'official cruise altitude object',
)
path.write_text(text, encoding='utf-8')

# Chromium Private Network Access preflight support for the loopback native bridge.
path = Path('src/server.mjs')
text = path.read_text(encoding='utf-8')
text = replace_once(
    text,
    "        'Access-Control-Allow-Headers': 'Content-Type',\n        'Access-Control-Max-Age': '600',",
    "        'Access-Control-Allow-Headers': 'Content-Type',\n        'Access-Control-Allow-Private-Network': 'true',\n        'Access-Control-Max-Age': '600',",
    'native private-network CORS header',
)
path.write_text(text, encoding='utf-8')

# Precision wording: AvionicsRouteSync confirms the EFB broadcast event, not
# guaranteed acceptance by every third-party avionics implementation.
for filename in ['MSFS-2024-EFB-App/README.md', 'README.md']:
    path = Path(filename)
    text = path.read_text(encoding='utf-8')
    text = text.replace(
        'when MSFS reports that the EFB route was synchronized to the aircraft avionics',
        'when MSFS broadcasts the EFB route after **Sync Route To Avionics** is selected',
    )
    text = text.replace(
        'when MSFS reports the native EFB route was synchronized to avionics',
        'when MSFS broadcasts the native EFB route after **Sync Route To Avionics** is selected',
    )
    path.write_text(text, encoding='utf-8')
