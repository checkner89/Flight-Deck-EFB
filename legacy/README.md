# Restored Flight Deck EFB source

This branch restores the complete pre-GitHub Flight Deck EFB 1.2.0 application instead of replacing it with the temporary diagnostics UI.

The Windows build workflow expects the prepared source package at:

`legacy/Flight-Deck-EFB-1.2.2-source.zip`

The archive expands to `app-source/` and contains the original 1.2.0 UI and runtime modules, updated to version 1.2.2 with the working GitHub auto-updater and more robust SimConnect connection-state handling.

The source package includes the bundled OurAirports offline catalog and application icon assets from the original 1.2.0 release.
