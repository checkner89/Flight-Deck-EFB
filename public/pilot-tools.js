const STORAGE = {
  scratchpad: 'flight-deck-real-scratchpad-v1',
  craft: 'flight-deck-real-scratchpad-craft-v1',
  launcher: 'flight-deck-sim-session-v1',
};

let latestState = null;
let shell = null;
let activeView = null;
let canvas = null;
let context = null;
let strokes = [];
let redoStack = [];
let currentStroke = null;
let redrawFrame = 0;
let scratchTool = 'pen';
let scratchWidth = 4;
let paperMode = 'grid';
let craftOpen = false;

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* local-only best effort */ }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function finite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function text(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized && normalized !== '—' && normalized.toLowerCase() !== 'null') return normalized;
  }
  return '';
}

function isGerman() {
  return String(document.documentElement.lang || '').toLowerCase().startsWith('de');
}

function labels() {
  return isGerman() ? {
    scratchpad: 'Scratchpad',
    scratchSubtitle: 'Mit Stift, Maus oder Touch schreiben',
    session: 'Sim Session',
    sessionSubtitle: 'Flight Deck & externe Tools starten',
    apps: 'APPS',
    pen: 'STIFT', marker: 'MARKER', eraser: 'RADIERER',
    undo: 'ZURÜCK', redo: 'WIEDERHOLEN', clear: 'LEEREN', savePng: 'PNG',
    paper: 'PAPIER', grid: 'RASTER', craft: 'CRAFT', auto: 'AUTO FILL',
    flightNotes: 'Flight Notes',
    quickLaunch: 'Quick Launch', externalTools: 'Externe Tools', save: 'SPEICHERN', launch: 'STARTEN',
    unsafe: 'Unsichere Schemes wie javascript:, data: und file: sind gesperrt.',
    invalidUri: 'UNGÜLTIG', launched: 'GESTARTET',
  } : {
    scratchpad: 'Scratchpad',
    scratchSubtitle: 'Write with pen, mouse or touch',
    session: 'Sim Session',
    sessionSubtitle: 'Launch Flight Deck & external tools',
    apps: 'APPS',
    pen: 'PEN', marker: 'MARKER', eraser: 'ERASER',
    undo: 'UNDO', redo: 'REDO', clear: 'CLEAR', savePng: 'PNG',
    paper: 'PAPER', grid: 'GRID', craft: 'CRAFT', auto: 'AUTO FILL',
    flightNotes: 'Flight Notes',
    quickLaunch: 'Quick Launch', externalTools: 'External tools', save: 'SAVE', launch: 'LAUNCH',
    unsafe: 'Unsafe schemes such as javascript:, data: and file: are blocked.',
    invalidUri: 'INVALID', launched: 'STARTED',
  };
}

function normalizeExistingFlightNotes() {
  const note = document.querySelector('#flight-notes');
  const card = note?.closest('.journey-notes-card');
  const heading = card?.querySelector('h3');
  if (!heading) return;
  heading.removeAttribute('data-i18n');
  heading.textContent = labels().flightNotes;
}

function tileIcon(type) {
  if (type === 'scratchpad') {
    return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 8h30v32H9zM15 15h17M15 22h10M15 29h14"/><path d="m29 34 8-8 4 4-8 8-6 2z"/></svg>';
  }
  return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 8h25v32H11zM18 16h11M18 23h11M18 30h7"/><path d="m36 17 7 7-7 7M42 24H29"/></svg>';
}

function installTiles() {
  const grid = document.querySelector('.app-launcher-grid');
  if (!grid) return;
  grid.querySelectorAll('[data-ops-tool]').forEach((element) => element.remove());
  const dictionary = labels();
  const definitions = [
    ['scratchpad', dictionary.scratchpad, dictionary.scratchSubtitle, 60],
    ['sim-session', dictionary.session, dictionary.sessionSubtitle, 61],
  ];
  for (const [id, title, subtitle, order] of definitions) {
    let button = grid.querySelector(`[data-pilot-tool="${id}"]`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = `efb-app-tile pilot-tool-tile pilot-${id}`;
      button.dataset.pilotTool = id;
      button.style.order = String(order);
      button.addEventListener('click', () => openView(id));
      grid.append(button);
    }
    button.innerHTML = `<span class="app-tile-icon">${tileIcon(id)}</span><span class="app-tile-copy"><small>${esc(subtitle)}</small><strong>${esc(title)}</strong><span>FLIGHT DECK</span></span><i class="app-open-arrow">›</i>`;
  }
}

