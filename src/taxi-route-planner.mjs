const EARTH_RADIUS_METERS = 6_371_000;

const PHONETIC = new Map(Object.entries({
  alpha: 'A', bravo: 'B', charlie: 'C', delta: 'D', echo: 'E', foxtrot: 'F', golf: 'G',
  hotel: 'H', india: 'I', juliett: 'J', juliet: 'J', kilo: 'K', lima: 'L', mike: 'M',
  november: 'N', oscar: 'O', papa: 'P', quebec: 'Q', romeo: 'R', sierra: 'S', tango: 'T',
  uniform: 'U', victor: 'V', whiskey: 'W', xray: 'X', 'x-ray': 'X', yankee: 'Y', zulu: 'Z',
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7',
  eight: '8', nine: '9',
}));

function finitePoint(value) {
  const lat = Number(value?.lat ?? value?.[0]);
  const lon = Number(value?.lon ?? value?.lng ?? value?.[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function distanceMeters(left, right) {
  const lat1 = left.lat * Math.PI / 180;
  const lat2 = right.lat * Math.PI / 180;
  const deltaLat = lat2 - lat1;
  const deltaLon = (right.lon - left.lon) * Math.PI / 180;
  const value = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(value)));
}

function pointToSegmentMeters(point, start, end) {
  const latitude = point.lat * Math.PI / 180;
  const xScale = 111_320 * Math.cos(latitude);
  const p = { x: point.lon * xScale, y: point.lat * 111_320 };
  const a = { x: start.lon * xScale, y: start.lat * 111_320 };
  const b = { x: end.lon * xScale, y: end.lat * 111_320 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
    ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared,
  ));
  return Math.hypot(p.x - (a.x + progress * dx), p.y - (a.y + progress * dy));
}

function distanceToLines(point, lines) {
  let best = Infinity;
  for (const line of lines) {
    for (let index = 0; index < line.length - 1; index += 1) {
      best = Math.min(best, pointToSegmentMeters(point, line[index], line[index + 1]));
    }
  }
  return best;
}

