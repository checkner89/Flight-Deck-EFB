# Flight Deck EFB – optional MSFS 2024 EFB app

This folder contains the thin in-simulator surface for Flight Deck EFB. The
Windows app remains the host and owns SimConnect, pairing, storage and all
automation safety checks. The simulator app only displays the same responsive
EFB at `http://127.0.0.1:39871/`.

The Microsoft Flight Simulator 2024 SDK EFB API and its build dependencies are
not redistributed here. Build the adapter against the EFB template installed
with your own SDK:

1. Start Flight Deck EFB and keep its tray icon running.
2. In the MSFS 2024 SDK samples, copy `PackageSources/TemplateApp` to a new
   folder named `FlightDeckEFB`.
3. Replace the template's main `.tsx` and `.scss` source files with
   `src/FlightDeckEFB.tsx` and `src/FlightDeckEFB.scss` from this folder. Copy
   `src/Assets/app-icon.svg` into the matching Assets folder.
4. Update the copied template build entry from its old source filename to
   `FlightDeckEFB.tsx` if required by that SDK release.
5. Run `npm install` in the SDK `efb_api` folder and in the copied app folder,
   then run `npm run build`.
6. Add the resulting `dist` folder to a Copy asset group using the output
   directory prescribed by the SDK EFB template. Build the package in DevMode
   before starting a flight.
7. Open **Flight Deck EFB** in the simulator EFB and enter the six-digit pairing
   PIN shown by the Windows host once.

The Windows host normally uses port 39871. If another process occupies it, the
host selects the next free port. In that uncommon case, change `HOST_URL` in
`FlightDeckEFB.tsx` and rebuild this adapter.

This is source for the official MSFS 2024 EFB template, not a prebuilt Community
package. The exact project XML and build dependencies come from the installed
SDK so they stay aligned with the user's simulator/SDK version.

Flight simulation use only — not for real-world navigation.
