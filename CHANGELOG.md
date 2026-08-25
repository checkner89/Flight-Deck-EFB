# Flight Deck EFB changelog

## 1.7.8 — Traffic Identity & Complete Taxi Map

- Live Traffic now shows up to **120 rows**, preventing nearby airborne traffic from being hidden by the first 40 ground objects at busy airports.
- Added a separate generic **ATC AIRLINE / ATC FLIGHT NUMBER** identity read, so a flight number is shown when MSFS/the injector actually exposes one without making core traffic depend on optional schedule SimVars.
- Internal injector IDs such as **AIGAM** are no longer preferred as the visible callsign; real airline/flight-number identity wins, with a clean title-derived airline fallback.
- Aircraft strings such as **AIGAM SunExpress Boeing 737-800** are normalized to an aircraft family such as **B737** instead of leaking provider/livery text into the Aircraft column.
- Detailed Taxi Navigation now waits for the complete OSM/Overpass map after the fast preview, restoring **taxiways, aprons, terminals and airport buildings** instead of getting stuck on runways.
- Airport building download now includes buildings inside the ICAO aerodrome area, and schema-3 map caches are refreshed automatically while remaining usable as an offline fallback if the download fails.
- MSFS facility geometry replaces an OSM feature class only when the facility response actually contains that class, preventing partial facility data from deleting valid OSM taxiways.
- Removed the **Flight Assistant** card from Home; automatic flight-phase intelligence remains available to the Flight Journey features.

## 1.7.7 — Installer & Legal Transparency

- Published the completed installer/legal work as **1.7.7**.
- Assisted Windows Setup includes the complete **MIT License** plus explicit simulation-only, privacy/LAN and third-party acknowledgements.
- Setup includes a dedicated scrollable **Third-party notices** page and a selectable **Create a Desktop Shortcut** task.
- Application author/copyright metadata now consistently identifies **Christoph Heckner**.
- Updated packaged legal/version references to 1.7.7 while retaining non-destructive update/uninstall behavior and the existing installer regression checks.
- The Windows executable is still **not code-signed**; SmartScreen may therefore continue to show an unknown-publisher warning.

## 1.7.6 — Installer & Legal Transparency

- Added a proper assisted Windows Setup **License Agreement** page containing the complete MIT License plus simulation-only Safety, Privacy/LAN and Third-Party acknowledgements. The installer agreement explicitly does not remove, reduce or contradict MIT rights.
- Added a dedicated scrollable **Third-party notices** Setup page for the open-source components, data sources and optional compatibility services actually used by Flight Deck EFB.
- Added an **Additional Tasks** Setup page with a user-selectable **Create a Desktop Shortcut** option while retaining the Start Menu shortcut.
- Confirmed non-destructive uninstall behavior: uninstall/reinstall does not silently delete local settings, caches or flight history.
- Added permanent installer regression checks to the Windows release workflow so future releases cannot silently drop the MIT agreement, legal pages, shortcut selection or non-destructive uninstall behavior.

## 1.7.5 — Traffic & Taxi Recovery

- Expanded Live Traffic to **Arriving 80 NM** and **Nearby 120 NM** while Ground remains 8 NM; the active tab now shows its actual scope.
- Restored the documented maximum SimConnect discovery radius of **200 km (~108 NM)**. The 120 NM Nearby filter is retained as the UI target, while direct SimConnect visibility remains capped by the simulator API.
- Broadened injected-traffic discovery to accept **PassiveAircraft / aircraft-style categories**, improving compatibility with SayIntentions Living World and other injectors that are visible in MSFS but were filtered out before detail reads.
- Fixed Taxi Navigation getting stuck on a **runway-only preview**: preview maps are no longer persisted as complete browser maps, existing poisoned preview caches self-heal, and the host waits longer for OSM/Overpass geometry when MSFS facility data arrives first.
- Fixed **New Flight** immediately re-importing the just-finished taxi route/session, which could make the red ROUTE / POSITION warning reappear and leave guidance unusable.
- Taxi/map fixes are implemented independently with documented MSFS facility data, OpenStreetMap/Overpass and OurAirports; no TaxiNow code, assets or protected implementation were reused.
## 1.7.4 — Honest Live Traffic