function naturalCompare(left, right) {
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function refParts(value) {
  return String(value ?? '')
    .toUpperCase()
    .split(/[;,/|]/)
    .map((part) => part.trim().replace(/^0+(?=\d)/, ''))
    .filter(Boolean);
}

function normalizeTaxiwayToken(value) {
  const cleaned = String(value ?? '')
    .toLowerCase()
    .replace(/\b(?:taxiway|taxiways|via|then)\b/g, ' ')
    .replace(/[^a-z0-9-]+/g, ' ')
    .trim();
  if (!cleaned) return null;
  const words = cleaned.split(/\s+/);
  if (words.every((word) => PHONETIC.has(word))) return words.map((word) => PHONETIC.get(word)).join('');
  const compact = cleaned.replace(/[^a-z0-9]/g, '').toUpperCase();
  return /^[A-Z]{1,3}\d{0,2}[A-Z]?$/.test(compact) ? compact : null;
}

export function parseTaxiClearance(text) {
  const clearance = String(text ?? '').trim();
  const runway = clearance.match(/(?:runway|rwy)\s*([0-3]?\d(?:[LCR])?)/i)?.[1]?.toUpperCase() ?? null;
  const viaIndex = clearance.search(/\bvia\b/i);
  let taxiways = [];
  if (viaIndex >= 0) {
    const afterVia = clearance.slice(viaIndex).replace(/^.*?\bvia\b/i, '');
    const routeText = afterVia.split(/\b(?:contact|hold(?:ing)? short|holding point|cross runway|cross rwy|advise|give way|follow|monitor)\b/i)[0]
      .split('.')[0];
    taxiways = routeText
      .split(/,|\band\b|\bthen\b|>/i)
      .map(normalizeTaxiwayToken)
      .filter(Boolean)
      .filter((value, index, array) => index === 0 || value !== array[index - 1]);
  }
  return {
    runway,
    taxiways,
    holdShort: /\b(?:hold(?:ing)? short|holding point)\b/i.test(clearance),
  };
}

function nodeKey(point) {
  return `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`;
}

export function buildTaxiGraph(mapData) {
  const nodes = new Map();
  const ensureNode = (point, kind) => {
    const key = nodeKey(point);
    if (!nodes.has(key)) nodes.set(key, { key, ...point, edges: [], kinds: new Set() });
    const node = nodes.get(key);
    node.kinds.add(kind);
    return node;
  };

  for (const feature of mapData?.features ?? []) {
    if (!['taxiway', 'parking_position'].includes(feature.kind) || feature.geometry !== 'line') continue;
    const coordinates = feature.coordinates.map(finitePoint).filter(Boolean);
    for (let index = 0; index < coordinates.length - 1; index += 1) {
      const start = ensureNode(coordinates[index], feature.kind);
      const end = ensureNode(coordinates[index + 1], feature.kind);
      const distance = distanceMeters(start, end);
      if (distance < 0.2 || distance > 1_500) continue;
      const edgeBase = {
        distance,
        ref: String(feature.ref ?? '').toUpperCase(),
        kind: feature.kind,
        featureId: feature.id,
        segmentIndex: index,
      };
      start.edges.push({ ...edgeBase, id: `${feature.id}:${index}:f`, to: end.key });
      end.edges.push({ ...edgeBase, id: `${feature.id}:${index}:r`, to: start.key });
    }
  }

  // OSM parking lead-ins are often drawn as separate ways that stop a few metres before
  // the taxiway centerline. Join only isolated parking components to their nearest taxiway
  // node so gates remain routable without inventing shortcuts inside the taxiway network.
  const visited = new Set();
  const components = [];
  for (const node of nodes.values()) {
    if (visited.has(node.key)) continue;
    const component = [];
    const queue = [node];
    visited.add(node.key);
    while (queue.length > 0) {
      const current = queue.pop();
      component.push(current);
      for (const edge of current.edges) {
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        queue.push(nodes.get(edge.to));
      }
    }
    components.push(component);
  }
  const taxiwayNodes = [...nodes.values()].filter((node) => node.kinds.has('taxiway'));
  let connectorIndex = 0;
  for (const component of components) {
    if (component.some((node) => node.kinds.has('taxiway')) || component.length > 80) continue;
    let closest = null;
    for (const source of component) {
      for (const target of taxiwayNodes) {
        const distance = distanceMeters(source, target);
        if (distance <= 120 && (!closest || distance < closest.distance)) closest = { source, target, distance };
      }
    }
    if (!closest) continue;
    const id = `virtual/parking-connector/${connectorIndex++}`;
    const edgeBase = { distance: closest.distance, ref: '', kind: 'connector', featureId: id, segmentIndex: 0 };
    closest.source.edges.push({ ...edgeBase, id: `${id}:f`, to: closest.target.key });
    closest.target.edges.push({ ...edgeBase, id: `${id}:r`, to: closest.source.key });
  }
  return { nodes, size: nodes.size };
}

function nearestNodes(graph, point, { limit = 1, maxDistanceMeters = 600 } = {}) {
  const target = finitePoint(point);
  if (!target) return [];
  return [...graph.nodes.values()]
    .map((node) => ({ node, distance: distanceMeters(target, node) }))
    .filter((entry) => entry.distance <= maxDistanceMeters)
    .sort((left, right) => left.distance - right.distance)
    .slice(0, limit);
}

function runwayLines(mapData, runway) {
  const wanted = String(runway ?? '').toUpperCase().replace(/^0+(?=\d)/, '');
  return (mapData?.features ?? [])
    .filter((feature) => feature.kind === 'runway'
      && feature.geometry !== 'point'
      && refParts(feature.ref).includes(wanted))
    .map((feature) => feature.coordinates.map(finitePoint).filter(Boolean))
    .filter((line) => line.length > 1);
}

function runwayAnchorNodes(mapData, graph, runway) {
  const lines = runwayLines(mapData, runway);
  if (lines.length === 0) return [];
  const candidates = [];
  for (const feature of mapData.features ?? []) {
    if (feature.kind !== 'holding_position' || feature.geometry !== 'point') continue;
    const point = finitePoint(feature.coordinates[0]);
    if (!point || distanceToLines(point, lines) > 320) continue;
    const nearest = nearestNodes(graph, point, { limit: 1, maxDistanceMeters: 60 })[0];
    if (nearest) candidates.push({ ...nearest, runwayDistance: distanceToLines(nearest.node, lines) });
  }

  if (candidates.length === 0) {
    for (const node of graph.nodes.values()) {
      const runwayDistance = distanceToLines(node, lines);
      if (runwayDistance <= 180) candidates.push({ node, distance: 0, runwayDistance });
    }
  }
  const unique = new Map();
  for (const candidate of candidates.sort((left, right) => left.runwayDistance - right.runwayDistance)) {
    if (!unique.has(candidate.node.key)) unique.set(candidate.node.key, candidate);
  }
  return [...unique.values()].slice(0, 24);
}

function featureAnchor(mapData, value) {
  if (value?.type === 'point') return finitePoint(value);
  const feature = (mapData?.features ?? []).find((candidate) => candidate.id === value?.id);
  if (!feature) return null;
  const points = feature.coordinates.map(finitePoint).filter(Boolean);
  if (points.length === 0) return null;
  if (feature.kind === 'parking_position') return points.at(-1);
  return points[Math.floor(points.length / 2)];
}

class MinHeap {
  constructor() {
    this.items = [];
  }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].cost <= item.cost) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    if (this.items.length === 0) return null;
    const result = this.items[0];
    const last = this.items.pop();
    if (this.items.length === 0) return result;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      const child = right < this.items.length && this.items[right].cost < this.items[left].cost ? right : left;
      if (this.items[child].cost >= last.cost) break;
      this.items[index] = this.items[child];
      index = child;
    }
    this.items[index] = last;
    return result;
  }
}

