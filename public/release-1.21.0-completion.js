(() => {
  'use strict';

  const token = new URLSearchParams(location.search).get('token') || sessionStorage.getItem('flight-deck-token') || '';
  const authUrl = (pathname) => {
    const url = new URL(pathname, location.origin);
    if (token) url.searchParams.set('token', token);
    return url.toString();
  };
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  let archiveFlights = [];
  let archiveFetchedAt = 0;
  let selectedMediaFlightId = null;
  let mediaRenderedKey = '';
  let routeDetectionBusy = false;
  const detectedExitKeys = new Set(JSON.parse(sessionStorage.getItem('fd121-detected-exits') || '[]'));

  function ensureFullscreenHome() {
    const controls = document.querySelector('.map-controls');
    if (!controls || controls.querySelector('.fd121-map-home')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'map-button fd121-map-home';
    button.title = 'Home';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11.2 12 4l8.5 7.2v8.3a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-8.3Z"></path></svg><span>HOME</span>';
    button.addEventListener('click', () => document.querySelector('#app-home-button')?.click());
    controls.prepend(button);
  }

  function installHistoryNavigation() {
    if (window.__fd121HistoryInstalled) return;
    window.__fd121HistoryInstalled = true;
    document.addEventListener('click', (event) => {
      const opener = event.target.closest('[data-open-module]');
      if (!opener || opener.dataset.openModule === 'home') return;
      if (!history.state?.fd121App) history.pushState({ fd121App: true }, '', location.href);
    }, true);
    window.addEventListener('popstate', () => {
      const home = document.querySelector('#app-home-button');
      if (home && !document.querySelector('#app')?.classList.contains('home-mode')) home.click();
    });
  }

  function redirectOldTrafficDeepLinks() {
    if (window.__fd121TrafficRedirectDone) return;
    const text = `${location.hash} ${location.search}`.toLowerCase();
    if (!text.includes('flightboard') && !text.includes('live-traffic')) return;
    window.__fd121TrafficRedirectDone = true;
    setTimeout(() => document.querySelector('[data-open-module="flight"]')?.click(), 100);
  }

  function prioritizeOverlappingTraffic() {
    const icons = [...document.querySelectorAll('.fd121-aircraft-icon')];
    icons.forEach((icon) => { icon.style.visibility = ''; });
    const accepted = [];
    for (const icon of icons) {
      const rect = icon.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const overlaps = accepted.some((point) => Math.hypot(point.x - cx, point.y - cy) < 21);
      if (overlaps) icon.style.visibility = 'hidden';
      else accepted.push({ x: cx, y: cy });
    }
  }

  async function fetchArchiveFlights(force = false) {
    if (!force && Date.now() - archiveFetchedAt < 10000) return archiveFlights;
    archiveFetchedAt = Date.now();
    try {
      const response = await fetch(authUrl('/api/flights'), { cache: 'no-store' });
      if (!response.ok) return archiveFlights;
      const body = await response.json();
      const values = [body.current, ...(body.flights || [])].filter((item) => item?.id);
      const seen = new Set();
      archiveFlights = values.filter((item) => !seen.has(item.id) && seen.add(item.id));
    } catch {
      // Keep the last usable archive list.
    }
    return archiveFlights;
  }

  function flightLabel(flight) {
    const info = flight?.flight || {};
    const callsign = info.callsign || info.flightNumber || 'FLUG';
    const route = info.origin || info.destination ? `${info.origin || '—'} → ${info.destination || '—'}` : '';
    const date = flight.startedAt ? new Date(flight.startedAt).toLocaleDateString() : '';
    return [callsign, route, date].filter(Boolean).join(' · ');
  }

  async function ensureMediaArchiveSelector() {
    const page = document.querySelector('[data-page="media"]');
    if (!page) return;
    const toolbar = page.querySelector('.fd121-media-toolbar');
    if (!toolbar) return;
    let select = page.querySelector('#fd121-media-flight-select');
    if (!select) {
      const wrap = document.createElement('label');
      wrap.className = 'fd121-media-flight-picker';
      wrap.innerHTML = '<span>FLUG</span><select id="fd121-media-flight-select"></select>';
      toolbar.querySelector('.fd121-media-actions')?.prepend(wrap);
      select = wrap.querySelector('select');
      select.addEventListener('change', () => {
        selectedMediaFlightId = select.value || null;
        mediaRenderedKey = '';
        renderSelectedFlightMedia(true);
      });
    }
    const flights = await fetchArchiveFlights();
    const currentId = flights.find((flight) => flight.status === 'recording')?.id || null;
    const prior = selectedMediaFlightId || select.value || currentId || flights[0]?.id || 'unassigned';
    const options = flights.map((flight) => `<option value="${escapeHtml(flight.id)}">${escapeHtml(flightLabel(flight))}${flight.id === currentId ? ' · AKTUELL' : ''}</option>`).join('');
    const unassigned = '<option value="unassigned">Ohne Flugzuordnung</option>';
    if (select.dataset.optionsKey !== `${currentId}|${flights.map((f) => f.id).join('|')}`) {
      select.innerHTML = options + unassigned;
      select.dataset.optionsKey = `${currentId}|${flights.map((f) => f.id).join('|')}`;
    }
    select.value = [...select.options].some((option) => option.value === prior) ? prior : (currentId || flights[0]?.id || 'unassigned');
    selectedMediaFlightId = select.value;
  }

  async function renderSelectedFlightMedia(force = false) {
    const page = document.querySelector('[data-page="media"]');
    const list = page?.querySelector('#fd121-media-list');
    const select = page?.querySelector('#fd121-media-flight-select');
    if (!page || page.hidden || !list || !select) return;
    const flightId = select.value || 'unassigned';
    try {
      const response = await fetch(authUrl(`/api/media?flightId=${encodeURIComponent(flightId)}`), { cache: 'no-store' });
      const body = await response.json();
      const items = body.items || [];
      const key = `${flightId}|${items.map((item) => `${item.id}:${item.size}:${item.updatedAt}`).join('|')}`;
      if (!force && key === mediaRenderedKey) return;
      mediaRenderedKey = key;
      list.innerHTML = items.length ? items.map((item) => {
        const fileUrl = authUrl(`/api/media/file/${encodeURIComponent(item.id)}`);
        const preview = item.kind === 'screenshot'
          ? `<img src="${fileUrl}" alt="Screenshot">`
          : `<video src="${fileUrl}" controls preload="metadata"></video>`;
        return `<article class="fd121-media-item">${preview}<div><strong>${escapeHtml(item.filename)}</strong><span>${new Date(item.createdAt).toLocaleString()} · ${(item.size / 1048576).toFixed(1)} MB</span><div class="fd121-media-item-actions"><a href="${fileUrl}" download="${escapeHtml(item.filename)}">EXPORT</a><button type="button" data-media-archive-delete="${escapeHtml(item.id)}">LÖSCHEN</button></div></div></article>`;
      }).join('') : '<div class="fd121-media-empty">Keine Medien für diesen Flug.</div>';
      list.querySelectorAll('[data-media-archive-delete]').forEach((button) => button.addEventListener('click', async () => {
        if (!confirm('Diese Mediendatei löschen?')) return;
        const deletion = await fetch(authUrl(`/api/media/${encodeURIComponent(button.dataset.mediaArchiveDelete)}`), { method: 'DELETE' });
        if (!deletion.ok) return;
        mediaRenderedKey = '';
        renderSelectedFlightMedia(true);
      }));
    } catch {
      // The primary media view already exposes connection errors.
    }
  }

  function featurePoints(feature) {
    return (feature?.coordinates || []).map((point) => Array.isArray(point)
      ? { lat: finite(point[0]), lon: finite(point[1]) }
      : { lat: finite(point?.lat), lon: finite(point?.lon ?? point?.lng) })
      .filter((point) => point.lat !== null && point.lon !== null);
  }

  function distanceMeters(a, b) {
    const lat1 = finite(a?.lat); const lon1 = finite(a?.lon); const lat2 = finite(b?.lat); const lon2 = finite(b?.lon);
    if ([lat1, lon1, lat2, lon2].some((value) => value === null)) return Infinity;
    const y = (lat1 - lat2) * 111320;
    const x = (lon1 - lon2) * 111320 * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
    return Math.hypot(x, y);
  }

  function refs(value) {
    return String(value || '').toUpperCase().split(/[\/;,|\-]/).map((entry) => entry.trim()).filter(Boolean);
  }

  function detectActualRunwayExit(mapData, aircraft, runway) {
    if (!mapData || !aircraft || !runway) return null;
    const wanted = String(runway).toUpperCase().replace(/^0+(?=\d)/, '');
    const runwayPoints = (mapData.features || [])
      .filter((feature) => feature.kind === 'runway' && refs(feature.ref).some((ref) => ref.replace(/^0+(?=\d)/, '') === wanted))
      .flatMap(featurePoints);
    if (!runwayPoints.length) return null;
    let best = null;
    for (const feature of mapData.features || []) {
      if (feature.kind !== 'taxiway') continue;
      const ref = String(feature.ref || feature.name || '').trim().toUpperCase();
      if (!ref) continue;
      const points = featurePoints(feature);
      if (!points.length) continue;
      const aircraftDistance = Math.min(...points.map((point) => distanceMeters(point, aircraft)));
      if (aircraftDistance > 45) continue;
      const runwayDistance = Math.min(...points.flatMap((point) => runwayPoints.map((runwayPoint) => distanceMeters(point, runwayPoint))));
      if (runwayDistance > 180) continue;
      if (!best || aircraftDistance < best.aircraftDistance) best = { ref, aircraftDistance, runwayDistance };
    }
    return best?.ref || null;
  }

  async function maybeDetectAndReplanArrivalExit() {
    if (routeDetectionBusy) return;
    const live = window.__flightDeckLatestState;
    const mapData = window.__flightDeckLoadedAirportMapData;
    const arrival = live?.taxi?.routes?.arrival;
    const aircraft = live?.aircraft;
    const meta = arrival?.metadata || {};
    if (!arrival?.path?.length || !aircraft?.onGround || meta.runwayExit || !meta.runway || !meta.destination?.id || !mapData) return;
    const destination = String(live.flight?.destination || '').toUpperCase();
    if (destination && mapData.icao && String(mapData.icao).toUpperCase() !== destination) return;
    const exitRef = detectActualRunwayExit(mapData, aircraft, meta.runway);
    if (!exitRef) return;
    const key = `${arrival.updatedAt || ''}|${meta.runway}|${exitRef}|${meta.destination.id}`;
    if (detectedExitKeys.has(key)) return;
    routeDetectionBusy = true;
    try {
      const request = {
        mode: 'arrival',
        runway: meta.runway,
        runwayExit: exitRef,
        destination: { type: 'feature', id: meta.destination.id },
      };
      const planned = await fetch(authUrl('/api/taxi-plan/routes'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
      });
      const plannedBody = await planned.json().catch(() => ({}));
      const route = plannedBody.routes?.[0];
      if (!planned.ok || !route?.path?.length) return;
      const started = await fetch(authUrl('/api/taxi-plan/start'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ route, mode: 'arrival', runway: meta.runway, runwayExit: exitRef, destination: meta.destination }),
      });
      if (!started.ok) return;
      detectedExitKeys.add(key);
      sessionStorage.setItem('fd121-detected-exits', JSON.stringify([...detectedExitKeys].slice(-20)));
      const message = document.querySelector('#planner-message');
      if (message) message.textContent = `Runway Exit ${exitRef} erkannt · Arrival-Taxi-Route wurde neu berechnet.`;
    } finally {
      routeDetectionBusy = false;
    }
  }

  async function tick() {
    ensureFullscreenHome();
    installHistoryNavigation();
    redirectOldTrafficDeepLinks();
    prioritizeOverlappingTraffic();
    await ensureMediaArchiveSelector();
    await renderSelectedFlightMedia();
    await maybeDetectAndReplanArrivalExit();
  }

  const observer = new MutationObserver(() => {
    ensureFullscreenHome();
    prioritizeOverlappingTraffic();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  tick();
  setInterval(tick, 1500);
})();
