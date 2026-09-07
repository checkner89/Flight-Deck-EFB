# Updater, MSFS traffic and taxi review

Reviewed against main `5f780e7` (1.24.13). This change is a source-level repair candidate, not a Windows/MSFS certification. No release version is changed.

| Area | Finding and resulting behavior |
|---|---|
| Build | Historical scripts reconstruct runtime files. Apply contextual reliability changes last and fail on changed baselines. Repeated preparation must retain fixes. |
| Updater | Concurrent checks could overwrite downloaded state; any error permitted download without metadata. Serialize actions, preserve downloaded state, retry downloads only after download errors. |
| Installer | Full downloads and visible NSIS installation; explicit install. Preserve the update backup restore flag during shutdown. Close lingering HTTP connections. |
| Release | GitHub v1.24.13 had installer, blockmap and latest.yml during review. The specific user failure is unknown without the error/log. Asset presence does not verify installation. |
| Traffic batches | Both readers added one to the SDK's 1-based entry number, finishing multi-object results early. Correct both. |
| Traffic lifetime | Clear fallback objects and pending enrichment on disconnect; prevent disconnected callbacks republishing; expire fallback restoration after 10 seconds and time out optional plan requests. |
| Traffic scope | SimConnect allows 200,000 m around ownship. Show 107.9 NM, retain 80 NM descent/approach filtering and 120 rows. No guarantee of complete injector traffic. |
| Traffic status | Without reported state, show stopped/ground movement, descent/climb or airborne. Descent does not prove arrival at the selected airport. Missing position cannot pass radius filtering. |
| Taxi geometry | Remove synthetic parking connectors and 650–1,200 m straight joins; limit endpoint association to 60 m. Missing connectivity produces no route and an explanation. |
| Taxi clearance | Do not relax A-B through unrelated named taxiways. Keep actual route names. Manual planning remains on connected map data. |
| News | Old preparation can recreate News files. Remove all three runtime files at the final stage. |

## Supported boundary

MSFS position, motion, radio and facility data depend on live SimConnect and the aircraft/scenery exposing requested data. Traffic is read-only; optional airline, flight plan, parking and runway data are not guaranteed for injectors. Taxi routes depend on connected airport geometry and are not ATC clearances.

Native MSFS EFB, aircraft-specific controls, GSX, BeyondATC and SayIntentions require their respective running components. They were not live-validated in this Linux environment and are not claimed as newly verified integrations.

## Validation

Behavioral tests cover updater concurrency/retries and one-shot install, two-object discovery, disconnect cleanup, connected taxi planning, disconnected starts and exact clearance matching. Existing traffic, persistence, tracking, News removal and single-instance checks are run. A Windows validation workflow is included.

Remaining practical checks: install over the user's Windows version; update/download/restart; MSFS 2024 with actual injector and airport add-on; compare taxi paths against scenery. Capture the updater error/support export if the original failure remains.

## References

- [Microsoft: radius limit](https://docs.flightsimulator.com/html/Programming_Tools/SimConnect/API_Reference/Events_And_Data/SimConnect_RequestDataOnSimObjectType.htm)
- [Microsoft: 1-based entry numbers](https://docs.flightsimulator.com/html/Programming_Tools/SimConnect/API_Reference/Structures_And_Enumerations/SIMCONNECT_RECV_SIMOBJECT_DATA.htm)
- [electron-builder: auto update](https://www.electron.build/docs/features/auto-update)