function ensureShell() {
  if (shell) return shell;
  shell = document.createElement('section');
  shell.id = 'pilot-tools-shell';
  shell.className = 'pilot-tools-shell';
  shell.hidden = true;
  shell.innerHTML = '<div class="pilot-tools-frame"><header id="pilot-tools-toolbar" class="pilot-tools-toolbar"></header><main id="pilot-tools-content" class="pilot-tools-content"></main></div>';
  document.body.append(shell);
  return shell;
}

function closeView() {
  if (!shell) return;
  shell.hidden = true;
  activeView = null;
  document.documentElement.classList.remove('pilot-tool-open');
  canvas = null;
  context = null;
  currentStroke = null;
}

function openView(view) {
  ensureShell();
  activeView = view;
  shell.hidden = false;
  document.documentElement.classList.add('pilot-tool-open');
  if (view === 'scratchpad') renderScratchpad();
  else renderSimSession();
}

function toolbarBase(title, subtitle, extra = '') {
  const dictionary = labels();
  return `<button class="pilot-tools-back" type="button" data-pilot-close>‹ <span>${dictionary.apps}</span></button><div class="pilot-tools-title"><small>${esc(subtitle)}</small><strong>${esc(title)}</strong></div>${extra}`;
}

function scratchpadState() {
  const saved = readJson(STORAGE.scratchpad, {});
  strokes = Array.isArray(saved.strokes) ? saved.strokes.slice(-2500) : [];
  redoStack = [];
  scratchTool = ['pen', 'marker', 'eraser'].includes(saved.tool) ? saved.tool : 'pen';
  scratchWidth = [2, 4, 8].includes(Number(saved.width)) ? Number(saved.width) : 4;
  paperMode = saved.paper === 'paper' ? 'paper' : 'grid';
}

function saveScratchpadState() {
  writeJson(STORAGE.scratchpad, { strokes, tool: scratchTool, width: scratchWidth, paper: paperMode });
}

function craftState() {
  const value = readJson(STORAGE.craft, {});
  return value && typeof value === 'object' ? value : {};
}

function saveCraftFromUi() {
  if (!shell) return;
  const value = {};
  for (const input of shell.querySelectorAll('[data-craft-field]')) value[input.dataset.craftField] = input.value;
  writeJson(STORAGE.craft, value);
}

function autoCraft() {
  const state = latestState || {};
  const flight = state.flight || {};
  const aircraft = state.aircraft || {};
  const simbrief = state.integrations?.simbrief?.flight || state.integrations?.simbrief || {};
  const altitude = finite(flight.cruiseAltitude, simbrief.cruiseAltitude, simbrief.altitude);
  const com1 = finite(aircraft.com1Active, state.radio?.com1Active, state.integrations?.simConnect?.radio?.com1Active);
  return {
    clearance: text(flight.destination, simbrief.destination, simbrief.arrival) ? `CLEARED ${text(flight.destination, simbrief.destination, simbrief.arrival)}` : '',
    route: text(flight.route, simbrief.route),
    altitude: altitude === null ? '' : `FL${String(Math.round(altitude / 100)).padStart(3, '0')}`,
    frequency: com1 === null ? '' : com1.toFixed(3),
    transponder: text(aircraft.transponderCode, aircraft.squawk, state.radio?.transponderCode, state.atc?.squawk),
  };
}

function craftMarkup() {
  const dictionary = labels();
  const craft = craftState();
  const fields = [
    ['C', 'clearance', 'CLEARANCE'],
    ['R', 'route', 'ROUTE'],
    ['A', 'altitude', 'ALTITUDE'],
    ['F', 'frequency', 'FREQUENCY'],
    ['T', 'transponder', 'TRANSPONDER'],
  ];
  return `<aside class="scratch-craft-drawer" ${craftOpen ? '' : 'hidden'}><header><div><small>ATC QUICK REFERENCE</small><strong>CRAFT</strong></div><button type="button" data-craft-auto>${dictionary.auto}</button></header><div class="scratch-craft-fields">${fields.map(([letter, key, label]) => `<label><span>${letter}</span><small>${label}</small><input data-craft-field="${key}" value="${esc(craft[key] || '')}" autocomplete="off"></label>`).join('')}</div><p>Optional reference only. The drawing area remains the primary scratchpad.</p></aside>`;
}

