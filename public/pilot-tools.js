const STORAGE = {
  scratchpad: 'flight-deck-real-scratchpad-v1',
  craft: 'flight-deck-real-scratchpad-craft-v1',
  launcher: 'flight-deck-sim-session-v1',
};

const PEN_COLORS = ['#13212d', '#1769aa', '#d33f49', '#16835d', '#7448b5'];
const MARKER_COLORS = ['#f4d94e', '#68d391', '#5bc0eb', '#ff9f43', '#f783ac'];

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
let penColor = PEN_COLORS[0];
let markerColor = MARKER_COLORS[0];
let paperMode = 'grid';
let craftOpen = false;
let scratchImages = [];
let selectedImageId = null;
let imageInteraction = null;
const imageCache = new Map();

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
    scratchCategory: 'FLIGHT DECK TOOLS',
    scratchDescription: 'Freihand-Notizen, Markierungen und Skizzen',
    session: 'Flight Setup',
    sessionSubtitle: 'Simulator, ATC und Add-ons vorbereiten',
    sessionCategory: 'SYSTEM & SIM SETUP',
    sessionDescription: 'Simulator, ATC und Add-ons vorbereiten',
    apps: 'APPS',
    pen: 'STIFT', marker: 'MARKER', eraser: 'RADIERER', image: 'BILD',
    undo: 'ZURÜCK', redo: 'WIEDERHOLEN', clear: 'LEEREN', savePng: 'PNG',
    paper: 'PAPIER', grid: 'RASTER', craft: 'CRAFT', auto: 'AUTO FILL',
    removeImage: 'BILD LÖSCHEN',
    flightNotes: 'Flight Notes',
  } : {
    scratchpad: 'Scratchpad',
    scratchSubtitle: 'Write with pen, mouse or touch',
    scratchCategory: 'FLIGHT DECK TOOLS',
    scratchDescription: 'Freehand notes, highlights and sketches',
    session: 'Flight Setup',
    sessionSubtitle: 'Prepare simulator, ATC and add-ons',
    sessionCategory: 'SYSTEM & SIM SETUP',
    sessionDescription: 'Prepare simulator, ATC and add-ons',
    apps: 'APPS',
    pen: 'PEN', marker: 'MARKER', eraser: 'ERASER', image: 'IMAGE',
    undo: 'UNDO', redo: 'REDO', clear: 'CLEAR', savePng: 'PNG',
    paper: 'PAPER', grid: 'GRID', craft: 'CRAFT', auto: 'AUTO FILL',
    removeImage: 'REMOVE IMAGE',
    flightNotes: 'Flight Notes',
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
  return '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M11 9h26v30H11zM17 16h14M17 23h8M17 30h11"/><path d="m34 16 7 7-7 7M40 23H27"/></svg>';
}

function installTiles() {
  const grid = document.querySelector('.app-launcher-grid');
  if (!grid) return;
  grid.querySelectorAll('[data-ops-tool]').forEach((element) => element.remove());
  const dictionary = labels();
  const definitions = [
    ['scratchpad', dictionary.scratchpad, dictionary.scratchCategory, dictionary.scratchDescription, 60],
    ['sim-session', dictionary.session, dictionary.sessionCategory, dictionary.sessionDescription, 61],
  ];
  for (const [id, title, category, description, order] of definitions) {
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
    const signature = `${title}|${category}|${description}`;
    if (button.dataset.tileSignature === signature) continue;
    button.dataset.tileSignature = signature;
    button.innerHTML = `<span class="app-tile-icon">${tileIcon(id)}</span><span class="app-tile-copy"><small>${esc(category)}</small><strong>${esc(title)}</strong><span>${esc(description)}</span></span><i class="app-open-arrow">›</i>`;
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
  imageInteraction = null;
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
  scratchTool = ['pen', 'marker', 'eraser', 'image'].includes(saved.tool) ? saved.tool : 'pen';
  scratchWidth = [2, 4, 8].includes(Number(saved.width)) ? Number(saved.width) : 4;
  penColor = /^#[0-9a-f]{6}$/i.test(saved.penColor || '') ? saved.penColor : PEN_COLORS[0];
  markerColor = /^#[0-9a-f]{6}$/i.test(saved.markerColor || '') ? saved.markerColor : MARKER_COLORS[0];
  paperMode = saved.paper === 'paper' ? 'paper' : 'grid';
  scratchImages = Array.isArray(saved.images) ? saved.images.filter((item) => item?.dataUrl && Number.isFinite(item.x) && Number.isFinite(item.y)).slice(-8) : [];
  selectedImageId = null;
}

function saveScratchpadState() {
  writeJson(STORAGE.scratchpad, {
    strokes,
    images: scratchImages,
    tool: scratchTool,
    width: scratchWidth,
    penColor,
    markerColor,
    paper: paperMode,
  });
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
    ['C', 'clearance', 'CLEARANCE'], ['R', 'route', 'ROUTE'], ['A', 'altitude', 'ALTITUDE'],
    ['F', 'frequency', 'FREQUENCY'], ['T', 'transponder', 'TRANSPONDER'],
  ];
  return `<aside class="scratch-craft-drawer" ${craftOpen ? '' : 'hidden'}><header><div><small>ATC QUICK REFERENCE</small><strong>CRAFT</strong></div><button type="button" data-craft-auto>${dictionary.auto}</button></header><div class="scratch-craft-fields">${fields.map(([letter, key, label]) => `<label><span>${letter}</span><small>${label}</small><input data-craft-field="${key}" value="${esc(craft[key] || '')}" autocomplete="off"></label>`).join('')}</div><p>Optional reference only. The drawing area remains the primary scratchpad.</p></aside>`;
}

