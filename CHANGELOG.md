# Flight Deck EFB changelog

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
