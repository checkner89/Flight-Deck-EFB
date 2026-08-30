const LEVEL = Object.freeze({ ready: 0, attention: 1, blocking: 2 });

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function upper(value) {
  return String(value || '').trim().toUpperCase();
}

function weatherFor(state, icao) {
  const airport = upper(icao);
  if (!airport) return null;
  const official = state.integrations?.aviationWeather?.airports || [];
  const si = state.integrations?.sayIntentions?.weather?.airports || [];
  const simbrief = state.integrations?.simbrief?.flight || {};
  const officialMatch = official.find((entry) => upper(entry.airport || entry.icao) === airport);
  if (officialMatch?.metar || officialMatch?.taf) return { source: 'AviationWeather', metar: officialMatch.metar || null, taf: officialMatch.taf || null };
  const siMatch = si.find((entry) => upper(entry.airport) === airport);
  if (siMatch?.metar || siMatch?.taf || siMatch?.atis) return { source: 'SayIntentions', metar: siMatch.metar || null, taf: siMatch.taf || null, atis: siMatch.atis || null };
  if (airport === upper(simbrief.origin) && (simbrief.originMetar || simbrief.originTaf)) return { source: 'SimBrief', metar: simbrief.originMetar || null, taf: simbrief.originTaf || null };
  if (airport === upper(simbrief.destination) && (simbrief.destinationMetar || simbrief.destinationTaf)) return { source: 'SimBrief', metar: simbrief.destinationMetar || null, taf: simbrief.destinationTaf || null };
  if (airport === upper(simbrief.alternate) && (simbrief.alternateMetar || simbrief.alternateTaf)) return { source: 'SimBrief', metar: simbrief.alternateMetar || null, taf: simbrief.alternateTaf || null };
  return null;
}

function item(id, label, status, detail, { required = false, source = null, action = null } = {}) {
  return { id, label, status, detail, required, source, action };
}

export function evaluateBriefingReadiness(state = {}) {
  const flight = state.flight || {};
  const simbriefState = state.integrations?.simbrief || {};
  const brief = simbriefState.flight || {};
  const origin = upper(flight.origin || brief.origin);
  const destination = upper(flight.destination || brief.destination);
  const alternate = upper(brief.alternate);
  const route = flight.flightPlanRoute || brief.route;
  const departureRunway = upper(flight.departureRunway || brief.departureRunway);
  const arrivalRunway = upper(flight.arrivalRunway || brief.arrivalRunway);
  const actualFuel = finite(state.aircraft?.fuelWeightPounds);
  const plannedBlock = finite(brief.blockFuelPounds);
  const routeSync = state.integrations?.routeSync?.comparison || {};
  const originWeather = weatherFor(state, origin);
  const destinationWeather = weatherFor(state, destination);
  const alternateWeather = alternate ? weatherFor(state, alternate) : null;
  const stand = state.gate?.name || state.taxi?.routes?.arrival?.metadata?.destination?.name || state.taxi?.pathMetadata?.destination?.name || null;

  const items = [];
  items.push(item('route-endpoints', 'Route', origin && destination ? 'ready' : 'blocking', origin && destination ? `${origin} → ${destination}` : 'Origin or destination is missing.', { required: true, source: flight.origin && flight.destination ? 'Flight state' : simbriefState.imported ? 'SimBrief' : null, action: 'flight' }));
  items.push(item('flight-plan', 'Flight plan', route ? 'ready' : 'blocking', route ? 'Route available.' : 'No route is available.', { required: true, source: flight.flightPlanRoute ? 'Simulator / ATC' : brief.route ? 'SimBrief' : null, action: 'flight' }));
  items.push(item('ofp', 'OFP', simbriefState.imported ? 'ready' : 'attention', simbriefState.imported ? 'SimBrief OFP loaded.' : 'No SimBrief OFP loaded; simulator flight data can still be used.', { source: simbriefState.imported ? 'SimBrief' : null, action: 'briefing' }));
  items.push(item('departure-runway', 'Departure runway', departureRunway ? 'ready' : 'attention', departureRunway ? `RWY ${departureRunway}` : 'Departure runway not selected.', { action: 'briefing' }));
  items.push(item('arrival-runway', 'Arrival runway', arrivalRunway ? 'ready' : 'attention', arrivalRunway ? `RWY ${arrivalRunway}` : 'Arrival runway not selected.', { action: 'briefing' }));
  items.push(item('departure-weather', 'Departure weather', originWeather ? 'ready' : 'attention', originWeather ? `${origin} weather available.` : origin ? `${origin} weather missing.` : 'Departure weather unavailable without origin.', { source: originWeather?.source || null, action: 'briefing' }));
  items.push(item('arrival-weather', 'Arrival weather', destinationWeather ? 'ready' : 'attention', destinationWeather ? `${destination} weather available.` : destination ? `${destination} weather missing.` : 'Arrival weather unavailable without destination.', { source: destinationWeather?.source || null, action: 'briefing' }));
  if (alternate) items.push(item('alternate-weather', 'Alternate weather', alternateWeather ? 'ready' : 'attention', alternateWeather ? `${alternate} weather available.` : `${alternate} weather missing.`, { source: alternateWeather?.source || null, action: 'briefing' }));

  if (plannedBlock !== null && actualFuel !== null) {
    const delta = actualFuel - plannedBlock;
    const tolerance = Math.max(100, plannedBlock * 0.02);
    items.push(item('fuel', 'Fuel', delta >= -tolerance ? 'ready' : 'attention', `${Math.round(actualFuel).toLocaleString('en-US')} lb actual · ${Math.round(plannedBlock).toLocaleString('en-US')} lb planned`, { source: 'SimConnect + SimBrief', action: 'ground' }));
  } else {
    items.push(item('fuel', 'Fuel', plannedBlock !== null ? 'attention' : 'attention', plannedBlock !== null ? 'Planned fuel available; waiting for aircraft fuel telemetry.' : 'No planned block fuel available.', { source: plannedBlock !== null ? 'SimBrief' : null, action: 'ground' }));
  }

  if (routeSync.status === 'match' || routeSync.status === 'matched') {
    items.push(item('route-sync', 'Route sync', 'ready', 'Planned and simulator route are synchronized.', { source: 'Route Sync', action: 'flight' }));
  } else if (['different', 'partial'].includes(routeSync.status)) {
    items.push(item('route-sync', 'Route sync', 'attention', routeSync.detail || 'Simulator route differs from the planned route.', { source: 'Route Sync', action: 'flight' }));
  } else {
    items.push(item('route-sync', 'Route sync', 'attention', 'Route comparison is not available yet.', { source: 'Route Sync', action: 'flight' }));
  }

  items.push(item('destination-stand', 'Destination stand', stand ? 'ready' : 'attention', stand ? `Stand ${stand}` : 'Destination stand not selected yet.', { action: 'ground' }));

  const highest = items.reduce((value, entry) => Math.max(value, LEVEL[entry.status] ?? 0), 0);
  const blocking = items.filter((entry) => entry.status === 'blocking');
  const attention = items.filter((entry) => entry.status === 'attention');
  const status = highest === LEVEL.blocking ? 'blocking' : highest === LEVEL.attention ? 'attention' : 'ready';
  return {
    status,
    ready: blocking.length === 0,
    blockingCount: blocking.length,
    attentionCount: attention.length,
    items,
    summary: blocking.length
      ? `${blocking.length} blocking briefing item${blocking.length === 1 ? '' : 's'} open.`
      : attention.length
        ? `Briefing can continue · ${attention.length} item${attention.length === 1 ? '' : 's'} need attention.`
        : 'Operational briefing is ready.',
  };
}
