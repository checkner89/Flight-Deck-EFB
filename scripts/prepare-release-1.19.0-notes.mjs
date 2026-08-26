import fs from 'node:fs/promises';

const filename = 'CHANGELOG.md';
const before = await fs.readFile(filename, 'utf8');
if (!/^## 1\.19\.0\b/m.test(before)) {
  const section = `## 1.19.0 — Native Session & Renderer Recovery\n\n- Fixes the 1.18.1 renderer regression that could open the Windows shell with an empty UI. Pilot-tool MutationObservers are now throttled and idempotent instead of rewriting the Home tiles and Flight Notes heading from inside their own observer callbacks.\n- Adds a permanent regression check for this renderer loop in release validation.\n- Extends the existing **Sim Session** app instead of adding duplicate modules.\n- Adds low-frequency Windows process status for MSFS 2024, SayIntentions, BeyondATC, vPilot, Navigraph Simlink, Volanta, Little Navmap and GSX/Couatl.\n- Adds guarded launch actions that only target known/approved tools. Custom executable paths can be configured only from the authenticated Windows host; paired tablets can launch approved tools but cannot supply arbitrary commands or paths.\n- Adds an explicit **MSFS Screenshot** action using Electron window capture. Nothing is captured in the background; a screenshot is created only after a user click and can be viewed/saved on the connected device.\n- Adds **LAN Auto Discovery** via mDNS/ZeroConf with the friendly address **http://flightdeck.local:<port>/** when the local network permits multicast discovery. Existing QR/PIN and direct LAN URLs remain the fallback.\n- Sim Session status refresh is intentionally low-frequency and cached on the host to avoid reintroducing the excessive background CPU usage seen with earlier traffic/operations experiments.\n\n> Flight simulation use only — not for real-world navigation.\n\n`;
  const next = before.replace(/^# Flight Deck EFB changelog\s*/i, (header) => `${header.trim()}\n\n${section}`);
  await fs.writeFile(filename, next, 'utf8');
}
console.log('Prepared Flight Deck EFB 1.19.0 changelog section.');