function nextRequiredStage(stage, edge, required, relaxed) {
  if (required.length === 0) return { stage, penalty: 1 };
  if (edge.kind === 'parking_position') return { stage, penalty: 1 };
  const parts = refParts(edge.ref);
  if (parts.length === 0) return { stage, penalty: 1.15 };
  if (stage >= 0 && parts.includes(required[stage])) return { stage, penalty: 1 };
  const nextIndex = stage + 1;
  if (nextIndex < required.length && parts.includes(required[nextIndex])) return { stage: nextIndex, penalty: 1 };
  return relaxed ? { stage, penalty: 12 } : null;
}

function shortestPath(graph, starts, goals, {
  requiredTaxiways = [],
  relaxed = false,
  penalizedEdges = new Set(),
} = {}) {
  const required = requiredTaxiways.map((value) => String(value).toUpperCase());
  const goalKeys = new Set(goals.map((entry) => entry.node.key));
  const queue = new MinHeap();
  const distances = new Map();
  const previous = new Map();

  for (const entry of starts) {
    const stateKey = `${entry.node.key}|-1`;
    const cost = entry.distance ?? 0;
    distances.set(stateKey, cost);
    queue.push({ stateKey, nodeKey: entry.node.key, stage: -1, cost });
  }

  let finalState = null;
  while (queue.items.length > 0) {
    const current = queue.pop();
    if (current.cost !== distances.get(current.stateKey)) continue;
    if (goalKeys.has(current.nodeKey) && (required.length === 0 || current.stage === required.length - 1)) {
      finalState = current;
      break;
    }
    const node = graph.nodes.get(current.nodeKey);
    for (const edge of node.edges) {
      const transition = nextRequiredStage(current.stage, edge, required, relaxed);
      if (!transition) continue;
      const reverseId = edge.id.endsWith(':f') ? edge.id.replace(/:f$/, ':r') : edge.id.replace(/:r$/, ':f');
      const alternativePenalty = penalizedEdges.has(edge.id) || penalizedEdges.has(reverseId) ? 3.5 : 1;
      const nextCost = current.cost + edge.distance * transition.penalty * alternativePenalty;
      const nextStateKey = `${edge.to}|${transition.stage}`;
      if (nextCost >= (distances.get(nextStateKey) ?? Infinity)) continue;
      distances.set(nextStateKey, nextCost);
      previous.set(nextStateKey, { stateKey: current.stateKey, edge, nodeKey: current.nodeKey });
      queue.push({ stateKey: nextStateKey, nodeKey: edge.to, stage: transition.stage, cost: nextCost });
    }
  }
  if (!finalState) return null;

  const nodeKeys = [finalState.nodeKey];
  const edges = [];
  let cursor = finalState.stateKey;
  while (previous.has(cursor)) {
    const step = previous.get(cursor);
    edges.push(step.edge);
    nodeKeys.push(step.nodeKey);
    cursor = step.stateKey;
  }
  nodeKeys.reverse();
  edges.reverse();
  return {
    nodeKeys,
    edges,
    networkDistanceMeters: edges.reduce((sum, edge) => sum + edge.distance, 0),
    weightedCost: finalState.cost,
  };
}

