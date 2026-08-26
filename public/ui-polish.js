const AIRCRAFT_VIEW_KEY = 'flight-deck-aircraft-view-v2';
const CHANGELOG_DIALOG_ID = 'changelog-dialog';

export function normalizeAircraftView(value) {
  return ['fenix', 'pmdg', 'status'].includes(String(value || '').toLowerCase())
    ? String(value).toLowerCase()
    : 'fenix';
}

export function isTurnaroundInactive(status = '', stage = '') {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedStage = String(stage || '').trim().toLowerCase().replace(/[-_]+/g, ' ');
  return normalizedStatus === 'inactive' || normalizedStage === 'in flight' || normalizedStage === 'airborne';
}

export function decodeBasicEntities(value = '') {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#039;', "'");
}

function textNode(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function storedAircraftView() {
  try {
    return normalizeAircraftView(localStorage.getItem(AIRCRAFT_VIEW_KEY));
  } catch {
    return 'fenix';
  }
}

function syncAircraftView(page, requested = null) {
  if (!page) return;
  const view = normalizeAircraftView(requested || page.dataset.stableAircraftView || storedAircraftView());
  page.dataset.stableAircraftView = view;
  try { localStorage.setItem(AIRCRAFT_VIEW_KEY, view); } catch {}

  for (const button of page.querySelectorAll('[data-aircraft-view-button]')) {
    const active = button.dataset.aircraftViewButton === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.setAttribute('aria-pressed', String(active));
  }
  for (const section of page.querySelectorAll('[data-aircraft-view]')) {
    section.hidden = section.dataset.aircraftView !== view;
  }
}

function enhanceAircraftPage() {
  const page = document.querySelector('[data-page="fenix"]');
  if (!page || page.dataset.uiPolishReady === '1') return;
  page.dataset.uiPolishReady = '1';
  page.dataset.stableAircraftView = storedAircraftView();
  page.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-aircraft-view-button]');
    if (!button) return;
    syncAircraftView(page, button.dataset.aircraftViewButton);
  }, true);
  syncAircraftView(page);

  let restoring = false;
  const observer = new MutationObserver(() => {
    if (restoring) return;
    restoring = true;
    queueMicrotask(() => {
      syncAircraftView(page);
      restoring = false;
    });
  });
  observer.observe(page, { attributes: true, subtree: true, attributeFilter: ['hidden', 'class', 'aria-selected'] });
}

function polishTurnaround() {
  const card = document.querySelector('[data-page="ground"] .turnaround-card');
  const status = document.getElementById('turnaround-status');
  const stage = document.getElementById('turnaround-stage');
  const progress = document.getElementById('turnaround-progress');
  const bar = document.getElementById('turnaround-progress-bar');
  const next = document.getElementById('turnaround-next');
  if (!card || !status || !stage || !progress || !bar) return;
  const inactive = isTurnaroundInactive(status.textContent, stage.textContent);
  card.classList.toggle('turnaround-inactive', inactive);
  if (!inactive) return;
  if (progress.textContent !== '—') progress.textContent = '—';
  if (bar.style.width !== '0%') bar.style.width = '0%';
  if (next && !next.textContent.trim()) next.textContent = '—';
}

function polishGroundOverview() {
  const overview = document.querySelector('[data-page="ground"] .ground-overview');
  if (!overview) return;
  const installed = /ERKANNT|INSTALLED/i.test(document.getElementById('gsx-install')?.textContent || '');
  const simOnline = /ONLINE/i.test(document.getElementById('gsx-sim')?.textContent || '');
  overview.classList.toggle('gsx-installed', installed);
  overview.classList.toggle('sim-online', simOnline);

  const payload = document.querySelector('[data-page="ground"] .gsx-payload-card');
  if (payload) {
    const target = document.getElementById('gsx-pax-target')?.textContent?.trim() || '—';
    const boarded = document.getElementById('gsx-pax-progress')?.textContent?.trim() || '—';
    const cargo = document.getElementById('gsx-cargo-progress')?.textContent?.trim() || '—';
    const empty = ['—', '0'].includes(target) && ['—', '0'].includes(boarded) && ['—', '0 %', '0%'].includes(cargo);
    payload.classList.toggle('payload-empty', empty);
  }
}