function scratchToolbar() {
  const dictionary = labels();
  const toolButtons = [['pen', dictionary.pen], ['marker', dictionary.marker], ['eraser', dictionary.eraser]]
    .map(([tool, label]) => `<button type="button" data-scratch-tool="${tool}" class="${scratchTool === tool ? 'active' : ''}">${label}</button>`).join('');
  const widthButtons = [2, 4, 8].map((width) => `<button type="button" data-scratch-width="${width}" class="scratch-width width-${width} ${scratchWidth === width ? 'active' : ''}" aria-label="Width ${width}"><i></i></button>`).join('');
  return toolbarBase(dictionary.scratchpad, dictionary.scratchSubtitle, `<div class="scratch-toolbar-actions"><div class="scratch-tool-group">${toolButtons}</div><div class="scratch-tool-group scratch-widths">${widthButtons}</div><div class="scratch-tool-group"><button type="button" data-scratch-undo ${strokes.length ? '' : 'disabled'}>${dictionary.undo}</button><button type="button" data-scratch-redo ${redoStack.length ? '' : 'disabled'}>${dictionary.redo}</button><button type="button" data-scratch-paper>${paperMode === 'grid' ? dictionary.grid : dictionary.paper}</button><button type="button" data-scratch-craft class="${craftOpen ? 'active' : ''}">${dictionary.craft}</button><button type="button" data-scratch-export>${dictionary.savePng}</button><button type="button" data-scratch-clear class="danger-quiet">${dictionary.clear}</button></div></div>`);
}

function renderScratchpad() {
  scratchpadState();
  const toolbar = shell.querySelector('#pilot-tools-toolbar');
  const content = shell.querySelector('#pilot-tools-content');
  toolbar.innerHTML = scratchToolbar();
  content.innerHTML = `<div class="scratchpad-workspace ${paperMode === 'grid' ? 'is-grid' : 'is-paper'}"><div class="scratchpad-paper"><canvas id="real-scratchpad-canvas" aria-label="Scratchpad drawing area"></canvas><span class="scratchpad-hint">PEN · TOUCH · MOUSE</span></div>${craftMarkup()}</div>`;
  wireCommonClose();
  wireScratchToolbar();
  wireCraft();
  canvas = content.querySelector('#real-scratchpad-canvas');
  context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  wireCanvas();
  resizeCanvas();
  queueRedraw();
}

function wireCommonClose() {
  shell.querySelector('[data-pilot-close]')?.addEventListener('click', closeView);
}

function refreshScratchToolbar() {
  const toolbar = shell?.querySelector('#pilot-tools-toolbar');
  if (!toolbar || activeView !== 'scratchpad') return;
  toolbar.innerHTML = scratchToolbar();
  wireCommonClose();
  wireScratchToolbar();
}

function wireScratchToolbar() {
  shell.querySelectorAll('[data-scratch-tool]').forEach((button) => button.addEventListener('click', () => {
    scratchTool = button.dataset.scratchTool;
    saveScratchpadState();
    refreshScratchToolbar();
  }));
  shell.querySelectorAll('[data-scratch-width]').forEach((button) => button.addEventListener('click', () => {
    scratchWidth = Number(button.dataset.scratchWidth);
    saveScratchpadState();
    refreshScratchToolbar();
  }));
  shell.querySelector('[data-scratch-undo]')?.addEventListener('click', undoStroke);
  shell.querySelector('[data-scratch-redo]')?.addEventListener('click', redoStroke);
  shell.querySelector('[data-scratch-paper]')?.addEventListener('click', () => {
    paperMode = paperMode === 'grid' ? 'paper' : 'grid';
    saveScratchpadState();
    shell.querySelector('.scratchpad-workspace')?.classList.toggle('is-grid', paperMode === 'grid');
    shell.querySelector('.scratchpad-workspace')?.classList.toggle('is-paper', paperMode === 'paper');
    refreshScratchToolbar();
  });
  shell.querySelector('[data-scratch-craft]')?.addEventListener('click', () => {
    craftOpen = !craftOpen;
    const drawer = shell.querySelector('.scratch-craft-drawer');
    if (drawer) drawer.hidden = !craftOpen;
    refreshScratchToolbar();
  });
  shell.querySelector('[data-scratch-clear]')?.addEventListener('click', () => {
    if (!strokes.length) return;
    const accepted = window.confirm(isGerman() ? 'Scratchpad wirklich komplett leeren?' : 'Clear the entire scratchpad?');
    if (!accepted) return;
    strokes = [];
    redoStack = [];
    saveScratchpadState();
    queueRedraw();
    refreshScratchToolbar();
  });
  shell.querySelector('[data-scratch-export]')?.addEventListener('click', exportScratchpadPng);
}

function wireCraft() {
  shell.querySelectorAll('[data-craft-field]').forEach((input) => input.addEventListener('input', saveCraftFromUi));
  shell.querySelector('[data-craft-auto]')?.addEventListener('click', () => {
    const values = autoCraft();
    for (const [key, value] of Object.entries(values)) {
      const input = shell.querySelector(`[data-craft-field="${key}"]`);
      if (input && value) input.value = value;
    }
    saveCraftFromUi();
  });
}

