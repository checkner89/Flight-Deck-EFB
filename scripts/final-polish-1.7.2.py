from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# Flightboard fallback/classification: keep all nearby traffic eligible for filtered views,
# then classify by schedule/current state. Use the board airport as a conservative known-side fallback.
app_path = Path('public/app.js')
app = app_path.read_text(encoding='utf-8')
app = replace_once(app,
"""function trafficRouteFields(entry = {}) {
  const state = normalizedTrafficState(entry.state);
  const current = String(entry.currentAirport || '').toUpperCase();
  let origin = String(entry.origin || '').toUpperCase();
  let destination = String(entry.destination || '').toUpperCase();
  if (!origin && current && /startup|preflight|clearance|push|taxi out|takeoff|depart|taxi/.test(state)) origin = current;
  if (!destination && current && /landing|approach|rollout|taxi in/.test(state)) destination = current;
  if (!origin && entry.onGround && current) origin = current;
  return { origin: origin || '—', destination: destination || '—' };
}
""",
"""function trafficRouteFields(entry = {}, boardAirport = '') {
  const state = normalizedTrafficState(entry.state);
  const airport = String(boardAirport || '').toUpperCase();
  const current = String(entry.currentAirport || '').toUpperCase();
  let origin = String(entry.origin || '').toUpperCase();
  let destination = String(entry.destination || '').toUpperCase();
  const knownAirport = current || airport;
  const arrivalState = /landing|approach|rollout|taxi in/.test(state);
  if (!origin && knownAirport && !arrivalState && (entry.onGround || /startup|preflight|clearance|push|taxi out|takeoff|depart|taxi/.test(state))) origin = knownAirport;
  if (!destination && knownAirport && arrivalState) destination = knownAirport;
  return { origin: origin || '—', destination: destination || '—' };
}
""", 'route fields board fallback')
app = replace_once(app,
"""  const airportTraffic = airport ? all.filter((entry) => trafficMatchesAirport(entry, airport)) : all;
  const candidates = trafficBoardView === 'all' || !airport ? all : airportTraffic;
  const visible = candidates.filter((entry) => trafficMatchesView(entry, airport));
""",
"""  const airportTraffic = airport ? all.filter((entry) => trafficMatchesAirport(entry, airport)) : all;
  const candidates = trafficBoardView === 'all' ? all : (airportTraffic.length ? [...new Map([...airportTraffic, ...all].map((entry) => [entry.objectId ?? entry.callsign, entry])).values()] : all);
  const visible = candidates.filter((entry) => trafficMatchesView(entry, airport));
""", 'flightboard candidate pool')
app = replace_once(app,
"""  if (trafficBoardView === 'departures') {
    return String(entry.origin || '').toUpperCase() === airport
      || (entry.onGround && String(entry.currentAirport || '').toUpperCase() === airport && !/landing|rollout|taxi in/.test(state))
      || /startup|preflight|clearance|push|taxi out|takeoff|depart/.test(state);
  }
""",
"""  if (trafficBoardView === 'departures') {
    return String(entry.origin || '').toUpperCase() === airport
      || (entry.onGround && !/landing|rollout|taxi in/.test(state))
      || /startup|preflight|clearance|push|taxi out|takeoff|depart/.test(state);
  }
""", 'departures fallback')
app = app.replace('const route = trafficRouteFields(entry);', 'const route = trafficRouteFields(entry, airport);', 1)
app_path.write_text(app, encoding='utf-8')

# German UI: keep established aviation terms in English.
i18n_path = Path('public/i18n.js')
i18n = i18n_path.read_text(encoding='utf-8')
terms = {
    "allTraffic: 'ALLE'": "allTraffic: 'ALL'",
    "departures: 'ABFLÜGE'": "departures: 'DEPARTURES'",
    "arrivals: 'ANKÜNFTE'": "arrivals: 'ARRIVALS'",
    "airportFilter: 'FLUGHAFENFILTER'": "airportFilter: 'AIRPORT FILTER'",
    "trafficParked: 'GEPARKT'": "trafficParked: 'PARKING'",
    "trafficPreparing: 'VORBEREITUNG'": "trafficPreparing: 'PREFLIGHT'",
    "trafficPushback: 'PUSHBACK'": "trafficPushback: 'PUSHBACK'",
    "trafficTaxiOut: 'ROLLT ZUM START'": "trafficTaxiOut: 'TAXI OUT'",
    "trafficDeparting: 'STARTET'": "trafficDeparting: 'DEPARTURE'",
    "trafficEnroute: 'UNTERWEGS'": "trafficEnroute: 'ENROUTE'",
    "trafficLanding: 'LANDET'": "trafficLanding: 'LANDING'",
    "trafficRollout: 'AUSROLLEN'": "trafficRollout: 'ROLLOUT'",
    "trafficTaxiIn: 'ROLLT ZUM STAND'": "trafficTaxiIn: 'TAXI IN'",
    "trafficTaxi: 'ROLLT'": "trafficTaxi: 'TAXI'",
    "trafficUnknown: 'UNBEKANNT'": "trafficUnknown: 'UNKNOWN'",
}
for old, new in terms.items():
    if old in i18n:
        i18n = i18n.replace(old, new, 1)
i18n_path.write_text(i18n, encoding='utf-8')

# SI/ATC messages tab should occupy the full content width and never inherit the clearance grid offset.
css_path = Path('public/styles.css')
css = css_path.read_text(encoding='utf-8')
if '/* 1.7.2 SI alignment */' not in css:
    css += '''\n\n/* 1.7.2 SI alignment */\n.atc-messages-card { grid-column: 1 / -1 !important; width: 100%; max-width: none; }\n.atc-messages-card .section-title { align-items: flex-start; flex-wrap: wrap; }\n.atc-messages-card .message-view-selector { margin-left: auto; flex: 0 0 auto; }\n.atc-message-list { width: 100%; }\n.atc-message-list > * { box-sizing: border-box; width: 100%; max-width: 100%; }\n@media (max-width: 760px) {\n  .atc-messages-card .message-view-selector { width: 100%; margin-left: 0; }\n  .atc-messages-card .message-view-selector button { flex: 1 1 0; }\n}\n'''
css_path.write_text(css, encoding='utf-8')

# Changelog wording.
change_path = Path('CHANGELOG.md')
change = change_path.read_text(encoding='utf-8')
needle = '- Improved Departures / Arrivals classification when schedule data is incomplete.\n'
extra = '- Uses the active Flightboard airport as a known-side fallback for schedule-less nearby ground traffic, without inventing an unknown destination.\n- Fixed SayIntentions Messages tab alignment so it uses the full ATC workspace width instead of inheriting the clearance two-column offset.\n'
if extra not in change:
    change = replace_once(change, needle, needle + extra, 'final changelog polish')
change_path.write_text(change, encoding='utf-8')
