# Third-party notices — Flight Deck EFB 1.3.0

Flight Deck EFB is an independent community project. It is not affiliated
with or endorsed by SayIntentions.AI, Microsoft, Asobo Studio, TaxiNow,
OpenStreetMap, OurAirports, Navigraph/SimBrief, FSDreamTeam/GSX, Fenix
Simulations, VATSIM, IVAO, BeyondATC, or any online network division.

The application includes or uses:

- Node.js — MIT and bundled third-party licenses; used as the application/build
  runtime where applicable.
- Electron — MIT; used by the native Windows package. Its Windows runtime also
  contains Chromium and bundled third-party licenses.
- electron-updater and electron-builder — MIT; used for GitHub Release update
  checks and Windows packaging. The installer is generated with NSIS; bundled
  installer components retain their own applicable notices and licenses.
- Leaflet — BSD-2-Clause.
- node-simconnect — LGPL-3.0-or-later.
- qrcode and its runtime dependencies — MIT and compatible open-source
  licenses.
- OpenStreetMap airport geometry — © OpenStreetMap contributors, available
  under the Open Database License (ODbL). Attribution is displayed in the map.
- OpenStreetMap standard raster tiles — © OpenStreetMap contributors. Loaded
  only in the Flight Tracking map with on-map attribution.
- Esri World Imagery — satellite/aerial basemap tiles and provider attribution
  are displayed in the Flight Tracking map when Satellite mode is selected.
- OurAirports airport and runway data — released into the public domain. The
  bundled compact catalog records its source and generation timestamp.
- AviationWeather.gov — public aviation-weather API used for requested
  METAR/TAF data; the response remains subject to the provider's terms and
  operational disclaimers.
- VATSIM and IVAO — official public live-network feeds, queried only on user
  request. Their data remains subject to the respective network terms and API
  policies.
- SayIntentions.AI, SimBrief/Navigraph, BeyondATC, Fenix Remote EFB, and GSX —
  optional compatibility interfaces. Access and returned content remain
  subject to each provider's account, API, and product terms. No provider API
  key is distributed with Flight Deck EFB. Navigraph connectivity is disabled
  in Flight Deck EFB 1.3.0.

Product names including Microsoft Flight Simulator, SayIntentions.AI,
BeyondATC, Navigraph, SimBrief, Fenix, GSX, VATSIM, and IVAO are trademarks or
names of their respective owners. Their appearance identifies optional
compatibility only and does not imply sponsorship, certification, or
affiliation.

Flight simulation use only — not for real-world navigation.

Copyright © 2026 Christoph Heckner. Flight Deck EFB application code is
provided under the accompanying MIT License. This license does not relicense
third-party data, trademarks, runtimes, libraries, map tiles, or service APIs.

The Electron distribution retains its runtime and Chromium third-party notices.
Individual dependency licenses remain with their packages in `node_modules` or
inside the packaged application resources as applicable.

See `PRIVACY.md` for the local storage, LAN access, optional network requests,
credential handling, export, and deletion summary.

TaxiNow code, assets, map files, and protected implementation details are not
included, copied, or reverse engineered. The application uses independently
implemented rendering and public OpenStreetMap, OurAirports, SayIntentions, and
SimConnect interfaces.