- Replaced the airport-style Flightboard with an honest **Live Traffic** workspace: **Ground / Arriving / Nearby**.
- Removed FROM/TO, ETD/ETA and Departures/Arrivals presentation for simulator objects that do not publish a real schedule. Flight Deck no longer fills schedule gaps with airport heuristics.
- Live Traffic now prioritizes directly observed data: callsign/operator identity, aircraft type, position, altitude, groundspeed, distance and simulator-reported traffic state.
- When MSFS does not publish a traffic state, movement-based statuses such as Parking, Taxi and Arriving are explicitly marked **INFERRED** rather than presented as authoritative schedule data.
- Reduced both SimConnect traffic discovery bubbles from 200 km to 60 km and limits the UI to the closest 40 relevant aircraft; Ground uses an 8 NM scope, Arriving 25 NM and Nearby 30 NM.
- Removed external website-favicon airline images and replaced them with deterministic local airline-code badges.
- Added Live Traffic regression tests covering distance filtering, Ground/Arriving classification and status inference.
- Clarified in-product and README documentation that SayIntentions Living World internally uses real-world schedules/routes/gates, but does not currently expose a documented public Living World traffic board/API to Flight Deck.

## 1.7.3 — Traffic, layout & updater corrective hotfix

- Fixed the Flightboard enrichment pipeline: FROM/TO, current airport, runway, parking, airline/flight number and ETD/ETA are no longer erased after the optional AI Traffic request succeeds.
- Merges schedule metadata into the primary SimConnect object when both readers report the same aircraft, and preserves that metadata across later primary traffic refreshes.
- Keeps unknown route fields unknown when an injector does not expose a simulator schedule; Flight Deck does not invent destinations.
- Reverted the global card shrink introduced in 1.7.2. Flex-based Home cards now stretch to the intended workspace width, while grid cards still keep content-height behavior.
- Flight Assistant uses the full Home width and lays advisories out responsively instead of collapsing into a narrow column.
- SayIntentions Messages now spans the complete ATC workspace.
- Rebuilt the update dialog with installed/available version context, a readable close control and release notes / changelog directly inside the popup.
- If electron-updater does not provide release notes immediately, the Windows host fetches the matching public GitHub Release body as a fallback.

## 1.7.2 — Native EFB Builder Hotfix

- Fixed Taxi Navigation auto-follow so the aircraft stays centered on module open and route refresh.
- Reworked Aircraft & EFB into a full-width Fenix workspace with Fenix / PMDG / Adapter Status tabs.
- Fixed stretched/offset ATC and SayIntentions cards plus oversized Phase-2/3 empty-state cards.
- Improved Flightboard route/schedule enrichment with optional official MSFS AI Traffic fields and online-pilot fallback.
- Improved Departures / Arrivals classification when schedule data is incomplete.
- Uses the active Flightboard airport as a known-side fallback for schedule-less nearby ground traffic, without inventing an unknown destination.
- Fixed SayIntentions Messages tab alignment so it uses the full ATC workspace width instead of inheriting the clearance two-column offset.
- Added airline identity badges/icons and kept common aviation terms such as Taxi, Enroute, Parking and Boarding in English in the German UI.
- Added an in-app update changelog and retained GitHub/electron-updater release notes in update state.
- Fixed a critical builder-state regression where **Build Package** / **Build & Install** could report the SDK as unavailable immediately after successful detection.
- Added a regression check that verifies the build path uses the trusted internal detected SDK state rather than the sanitized public status object.
- No changes to the Phase-3 route bridge, Flight Intelligence, Turnaround Coordinator or Flight Assistant behavior.

## 1.7.1 — Native EFB Community Package Builder

