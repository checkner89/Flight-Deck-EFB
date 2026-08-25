# SayIntentions operations in Flight Deck EFB 1.4.4

Flight Deck EFB 1.4.4 extends the existing SayIntentions integration with operational controls that are useful inside the EFB while keeping the SayIntentions API key server-side in the Windows host.

## Added

- Weather source selection: Auto, SayIntentions, or AviationWeather.gov.
- Continuous `getParking` synchronization for the active SI flight.
- Explicit gate assignment through `assignGate`, followed by a parking refresh.
- `getAirport` synchronization when a new SI flight session becomes active.
- Explicit SayIntentions ATC pause/resume through `setPause`.
- Explicit pilot text transmissions through `sayAs` on COM1 or COM2.
- Existing `getCommsHistory`, `getWX`, `getCurrentFrequencies`, and `setFreq` support remains active.

## Deliberately not exposed

- `setVar`: too broad for an EFB control surface and not required for the current feature set.
- inbound `sayAs` channels such as `COM1_IN`: these simulate messages to the pilot and can be misleading in a normal EFB workflow.
- SayIntentions `getVATSIM`: Flight Deck EFB keeps its independent VATSIM/IVAO network connector.
- `getTFRs`: deferred until the app has a dedicated airspace/TFR map layer where the GeoJSON can be presented meaningfully.

Flight simulation use only — not for real-world navigation.