function routeFromPath(graph, result, { startPoint = null, endPoint = null, index = 0, source = 'manual' } = {}) {
  const coordinates = result.nodeKeys.map((key) => {
    const node = graph.nodes.get(key);
    return { lat: node.lat, lon: node.lon };
  });
  let distance = result.networkDistanceMeters;
  if (startPoint && distanceMeters(startPoint, coordinates[0]) > 1) {
    distance += distanceMeters(startPoint, coordinates[0]);
    coordinates.unshift(startPoint);
  }
  if (endPoint && distanceMeters(endPoint, coordinates.at(-1)) > 1) {
    distance += distanceMeters(endPoint, coordinates.at(-1));
    coordinates.push(endPoint);
  }

  const taxiways = [];
  for (const edge of result.edges) {
    for (const ref of refParts(edge.ref)) {
      if (taxiways.at(-1) !== ref) taxiways.push(ref);
    }
  }
  const fingerprint = coordinates.map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`).join('|');
  return {
    id: `${source}-${index + 1}-${fingerprint.length.toString(36)}`,
    label: taxiways.length > 0 ? `Via ${taxiways.join(' – ')}` : `Route ${index + 1}`,
    distanceMeters: Math.round(distance),
    taxiways,
    path: coordinates,
    source,
  };
}

function routeOptions(graph, starts, goals, options = {}) {
  const routes = [];
  const fingerprints = new Set();
  const penalizedEdges = new Set();
  for (let index = 0; index < 3; index += 1) {
    let result = shortestPath(graph, starts, goals, { ...options, penalizedEdges });
    if (!result && options.requiredTaxiways?.length && !options.relaxed) {
      result = shortestPath(graph, starts, goals, { ...options, relaxed: true, penalizedEdges });
    }
    if (!result) break;
    const route = routeFromPath(graph, result, { ...options, index });
    const fingerprint = route.path.map((point) => `${point.lat.toFixed(5)},${point.lon.toFixed(5)}`).join('|');
    if (!fingerprints.has(fingerprint)) {
      routes.push(route);
      fingerprints.add(fingerprint);
    }
    for (const edge of result.edges) penalizedEdges.add(edge.id);
  }
  return routes;
}

function departureHoldingPoints(mapData, graph, runway) {
  return runwayAnchorNodes(mapData, graph, runway)
    .sort((left, right) => right.runwayDistance - left.runwayDistance);
}

export function airportPlanningOptions(mapData) {
  const runwaySet = new Set();
  const stands = [];
  const standRefs = new Set();
  for (const feature of mapData?.features ?? []) {
    if (feature.kind === 'runway') {
      for (const rawRef of String(feature.ref ?? '').toUpperCase().split(/[\/;,|\-]/)) {
        const match = rawRef.trim().match(/^(\d{1,2})([LCR]?)$/);
        if (match) runwaySet.add(`${match[1].padStart(2, '0')}${match[2]}`);
      }
    }
    if (feature.kind === 'parking_position') {
      const ref = String(feature.ref || feature.name || '').trim();
      if (!ref || standRefs.has(ref.toUpperCase())) continue;
      standRefs.add(ref.toUpperCase());
      stands.push({ id: feature.id, ref, name: feature.name || null });
    }
  }
  const runways = [...runwaySet].sort(naturalCompare);
  const graph = buildTaxiGraph(mapData);
  const holdingPoints = {};
  for (const runway of runways) {
    holdingPoints[runway] = departureHoldingPoints(mapData, graph, runway).map((entry, index) => ({
      id: entry.node.key,
      label: `Holding Point ${index + 1}`,
      lat: entry.node.lat,
      lon: entry.node.lon,
      runwayDistanceMeters: Math.round(entry.runwayDistance),
    }));
  }
  return {
    runways,
    stands: stands.sort((left, right) => naturalCompare(left.ref, right.ref)),
    holdingPoints,
  };
}

export function planTaxiRoutes(mapData, request, context = {}) {
  const graph = buildTaxiGraph(mapData);
  if (graph.size < 2) return { routes: [], error: 'Für diesen Flughafen ist kein routbares Taxiway-Netz verfügbar.' };
  const mode = request?.mode;
  const runway = String(request?.runway ?? '').toUpperCase();
  let startPoint = null;
  let endPoint = null;
  let starts = [];
  let goals = [];

  if (mode === 'departure') {
    startPoint = request.start?.type === 'aircraft' ? finitePoint(context.aircraft) : featureAnchor(mapData, request.start);
    starts = nearestNodes(graph, startPoint, { limit: 2, maxDistanceMeters: 650 });
    goals = departureHoldingPoints(mapData, graph, runway);
    if (request.holdingPoint) goals = goals.filter((entry) => entry.node.key === request.holdingPoint);
    else if (goals.length > 0) goals = [goals[0]];
  } else if (mode === 'arrival') {
    starts = runwayAnchorNodes(mapData, graph, runway);
    endPoint = featureAnchor(mapData, request.destination);
    goals = nearestNodes(graph, endPoint, { limit: 2, maxDistanceMeters: 650 });
  } else if (mode === 'custom') {
    startPoint = finitePoint(request.start);
    endPoint = finitePoint(request.destination);
    starts = nearestNodes(graph, startPoint, { limit: 2, maxDistanceMeters: 650 });
    goals = nearestNodes(graph, endPoint, { limit: 2, maxDistanceMeters: 650 });
  } else {
    return { routes: [], error: 'Unbekannter Planungsmodus.' };
  }

  if (starts.length === 0) return { routes: [], error: 'Der Startpunkt ist nicht mit dem Taxiway-Netz verbunden.' };
  if (goals.length === 0) return { routes: [], error: 'Das Ziel ist nicht mit dem Taxiway-Netz verbunden.' };
  const routes = routeOptions(graph, starts, goals, {
    startPoint,
    endPoint,
    source: 'manual',
  });
  return { routes, graphNodes: graph.size, mode, runway: runway || null };
}

export function deriveTaxiRouteFromClearance(mapData, state) {
  const parsed = parseTaxiClearance(state?.taxi?.clearance?.text);
  if (!parsed.runway || parsed.taxiways.length === 0) {
    return { routes: [], parsed, error: 'Die Freigabe enthält keine auswertbare Runway-/Taxiway-Folge.' };
  }
  const graph = buildTaxiGraph(mapData);
  const startPoint = finitePoint(state?.aircraft) ?? finitePoint(state?.gate);
  const starts = nearestNodes(graph, startPoint, { limit: 3, maxDistanceMeters: 650 });
  const goals = runwayAnchorNodes(mapData, graph, parsed.runway);
  if (starts.length === 0 || goals.length === 0) {
    return { routes: [], parsed, error: 'Start oder Holding-Position konnte nicht dem Taxiway-Netz zugeordnet werden.' };
  }
  const routes = routeOptions(graph, starts, goals, {
    startPoint,
    requiredTaxiways: parsed.taxiways,
    source: 'clearance-map',
  });
  for (const route of routes) {
    route.label = `Via ${parsed.taxiways.join(' – ')}`;
    route.taxiways = [...parsed.taxiways];
  }
  return { routes, parsed, graphNodes: graph.size };
}
