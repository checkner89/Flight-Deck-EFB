# Flight Deck EFB changelog

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