function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: rect.width ? (event.clientX - rect.left) / rect.width : 0,
    y: rect.height ? (event.clientY - rect.top) / rect.height : 0,
    p: event.pointerType === 'pen' && Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : 0.5,
  };
}

function wireCanvas() {
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    currentStroke = { tool: scratchTool, width: scratchWidth, points: [pointFromEvent(event)] };
    queueRedraw();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!currentStroke) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    const previous = currentStroke.points.at(-1);
    if (previous && Math.abs(previous.x - point.x) < 0.0007 && Math.abs(previous.y - point.y) < 0.0007) return;
    currentStroke.points.push(point);
    if (currentStroke.points.length > 4000) currentStroke.points.shift();
    queueRedraw();
  });
  const finish = (event) => {
    if (!currentStroke) return;
    event?.preventDefault?.();
    if (currentStroke.points.length === 1) currentStroke.points.push({ ...currentStroke.points[0], x: currentStroke.points[0].x + 0.0001 });
    strokes.push(currentStroke);
    strokes = strokes.slice(-2500);
    currentStroke = null;
    redoStack = [];
    saveScratchpadState();
    queueRedraw();
    refreshScratchToolbar();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
}

function drawStroke(ctx, stroke, width, height) {
  if (!stroke?.points?.length) return;
  const points = stroke.points;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = stroke.tool === 'marker' ? 'rgba(20, 34, 46, 0.28)' : '#13212d';
  const pressure = points.reduce((sum, point) => sum + (Number(point.p) || 0.5), 0) / points.length;
  ctx.lineWidth = Math.max(1, Number(stroke.width || 4) * (stroke.tool === 'marker' ? 3.4 : stroke.tool === 'eraser' ? 4 : 1) * (0.75 + pressure * 0.5));
  ctx.beginPath();
  ctx.moveTo(points[0].x * width, points[0].y * height);
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[index - 1];
    const midX = ((previous.x + point.x) / 2) * width;
    const midY = ((previous.y + point.y) / 2) * height;
    ctx.quadraticCurveTo(previous.x * width, previous.y * height, midX, midY);
  }
  const last = points.at(-1);
  ctx.lineTo(last.x * width, last.y * height);
  ctx.stroke();
  ctx.restore();
}

function redraw() {
  redrawFrame = 0;
  if (!canvas || !context) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  context.clearRect(0, 0, width, height);
  for (const stroke of strokes) drawStroke(context, stroke, width, height);
  if (currentStroke) drawStroke(context, currentStroke, width, height);
}

function queueRedraw() {
  if (redrawFrame) return;
  redrawFrame = requestAnimationFrame(redraw);
}

function resizeCanvas() {
  if (!canvas || !context) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const nextWidth = Math.max(1, Math.round(rect.width * dpr));
  const nextHeight = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width === nextWidth && canvas.height === nextHeight) return;
  canvas.width = nextWidth;
  canvas.height = nextHeight;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  queueRedraw();
}

function undoStroke() {
  const stroke = strokes.pop();
  if (!stroke) return;
  redoStack.push(stroke);
  saveScratchpadState();
  queueRedraw();
  refreshScratchToolbar();
}

function redoStroke() {
  const stroke = redoStack.pop();
  if (!stroke) return;
  strokes.push(stroke);
  saveScratchpadState();
  queueRedraw();
  refreshScratchToolbar();
}

function exportScratchpadPng() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(800, Math.round(rect.width * scale));
  const height = Math.max(500, Math.round(rect.height * scale));
  const strokeCanvas = document.createElement('canvas');
  strokeCanvas.width = width;
  strokeCanvas.height = height;
  const strokeContext = strokeCanvas.getContext('2d');
  for (const stroke of strokes) drawStroke(strokeContext, stroke, width, height);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d');
  outputContext.fillStyle = '#f5f1e8';
  outputContext.fillRect(0, 0, width, height);
  if (paperMode === 'grid') {
    outputContext.strokeStyle = 'rgba(38, 69, 92, 0.12)';
    outputContext.lineWidth = 1;
    const step = Math.max(24, Math.round(width / 44));
    for (let x = 0; x <= width; x += step) { outputContext.beginPath(); outputContext.moveTo(x, 0); outputContext.lineTo(x, height); outputContext.stroke(); }
    for (let y = 0; y <= height; y += step) { outputContext.beginPath(); outputContext.moveTo(0, y); outputContext.lineTo(width, y); outputContext.stroke(); }
  }
  outputContext.drawImage(strokeCanvas, 0, 0);
  const anchor = document.createElement('a');
  anchor.download = `Flight-Deck-Scratchpad-${new Date().toISOString().slice(0, 10)}.png`;
  anchor.href = output.toDataURL('image/png');
  anchor.click();
}

