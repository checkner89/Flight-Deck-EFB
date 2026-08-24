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
regex('public/app.js', /function renderUpdateStatus\(status = \{\}\) \{[\s\S]*?async function installDownloadedUpdate\(\) \{[\s\S]*?\n\}\n\nasync function beginNavigraphLogin/, "function renderUpdateStatus(status = {}) {\n  if (!elements.updateDetail) return;\n  const currentVersion = status.currentVersion || document.documentElement.dataset.appVersion || '1.4.0';\n  elements.updateVersion.textContent = `v${currentVersion}`;\n  const states = {\n    manual: t('updateReadyManual'), idle: t('updateReady'), checking: t('checkingUpdates'),\n    available: t('updateAvailable'), downloading: t('downloadingUpdate'), downloaded: t('updateDownloaded'),\n    current: t('upToDate'), error: t('updateFailed'), unsupported: t('updateUnsupported'),\n  };\n  const detail = status.detail || states[status.state] || t('updateReadyManual');\n  elements.updateDetail.textContent = detail;\n  const progress = Math.max(0, Math.min(100, Number(status.percent) || 0));\n  elements.updateProgress.hidden = status.state !== 'downloading';\n  elements.updateProgress.style.setProperty('--update-progress', `${progress}%`);\n  elements.updateProgressLabel.textContent = `${Math.round(progress)}%`;\n  elements.checkUpdate.disabled = status.canManage === false || ['checking', 'downloading'].includes(status.state);\n  elements.installUpdate.hidden = status.state !== 'downloaded';\n\n  if (elements.updateDialog) {\n    elements.updateDialogDetail.textContent = detail;\n    elements.updateDialogTitle.textContent = status.state === 'downloaded'\n      ? `Version ${status.releaseName || ''} ist bereit`\n      : status.state === 'downloading' ? 'Update wird heruntergeladen'\n        : `Update ${status.releaseName || ''} verfügbar`.replace(/\\s+/g, ' ').trim();\n    elements.updateDialogProgress.hidden = status.state !== 'downloading';\n    elements.updateDialogProgress.style.setProperty('--update-progress', `${progress}%`);\n    elements.updateDialogProgressLabel.textContent = `${Math.round(progress)}%`;\n    elements.updateDialogDownload.hidden = status.state !== 'available';\n    elements.updateDialogInstall.hidden = status.state !== 'downloaded';\n    elements.updateDialogLater.hidden = status.state === 'downloading';\n    if (status.canManage !== false && ['available', 'downloading', 'downloaded'].includes(status.state)\n        && typeof elements.updateDialog.showModal === 'function' && !elements.updateDialog.open) {\n      elements.updateDialog.showModal();\n    }\n  }\n  clearTimeout(updateStatusTimer);\n  if (['checking', 'downloading'].includes(status.state)) {\n    updateStatusTimer = setTimeout(() => refreshUpdateStatus().catch(() => {}), 1200);\n  }\n}\n\nasync function refreshUpdateStatus() {\n  const response = await fetch(authenticatedUrl('/api/update/status'), { cache: 'no-store' });\n  if (!response.ok) return null;\n  const data = await response.json();\n  renderUpdateStatus(data);\n  return data;\n}\n\nasync function checkForUpdate({ startup = false } = {}) {\n  const existing = await refreshUpdateStatus().catch(() => null);\n  if (existing?.canManage === false) return existing;\n  if (elements.checkUpdate) elements.checkUpdate.disabled = true;\n  renderUpdateStatus({ state: 'checking', currentVersion: document.documentElement.dataset.appVersion || '1.4.0', canManage: existing?.canManage });\n  try {\n    const response = await fetch(authenticatedUrl('/api/update/check'), { method: 'POST' });\n    const data = await response.json();\n    if (!response.ok) throw new Error(data.error || t('updateFailed'));\n    renderUpdateStatus(data);\n    return data;\n  } catch (error) {\n    const failed = { state: 'error', currentVersion: document.documentElement.dataset.appVersion || '1.4.0', detail: error.message, canManage: existing?.canManage };\n    renderUpdateStatus(failed);\n    if (!startup) throw error;\n    return failed;\n  } finally {\n    if (elements.checkUpdate) elements.checkUpdate.disabled = false;\n  }\n}\n\nasync function downloadAvailableUpdate() {\n  elements.updateDialogDownload.disabled = true;\n  try {\n    const response = await fetch(authenticatedUrl('/api/update/download'), { method: 'POST' });\n    const data = await response.json();\n    if (!response.ok) throw new Error(data.error || t('updateFailed'));\n    renderUpdateStatus(data);\n  } catch (error) {\n    renderUpdateStatus({ state: 'error', currentVersion: document.documentElement.dataset.appVersion || '1.4.0', detail: error.message });\n  } finally {\n    elements.updateDialogDownload.disabled = false;\n  }\n}\n\nasync function installDownloadedUpdate() {\n  if (elements.installUpdate) elements.installUpdate.disabled = true;\n  if (elements.updateDialogInstall) elements.updateDialogInstall.disabled = true;\n  try {\n    const response = await fetch(authenticatedUrl('/api/update/install'), { method: 'POST' });\n    const data = await response.json();\n    if (!response.ok) throw new Error(data.error || t('updateFailed'));\n    renderUpdateStatus(data);\n  } catch (error) {\n    renderUpdateStatus({ state: 'error', currentVersion: document.documentElement.dataset.appVersion || '1.4.0', detail: error.message });\n    if (elements.installUpdate) elements.installUpdate.disabled = false;\n    if (elements.updateDialogInstall) elements.updateDialogInstall.disabled = false;\n  }\n}\n\nasync function beginNavigraphLogin", 'update workflow functions');
{
  let text = read('public/app.js');
  text = text.replace("    pilotProfile: ['custom', 'airliner', 'ga', 'online'], alertMode: ['normal', 'visual', 'off'],", "    alertMode: ['normal', 'visual', 'off'],");
  text = text.replace("    clockFormat: 'flight-deck-clock-format', pilotProfile: 'flight-deck-pilot-profile', alertMode: 'flight-deck-alert-mode',", "    clockFormat: 'flight-deck-clock-format', alertMode: 'flight-deck-alert-mode',");
  text = text.replace("    ['focusMode', 'flight-deck-focus-mode'], ['showPhaseHome', 'flight-deck-show-phase-home'],", "    ['focusMode', 'flight-deck-focus-mode'], ['showPhaseHome', 'flight-deck-show-phase-home'], ['showHelpTexts', 'flight-deck-show-help-texts'],");
  const anchor = "  if (value.appLayout && Array.isArray(value.appLayout.order)) {";
  const nameRestore = "  if (typeof value.displayName === 'string') { preferences.displayName = value.displayName.slice(0, 40); localStorage.setItem('flight-deck-display-name', preferences.displayName); }\\n";
  if (!text.includes("typeof value.displayName === 'string'")) text = text.replace(anchor, nameRestore + anchor);
  write('public/app.js', text);
}
literal('public/app.js', "function filenameFromResponse(response, fallback) {", "async function importSimBriefFromHome() {\n  if (preferences.simbriefIdentifier) {\n    elements.simbriefIdentifier.value = preferences.simbriefIdentifier;\n    const prior = elements.homeSimbriefImport.textContent;\n    elements.homeSimbriefImport.disabled = true;\n    elements.homeSimbriefImport.textContent = 'IMPORT …';\n    try { await importSimBrief(); }\n    finally { elements.homeSimbriefImport.disabled = false; elements.homeSimbriefImport.textContent = prior; }\n    return;\n  }\n  elements.simbriefQuickIdentifier.value = '';\n  elements.simbriefQuickMessage.textContent = '';\n  if (typeof elements.simbriefQuickDialog.showModal === 'function' && !elements.simbriefQuickDialog.open) elements.simbriefQuickDialog.showModal();\n}\n\nasync function importSimBriefQuick() {\n  const identifier = saveSimbriefIdentifier(elements.simbriefQuickIdentifier.value, { announce: true });\n  if (!identifier) {\n    elements.simbriefQuickMessage.textContent = 'Bitte Pilot-ID oder Benutzername eingeben.';\n    return;\n  }\n  elements.simbriefIdentifier.value = identifier;\n  elements.simbriefQuickStart.disabled = true;\n  try {\n    await importSimBrief();\n    elements.simbriefQuickDialog.close?.();\n  } catch (error) {\n    elements.simbriefQuickMessage.textContent = error.message;\n  } finally {\n    elements.simbriefQuickStart.disabled = false;\n  }\n}\n\nfunction filenameFromResponse(response, fallback) {", 'Home SimBrief quick import');
{
  let text = read('public/app.js');
  text = text.replace("elements.trackingStart.addEventListener('click', startFlightRecording);", "elements.trackingStart?.addEventListener('click', startFlightRecording);");
  text = text.replace("elements.applyPilotProfile.addEventListener('click', applySelectedPilotProfile);", "elements.applyPilotProfile?.addEventListener('click', applySelectedPilotProfile);");
  text = text.replace("elements.checkUpdate.addEventListener('click', checkForUpdate);", "elements.checkUpdate.addEventListener('click', () => checkForUpdate());\nelements.updateDialogDownload?.addEventListener('click', downloadAvailableUpdate);\nelements.updateDialogInstall?.addEventListener('click', installDownloadedUpdate);");
  text = text.replace("elements.installUpdate.addEventListener('click', installDownloadedUpdate);", "elements.installUpdate.addEventListener('click', installDownloadedUpdate);");
  const marker = "elements.homeOpenFlightHub.addEventListener('click', () => switchModule('flight'));";
  const addition = `${marker}
elements.homeSimbriefImport?.addEventListener('click', importSimBriefFromHome);
elements.simbriefQuickStart?.addEventListener('click', importSimBriefQuick);
elements.simbriefQuickIdentifier?.addEventListener('keydown', (event) => { if (event.key === 'Enter') importSimBriefQuick(); });
for (const button of elements.flightHubNavButtons || []) {
  button.addEventListener('click', () => {
    switchModule(button.dataset.flightHubView);
    if (button.dataset.trackingSection === 'archive') setTimeout(() => document.querySelector('.tracking-archive-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  });
}
for (const button of elements.sectionNavButtons || []) {
  button.addEventListener('click', () => document.getElementById(button.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}`;
  if (!text.includes("elements.homeSimbriefImport?.addEventListener")) text = text.replace(marker, addition);
  const prefMarker = "elements.textSizeSelect.addEventListener('change', () => {";
  const prefCode = `elements.displayName?.addEventListener('change', () => {
  preferences.displayName = String(elements.displayName.value || '').trim().slice(0, 40);
  localStorage.setItem('flight-deck-display-name', preferences.displayName);
  applyPreferences();
});
elements.showHelpTexts?.addEventListener('change', () => {
  preferences.showHelpTexts = elements.showHelpTexts.checked;
  localStorage.setItem('flight-deck-show-help-texts', String(preferences.showHelpTexts));
  applyPreferences();
});
${prefMarker}`;
  if (!text.includes("preferences.displayName = String(elements.displayName.value")) text = text.replace(prefMarker, prefCode);
  write('public/app.js', text);
}
console.log('Applied Flight Deck EFB 1.4.0 preferences/update/navigation behavior.');