function polishLiveTrafficEmptyState() {
  const list = document.getElementById('flightboard-list');
  const status = document.getElementById('flightboard-status-pill');
  if (!list || !status || !/SIM OFFLINE/i.test(status.textContent || '')) return;
  const empty = list.querySelector('.empty-list');
  if (!empty || empty.classList.contains('traffic-offline-state')) return;
  empty.classList.add('traffic-offline-state');
  empty.replaceChildren(
    textNode('i', 'traffic-offline-icon', 'SIM'),
    textNode('strong', '', 'MSFS ist nicht verbunden'),
    textNode('span', '', 'Starte Microsoft Flight Simulator und lade einen Flug. Flight Deck verbindet sich danach automatisch über SimConnect.'),
  );
}

const CURRENT_CHANGELOG = [
  {
    version: '1.7.17',
    title: 'UI-Polish, Ground Services und Settings',
    bullets: [
      'GSX Remote wechselt jetzt wirklich zwischen Overview und Remote statt beide Bereiche untereinander anzuzeigen.',
      'Turnaround zeigt während des Flugs keinen irreführenden 100-%-Fortschritt mehr; der Koordinator ist außerhalb der Bodenphasen bewusst inaktiv.',
      'Live Traffic hat einen klaren SimConnect-Offlinestatus statt einer markierten Textzeile.',
      'Aircraft & EFB merkt sich Fenix, PMDG oder Adapter Status und springt bei Live-Updates nicht mehr zurück zu Fenix.',
      'Settings wurden logisch neu geordnet: Setup und Updates gleich groß oben, Changelog breit, Rechtliches breit und ältere Versionen in einem eigenen Dialog.',
      'Eingabefelder, Selects und Textareas verwenden jetzt appweit ein einheitliches modernes EFB-Design.',
      'Taxi Airport Focus verdeckt die Umgebung sauberer statt sie nur grau durchscheinen zu lassen.',
      'GSX-Overview wurde verdichtet: erledigte Installationsschritte verschwinden, unnötige Installer-Aktionen werden nach erkannter Installation reduziert und leere Payload-Daten kompakter dargestellt.',
      'Updater-Release-Notes dekodieren HTML-Entities und behalten sichtbare Bullet-Strukturen für zukünftige Updates.',
    ],
  },
  {
    version: '1.7.16',
    title: 'Ground Services und GSX Remote',
    bullets: [
      'Ground Services nutzt ein breiteres Dashboard für GSX, Turnaround, Safety, Payload und Live Services.',
      'Die offizielle GSX Pro Web Remote kann als eigener Workspace im EFB geöffnet werden.',
      'GSX Remote verwendet standardmäßig den Flight-Deck-Windows-Host auf Port 8744 und unterstützt abweichende Adressen.',
    ],
  },
];

function changelogSection(entry) {
  const section = document.createElement('section');
  section.dataset.version = entry.version;
  section.append(textNode('b', '', entry.version));
  const copy = document.createElement('div');
  copy.append(textNode('strong', '', entry.title));
  const list = document.createElement('ul');
  for (const bullet of entry.bullets) list.append(textNode('li', '', bullet));
  copy.append(list);
  section.append(copy);
  return section;
}

function ensureChangelogDialog() {
  let dialog = document.getElementById(CHANGELOG_DIALOG_ID);
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = CHANGELOG_DIALOG_ID;
  dialog.className = 'modal changelog-modal';
  const shell = document.createElement('div');
  shell.className = 'modal-shell changelog-modal-shell';
  const close = textNode('button', 'modal-close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Schließen');
  close.addEventListener('click', () => dialog.close?.());
  const heading = document.createElement('div');
  heading.className = 'modal-heading changelog-modal-heading';
  const icon = textNode('span', 'modal-icon', '↺');
  const headingCopy = document.createElement('div');
  headingCopy.append(textNode('small', '', 'FLIGHT DECK EFB'), textNode('h2', '', 'Ältere Updates'));
  heading.append(icon, headingCopy);
  const content = document.createElement('div');
  content.className = 'changelog-modal-content update-changelog';
  shell.append(close, heading, content);
  dialog.append(shell);
  document.body.append(dialog);
  return dialog;
}

