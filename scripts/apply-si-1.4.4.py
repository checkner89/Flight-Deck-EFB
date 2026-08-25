from pathlib import Path
import re
import subprocess

VERSION = '1.4.4'


def sub_once(text, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'Patch failed ({label}): expected 1 match, got {count}')
    return updated


def replace_once(text, old, new, label):
    if text.count(old) != 1:
        raise SystemExit(f'Patch failed ({label}): expected 1 exact match, got {text.count(old)}')
    return text.replace(old, new, 1)


# SayIntentions API client -------------------------------------------------------
path = Path('src/sayintentions-client.mjs')
text = path.read_text(encoding='utf-8')

text = sub_once(
    text,
    r"async function fetchJson\(url, timeoutMs = 4_000\) \{.*?\n\}\n\nfunction safeHostname",
    """async function fetchJson(url, timeoutMs = 4_000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  if (!body) return {};
  try { return JSON.parse(body); } catch { return { ok: true, text: body.slice(0, 2_000) }; }
}

function normalizeAirports(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim().toUpperCase())
    .filter((value) => /^[A-Z0-9]{3,4}$/.test(value)))].slice(0, 8);
}

function safeHostname""",
    'robust JSON responses',
    re.S,
)

text = replace_once(
    text,
    '    this.apiKey = null;\n    this.sapiBaseUrl = DEFAULT_SAPI_BASE_URL;',
    '    this.apiKey = null;\n    this.currentFlightId = null;\n    this.airportDataFlightId = null;\n    this.sapiBaseUrl = DEFAULT_SAPI_BASE_URL;',
    'session fields',
)

text = replace_once(
    text,
    "        if (host) this.sapiBaseUrl = `${host}/sapi/`;",
    """        if (host) this.sapiBaseUrl = `${host}/sapi/`;
        if (this.apiKey && nextFlightId && this.airportDataFlightId !== nextFlightId) {
          this.airportDataFlightId = nextFlightId;
          this.refreshAirportData().catch(() => {});
        }""",
    'getAirport on new SI flight',
)

text = sub_once(
    text,
    r"\n\s*const publicState = this\.engine\.publicState\(\);\n\s*const needsParking = publicState\.gate && \(publicState\.gate\.lat === null \|\| publicState\.gate\.lon === null\);\n\s*if \(needsParking && this\.apiKey && Date\.now\(\) - this\.lastParkingFetch > 20_000\) \{\n\s*this\.lastParkingFetch = Date\.now\(\);\n\s*this\.#fetchParking\(\)\.catch\(\(\) => \{\}\);\n\s*\}",
    """
      if (this.apiKey && this.currentFlightId && Date.now() - this.lastParkingFetch > 20_000) {
        this.refreshParking().catch(() => {});
      }""",
    'continuous parking sync',
)

text = replace_once(
    text,
    '        const data = await fetchJson(url);\n        const entries = Array.isArray(data?.comm_history) ? data.comm_history : [];',
    """        const data = await fetchJson(url);
        const responseFlightId = data?.flight_id;
        if (responseFlightId && this.currentFlightId && String(responseFlightId) !== String(this.currentFlightId)) {
          this.currentFlightId = responseFlightId;
          this.lastCommsId = 0;
          this.allComms = [];
        } else if (responseFlightId && !this.currentFlightId) {
          this.currentFlightId = responseFlightId;
        }
        const entries = Array.isArray(data?.comm_history) ? data.comm_history : [];""",
    'comms flight scope',
)

