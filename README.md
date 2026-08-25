# Flight Deck EFB 1.5.0

Flight Deck EFB is a native Windows host and responsive companion EFB for Microsoft
Flight Simulator 2020/2024. Its Taxi module draws assigned or planned routes
over a purpose-built airport vector map and mirrors the complete EFB to iPad,
iPhone, and Android devices on the local network.

> Flight simulation use only — not for real-world navigation.

Copyright © 2026 Christoph Heckner. The application code is distributed under
the included MIT License. `THIRD-PARTY-NOTICES.md` preserves required data,
runtime and dependency notices; `PRIVACY.md` documents local storage and every
optional external connection. Product names remain the property of their
respective owners and identify compatibility only.

## Features

- **Flight Journey Hub** automatically derives ten operational phases from
  SayIntentions and MSFS, while retaining a manual phase override. Each phase
  surfaces the most useful apps, live progress/ETA/fuel/weather, automatic and
  manual readiness checks, and a persistent flight scratchpad.
- Operational readiness summarizes open phase items, while the OUT/OFF/ON/IN
  timeline combines SimBrief schedule data with actual and predicted times.
  A SimBrief-based landing-fuel and reserve-margin estimate adds configurable
  visual or vibration alerts without replacing aircraft performance planning.
- **Focus Mode** keeps the active phase, readiness, progress, checklist, and
  timeline visible while hiding secondary Flight cards.
- The Home launcher can be personalized per device: reorder applications,
  hide optional apps, choose Airliner/GA/Online starting profiles, configure
  units and operational alert thresholds, and show or hide the compact phase
  card. Flight and Settings always remain accessible.
- MSFS-style EFB home screen with touch-friendly applications: Taxi,
  Taxi Planning, Flight/SimBrief, Flight Tracking, SI Briefing, ATC Center,
  COM, Simulator Flightboard, Ground Services, Fenix Remote EFB,
  Automations, and Settings. ATC Center combines the selected ATC provider,
  VATSIM/IVAO information and an optional complete SayIntentions message view.
  Each application opens in its own full EFB view
  and the **APPS** control returns to the launcher.
- Persistent Light, Dark, or System theme; Compact, Standard, or Large text;
  German, English, French, Spanish, Italian, or Dutch UI.
- A three-step first-run assistant configures language, theme, readable text
  size, pilot profile, the persistent SimBrief ID, automatic OFP import and
  connection diagnostics. A secret-free support file and local backup/restore
  cover preferences, safe automation rules and the complete flight archive.
- **Flight Tracking** records the real flown track, every coordinate-bearing
  SimBrief navlog waypoint, MSFS altitude/AGL/speed/heading/fuel/wind/temperature
  and aircraft-configuration telemetry, weather snapshots, phase notes,
  checklist state, and the ATC timeline. Flights remain available in a persistent
  archive after restarting the app and can be reopened on Windows, iPad, or
  Android.
- Switchable OpenStreetMap and satellite background layers, planned-route and
  actual-track overlays, aircraft follow mode, complete-flight fit, waypoint
  popups, stored METAR/ATIS, and GPX/JSON export.
- **New Flight** first saves the active recording, then safely clears stale
  route, clearance, gate, hold-short, planning, and SimBrief state while
  preserving preferences, setup, and the flight archive.
- Selectable ATC source: Automatic, SayIntentions, BeyondATC compatibility, or
  manually pasted clearance.
- Reads BeyondATC's local log files in an opt-in compatibility mode and extracts
  the newest taxi/hold-short instruction. No data is sent to BeyondATC.
- Implements Navigraph Device Login when approved developer credentials are
  configured. Standalone chart display remains external as required by the
  Navigraph chart license.
- Detects a local GSX Pro installation and reports SimConnect/Couatl readiness;
  service actions stay in the native GSX/Fenix workflow because no general
  external GSX control API is documented.
- Imports the latest SimBrief OFP using a Pilot ID or username without asking
  for a SimBrief password. Optional automatic import preloads the destination
  airport map and official METAR/TAF from AviationWeather.gov.
- Opens or embeds the official Fenix Remote EFB exposed by the running Fenix
  A32X on local port 8083.
- **Automations** can monitor explicitly configured SimVars and aircraft-specific
  L:/Z: variables, then run a one-shot SimConnect event or allowlisted variable
  write when a flight phase is entered, an EFB app such as Ground is opened, or
  a numeric condition changes from false to true. Test/log mode is the default;
  Armed mode requires an explicit confirmation, applies per-rule cooldowns, and
  records the audit trail with the flight. Fenix variable names must come from
  the aircraft/version documentation because Flight Deck EFB does not guess or
  ship an unofficial Fenix variable catalog.
