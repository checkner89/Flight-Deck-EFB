import json
from pathlib import Path

pkg_path = Path('package.json')
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['author'] = 'Christoph Heckner'
pkg.setdefault('build', {})['copyright'] = 'Copyright © 2026 Christoph Heckner'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

for filename in ['public/index.html', 'public/app.js', 'public/service-worker.js', 'src/server.mjs']:
    path = Path(filename)
    if path.exists():
        path.write_text(path.read_text(encoding='utf-8').replace('1.7.6', '1.7.7'), encoding='utf-8')

notices = Path('THIRD_PARTY_NOTICES.md')
text = notices.read_text(encoding='utf-8')
text = text.replace('# Third-party notices — Flight Deck EFB 1.7.6', '# Third-party notices — Flight Deck EFB 1.7.7', 1)
notices.write_text(text, encoding='utf-8')

readme = Path('README.md')
text = readme.read_text(encoding='utf-8')
text = text.replace('**Current release: 1.7.6 — Traffic & Taxi Recovery**', '**Current release: 1.7.7 — Installer & Legal Transparency**', 1)
text = text.replace('## 1.7.6 highlights', '## 1.7.7 highlights', 1)
old = """- **Live Traffic instead of fake FIDS:** the simulator traffic app now shows Ground / Arriving / Nearby based on observable MSFS traffic, not an airport departures/arrivals board that implies unavailable schedules.
- **No invented FROM/TO:** route/schedule fields are no longer presented unless another feature explicitly has a real flight plan. SayIntentions Living World knows its own schedules internally, but does not expose a documented public Living World traffic-list API to Flight Deck.
- **Wider Live Traffic scope:** Ground remains 8 NM, Arriving is 80 NM and Nearby is 120 NM; at most the closest 40 aircraft are rendered. Direct SimConnect discovery uses the documented 200 km (~108 NM) maximum, so the last ~12 NM of the Nearby UI scope can only be populated by another compatible source.
- **Honest status provenance:** simulator-published states are marked REPORTED; movement-based Parking/Taxi/Arriving classifications are marked INFERRED.
- **Stable airline identity:** local airline-code badges replace unreliable website-favicon images.
"""
new = """- **Installer license page:** assisted Windows Setup shows the MIT License together with simulation-only, privacy/LAN and third-party acknowledgements before installation.
- **Third-party notices in Setup:** the installer contains a dedicated scrollable notices page and still installs the complete `THIRD_PARTY_NOTICES.md` file.
- **Shortcut choice:** interactive Setup lets the user choose whether to create a Desktop shortcut; the Start Menu shortcut remains available.
- **Non-destructive updates/uninstall:** normal updates and uninstall/reinstall do not silently delete local settings, caches or flight history.
- **Windows metadata:** application author/copyright metadata now identifies **Christoph Heckner** consistently; the installer remains unsigned, so SmartScreen can still show an unknown-publisher warning.
"""
if old in text:
    text = text.replace(old, new, 1)
text = text.replace('Flight-Deck-EFB-Setup-1.7.6.exe', 'Flight-Deck-EFB-Setup-1.7.7.exe')
readme.write_text(text, encoding='utf-8')

changelog = Path('CHANGELOG.md')
text = changelog.read_text(encoding='utf-8')
marker = '# Flight Deck EFB changelog\n\n'
section = """## 1.7.7 — Installer & Legal Transparency

- Published the completed installer/legal work as **1.7.7**.
- Assisted Windows Setup includes the complete **MIT License** plus explicit simulation-only, privacy/LAN and third-party acknowledgements.
- Setup includes a dedicated scrollable **Third-party notices** page and a selectable **Create a Desktop Shortcut** task.
- Application author/copyright metadata now consistently identifies **Christoph Heckner**.
- Updated packaged legal/version references to 1.7.7 while retaining non-destructive update/uninstall behavior and the existing installer regression checks.
- The Windows executable is still **not code-signed**; SmartScreen may therefore continue to show an unknown-publisher warning.

"""
if '## 1.7.7 — Installer & Legal Transparency' not in text:
    if marker not in text:
        raise SystemExit('CHANGELOG header not found')
    text = text.replace(marker, marker + section, 1)
changelog.write_text(text, encoding='utf-8')