operations_methods = """  async refreshParking() {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    this.lastParkingFetch = Date.now();
    const url = new URL('getParking', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    const parking = await fetchJson(url, 6_000);
    this.engine.applyParking(parking);
    return parking;
  }

  async refreshWeather(airports = []) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const state = this.engine.publicState();
    const normalized = normalizeAirports(airports.length ? airports : [
      state.flight?.currentAirport,
      state.flight?.origin,
      state.flight?.destination,
    ]);
    if (!normalized.length) throw new Error('Noch kein Flughafen für SI-Wetter verfügbar.');
    const url = new URL('getWX', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('icao', normalized.join(','));
    url.searchParams.set('with_comms', '1');
    const weather = await fetchJson(url, 8_000);
    this.engine.applySayIntentionsWeather(weather);
    this.lastWeatherFetch = Date.now();
    return weather;
  }

  async refreshAirportData() {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const url = new URL('getAirport', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    const airportData = await fetchJson(url, 8_000);
    this.engine.setIntegration('sayIntentions', {
      airportData,
      airportDataUpdatedAt: new Date().toISOString(),
    });
    return airportData;
  }

  async assignGate({ airport, gate } = {}) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const normalizedAirport = String(airport || '').trim().toUpperCase();
    const normalizedGate = String(gate || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{3,4}$/.test(normalizedAirport)) throw new Error('Airport muss ein gültiger 3–4-stelliger ICAO-Code sein.');
    if (!/^[A-Z0-9]{1,30}$/.test(normalizedGate)) throw new Error('Gate darf nur Buchstaben und Zahlen enthalten.');
    const url = new URL('assignGate', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('gate', normalizedGate);
    url.searchParams.set('airport', normalizedAirport);
    const result = await fetchJson(url, 8_000);
    const assignedGate = String(result?.assigned_gate_name || normalizedGate).trim();
    this.engine.applyParking({ parking: { name: assignedGate } });
    this.lastParkingFetch = 0;
    let parking = null;
    try { parking = await this.refreshParking(); } catch { /* SI may publish coordinates a moment later. */ }
    this.refreshAirportData().catch(() => {});
    return { ...result, assigned_gate_name: assignedGate, parking: parking?.parking ?? parking ?? null };
  }

  async setPaused(paused) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const value = Boolean(paused);
    const url = new URL('setPause', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('value', value ? '1' : '0');
    const result = await fetchJson(url, 6_000);
    this.engine.setIntegration('sayIntentions', {
      paused: value,
      pauseUpdatedAt: new Date().toISOString(),
    });
    return result;
  }

  async sayAs({ channel = 'COM1', message = '' } = {}) {
    if (!this.apiKey) throw new Error('SayIntentions ist noch nicht mit einem aktiven Flug verbunden.');
    const normalizedChannel = String(channel || '').trim().toUpperCase();
    if (!['COM1', 'COM2'].includes(normalizedChannel)) {
      throw new Error('Im EFB sind nur Pilot→ATC Nachrichten über COM1 oder COM2 freigegeben.');
    }
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage || normalizedMessage.length > 255) throw new Error('Nachricht muss 1 bis 255 Zeichen lang sein.');
    const url = new URL('sayAs', this.sapiBaseUrl);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('channel', normalizedChannel);
    url.searchParams.set('message', normalizedMessage);
    return fetchJson(url, 8_000);
  }

  async #pollOperations"""

text = sub_once(
    text,
    r"  async #fetchParking\(\) \{.*?\n  \}\n\n  async #pollOperations",
    operations_methods,
    'SI operations methods',
    re.S,
)

path.write_text(text, encoding='utf-8')


# State engine: accept gate name before coordinates -----------------------------
path = Path('src/state-engine.mjs')
text = path.read_text(encoding='utf-8')
text = sub_once(
    text,
    r"  applyParking\(parking\) \{.*?\n  \}\n\n  applyComms\(comms\)",
    """  applyParking(parking) {
    const value = parking?.parking ?? parking;
    const lat = numberOrNull(value?.lat);
    const lon = numberOrNull(value?.lon);
    const heading = numberOrNull(value?.heading);
    const name = textOrEmpty(value?.name, value?.id, this.state.gate?.name) || null;
    if (lat === null && lon === null && !name) return;
    this.state.gate = {
      name: name || 'Gate',
      lat: lat ?? this.state.gate?.lat ?? null,
      lon: lon ?? this.state.gate?.lon ?? null,
      heading: heading ?? this.state.gate?.heading ?? null,
    };
    this.#touch();
  }

  applyComms(comms)""",
    'gate state update',
    re.S,
)
path.write_text(text, encoding='utf-8')


# Local server routes -----------------------------------------------------------
path = Path('src/server.mjs')
text = path.read_text(encoding='utf-8')

