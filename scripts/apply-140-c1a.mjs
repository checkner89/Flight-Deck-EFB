import fs from 'node:fs';
const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, value) => fs.writeFileSync(file, value.replace(/\r\n/g, '\n'), 'utf8');
function literal(file, before, after, label) {
  let text = read(file);
  if (text.includes(after)) return;
  if (!text.includes(before)) throw new Error(`${file}: missing ${label}`);
  write(file, text.replace(before, after));
}
function regex(file, pattern, after, label) {
  let text = read(file);
  if (text.includes(after)) return;
  if (!pattern.test(text)) throw new Error(`${file}: missing ${label}`);
  write(file, text.replace(pattern, after));
}
{
  let text = read('public/app.js');
  text = text.replace("  homeClock: $('#home-clock'),", "  homeClock: $('#home-clock'),\n  homeGreeting: $('#home-greeting'),\n  homeSimbriefImport: $('#home-simbrief-import'),");
  text = text.replace("  trackingStart: $('#tracking-start'),", "  trackingStart: $('#tracking-start'),");
  text = text.replace("  comMessage: $('#com-message'),", "  comMessage: $('#com-message'),\n  comNextStationCard: $('#com-next-station-card'),\n  comNextStation: $('#com-next-station'),\n  comNextFrequency: $('#com-next-frequency'),\n  comNextReason: $('#com-next-reason'),\n  comNextTune: $('#com-next-tune'),");
  text = text.replace("  runwayField: $('#runway-field'),", "  runwayField: $('#runway-field'),\n  holdingPointField: $('#holding-point-field'),\n  plannerHoldingPoint: $('#planner-holding-point'),");
  text = text.replace("  checkUpdate: $('#check-update'),", "  checkUpdate: $('#check-update'),\n  updateDialog: $('#update-dialog'),\n  updateDialogTitle: $('#update-dialog-title'),\n  updateDialogDetail: $('#update-dialog-detail'),\n  updateDialogProgress: $('#update-dialog-progress'),\n  updateDialogProgressLabel: $('#update-dialog-progress-label'),\n  updateDialogDownload: $('#update-dialog-download'),\n  updateDialogInstall: $('#update-dialog-install'),\n  updateDialogLater: $('#update-dialog-later'),");
  text = text.replace("  onboardingProfile: $('#onboarding-profile'),", "  onboardingDisplayName: $('#onboarding-display-name'),\n  onboardingHelpTexts: $('#onboarding-help-texts'),");
  text = text.replace("  onboardingFinish: $('#onboarding-finish'),", "  onboardingFinish: $('#onboarding-finish'),\n  displayName: $('#display-name'),\n  showHelpTexts: $('#show-help-texts'),\n  simbriefQuickDialog: $('#simbrief-quick-dialog'),\n  simbriefQuickIdentifier: $('#simbrief-quick-identifier'),\n  simbriefQuickStart: $('#simbrief-quick-start'),\n  simbriefQuickMessage: $('#simbrief-quick-message'),\n  flightHubNavButtons: [...document.querySelectorAll('[data-flight-hub-view]')],\n  sectionNavButtons: [...document.querySelectorAll('[data-scroll-target]')],");
  write('public/app.js', text);
}
literal('public/app.js', "  pilotProfile: ['custom', 'airliner', 'ga', 'online'].includes(localStorage.getItem('flight-deck-pilot-profile'))\n    ? localStorage.getItem('flight-deck-pilot-profile') : 'custom',\n  alertMode:", "  displayName: (localStorage.getItem('flight-deck-display-name') || '').slice(0, 40),\n  showHelpTexts: localStorage.getItem('flight-deck-show-help-texts') !== 'false',\n  alertMode:", 'display name/help preferences');
literal('public/app.js', "function resolvedTheme() {\n  if (preferences.theme === 'light' || preferences.theme === 'dark') return preferences.theme;\n  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';\n}\n", "function resolvedTheme() {\n  if (preferences.theme === 'light' || preferences.theme === 'dark') return preferences.theme;\n  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';\n}\n\nfunction updateGreeting() {\n  if (!elements.homeGreeting) return;\n  const hour = new Date().getHours();\n  const name = preferences.displayName || 'Captain';\n  if (currentLanguage === 'de') {\n    const salutation = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';\n    elements.homeGreeting.textContent = `${salutation}, ${name}`;\n    return;\n  }\n  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';\n  elements.homeGreeting.textContent = `${salutation}, ${name}`;\n}\n", 'personal greeting function');
literal('public/app.js', "  if (elements.textSizeSelect) elements.textSizeSelect.value = preferences.textSize;\n  if (elements.weightUnitSelect) elements.weightUnitSelect.value = preferences.weightUnit;", "  if (elements.textSizeSelect) elements.textSizeSelect.value = preferences.textSize;\n  document.documentElement.dataset.helpText = preferences.showHelpTexts ? 'on' : 'off';\n  if (elements.displayName && elements.displayName.value !== preferences.displayName) elements.displayName.value = preferences.displayName;\n  if (elements.showHelpTexts) elements.showHelpTexts.checked = preferences.showHelpTexts;\n  if (elements.onboardingDisplayName && elements.onboardingDisplayName.value !== preferences.displayName) elements.onboardingDisplayName.value = preferences.displayName;\n  if (elements.onboardingHelpTexts) elements.onboardingHelpTexts.checked = preferences.showHelpTexts;\n  updateGreeting();\n  if (elements.weightUnitSelect) elements.weightUnitSelect.value = preferences.weightUnit;", 'apply display name/help');
{
  let text = read('public/app.js');
  text = text.replace("  if (elements.pilotProfileSelect) elements.pilotProfileSelect.value = preferences.pilotProfile;\n", '');
  text = text.replace("const DEFAULT_APP_ORDER = ['taxi', 'flight', 'tracking',", "const DEFAULT_APP_ORDER = ['taxi', 'flight',");
  text = text.replaceAll("'flight', 'tracking',", "'flight',");
  write('public/app.js', text);
}
literal('public/app.js', "  activeModule = allowed.has(moduleName) ? moduleName : 'home';\n  const homeActive = activeModule === 'home';", "  activeModule = allowed.has(moduleName) ? moduleName : 'home';\n  for (const button of elements.flightHubNavButtons || []) {\n    const active = button.dataset.flightHubView === activeModule;\n    button.classList.toggle('active', active);\n  }\n  const homeActive = activeModule === 'home';", 'flight hub nav active state');
{
  let text = read('public/app.js');
  text = text.replace("flight: { icon: 'F', title: 'Flight', context: 'SIMBRIEF / MSFS' },", "flight: { icon: 'F', title: 'Flug & Tracking', context: 'FLIGHT HUB' },");
  text = text.replace("tracking: { icon: 'R', title: 'Flight Tracking', context: 'LIVE OPERATIONS' },", "tracking: { icon: 'F', title: 'Flug & Tracking', context: 'FLIGHT HUB' },");
  write('public/app.js', text);
}
literal('public/app.js', "  elements.pilotProfileSelect.value = elements.onboardingProfile.value;\n  applySelectedPilotProfile();\n  applyPreferences();", "  preferences.displayName = String(elements.onboardingDisplayName?.value || '').trim().slice(0, 40);\n  preferences.showHelpTexts = elements.onboardingHelpTexts?.checked !== false;\n  localStorage.setItem('flight-deck-display-name', preferences.displayName);\n  localStorage.setItem('flight-deck-show-help-texts', String(preferences.showHelpTexts));\n  applyPreferences();", 'onboarding display save');
literal('public/app.js', "  elements.onboardingTextSize.value = preferences.textSize;\n  elements.onboardingProfile.value = preferences.pilotProfile === 'custom' ? 'airliner' : preferences.pilotProfile;\n  elements.onboardingSimbriefIdentifier.value = preferences.simbriefIdentifier;", "  elements.onboardingTextSize.value = preferences.textSize;\n  if (elements.onboardingDisplayName) elements.onboardingDisplayName.value = preferences.displayName;\n  if (elements.onboardingHelpTexts) elements.onboardingHelpTexts.checked = preferences.showHelpTexts;\n  elements.onboardingSimbriefIdentifier.value = preferences.simbriefIdentifier;", 'onboarding populate');
literal('public/app.js', "async function afterAuthentication() {\n  refreshDevices().catch(() => {});\n  refreshUpdateStatus().catch(() => {});\n  maybeShowOnboarding().catch(() => {});", "async function afterAuthentication() {\n  refreshDevices().catch(() => {});\n  checkForUpdate({ startup: true }).catch(() => refreshUpdateStatus().catch(() => {}));\n  maybeShowOnboarding().catch(() => {});", 'startup update check');

console.log('Applied 1.4.0 preferences/navigation core.');
