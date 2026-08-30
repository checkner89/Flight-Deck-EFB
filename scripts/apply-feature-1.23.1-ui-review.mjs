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
  const anchor='    this.latestOFP = extractSimBriefOFP(payload, summary);\n    if (!summary.flight.ofpLink && this.latestOFP.pdfLink) summary.flight.ofpLink = this.latestOFP.pdfLink;';
  if(!source.includes(anchor)) throw new Error('1.23.1 SimBrief OFP anchor missing');
  return source.replace(anchor,`    this.latestOFP = extractSimBriefOFP(payload, summary);\n    summary.notamsText = this.latestOFP.notamsText || null;\n    summary.briefingText = this.latestOFP.briefingText || null;\n    if (!summary.flight.ofpLink && this.latestOFP.pdfLink) summary.flight.ofpLink = this.latestOFP.pdfLink;`);
});
await update('src/state-engine.mjs',source=>{
  if(source.includes('notamsText: summary.notamsText')) return source;
  const anchor=`      generatedAt: summary.generatedAt || null,\n      detail: flight ? \`\${flight.origin || '—'} → \${flight.destination || '—'} automatisch ergänzt\` : 'Kein gültiger OFP gefunden',`;
  if(!source.includes(anchor)) throw new Error('1.23.1 SimBrief state anchor missing');
  return source.replace(anchor,`      generatedAt: summary.generatedAt || null,\n      notamsText: summary.notamsText ? String(summary.notamsText).slice(0, 350000) : null,\n      briefingText: summary.briefingText ? String(summary.briefingText).slice(0, 350000) : null,\n      detail: flight ? \`\${flight.origin || '—'} → \${flight.destination || '—'} automatisch ergänzt\` : 'Kein gültiger OFP gefunden',`);
});
await update('public/app.js',source=>{
  if(source.includes('fd124-traffic-plane')) return source;
  const pattern=/    const callsign = entry\.callsign \|\| entry\.atcId \|\| `AI-\$\{key\}`;\n    const isSelected = key === selectedTrafficTrailId;[\s\S]*?    marker\.on\('click', \(\) => \{\n      selectedTrafficTrailId = selectedTrafficTrailId === key \? null : key;\n      renderTrackingMap\(trackingViewedFlight \|\| trackingFallbackRecord\(latestState \|\| \{\}\)\);\n    \}\);/;
  if(!pattern.test(source)) throw new Error('1.23.1 live traffic marker anchor missing');
  return source.replace(pattern,`    const callsign = entry.callsign || entry.atcId || \`AI-\${key}\`;\n    const airline = resolveAirlineIdentity(entry);\n    const flightLabel = formatTrafficFlightNumber(entry, airline) || callsign;\n    const heading = Number(entry.heading ?? entry.headingDegrees ?? entry.trueHeading ?? 0);\n    const marker = L.marker([lat, lon], {\n      pane: 'trackingTraffic',\n      zIndexOffset: 200,\n      icon: L.divIcon({\n        className: 'tracking-traffic-icon fd124-traffic-plane',\n        html: \`<span class=\"fd124-traffic-aircraft\" style=\"--fd124-heading:\${Number.isFinite(heading) ? heading : 0}deg\" aria-hidden=\"true\">✈</span>\`,\n        iconSize: [28, 28], iconAnchor: [14, 14],\n      }),\n    }).addTo(trackingLayers.traffic);\n    marker.bindTooltip(escapeHtml(flightLabel), { direction: 'top', offset: [0, -12], className: 'fd124-traffic-tooltip', opacity: 0.96 });\n    marker.bindPopup(\`<strong>\${escapeHtml(flightLabel)}</strong><br>\${escapeHtml([entry.origin, entry.destination].filter(Boolean).join(' → ') || airline.name || entry.airline || entry.title || 'Simulator Traffic')}<br>\${escapeHtml(trafficAircraftLabel(entry))}\${Number.isFinite(Number(entry.altitudeFeet)) ? \` · \${Math.round(Number(entry.altitudeFeet)).toLocaleString(localeFor(currentLanguage))} ft\` : ''}\${Number.isFinite(Number(entry.groundSpeed)) ? \` · \${Math.round(Number(entry.groundSpeed))} kt\` : ''}\`);`);
});
await update('public/release-1.22.0.js',source=>{
  let next=source;
  if(!next.includes('fd1231BriefingFingerprint')){
    next=next.replace("    briefingStep: 0,", "    briefingStep: 0,\n    fd1231BriefingFingerprint: null,");
  }
  next=next.replace("panels[3]=card('NOTAMs','<p>Keine NOTAM-Datenquelle verbunden. Es werden keine Meldungen simuliert oder aus allgemeinem Wissen ergänzt. Sobald eine Quelle angebunden ist, werden Airport-/Route-NOTAMs hier priorisiert und lesbar zusammengefasst.</p>','nicht verbunden',null,true);", "panels[3]=card('NOTAMs',sb.notamsText?`<pre class=\"fd1231-notams\">${esc(sb.notamsText)}</pre>`:'<p>Im importierten SimBrief-OFP sind keine NOTAMs verfügbar.</p>',sb.notamsText?'SimBrief OFP':'SimBrief',sb.generatedAt||null,true);");
  next=next.replace("<dt>Gate / Stand</dt><dd>${esc(record.flight?.gate||live.gate?.name||'–')}</dd>", "");
  const renderAnchor="  function renderBriefing() {";
  if(next.includes(renderAnchor) && !next.includes('fd1231BriefingFingerprintValue')){
    next=next.replace(renderAnchor,`  function fd1231BriefingFingerprintValue(){\n    const live=state.latest||{},sb=live.integrations?.simbrief||{},wx=live.integrations?.aviationWeather||{};\n    return JSON.stringify([state.briefingStep,state.record?.id||null,sb.generatedAt||null,sb.notamsText||null,wx.updatedAt||null,live.flight?.departureRunway||null,live.flight?.arrivalRunway||null]);\n  }\n  function renderBriefing() {\n    const fd1231Fingerprint=fd1231BriefingFingerprintValue();\n    if(state.fd1231BriefingFingerprint===fd1231Fingerprint && document.querySelector('.fd122-briefing-panel .fd122-brief-section')) return;\n    state.fd1231BriefingFingerprint=fd1231Fingerprint;`);
  }
  return next;
});
console.log('Flight Deck EFB 1.23.1 UI review fixes materialized.');
