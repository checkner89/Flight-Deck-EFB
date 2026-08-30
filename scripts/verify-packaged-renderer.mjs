const port = Number(process.argv[2] || 9333);
const base = `http://127.0.0.1:${port}`;

async function waitForTarget() {
  const deadline = Date.now() + 20_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const targets = await fetch(`${base}/json`).then((response) => response.json());
      const page = targets.find((entry) => entry.type === 'page' && /localhost|127\.0\.0\.1/.test(entry.url || ''))
        || targets.find((entry) => entry.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Electron renderer DevTools target did not become ready${lastError ? `: ${lastError.message}` : '.'}`);
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to renderer DevTools WebSocket.')), { once: true });
  });
}

async function session(socket) {
  let sequence = 0;
  const pending = new Map();
  const runtimeEvents = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data || '{}'));
    if (message.method === 'Runtime.exceptionThrown' || message.method === 'Runtime.consoleAPICalled') runtimeEvents.push(message);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || 'DevTools command failed.'));
    else resolve(message.result);
  });
  const command = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error(`DevTools command timed out: ${method}`));
    }, 25_000);
  });
  return { command, runtimeEvents };
}

const target = await waitForTarget();
const socket = await connect(target.webSocketDebuggerUrl);
const { command, runtimeEvents } = await session(socket);

try {
  await command('Runtime.enable');
  await new Promise((resolve) => setTimeout(resolve, 700));
  const expression = `new Promise(async (resolve) => {
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

    for (let attempt = 0; document.readyState !== 'complete' && attempt < 100; attempt += 1) {
      await sleep(100);
    }

    let app = null;
    let grid = null;
    let pilotScript = null;
    let nativeScript = null;
    let scratchTile = null;
    let setupTile = null;
    let newsTile = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      app = document.querySelector('#app');
      grid = document.querySelector('.app-launcher-grid');
      pilotScript = document.querySelector('[data-pilot-tools]');
      nativeScript = document.querySelector('[data-sim-session-native]');
      scratchTile = grid?.querySelector('[data-pilot-tool="scratchpad"]') || null;
      setupTile = grid?.querySelector('[data-pilot-tool="sim-session"]') || null;
      newsTile = grid?.querySelector('[data-news-app-tile]') || null;
      const pilotShell = document.querySelector('#pilot-tools-shell');
      if (document.readyState === 'complete' && app && grid && pilotScript && nativeScript && scratchTile && setupTile && newsTile && pilotShell) break;
      await sleep(100);
    }

    let pilotFetch = null;
    try {
      const response = await fetch('/pilot-tools.js?v=1.20.2', { cache: 'no-store' });
      pilotFetch = { status: response.status, contentType: response.headers.get('content-type'), length: (await response.text()).length };
    } catch (error) { pilotFetch = { error: error.message }; }

    let desktopSessionRecovery = null;
    try {
      const currentUrl = new URL(window.location.href);
      const desktop = currentUrl.searchParams.get('desktop') || sessionStorage.getItem('flyxora-desktop-session');
      const previousToken = localStorage.getItem('si-taxi-token');
      localStorage.removeItem('si-taxi-token');
      const endpoint = new URL('/api/desktop/session', window.location.origin);
      if (desktop) endpoint.searchParams.set('desktop', desktop);
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({}));
      let validateStatus = null;
      if (payload?.token) {
        const validate = new URL('/api/session/validate', window.location.origin);
        validate.searchParams.set('token', payload.token);
        validateStatus = (await fetch(validate, { cache: 'no-store' })).status;
        localStorage.setItem('si-taxi-token', payload.token);
      } else if (previousToken) {
        localStorage.setItem('si-taxi-token', previousToken);
      }
      desktopSessionRecovery = {
        hasDesktopSecret: Boolean(desktop),
        status: response.status,
        recoveredToken: Boolean(payload?.token),
        validateStatus,
      };
    } catch (error) {
      desktopSessionRecovery = { error: error.message };
    }

    const establishedTile = [...(grid?.querySelectorAll('.efb-app-tile') || [])].find((tile) => !tile.matches('[data-pilot-tool],[data-news-app-tile]'));
    const tileMetrics = (tile) => {
      if (!tile) return null;
      const rect = tile.getBoundingClientRect();
      const icon = tile.querySelector('.app-tile-icon')?.getBoundingClientRect();
      return { height: Math.round(rect.height), iconWidth: Math.round(icon?.width || 0), copySmall: Boolean(tile.querySelector('.app-tile-copy>small')), copyTitle: Boolean(tile.querySelector('.app-tile-copy>strong')), copyDescription: Boolean(tile.querySelector('.app-tile-copy>span')) };
    };

    let scratch = null;
    if (scratchTile) {
      scratchTile.click();
      let canvas = null;
      let paper = null;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        canvas = document.querySelector('#real-scratchpad-canvas');
        paper = document.querySelector('.scratchpad-paper');
        if (canvas && paper && paper.getBoundingClientRect().width > 300) break;
        await sleep(100);
      }
      scratch = {
        visible: Boolean(paper && paper.getBoundingClientRect().width > 300),
        canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : null,
        colorControls: document.querySelectorAll('[data-scratch-color]').length,
        customColors: document.querySelectorAll('[data-scratch-custom-color]').length,
        imageInsert: Boolean(document.querySelector('[data-scratch-image-add]')),
      };
      document.querySelector('[data-pilot-close]')?.click();
      await sleep(80);
    }

    let mutations = 0;
    const observer = grid ? new MutationObserver((records) => { mutations += records.length; }) : null;
    if (observer && grid) observer.observe(grid, { childList: true, subtree: true, characterData: true });
    setTimeout(() => {
      observer?.disconnect();
      const rect = app?.getBoundingClientRect();
      const resourceNames = performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /pilot-tools|sim-session-native|news-app|release-1\.20\.2/.test(name));
      resolve({
        readyState: document.readyState,
        title: document.title,
        textLength: (document.body?.innerText || '').trim().length,
        appVisible: Boolean(app && rect && rect.width > 300 && rect.height > 300 && getComputedStyle(app).display !== 'none'),
        tileCount: grid?.querySelectorAll('.efb-app-tile').length || 0,
        pilotShell: Boolean(document.querySelector('#pilot-tools-shell')),
        pilotScript: pilotScript?.src || null,
        nativeScript: nativeScript?.src || null,
        resourceNames,
        pilotFetch,
        desktopSessionRecovery,
        mutations,
        scratch,
        tiles: { established: tileMetrics(establishedTile), scratchpad: tileMetrics(scratchTile), setup: tileMetrics(setupTile), news: tileMetrics(newsTile) },
      });
    }, 900);
  })`;
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(`Renderer evaluation failed: ${result.exceptionDetails.text || 'unknown exception'}`);
  const value = result.result?.value || {};
  console.log(`Renderer diagnostics: ${JSON.stringify(value)}`);
  for (const event of runtimeEvents) {
    if (event.method === 'Runtime.exceptionThrown') {
      const detail = event.params?.exceptionDetails;
      console.log(`Renderer exception: ${detail?.text || ''} ${detail?.exception?.description || ''}`.trim());
    } else if (event.method === 'Runtime.consoleAPICalled') {
      const text = (event.params?.args || []).map((arg) => arg.value || arg.description || '').join(' ');
      if (/error|failed|pilot|scratch|session|news/i.test(text)) console.log(`Renderer console: ${text}`);
    }
  }
  if (value.readyState !== 'complete') throw new Error(`Renderer did not finish loading: ${value.readyState}`);
  if (!value.appVisible) throw new Error('Renderer app shell is not visibly laid out.');
  if (value.textLength < 200) throw new Error(`Renderer looks blank: only ${value.textLength} visible text characters.`);
  if (value.tileCount < 8) throw new Error(`Home app launcher is incomplete: ${value.tileCount} tiles.`);
  if (!value.pilotScript) throw new Error('Pilot Tools script tag is missing from the packaged HTML.');
  if (value.pilotFetch?.status !== 200) throw new Error(`Pilot Tools asset is not served correctly: ${JSON.stringify(value.pilotFetch)}`);
  if (!value.pilotShell) throw new Error('Pilot Tools shell was not initialized.');
  if (!value.desktopSessionRecovery?.hasDesktopSecret) throw new Error(`Packaged Electron renderer has no private desktop session: ${JSON.stringify(value.desktopSessionRecovery)}`);
  if (value.desktopSessionRecovery?.status !== 200 || !value.desktopSessionRecovery?.recoveredToken || value.desktopSessionRecovery?.validateStatus !== 200) {
    throw new Error(`Packaged desktop host token recovery failed: ${JSON.stringify(value.desktopSessionRecovery)}`);
  }
  if (value.mutations > 80) throw new Error(`Home launcher is mutating continuously (${value.mutations} mutations / 900 ms).`);
  if (!value.scratch?.visible) throw new Error('Scratchpad did not open visibly in the packaged renderer.');
  if (!value.scratch?.canvasBackground || /rgba?\(0,\s*0,\s*0(?:,\s*(?:0|1))?\)/.test(value.scratch.canvasBackground)) throw new Error(`Scratchpad canvas is still dark: ${value.scratch?.canvasBackground}`);
  if (value.scratch.colorControls < 5 || value.scratch.customColors < 1) throw new Error('Scratchpad pen/marker color controls are missing.');
  if (!value.scratch.imageInsert) throw new Error('Scratchpad image insert action is missing.');
  for (const name of ['scratchpad', 'setup', 'news']) {
    const metrics = value.tiles?.[name];
    if (!metrics?.copySmall || !metrics?.copyTitle || !metrics?.copyDescription) throw new Error(`New app tile ${name} does not use the established tile content hierarchy.`);
  }
  const reference = value.tiles?.established;
  if (reference) {
    for (const name of ['scratchpad', 'setup', 'news']) {
      const metrics = value.tiles?.[name];
      if (Math.abs((metrics?.iconWidth || 0) - reference.iconWidth) > 3) throw new Error(`New app tile ${name} uses a different icon geometry.`);
    }
  }
  console.log(`Packaged renderer healthy: ${value.tileCount} tiles, desktop session recovery verified, bright Scratchpad, unified new tiles, ${value.mutations} launcher mutations/900ms.`);
} finally {
  socket.close();
}