- Added a Windows-hosted MSFS 2024 EFB Package Builder that detects the locally installed SDK/EFB template and uses the installed `fspackagetool.exe` instead of redistributing Microsoft SDK files.
- Added automatic `Community2024` discovery by reading `InstalledPackagesPath` from the user's existing `UserCfg.opt`; Flight Deck never modifies that file.
- Added explicit **Build Package** and **Build & Install** actions plus ZIP export and Explorer output access. Community installation is never performed without an explicit user action.
- Builder work happens in an isolated local copy of the SDK EFB sample, preserving compatibility with the user's installed SDK project format.
- SDK/Community paths and detailed build output remain Windows-host-only; paired tablets receive only sanitized builder readiness/progress state.
- Added builder status, progress, path overrides and diagnostics to Settings, plus release-CI contract checks for the new service and UI.

## 1.7.0 — Phase 3 Native EFB & Flight Intelligence

- Upgraded the MSFS 2024 native EFB source from a fixed-port iframe wrapper to a native route bridge with automatic Flight Deck host discovery across ports 39871–39890.
- Added documented `GET_EFB_ROUTE` ingestion and `AvionicsRouteSync` observation for the MSFS 2024 Planned Route API. Flight Deck intentionally does not call route-write methods that remain incompletely documented/stubbed by the SDK.
- Added a local Route Sync Service that normalizes the MSFS EFB route, builds the current Flight Deck/SimBrief route and compares airports, runways, procedures and enroute waypoints without exposing connector credentials.
- Added a stabilized Flight Intelligence engine with phase-transition dwell/hysteresis on top of MSFS, ATC and route context. Manual phase override still has priority and existing phase-triggered automations automatically use the stabilized phase.
- Added a Turnaround Coordinator that combines flight-plan, aircraft and documented GSX state into departure/arrival progress, blockers and the next recommended step without remotely starting/cancelling GSX services.
- Added a local, advisory-only Flight Assistant for Ground Safety, route mismatch, projected fuel reserve, arrival weather, flight-plan/route readiness and turnaround recommendations.
- Added Flight Intelligence and Route Bridge cards to Flight Hub, Turnaround Coordinator to Ground Services and Flight Assistant advisories to Home.
- Added loopback-only native EFB bridge endpoints with explicit CORS handling; they expose route/status data only and never credentials or Windows update controls.
- Updated diagnostics, privacy, legal notices, native-EFB build instructions, version strings and cache identifiers for 1.7.0.

## 1.6.0 — Phase 2 Aircraft & Ground Intelligence

- Added a central Aircraft Adapter Layer that automatically selects Fenix, PMDG or Generic SimConnect for the loaded aircraft.
- Added a Fenix adapter that combines official Remote EFB health with only the MSFS Input Events actually enumerated for the active aircraft; no unofficial Fenix LVar catalog is bundled.
- Added PMDG 737/777 local SDK discovery. Available control events are derived at runtime from the user's installed PMDG SDK header and Data Broadcast readiness is reported without rewriting PMDG configuration.
- Upgraded GSX from installation-only detection to documented live service/passenger/cargo LVar monitoring. SimBrief passenger count can be explicitly synchronized to the documented GSX passenger target while service commands stay native to GSX/Fenix.
- Added intelligent Ground / Taxi Safety advisories for route deviation, excessive taxi speed, hold-short approach without detected runway authorization, stand-approach speed and close moving ground traffic.
- Integrated Ground Safety into the Taxi warning banner and Ground Services app with caution/warning/critical severity.
- Added Aircraft Adapter, Ground Safety and enhanced GSX state to diagnostics/support metadata without exposing secrets or full local SDK paths.
- Updated the Aircraft/Ground UI, legal compatibility names, settings integration overview and all visible application/cache version strings to 1.6.0.
- Rewrote README setup/data-flow/safety documentation to match the current product and removed stale installer/updater statements.
- GitHub Release notes are now generated from the matching CHANGELOG section instead of a hard-coded older release description.

## 1.5.0 — Phase 1 connectors

- Hardened SimConnect health reporting with a telemetry watchdog while preserving transport connections on optional data errors.
- Moved injected/all-object traffic fallback into the shared host so Flightboard traffic works consistently in Windows and portable/tablet-host modes.
- Expanded SayIntentions communications history to a deduplicated 2,000-message per-flight session window while keeping incremental SAPI polling.
- Expanded normalized SimBrief OFP data with procedures, cruise planning, distances, additional weights/fuel/timing and METAR/TAF fields.
- Extended VATSIM and IVAO refresh data with relevant live pilots in addition to ATC and ATIS.
- Added a local-only Little Navmap WebAPI connector on port 8965 for simulator-health cross-checks and airport metadata/weather/frequency enrichment.
- Added Little Navmap, SimConnect data-health and traffic status to diagnostics and the Settings integration overview.

