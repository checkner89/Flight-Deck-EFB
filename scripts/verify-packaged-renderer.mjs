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
    } catch (error) {
      lastError = error;
    }
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
    }, 8_000);
  });
  return { command, runtimeEvents };
}

const target = await waitForTarget();
const socket = await connect(target.webSocketDebuggerUrl);
const { command, runtimeEvents } = await session(socket);

try {
  await command('Runtime.enable');
  await new Promise((resolve) => setTimeout(resolve, 600));
  const expression = `new Promise(async (resolve) => {
    const app = document.querySelector('#app');
    const grid = document.querySelector('.app-launcher-grid');
    const pilotScript = document.querySelector('[data-pilot-tools]');
    const nativeScript = document.querySelector('[data-sim-session-native]');
    let pilotFetch = null;
    try {
      const response = await fetch('/pilot-tools.js?v=1.19.0', { cache: 'no-store' });
      pilotFetch = { status: response.status, contentType: response.headers.get('content-type'), length: (await response.text()).length };
    } catch (error) {
      pilotFetch = { error: error.message };
    }
    let mutations = 0;
    const observer = grid ? new MutationObserver((records) => { mutations += records.length; }) : null;
    if (observer && grid) observer.observe(grid, { childList: true, subtree: true, characterData: true });
    setTimeout(() => {
      observer?.disconnect();
      const rect = app?.getBoundingClientRect();
      const resourceNames = performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /pilot-tools|sim-session-native/.test(name));
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
        mutations,
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
      if (/error|failed|pilot|scratch|session/i.test(text)) console.log(`Renderer console: ${text}`);
    }
  }
  if (value.readyState !== 'complete') throw new Error(`Renderer did not finish loading: ${value.readyState}`);
  if (!value.appVisible) throw new Error('Renderer app shell is not visibly laid out.');
  if (value.textLength < 200) throw new Error(`Renderer looks blank: only ${value.textLength} visible text characters.`);
  if (value.tileCount < 8) throw new Error(`Home app launcher is incomplete: ${value.tileCount} tiles.`);
  if (!value.pilotScript) throw new Error('Pilot Tools script tag is missing from the packaged HTML.');
  if (value.pilotFetch?.status !== 200) throw new Error(`Pilot Tools asset is not served correctly: ${JSON.stringify(value.pilotFetch)}`);
  if (!value.pilotShell) throw new Error('Pilot Tools shell was not initialized.');
  if (value.mutations > 80) throw new Error(`Home launcher is mutating continuously (${value.mutations} mutations / 900 ms).`);
  console.log(`Packaged renderer healthy: ${value.tileCount} tiles, ${value.textLength} text chars, ${value.mutations} launcher mutations/900ms.`);
} finally {
  socket.close();
}