- Shows relevant controllers, frequencies, and ATIS from VATSIM or IVAO on
  explicit request, read-only.
- **COM** displays COM1/COM2 active and standby frequencies from MSFS and can
  set, swap, receive-select, or transmit-select them. Relevant SI, VATSIM and
  IVAO frequencies appear as one-tap presets; changing an active frequency
  requires an additional confirmation.
- **Simulator Flightboard** lists the AI, live and add-on traffic currently
  exposed by MSFS SimConnect. Departures and arrivals can be filtered for the
  relevant airport, while operational labels such as parked, taxi out,
  departing, landing and taxi in are derived from simulator state. It does not
  depend on a SayIntentions traffic endpoint.
- **Little Navmap** can be detected through its local WebAPI (`127.0.0.1:8965/api`)
  when the Little Navmap web server is enabled. Flight Deck uses the documented
  simulator and airport-information endpoints as an optional cross-check and
  metadata source; Little Navmap is never required for the core MSFS connection.
- **Online Networks** can additionally normalize relevant VATSIM/IVAO pilots
  whose flight plans involve the active airports or whose position is near the
  user aircraft, alongside the existing controller and ATIS view.

- Reads `taxi_path`, airport, runway, gate, and flight data from the local
  SayIntentions `flightJSON` endpoint.
- Draws the assigned route automatically as a high-contrast cyan line.
- Shows aircraft position, true heading, and ground speed through SimConnect.
- Displays the latest relevant taxi or hold-short clearance from SAPI.
- Reconstructs a route from the named taxiways in an SI clearance when the
  local `taxi_path` has not arrived yet, and labels that route as inferred.
- Marks the assigned gate and available hold-short points.
- Warns after the aircraft remains more than 35 m off route for 2.5 seconds.
- Prefers the taxi-name, taxi-point, parking, hold-short, jetway and VDGS data
  from the current MSFS airport facility when available, merged with OSM
  terminals/aprons and OurAirports runway fallback.
- Renders airport-only vector maps with runways, taxiways, service roads, stands,
  stand lead-in lines, gates, holding positions, terminals, and hangars — no
  street-map raster tiles. Detail is reduced automatically at lower zooms.
- Plans local taxi routes without SayIntentions: stand/aircraft to runway,
  runway to stand, or custom map point to map point, with up to three options.
- Lets a destination airport be selected before landing, so arrival taxi can
  be prepared while the aircraft is still airborne.
- Downloads each airport once and keeps it in both the Windows host cache and
  the EFB browser cache for immediate reopening.
- Uses a compact bundled OurAirports catalog for ICAO lookup, airport metadata,
  coordinates, and runway fallback data.
- Hosts the same responsive moving map for iPad/iPhone and Android.
- Protects mobile access with a rotating six-digit PIN and persistent,
  individually revocable device tokens; LAN access can be disabled on the host.
- Keeps the Windows browser host active for tablets and second monitors while
  its compact host window remains open.
- Includes source for a thin optional MSFS 2024 native EFB app under
  `MSFS-2024-EFB-App`; it is built against the official SDK template and shows
  the same responsive host UI in the simulator.
- Includes a demo mode that works without MSFS or SayIntentions.

## Install the Windows app (recommended)

1. Run **Flight-Deck-EFB-Setup-1.2.0-x64.exe**. The per-user setup installs the
   app below Windows Local AppData, creates Start Menu and desktop shortcuts,
   and registers a normal Windows uninstaller without requiring administrator
   rights. This development build is not yet code-signed, so Windows SmartScreen
   may require **More info → Run anyway** once.
2. Start **Flight Deck EFB** from the Start Menu. The native app window also
   starts the local companion host for tablets and second monitors.
3. If Windows Firewall asks, allow access for **private networks** so mobile
   devices can connect.
4. Complete the three setup steps. Enter the SimBrief Pilot ID or username once
   under **Settings → Connections**; it is remembered locally.
5. Start MSFS and optionally SayIntentions or BeyondATC. The Home screen always
   shows the next useful setup or flight action.

No separate Node.js or Electron installation is required. Closing the native
window keeps the companion in the Windows tray so iPad, Android and second
monitors remain connected; quit it from the tray menu when finished.

Running a newer setup file upgrades the same per-user installation in place.
Settings, paired devices, cached airports and the flight archive are kept below
Local AppData and therefore survive a normal update. The in-app updater can
also use a Squirrel-compatible HTTPS release feed when the distributor sets:

```text
FLIGHT_DECK_UPDATE_URL=https://example.invalid/flight-deck-efb/releases/
```

Without a configured feed, **Settings → Updates** explains the safe manual
upgrade path instead of pretending that an online update was checked.

