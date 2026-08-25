# Flight Deck EFB — Privacy and data flow

Effective for version 1.6.0 (25 August 2026)

Flight Deck EFB is a local companion for flight simulation. The Windows host stores settings, paired-device tokens, cached airport data, automation rules, flight recordings and the optional SimBrief identifier in the current Windows user's application-data folder. A normal application update keeps this data. **New Flight** resets the current operational session but does not delete the archive or application preferences.

## Connections and local reads

Depending on the features selected by the user, Flight Deck EFB can use:

- Microsoft Flight Simulator through the local SimConnect interface;
- local SayIntentions flight data and SayIntentions SAPI endpoints for the active flight;
- local BeyondATC log files in read-only compatibility mode;
- the Fenix Remote EFB/Web MCDU on a local/private address using port 8083;
- locally installed PMDG SDK header/options files to discover controls and SDK Data Broadcast readiness. Flight Deck does not upload or redistribute the SDK files;
- the local GSX/FSDreamTeam installation, Couatl process state and documented GSX SimConnect variables. An explicit payload-sync action can write the imported SimBrief passenger target to the documented GSX passenger-count variable;
- the local Little Navmap WebAPI when its web server is enabled;
- SimBrief for the latest OFP belonging to a user-supplied Pilot ID or username;
- AviationWeather.gov for METAR/TAF;
- VATSIM or IVAO public feeds only when an online network is selected;
- OpenStreetMap/Overpass and optional map imagery providers for selected map features; and
- GitHub Releases for Windows update checks and update downloads.

Navigraph chart functionality in the standalone build remains disabled unless a separately approved integration is available. Flight Deck EFB does not operate its own analytics, advertising or telemetry service.

## Aircraft adapters and Ground Safety

Aircraft Adapter detection and Ground/Taxi Safety evaluation run locally. Ground Safety uses simulator position/speed, taxi guidance, hold-short markers, gate position and locally received traffic state. These advisory evaluations are not sent to an OpenAI service or to a Flight Deck analytics backend.

Fenix controls exposed by Flight Deck are limited to MSFS Input Events actually enumerated for the loaded aircraft. PMDG controls are derived from the SDK header installed on the user's PC. Full PMDG SDK source text and full local file paths are not returned to browser clients.

## Credentials and mobile access

The SayIntentions API key is obtained from the local active-flight response and remains inside the Windows host process. Secrets and account tokens are not returned to the tablet UI or included in support exports.

iPad, iPhone, Android and second-monitor browsers connect directly to the Windows host on the private LAN. Access is protected by a rotating pairing PIN and an individually revocable device token. LAN sharing can be disabled in Settings. Do not expose the local host port directly to the public internet.

## Exports and deletion

Flight GPX/JSON exports and user-created backups are written only after an explicit action. The support export intentionally omits API keys, login tokens, ATC message content, flight notes, PMDG SDK source and full local file paths. Paired devices can be revoked in Settings. Local application data can be removed using in-app controls where available or by uninstalling the application and deleting its application-data folder.

Third-party providers process requests under their own privacy notices and terms. See `THIRD_PARTY_NOTICES.md` for licensing and compatibility notices.

Flight simulation use only — not for real-world navigation.
