# Flight Deck EFB

**Current release: 1.6.0 — Phase 2 Aircraft & Ground Intelligence**

Flight Deck EFB is a Windows companion and responsive Electronic Flight Bag for Microsoft Flight Simulator 2020/2024. The Windows host connects to MSFS and optional local/online services; the same EFB can then be used in the desktop app, a browser, an iPad/iPhone or Android device on the same private network.

> **Flight simulation use only — not for real-world navigation.**

## 1.6.0 highlights

- **Aircraft Adapter Layer:** automatic Fenix, PMDG or Generic SimConnect selection based on the loaded aircraft.
- **Fenix adapter:** keeps the official local Remote EFB/Web MCDU on port 8083 and exposes only MSFS Input Events that are actually enumerated for the loaded aircraft. Flight Deck does not ship or guess a private Fenix LVar catalog.
- **PMDG adapter:** discovers locally installed PMDG 737/777 SDK headers, derives the available `THIRD_PARTY_EVENT_ID_MIN + offset` controls at runtime and never bundles PMDG SDK content. SDK Data Broadcast status is reported when the local Options file is available.
- **GSX live integration:** installation/Couatl detection plus documented service-state and passenger/cargo LVars. SimBrief PAX can be explicitly synchronized to `L:FSDT_GSX_NUMPASSENGERS`; service requests remain in the native GSX/Fenix workflow.
- **Ground / Taxi Safety:** route deviation, excessive taxi speed, hold-short approach without detected runway authorization, stand-approach speed and close moving ground traffic are evaluated locally and surfaced as caution/warning/critical advisories.
- **Documentation/release cleanup:** all visible version strings, cache identifiers and GitHub Release notes are synchronized with the package version; Release notes are generated from the matching CHANGELOG section instead of a stale hard-coded text.

## Core features

### Flight operations
- Flight Journey Hub with automatic phase inference, manual override, phase checklists, readiness, timeline, ETA/fuel/weather context and flight notes.
- SimBrief latest-OFP import with route, SID/STAR, runways, alternate, cruise planning, navlog coordinates, fuel/weight/timing and METAR/TAF fields.
- Persistent flight tracking/archive with planned route, actual track, weather snapshots, aircraft telemetry and GPX/JSON export.
- New Flight safely closes the active recording and clears flight-specific state while preserving setup and archive data.

### Taxi and airport operations
- Exact SayIntentions taxi paths when available, BeyondATC local-log compatibility and manually entered clearances.
- Local taxi planning without an ATC client: stand/aircraft → runway, runway → stand, or custom map point → map point.
- MSFS airport facility data (taxi names/points/paths, parking, hold positions, jetways and VDGS) merged with OpenStreetMap airport geometry and OurAirports fallback metadata.
- Hold-short markers, route deviation, remaining distance, gate/stand context and Phase-2 Ground Safety advisories.
- Airport maps are cached locally for fast reopening.

### ATC, traffic and weather
- SayIntentions SAPI flight/parking/weather/frequency/communications integration with a deduplicated per-flight message history.
- Read-only VATSIM/IVAO controller, ATIS and relevant-pilot data.
- SimConnect traffic plus an all-object fallback so injected/live/add-on traffic can be normalized into the same Flightboard state.
- AviationWeather.gov METAR/TAF fallback.
- Little Navmap local WebAPI detection (`127.0.0.1:8965/api`) as optional simulator/airport metadata cross-check.

### Aircraft and ground adapters
- **Generic SimConnect:** core telemetry, COM/XPDR, MSFS 2024 Input Events, approved SimVars/LVars/ZVars and guarded one-shot actions.
- **Fenix:** official Remote EFB/Web MCDU plus currently enumerated MSFS Input Events. No unofficial variable catalog is bundled.
- **PMDG:** local SDK discovery for supported installed PMDG packages. Event IDs are generated from the user's own SDK header at runtime.
- **GSX:** local installation and Couatl readiness, documented live service states and explicit passenger-target synchronization. Flight Deck does **not** automate the GSX menu or pretend a general remote service API exists.
- **Automations:** Off/Test/Armed modes, phase/app/ATC/variable triggers, cooldowns, on-ground/groundspeed/aircraft guards and an audit log. Armed always resets to Test after restart, new flight or aircraft change.

## Install / update Windows

1. Open the latest GitHub Release and run **`Flight-Deck-EFB-Setup-1.6.0.exe`**.
2. Windows SmartScreen can warn because the current build is not code-signed. Review the publisher/source before choosing to run it.
3. Start **Flight Deck EFB**. The app also starts the local host used by tablets and second monitors.
4. Allow private-network firewall access when you want to use another device on your LAN.
5. Complete first-run setup and optionally save your SimBrief Pilot ID/username.

