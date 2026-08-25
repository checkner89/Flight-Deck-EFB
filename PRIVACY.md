# Flight Deck EFB — Privacy and data flow

Effective for version 1.7.6 (25 August 2026)

Flight Deck EFB is a local companion for flight simulation. The Windows host stores settings, paired-device tokens, cached airport data, automation rules, flight recordings and the optional SimBrief identifier in the current Windows user's application-data folder. Normal application updates keep this data. **New Flight** resets the current operational session but does not delete the archive or application preferences.

## Connections and local reads

Depending on selected features, Flight Deck EFB can use:

- Microsoft Flight Simulator through the local SimConnect interface;
- the optional native MSFS 2024 EFB app. Its loopback-only bridge reads the current EFB route through the documented Planned Route read API and reports the simulator's avionics-route-sync event to the Windows host;
- local SayIntentions flight data and SAPI endpoints for the active flight;
- local BeyondATC log files in read-only compatibility mode;
- the Fenix Remote EFB/Web MCDU on a local/private address using port 8083;
- locally installed PMDG SDK header/options files to discover controls and SDK Data Broadcast readiness. Flight Deck does not upload or redistribute those files;
- local GSX/FSDreamTeam installation/Couatl state and documented GSX SimConnect variables. An explicit payload action can write the imported SimBrief passenger target to the documented GSX passenger-count variable;
- the local Little Navmap WebAPI when enabled;
- SimBrief for the latest OFP belonging to a user-supplied Pilot ID/username;
- AviationWeather.gov for METAR/TAF;
- VATSIM or IVAO public feeds only when selected;
- OpenStreetMap/Overpass and optional map imagery providers; and
- GitHub Releases for Windows update checks/downloads.

Navigraph chart functionality in the standalone build remains disabled unless a separately approved integration is available. Flight Deck EFB does not operate its own analytics, advertising or telemetry service.

## Native EFB route data

The native MSFS 2024 adapter can send a sanitized planned-route object to `127.0.0.1` for local comparison. Flight Deck stores only normalized route fields needed for the active session (airport/runway/procedure identifiers, cruise altitude and enroute waypoint identifiers/coordinates where provided). A New Flight session clears the previous simulator-EFB route comparison state.

The native bridge endpoints are loopback-only and do not expose connector credentials, paired-device tokens or update-management controls. Flight Deck does not upload the native route to a Flight Deck cloud service.

## Flight Intelligence, Turnaround and Flight Assistant

Automatic Flight Intelligence, Turnaround Coordinator and Flight Assistant evaluation run locally in the Windows host. They use already available simulator/ATC/route/weather/GSX state. The assistant is a deterministic advisory engine; it does not send these inputs to an OpenAI service or other cloud AI provider and it cannot independently control the simulator.

## Aircraft adapters and Ground Safety

Ground/Taxi Safety evaluation also runs locally. Fenix controls exposed by Flight Deck are limited to MSFS Input Events actually enumerated for the loaded aircraft. PMDG controls are derived from SDK headers installed on the user's PC. Full PMDG SDK source text and full local file paths are not returned to browser clients.

## Credentials and mobile access

The SayIntentions API key remains inside the Windows host process. Secrets/account tokens are not returned to tablet UI clients or included in support exports.

iPad, iPhone, Android and second-monitor browsers connect directly to the Windows host on the private LAN. Access is protected by a rotating pairing PIN and individually revocable device token. LAN sharing can be disabled in Settings. Do not expose the local host port to the public internet.

## Exports and deletion

Flight GPX/JSON exports and user-created backups are written only after an explicit action. The support export intentionally omits API keys, login tokens, ATC message content, flight notes, PMDG SDK source and full local file paths. Paired devices can be revoked in Settings.

The Windows uninstaller removes the application but **does not automatically delete the Flight Deck EFB application-data folder**. This intentionally preserves local settings, caches and flight history across uninstall/reinstall. To remove the remaining local data completely, delete the Flight Deck EFB application-data folder after uninstalling.

Third-party providers process optional requests under their own privacy notices and terms. See `THIRD_PARTY_NOTICES.md` for licensing and compatibility notices.

Flight simulation use only — not for real-world navigation.


## MSFS 2024 EFB Package Builder

The optional builder reads the locally installed MSFS 2024 SDK/template and may read `UserCfg.opt` only to determine `InstalledPackagesPath`/`Community2024`. It does not modify `UserCfg.opt`, upload SDK files, or send local SDK/Community paths to paired devices. Optional path overrides, build logs and package exports are stored locally on the Windows host. Installation into Community2024 occurs only after an explicit user action.
