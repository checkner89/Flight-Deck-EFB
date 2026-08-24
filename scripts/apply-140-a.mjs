import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, value) => fs.writeFileSync(file, value.replace(/\r\n/g, '\n'), 'utf8');
function replaceLiteral(file, before, after, label = before.slice(0, 60)) {
  let text = read(file);
  if (text.includes(after)) return;
  if (!text.includes(before)) throw new Error(`${file}: missing ${label}`);
  write(file, text.replace(before, after));
}
function replaceRegex(file, pattern, after, label) {
  let text = read(file);
  if (text.includes(after)) return;
  if (!pattern.test(text)) throw new Error(`${file}: missing ${label}`);
  write(file, text.replace(pattern, after));
}
const VERSION = '1.4.0';

const pkg = JSON.parse(read('package.json'));
pkg.version = VERSION;
pkg.description = 'Flight Deck EFB for MSFS with integrated flight operations, tracking, traffic, taxi planning, ATC and guarded simulator integrations.';
write('package.json', `${JSON.stringify(pkg, null, 2)}\n`);

for (const file of [
  'public/index.html', 'public/app.js', 'public/service-worker.js',
  'src/server.mjs', 'THIRD_PARTY_NOTICES.md'
]) {
  if (fs.existsSync(file)) write(file, read(file).replaceAll('1.3.2', VERSION));
}