function launcherConfig() {
  const current = readJson(STORAGE.launcher, null);
  if (current?.slots?.length) return current;
  return {
    slots: [
      { name: 'MSFS 2024 (Steam)', uri: 'steam://rungameid/2537590' },
      { name: 'Custom tool 1', uri: '' },
      { name: 'Custom tool 2', uri: '' },
    ],
  };
}

function safeLaunchUri(uri) {
  const value = String(uri || '').trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) || /^(javascript|data|file):/i.test(value)) return false;
  const anchor = document.createElement('a');
  anchor.href = value;
  anchor.target = '_blank';
  anchor.rel = 'noreferrer';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  return true;
}

function renderSimSession() {
  const dictionary = labels();
  const config = launcherConfig();
  const toolbar = shell.querySelector('#pilot-tools-toolbar');
  const content = shell.querySelector('#pilot-tools-content');
  toolbar.innerHTML = toolbarBase(dictionary.session, dictionary.sessionSubtitle);
  content.innerHTML = `<div class="sim-session-grid"><article class="sim-session-card sim-session-internal"><header><small>FLIGHT DECK</small><h2>${dictionary.quickLaunch}</h2></header><div class="sim-session-buttons">${[['Taxi','taxi','T'],['COM','com','C'],['Live Map','flight','M'],['ATC','atc','A'],['Ground','ground','G'],['Settings','settings','S']].map(([label, module, icon]) => `<button type="button" data-internal-module="${module}"><span>${icon}</span><strong>${label}</strong></button>`).join('')}</div></article><article class="sim-session-card sim-session-external"><header><small>WINDOWS / URI</small><h2>${dictionary.externalTools}</h2></header><div class="sim-session-slots">${config.slots.map((slot, index) => `<div><input data-launch-name="${index}" value="${esc(slot.name)}" aria-label="Tool name"><input data-launch-uri="${index}" value="${esc(slot.uri)}" placeholder="scheme://…" aria-label="Launch URI"><button type="button" data-launch-run="${index}" ${slot.uri ? '' : 'disabled'}>${dictionary.launch}</button></div>`).join('')}</div><footer><span>${dictionary.unsafe}</span><button type="button" data-launch-save>${dictionary.save}</button></footer></article></div>`;
  wireCommonClose();
  content.querySelectorAll('[data-internal-module]').forEach((button) => button.addEventListener('click', () => {
    closeView();
    document.querySelector(`[data-open-module="${button.dataset.internalModule}"]`)?.click();
  }));
  content.querySelector('[data-launch-save]')?.addEventListener('click', () => {
    config.slots = config.slots.map((slot, index) => ({
      name: content.querySelector(`[data-launch-name="${index}"]`)?.value || slot.name,
      uri: content.querySelector(`[data-launch-uri="${index}"]`)?.value || '',
    }));
    writeJson(STORAGE.launcher, config);
    renderSimSession();
  });
  content.querySelectorAll('[data-launch-run]').forEach((button) => button.addEventListener('click', () => {
    const slot = config.slots[Number(button.dataset.launchRun)];
    button.textContent = safeLaunchUri(slot?.uri) ? dictionary.launched : dictionary.invalidUri;
  }));
}

function onState(event) {
  latestState = event.detail || latestState;
}

function onKeyDown(event) {
  if (!activeView) return;
  if (event.key === 'Escape') {
    closeView();
    return;
  }
  if (activeView !== 'scratchpad' || !(event.ctrlKey || event.metaKey)) return;
  if (event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); redoStroke(); }
  else if (event.key.toLowerCase() === 'z') { event.preventDefault(); undoStroke(); }
}

function start() {
  normalizeExistingFlightNotes();
  installTiles();
  ensureShell();
  window.addEventListener('flightdeckstate', onState);
  window.addEventListener('resize', () => { if (activeView === 'scratchpad') resizeCanvas(); });
  document.addEventListener('keydown', onKeyDown);
  const observer = new MutationObserver(() => {
    installTiles();
    normalizeExistingFlightNotes();
  });
  const home = document.querySelector('[data-page="home"]');
  if (home) observer.observe(home, { childList: true, subtree: true });
  const languageObserver = new MutationObserver(() => {
    normalizeExistingFlightNotes();
    installTiles();
    if (activeView === 'scratchpad') renderScratchpad();
    if (activeView === 'sim-session') renderSimSession();
  });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