The installer is per-user, does not require administrator rights and upgrades the existing installation in place. Local settings, paired-device tokens, cached airports and the flight archive are retained on normal updates. The installed Windows app uses the GitHub Release channel through `electron-updater`; `latest.yml` and the NSIS blockmap are published with every release.

## iPad / Android / second monitor

Use the share button in the Windows app. Scan the QR code, connect over the same private network and enter the displayed six-digit pairing PIN once. Each paired device receives an individually revocable local token. LAN sharing can be disabled from Settings.

The browser receives sanitized application state. Connector credentials and host-only update controls remain in the Windows process.

## Connector setup

### SayIntentions
Flight Deck detects the local SayIntentions flight endpoint and uses the official SAPI data exposed for the active flight. API credentials remain host-side.

### BeyondATC
The compatibility connector is local and read-only. It can inspect `Player.log` / `beyondATC.log` for a reliably parseable taxi/hold-short instruction. Override a non-standard log location with:

```text
BEYONDATC_LOG_DIR=C:\path\to\BeyondATC
```

### Little Navmap
Enable the Little Navmap web server. Flight Deck checks the local WebAPI on port 8965. Little Navmap is optional and never replaces the primary SimConnect connection.

### Fenix
Load a Fenix A319/A320/A321 and keep the Fenix application running. The official Remote EFB/Web MCDU is expected on:

```text
http://127.0.0.1:8083/
```

For a physical tablet, the official Fenix EFB itself must use the Windows PC's LAN address; the Flight Deck host still performs its local health check on the PC.

### PMDG
Flight Deck scans common MSFS package roots for installed PMDG package SDK headers. You can explicitly set a package root:

```text
PMDG_PACKAGES_DIR=C:\path\to\Packages
```

For PMDG features that require SDK data broadcasting, enable `EnableDataBroadcast=1` in the aircraft's own Options file as described by the PMDG SDK/documentation for that product/version. Flight Deck reads the local status; it does not rewrite PMDG configuration files.

### GSX Pro
GSX is detected in the usual FSDT Addon Manager locations. Override a custom location with:

```text
GSX_ADDON_MANAGER=C:\path\to\Addon Manager
```

Flight Deck reads documented GSX LVars for service state/passenger/cargo progress and can explicitly set the documented GSX passenger target from the imported SimBrief OFP. Starting, cancelling or sequencing GSX services remains the responsibility of GSX/the aircraft's native integration.

### Navigraph
Standalone chart embedding remains disabled. Navigraph licensing/developer access and product-placement requirements are handled separately; the current standalone app opens official charts externally where applicable.

## Data flow and privacy

Local by default:
- MSFS telemetry, facilities, traffic and Input Events → SimConnect
- Fenix Remote EFB → local/private port 8083
- PMDG SDK discovery → local installed files only
- GSX discovery/live variables → local installation + SimConnect
- Little Navmap → local WebAPI
- flight archive, settings and paired-device tokens → Windows application data

Optional internet services:
- SimBrief latest OFP
- SayIntentions SAPI
- AviationWeather.gov
- VATSIM / IVAO public feeds
- OpenStreetMap/Overpass airport geometry and map layers
- GitHub Releases for application updates

The support bundle intentionally excludes API keys, access tokens, ATC message contents, flight notes and full local file paths. See `PRIVACY.md` for the detailed data policy.

## Safety model

- Ground Safety is **advisory only**. ATC clearance, airport signage/markings, charts and pilot judgement always take precedence.
- Active radio changes require an explicit action.
- Fenix/PMDG adapter controls require a control that is actually available from MSFS or the locally installed SDK.
- GSX service commands are not remotely emulated.
- Automation defaults to Test mode and uses allowlists/guards before any simulator write.
- Route/position mismatches suppress misleading deviation guidance and prompt for a fresh flight state.

## Development

Requirements: Node.js 22+ (release CI currently uses Node.js 24).

```text
npm install
npm run prepare-data
node src/server.mjs --demo --open
npm start
npm run dist
```

`src/server.mjs` is the shared host for Electron and LAN clients. `src/state-engine.mjs` owns normalized public state; connector modules feed it. `src/aircraft-adapter-manager.mjs` and `src/ground-safety-engine.mjs` contain Phase-2 aircraft/ground intelligence. The optional MSFS native EFB source remains under `MSFS-2024-EFB-App` for the later in-simulator phase.

## Legal

Copyright © 2026 Christoph Heckner.

Application code is distributed under the included MIT License. Third-party libraries/data keep their own licenses; see `THIRD_PARTY_NOTICES.md`. Microsoft Flight Simulator, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix, PMDG, GSX, Little Navmap, VATSIM and IVAO are names/trademarks of their respective owners and are referenced only to identify compatibility. Flight Deck EFB is an independent companion and is not endorsed by or affiliated with those providers unless explicitly stated.