{
  let text = read('src/electron-main.mjs');
  text = text.replace('    autoUpdater.autoDownload = true;', '    autoUpdater.autoDownload = false;');
  text = text.replace(/^    autoUpdater\.on\('update-available'.*$/m, "    autoUpdater.on('update-available', (info) => set({ state: 'available', percent: 0, releaseName: info?.version || null, detail: `Version ${info?.version || ''} ist verfügbar.`.replace(/\\s+/g, ' ').trim() }));");
  write('src/electron-main.mjs', text);
}
replaceLiteral('src/electron-main.mjs', "    async install() {\n      if (value.state !== 'downloaded') throw new Error('Noch kein heruntergeladenes Update verfügbar.');", "    async download() {\n      if (!app.isPackaged || process.platform !== 'win32') return { ...value };\n      if (!['available', 'error'].includes(value.state)) return { ...value };\n      set({ state: 'downloading', percent: 0, detail: 'Update wird heruntergeladen.' });\n      await autoUpdater.downloadUpdate();\n      return { ...value };\n    },\n    async install() {\n      if (value.state !== 'downloaded') throw new Error('Noch kein heruntergeladenes Update verfügbar.');", 'updater download method');
{
  let text = read('src/electron-main.mjs');
  text = text.replace(/\n  setTimeout\(\(\) => updateService\.check\(\)\.catch\(\(\) => \{\}\), 15_000\);/, '');
  write('src/electron-main.mjs', text);
}
replaceLiteral('src/server.mjs', "    check: async () => ({ state: 'manual', currentVersion: APP_VERSION, configured: false }),\n    install: async () => { throw new Error('Noch kein heruntergeladenes Update verfügbar.'); },", "    check: async () => ({ state: 'manual', currentVersion: APP_VERSION, configured: false }),\n    download: async () => ({ state: 'manual', currentVersion: APP_VERSION, configured: false }),\n    install: async () => { throw new Error('Noch kein heruntergeladenes Update verfügbar.'); },", 'updater stub');
replaceLiteral('src/server.mjs', "      if (pathname === '/api/update/install' && request.method === 'POST') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Updates können nur in der Windows-App installiert werden.' });", "      if (pathname === '/api/update/download' && request.method === 'POST') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Updates können nur in der Windows-App heruntergeladen werden.' });\n        try {\n          return json(response, 202, await updater.download());\n        } catch (error) {\n          return json(response, 409, { error: error.message, ...(await updater.status()) });\n        }\n      }\n\n      if (pathname === '/api/update/install' && request.method === 'POST') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Updates können nur in der Windows-App installiert werden.' });", 'update download endpoint');
replaceLiteral('src/server.mjs', "          'language', 'theme', 'textSize', 'weightUnit', 'distanceUnit', 'pressureUnit', 'temperatureUnit', 'clockFormat',\n          'pilotProfile', 'alertMode', 'arrivalTriggerNm', 'fuelBufferPounds', 'focusMode', 'showPhaseHome', 'appLayout', 'simbriefIdentifier',\n          'simbriefAutoImport', 'destinationPrefetch',", "          'language', 'theme', 'textSize', 'weightUnit', 'distanceUnit', 'pressureUnit', 'temperatureUnit', 'clockFormat',\n          'displayName', 'showHelpTexts', 'alertMode', 'arrivalTriggerNm', 'fuelBufferPounds', 'focusMode', 'showPhaseHome', 'appLayout', 'simbriefIdentifier',\n          'simbriefAutoImport', 'destinationPrefetch',", 'backup preferences');

write('CHANGELOG.md', "# Flight Deck EFB changelog\n\n## 1.4.0 — 24 August 2026\n\n- Checks GitHub for updates on every Windows-app start and presents available updates in an in-app dialog with explicit download and install actions.\n- Added a preferred display name to onboarding and Settings so the Home greeting can address the pilot personally.\n- Combined Flight and Flight Tracking into one Flight Hub entry with a floating submenu for Operations, Tracking & Map, and Archive workflows.\n- Reorganized Settings with a floating submenu and combined Integration Status with Diagnostics/System Health.\n- Removed the Pilot Profile setup and presets from the visible UI.\n- Added a SimBrief quick-import action on Home while keeping automatic SayIntentions/MSFS flight detection as the default.\n- Flight recording remains automatic; the manual start-recording control was removed.\n- Added live simulator traffic to the tracking map with callsign labels and session-observed traffic trails selectable from aircraft markers.\n- Taxi planning now exposes runway holding-point selection and defaults departures to the outermost available holding point.\n- Reorganized ATC Center with a floating submenu for Source, Clearance, Messages, and Online Networks.\n- COM now proposes a context-aware next station/frequency from currently available SayIntentions or online-network frequencies. Tuning still requires an explicit click.\n- Added optional contextual help text throughout the interface, configurable in onboarding and Settings.\n- Preserves local settings, preferred name, help preference, paired devices, flight archive, and onboarding completion across in-place updates.\n- Added an additional light-theme control audit so secondary, disabled, compact, and floating-navigation buttons remain readable.\n- Navigraph remains disabled until a compliant integration is explicitly re-enabled.\n\n## 1.3.2 — 24 August 2026\n\n- Stabilized MSFS 2024 SimConnect connection handling and protocol order.\n- Improved Light Mode contrast, active-flight destination recovery, airline identification in Flightboard, combined Taxi/Taxi Planning, and a larger maximized desktop window.\n\n## 1.2.0 — 24 August 2026\n\n- Combined SayIntentions/BeyondATC, VATSIM, and IVAO into one ATC Center.\n- Added an optional complete SayIntentions message-session view.\n- Disabled the standalone Charts launcher until a compliant Navigraph product placement and developer approval are available.\n- Added Light/Dark display controls, responsive Automations, installer/update foundations, legal notices, local tablet access, SimBrief, COM, Flightboard, GSX, Fenix, taxi planning, flight tracking, and six UI languages.\n\nFlight simulation use only — not for real-world navigation.\n");

for (const file of ['README.md', 'PRIVACY.md']) {
  if (!fs.existsSync(file)) continue;
  let text = read(file);
  text = text.replaceAll('v1.3.2', 'v1.4.0').replaceAll('1.3.2', '1.4.0');
  write(file, text);
}
console.log('Applied Flight Deck EFB 1.4.0 core/update/documentation changes.');
