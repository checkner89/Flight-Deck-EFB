# Flight Deck EFB

Desktop companion for Microsoft Flight Simulator.

> Flight simulation use only — not for real-world navigation.

## Current integration branch

The branch `setup/github-updater-simconnect` contains the first installable diagnostic build for:

- Microsoft Flight Simulator / SimConnect connectivity
- automatic SimConnect reconnect attempts
- readable connection diagnostics
- GitHub Releases based application updates
- Windows x64 NSIS installer generation

The full existing Flight Deck EFB renderer still has to be migrated into this repository. The diagnostic build is intentionally small so SimConnect and the updater can be validated independently first.

## Local test on Windows

Requirements:

- Windows 10 or Windows 11
- Node.js 24
- Microsoft Flight Simulator 2020 or 2024 for the SimConnect test

Commands:

```powershell
npm install
npm start
```

Then:

1. Start Microsoft Flight Simulator.
2. Load into an actual flight so the simulator session is running.
3. Start Flight Deck EFB.
4. The SimConnect card should change from `GETRENNT` / `VERBINDET …` to `VERBUNDEN`.
5. If the simulator is not running, Flight Deck EFB retries automatically every five seconds.
6. Use **Erneut verbinden** for an immediate manual retry.
7. Technical connection errors are shown separately from the user-facing status text.

## Build a Windows installer locally

```powershell
npm install
npm run dist
```

The installer is written to `dist/` and uses this naming scheme:

```text
Flight-Deck-EFB-Setup-<version>.exe
```

## GitHub as updater

Flight Deck EFB uses GitHub Releases as its update feed.

The intended release flow is:

1. Develop and test changes on a branch.
2. Merge the tested changes into `main`.
3. Increase the `version` in `package.json`, for example from `1.2.0` to `1.2.1`.
4. Create and push a tag with the same version, for example `v1.2.1`.
5. The GitHub Actions workflow builds the Windows x64 installer.
6. `electron-builder` publishes the installer plus update metadata to the GitHub Release.
7. Installed Flight Deck EFB clients check GitHub Releases automatically.
8. When a newer version is available, the app downloads it and offers installation.

### Important

The version in `package.json` and the Git tag should match:

```text
package.json: 1.2.1
Git tag:      v1.2.1
```

Do not publish the same version twice. Every release needs a higher version number.

## GitHub Actions

The workflow is located at:

```text
.github/workflows/release.yml
```

A manual workflow run builds an installer artifact for testing. A `v*` tag publishes a GitHub Release.

## SimConnect implementation

The application uses `node-simconnect` and opens the local SimConnect session with the KittyHawk protocol. This supports the MSFS generation used by current Microsoft Flight Simulator releases.

The EFB treats a missing simulator as a normal disconnected state, not as an application crash. It provides:

- automatic retry every 5 seconds
- manual retry
- separate technical diagnostics
- simulator application name after a successful connection

## Third-party software

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

Flight Deck EFB source code: MIT. See [LICENSE](LICENSE).
