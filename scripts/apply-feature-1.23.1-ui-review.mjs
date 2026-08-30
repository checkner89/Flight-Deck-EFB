import fs from 'node:fs/promises';
async function update(filename, transform){const before=await fs.readFile(filename,'utf8');const after=transform(before);if(after!==before)await fs.writeFile(filename,after,'utf8');}

await update('public/index.html',source=>{
  let next=source;
  if(!next.includes('release-1.23.1-ui.css')) next=next.replace('</head>','    <link rel="stylesheet" href="/release-1.23.1-ui.css?v=1.23.1">\n  </head>');
  if(!next.includes('release-1.23.1-ui.js')) next=next.replace('</body>','    <script src="/release-1.23.1-ui.js?v=1.23.1"></script>\n  </body>');
  return next;
});

await update('public/service-worker.js',source=>{
  let next=source.replace(/const CACHE_NAME = '[^']+';/,"const CACHE_NAME = 'flight-deck-efb-v1231-ui-review';");
  for(const asset of ["'/release-1.23.1-ui.css?v=1.23.1'","'/release-1.23.1-ui.js?v=1.23.1'"]){if(!next.includes(asset))next=next.replace("  '/manifest.webmanifest',",`  ${asset},\n  '/manifest.webmanifest',`);}
  return next;
});

await update('src/simbrief-client.mjs',source=>{
  if(source.includes('summary.notamsText = this.latestOFP.notamsText')) return source;
  const pattern=/(\s*this\.latestOFP\s*=\s*extractSimBriefOFP\(payload\s*,\s*summary\);)/;
  if(!pattern.test(source)) throw new Error('1.23.1 SimBrief OFP assignment missing');
  return source.replace(pattern,`$1\n    summary.notamsText = this.latestOFP.notamsText || null;\n    summary.briefingText = this.latestOFP.briefingText || null;`);
});

await update('src/state-engine.mjs',source=>{
  if(source.includes('notamsText: summary.notamsText')) return source;
  const pattern=/(\s*generatedAt:\s*summary\.generatedAt\s*\|\|\s*null,)/;
  if(!pattern.test(source)) throw new Error('1.23.1 SimBrief state generatedAt field missing');
  return source.replace(pattern,`$1\n      notamsText: summary.notamsText ? String(summary.notamsText).slice(0, 350000) : null,\n      briefingText: summary.briefingText ? String(summary.briefingText).slice(0, 350000) : null,`);
});

await update('public/app.js',source=>{
  if(source.includes('fd124-traffic-plane')) return source;
  const pattern=/    const callsign = entry\.callsign \|\| entry\.atcId \|\| `AI-\$\{key\}`;\r?\n    const isSelected = key === selectedTrafficTrailId;[\s\S]*?    marker\.on\('click', \(\) => \{\r?\n      selectedTrafficTrailId = selectedTrafficTrailId === key \? null : key;\r?\n      renderTrackingMap\(trackingViewedFlight \|\| trackingFallbackRecord\(latestState \|\| \{\}\)\);\r?\n    \}\);/;
  if(!pattern.test(source)) throw new Error('1.23.1 live traffic marker block missing');
  return source.replace(pattern,`    const callsign = entry.callsign || entry.atcId || \`AI-\${key}\`;\n    const airline = resolveAirlineIdentity(entry);\n    const flightLabel = formatTrafficFlightNumber(entry, airline) || callsign;\n    const heading = Number(entry.heading ?? entry.headingDegrees ?? entry.trueHeading ?? 0);\n    const marker = L.marker([lat, lon], {\n      pane: 'trackingTraffic',\n      zIndexOffset: 200,\n      icon: L.divIcon({\n        className: 'tracking-traffic-icon fd124-traffic-plane',\n        html: \`<span class=\"fd124-traffic-aircraft\" style=\"--fd124-heading:\${Number.isFinite(heading) ? heading : 0}deg\" aria-hidden=\"true\">✈</span>\`,\n        iconSize: [28, 28], iconAnchor: [14, 14],\n      }),\n    }).addTo(trackingLayers.traffic);\n    marker.bindTooltip(escapeHtml(flightLabel), { direction: 'top', offset: [0, -12], className: 'fd124-traffic-tooltip', opacity: 0.96 });\n    marker.bindPopup(\`<strong>\${escapeHtml(flightLabel)}</strong><br>\${escapeHtml([entry.origin, entry.destination].filter(Boolean).join(' → ') || airline.name || entry.airline || entry.title || 'Simulator Traffic')}<br>\${escapeHtml(trafficAircraftLabel(entry))}\${Number.isFinite(Number(entry.altitudeFeet)) ? \` · \${Math.round(Number(entry.altitudeFeet)).toLocaleString(localeFor(currentLanguage))} ft\` : ''}\${Number.isFinite(Number(entry.groundSpeed)) ? \` · \${Math.round(Number(entry.groundSpeed))} kt\` : ''}\`);`);
});

await update('public/release-1.22.0.js',source=>{
  let next=source;
  if(!next.includes('fd1231BriefingFingerprint')) next=next.replace("    briefingStep: 0,", "    briefingStep: 0,\n    fd1231BriefingFingerprint: null,");
  if(!next.includes('sb.notamsText?`<pre class="fd1231-notams">')){
    next=next.replace(/panels\[3\]=card\('NOTAMs',[^;]+;/, "panels[3]=card('NOTAMs',sb.notamsText?`<pre class=\"fd1231-notams\">${esc(sb.notamsText)}</pre>`:'<p>Im importierten SimBrief-OFP sind keine NOTAMs verfügbar.</p>',sb.notamsText?'SimBrief OFP':'SimBrief',sb.generatedAt||null,true);");
  }
  next=next.replace(/<dt>Gate \/ Stand<\/dt><dd>\$\{esc\(record\.flight\?\.gate\|\|live\.gate\?\.name\|\|'–'\)\}<\/dd>/g, "");
  if(!next.includes('fd1231BriefingFingerprintValue')){
    const renderPattern=/  function renderBriefing\s*\(\s*\)\s*\{/;
    if(!renderPattern.test(next)) throw new Error('1.23.1 Briefing render function missing');
    next=next.replace(renderPattern,`  function fd1231BriefingFingerprintValue(){\n    const live=state.latest||{},sb=live.integrations?.simbrief||{},wx=live.integrations?.aviationWeather||{};\n    return JSON.stringify([state.briefingStep,state.record?.id||null,sb.generatedAt||null,sb.notamsText||null,wx.updatedAt||null,live.flight?.departureRunway||null,live.flight?.arrivalRunway||null]);\n  }\n  function renderBriefing(){\n    const fd1231Fingerprint=fd1231BriefingFingerprintValue();\n    if(state.fd1231BriefingFingerprint===fd1231Fingerprint && document.querySelector('.fd122-briefing-panel .fd122-brief-section')) return;\n    state.fd1231BriefingFingerprint=fd1231Fingerprint;`);
  }
  return next;
});

console.log('Flight Deck EFB 1.23.1 UI review fixes materialized.');