routes = """      if (pathname === '/api/sayintentions/gate' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!sayIntentions) return json(response, 409, { error: 'SayIntentions-Connector ist im Demo-Modus nicht aktiv.' });
        try {
          const body = await readJsonBody(request);
          const result = await sayIntentions.assignGate({ airport: body.airport, gate: body.gate });
          return json(response, 200, {
            applied: true,
            assignedGate: result?.assigned_gate_name || body.gate || null,
            result,
            state: engine.publicState(),
          });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

      if (pathname === '/api/sayintentions/parking/refresh' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!sayIntentions) return json(response, 409, { error: 'SayIntentions-Connector ist im Demo-Modus nicht aktiv.' });
        try {
          const parking = await sayIntentions.refreshParking();
          return json(response, 200, { parking, state: engine.publicState() });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

      if (pathname === '/api/sayintentions/airport/refresh' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!sayIntentions) return json(response, 409, { error: 'SayIntentions-Connector ist im Demo-Modus nicht aktiv.' });
        try {
          const airport = await sayIntentions.refreshAirportData();
          return json(response, 200, { airport, state: engine.publicState() });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

      if (pathname === '/api/sayintentions/pause' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!sayIntentions) return json(response, 409, { error: 'SayIntentions-Connector ist im Demo-Modus nicht aktiv.' });
        try {
          const body = await readJsonBody(request);
          const paused = Boolean(body.paused);
          const result = await sayIntentions.setPaused(paused);
          return json(response, 200, { paused, result, state: engine.publicState() });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

      if (pathname === '/api/sayintentions/say' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        if (!sayIntentions) return json(response, 409, { error: 'SayIntentions-Connector ist im Demo-Modus nicht aktiv.' });
        try {
          const body = await readJsonBody(request);
          const result = await sayIntentions.sayAs({ channel: body.channel, message: body.message });
          return json(response, 200, { sent: true, channel: String(body.channel || '').toUpperCase(), result });
        } catch (error) {
          return json(response, 422, { error: error.message });
        }
      }

"""
text = replace_once(
    text,
    "      if (pathname === '/api/com' && request.method === 'POST') {",
    routes + "      if (pathname === '/api/com' && request.method === 'POST') {",
    'local SI API routes',
)

weather_route = """      if (pathname === '/api/weather/refresh' && request.method === 'POST') {
        if (!authenticated) return json(response, 401, { error: 'Pairing erforderlich.' });
        const body = await readJsonBody(request);
        const source = ['auto', 'sayintentions', 'aviationweather'].includes(String(body.source || '').toLowerCase())
          ? String(body.source).toLowerCase() : 'auto';
        try {
          if (source === 'sayintentions') {
            if (!sayIntentions) return json(response, 409, { error: 'SayIntentions-Connector ist im Demo-Modus nicht aktiv.' });
            const weather = await sayIntentions.refreshWeather(body.airports);
            return json(response, 200, { source, weather, state: engine.publicState() });
          }
          if (source === 'aviationweather') {
            const weather = await aviationWeather.refresh(body.airports, { force: true });
            return json(response, 200, { source, weather, state: engine.publicState() });
          }
          const tasks = [aviationWeather.refresh(body.airports, { force: true })];
          if (sayIntentions) tasks.push(sayIntentions.refreshWeather(body.airports));
          const results = await Promise.allSettled(tasks);
          if (!results.some((result) => result.status === 'fulfilled')) {
            const reason = results.find((result) => result.status === 'rejected')?.reason;
            throw reason || new Error('Keine Wetterquelle konnte aktualisiert werden.');
          }
          return json(response, 200, {
            source: 'auto',
            weather: {
              aviationWeather: engine.publicState().integrations?.aviationWeather || null,
              sayIntentions: engine.publicState().integrations?.sayIntentions?.weather || null,
            },
            state: engine.publicState(),
          });
        } catch (error) {
          return json(response, 502, { error: error.message });
        }
      }

      if (pathname === '/api/gsx/refresh'"""
text = sub_once(
    text,
    r"      if \(pathname === '/api/weather/refresh' && request\.method === 'POST'\) \{.*?\n      \}\n\n      if \(pathname === '/api/gsx/refresh'",
    weather_route,
    'source-aware weather route',
    re.S,
)
path.write_text(text, encoding='utf-8')


