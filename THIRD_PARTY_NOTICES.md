# Third-party notices — Flight Deck EFB 1.7.8

Flight Deck EFB is an independent flight-simulation companion. It is not affiliated with or endorsed by Microsoft/Asobo Studio, SayIntentions.AI, BeyondATC, Navigraph, SimBrief, Fenix Simulations, PMDG, FSDreamTeam/GSX, Little Navmap, VATSIM, IVAO, OpenStreetMap, OurAirports or Esri unless explicitly stated otherwise.

## Bundled/open-source components

- Node.js — runtime/build tooling with applicable open-source licenses/notices.
- Electron — MIT; the Windows runtime also includes Chromium and applicable third-party notices.
- electron-updater and electron-builder — MIT; used for GitHub Release updates and Windows packaging. NSIS/generated installer components retain their own licenses.
- Leaflet — BSD-2-Clause.
- node-simconnect — LGPL-3.0-or-later.
- qrcode and runtime dependencies — their respective open-source licenses.
- OpenStreetMap airport geometry/map data — © OpenStreetMap contributors; ODbL/usage policies apply. Attribution is shown in the application.
- OurAirports airport/runway data — public-domain source data; the generated local catalog records source/generation metadata.
- Esri World Imagery — optional imagery; provider attribution/terms apply when selected.

## Optional compatibility interfaces and services

- Microsoft Flight Simulator / SimConnect — local simulator interface; Microsoft/Asobo terms and SDK terms apply.
- Microsoft Flight Simulator 2024 EFB / Planned Route API — optional native adapter source uses the installed SDK template and documented route-read/event interfaces. Microsoft SDK/template/build files are not redistributed by Flight Deck. Direct route-write APIs that remain incompletely documented/stubbed are deliberately not used.
- SayIntentions.AI — optional active-flight/SAPI compatibility. No SayIntentions credential/API key is distributed with Flight Deck.
- BeyondATC — optional local, read-only log compatibility. No BeyondATC code/assets are distributed.
- SimBrief — latest-OFP endpoint used with a Pilot ID/username; SimBrief/Navigraph terms apply.
- AviationWeather.gov — requested METAR/TAF data; provider terms/operational disclaimers apply.
- VATSIM and IVAO — official/public live-network feeds queried on user request; network API/data policies apply.
- Little Navmap — optional local WebAPI compatibility. Little Navmap code/data is not bundled.
- Fenix Simulations — compatibility uses the official local Remote EFB/Web MCDU and MSFS Input Events available from the user's installed/running aircraft. Flight Deck does not distribute a private/unofficial Fenix variable catalog.
- PMDG — compatibility discovers SDK header/options files already installed with the user's PMDG product. Flight Deck parses event identifiers at runtime and **does not bundle, copy or redistribute PMDG SDK source/header content**.
- FSDreamTeam/GSX — compatibility uses local installation/process detection and documented GSX variables. Flight Deck does not bundle GSX code/assets and does not emulate a general GSX remote-service API. Phase-3 Turnaround coordination remains advisory and does not automatically start/cancel GSX services.
- Navigraph — standalone chart embedding remains disabled pending an approved, license-compliant integration.

Product names and trademarks are property of their respective owners. Their appearance identifies optional compatibility only and does not imply sponsorship, certification or affiliation.

Copyright © 2026 Christoph Heckner. Flight Deck EFB application code is provided under the accompanying MIT License. That license does not relicense third-party data, trademarks, runtimes, SDKs, libraries, map imagery or service APIs.

The Electron distribution retains its runtime/Chromium notices. Individual dependency licenses remain with their packages and packaged resources as applicable. See `PRIVACY.md` for local storage, LAN/loopback access, optional network requests, native-route data flow, exports and deletion.

Flight simulation use only — not for real-world navigation.


## Microsoft Flight Simulator 2024 SDK build integration

Flight Deck EFB does not redistribute the Microsoft Flight Simulator SDK or EFB template. The optional local package builder operates on the SDK/template installed by the user and invokes the user's installed `fspackagetool.exe`. Those Microsoft files retain their original terms and remain local to the user's PC.