function colorPaletteMarkup() {
  if (!['pen', 'marker'].includes(scratchTool)) return '';
  const isMarker = scratchTool === 'marker';
  const colors = isMarker ? MARKER_COLORS : PEN_COLORS;
  const active = isMarker ? markerColor : penColor;
  return `<div class="scratch-tool-group scratch-colors" aria-label="${isMarker ? 'Marker' : 'Pen'} colors">${colors.map((color) => `<button type="button" class="scratch-color ${color.toLowerCase() === active.toLowerCase() ? 'active' : ''}" data-scratch-color="${color}" data-color-kind="${scratchTool}" aria-label="${color}"><i style="--swatch:${color}"></i></button>`).join('')}<label class="scratch-custom-color" title="Custom color"><input type="color" data-scratch-custom-color="${scratchTool}" value="${esc(active)}"><span>+</span></label></div>`;
}

function scratchToolbar() {
  const dictionary = labels();
  const toolButtons = [['pen', dictionary.pen], ['marker', dictionary.marker], ['eraser', dictionary.eraser], ['image', dictionary.image]]
    .map(([tool, label]) => `<button type="button" data-scratch-tool="${tool}" class="${scratchTool === tool ? 'active' : ''}">${label}</button>`).join('');
  const widthButtons = [2, 4, 8].map((width) => `<button type="button" data-scratch-width="${width}" class="scratch-width width-${width} ${scratchWidth === width ? 'active' : ''}" aria-label="Width ${width}"><i></i></button>`).join('');
  return toolbarBase(dictionary.scratchpad, dictionary.scratchSubtitle, `<div class="scratch-toolbar-actions"><div class="scratch-tool-group">${toolButtons}</div>${colorPaletteMarkup()}<div class="scratch-tool-group scratch-widths">${widthButtons}</div><div class="scratch-tool-group scratch-actions"><button type="button" data-scratch-image-add>${dictionary.image}</button><button type="button" data-scratch-image-remove ${selectedImageId ? '' : 'disabled'}>${dictionary.removeImage}</button><button type="button" data-scratch-undo ${strokes.length ? '' : 'disabled'}>${dictionary.undo}</button><button type="button" data-scratch-redo ${redoStack.length ? '' : 'disabled'}>${dictionary.redo}</button><button type="button" data-scratch-paper>${paperMode === 'grid' ? dictionary.grid : dictionary.paper}</button><button type="button" data-scratch-craft class="${craftOpen ? 'active' : ''}">${dictionary.craft}</button><button type="button" data-scratch-export>${dictionary.savePng}</button><button type="button" data-scratch-clear class="danger-quiet">${dictionary.clear}</button></div></div>`);
}