# Front-end asset/version wiring ------------------------------------------------
path = Path('public/index.html')
text = path.read_text(encoding='utf-8')
text = re.sub(r'data-app-version="[0-9.]+"', f'data-app-version="{VERSION}"', text, count=1)
text = re.sub(r'/styles\.css\?v=[0-9.]+', f'/styles.css?v={VERSION}', text)
text = re.sub(r'/app\.js\?v=[0-9.]+', f'/app.js?v={VERSION}', text)
text = re.sub(r'>v1\.4\.[0-9]+<', f'>v{VERSION}<', text)
if '/si-operations.css' not in text:
    text = text.replace('</head>', f'    <link rel="stylesheet" href="/si-operations.css?v={VERSION}">\n  </head>', 1)
if '/si-operations.js' not in text:
    text = text.replace('</body>', f'    <script type="module" src="/si-operations.js?v={VERSION}"></script>\n  </body>', 1)
path.write_text(text, encoding='utf-8')

path = Path('public/app.js')
text = path.read_text(encoding='utf-8')
text = re.sub(r'(\./(?:i18n|flight-phases)\.js\?v=)[0-9.]+', rf'\g<1>{VERSION}', text)
path.write_text(text, encoding='utf-8')

path = Path('public/service-worker.js')
text = path.read_text(encoding='utf-8')
text = re.sub(r"const CACHE_NAME = '[^']+';", "const CACHE_NAME = 'flight-deck-efb-v144';", text, count=1)
text = re.sub(r'\?v=[0-9.]+', f'?v={VERSION}', text)
if f"'/si-operations.css?v={VERSION}'" not in text:
    text = text.replace(f"  '/styles.css?v={VERSION}',", f"  '/styles.css?v={VERSION}',\n  '/si-operations.css?v={VERSION}',", 1)
if f"'/si-operations.js?v={VERSION}'" not in text:
    text = text.replace(f"  '/app.js?v={VERSION}',", f"  '/app.js?v={VERSION}',\n  '/si-operations.js?v={VERSION}',", 1)
path.write_text(text, encoding='utf-8')


# Release checks and notes ------------------------------------------------------
path = Path('.github/workflows/release.yml')
text = path.read_text(encoding='utf-8')
if 'node --check public/si-operations.js' not in text:
    text = text.replace('          node --check public/app.js\n', '          node --check public/app.js\n          node --check public/si-operations.js\n', 1)
text = re.sub(
    r'gh release create \$tag @assets --repo \$repo --title "Flight Deck EFB \$version" --notes ".*?" --verify-tag',
    'gh release create $tag @assets --repo $repo --title "Flight Deck EFB $version" --notes "Flight Deck EFB $version. SayIntentions operations update: selectable SI/AviationWeather weather source, continuous SI parking sync, explicit gate assignment, SI airport-data refresh, guarded ATC pause/resume and pilot COM1/COM2 text transmission. Flight simulation use only — not for real-world navigation." --verify-tag',
    text,
)
path.write_text(text, encoding='utf-8')


# Changelog --------------------------------------------------------------------
path = Path('CHANGELOG.md')
changelog = path.read_text(encoding='utf-8')
entry = """## 1.4.4 — SayIntentions operations

- Selectable weather source: Auto, SayIntentions or AviationWeather.gov.
- Continuous SayIntentions parking synchronization, including assignments that appear after arrival.
- Explicit gate assignment through the SI `assignGate` session endpoint with immediate parking refresh.
- SI `getAirport` synchronization for active-flight airport operations data.
- Guarded SI ATC pause/resume controls.
- Explicit pilot text transmission to SI over COM1/COM2 via `sayAs`; inbound/spoofed channels are intentionally not exposed.
- Existing SI comms history, frequencies and weather polling remain active.
- VATSIM stays on the independent network connector; broad `setVar` access is intentionally not exposed.

"""
if '## 1.4.4 — SayIntentions operations' not in changelog:
    first, sep, rest = changelog.partition('\n')
    changelog = first + '\n\n' + entry + rest.lstrip('\n') if sep else entry + changelog
path.write_text(changelog, encoding='utf-8')


# Keep package.json and package-lock.json in sync -------------------------------
subprocess.run(['npm', 'version', VERSION, '--no-git-tag-version'], check=True)
print('SayIntentions 1.4.4 patch applied.')
