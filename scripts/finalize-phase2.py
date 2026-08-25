from pathlib import Path
import re

adapter = Path('src/aircraft-adapter-manager.mjs')
text = adapter.read_text(encoding='utf-8')

pattern = re.compile(r"    if \(adapter\.startsWith\('pmdg'\)\) \{\n      const control = this\.listControls\('', \{ limit: 500 \}\)\.find\(\(entry\) => entry\.id === id\);\n      if \(!control\) throw new Error\('PMDG-Steuerbefehl ist nicht im lokal installierten SDK freigegeben\.'\);\n      const numeric = Number\(value\);\n      if \(!Number\.isFinite\(numeric\) \|\| numeric < 0 \|\| numeric > 0xFFFFFFFF\) throw new Error\('PMDG-Steuerwert ist ungültig\.'\);\n      return this\.simConnect\.transmitEventNumber\(control\.eventNumber, Math\.round\(numeric\)\);\n    \}")
replacement = """    if (adapter.startsWith('pmdg')) {
      const family = adapter === 'pmdg-737' ? 'PMDG 737' : adapter === 'pmdg-777' ? 'PMDG 777' : null;
      const control = this.pmdgPackages
        .filter((entry) => !family || entry.family === family)
        .flatMap((entry) => entry.controls)
        .find((entry) => entry.id === id);
      if (!control) throw new Error('PMDG-Steuerbefehl ist nicht im lokal installierten SDK freigegeben.');
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 0xFFFFFFFF) throw new Error('PMDG-Steuerwert ist ungültig.');
      return this.simConnect.transmitEventNumber(control.eventNumber, Math.round(numeric));
    }"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'PMDG executeControl patch failed: {count}')

pattern = re.compile(r"    const pmdgBroadcast = matchingPackages\.length\n      \? matchingPackages\.some\(\(entry\) => entry\.broadcastEnabled === true\)\n      : null;")
replacement = """    const knownBroadcastPackages = matchingPackages.filter((entry) => entry.broadcastEnabled !== null);
    const pmdgBroadcast = knownBroadcastPackages.length
      ? knownBroadcastPackages.some((entry) => entry.broadcastEnabled === true)
      : null;"""
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'PMDG broadcast patch failed: {count}')
adapter.write_text(text, encoding='utf-8')

Path('PRIVACY.md').write_text('''# Flight Deck EFB — Privacy and data flow

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
''', encoding='utf-8')

Path('THIRD_PARTY_NOTICES.md').write_text('''# Third-party notices — Flight Deck EFB 1.6.0

Flight Deck EFB is an independent flight-simulation companion. It is not affiliated with or endorsed by Microsoft/Asobo Studio, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix Simulations, PMDG, FSDreamTeam/GSX, Little Navmap, VATSIM, IVAO, OpenStreetMap, OurAirports or Esri unless explicitly stated otherwise.

## Bundled/open-source components

- Node.js — runtime/build tooling with its applicable open-source licenses and bundled notices.
- Electron — MIT; the Windows runtime also includes Chromium and their applicable third-party notices.
- electron-updater and electron-builder — MIT; used for GitHub Release updates and Windows packaging. NSIS/generated installer components retain their own licenses.
- Leaflet — BSD-2-Clause.
- node-simconnect — LGPL-3.0-or-later.
- qrcode and runtime dependencies — their respective open-source licenses.
- OpenStreetMap airport geometry and standard map data — © OpenStreetMap contributors; ODbL/usage policies apply. Required attribution is shown in the application.
- OurAirports airport/runway data — public-domain source data; the generated local catalog records source/generation metadata.
- Esri World Imagery — optional imagery; provider attribution/terms apply when selected.

## Optional compatibility interfaces and services

- Microsoft Flight Simulator / SimConnect — local simulator interface; Microsoft/Asobo terms and SDK terms apply.
- SayIntentions.AI — optional active-flight/SAPI compatibility. No SayIntentions account credential or API key is distributed with Flight Deck.
- BeyondATC — optional local, read-only log compatibility. No BeyondATC code or assets are distributed.
- SimBrief — official latest-OFP endpoint used with a Pilot ID or username; SimBrief/Navigraph terms apply.
- AviationWeather.gov — requested METAR/TAF data; provider terms and operational disclaimers apply.
- VATSIM and IVAO — official/public live-network feeds queried on user request; network API/data policies apply.
- Little Navmap — optional local WebAPI compatibility. Little Navmap code/data is not bundled by Flight Deck.
- Fenix Simulations — compatibility uses the official local Remote EFB/Web MCDU and MSFS Input Events available from the user's installed/running aircraft. Flight Deck does not distribute a private/unofficial Fenix variable catalog.
- PMDG — compatibility discovers SDK header/options files already installed with the user's PMDG product. Flight Deck parses event identifiers at runtime and **does not bundle, copy or redistribute PMDG SDK source/header content**. PMDG product/SDK terms remain applicable.
- FSDreamTeam/GSX — compatibility uses local installation/process detection and documented GSX variables. Flight Deck does not bundle GSX code/assets and does not emulate a general GSX remote-service API.
- Navigraph — standalone chart embedding remains disabled pending an approved, license-compliant integration.

Product names and trademarks are property of their respective owners. Their appearance identifies optional compatibility only and does not imply sponsorship, certification or affiliation.

Copyright © 2026 Christoph Heckner. Flight Deck EFB application code is provided under the accompanying MIT License. That license does not relicense third-party data, trademarks, runtimes, SDKs, libraries, map imagery or service APIs.

The Electron distribution retains its runtime/Chromium notices. Individual dependency licenses remain with their packages and packaged resources as applicable. See `PRIVACY.md` for local storage, LAN access, optional network requests, adapter data flow, exports and deletion.

Flight simulation use only — not for real-world navigation.
''', encoding='utf-8')