The release bundle additionally contains a browser-host ZIP as a fallback. It
can be fully extracted and started with **START FLIGHT DECK EFB.cmd** without
installation. Do not mix files from different versions. Preferences, SimBrief
ID, paired devices, airport cache and flight archive remain in application data
during normal upgrades.

Airport geometry is downloaded on first use and then stored below the Windows
application-data directory. Select the **MAP** button in the app to refresh the
current airport.

## Track and reopen flights

1. Import a SimBrief OFP or connect an active SayIntentions flight, then connect
   MSFS. Recording starts automatically as soon as a route identity and a valid
   aircraft position are available.
2. Open **Flight Tracking** to follow the aircraft on the map. Select **MAP** or
   **SATELLITE**, enable **FOLLOW**, or fit the entire route.
3. The cyan line is the actual flown track; the dashed line is the planned
   route. Every SimBrief navlog fix remains available in the waypoint list and
   as an interactive marker.
4. Select **SAVE FLIGHT** when desired. Parking after landing with engines off
   and the parking brake set also completes a recording automatically.
5. Select any entry in **Flight archive** to reopen its route, weather, ATC and
   statistics. Completed flights can be exported as GPX or JSON.

Flight records are stored in the Windows application-data folder rather than
inside the portable program directory. Replacing the application ZIP therefore
does not remove the archive. The normal and satellite background layers require
internet; recorded tracks, waypoints and statistics remain stored locally.

## Plan taxi without an ATC client

1. Open **Taxi Planning** on the EFB home screen, or select **PLAN TAXI** inside
   the Taxi application.
2. Search by ICAO, airport name, or city. The current airport is preselected
   when available.
3. Choose departure, arrival, or a custom route.
4. Select runway and stand, calculate the alternatives, and inspect the preview
   on the map.
5. Start guidance for deviation, remaining distance, and route display.

An exact path from the selected provider has priority over a manual or inferred
route. Manual planning never sends a clearance or modifies an ATC client.

## Select SayIntentions or BeyondATC

Open **ATC** in the EFB navigation. **Automatic** uses the best active source;
you can also lock the app to SayIntentions or BeyondATC. BeyondATC currently
uses a local, read-only compatibility adapter for `Player.log` and
`beyondATC.log`. If a line cannot be parsed reliably, paste the clearance into
the manual field. The Taxi module then attempts to match named taxiways against
the local airport graph.

The default BeyondATC log directory can be overridden for a non-standard setup:

```text
BEYONDATC_LOG_DIR=C:\path\to\BeyondATC
```

## Navigraph and GSX connector status

The Charts launcher is intentionally unavailable in this standalone Windows /
tablet release. Navigraph's Charts API requires separate developer approval and
has product-placement restrictions. The existing Device Login connector is
kept for a future compliant in-simulator implementation; credentials remain in
the local Windows process and are never returned to the mobile UI:

```text
NAVIGRAPH_CLIENT_ID=...
NAVIGRAPH_CLIENT_SECRET=...
```

GSX is detected in the usual Addon Manager locations. A custom location can be
provided with `GSX_ADDON_MANAGER`. The status check is real, but service actions
stay in the native GSX/Fenix menu because GSX does not document a general
remote-control API for standalone EFBs.

The **Flight** app imports the latest SimBrief OFP from a Pilot ID or username.
The **Fenix** app checks and displays the official Remote EFB at
`http://127.0.0.1:8083/`; on a tablet, use the Windows PC's LAN address. Load a
Fenix A32X flight and keep the Fenix App running first.

## Use on iPad, iPhone, or Android

1. Connect the mobile device to the same private network as the Windows PC.
2. Select the share icon in the upper-right corner of the Windows app.
3. Scan the QR code with the mobile device.
4. Enter the displayed six-digit pairing PIN once. The device stays paired
   until it is revoked under **Settings → Tablet & second monitor**.

The mobile browser receives only sanitized display state. The SayIntentions API
key and account identity stay in the local Windows process and are never
returned by the map API.

## Data flow

- SayIntentions flight state: `http://localhost:63287/flightJSON`
- SayIntentions communications: SAPI `getCommsHistory`
- BeyondATC clearance compatibility: local `Player.log` / `beyondATC.log`
- Aircraft telemetry: local MSFS SimConnect connection (position, speeds,
  altitude, vertical speed, parking brake, engines, fuel/weight, COM and XPDR)
- Simulator traffic board: local SimConnect AI/live/add-on traffic objects;
  filters and operational status are derived locally from simulator data
