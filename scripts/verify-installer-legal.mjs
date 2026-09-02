import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const nsis = pkg.build?.nsis || {};
const installer = fs.readFileSync('build/installer.nsh', 'utf8');
const agreement = fs.readFileSync('build/license.txt', 'utf8');
const notices = fs.readFileSync('build/third-party-notices.txt', 'utf8');
const thirdParty = fs.readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
const privacy = fs.readFileSync('PRIVACY.md', 'utf8');

assert.equal(pkg.license, 'MIT', 'Application code must remain MIT licensed.');
assert.equal(nsis.oneClick, false, 'Installer must remain assisted so legal/tasks pages are visible.');
assert.equal(nsis.license, 'build/license.txt', 'Installer agreement must be wired into NSIS.');
assert.equal(nsis.include, 'build/installer.nsh', 'Custom NSIS pages must be wired into the installer.');
assert.equal(nsis.createDesktopShortcut, true, 'Default desktop shortcut remains enabled; custom tasks page supports explicit opt-out.');
assert.equal(nsis.createStartMenuShortcut, true, 'Start Menu shortcut must remain enabled.');
assert.equal(nsis.deleteAppDataOnUninstall, false, 'Uninstall must not silently delete user data.');

assert.match(agreement, /MIT License/i);
assert.match(agreement, /Permission is hereby granted, free of charge/i);
assert.match(agreement, /NOTHING IN THE FOLLOWING INSTALLER ACKNOWLEDGEMENTS REMOVES, REDUCES OR CONTRADICTS/i);
assert.match(agreement, /flight simulation only/i);
assert.match(agreement, /not for real-world/i);
assert.match(agreement, /PRIVACY\.md/i);

assert.match(installer, /ThirdPartyPageCreate/);
assert.match(installer, /AdditionalTasksPageCreate/);
assert.match(installer, /Create a Desktop Shortcut/);
assert.match(installer, /DesktopShortcutSelection/);
assert.match(installer, /customInstall/);
if (pkg.version === '1.24.12') {
  assert.match(installer, /SetShellVarContext current/);
  assert.match(installer, /Delete "\$DESKTOP\\FLYXORA\.lnk"/);
  assert.match(installer, /Delete "\$SMPROGRAMS\\FLYXORA\.lnk"/);
  assert.match(installer, /CreateShortCut "\$DESKTOP\\FLYXORA\.lnk" "\$INSTDIR\\FLYXORA\.exe"/);
  assert.match(installer, /CreateShortCut "\$SMPROGRAMS\\FLYXORA\.lnk" "\$INSTDIR\\FLYXORA\.exe"/);
} else {
  assert.match(installer, /Delete "\$DESKTOP\\\$\{PRODUCT_NAME\}\.lnk"/);
}
assert.doesNotMatch(installer, /\$\{isUpdated\}|MUI_HEADER_TEXT|WS_BORDER/);

for (const required of ['OpenStreetMap', 'OurAirports', 'Electron', 'Leaflet', 'node-simconnect', 'Microsoft Flight Simulator', 'SayIntentions.AI', 'PMDG', 'GSX']) {
  assert.ok(notices.includes(required), `Installer third-party notice missing: ${required}`);
}
assert.doesNotMatch(notices, /TaxiNow|Sky Ning|X-Plane Scenery Gateway|micromamba|osmium-tool/i);
assert.match(thirdParty, /FLYXORA/i);
assert.match(privacy, /FLYXORA/i);
assert.doesNotMatch(thirdParty, /Flight Deck EFB/i, 'Current third-party notices still expose the retired product name.');
assert.doesNotMatch(privacy, /Flight Deck EFB/i, 'Current privacy notice still expose the retired product name.');

console.log('Installer legal/tasks regression checks passed.');
