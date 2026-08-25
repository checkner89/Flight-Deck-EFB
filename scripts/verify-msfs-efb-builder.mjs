import assert from 'node:assert/strict';
import {
  parseInstalledPackagesPath,
  isCommunityDirectory,
  transformTemplateText,
} from '../src/msfs-efb-package-builder.mjs';

assert.equal(
  parseInstalledPackagesPath('InstalledPackagesPath "D:\\MSFS Packages"\r\n'),
  'D:\\MSFS Packages',
  'UserCfg.opt InstalledPackagesPath parser failed',
);
assert.equal(isCommunityDirectory('D:\\MSFS Packages\\Community2024'), true, 'Community2024 validator failed');
assert.equal(isCommunityDirectory('D:\\MSFS Packages\\Official2024'), false, 'Official folder must not be accepted as Community target');
const transformed = transformTemplateText('EFBTemplateAppProject efb_apps_template TemplateApp templateapp');
assert.match(transformed, /FlightDeckEFBProject/);
assert.match(transformed, /flightdeck-efb-native/);
assert.match(transformed, /FlightDeckEFB/);
assert.doesNotMatch(transformed, /EFBTemplateAppProject|efb_apps_template/);

console.log('MSFS EFB builder contract OK');