## 1.4.4 — SayIntentions operations

- Selectable weather source: Auto, SayIntentions or AviationWeather.gov.
- Continuous SayIntentions parking synchronization, including assignments that appear after arrival.
- Explicit gate assignment through the SI `assignGate` session endpoint with immediate parking refresh.
- SI `getAirport` synchronization for active-flight airport operations data.
- Guarded SI ATC pause/resume controls.
- Explicit pilot text transmission to SI over COM1/COM2 via `sayAs`; inbound/spoofed channels are intentionally not exposed.
- Existing SI comms history, frequencies and weather polling remain active.
- VATSIM stays on the independent network connector; broad `setVar` access is intentionally not exposed.

## 1.4.1 — 24 August 2026

- Flightboard ALL now shows all detected nearby simulator aircraft; From/To is retained where MSFS exposes a schedule and sensibly inferred from current-airport/state where possible. Raw generic states such as “simple flight” are normalized.
- Floating navigation now behaves as real tabs: only the active Settings or ATC section is shown, and Flight Hub stays inside one stable module while switching Operations, Tracking and Archive.
- Enlarged the embedded Fenix Remote EFB work area.
- Improved Home airport/runway/gate presentation and added local stand inference when a stationary aircraft is close to a mapped parking position.
- Taxi route progress now follows a progressive segment window to avoid implausible jumps across nearby or intersecting taxiways.
- ATC provider selection was removed from the UI; source selection is always automatic and the detected provider is shown read-only.
- Checks GitHub for updates on every Windows-app start and presents available updates in an in-app dialog with explicit download and install actions.
- Added a preferred display name to onboarding and Settings so the Home greeting can address the pilot personally.
- Combined Flight and Flight Tracking into one Flight Hub entry with a floating submenu for Operations, Tracking & Map, and Archive workflows.
- Reorganized Settings with a floating submenu and combined Integration Status with Diagnostics/System Health.
- Removed the Pilot Profile setup and presets from the visible UI.
- Added a SimBrief quick-import action on Home while keeping automatic SayIntentions/MSFS flight detection as the default.
- Flight recording remains automatic; the manual start-recording control was removed.
- Added live simulator traffic to the tracking map with callsign labels and session-observed traffic trails selectable from aircraft markers.
- Taxi planning now exposes runway holding-point selection and defaults departures to the outermost available holding point.
- Reorganized ATC Center with a floating submenu for Source, Clearance, Messages, and Online Networks.
- COM now proposes a context-aware next station/frequency from currently available SayIntentions or online-network frequencies. Tuning still requires an explicit click.
- Added optional contextual help text throughout the interface, configurable in onboarding and Settings.
- Preserves local settings, preferred name, help preference, paired devices, flight archive, and onboarding completion across in-place updates.
- Added an additional light-theme control audit so secondary, disabled, compact, and floating-navigation buttons remain readable.
- Navigraph remains disabled until a compliant integration is explicitly re-enabled.

## 1.3.2 — 24 August 2026

- Stabilized MSFS 2024 SimConnect connection handling and protocol order.
- Improved Light Mode contrast, active-flight destination recovery, airline identification in Flightboard, combined Taxi/Taxi Planning, and a larger maximized desktop window.

## 1.2.0 — 24 August 2026

- Combined SayIntentions/BeyondATC, VATSIM, and IVAO into one ATC Center.
- Added an optional complete SayIntentions message-session view.
- Disabled the standalone Charts launcher until a compliant Navigraph product placement and developer approval are available.
- Added Light/Dark display controls, responsive Automations, installer/update foundations, legal notices, local tablet access, SimBrief, COM, Flightboard, GSX, Fenix, taxi planning, flight tracking, and six UI languages.

Flight simulation use only — not for real-world navigation.
