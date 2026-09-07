import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('public/index.html', (source) => {
  let next = source;

  next = next.replace(/\n\s*<button class="efb-app-tile charts-app unavailable-app"[\s\S]*?<\/button>/, '');
  next = next.replace(/\n\s*<section class="efb-page" data-page="charts" hidden>[\s\S]*?\n\s*<section class="efb-page" data-page="ground" hidden>/, '\n\n        <section class="efb-page" data-page="ground" hidden>');
  next = next.replace(/\n\s*<div><i id="settings-nav-dot"><\/i><span><strong>Navigraph<\/strong><small id="settings-nav">[\s\S]*?<\/small><\/span><\/div>/, '');
  next = next.replace(/ Navigraph ist in diesem Build weiterhin deaktiviert\./g, '');

  if (/id="(?:home-navigraph-summary|charts-status-pill|charts-airport|charts-sim-gate|navigraph-detail|navigraph-login|navigraph-logout|navigraph-login-code|navigraph-user-code|navigraph-verification-link|settings-nav|settings-nav-dot)"/.test(next)) {
    throw new Error('Disabled Navigraph UI remains in public/index.html.');
  }
  return next;
});

await update('public/app.js', (source) => {
  let next = source;

  const elementKeys = [
    'homeNavigraphSummary', 'chartsStatusPill', 'chartsAirport', 'chartsSimGate', 'navigraphDetail',
    'settingsNavDot', 'settingsNav', 'navigraphLogin', 'navigraphLogout', 'navigraphLoginCode',
    'navigraphUserCode', 'navigraphVerificationLink',
  ];
  for (const key of elementKeys) {
    next = next.replace(new RegExp(`\\n\\s{2}${key}: \\$('#[^']+'\\),`), '');
  }

  next = next.replace(/\nfunction renderNavigraph\(navigraph\) \{[\s\S]*?\n\}\n\nfunction renderFenix/, '\nfunction renderFenix');
  next = next.replace(/\nasync function beginNavigraphLogin\(\) \{[\s\S]*?\nasync function setComFromPreset/, '\nasync function setComFromPreset');
  next = next.replace(/\n\s*const navigraph = state\.integrations\?\.navigraph \?\? \{\};/, '');
  next = next.replace(/\n\s*elements\.homeNavigraphSummary\.textContent = t\('chartsPaused'\);/, '');
  next = next.replace(/\n\s*const navStatus = navigraph\.status \|\| 'configuration-required';[\s\S]*?\n\s*const gsxStatus =/, '\n  const gsxStatus =');
  next = next.replace(/\n\s*renderNavigraph\(navigraph\);/, '');
  next = next.replace(/\n\s*setStatusDot\(elements\.settingsNavDot, navStatus\);/, '');
  next = next.replace(/\n\s*elements\.settingsNav\.textContent = navigraph\.detail \|\| 'Setup erforderlich';/, '');
  next = next.replace(/\n\s*elements\.navigraphLogin\.addEventListener\('click', beginNavigraphLogin\);/, '');
  next = next.replace(/\n\s*elements\.navigraphLogout\.addEventListener\('click', logoutNavigraph\);/, '');

  next = next.replace(/const DEFAULT_APP_ORDER = \[([^\]]*)\];/, (match, body) => {
    const values = body.split(',').map((value) => value.trim()).filter((value) => value !== "'charts'");
    return `const DEFAULT_APP_ORDER = [${values.join(', ')}];`;
  });
  next = next.replace(/order: \[([^\]]*)\]/g, (match, body) => {
    if (!body.includes("'charts'")) return match;
    const values = body.split(',').map((value) => value.trim()).filter((value) => value !== "'charts'");
    return `order: [${values.join(', ')}]`;
  });
  next = next.replace(/\n\s*charts: 'charts',/, '');
  next = next.replace("saved.hidden.filter((id) => id !== 'charts' && DEFAULT_APP_ORDER.includes(id) && !ESSENTIAL_APPS.has(id))", "saved.hidden.filter((id) => DEFAULT_APP_ORDER.includes(id) && !ESSENTIAL_APPS.has(id))");
  next = next.replace(/\n\s*if \(moduleName === 'charts'\) return;/, '');
  next = next.replace("return id === 'new-flight' || (id !== 'charts' && !appLayout.hidden.includes(id));", "return id === 'new-flight' || !appLayout.hidden.includes(id);");
  next = next.replace("tile.hidden = id === 'charts' ? false : appLayout.hidden.includes(id) && !ESSENTIAL_APPS.has(id);", "tile.hidden = appLayout.hidden.includes(id) && !ESSENTIAL_APPS.has(id);");
  next = next.replace("const unavailable = id === 'charts';\n    hint.textContent = unavailable ? t('comingLater') : ESSENTIAL_APPS.has(id) ? t('alwaysAvailable') : t('homeVisibility');", "hint.textContent = ESSENTIAL_APPS.has(id) ? t('alwaysAvailable') : t('homeVisibility');");
  next = next.replace("DEFAULT_APP_ORDER.filter((id) => !['planner', 'charts'].includes(id))", "DEFAULT_APP_ORDER.filter((id) => id !== 'planner')");

  if (/navigraph(?:Login|Logout|Detail|UserCode|VerificationLink|LoginCode)|chartsStatusPill|homeNavigraphSummary|settingsNav(?:Dot)?/.test(next)) {
    throw new Error('Disabled Navigraph renderer integration remains in public/app.js.');
  }
  if (/DEFAULT_APP_ORDER[^\n]*'charts'|\bcharts: 'charts'/.test(next)) {
    throw new Error('Disabled Charts app remains in the active app registry.');
  }
  return next;
});

await update('src/server.mjs', (source) => {
  let next = source;

  next = next.replace(/\n\s*const navigraph = \{[\s\S]*?\n\s*\};\n\s*const simBrief =/, '\n  const simBrief =');
  next = next.replace(/\n\s*\{ id: 'navigraph', label: 'Navigraph account',[^\n]*\},/, '');
  next = next.replace(/\n\s*if \(pathname === '\/api\/navigraph\/login'[\s\S]*?\n\s*if \(pathname === '\/api\/sayintentions\/frequency'/, "\n\n      if (pathname === '/api/sayintentions/frequency'");
  next = next.replace(/\n\s*navigraph\.(?:start|stop)\(\);/g, '');

  if (/\/api\/navigraph\/|\bnavigraph\.(?:start|stop|beginLogin|logout)\b|id: 'navigraph'/.test(next)) {
    throw new Error('Disabled Navigraph backend integration remains in src/server.mjs.');
  }
  return next;
});

console.log('Disabled Navigraph placeholder integration removed from active FLYXORA UI and backend.');
