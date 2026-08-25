# Flight Deck EFB — native MSFS 2024 EFB app (Phase 3)

This folder contains the native Microsoft Flight Simulator 2024 EFB surface for Flight Deck EFB 1.7.1. The Windows application remains the trusted host for SimConnect, local storage, connector credentials, automations and safety checks. The in-simulator app adds a native route bridge and displays the same responsive Flight Deck interface inside MSFS.

## What the native app does

- Automatically discovers the Windows Flight Deck host on `127.0.0.1` ports **39871–39890** instead of assuming a single fixed port.
- Displays Flight Deck EFB directly in the simulator EFB once the host is found.
- Reads the current MSFS EFB route through the documented Planned Route API call `GET_EFB_ROUTE` and sends a sanitized copy to the local Flight Deck host for comparison with the imported/known Flight Deck route.
- Observes the documented `AvionicsRouteSync` event so Flight Deck can show when MSFS broadcasts the EFB route after **Sync Route To Avionics** is selected.
- Keeps route comparison, flight intelligence, turnaround coordination and Flight Assistant evaluation local to the PC.

## Deliberate route-sync limits

The MSFS 2024 SDK currently documents `GET_EFB_ROUTE` and the `AvionicsRouteSync` event as usable route interfaces. Several direct route-write calls are still documented as **COMING SOON**. Flight Deck therefore does **not** invoke undocumented/stub route-write methods or legacy GPS write variables.

To send the simulator EFB route to supported aircraft avionics, use the normal MSFS **Sync Route To Avionics** flow. Flight Deck observes that native action and records its status; it does not bypass the simulator's avionics ownership model.

Flight Deck also does not answer `AvionicsRouteRequested` automatically. The SDK warns that multiple instrument responses to a route request are undefined, so the aircraft's own avionics/instrument remains the authoritative provider.

## Recommended build method in 1.7.1

Use the Windows app under **Settings → System → Native EFB Package Builder**. It detects the installed SDK/EFB sample and `fspackagetool.exe`, prepares an isolated copy of the SDK sample, replaces only the Flight Deck app source, builds the template and exports a Community package/ZIP. If requested explicitly, it can copy the finished package to `Community2024`.

The builder reads `InstalledPackagesPath` from the existing MSFS `UserCfg.opt` to locate the package root; it never modifies that file. Full local paths stay in the Windows host and are not shared with paired tablets.

## Manual build with your installed MSFS 2024 SDK

The Microsoft EFB API, template project and SDK build dependencies are not redistributed by this repository. Build the app against the EFB template installed with your own current MSFS 2024 SDK:

1. Start Flight Deck EFB for Windows and leave the host/tray process running.
2. In the MSFS 2024 SDK EFB samples, copy `PackageSources/TemplateApp` to a new folder named `FlightDeckEFB`.
3. Replace the template app's main `.tsx` and `.scss` files with `src/FlightDeckEFB.tsx` and `src/FlightDeckEFB.scss` from this folder.
4. Copy `src/Assets/app-icon.svg` into the matching Assets folder.
5. Update the copied template's build entry to `FlightDeckEFB.tsx` if required by the installed SDK version.
6. Run the SDK-prescribed `npm install` / build steps in the EFB API and copied app folders.
7. Add the resulting `dist` folder to the package Copy asset group exactly as prescribed by the SDK EFB template, then build the package in DevMode.
8. Open **Flight Deck EFB** in the simulator EFB. The bridge finds the Windows host automatically. Pair the embedded Flight Deck UI once if the host requests the normal six-digit PIN.
9. Use **COMPARE EFB ROUTE** to refresh the MSFS EFB → Flight Deck comparison at any time.

## Security model

The native bridge endpoints are available only from the Windows loopback interface and expose no connector credentials, access tokens or update controls. The native app can read route state and report simulator route-sync events; simulator writes remain subject to the same explicit-action and allowlist rules as the Windows application.

This source is intentionally kept separate from the MSFS SDK template/build files so Flight Deck does not redistribute Microsoft SDK material and can remain compatible with the SDK version installed by the user.

Flight simulation use only — not for real-world navigation.