function renderScratchpad() {
  scratchpadState();
  const toolbar = shell.querySelector('#pilot-tools-toolbar');
  const content = shell.querySelector('#pilot-tools-content');
  toolbar.innerHTML = scratchToolbar();
  content.innerHTML = `<div class="scratchpad-workspace ${paperMode === 'grid' ? 'is-grid' : 'is-paper'}"><div class="scratchpad-paper" tabindex="0" data-scratch-dropzone><canvas id="real-scratchpad-canvas" aria-label="Scratchpad drawing area"></canvas><span class="scratchpad-hint">PEN · TOUCH · MOUSE · DROP / PASTE IMAGE</span><input type="file" accept="image/*" data-scratch-image-input hidden></div>${craftMarkup()}</div>`;
  wireCommonClose();
  wireScratchToolbar();
  wireCraft();
  canvas = content.querySelector('#real-scratchpad-canvas');
  context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  wireCanvas();
  wireImageDropzone();
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
    queueRedraw();
  }));
  shell.querySelectorAll('[data-scratch-width]').forEach((button) => button.addEventListener('click', () => {
    scratchWidth = Number(button.dataset.scratchWidth);
    saveScratchpadState();
    refreshScratchToolbar();
  }));
  shell.querySelectorAll('[data-scratch-color]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.colorKind === 'marker') markerColor = button.dataset.scratchColor;
    else penColor = button.dataset.scratchColor;
    saveScratchpadState();
    refreshScratchToolbar();
  }));
  shell.querySelectorAll('[data-scratch-custom-color]').forEach((input) => input.addEventListener('input', () => {
    if (input.dataset.scratchCustomColor === 'marker') markerColor = input.value;
    else penColor = input.value;
    saveScratchpadState();
    refreshScratchToolbar();
  }));
  shell.querySelector('[data-scratch-image-add]')?.addEventListener('click', () => shell.querySelector('[data-scratch-image-input]')?.click());
  shell.querySelector('[data-scratch-image-input]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (file) await addScratchImage(file);
    event.target.value = '';
  });
  shell.querySelector('[data-scratch-image-remove]')?.addEventListener('click', removeSelectedImage);
  shell.querySelector('[data-scratch-undo]')?.addEventListener('click', undoStroke);
  shell.querySelector('[data-scratch-redo]')?.addEventListener('click', redoStroke);
  shell.querySelector('[data-scratch-paper]')?.addEventListener('click', () => {
    paperMode = paperMode === 'grid' ? 'paper' : 'grid';
    saveScratchpadState();
    shell.querySelector('.scratchpad-workspace')?.classList.toggle('is-grid', paperMode === 'grid');
    shell.querySelector('.scratchpad-workspace')?.classList.toggle('is-paper', paperMode === 'paper');
    queueRedraw();
    refreshScratchToolbar();
  });
  shell.querySelector('[data-scratch-craft]')?.addEventListener('click', () => {
    craftOpen = !craftOpen;
    const drawer = shell.querySelector('.scratch-craft-drawer');
    if (drawer) drawer.hidden = !craftOpen;
    refreshScratchToolbar();
  });
  shell.querySelector('[data-scratch-clear]')?.addEventListener('click', () => {
    if (!strokes.length && !scratchImages.length) return;
    const accepted = window.confirm(isGerman() ? 'Scratchpad wirklich komplett leeren?' : 'Clear the entire scratchpad?');
    if (!accepted) return;
    strokes = [];
    scratchImages = [];
    selectedImageId = null;
    redoStack = [];
    imageCache.clear();
    saveScratchpadState();
    queueRedraw();
    refreshScratchToolbar();
  });
  shell.querySelector('[data-scratch-export]')?.addEventListener('click', () => exportScratchpadPng().catch(() => {}));
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

function hitImage(point) {
  for (let index = scratchImages.length - 1; index >= 0; index -= 1) {
    const item = scratchImages[index];
    if (point.x >= item.x && point.x <= item.x + item.w && point.y >= item.y && point.y <= item.y + item.h) return item;
  }
  return null;
}

function imageResizeHit(item, point) {
  if (!item) return false;
  const dx = point.x - (item.x + item.w);
  const dy = point.y - (item.y + item.h);
  return Math.hypot(dx, dy) < 0.035;
}

