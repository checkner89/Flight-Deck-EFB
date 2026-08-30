import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) await fs.writeFile(filename, after, 'utf8');
}

await update('public/app.js', (source) => {
  let next = source;
  if (!next.includes('let openTrafficPopupId = null;')) {
    const anchor = 'let selectedTrafficTrailId = null;';
    if (!next.includes(anchor)) throw new Error('1.24 traffic state anchor missing');
    next = next.replace(anchor, `${anchor}\nlet openTrafficPopupId = null;`);
  }

  if (!next.includes('fd124-sticky-traffic')) {
    const popupAnchor = /    marker\.bindPopup\(`?<strong>\$\{escapeHtml\(flightLabel\)\}<\/strong>[\s\S]*?\);/;
    const match = next.match(popupAnchor);
    if (!match) throw new Error('1.24 traffic popup anchor missing after 1.23.1 materialization');
    const replacement = [
      match[0],
      "    marker.options.fd124StickyTraffic = true;",
      "    marker.on('click', () => { openTrafficPopupId = key; marker.openPopup(); });",
      "    marker.on('popupclose', () => { setTimeout(() => { if (marker._map && openTrafficPopupId === key) openTrafficPopupId = null; }, 0); });",
      "    if (openTrafficPopupId === key) requestAnimationFrame(() => marker.openPopup());",
      "    marker.getElement?.()?.classList.add('fd124-sticky-traffic');",
    ].join('\n');
    next = next.replace(popupAnchor, replacement);
  }

  // The 1.22 enhanced profile is the sole owner of #tracking-profile-chart.
  // Keeping the historical 1.20.11 renderer active caused the old chart/labels to flash behind it.
  next = next.replace(
    '  renderTrackingAltitudeProfile(record);\n  const stats = record?.stats || {};',
    '  const stats = record?.stats || {};',
  );
  return next;
});

await update('public/release-1.22.0.js', (source) => {
  let next = source;

  next = next.replace('<span class="fd122-layer-note">Archiv: Originalplanung + tatsächliche Spur</span>', '');

  if (!next.includes('function fd124ProfileTime(')) {
    const anchor = '  function ensureProfileControls() {';
    if (!next.includes(anchor)) throw new Error('1.24 profile controls anchor missing');
    const helpers = `  function fd124ProfileTime(value) {
    if (value === undefined || value === null || value === '') return '–';
    const numeric = Number(value);
    const normalized = Number.isFinite(numeric) && numeric > 0 && numeric < 10_000_000_000 ? numeric * 1000 : value;
    return formatTime(normalized);
  }
  function fd124ActualOffBlock(record) {
    return trackPoints(record).find((entry) => entry.onGround && (finite(entry.groundSpeedKnots ?? entry.groundSpeed) || 0) >= 3)?.time || null;
  }
  function fd124ActualOnBlock(record) {
    const track = trackPoints(record);
    const afterLanding = record?.stats?.landedAt ? Date.parse(record.stats.landedAt) : 0;
    return [...track].reverse().find((entry) => entry.onGround && Date.parse(entry.time) >= afterLanding && (finite(entry.groundSpeedKnots ?? entry.groundSpeed) || 0) < 2 && (entry.parkingBrake || entry.enginesRunning === false))?.time || record?.endedAt || null;
  }
  function ensureFlightTimeStrip() {
    const card = document.querySelector('.tracking-profile-card');
    if (!card) return null;
    let strip = card.querySelector('.fd124-time-strip');
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'fd124-time-strip';
      const header = card.querySelector('.section-title');
      (header || card.firstElementChild)?.insertAdjacentElement('afterend', strip);
    }
    return strip;
  }
  function renderFlightTimeStrip(record) {
    const strip = ensureFlightTimeStrip(); if (!strip || !record) return;
    const flight = record.flight || {};
    const stats = record.stats || {};
    const values = [
      ['OFF BLOCK', flight.estimatedOut, fd124ActualOffBlock(record)],
      ['TAKEOFF', flight.estimatedOff, stats.takeoffAt],
      ['LANDING', flight.estimatedOn, stats.landedAt],
      ['ON BLOCK', flight.estimatedIn, fd124ActualOnBlock(record)],
    ];
    strip.innerHTML = values.map(([label, planned, actual]) => \`<div class="fd124-time-item"><small>\${label}</small><span><em>PLAN</em><b>\${fd124ProfileTime(planned)}</b></span><span><em>IST</em><b>\${fd124ProfileTime(actual)}</b></span></div>\`).join('');
  }

`;
    next = next.replace(anchor, helpers + anchor);
  }

  next = next.replace(
    /toolbar\.innerHTML = `\n      <label>X-ACHSE[\s\S]*?<\/span>`;/,
    "toolbar.innerHTML = `\n      <div class=\"fd124-profile-controls\"><label>ANSICHT <select id=\"fd122-profile-axis\"><option value=\"time\">Zeit</option><option value=\"distance\">Distanz</option><option value=\"waypoint\">Wegpunkte</option></select></label><label>EINHEIT <select id=\"fd122-alt-unit\"><option value=\"ft\">ft</option><option value=\"m\">m</option></select></label><button id=\"fd122-alt-colors\" type=\"button\" aria-pressed=\"${state.altitudeColors}\">HÖHENFARBEN</button></div><span class=\"fd122-altitude-legend fd124-altitude-legend\"><i></i><span><b>BODEN</b><b>NIEDRIG</b><b>MITTEL</b><b>HOCH</b></span></span>`;"
  );

  if (!next.includes('renderFlightTimeStrip(record);')) {
    const profileAnchor = /(function renderProfile\(\) \{[\s\S]*?const record = state\.record;[\s\S]*?if \(!chart \|\| !record\) return;)/;
    if (!profileAnchor.test(next)) throw new Error('1.24 profile render anchor missing');
    next = next.replace(profileAnchor, (match) => `${match}\n    renderFlightTimeStrip(record);`);
  }

  next = next.replace('const width = 1000, height = 260, left = 62, right = 980, top = 18, bottom = 216;', 'const width = 1000, height = 330, left = 86, right = 976, top = 34, bottom = 274;');

  next = next.replace(
    "const actualPath = actual.map(({ entry, index }, i) => `${i ? 'L' : 'M'} ${xTrack(entry, index).toFixed(1)} ${y(entry.altitudeFeet).toFixed(1)}`).join(' ');",
    "const actualSegments = actual.slice(1).map(({ entry, index }, segmentIndex) => { const previous = actual[segmentIndex]; const midpoint = ((finite(previous.entry.altitudeFeet) || 0) + (finite(entry.altitudeFeet) || 0)) / 2; const color = altitudeColor(midpoint, ceilingFt, previous.entry.onGround && entry.onGround); return `<line class=\"fd124-actual-segment\" x1=\"${xTrack(previous.entry, previous.index).toFixed(1)}\" y1=\"${y(previous.entry.altitudeFeet).toFixed(1)}\" x2=\"${xTrack(entry, index).toFixed(1)}\" y2=\"${y(entry.altitudeFeet).toFixed(1)}\" style=\"stroke:${color}\"></line>`; }).join('');"
  );

  next = next.replace(
    /yGrid\.push\(`<line class=\"fd122-grid\" x1=\"\$\{left\}\" y1=\"\$\{yy\}\" x2=\"\$\{right\}\" y2=\"\$\{yy\}\"><\/line><text class=\"fd122-axis\" x=\"\$\{left - 9\}\" y=\"\$\{yy \+ 4\}\" text-anchor=\"end\">\$\{state\.altitudeUnit === 'm' \? Math\.round\(display\) : \(ft >= 1000 \? `\$\{Math\.round\(ft \/ 1000\)\}k` : ft\)\}<\/text>`\);/,
    "yGrid.push(`<line class=\"fd122-grid\" x1=\"${left}\" y1=\"${yy}\" x2=\"${right}\" y2=\"${yy}\"></line><text class=\"fd122-axis fd124-alt-axis\" x=\"${left - 12}\" y=\"${yy + 4}\" text-anchor=\"end\">${Math.round(display).toLocaleString(document.documentElement.lang || 'de-DE')} ${state.altitudeUnit}</text>`);"
  );

  next = next.replace('y="242"', 'y="312"');

  next = next.replace(
    "return `<line class=\"fd122-event-line\" x1=\"${x}\" y1=\"${top}\" x2=\"${x}\" y2=\"${bottom}\"></line><text class=\"fd122-event-label\" x=\"${Math.min(right - 42, x + 5)}\" y=\"31\">${event.label}</text>`;",
    "const labelY = 18 + (profileEvents(track, record).findIndex((candidate) => candidate.time === event.time) % 2) * 15; return `<line class=\"fd122-event-line\" x1=\"${x}\" y1=\"${top}\" x2=\"${x}\" y2=\"${bottom}\"></line><text class=\"fd122-event-label\" x=\"${Math.max(left + 4, Math.min(right - 56, x + 5))}\" y=\"${labelY}\">${event.label}</text>`;"
  );

  next = next.replace(
    '<path class="fd122-actual-profile" d="${actualPath}"></path>',
    '${actualSegments}'
  );

  return next;
});

await update('public/release-1.22.0.css', (source) => {
  if (source.includes('/* 1.24 flight tracking polish */')) return source;
  return `${source}\n\n/* 1.24 flight tracking polish */\n.tracking-profile-card{position:relative!important;background:var(--fd122-card)!important}\n.tracking-profile-card>.section-title>span{display:none!important}\n.fd124-time-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 12px}\n.fd124-time-item{border:1px solid var(--fd122-border);border-radius:10px;padding:10px 12px;background:rgba(110,145,160,.055);min-width:0}\n.fd124-time-item>small{display:block;margin-bottom:7px;color:var(--fd122-muted);font-size:10px;font-weight:900;letter-spacing:.08em}\n.fd124-time-item>span{display:grid;grid-template-columns:38px 1fr;gap:8px;align-items:baseline;margin-top:3px}\n.fd124-time-item em{font-style:normal;color:var(--fd122-muted);font-size:9px;font-weight:850}.fd124-time-item b{font-size:14px;white-space:nowrap}\n.fd122-profile-toolbar{justify-content:space-between!important;gap:12px!important;border-top:1px solid var(--fd122-border);border-bottom:1px solid var(--fd122-border);padding:9px 0!important;margin:0 0 10px!important}\n.fd124-profile-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fd124-altitude-legend{margin-left:auto!important;display:grid!important;grid-template-columns:110px 1fr;gap:8px!important;min-width:min(360px,100%)}\n.fd124-altitude-legend i{width:110px!important;height:8px!important;background:linear-gradient(90deg,#7f8990 0 8%,#2b9b78 28%,#d7ad30 52%,#e67f2e 75%,#7c52b8 100%)!important}\n.fd124-altitude-legend>span{display:flex;justify-content:space-between;gap:7px;font-size:9px;letter-spacing:.04em}.fd124-altitude-legend b{font-weight:800;color:var(--fd122-muted)}\n.fd122-profile-wrap{min-height:320px!important;padding:0!important}.fd122-profile-svg{min-height:300px!important;overflow:visible}.fd124-actual-segment{fill:none;stroke-width:4;stroke-linecap:round;vector-effect:non-scaling-stroke}.fd122-planned-profile{stroke-width:2.2!important;stroke-dasharray:8 6!important;opacity:.9}\n.fd124-alt-axis{font-size:10px!important;font-variant-numeric:tabular-nums}.fd122-event-label{font-size:9px!important}.fd122-layer-note{margin-left:0!important}\n.tracking-traffic-icon.fd124-traffic-plane,.tracking-traffic-icon.fd124-traffic-plane.selected{background:transparent!important;border:0!important;box-shadow:none!important}\n.tracking-traffic-icon.fd124-traffic-plane .fd124-traffic-aircraft{background:transparent!important;border:0!important;box-shadow:none!important;color:#f1b94d!important;text-shadow:0 1px 2px rgba(0,0,0,.8),0 0 3px rgba(0,0,0,.55)!important;font-size:22px!important}\n.fd124-sticky-traffic{filter:none!important}.leaflet-popup.fd124-traffic-popup{pointer-events:auto}\n@media(max-width:900px){.fd124-time-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.fd122-profile-toolbar{align-items:flex-start!important}.fd124-altitude-legend{margin-left:0!important}}\n`;
});

console.log('Flight Deck EFB 1.24 flight tracking polish materialized.');
