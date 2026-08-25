# Flight Deck EFB

**Current release: 1.7.1 — Native EFB Community Package Builder**

Flight Deck EFB is a Windows companion and responsive Electronic Flight Bag for Microsoft Flight Simulator 2020/2024. The Windows host owns SimConnect, local data and guarded integrations; the same Flight Deck interface can be used in the desktop app, a browser, an iPad/iPhone, Android device and — with the optional SDK-built adapter — directly inside the native MSFS 2024 EFB.

> **Flight simulation use only — not for real-world navigation.**

## 1.7.1 highlights

- **One-click native EFB builder:** Settings → System can detect the locally installed MSFS 2024 SDK/EFB sample and build Flight Deck with that exact Microsoft template.
- **Official Package Tool path:** the builder invokes the user's installed `fspackagetool.exe` to compile the Community package; Microsoft SDK/template files are not distributed with Flight Deck.
- **Community2024 detection:** Flight Deck reads the existing `InstalledPackagesPath` from `UserCfg.opt` and targets `Community2024`. It never changes `UserCfg.opt`.
- **Explicit install only:** **PAKET BAUEN** creates a reusable local package/ZIP; **BAUEN & INSTALLIEREN** additionally copies the finished package into Community2024 after an explicit confirmation.
- **Private local paths:** full SDK/Community/build paths remain inside the Windows host and are not exposed to paired tablets or support exports.

## 1.7.0 highlights

- **Native MSFS 2024 EFB Route Bridge:** the in-simulator app discovers the Windows host automatically, reads the current MSFS EFB route with the documented `GET_EFB_ROUTE` API and reports the documented `AvionicsRouteSync` event.
- **Route comparison:** Flight Deck normalizes the MSFS EFB route and compares it locally with the current SimBrief/Flight Deck route: origin/destination, runways, SID/STAR and enroute waypoint overlap.
- **Safe FMS/EFB sync model:** Flight Deck observes the simulator's native **Sync Route To Avionics** flow. Direct route-write calls that are still incompletely documented by the SDK are deliberately not invoked.
- **Automatic Flight Intelligence:** automatic phases are stabilized with transition dwell/hysteresis using MSFS aircraft state, ATC state and route context. Manual override still wins.
- **Turnaround Coordinator:** departure/arrival progress, open blockers and the next recommended ground step are derived from aircraft state, OFP and documented GSX service data. Flight Deck does not automatically start/cancel GSX services.
- **Flight Assistant:** local rule-based operational advisories for Ground Safety, route mismatch, fuel reserve projection, arrival weather, flight-plan readiness and turnaround context. No cloud LLM is used and the assistant cannot independently control the simulator.

## Core features

### Flight operations
- Flight Journey Hub with stabilized automatic phase inference, manual override, phase checklists, readiness, timeline, ETA/fuel/weather context and flight notes.
- SimBrief latest-OFP import with route, SID/STAR, runways, alternate, cruise planning, navlog coordinates, fuel/weight/timing and METAR/TAF fields.
- Native MSFS EFB route comparison and avionics-sync observation when the optional MSFS 2024 EFB adapter is installed.
- Persistent flight tracking/archive with planned route, actual track, weather snapshots, aircraft telemetry and GPX/JSON export.
- New Flight safely closes/clears active operational state while preserving application setup and archive data.

### Flight Assistant
The Flight Assistant is a deterministic local advisory engine, not a chat bot. It combines already available Flight Deck state and can surface:
- Ground/Taxi Safety alerts;
- MSFS EFB vs Flight Deck route differences;
- projected landing fuel below/near planned reserve;
- missing arrival weather during descent/approach;
- missing flight-plan/native-route readiness; and
- the next Turnaround Coordinator recommendation.

It never sends a simulator command by itself.

### Taxi and airport operations
- Exact SayIntentions taxi paths when available, BeyondATC local-log compatibility and manually entered clearances.
- Local taxi planning without an ATC client: stand/aircraft → runway, runway → stand, or custom map point → map point.
- MSFS airport facility data (taxi names/points/paths, parking, hold positions, jetways and VDGS) merged with OpenStreetMap geometry and OurAirports fallback metadata.
- Ground Safety for route deviation, excessive taxi speed, hold-short approach, stand approach and close moving ground traffic.

