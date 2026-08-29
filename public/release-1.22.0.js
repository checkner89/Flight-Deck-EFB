(() => {
  'use strict';

  const VERSION = '1.22.0';
  const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('flight-deck-token') || '';
  if (token) sessionStorage.setItem('flight-deck-token', token);
  const authUrl = (pathname) => {
    const url = new URL(pathname, location.origin);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  };
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const upper = (value) => String(value ?? '').trim().toUpperCase();
  const fmt = (value, digits = 0) => finite(value) === null ? '–' : Number(value).toLocaleString(document.documentElement.lang || 'de-DE', { maximumFractionDigits: digits });
  const weightKg = (pounds) => finite(pounds) === null ? null : Number(pounds) * 0.45359237;
  const distanceNm = (a, b) => {
    const lat1 = finite(a?.lat); const lon1 = finite(a?.lon); const lat2 = finite(b?.lat); const lon2 = finite(b?.lon);
    if ([lat1, lon1, lat2, lon2].some((v) => v === null)) return 0;
    const r = 3440.065; const rad = (d) => d * Math.PI / 180;
    const dLat = rad(lat2 - lat1); const dLon = rad(lon2 - lon1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const state = {
    latest: null,
    record: null,
    recordId: null,
    lastRecordAt: 0,
    profileAxis: localStorage.getItem('fd122-profile-axis') || 'time',
    altitudeUnit: localStorage.getItem('fd122-altitude-unit') || 'ft',
    altitudeColors: localStorage.getItem('fd122-altitude-colors') !== 'off',
    map: { layer: null, eventLayer: null, highlight: null, recordId: null },
    briefingStep: 0,
    scratch: { tool: 'pen', drawing: false, page: 0, undo: [], redo: [], resizeKey: '' },
  };

  function formatTime(value) {
    if (!value) return '–';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '–';
    return new Intl.DateTimeFormat(document.documentElement.lang || 'de-DE', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }
  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return `${Math.floor(total / 3600)}:${String(Math.floor(total / 60) % 60).padStart(2, '0')}`;
  }
  function currentArchiveId() {
    return document.querySelector('.flight-archive-entry.active[data-flight-id]')?.dataset.flightId || null;
  }
  async function fetchJson(pathname, options = {}) {
    const response = await fetch(authUrl(pathname), { cache: 'no-store', ...options });
    if (!response.ok) throw new Error(`${response.status}`);
    return response.json();
  }
  async function refreshData(force = false) {
    try { state.latest = await fetchJson('/api/state'); } catch { /* existing connection UI remains authoritative */ }
    const archiveId = currentArchiveId();
    const wantedId = archiveId || 'current';
    if (!force && state.recordId === wantedId && Date.now() - state.lastRecordAt < 2500) return;
    try {
      const body = archiveId ? await fetchJson(`/api/flights/${encodeURIComponent(archiveId)}`) : await fetchJson('/api/flights/current');
      state.record = body.flight || null;
      state.recordId = wantedId;
      state.lastRecordAt = Date.now();
    } catch {
      state.record = null;
      state.recordId = wantedId;
    }
  }

  function planFor(record) {
    if (!record) return {};
    return record.originalPlan || record.planOriginal || record.plan || {};
  }
  function planPoints(record) {
    const plan = planFor(record);
    const points = Array.isArray(plan.waypoints) ? plan.waypoints.filter((p) => finite(p.lat) !== null && finite(p.lon) !== null) : [];
    if (points.length > 1) return points;
    return [plan.originPosition, plan.destinationPosition].filter((p) => finite(p?.lat) !== null && finite(p?.lon) !== null);
  }
  function trackPoints(record) {
    return Array.isArray(record?.track) ? record.track.filter((p) => finite(p.lat) !== null && finite(p.lon) !== null) : [];
  }
  function nearestWaypoint(entry, record) {
    const points = planPoints(record);
    if (!points.length || finite(entry?.lat) === null) return '–';
    let best = null; let bestNm = Infinity;
    for (const point of points) {
      const nm = distanceNm(entry, point);
      if (nm < bestNm) { bestNm = nm; best = point; }
    }
    return best?.ident || best?.name || '–';
  }
  function phaseFor(entry, record) {
    if (entry?.onGround) return record?.stats?.takeoffAt && !record?.stats?.landedAt ? 'Taxi / Boden' : 'Boden';
    const vs = finite(entry?.verticalSpeedFpm) || 0;
    const max = finite(record?.stats?.maxAltitudeFeet) || Math.max(0, ...trackPoints(record).map((p) => finite(p.altitudeFeet) || 0));
    const alt = finite(entry?.altitudeFeet) || 0;
    if (vs > 400) return 'Steigflug';
    if (vs < -400) return 'Sinkflug';
    if (max > 0 && alt > max * .82) return 'Reiseflug';
    return 'Flug';
  }
  function profileEvents(track, record) {
    const values = [];
    const start = Date.parse(track[0]?.time); const end = Date.parse(track.at(-1)?.time);
    const add = (time, label, kind) => {
      const ms = Date.parse(time);
      if (Number.isFinite(ms) && ms >= start && ms <= end) values.push({ time: ms, label, kind });
    };
    add(record?.stats?.takeoffAt, 'TAKE-OFF', 'takeoff');
    add(record?.stats?.landedAt, 'LANDUNG', 'landing');
    const maxAlt = Math.max(0, ...track.map((p) => finite(p.altitudeFeet) || 0));
    if (maxAlt > 1500) {
      const topBand = maxAlt * .97;
      const toc = track.find((p) => !p.onGround && (finite(p.altitudeFeet) || 0) >= topBand && Math.abs(finite(p.verticalSpeedFpm) || 0) < 500);
      const tod = [...track].reverse().find((p) => !p.onGround && (finite(p.altitudeFeet) || 0) >= maxAlt * .88 && (finite(p.verticalSpeedFpm) || 0) < -350);
      if (toc) add(toc.time, 'TOC', 'toc');
      if (tod) add(tod.time, 'TOD', 'tod');
    }
    return values.sort((a, b) => a.time - b.time);
  }

  function ensureProfileControls() {
    const card = document.querySelector('.tracking-profile-card');
    if (!card || card.querySelector('.fd122-profile-toolbar')) return;
    const header = card.querySelector('.section-title');
    const toolbar = document.createElement('div');
    toolbar.className = 'fd122-profile-toolbar';
    toolbar.innerHTML = `
      <label>X-ACHSE <select id="fd122-profile-axis"><option value="time">Flugzeit</option><option value="distance">Distanz</option><option value="waypoint">Wegpunkte</option></select></label>
      <label>HÖHE <select id="fd122-alt-unit"><option value="ft">ft</option><option value="m">m</option></select></label>
      <button id="fd122-alt-colors" type="button" aria-pressed="${state.altitudeColors}">HÖHENFARBEN</button>
      <span class="fd122-altitude-legend"><i></i><span>Boden → Max. Flughöhe</span></span>`;
    (header || card.firstElementChild)?.insertAdjacentElement('afterend', toolbar);
    const axis = toolbar.querySelector('#fd122-profile-axis'); axis.value = state.profileAxis;
    axis.onchange = () => { state.profileAxis = axis.value; localStorage.setItem('fd122-profile-axis', axis.value); renderProfile(); };
    const unit = toolbar.querySelector('#fd122-alt-unit'); unit.value = state.altitudeUnit;
    unit.onchange = () => { state.altitudeUnit = unit.value; localStorage.setItem('fd122-altitude-unit', unit.value); renderProfile(); };
    toolbar.querySelector('#fd122-alt-colors').onclick = (event) => {
      state.altitudeColors = !state.altitudeColors;
      localStorage.setItem('fd122-altitude-colors', state.altitudeColors ? 'on' : 'off');
      event.currentTarget.setAttribute('aria-pressed', String(state.altitudeColors));
      renderArchiveMapLayers(true);
    };
  }

  function renderProfile() {
    ensureProfileControls();
    const chart = document.querySelector('#tracking-profile-chart');
    const record = state.record;
    if (!chart || !record) return;
    const track = trackPoints(record).filter((p) => finite(p.altitudeFeet) !== null);
    const airborne = track.filter((p) => !p.onGround && (finite(p.aglFeet) === null || finite(p.aglFeet) > 80));
    if (track.length < 2 || airborne.length < 2) {
      chart.innerHTML = '<div class="fd122-profile-empty"><div><strong>Kein Höhenprofil</strong><span>Für reine Bodenaufzeichnungen wird bewusst kein irreführendes Flugprofil dargestellt.</span></div></div>';
      return;
    }
    const planned = planPoints(record).filter((p) => finite(p.altitudeFeet) !== null);
    const width = 1000, height = 260, left = 62, right = 980, top = 18, bottom = 216;
    const plotW = right - left, plotH = bottom - top;
    const firstMs = Date.parse(track[0].time), lastMs = Date.parse(track.at(-1).time);
    const cumulative = [0]; for (let i = 1; i < track.length; i += 1) cumulative.push(cumulative[i - 1] + distanceNm(track[i - 1], track[i]));
    const totalNm = cumulative.at(-1) || 1;
    const maxFt = Math.max(1000, ...track.map((p) => Math.max(0, finite(p.altitudeFeet) || 0)), ...planned.map((p) => Math.max(0, finite(p.altitudeFeet) || 0)));
    const stepFt = maxFt > 35000 ? 10000 : maxFt > 18000 ? 5000 : maxFt > 8000 ? 2000 : 1000;
    const ceilingFt = Math.ceil(maxFt / stepFt) * stepFt;
    const unitFactor = state.altitudeUnit === 'm' ? .3048 : 1;
    const xTrack = (entry, index) => {
      if (state.profileAxis === 'distance') return left + (cumulative[index] / totalNm) * plotW;
      if (state.profileAxis === 'waypoint') return left + (index / Math.max(1, track.length - 1)) * plotW;
      const ms = Date.parse(entry.time); return left + ((ms - firstMs) / Math.max(1, lastMs - firstMs)) * plotW;
    };
    const y = (ft) => bottom - (Math.max(0, Number(ft) || 0) / ceilingFt) * plotH;
    const stride = Math.max(1, Math.ceil(track.length / 1400));
    const actual = track.map((entry, index) => ({ entry, index })).filter((x, idx) => idx % stride === 0 || x.index === track.length - 1);
    const actualPath = actual.map(({ entry, index }, i) => `${i ? 'L' : 'M'} ${xTrack(entry, index).toFixed(1)} ${y(entry.altitudeFeet).toFixed(1)}`).join(' ');
    let plannedPath = '';
    if (planned.length > 1) {
      const plannedDistances = [0]; for (let i = 1; i < planned.length; i += 1) plannedDistances.push(plannedDistances[i - 1] + distanceNm(planned[i - 1], planned[i]));
      const plannedTotal = plannedDistances.at(-1) || 1;
      plannedPath = planned.map((entry, index) => {
        let x;
        if (state.profileAxis === 'distance') x = left + (plannedDistances[index] / plannedTotal) * plotW;
        else x = left + (index / Math.max(1, planned.length - 1)) * plotW;
        return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y(entry.altitudeFeet).toFixed(1)}`;
      }).join(' ');
    }
    const yGrid = [];
    for (let ft = 0; ft <= ceilingFt; ft += stepFt) {
      const yy = y(ft); const display = ft * unitFactor;
      yGrid.push(`<line class="fd122-grid" x1="${left}" y1="${yy}" x2="${right}" y2="${yy}"></line><text class="fd122-axis" x="${left - 9}" y="${yy + 4}" text-anchor="end">${state.altitudeUnit === 'm' ? Math.round(display) : (ft >= 1000 ? `${Math.round(ft / 1000)}k` : ft)}</text>`);
    }
    const xGrid = [0,.25,.5,.75,1].map((f) => {
      const x = left + f * plotW; let label;
      if (state.profileAxis === 'distance') label = `${Math.round(totalNm * f)} NM`;
      else if (state.profileAxis === 'waypoint') {
        const wp = planPoints(record)[Math.round(f * Math.max(0, planPoints(record).length - 1))]; label = wp?.ident || `${Math.round(f * 100)}%`;
      } else label = formatTime(firstMs + (lastMs - firstMs) * f);
      return `<line class="fd122-grid" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"></line><text class="fd122-axis" x="${x}" y="242" text-anchor="middle">${esc(label)}</text>`;
    }).join('');
    const events = profileEvents(track, record).map((event) => {
      let index = track.findIndex((p) => Date.parse(p.time) >= event.time); if (index < 0) index = track.length - 1;
      const x = xTrack(track[index], index);
      return `<line class="fd122-event-line" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"></line><text class="fd122-event-label" x="${Math.min(right - 42, x + 5)}" y="31">${event.label}</text>`;
    }).join('');
    chart.innerHTML = `<div class="fd122-profile-wrap"><svg class="fd122-profile-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Geplantes und tatsächlich geflogenes Höhenprofil">${yGrid.join('')}${xGrid}${plannedPath ? `<path class="fd122-planned-profile" d="${plannedPath}"></path>` : ''}<path class="fd122-actual-profile" d="${actualPath}"></path>${events}<line class="fd122-profile-crosshair" x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" hidden></line><circle class="fd122-profile-dot" cx="${left}" cy="${bottom}" r="4" hidden></circle></svg><div class="fd122-profile-tooltip" hidden></div></div>${plannedPath ? '' : '<div class="fd122-layer-note">Keine geplanten Profildaten verfügbar · tatsächlicher Flug bleibt vollständig sichtbar.</div>'}`;
    const svg = chart.querySelector('svg'), tooltip = chart.querySelector('.fd122-profile-tooltip'), cross = chart.querySelector('.fd122-profile-crosshair'), dot = chart.querySelector('.fd122-profile-dot');
    const selectPoint = (clientX, clientY, persist = false) => {
      const bounds = svg.getBoundingClientRect(); if (!bounds.width) return;
      const local = Math.max(left, Math.min(right, (clientX - bounds.left) / bounds.width * width));
      const fraction = (local - left) / plotW;
      let index;
      if (state.profileAxis === 'distance') index = cumulative.findIndex((d) => d >= totalNm * fraction);
      else if (state.profileAxis === 'time') { const target = firstMs + (lastMs - firstMs) * fraction; index = track.findIndex((p) => Date.parse(p.time) >= target); }
      else index = Math.round(fraction * (track.length - 1));
      if (index < 0) index = track.length - 1;
      const entry = track[index], x = xTrack(entry, index), yy = y(entry.altitudeFeet);
      cross.hidden = false; dot.hidden = false; cross.setAttribute('x1', x); cross.setAttribute('x2', x); dot.setAttribute('cx', x); dot.setAttribute('cy', yy);
      const altitude = (finite(entry.altitudeFeet) || 0) * unitFactor;
      tooltip.innerHTML = `<strong>${formatTime(entry.time)} · ${fmt(altitude)} ${state.altitudeUnit}</strong><br>GS ${fmt(entry.groundSpeedKnots ?? entry.groundSpeed)} kt · VS ${fmt(entry.verticalSpeedFpm)} fpm<br>${esc(nearestWaypoint(entry, record))} · ${esc(phaseFor(entry, record))}`;
      tooltip.hidden = false; tooltip.style.left = `${Math.max(6, Math.min(chart.clientWidth - 250, clientX - bounds.left + 10))}px`; tooltip.style.top = `${Math.max(6, clientY - bounds.top - 62)}px`;
      if (persist) highlightMapPoint(entry, index);
    };
    svg.onpointermove = (event) => selectPoint(event.clientX, event.clientY, false);
    svg.onpointerleave = () => { tooltip.hidden = true; };
    svg.onclick = (event) => selectPoint(event.clientX, event.clientY, true);
  }

  function altitudeColor(altitude, maxAltitude, onGround) {
    if (onGround) return '#7f8990';
    const ratio = Math.max(0, Math.min(1, (finite(altitude) || 0) / Math.max(1, maxAltitude)));
    if (ratio < .25) return '#2b9b78';
    if (ratio < .5) return '#d7ad30';
    if (ratio < .75) return '#e67f2e';
    return '#7c52b8';
  }
  function ensureMapControls() {
    const mapCard = document.querySelector('.tracking-map-card, .tracking-map-shell, [data-page="tracking"] .efb-card');
    if (!mapCard || document.querySelector('.fd122-map-toolbar')) return;
    const anchor = mapCard.querySelector('.tracking-map-actions') || mapCard.querySelector('.section-title');
    if (!anchor) return;
    const bar = document.createElement('div'); bar.className = 'fd122-map-toolbar';
    bar.innerHTML = `<button data-layer="planned" aria-pressed="true">PLAN</button><button data-layer="actual" aria-pressed="true">GEFLOGEN</button><button data-layer="taxi" aria-pressed="true">TAXI</button><button data-layer="waypoints" aria-pressed="true">WEGPUNKTE</button><button data-layer="events" aria-pressed="true">EREIGNISSE</button><span class="fd122-layer-note">Archiv: Originalplanung + tatsächliche Spur</span>`;
    anchor.insertAdjacentElement('afterend', bar);
    bar.querySelectorAll('[data-layer]').forEach((button) => button.onclick = () => {
      const pressed = button.getAttribute('aria-pressed') !== 'true'; button.setAttribute('aria-pressed', String(pressed)); renderArchiveMapLayers(true);
      if (button.dataset.layer === 'waypoints') {
        const native = document.querySelector('#tracking-waypoints-toggle');
        if (native && (native.getAttribute('aria-pressed') === 'true') !== pressed) native.click();
      }
    });
  }
  function layerEnabled(name) { return document.querySelector(`.fd122-map-toolbar [data-layer="${name}"]`)?.getAttribute('aria-pressed') !== 'false'; }
  function renderArchiveMapLayers(force = false) {
    ensureMapControls();
    const map = window.__flightDeckTrackingMap;
    if (!map || !window.L || !state.record) return;
    const record = state.record; const id = state.recordId;
    if (!force && state.map.recordId === id && state.map.renderedAt && Date.now() - state.map.renderedAt < 2500) return;
    if (state.map.layer) map.removeLayer(state.map.layer);
    if (state.map.eventLayer) map.removeLayer(state.map.eventLayer);
    state.map.layer = L.layerGroup().addTo(map); state.map.eventLayer = L.layerGroup().addTo(map); state.map.recordId = id; state.map.renderedAt = Date.now();
    const actualPane = map.getPane('trackingActual'); if (actualPane) actualPane.style.display = layerEnabled('actual') && !state.altitudeColors ? '' : 'none';
    const plannedPane = map.getPane('trackingPlanned'); if (plannedPane) plannedPane.style.display = layerEnabled('planned') ? '' : 'none';
    const track = trackPoints(record); const maxAlt = Math.max(1, ...track.map((p) => finite(p.altitudeFeet) || 0));
    if (layerEnabled('actual') && state.altitudeColors && track.length > 1) {
      const stride = Math.max(1, Math.ceil(track.length / 1200));
      for (let i = stride; i < track.length; i += stride) {
        const a = track[i - stride], b = track[i];
        if (distanceNm(a, b) > 80) continue;
        const color = altitudeColor(((finite(a.altitudeFeet) || 0) + (finite(b.altitudeFeet) || 0)) / 2, maxAlt, a.onGround && b.onGround);
        const line = L.polyline([[a.lat,a.lon],[b.lat,b.lon]], { color, weight:4.5, opacity:.96, interactive:true });
        line.bindTooltip(`${fmt((finite(b.altitudeFeet) || 0) * (state.altitudeUnit === 'm' ? .3048 : 1))} ${state.altitudeUnit} · ${formatTime(b.time)} · ${fmt(b.groundSpeedKnots)} kt`);
        line.on('click', () => highlightProfileIndex(Math.min(i, track.length - 1)));
        line.addTo(state.map.layer);
      }
    }
    if (layerEnabled('planned')) {
      const points = planPoints(record);
      if (points.length > 1 && !plannedPane) L.polyline(points.map((p) => [p.lat,p.lon]), { color:'#168c96', weight:3, opacity:.9, dashArray:'9 7', interactive:false }).addTo(state.map.layer);
    }
    if (layerEnabled('taxi')) {
      const candidates = [record.taxiRoutes?.departure?.path, record.taxiRoutes?.arrival?.path, record.taxi?.routes?.departure?.path, record.taxi?.routes?.arrival?.path].filter(Array.isArray);
      for (const path of candidates) {
        const pts = path.filter((p) => finite(p.lat) !== null && finite(p.lon) !== null).map((p) => [p.lat,p.lon]);
        if (pts.length > 1) L.polyline(pts, { color:'#d14b56', weight:3, opacity:.78, dashArray:'7 7', interactive:false }).addTo(state.map.layer);
      }
    }
    if (layerEnabled('events')) {
      for (const event of profileEvents(track, record)) {
        let index = track.findIndex((p) => Date.parse(p.time) >= event.time); if (index < 0) index = track.length - 1; const p = track[index]; if (!p) continue;
        L.circleMarker([p.lat,p.lon], { radius:5, weight:2, color:'#fff', fillColor:'#087f88', fillOpacity:.95 }).bindTooltip(event.label).addTo(state.map.eventLayer);
      }
    }
  }
  function highlightMapPoint(entry) {
    const map = window.__flightDeckTrackingMap; if (!map || !window.L || finite(entry?.lat) === null) return;
    if (state.map.highlight) map.removeLayer(state.map.highlight);
    state.map.highlight = L.circleMarker([entry.lat, entry.lon], { radius:8, weight:3, color:'#fff', fillColor:'#087f88', fillOpacity:.95, className:'fd122-map-highlight' }).addTo(map);
    state.map.highlight.bindPopup(`${formatTime(entry.time)} · ${fmt(entry.altitudeFeet)} ft · ${fmt(entry.groundSpeedKnots)} kt`).openPopup();
    map.panTo([entry.lat, entry.lon], { animate:true });
  }
  function highlightProfileIndex(index) {
    const svg = document.querySelector('.fd122-profile-svg'); const record = state.record; const track = trackPoints(record); if (!svg || !track[index]) return;
    const entry = track[index];
    highlightMapPoint(entry, index);
    const chart = document.querySelector('#tracking-profile-chart'); if (chart) chart.scrollIntoView({ block:'nearest', behavior:'smooth' });
  }

  function scratchKey() { return `fd122-scratch:${state.record?.id || currentArchiveId() || 'unassigned'}`; }
  function defaultScratch() { return { pages: [{ name:'Seite 1', template:'blank', image:null }], updatedAt:null }; }
  function loadScratch() { try { return JSON.parse(localStorage.getItem(scratchKey())) || defaultScratch(); } catch { return defaultScratch(); } }
  function saveScratch(data) { data.updatedAt = new Date().toISOString(); localStorage.setItem(scratchKey(), JSON.stringify(data)); }
  function templateBackground(ctx, canvas, template) {
    ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = '#183038'; ctx.font = 'bold 22px Arial'; ctx.fillText(template === 'blank' ? 'SCRATCHPAD' : template.toUpperCase(), 24, 34); ctx.strokeStyle = '#d6e0e4'; ctx.lineWidth = 1;
    const layouts = {
      atis:['Airport / ATIS','Runway','Wind','Visibility / Clouds','Temp / Dew','QNH','Remarks'],
      departure:['Clearance','SID / Runway','Initial Altitude','Squawk','Departure Frequency','Restrictions'],
      taxi:['Taxi route','Hold short','Crossing','Runway','Notes'],
      takeoff:['Runway','Flaps','V1','VR','V2','Flex / Thrust','Wind / QNH'],
      arrival:['Arrival ATIS','Runway','Wind','QNH','Approach','Transition'],
      approach:['Approach','Final course','Minima','Missed approach','Autobrake / Flaps','Landing data'],
      gate:['Taxi route','Gate / Stand','Hold short','Ground frequency','Notes'],
      notes:['Notes'],
    };
    const fields = layouts[template] || [];
    let y = 70; ctx.font = '16px Arial';
    for (const label of fields) { ctx.fillStyle='#49616c'; ctx.fillText(label,24,y); ctx.beginPath(); ctx.moveTo(24,y+12); ctx.lineTo(canvas.width-24,y+12); ctx.stroke(); y += 52; }
    ctx.restore();
  }
  function ensureScratchpad() {
    const card = document.querySelector('.journey-notes-card'); if (!card || card.querySelector('.fd122-scratchpad')) return;
    card.classList.add('fd122-enhanced');
    const root = document.createElement('div'); root.className='fd122-scratchpad';
    root.innerHTML = `<div class="fd122-scratch-toolbar"><button class="fd122-tool" data-tool="pen" aria-pressed="true">STIFT</button><button class="fd122-tool" data-tool="text">TEXT</button><button class="fd122-tool" data-tool="eraser">RADIERER</button><button id="fd122-undo">↶</button><button id="fd122-redo">↷</button><button id="fd122-clear">ALLES LÖSCHEN</button><input id="fd122-color" type="color" value="#163a46" aria-label="Farbe"><label>STÄRKE <input id="fd122-width" type="range" min="1" max="18" value="4"></label><select id="fd122-template"><option value="blank">Leer</option><option value="atis">ATIS</option><option value="departure">Departure Clearance</option><option value="taxi">Taxi Clearance</option><option value="takeoff">Take-off Data</option><option value="arrival">Arrival ATIS</option><option value="approach">Approach Briefing</option><option value="gate">Taxi to Gate</option><option value="notes">Freie Notizen</option></select></div><div class="fd122-page-tabs"></div><div class="fd122-scratch-canvas-wrap"><canvas class="fd122-scratch-canvas"></canvas></div><div class="fd122-scratch-footer"><span>Flugbezogen gespeichert · Maus, Touch und Stift</span><span><button id="fd122-add-page">+ SEITE</button><button id="fd122-export-png">BILD</button><button id="fd122-export-pdf">PDF / DRUCK</button></span></div>`;
    card.appendChild(root);
    const canvas = root.querySelector('canvas');
    const resize = () => {
      const key = `${Math.round(canvas.clientWidth)}x${Math.round(canvas.clientHeight)}:${scratchKey()}:${state.scratch.page}`; if (!canvas.clientWidth || key === state.scratch.resizeKey) return; state.scratch.resizeKey = key;
      const old = loadScratch(); const page = old.pages[state.scratch.page] || old.pages[0]; canvas.width = Math.max(600, Math.round(canvas.clientWidth * devicePixelRatio)); canvas.height = Math.max(420, Math.round(canvas.clientHeight * devicePixelRatio));
      const ctx=canvas.getContext('2d'); ctx.scale(devicePixelRatio,devicePixelRatio); templateBackground(ctx, { width:canvas.width/devicePixelRatio, height:canvas.height/devicePixelRatio }, page.template || 'blank');
      if (page.image) { const img=new Image(); img.onload=()=>ctx.drawImage(img,0,0,canvas.width/devicePixelRatio,canvas.height/devicePixelRatio); img.src=page.image; }
      renderScratchTabs();
    };
    const snapshot = () => canvas.toDataURL('image/png');
    const pushUndo = () => { state.scratch.undo.push(snapshot()); if (state.scratch.undo.length > 30) state.scratch.undo.shift(); state.scratch.redo=[]; };
    const persist = () => { const data=loadScratch(); const page=data.pages[state.scratch.page] || data.pages[0]; page.image=snapshot(); saveScratch(data); };
    const point = (event) => { const r=canvas.getBoundingClientRect(); return { x:event.clientX-r.left, y:event.clientY-r.top }; };
    canvas.onpointerdown=(event)=>{ if (event.pointerType==='touch' && event.isPrimary===false) return; canvas.setPointerCapture?.(event.pointerId); const p=point(event); const ctx=canvas.getContext('2d'); pushUndo(); if(state.scratch.tool==='text'){ const text=prompt('Text eingeben:'); if(text){ctx.fillStyle=root.querySelector('#fd122-color').value;ctx.font='18px Arial';ctx.fillText(text,p.x,p.y);}persist();return;} state.scratch.drawing=true; ctx.beginPath();ctx.moveTo(p.x,p.y); };
    canvas.onpointermove=(event)=>{ if(!state.scratch.drawing)return; const p=point(event),ctx=canvas.getContext('2d'); ctx.lineCap='round';ctx.lineJoin='round';ctx.lineWidth=Number(root.querySelector('#fd122-width').value);ctx.strokeStyle=state.scratch.tool==='eraser'?'#ffffff':root.querySelector('#fd122-color').value;ctx.lineTo(p.x,p.y);ctx.stroke(); };
    canvas.onpointerup=()=>{ if(!state.scratch.drawing)return; state.scratch.drawing=false;persist(); };
    root.querySelectorAll('[data-tool]').forEach((button)=>button.onclick=()=>{state.scratch.tool=button.dataset.tool;root.querySelectorAll('[data-tool]').forEach((b)=>b.setAttribute('aria-pressed',String(b===button)));});
    root.querySelector('#fd122-undo').onclick=()=>{ const image=state.scratch.undo.pop();if(!image)return;state.scratch.redo.push(snapshot());restoreScratchImage(image);persist(); };
    root.querySelector('#fd122-redo').onclick=()=>{ const image=state.scratch.redo.pop();if(!image)return;state.scratch.undo.push(snapshot());restoreScratchImage(image);persist(); };
    root.querySelector('#fd122-clear').onclick=()=>{if(!confirm('Aktuelle Scratchpad-Seite wirklich vollständig löschen?'))return;pushUndo();const data=loadScratch();data.pages[state.scratch.page].image=null;saveScratch(data);state.scratch.resizeKey='';resize();};
    root.querySelector('#fd122-template').onchange=(event)=>{const data=loadScratch();const page=data.pages[state.scratch.page];page.template=event.target.value;page.image=null;saveScratch(data);state.scratch.resizeKey='';resize();};
    root.querySelector('#fd122-add-page').onclick=()=>{const data=loadScratch();data.pages.push({name:`Seite ${data.pages.length+1}`,template:root.querySelector('#fd122-template').value,image:null});state.scratch.page=data.pages.length-1;saveScratch(data);state.scratch.resizeKey='';resize();};
    root.querySelector('#fd122-export-png').onclick=()=>{const a=document.createElement('a');a.href=snapshot();a.download=`Flight-Deck-Scratchpad-${state.record?.flight?.callsign||'flight'}-${state.scratch.page+1}.png`;a.click();};
    root.querySelector('#fd122-export-pdf').onclick=()=>{const w=window.open('','_blank');if(!w)return;w.document.write(`<title>Flight Deck Scratchpad</title><img src="${snapshot()}" style="max-width:100%"><script>onload=()=>print()<\/script>`);w.document.close();};
    root._fd122Resize=resize; resize();
  }
  function restoreScratchImage(dataUrl){const canvas=document.querySelector('.fd122-scratch-canvas');if(!canvas)return;const img=new Image();img.onload=()=>{const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width/devicePixelRatio,canvas.height/devicePixelRatio);};img.src=dataUrl;}
  function renderScratchTabs(){const root=document.querySelector('.fd122-scratchpad');if(!root)return;const tabs=root.querySelector('.fd122-page-tabs'),data=loadScratch();if(state.scratch.page>=data.pages.length)state.scratch.page=0;tabs.innerHTML=data.pages.map((p,i)=>`<button class="fd122-page-tab ${i===state.scratch.page?'active':''}" data-page="${i}">${esc(p.name||`Seite ${i+1}`)}</button>`).join('');tabs.querySelectorAll('[data-page]').forEach((b)=>b.onclick=()=>{state.scratch.page=Number(b.dataset.page);state.scratch.resizeKey='';root._fd122Resize?.();});const template=root.querySelector('#fd122-template');if(template)template.value=data.pages[state.scratch.page]?.template||'blank';}

  const BRIEF_STEPS = ['Flugübersicht','Route & Luftraum','Wetter','NOTAMs','Flughäfen & Runways','Fuel','Masse & Schwerpunkt','Performance','Charts & Verfahren','Risiken & Abschluss'];
  function briefKey() { return `fd122-briefing:${state.record?.id || state.latest?.flight?.flightId || 'unassigned'}`; }
  function loadBrief() { try { return JSON.parse(localStorage.getItem(briefKey())) || { statuses:{}, manual:{}, completedAt:null, fingerprint:null }; } catch { return { statuses:{}, manual:{}, completedAt:null, fingerprint:null }; } }
  function saveBrief(data) { localStorage.setItem(briefKey(), JSON.stringify(data)); }
  function currentBriefFingerprint() {
    const live=state.latest||{}, sb=live.integrations?.simbrief||{}, wx=live.integrations?.aviationWeather||{};
    return JSON.stringify([live.flight?.origin,live.flight?.destination,live.flight?.departureRunway,live.flight?.arrivalRunway,sb.generatedAt,sb.flight?.route,wx.updatedAt]);
  }
  function ensureBriefing() {
    const layout=document.querySelector('[data-page="briefing"] .briefing-layout');if(!layout)return;
    if(!layout.classList.contains('fd122-briefing')){layout.className='briefing-layout fd122-briefing';layout.innerHTML='<div class="fd122-warning-strip"></div><div class="fd122-briefing-summary"></div><div class="fd122-briefing-shell"><nav class="fd122-briefing-nav"></nav><main class="fd122-briefing-panel"></main></div><div class="fd122-complete"><button id="fd122-brief-complete">BRIEFING ABSCHLIESSEN</button><button id="fd122-brief-refresh">DATEN AKTUALISIEREN</button><strong id="fd122-brief-complete-state"></strong></div>';layout.querySelector('#fd122-brief-complete').onclick=()=>{const data=loadBrief();data.completedAt=new Date().toISOString();data.fingerprint=currentBriefFingerprint();saveBrief(data);renderBriefing();};layout.querySelector('#fd122-brief-refresh').onclick=async()=>{await refreshData(true);renderBriefing();};}
    renderBriefing();
  }
  function sourceTime(source, time) { return `<div class="fd122-source">Quelle: ${esc(source||'nicht verfügbar')} · Stand: ${esc(time?formatTime(time):'–')}</div>`; }
  function card(title, body, source, time, wide=false){return `<article class="fd122-brief-card ${wide?'wide':''}"><h3>${esc(title)}</h3>${body}${sourceTime(source,time)}</article>`;}
  function metarFacts(raw){const text=String(raw||'');const wind=text.match(/\b(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT\b/);const vis=text.match(/\s(\d{4})\s/);const temp=text.match(/\s(M?\d{2})\/(M?\d{2})\s/);const qnh=text.match(/\bQ(\d{4})\b/);return{wind:wind?`${wind[1]}° ${wind[2]} kt${wind[4]?` G${wind[4]}`:''}`:'–',gust:finite(wind?.[4]),visibility:vis?`${Number(vis[1])/1000} km`:'–',temp:temp?`${temp[1]} / ${temp[2]} °C`:'–',qnh:qnh?`${qnh[1]} hPa`:'–'};}
  function briefingWarnings(){const warnings=[];const airports=state.latest?.integrations?.aviationWeather?.airports||[];for(const wx of airports){const facts=metarFacts(wx.metar);if(facts.gust&&facts.gust>=25)warnings.push({level:'notice',text:`${wx.airport}: Böen ${facts.gust} kt`});if(/\b(TS|TSRA|VCTS)\b/.test(wx.metar||''))warnings.push({level:'critical',text:`${wx.airport}: Gewitter im METAR`});if(/\b(FZRA|FZDZ|SN)\b/.test(wx.metar||''))warnings.push({level:'notice',text:`${wx.airport}: mögliches Vereisungs-/Winterwetter`});}if(!(state.latest?.integrations?.aviationWeather))warnings.push({level:'notice',text:'Wetterquelle nicht verfügbar'});return warnings;}
  function renderBriefing(){const layout=document.querySelector('.fd122-briefing');if(!layout)return;const live=state.latest||{},sb=live.integrations?.simbrief||{},flight=sb.flight||live.flight||{},record=state.record||{};const data=loadBrief();const fingerprint=currentBriefFingerprint();if(data.completedAt&&data.fingerprint&&data.fingerprint!==fingerprint){data.completedAt=null;for(const i of [1,2,4,5,7,9])data.statuses[i]='open';saveBrief(data);}const warnings=briefingWarnings();layout.querySelector('.fd122-warning-strip').innerHTML=warnings.length?warnings.map(w=>`<span class="fd122-warning-chip ${w.level}">${esc(w.text)}</span>`).join(''):'<span class="fd122-warning-chip">Keine automatisch erkannten Hinweise aus den verfügbaren Daten.</span>';
    const summary=[[ 'CALLSIGN',flight.callsign||flight.flightNumber],[ 'ROUTE',`${flight.origin||'–'} → ${flight.destination||'–'}`],[ 'ALTERNATE',flight.alternate],[ 'AIRCRAFT',flight.aircraftType||record.flight?.aircraftType],[ 'CRUISE',flight.cruiseAltitude?`FL${Math.round(Number(flight.cruiseAltitude)/100)}`:(flight.cruiseLevel||'–')],[ 'BLOCK',flight.enrouteSeconds?formatDuration(flight.enrouteSeconds):'–']];layout.querySelector('.fd122-briefing-summary').innerHTML=summary.map(([a,b])=>`<div><small>${a}</small><strong title="${esc(b||'–')}">${esc(b||'–')}</strong></div>`).join('');
    const nav=layout.querySelector('.fd122-briefing-nav');nav.innerHTML=BRIEF_STEPS.map((name,i)=>`<button data-step="${i}" class="${i===state.briefingStep?'active':''}"><span class="num">${i+1}</span><span>${esc(name)}</span><i class="fd122-status-dot ${data.statuses[i]==='checked'?'checked':data.statuses[i]==='critical'?'critical':data.statuses[i]==='notice'?'notice':''}"></i></button>`).join('');nav.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{state.briefingStep=Number(b.dataset.step);renderBriefing();});
    const wxAirports=live.integrations?.aviationWeather?.airports||[];const siWx=live.integrations?.sayIntentions?.weather?.airports||[];const originWx=wxAirports.find(x=>upper(x.airport)===upper(flight.origin))||siWx.find(x=>upper(x.airport)===upper(flight.origin));const destWx=wxAirports.find(x=>upper(x.airport)===upper(flight.destination))||siWx.find(x=>upper(x.airport)===upper(flight.destination));const unitKg=(document.querySelector('#weight-unit-select')?.value||'kg').toLowerCase()!=='lb';const fuel=(v)=>finite(v)===null?'–':`${fmt(unitKg?weightKg(v):v)} ${unitKg?'kg':'lb'}`;const actualFuel=finite(live.aircraft?.fuelWeightPounds);const gross=finite(live.aircraft?.grossWeightPounds);const route=planFor(record).route||flight.route||live.flight?.flightPlanRoute||'–';
    const weatherBody=(entry)=>{if(!entry)return '<p>Keine Daten verfügbar.</p>';const f=metarFacts(entry.metar);return `<dl><dt>Wind</dt><dd>${f.wind}</dd><dt>Sicht</dt><dd>${f.visibility}</dd><dt>Temp / Taupunkt</dt><dd>${f.temp}</dd><dt>QNH</dt><dd>${f.qnh}</dd><dt>METAR</dt><dd class="fd122-raw">${esc(entry.metar||'–')}</dd><dt>TAF</dt><dd class="fd122-raw">${esc(entry.taf||'–')}</dd></dl>`;};
    const panels=[];
    panels[0]=card('OFP / Flugübersicht',`<dl><dt>Callsign</dt><dd>${esc(flight.callsign||'–')}</dd><dt>Abflug / Ziel</dt><dd>${esc(flight.origin||'–')} → ${esc(flight.destination||'–')}</dd><dt>Alternate</dt><dd>${esc(flight.alternate||'–')}</dd><dt>Flugzeug / Reg.</dt><dd>${esc(flight.aircraftType||record.flight?.aircraftType||'–')} · ${esc(record.flight?.registration||flight.registration||'–')}</dd><dt>Route</dt><dd>${esc(route)}</dd><dt>OUT / OFF / ON / IN</dt><dd>${formatTime(flight.estimatedOut)} · ${formatTime(flight.estimatedOff)} · ${formatTime(flight.estimatedOn)} · ${formatTime(flight.estimatedIn)}</dd><dt>Block Fuel</dt><dd>${fuel(flight.blockFuelPounds)}</dd></dl>`,sb.imported?'SimBrief':'MSFS / aktive Flugdaten',sb.generatedAt||live.updatedAt,true);
    panels[1]=card('Geplante Route & Verfahren',`<dl><dt>Route</dt><dd>${esc(route)}</dd><dt>SID</dt><dd>${esc(planFor(record).sid||live.flight?.sid||'–')}</dd><dt>STAR</dt><dd>${esc(planFor(record).star||live.flight?.star||'–')}</dd><dt>Wegpunkte</dt><dd>${planPoints(record).length||'–'}</dd><dt>Luftraumprüfung</dt><dd>Keine dedizierte Luftraumquelle verbunden – wird nicht erfunden.</dd></dl>`,planFor(record).source||'MSFS / SimBrief',record.updatedAt,true);
    panels[2]=card(`${flight.origin||'DEP'} Wetter`,weatherBody(originWx),'AviationWeather / SI',originWx?.observedAt||live.integrations?.aviationWeather?.updatedAt)+card(`${flight.destination||'DEST'} Wetter`,weatherBody(destWx),'AviationWeather / SI',destWx?.observedAt||live.integrations?.aviationWeather?.updatedAt)+card('Enroute-Risiken','<p>Höhenwind, SIGMET, Turbulenz und Vereisung werden nur angezeigt, wenn eine verbundene Quelle diese Daten liefert. Nicht verfügbare Werte bleiben bewusst offen.</p>','verfügbare Wetterquellen',live.integrations?.aviationWeather?.updatedAt,true);
    panels[3]=card('NOTAMs','<p>Keine NOTAM-Datenquelle verbunden. Es werden keine Meldungen simuliert oder aus allgemeinem Wissen ergänzt. Sobald eine Quelle angebunden ist, werden Airport-/Route-NOTAMs hier priorisiert und lesbar zusammengefasst.</p>','nicht verbunden',null,true);
    panels[4]=card('Departure',`<dl><dt>Airport</dt><dd>${esc(flight.origin||'–')}</dd><dt>Erwartete Runway</dt><dd>${esc(live.flight?.departureRunway||flight.departureRunway||'–')}</dd><dt>SID</dt><dd>${esc(planFor(record).sid||'–')}</dd><dt>Gate / Stand</dt><dd>${esc(record.flight?.gate||live.gate?.name||'–')}</dd></dl>`,'MSFS / SimBrief',record.updatedAt)+card('Destination',`<dl><dt>Airport</dt><dd>${esc(flight.destination||'–')}</dd><dt>Erwartete Runway</dt><dd>${esc(live.flight?.arrivalRunway||flight.arrivalRunway||'–')}</dd><dt>STAR / Approach</dt><dd>${esc(planFor(record).star||'–')} / ${esc(live.flight?.approach||'–')}</dd><dt>Taxi Arrival</dt><dd>${record.taxiRoutes?.arrival||record.taxi?.routes?.arrival?'vorbereitet':'noch nicht vorbereitet'}</dd></dl>`,'MSFS / SimBrief',record.updatedAt);
    panels[5]=card('Fuel Breakdown',`<dl><dt>Taxi</dt><dd>${fuel(flight.taxiFuelPounds)}</dd><dt>Trip</dt><dd>${fuel(flight.tripFuelPounds)}</dd><dt>Contingency</dt><dd>${fuel(flight.contingencyFuelPounds)}</dd><dt>Alternate</dt><dd>${fuel(flight.alternateFuelPounds)}</dd><dt>Final / Reserve</dt><dd>${fuel(flight.reserveFuelPounds)}</dd><dt>Extra</dt><dd>${fuel(flight.extraFuelPounds)}</dd><dt>Block</dt><dd>${fuel(flight.blockFuelPounds)}</dd><dt>Actual</dt><dd>${fuel(actualFuel)}</dd></dl>`,sb.imported?'SimBrief + MSFS':'MSFS',sb.generatedAt||record.updatedAt,true);
    panels[6]=card('Masse & Beladung',`<dl><dt>Passagiere</dt><dd>${fmt(flight.passengers??record.flight?.passengers)}</dd><dt>Payload</dt><dd>${fuel(flight.payloadPounds)}</dd><dt>ZFW</dt><dd>${fuel(flight.zeroFuelWeightPounds)}</dd><dt>TOW</dt><dd>${fuel(flight.takeoffWeightPounds)}</dd><dt>LW</dt><dd>${fuel(flight.landingWeightPounds)}</dd><dt>Actual Gross Weight</dt><dd>${fuel(gross)}</dd><dt>CG</dt><dd>${finite(live.aircraft?.centerOfGravityPercent)===null?'nicht unterstützt':`${fmt(live.aircraft.centerOfGravityPercent,1)} %`}</dd></dl><p>Strukturelle Grenzwerte werden nur bewertet, wenn ein aircraft-spezifisches Profil sie liefert.</p>`,sb.imported?'SimBrief + Aircraft':'Aircraft',record.updatedAt,true);
    const manual=data.manual.performance||{};panels[7]=card('Take-off / Landing Performance',`<p>Flight Deck berechnet keine erfundenen Performance-Daten. Werte können aus dem Aircraft-EFB übernommen und hier dokumentiert werden.</p><div class="fd122-brief-grid"><label>V1 <input data-perf="v1" value="${esc(manual.v1||'')}"></label><label>VR <input data-perf="vr" value="${esc(manual.vr||'')}"></label><label>V2 <input data-perf="v2" value="${esc(manual.v2||'')}"></label><label>Flex/Assumed <input data-perf="flex" value="${esc(manual.flex||'')}"></label><label>VAPP/VREF <input data-perf="vapp" value="${esc(manual.vapp||'')}"></label><label>Autobrake <input data-perf="autobrake" value="${esc(manual.autobrake||'')}"></label></div>`, 'manuell / Aircraft-EFB', data.manual.performanceUpdatedAt, true);
    panels[8]=card('Charts & Dokumente',`<p>Airport-, Departure-, Enroute-, Arrival-, Approach- und Alternate-Unterlagen können im Dokumentenbereich flugbezogen abgelegt werden. Navigraph-Inhalte werden nur bei vorhandener Verbindung/Berechtigung verwendet.</p><button id="fd122-open-docs">DOKUMENTE ÖFFNEN</button>`,live.integrations?.navigraph?.authenticated?'Navigraph + lokale Dokumente':'lokale Dokumente',record.updatedAt,true);
    panels[9]=card('Threat Summary',`${warnings.length?`<ul>${warnings.map(w=>`<li>${esc(w.text)}</li>`).join('')}</ul>`:'<p>Keine automatisch erkannten Risiken aus den aktuell verfügbaren Quellen.</p>'}<p><strong>Offene Datenquellen:</strong> ${!live.integrations?.aviationWeather?'Wetter ':''}${!live.integrations?.notam?'NOTAM ':''}${!live.integrations?.navigraph?.authenticated?'Charts/Navigraph ':''}</p><textarea id="fd122-threat-notes" placeholder="Eigene Risiken, Maßnahmen und Notizen …">${esc(data.manual.threatNotes||'')}</textarea>`, 'Zusammenführung verfügbarer Quellen', new Date().toISOString(), true);
    const panel=layout.querySelector('.fd122-briefing-panel');panel.innerHTML=`<section class="fd122-brief-section active"><header class="fd122-brief-head"><div><h2>${esc(BRIEF_STEPS[state.briefingStep])}</h2><p>Simulationsbriefing · Quelle und Datenstand bleiben nachvollziehbar.</p></div><div class="fd122-brief-status-actions"><button data-status="checked">GEPRÜFT</button><button data-status="notice">HINWEIS</button><button data-status="critical">KRITISCH</button></div></header><div class="fd122-brief-grid">${panels[state.briefingStep]||''}</div></section>`;panel.querySelectorAll('[data-status]').forEach(b=>b.onclick=()=>{const d=loadBrief();d.statuses[state.briefingStep]=b.dataset.status;saveBrief(d);renderBriefing();});panel.querySelectorAll('[data-perf]').forEach(input=>input.onchange=()=>{const d=loadBrief();d.manual.performance=d.manual.performance||{};d.manual.performance[input.dataset.perf]=input.value;d.manual.performanceUpdatedAt=new Date().toISOString();saveBrief(d);});const notes=panel.querySelector('#fd122-threat-notes');if(notes)notes.onchange=()=>{const d=loadBrief();d.manual.threatNotes=notes.value;saveBrief(d);};panel.querySelector('#fd122-open-docs')?.addEventListener('click',()=>{document.querySelector('[data-app-id="briefing"], [data-app-id="documents"], [data-open-module="documents"]')?.click();});layout.querySelector('#fd122-brief-complete-state').textContent=data.completedAt?`Abgeschlossen ${new Date(data.completedAt).toLocaleString()}`:'Briefing offen · blockiert den Flug nicht';}

  const SERVICE_DEFS=[['jetway','Jetway / Treppe','↔'],['boarding','Boarding','↗'],['baggage','Gepäck','▣'],['catering','Catering','□'],['fuel','Fuel','◈'],['pushback','Pushback','←'],['deicing','De-Icing','✣'],['followme','Follow-Me','◆'],['marshaller','Marshaller','⌁'],['deboarding','Deboarding','↘'],['cleaning','Reinigung','◇']];
  function serviceStateFromGsx(id){const gsx=state.latest?.integrations?.gsx||{};const services=gsx.services||gsx.serviceStates||{};const entry=Array.isArray(services)?services.find(s=>upper(s.id||s.name).includes(upper(id))):services[id];const value=typeof entry==='string'?entry:entry?.status||entry?.state;if(!value)return null;const t=String(value).toLowerCase();if(/complete|finished|done/.test(t))return'abgeschlossen';if(/active|servicing|boarding|loading/.test(t))return'aktiv';if(/requested|called/.test(t))return'angefordert';if(/approach|coming|enroute/.test(t))return'unterwegs';if(/unavailable|disabled/.test(t))return'nicht verfügbar';return'verfügbar';}
  function manualServiceState(id){const key=`fd122-ground:${state.record?.id||'unassigned'}`;try{return JSON.parse(localStorage.getItem(key)||'{}')[id]||'verfügbar';}catch{return'verfügbar';}}
  function setManualServiceState(id,value){const key=`fd122-ground:${state.record?.id||'unassigned'}`;let d={};try{d=JSON.parse(localStorage.getItem(key)||'{}');}catch{}d[id]=value;localStorage.setItem(key,JSON.stringify(d));}
  function ensureGround(){const layout=document.querySelector('[data-page="ground"] .ground-layout');if(!layout)return;if(!layout.classList.contains('fd122-ground')){layout.className='ground-layout fd122-ground';layout.innerHTML='<div class="fd122-ground-main"><section class="fd122-ground-card fd122-turnaround-card"></section><section class="fd122-ground-card"><div class="fd122-ground-head"><div><small>AKTUELL RELEVANT</small><h2>Ground Services</h2></div><label><input id="fd122-auto-priority" type="checkbox" checked> automatisch priorisieren</label></div><div class="fd122-services"></div><details class="fd122-more"><summary>Weitere Services</summary><div class="fd122-services fd122-other"></div></details></section></div><aside class="fd122-ground-side"><section class="fd122-ground-card fd122-gsx"></section><section class="fd122-ground-card"><h3>Hinweise</h3><p class="fd122-ground-note">GSX-Status wird übernommen, soweit die dokumentierte Schnittstelle ihn liefert. Nicht unterstützte Aktionen werden nicht als funktionsfähige GSX-Buttons dargestellt. Ohne GSX können Zustände manuell dokumentiert werden.</p></section></aside>';}
    renderGround();}
  function renderGround(){const layout=document.querySelector('.fd122-ground');if(!layout)return;const gsx=state.latest?.integrations?.gsx||{};const connected=gsx.status==='connected'||gsx.connected===true||state.latest?.connections?.gsx?.status==='connected';const record=state.record||{};const landed=Boolean(record.stats?.landedAt)||Boolean(state.latest?.aircraft?.onGround&&record.stats?.takeoffAt);const preflight=!landed;const deice=/\b(SN|FZ|ICE)\b/.test(JSON.stringify(state.latest?.integrations?.aviationWeather||{}));const priority=preflight?['jetway','boarding','baggage','catering','fuel',...(deice?['deicing']:[]),'pushback']:['followme','marshaller','jetway','deboarding','baggage','catering','fuel','cleaning'];const states={};for(const [id]of SERVICE_DEFS)states[id]=serviceStateFromGsx(id)||manualServiceState(id);const necessary=priority.filter(id=>states[id]!=='nicht verfügbar');const done=necessary.filter(id=>states[id]==='abgeschlossen').length;const progress=necessary.length?Math.round(done/necessary.length*100):0;const next=necessary.find(id=>!['abgeschlossen','aktiv'].includes(states[id]))||necessary.find(id=>states[id]==='aktiv')||null;const stages=preflight?['Vorbereitung','Services aktiv','Boarding','Ready for Pushback']:['Arrival','Deboarding','Services aktiv','Abgeschlossen'];let stageIndex=0;if(progress>10)stageIndex=1;if((states.boarding==='aktiv'||states.deboarding==='aktiv'))stageIndex=2;if(progress>=90)stageIndex=3;layout.querySelector('.fd122-turnaround-card').innerHTML=`<div class="fd122-ground-head"><div><small>TURNAROUND</small><h2>${progress}% · ${esc(stages[stageIndex])}</h2></div><strong>${next?`Nächster Schritt: ${esc(SERVICE_DEFS.find(x=>x[0]===next)?.[1]||next)}`:'Keine offenen geplanten Services'}</strong></div><div class="fd122-turnaround">${stages.map((s,i)=>`<div class="fd122-turnaround-step ${i===stageIndex?'active':''} ${i<stageIndex?'done':''}"><small>${i+1}</small><strong>${esc(s)}</strong></div>`).join('')}</div><p class="fd122-ground-note">Ready for Pushback wird erst angezeigt, wenn die priorisierten Vorabflugschritte als abgeschlossen oder nicht erforderlich dokumentiert sind.</p>`;layout.querySelector('.fd122-gsx').innerHTML=`<div class="fd122-ground-head"><span class="fd122-gsx-badge"><i>GSX</i><span>Integration</span></span><span class="fd122-service-state">${connected?'verbunden':'optional / offline'}</span></div><p class="fd122-ground-note">${connected?'Live-Zustände werden automatisch synchronisiert.':'Manuelle Zustände bleiben bedienbar; eine fehlende GSX-Verbindung blockiert die Ansicht nicht.'}</p>`;const renderService=(id,name,icon,isNext)=>`<div class="fd122-service ${isNext?'next':''}" data-service="${id}"><span class="icon">${icon}</span><span><strong>${esc(name)}</strong><small>${connected&&serviceStateFromGsx(id)?'GSX live':'manuell / fallback'}</small></span><button class="fd122-service-state" ${connected&&serviceStateFromGsx(id)?'disabled':''}>${esc(states[id])}</button></div>`;const main=layout.querySelector('.fd122-services:not(.fd122-other)'),other=layout.querySelector('.fd122-other');main.innerHTML=priority.map(id=>{const d=SERVICE_DEFS.find(x=>x[0]===id);return renderService(...d,id===next);}).join('');other.innerHTML=SERVICE_DEFS.filter(d=>!priority.includes(d[0])).map(d=>renderService(...d,false)).join('');layout.querySelectorAll('.fd122-service button:not([disabled])').forEach(b=>b.onclick=()=>{const id=b.closest('[data-service]').dataset.service;const order=['verfügbar','angefordert','unterwegs','aktiv','abgeschlossen','nicht verfügbar'];const current=manualServiceState(id);setManualServiceState(id,order[(order.indexOf(current)+1)%order.length]);renderGround();});}

  function installArchiveDatasetFallback(){const list=document.querySelector('#flight-archive-list');if(!list)return;const buttons=[...list.querySelectorAll('.flight-archive-entry:not([data-flight-id])')];if(!buttons.length)return;fetchJson('/api/flights').then(body=>{const flights=body.flights||[];buttons.forEach((button,index)=>{const flight=flights[index];if(flight?.id)button.dataset.flightId=flight.id;});}).catch(()=>{});}

  async function tick(){
    await refreshData(false);
    installArchiveDatasetFallback();
    ensureProfileControls(); renderProfile(); ensureMapControls(); renderArchiveMapLayers(false);
    ensureScratchpad(); document.querySelector('.fd122-scratchpad')?._fd122Resize?.(); renderScratchTabs();
    ensureBriefing(); ensureGround();
  }

  document.addEventListener('click',(event)=>{if(event.target.closest('.flight-archive-entry'))setTimeout(()=>{refreshData(true).then(()=>tick());},120);},true);
  window.addEventListener('resize',()=>document.querySelector('.fd122-scratchpad')?._fd122Resize?.());
  tick(); setInterval(tick,3000);
  window.FlightDeckRelease122={version:VERSION,refresh:()=>refreshData(true).then(tick),renderProfile,renderArchiveMapLayers};
})();