- Airport taxi graph: local MSFS 2024 airport facility data when supported
- Official airport weather fallback: AviationWeather.gov METAR/TAF API
- GSX: local installation discovery plus SimConnect readiness
- Navigraph: protected Device Login; standalone charts open externally
- SimBrief: official latest-OFP JSON endpoint
- VATSIM / IVAO: official public live-network feeds, on demand
- Fenix: official local Remote EFB web service on port 8083
- Flight archive: local JSON records managed by the Windows host; GPX/JSON export
- Flight tracking basemaps: OpenStreetMap standard map and Esri World Imagery
- Airport geometry: OpenStreetMap aviation objects via Overpass API
- Airport catalog and runway fallback: bundled OurAirports public-domain data

The app uses `current_airport` to select the active map. Documented origin and
destination coordinates, gate position, taxi-path geometry, aircraft position,
the manually selected planning airport, and the OurAirports catalog are used as
ordered coordinate fallbacks.

OpenStreetMap supplies detailed airport geometry. OurAirports does not contain
detailed taxiway layouts; it complements OSM with airport indexing and runway
metadata. The SayIntentions `taxi_path` is rendered independently above those
background layers.

## Hold-short and deviation logic

Explicit hold-short metadata in `taxi_path` is preferred. If the current
clearance says “hold short runway …” but the route has no explicit marker, the
last route point is marked as an inferred hold-short point.

- Up to 20 m deviation: **On route**
- More than 20 m: **Route check**
- More than 35 m for 2.5 seconds: **Taxi route left** warning
- More than 25 km: route/position mismatch; warning is suppressed and **New
  Flight** is offered instead of displaying a nonsensical distance

Warnings are active only while SimConnect reports that the aircraft is on the
ground.

## Development

Requirements: Node.js 22 or newer.

```text
npm install
node src/server.mjs --demo --open
node --test test/*.test.mjs
```

The fallback Windows browser-host package uses an official Node.js LTS runtime
and the system browser:

```text
node scripts/package-windows-browser-host.mjs <node-windows-directory> <output-directory>
```

The Electron entry point is `src/electron-main.mjs`. A separate packaging
script can create an unpacked native window from an official Electron
win32-x64 runtime, followed by a per-user Windows setup package:

```text
node scripts/package-windows-portable.mjs <electron-directory> <output-directory>
node scripts/package-windows-squirrel.mjs <unpacked-app-directory> <installer-output-directory>
```

## Current limitations

- The first download of a detailed airport map needs internet access and a
  responsive public Overpass instance. A cached map remains available if the
  service later cannot be reached.
- The Flight Tracking street and satellite basemaps are streamed on demand and
  require internet access. The recorded route and data are still available
  locally if background tiles cannot be loaded.
- Without an active MSFS facility response, OpenStreetMap airport detail varies
  by airport. OurAirports can restore runway geometry but not missing taxiways,
  stands, or terminal shapes.
- Automatically calculated taxi routes depend on the topology recorded in
  OpenStreetMap. The app bridges small gaps in isolated stand lead-ins, but the
  result must still be checked against ATC instructions and airport signage.
- The Simulator Flightboard can only show traffic objects exposed to SimConnect.
  MSFS AI/live traffic and traffic injected by compatible add-ons are included;
  remote background traffic that an ATC client does not inject into MSFS is not.
- BeyondATC does not currently provide a documented general taxi-route API.
  Log parsing is a best-effort beta adapter and may need adjustment after a
  BeyondATC update; manual clearance entry remains the fallback.
- Navigraph airport charts are not included in this build. They require
  developer approval, application credentials, user authentication, a running
  simulator, and compliance with Navigraph's chart-display restrictions.
- GSX installation detection is available, but service control stays locked
  until a verified GSX interface catalog is available for the installed version.
- The optional native MSFS 2024 EFB app is shipped as adapter source because it
  must be compiled with the EFB template and dependencies from the user's
  installed SDK. The Windows/tablet build works without it.
- Hold-short inference depends on the detail in `taxi_path` and the ATC
  transcript and cannot replace the pilot's interpretation of the clearance.

Official references:

- https://p2.sayintentions.ai/p2/docs/
- https://wiki.beyondatc.net/support/bug-reporting/
- https://developers.navigraph.com/docs/request-access
- https://developers.navigraph.com/docs/general/restrictions
- https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/events-and-data/simconnect_addtodatadefinition/
- https://docs.flightsimulator.com/msfs2024/retail/programming-apis/simconnect/api-reference/facilities/simconnect_addtofacilitydefinition/
- https://docs.flightsimulator.com/msfs2024/retail/programming-apis/efb/electronic-flight-bag-api/
- https://aviationweather.gov/data/api/
- https://wiki.openstreetmap.org/wiki/Key:aeroway
- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://ourairports.com/data/
- https://docs.flightsimulator.com/msfs2024/