function enhanceSettings() {
  const page = document.querySelector('[data-page="settings"]');
  const grid = page?.querySelector('.settings-grid');
  if (!page || !grid) return;
  page.classList.add('settings-polished');

  const changelogCard = grid.querySelector('.update-changelog-card');
  const changelog = changelogCard?.querySelector('.update-changelog');
  if (changelog && !changelog.dataset.uiPolished) {
    changelog.dataset.uiPolished = '1';
    for (const entry of [...CURRENT_CHANGELOG].reverse()) {
      const exists = [...changelog.querySelectorAll(':scope > section > b')].some((node) => node.textContent.trim() === entry.version);
      if (!exists) changelog.prepend(changelogSection(entry));
    }

    const sections = [...changelog.querySelectorAll(':scope > section')];
    sections.forEach((section, index) => { section.hidden = index >= 2; });
    const older = sections.slice(2);
    if (older.length) {
      const actions = textNode('div', 'changelog-card-actions');
      const button = textNode('button', 'secondary-card-action', `ÄLTERE VERSIONEN (${older.length})`);
      button.type = 'button';
      button.addEventListener('click', () => {
        const dialog = ensureChangelogDialog();
        const content = dialog.querySelector('.changelog-modal-content');
        content.replaceChildren(...older.map((section) => {
          const clone = section.cloneNode(true);
          clone.hidden = false;
          return clone;
        }));
        if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
        else dialog.setAttribute('open', '');
      });
      actions.append(button);
      changelogCard.append(actions);
    }
  }

  const updatesCard = document.getElementById('settings-updates');
  const setupCard = grid.querySelector('.setup-assistant-card');
  setupCard?.classList.add('settings-primary-tile');
  updatesCard?.classList.add('settings-primary-tile');

  const flightCards = [...grid.querySelectorAll('[data-settings-panel="flight"]')];
  for (const card of flightCards) {
    if (/Operational alerts/i.test(card.querySelector('h2')?.textContent || '')) card.classList.add('settings-alerts-card');
  }
  const systemCards = [...grid.querySelectorAll('[data-settings-panel="system"]')];
  for (const card of systemCards) {
    const heading = card.querySelector('h2')?.textContent || '';
    if (/Connector configuration/i.test(heading)) card.classList.add('settings-connector-config');
    if (/Data sources/i.test(heading)) card.classList.add('settings-data-sources');
  }
}

function polishUpdateDialog() {
  const notes = document.getElementById('update-dialog-notes');
  if (!notes) return;
  for (const heading of notes.querySelectorAll('.update-note-heading')) {
    const decoded = decodeBasicEntities(heading.textContent || '');
    if (heading.textContent !== decoded) heading.textContent = decoded;
  }
  for (const paragraph of notes.querySelectorAll('p')) {
    const decoded = decodeBasicEntities(paragraph.textContent || '');
    if (paragraph.textContent !== decoded) paragraph.textContent = decoded;
  }
  for (const item of notes.querySelectorAll('li')) {
    const decoded = decodeBasicEntities(item.textContent || '');
    if (item.textContent !== decoded) item.textContent = decoded;
  }
}

function installGeneralObserver() {
  let scheduled = false;
  const run = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      polishTurnaround();
      polishGroundOverview();
      polishLiveTrafficEmptyState();
      polishUpdateDialog();
    });
  };
  const observer = new MutationObserver(run);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  run();
}

function start() {
  document.documentElement.classList.add('ui-polish-v2');
  enhanceAircraftPage();
  enhanceSettings();
  installGeneralObserver();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