function wireCanvas() {
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const point = pointFromEvent(event);
    if (scratchTool === 'image') {
      const selected = scratchImages.find((item) => item.id === selectedImageId);
      if (selected && imageResizeHit(selected, point)) {
        imageInteraction = { mode: 'resize', id: selected.id, startX: point.x, startW: selected.w, startH: selected.h };
      } else {
        const item = hitImage(point);
        selectedImageId = item?.id || null;
        imageInteraction = item ? { mode: 'move', id: item.id, dx: point.x - item.x, dy: point.y - item.y } : null;
      }
      refreshScratchToolbar();
      queueRedraw();
      return;
    }
    currentStroke = {
      tool: scratchTool,
      width: scratchWidth,
      color: scratchTool === 'marker' ? markerColor : penColor,
      points: [point],
    };
    queueRedraw();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (imageInteraction) {
      event.preventDefault();
      const point = pointFromEvent(event);
      const item = scratchImages.find((entry) => entry.id === imageInteraction.id);
      if (!item) return;
      if (imageInteraction.mode === 'move') {
        item.x = Math.max(0, Math.min(1 - item.w, point.x - imageInteraction.dx));
        item.y = Math.max(0, Math.min(1 - item.h, point.y - imageInteraction.dy));
      } else {
        const nextW = Math.max(0.08, Math.min(0.95 - item.x, imageInteraction.startW + (point.x - imageInteraction.startX)));
        item.w = nextW;
        item.h = Math.max(0.06, nextW * (item.baseH / item.baseW));
        if (item.y + item.h > 1) item.h = 1 - item.y;
      }
      queueRedraw();
      return;
    }
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
    if (imageInteraction) {
      event?.preventDefault?.();
      imageInteraction = null;
      saveScratchpadState();
      queueRedraw();
      return;
    }
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

function wireImageDropzone() {
  const zone = shell.querySelector('[data-scratch-dropzone]');
  if (!zone) return;
  zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('is-dragging'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-dragging'));
  zone.addEventListener('drop', async (event) => {
    event.preventDefault();
    zone.classList.remove('is-dragging');
    const file = [...(event.dataTransfer?.files || [])].find((entry) => entry.type.startsWith('image/'));
    if (file) await addScratchImage(file);
  });
  zone.addEventListener('paste', async (event) => {
    const file = [...(event.clipboardData?.files || [])].find((entry) => entry.type.startsWith('image/'));
    if (file) { event.preventDefault(); await addScratchImage(file); }
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  if (imageCache.has(source)) return Promise.resolve(imageCache.get(source));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { imageCache.set(source, image); resolve(image); };
    image.onerror = () => reject(new Error('Unable to load image.'));
    image.src = source;
  });
}

async function compressedImage(file) {
  const raw = await readFile(file);
  const image = await loadImage(raw);
  const limit = 1600;
  const scale = Math.min(1, limit / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
  const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
  const temp = document.createElement('canvas');
  temp.width = width;
  temp.height = height;
  const ctx = temp.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return { dataUrl: temp.toDataURL('image/jpeg', 0.84), width, height };
}

async function addScratchImage(file) {
  if (!file?.type?.startsWith('image/')) return;
  try {
    const prepared = await compressedImage(file);
    const rect = canvas?.getBoundingClientRect();
    const canvasRatio = Math.max(0.4, (rect?.width || 1200) / (rect?.height || 800));
    const displayRatio = prepared.width / prepared.height;
    let w = 0.56;
    let h = (w * canvasRatio) / displayRatio;
    if (h > 0.68) { h = 0.68; w = (h * displayRatio) / canvasRatio; }
    const item = {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      dataUrl: prepared.dataUrl,
      x: Math.max(0.04, (1 - w) / 2),
      y: Math.max(0.04, (1 - h) / 2),
      w,
      h,
      baseW: w,
      baseH: h,
    };
    scratchImages.push(item);
    scratchImages = scratchImages.slice(-8);
    selectedImageId = item.id;
    scratchTool = 'image';
    saveScratchpadState();
    queueRedraw();
    refreshScratchToolbar();
  } catch { /* unsupported image */ }
}

function removeSelectedImage() {
  if (!selectedImageId) return;
  scratchImages = scratchImages.filter((item) => item.id !== selectedImageId);
  selectedImageId = null;
  saveScratchpadState();
  queueRedraw();
  refreshScratchToolbar();
}

function colorWithAlpha(color, alpha) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || ''));
  if (!match) return color || `rgba(19,33,45,${alpha})`;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

function drawStroke(ctx, stroke, width, height) {
  if (!stroke?.points?.length) return;
  const points = stroke.points;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  const fallback = stroke.tool === 'marker' ? MARKER_COLORS[0] : PEN_COLORS[0];
  ctx.strokeStyle = stroke.tool === 'marker' ? colorWithAlpha(stroke.color || fallback, 0.34) : (stroke.color || fallback);
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

function drawPaper(ctx, width, height) {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(0, 0, width, height);
  if (paperMode === 'grid') {
    ctx.strokeStyle = 'rgba(45,79,99,.10)';
    ctx.lineWidth = 1;
    const step = Math.max(24, Math.round(width / 46));
    for (let x = 0; x <= width; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 0; y <= height; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
  }
  ctx.restore();
}

function drawImageItem(ctx, item, width, height) {
  const image = imageCache.get(item.dataUrl);
  if (!image) {
    loadImage(item.dataUrl).then(queueRedraw).catch(() => {});
    return;
  }
  ctx.drawImage(image, item.x * width, item.y * height, item.w * width, item.h * height);
}

function drawSelection(ctx, width, height) {
  if (scratchTool !== 'image' || !selectedImageId) return;
  const item = scratchImages.find((entry) => entry.id === selectedImageId);
  if (!item) return;
  const x = item.x * width, y = item.y * height, w = item.w * width, h = item.h * height;
  ctx.save();
  ctx.strokeStyle = '#16b8ae';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#16b8ae';
  ctx.fillRect(x + w - 7, y + h - 7, 14, 14);
  ctx.restore();
}

function drawStrokeLayer(width, height, includeCurrent = true) {
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.round(width));
  layer.height = Math.max(1, Math.round(height));
  const ctx = layer.getContext('2d');
  for (const stroke of strokes) drawStroke(ctx, stroke, width, height);
  if (includeCurrent && currentStroke) drawStroke(ctx, currentStroke, width, height);
  return layer;
}

function redraw() {
  redrawFrame = 0;
  if (!canvas || !context) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  context.clearRect(0, 0, width, height);
  drawPaper(context, width, height);
  for (const item of scratchImages) drawImageItem(context, item, width, height);
  context.drawImage(drawStrokeLayer(width, height), 0, 0, width, height);
  drawSelection(context, width, height);
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

async function exportScratchpadPng() {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(800, Math.round(rect.width * scale));
  const height = Math.max(500, Math.round(rect.height * scale));
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d');
  drawPaper(outputContext, width, height);
  for (const item of scratchImages) {
    try {
      const image = await loadImage(item.dataUrl);
      outputContext.drawImage(image, item.x * width, item.y * height, item.w * width, item.h * height);
    } catch {}
  }
  outputContext.drawImage(drawStrokeLayer(width, height, false), 0, 0, width, height);
  const anchor = document.createElement('a');
  anchor.download = `Flight-Deck-Scratchpad-${new Date().toISOString().slice(0, 10)}.png`;
  anchor.href = output.toDataURL('image/png');
  anchor.click();
}

function renderSimSession() {
  const dictionary = labels();
  const toolbar = shell.querySelector('#pilot-tools-toolbar');
  const content = shell.querySelector('#pilot-tools-content');
  toolbar.innerHTML = toolbarBase(dictionary.session, dictionary.sessionSubtitle);
  content.innerHTML = '<div class="sim-session-grid flight-setup-grid"></div>';
  wireCommonClose();
  window.dispatchEvent(new CustomEvent('flightdeckflightsetupopen'));
}

function onState(event) {
  latestState = event.detail || latestState;
}

function onKeyDown(event) {
  if (!activeView) return;
  if (event.key === 'Escape') { closeView(); return; }
  if (activeView !== 'scratchpad') return;
  if ((event.key === 'Delete' || event.key === 'Backspace') && scratchTool === 'image' && selectedImageId) {
    if (!/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) { event.preventDefault(); removeSelectedImage(); }
    return;
  }
  if (!(event.ctrlKey || event.metaKey)) return;
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
  let tileFrame = 0;
  const syncTiles = () => {
    if (tileFrame) return;
    tileFrame = requestAnimationFrame(() => { tileFrame = 0; installTiles(); normalizeExistingFlightNotes(); });
  };
  const observer = new MutationObserver(syncTiles);
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
