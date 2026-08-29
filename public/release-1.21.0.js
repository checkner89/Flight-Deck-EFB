(() => {
  'use strict';

  const VERSION = '1.21.0';
  const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('flight-deck-token') || '';
  if (token) sessionStorage.setItem('flight-deck-token', token);
  const authUrl = (pathname) => {
    const url = new URL(pathname, location.origin);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const uppercase = (value) => String(value ?? '').trim().toUpperCase();
  const state = {
    latest: null,
    currentFlight: null,
    currentFlightFetchedAt: 0,
    tracking: { trafficLayer: null, departureTaxiLayer: null, arrivalTaxiLayer: null },
    mediaRecorder: null,
    mediaStream: null,
    mediaRecordingId: null,
    mediaStartedAt: null,
    mediaTimer: null,
    currentMediaFlightId: null,
  };

  function formatTime(value, { planned = false } = {}) {
    if (value === null || value === undefined || value === '' || value === 0) return '–';
    let date;
    if (typeof value === 'number' || /^\d{9,13}$/.test(String(value))) {
      const numeric = Number(value);
      date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
    } else {
      date = new Date(value);
    }
    if (!Number.isFinite(date.getTime())) return '–';
    const useUtc = localStorage.getItem('flight-deck-clock-mode') === 'utc' || document.documentElement.dataset.timezone === 'utc';
    return new Intl.DateTimeFormat(document.documentElement.lang || 'de-DE', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: useUtc ? 'UTC' : undefined,
    }).format(date) + (useUtc ? ' UTC' : ' LT') + (planned ? ' · geplant' : '');
  }

  function simplifyHome() {
    const labels = {
      flight: 'Flug & Tracking',
      taxi: 'Taxi',
      briefing: 'Briefing-Dokumente',
      com: 'Kommunikation',
      atc: 'Kommunikation',
      settings: 'Einstellungen',
      news: 'News',
      documents: 'Briefing-Dokumente',
      files: 'Briefing-Dokumente',
      media: 'Medien',
      weather: 'Wetter',
      archive: 'Flugarchiv',
      flightboard: 'Live Traffic',
    };
    document.querySelectorAll('.efb-app-tile[data-app-id]').forEach((tile) => {
      const id = tile.dataset.appId;
      if (id === 'flightboard') {
        tile.hidden = true;
        tile.setAttribute('aria-hidden', 'true');
        return;
      }
      const copy = tile.querySelector('.app-tile-copy');
      if (!copy) return;
      const strong = copy.querySelector('strong');
      const label = labels[id] || strong?.textContent?.trim();
      copy.querySelectorAll('small, span').forEach((node) => { node.hidden = true; });
      if (strong && label) strong.textContent = label;
    });
    document.querySelectorAll('.home-launcher-heading p, .launcher-section-heading > span').forEach((node) => { node.hidden = true; });
    for (const text of [
      'Lade einen Flug in MSFS oder starte deine SayIntentions-Flugsitzung.',
      'Neuer Flug gestartet · warte auf eine neue SI-Flugsitzung',
    ]) {
      document.querySelectorAll('p,span,small,div').forEach((node) => {
        if (node.children.length === 0 && node.textContent.trim() === text) node.remove();
      });
    }
  }

  function removeLargeAppHeadings() {
    document.querySelectorAll('.efb-page').forEach((page) => {
      const directHeaders = [...page.children].filter((child) => child.matches?.('.module-header, .page-header, .app-page-header, .efb-page-header'));
      directHeaders.forEach((header) => { header.hidden = true; });
    });
  }

  function ensureHomeButton() {
    const button = document.querySelector('#app-home-button');
    if (!button || button.dataset.home121 === '1') return;
    button.dataset.home121 = '1';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2v8.3a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-8.3Z"></path></svg><span>HOME</span>';
    button.setAttribute('aria-label', 'Home');
  }

  function removeSeparateTrafficNavigation() {
    document.querySelectorAll('[data-open-module="flightboard"], [data-page="flightboard"], [data-app-id="flightboard"], a[href*="flightboard"]').forEach((node) => {
      node.hidden = true;
      node.setAttribute('aria-hidden', 'true');
    });
  }

  function ensureTrackingTimePanel() {
    if (document.querySelector('#tracking-schedule-card')) return;
    const profile = document.querySelector('.tracking-profile-card');
    if (!profile) return;
    const panel = document.createElement('div');
    panel.id = 'tracking-schedule-card';
    panel.className = 'tracking-schedule-card';
    panel.innerHTML = `
      <span><small>TAKE-OFF</small><strong id="tracking-takeoff-time">–</strong></span>
      <span><small>LANDUNG</small><strong id="tracking-landing-time">–</strong></span>
      <button id="tracking-manual-end" type="button">FLUG BEENDEN</button>`;
    profile.insertAdjacentElement('afterbegin', panel);
    panel.querySelector('#tracking-manual-end')?.addEventListener('click', async () => {
      if (!window.confirm('Aktiven Flug wirklich manuell beenden? Die bisherige Aufzeichnung wird gespeichert.')) return;
      const response = await fetch(authUrl('/api/flights/current/save'), { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) window.alert(body.error || 'Der Flug konnte nicht beendet werden.');
      await fetchCurrentFlight(true);
      renderTrackingTimes();
    });
  }

  async function fetchCurrentFlight(force = false) {
    if (!force && Date.now() - state.currentFlightFetchedAt < 5000) return state.currentFlight;
    state.currentFlightFetchedAt = Date.now();
    try {
      const response = await fetch(authUrl('/api/flights/current'), { cache: 'no-store' });
      if (!response.ok) return state.currentFlight;
      const data = await response.json();
      state.currentFlight = data.flight || null;
      return state.currentFlight;
    } catch {
      return state.currentFlight;
    }
  }

  function renderTrackingTimes() {
    ensureTrackingTimePanel();
    const live = state.latest || {};
    const flight = state.currentFlight || {};
    const sb = live.integrations?.simbrief?.flight || {};
    const plannedTakeoff = sb.estimatedOff ?? flight.flight?.estimatedOff ?? null;
    const plannedLanding = sb.estimatedOn ?? flight.flight?.estimatedOn ?? null;
    const actualTakeoff = flight.stats?.takeoffAt || null;
    const actualLanding = flight.stats?.landedAt || null;
    const takeoffEl = document.querySelector('#tracking-takeoff-time');
    const landingEl = document.querySelector('#tracking-landing-time');
    if (takeoffEl) takeoffEl.textContent = `${formatTime(plannedTakeoff, { planned: true })}${actualTakeoff ? ` · tatsächlich ${formatTime(actualTakeoff)}` : ''}`;
    if (landingEl) landingEl.textContent = `${formatTime(plannedLanding, { planned: true })}${actualLanding ? ` · tatsächlich ${formatTime(actualLanding)}` : ' · noch offen'}`;
  }

  function ownshipLike(traffic, own) {
    if (!traffic || !own) return false;
    const ownIds = [own.callsign, own.atcId, own.registration, own.tailNumber].map(uppercase).filter(Boolean);
    const trafficIds = [traffic.callsign, traffic.atcId, traffic.registration, traffic.tailNumber].map(uppercase).filter(Boolean);
    if (ownIds.some((value) => trafficIds.includes(value))) return true;
    const lat1 = finite(traffic.lat); const lon1 = finite(traffic.lon); const lat2 = finite(own.lat); const lon2 = finite(own.lon);
    if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return false;
    const latScale = 111320;
    const lonScale = latScale * Math.cos((lat2 * Math.PI) / 180);
    const distance = Math.hypot((lat1 - lat2) * latScale, (lon1 - lon2) * lonScale);
    const altDelta = Math.abs((finite(traffic.altitudeFeet ?? traffic.altitude) ?? 0) - (finite(own.altitudeFeet ?? own.altitude) ?? 0));
    const speedDelta = Math.abs((finite(traffic.groundSpeed) ?? 0) - (finite(own.groundSpeed) ?? 0));
    return distance < 90 && altDelta < 180 && speedDelta < 15;
  }

  function airplaneIcon(heading = 0, own = false) {
    const colorClass = own ? ' ownship' : '';
    return L.divIcon({
      className: `fd121-aircraft-icon${colorClass}`,
      html: `<span style="transform:rotate(${Number(heading) || 0}deg)"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M14.2 2.5h3.6l1.4 10.1 9.2 4.5v3.1l-9-.9-.6 7.1 3.1 2.1v1.9L16 29.2l-5.9 1.2v-1.9l3.1-2.1-.6-7.1-9 .9v-3.1l9.2-4.5 1.4-10.1Z"></path></svg></span>`,
      iconSize: [30, 30], iconAnchor: [15, 15],
    });
  }

  function ensureTrackingLayers() {
    const map = window.__flightDeckTrackingMap;
    if (!map || !window.L) return null;
    if (!state.tracking.trafficLayer) state.tracking.trafficLayer = L.layerGroup().addTo(map);
    if (!state.tracking.departureTaxiLayer) state.tracking.departureTaxiLayer = L.layerGroup().addTo(map);
    if (!state.tracking.arrivalTaxiLayer) state.tracking.arrivalTaxiLayer = L.layerGroup().addTo(map);
    return map;
  }

  function renderTrackingTrafficAndTaxi() {
    const map = ensureTrackingLayers();
    if (!map || !state.latest) return;
    const own = state.latest.aircraft || {};
    const traffic = Array.isArray(state.latest.integrations?.simTraffic?.aircraft) ? state.latest.integrations.simTraffic.aircraft : [];
    state.tracking.trafficLayer.clearLayers();
    for (const target of traffic) {
      if (ownshipLike(target, own)) continue;
      const lat = finite(target.lat); const lon = finite(target.lon);
      if (lat === null || lon === null) continue;
      const callsign = target.callsign || target.atcId || target.flightNumber || 'TRAFFIC';
      const marker = L.marker([lat, lon], { icon: airplaneIcon(target.headingDegrees ?? target.heading ?? target.track, false), riseOnHover: true });
      const type = target.aircraftType || target.model || target.title || '–';
      const reg = target.registration || target.tailNumber || '–';
      const altitude = finite(target.altitudeFeet ?? target.altitude);
      const speed = finite(target.groundSpeedKnots ?? target.groundSpeed);
      const heading = finite(target.headingDegrees ?? target.heading ?? target.track);
      const origin = target.origin || target.departure || '–';
      const destination = target.destination || target.arrival || '–';
      const source = target.source || state.latest.integrations?.simTraffic?.source || 'MSFS';
      marker.bindTooltip(escapeHtml(callsign), { direction: 'top', opacity: .92, offset: [0, -12] });
      marker.bindPopup(`<div class="fd121-traffic-popup"><strong>${escapeHtml(callsign)}</strong><dl>
        <div><dt>Aircraft</dt><dd>${escapeHtml(type)}</dd></div><div><dt>Reg.</dt><dd>${escapeHtml(reg)}</dd></div>
        <div><dt>Altitude</dt><dd>${altitude === null ? '–' : `${Math.round(altitude).toLocaleString()} ft`}</dd></div>
        <div><dt>Speed</dt><dd>${speed === null ? '–' : `${Math.round(speed)} kt`}</dd></div>
        <div><dt>Heading</dt><dd>${heading === null ? '–' : `${Math.round(heading)}°`}</dd></div>
        <div><dt>Route</dt><dd>${escapeHtml(origin)} → ${escapeHtml(destination)}</dd></div><div><dt>Quelle</dt><dd>${escapeHtml(source)}</dd></div>
      </dl></div>`);
      marker.addTo(state.tracking.trafficLayer);
    }

    const routes = state.latest.taxi?.routes || {};
    const active = state.latest.taxi?.path || [];
    const activeMeta = state.latest.taxi?.pathMetadata || {};
    const dep = routes.departure?.path || (activeMeta.mode === 'departure' ? active : []);
    const arr = routes.arrival?.path || (activeMeta.mode === 'arrival' ? active : []);
    const drawTaxi = (layer, path, className) => {
      layer.clearLayers();
      const points = (path || []).map((p) => [finite(p.lat), finite(p.lon)]).filter(([lat, lon]) => lat !== null && lon !== null);
      if (points.length < 2) return;
      L.polyline(points, { color: '#ff4757', weight: 4, opacity: .92, dashArray: '10 8', className, interactive: false }).addTo(layer);
    };
    drawTaxi(state.tracking.departureTaxiLayer, dep, 'fd121-taxi-departure');
    drawTaxi(state.tracking.arrivalTaxiLayer, arr, 'fd121-taxi-arrival');
  }

  function pointDistanceMeters(a, b) {
    const lat1 = finite(a?.lat); const lon1 = finite(a?.lon); const lat2 = finite(b?.lat); const lon2 = finite(b?.lon);
    if ([lat1, lon1, lat2, lon2].some((v) => v === null)) return Infinity;
    const y = (lat1 - lat2) * 111320;
    const x = (lon1 - lon2) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    return Math.hypot(x, y);
  }

  function featurePoints(feature) {
    return (feature?.coordinates || []).map((p) => Array.isArray(p) ? { lat: finite(p[0]), lon: finite(p[1]) } : { lat: finite(p?.lat), lon: finite(p?.lon ?? p?.lng) }).filter((p) => p.lat !== null && p.lon !== null);
  }

  function runwayRefs(feature) {
    return String(feature?.ref || '').toUpperCase().split(/[\/;,|\-]/).map((v) => v.trim()).filter(Boolean);
  }

  function availableRunwayExits(mapData, runway) {
    if (!mapData || !runway) return [];
    const wanted = uppercase(runway).replace(/^0+(?=\d)/, '');
    const runwayFeatures = (mapData.features || []).filter((f) => f.kind === 'runway' && runwayRefs(f).some((r) => r.replace(/^0+(?=\d)/, '') === wanted));
    const runwayPts = runwayFeatures.flatMap(featurePoints);
    if (!runwayPts.length) return [];
    const refs = new Map();
    for (const feature of mapData.features || []) {
      if (feature.kind !== 'taxiway') continue;
      const ref = uppercase(feature.ref || feature.name);
      if (!ref) continue;
      const pts = featurePoints(feature);
      let best = Infinity;
      for (const p of pts) for (const r of runwayPts) best = Math.min(best, pointDistanceMeters(p, r));
      if (best <= 85 && (!refs.has(ref) || best < refs.get(ref).distance)) refs.set(ref, { ref, distance: best, point: pts.reduce((bestPoint, p) => pointDistanceMeters(p, runwayPts[0]) < pointDistanceMeters(bestPoint, runwayPts[0]) ? p : bestPoint, pts[0]) });
    }
    return [...refs.values()].sort((a, b) => a.distance - b.distance || a.ref.localeCompare(b.ref, undefined, { numeric: true }));
  }

  function ensureArrivalTaxiControls() {
    const plannerMode = document.querySelector('#planner-mode');
    const runway = document.querySelector('#planner-runway');
    if (!plannerMode || !runway) return;
    let wrapper = document.querySelector('#fd121-runway-exit-field');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'fd121-runway-exit-field';
      wrapper.className = 'planner-field';
      wrapper.innerHTML = '<label for="planner-runway-exit">Runway Exit</label><select id="planner-runway-exit"><option value="">Exit noch unbekannt</option></select>';
      const destinationField = document.querySelector('#destination-field');
      (destinationField || runway.closest('.planner-field'))?.insertAdjacentElement(destinationField ? 'beforebegin' : 'afterend', wrapper);
    }
    let useDestination = document.querySelector('#fd121-use-destination');
    if (!useDestination) {
      useDestination = document.createElement('button');
      useDestination.id = 'fd121-use-destination';
      useDestination.type = 'button';
      useDestination.className = 'secondary-card-action fd121-use-destination';
      useDestination.textContent = 'ZIELFLUGHAFEN ÜBERNEHMEN';
      document.querySelector('.airport-search-wrap')?.insertAdjacentElement('afterend', useDestination);
      useDestination.addEventListener('click', () => {
        const destination = uppercase(state.latest?.flight?.destination || state.latest?.integrations?.simbrief?.flight?.destination);
        const input = document.querySelector('#airport-search');
        if (!destination || !input) return;
        input.value = destination;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    const sync = () => {
      wrapper.hidden = plannerMode.value !== 'arrival';
      useDestination.hidden = plannerMode.value !== 'arrival';
      const select = wrapper.querySelector('select');
      const current = select.value;
      const exits = availableRunwayExits(window.__flightDeckLoadedAirportMapData, runway.value);
      select.innerHTML = '<option value="">Exit noch unbekannt</option>' + exits.map((entry) => `<option value="${escapeHtml(entry.ref)}">${escapeHtml(entry.ref)}</option>`).join('');
      if ([...select.options].some((option) => option.value === current)) select.value = current;
      window.__flightDeckArrivalExit = select.value || null;
    };
    plannerMode.removeEventListener('change', sync);
    plannerMode.addEventListener('change', sync);
    runway.removeEventListener('change', sync);
    runway.addEventListener('change', sync);
    wrapper.querySelector('select').onchange = (event) => { window.__flightDeckArrivalExit = event.target.value || null; };
    sync();
  }

  function constrainTaxiMap() {
    const map = window.__flightDeckTaxiMap;
    const data = window.__flightDeckLoadedAirportMapData;
    if (!map || !data || !window.L) return;
    const rawBounds = data.bounds;
    if (!Array.isArray(rawBounds) || rawBounds.length < 2) return;
    try {
      const bounds = L.latLngBounds(rawBounds).pad(.08);
      map.setMaxBounds(bounds);
      map.options.maxBoundsViscosity = 1;
      if (!bounds.contains(map.getCenter())) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 });
    } catch {
      // Keep taxi usable if a third-party airport source reports malformed bounds.
    }
  }

  function ensureMediaPage() {
    if (document.querySelector('[data-page="media"]')) return;
    const pages = document.querySelector('#efb-pages');
    if (!pages) return;
    const page = document.createElement('section');
    page.className = 'efb-page fd121-media-page';
    page.dataset.page = 'media';
    page.hidden = true;
    page.innerHTML = `
      <div class="fd121-media-toolbar">
        <div><strong>Medien</strong><span>Screenshots und Bildschirmaufnahmen des aktiven Flugs</span></div>
        <div class="fd121-media-actions"><button id="fd121-screenshot" type="button">SCREENSHOT</button><button id="fd121-record" type="button">AUFNAHME STARTEN</button><span id="fd121-recording-indicator" hidden><i></i><b>00:00</b></span></div>
      </div>
      <div id="fd121-media-message" class="fd121-media-message"></div>
      <div id="fd121-media-list" class="fd121-media-grid"></div>`;
    pages.appendChild(page);
    page.querySelector('#fd121-screenshot').addEventListener('click', captureScreenshot);
    page.querySelector('#fd121-record').addEventListener('click', toggleRecording);

    const homeGrid = document.querySelector('.app-launcher-grid');
    if (homeGrid && !document.querySelector('[data-app-id="media"]')) {
      const tile = document.createElement('button');
      tile.type = 'button'; tile.className = 'efb-app-tile media-app'; tile.dataset.appId = 'media';
      tile.innerHTML = '<span class="app-tile-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><rect x="7" y="13" width="34" height="25" rx="3"></rect><path d="M16 13l3-5h10l3 5"></path><circle cx="24" cy="25" r="7"></circle><circle cx="36" cy="18" r="2"></circle></svg></span><span class="app-tile-copy"><strong>Medien</strong></span><i class="app-open-arrow">›</i>';
      tile.addEventListener('click', () => openMediaPage());
      homeGrid.appendChild(tile);
    }
  }

  function openMediaPage() {
    document.querySelectorAll('.efb-page[data-page]').forEach((page) => { page.hidden = page.dataset.page !== 'media'; });
    const pages = document.querySelector('#efb-pages'); if (pages) pages.hidden = false;
    const mapStage = document.querySelector('.map-stage'); if (mapStage) mapStage.hidden = true;
    const app = document.querySelector('#app'); app?.classList.remove('home-mode');
    const toolbar = document.querySelector('#app-toolbar'); if (toolbar) toolbar.hidden = false;
    const title = document.querySelector('#app-toolbar-title'); if (title) title.textContent = 'Medien';
    const context = document.querySelector('#app-toolbar-context'); if (context) context.textContent = 'FLIGHT MEDIA';
    refreshMediaList();
  }

  async function activeFlightIdentity() {
    const flight = await fetchCurrentFlight(true);
    return {
      id: flight?.id || 'unassigned',
      callsign: flight?.flight?.callsign || state.latest?.flight?.callsign || state.latest?.integrations?.simbrief?.flight?.callsign || 'flight',
    };
  }

  async function requestCaptureStream({ audio = false } = {}) {
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Bildschirmaufnahme wird von diesem Gerät/Browser nicht unterstützt.');
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30, max: 30 }, displaySurface: 'window' },
      audio,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
    });
  }

  async function captureScreenshot() {
    const message = document.querySelector('#fd121-media-message');
    try {
      const flight = await activeFlightIdentity();
      const stream = state.mediaStream || await requestCaptureStream({ audio: false });
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      const video = document.createElement('video');
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 150));
      const canvas = document.createElement('canvas');
      canvas.width = settings.width || video.videoWidth || 1920;
      canvas.height = settings.height || video.videoHeight || 1080;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', .94));
      if (!blob) throw new Error('Screenshot konnte nicht erzeugt werden.');
      const response = await fetch(authUrl(`/api/media/screenshot?flightId=${encodeURIComponent(flight.id)}&callsign=${encodeURIComponent(flight.callsign)}`), { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Screenshot konnte nicht gespeichert werden.');
      if (!state.mediaStream) stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
      if (message) message.textContent = `Screenshot gespeichert: ${body.item?.filename || ''}`;
      await refreshMediaList();
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  async function toggleRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') return stopRecording();
    const message = document.querySelector('#fd121-media-message');
    try {
      const flight = await activeFlightIdentity();
      const stream = await requestCaptureStream({ audio: false });
      const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
      const startResponse = await fetch(authUrl('/api/media/recordings/start'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flightId: flight.id, callsign: flight.callsign, contentType: type }),
      });
      const startBody = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok) throw new Error(startBody.error || 'Aufnahme konnte nicht gestartet werden.');
      const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 5_000_000 });
      state.mediaRecorder = recorder; state.mediaStream = stream; state.mediaRecordingId = startBody.recording.id; state.mediaStartedAt = Date.now();
      recorder.ondataavailable = async (event) => {
        if (!event.data?.size || !state.mediaRecordingId) return;
        try {
          await fetch(authUrl(`/api/media/recordings/${encodeURIComponent(state.mediaRecordingId)}/chunk`), { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: event.data });
        } catch {
          // The next chunk is still attempted; partial recordings are recoverable server-side.
        }
      };
      recorder.onerror = () => stopRecording();
      stream.getVideoTracks()[0].addEventListener('ended', () => stopRecording());
      recorder.start(5000);
      const button = document.querySelector('#fd121-record'); if (button) button.textContent = 'AUFNAHME STOPPEN';
      const indicator = document.querySelector('#fd121-recording-indicator'); if (indicator) indicator.hidden = false;
      state.mediaTimer = setInterval(() => {
        const seconds = Math.floor((Date.now() - state.mediaStartedAt) / 1000);
        const value = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        const target = document.querySelector('#fd121-recording-indicator b'); if (target) target.textContent = value;
      }, 500);
      if (message) message.textContent = 'Bildschirmaufnahme läuft. Sie wird dem aktiven Flug zugeordnet.';
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  async function stopRecording() {
    const recorder = state.mediaRecorder;
    const id = state.mediaRecordingId;
    if (!recorder || !id) return;
    const message = document.querySelector('#fd121-media-message');
    await new Promise((resolve) => {
      const finish = () => setTimeout(resolve, 150);
      recorder.addEventListener('stop', finish, { once: true });
      if (recorder.state !== 'inactive') recorder.stop(); else finish();
    });
    state.mediaStream?.getTracks().forEach((track) => track.stop());
    if (state.mediaTimer) clearInterval(state.mediaTimer);
    state.mediaTimer = null;
    try {
      const response = await fetch(authUrl(`/api/media/recordings/${encodeURIComponent(id)}/finish`), { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Aufnahme konnte nicht gespeichert werden.');
      if (message) message.textContent = `Aufnahme gespeichert: ${body.item?.filename || ''}`;
    } catch (error) {
      if (message) message.textContent = error.message;
    }
    state.mediaRecorder = null; state.mediaStream = null; state.mediaRecordingId = null; state.mediaStartedAt = null;
    const button = document.querySelector('#fd121-record'); if (button) button.textContent = 'AUFNAHME STARTEN';
    const indicator = document.querySelector('#fd121-recording-indicator'); if (indicator) indicator.hidden = true;
    await refreshMediaList();
  }

  async function refreshMediaList() {
    const list = document.querySelector('#fd121-media-list');
    if (!list) return;
    const flight = await activeFlightIdentity();
    state.currentMediaFlightId = flight.id;
    try {
      const response = await fetch(authUrl(`/api/media?flightId=${encodeURIComponent(flight.id)}`), { cache: 'no-store' });
      const body = await response.json();
      const items = body.items || [];
      list.innerHTML = items.length ? items.map((item) => {
        const fileUrl = authUrl(`/api/media/file/${encodeURIComponent(item.id)}`);
        const preview = item.kind === 'screenshot' ? `<img src="${fileUrl}" alt="Screenshot">` : `<video src="${fileUrl}" controls preload="metadata"></video>`;
        return `<article class="fd121-media-item">${preview}<div><strong>${escapeHtml(item.filename)}</strong><span>${new Date(item.createdAt).toLocaleString()} · ${(item.size / 1048576).toFixed(1)} MB</span><button type="button" data-media-delete="${escapeHtml(item.id)}">LÖSCHEN</button></div></article>`;
      }).join('') : '<div class="fd121-media-empty">Noch keine Screenshots oder Aufnahmen für diesen Flug.</div>';
      list.querySelectorAll('[data-media-delete]').forEach((button) => button.addEventListener('click', async () => {
        if (!confirm('Diese Mediendatei löschen?')) return;
        await fetch(authUrl(`/api/media/${encodeURIComponent(button.dataset.mediaDelete)}`), { method: 'DELETE' });
        refreshMediaList();
      }));
    } catch (error) {
      list.innerHTML = `<div class="fd121-media-empty">${escapeHtml(error.message)}</div>`;
    }
  }

  function installGlobalNavigationHooks() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-open-module="flightboard"], [data-app-id="flightboard"]');
      if (target) {
        event.preventDefault(); event.stopImmediatePropagation();
        const tracking = document.querySelector('[data-open-module="flight"]'); tracking?.click();
      }
      const media = event.target.closest('[data-app-id="media"]');
      if (media) { event.preventDefault(); event.stopImmediatePropagation(); openMediaPage(); }
    }, true);
  }

  async function pollState() {
    try {
      const response = await fetch(authUrl('/api/state'), { cache: 'no-store' });
      if (response.ok) state.latest = await response.json();
      await fetchCurrentFlight(false);
      simplifyHome(); removeLargeAppHeadings(); ensureHomeButton(); removeSeparateTrafficNavigation(); ensureMediaPage(); ensureArrivalTaxiControls();
      renderTrackingTimes(); renderTrackingTrafficAndTaxi(); constrainTaxiMap();
      if (!document.querySelector('[data-page="media"]')?.hidden) refreshMediaList();
    } catch {
      // Existing app connection handling remains authoritative.
    }
  }

  window.addEventListener('beforeunload', () => {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      try { state.mediaRecorder.stop(); } catch { /* no-op */ }
    }
  });

  installGlobalNavigationHooks();
  const observer = new MutationObserver(() => {
    simplifyHome(); removeLargeAppHeadings(); ensureHomeButton(); removeSeparateTrafficNavigation(); ensureMediaPage(); ensureTrackingTimePanel(); ensureArrivalTaxiControls(); constrainTaxiMap();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  pollState();
  setInterval(pollState, 2000);
  window.FlightDeckRelease121 = { version: VERSION, refreshMediaList, renderTrackingTrafficAndTaxi, constrainTaxiMap };
})();