### ATC, traffic and weather
- SayIntentions SAPI flight/parking/weather/frequency/communications integration with a deduplicated per-flight message history.
- Read-only VATSIM/IVAO controller, ATIS and relevant-pilot data.
- SimConnect traffic plus an all-object fallback for compatible injected/live/add-on traffic.
- AviationWeather.gov METAR/TAF fallback.
- Optional Little Navmap local WebAPI cross-check and airport metadata enrichment.

### Aircraft and ground adapters
- **Generic SimConnect:** core telemetry, COM/XPDR, MSFS 2024 Input Events, approved variables and guarded one-shot actions.
- **Fenix:** official Remote EFB/Web MCDU plus currently enumerated MSFS Input Events; no unofficial Fenix variable catalog is bundled.
- **PMDG:** local SDK discovery for supported installed PMDG packages; event IDs are generated from the user's own local SDK header at runtime and SDK source is never redistributed.
- **GSX:** local installation/Couatl readiness, documented live service states and explicit passenger-target synchronization.
- **Turnaround Coordinator:** reads the above state and recommends the next ground step; it does not emulate the GSX menu.
- **Automations:** Off/Test/Armed modes, phase/app/ATC/variable triggers, cooldowns and operational guards. Stabilized Phase-3 flight phases feed existing `phase-enter` triggers automatically. Armed resets to Test after restart, new flight or aircraft change.

## Install / update Windows

1. Open the latest GitHub Release and run **`Flight-Deck-EFB-Setup-1.7.1.exe`**.
2. Windows SmartScreen can warn because the current build is not code-signed. Review the source/publisher before running it.
3. Start **Flight Deck EFB**. The Windows app starts the local host used by the desktop UI and second screens.
4. Allow private-network firewall access only when you want tablet/second-screen LAN access.
5. Complete first-run setup and optionally save your SimBrief Pilot ID/username.

The per-user installer upgrades the existing installation in place and retains normal local settings, paired-device tokens, cached airports and flight archive. The installed app uses the GitHub Release channel through `electron-updater`; `latest.yml` and the NSIS blockmap are published with every release.

## Native MSFS 2024 EFB app

### Recommended: build from Flight Deck

1. Install the MSFS 2024 SDK from Developer Mode if it is not already installed.
2. Open **Settings → System → Native EFB Package Builder**.
3. Select **SDK PRÜFEN**. Flight Deck checks the installed EFB sample and `fspackagetool.exe` and reads the existing `InstalledPackagesPath` from `UserCfg.opt` to locate `Community2024`.
4. Select **PAKET BAUEN** to create a reusable Community package plus ZIP, or **BAUEN & INSTALLIEREN** to additionally copy the finished package into `Community2024`.
5. Restart/reload the simulator package list and open **Flight Deck EFB** in the simulator EFB.

The builder copies the Microsoft sample only into an isolated local workspace for the build. Microsoft SDK files are never shipped with Flight Deck or uploaded anywhere. Manual path overrides remain available for non-standard SDK/Community installations.


Source for the optional in-simulator adapter is in `MSFS-2024-EFB-App/`. Microsoft SDK template/build files are intentionally not redistributed. Build that source against the EFB template installed with your own current MSFS 2024 SDK; detailed steps and route-API safety limits are in `MSFS-2024-EFB-App/README.md`.

The native app:
- discovers the Windows host on `127.0.0.1:39871–39890`;
- embeds the same Flight Deck UI;
- reads the current simulator EFB route through `GET_EFB_ROUTE`;
- sends that sanitized route only to the loopback Flight Deck host for comparison; and
- observes `AvionicsRouteSync` when MSFS broadcasts the native EFB route after **Sync Route To Avionics** is selected.

Flight Deck does not use legacy GPS write variables and does not call MSFS Planned Route write operations while those SDK interfaces remain incompletely documented.

## iPad / Android / second monitor

Use the Share button in the Windows app. Scan the QR code, connect over the same private network and enter the displayed six-digit pairing PIN once. Each paired device receives an individually revocable local token. LAN sharing can be disabled from Settings.

