# Flight Deck EFB — Privacy and data flow

Effective for version 1.2.0 (24 August 2026)

Flight Deck EFB is a local companion for flight simulation. The Windows host
stores settings, paired-device tokens, cached airport data, automation rules,
flight recordings and the SimBrief identifier in the current Windows user's
Local AppData folder. A normal application update keeps this data. **New
Flight** resets the current operational session but does not delete the archive
or application preferences.

## Connections made by the application

Depending on the features selected by the user, the Windows host can connect
to:

- Microsoft Flight Simulator through local SimConnect;
- local SayIntentions flight data and the SayIntentions SAPI endpoints exposed
  for the active account;
- local BeyondATC log files in read-only compatibility mode;
- the local Fenix Remote EFB and local GSX/Couatl installation status;
- SimBrief for the latest OFP belonging to the saved Pilot ID or username;
- Navigraph authentication endpoints only when approved developer credentials
  are configured and the user starts Device Login;
- AviationWeather.gov for METAR/TAF;
- VATSIM or IVAO public feeds only after an online network is selected;
- OpenStreetMap/Overpass, OpenStreetMap standard tiles, and Esri World Imagery
  for the map features selected by the user; and
- an HTTPS Squirrel release feed only when the distributor configures
  `FLIGHT_DECK_UPDATE_URL`.

These providers process requests under their own privacy notices and terms.
Flight Deck EFB does not operate an analytics, advertising, or telemetry
service of its own.

## Credentials and mobile access

The SayIntentions API key is obtained from the local active-flight response and
kept inside the Windows host process. Navigraph tokens are protected with
Windows encryption when available. Neither value is returned to the tablet UI
or included in backups and support exports.

iPad, iPhone, Android, and second-monitor browsers connect directly to the
Windows host on the private LAN. Access is protected by a rotating pairing PIN
and an individually revocable device token. LAN sharing can be disabled in
Settings. Do not expose the local host port directly to the public internet.

## Exports and deletion

Flight GPX/JSON exports and user-created backups are written only after an
explicit action. The support export omits API keys, login tokens, ATC message
content, and flight notes. Paired devices can be revoked in Settings. Local
application data can be removed using the in-app controls where available or
by uninstalling the application and deleting its Local AppData folder.

Flight simulation use only — not for real-world navigation.