The native MSFS EFB bridge is different: its `/api/native/*` endpoints are loopback-only, expose only health/route bridge data and do not expose connector credentials or updater controls.

## Connector setup

### SayIntentions
Flight Deck detects the local SayIntentions flight endpoint and uses official SAPI data exposed for the active flight. API credentials remain host-side.

### BeyondATC
The compatibility connector is local and read-only. Override a non-standard log location with:

```text
BEYONDATC_LOG_DIR=C:\path\to\BeyondATC
```

### Little Navmap
Enable the Little Navmap web server. Flight Deck checks the local WebAPI on port 8965. Little Navmap is optional and never replaces SimConnect.

### Fenix
Load a Fenix A319/A320/A321 and keep the Fenix application running. The official Remote EFB/Web MCDU is expected on `http://127.0.0.1:8083/` on the Windows host.

### PMDG
Flight Deck scans common MSFS package roots for locally installed PMDG SDK headers. For a non-standard location:

```text
PMDG_PACKAGES_DIR=C:\path\to\Packages
```

Where the relevant PMDG product/SDK requires data broadcasting, enable it according to that product's own documentation. Flight Deck reports the local status and does not rewrite PMDG configuration files.

### GSX Pro
GSX is detected in usual FSDT Addon Manager locations. For a custom location:

```text
GSX_ADDON_MANAGER=C:\path\to\Addon Manager
```

Flight Deck reads documented GSX state/passenger/cargo variables and can explicitly set the documented GSX passenger target from SimBrief. Starting, cancelling or sequencing services remains in the native GSX/aircraft workflow.

### Navigraph
Standalone chart embedding remains disabled pending a separately approved, license-compliant integration.

## Data flow and privacy

Local by default:
- MSFS telemetry, facilities, traffic and Input Events → SimConnect;
- native MSFS EFB route → local loopback Route Bridge;
- Flight Intelligence, Turnaround Coordinator and Flight Assistant → local state evaluation only;
- Fenix Remote EFB → local/private port 8083;
- PMDG SDK discovery → local installed files only;
- GSX discovery/live variables → local installation + SimConnect;
- Little Navmap → local WebAPI;
- flight archive, settings and paired-device tokens → Windows application data.

Optional internet services include SimBrief, SayIntentions SAPI, AviationWeather.gov, VATSIM/IVAO public feeds, OpenStreetMap/Overpass map data and GitHub Releases for updates.

The support bundle intentionally excludes API keys, access tokens, ATC message contents, flight notes, PMDG SDK source and full local file paths. See `PRIVACY.md` for details.

## Safety model

- Ground Safety and Flight Assistant are **advisory only**.
- ATC clearance, airport markings/signage, charts and pilot judgement always take precedence.
- Route Bridge reads documented route state and observes the simulator's native avionics-sync event; it does not force undocumented FMS/EFB writes.
- Turnaround Coordinator never starts or cancels GSX services.
- Active radio changes and aircraft-adapter controls require an explicit action.
- Automation defaults to Test mode and uses allowlists/guards before any simulator write.
- Manual flight-phase override has priority over automatic Flight Intelligence.

## Development

Requirements: Node.js 22+ (release CI currently uses Node.js 24).

```text
npm install
npm run prepare-data
node src/server.mjs --demo --open
npm start
npm run dist
```

`src/server.mjs` is the shared host. `src/state-engine.mjs` owns normalized public state. `src/route-sync-service.mjs` owns the Phase-3 route comparison bridge and `src/flight-intelligence-engine.mjs` owns stabilized phases, turnaround coordination and Flight Assistant evaluation. The optional native simulator source is under `MSFS-2024-EFB-App`.

## Legal

Copyright © 2026 Christoph Heckner.

Application code is distributed under the included MIT License. Third-party libraries/data keep their own licenses; see `THIRD_PARTY_NOTICES.md`. Microsoft Flight Simulator, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix, PMDG, GSX, Little Navmap, VATSIM and IVAO are names/trademarks of their respective owners and are referenced only to identify compatibility. Flight Deck EFB is independent and is not endorsed by or affiliated with those providers unless explicitly stated.
