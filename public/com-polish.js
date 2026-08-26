export function parseComFrequency(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(',', '.').replace(/[^0-9.]/g, '');
  if (!normalized || (normalized.match(/\./g) || []).length > 1) return null;
  const frequency = Number(normalized);
  if (!Number.isFinite(frequency) || frequency < 118 || frequency > 136.99) return null;
  return Math.round(frequency * 1000) / 1000;
}

export function formatComFrequency(value) {
  const frequency = parseComFrequency(value);
  return frequency === null ? '—' : frequency.toFixed(3);
}

function text(key) {
  const german = String(document.documentElement.lang || '').toLowerCase().startsWith('de');
  const labels = german ? {
    click: 'Klicken: auf COM1 Standby setzen',
    offline: 'MSFS ist offline. Frequenz wurde in COM1 vorbereitet und kann nach der Verbindung gesetzt werden.',
    staged: 'Frequenz für COM1 vorbereitet.',
    invalid: 'Bitte eine gültige COM-Frequenz zwischen 118.000 und 136.990 MHz eingeben.',
    enter: 'Enter setzt die Frequenz auf Standby.',
    active: 'Aktiv',
    standby: 'Standby',
  } : {
    click: 'Click: set on COM1 standby',
    offline: 'MSFS is offline. The frequency was staged in COM1 and can be set after reconnecting.',
    staged: 'Frequency staged for COM1.',
    invalid: 'Enter a valid COM frequency between 118.000 and 136.990 MHz.',
    enter: 'Press Enter to set the frequency on standby.',
    active: 'Active',
    standby: 'Standby',
  };
  return labels[key] || key;
}

function setMessage(message, state = '') {
  const target = document.querySelector('#com-message');
  if (!target) return;
  target.textContent = message || '';
  target.dataset.state = state;
}

function inputFor(com = 1) {
  return document.querySelector(`#com${com}-frequency-input`);
}

function standbyButton(com = 1) {
  return document.querySelector(`[data-com-action="set"][data-com="${com}"][data-mode="standby"]`);
}

function simulatorOnline() {
  const pill = document.querySelector('#com-status-pill');
  if (!pill) return false;
  return pill.classList.contains('connected') || /SIM\s+ONLINE/i.test(pill.textContent || '');
}

function stageFrequency(value, com = 1) {
  const frequency = parseComFrequency(value);
  if (frequency === null) {
    setMessage(text('invalid'), 'error');
    return false;
  }
  const input = inputFor(com);
  if (!input) return false;
  input.value = frequency.toFixed(3);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.classList.remove('com-input-invalid');
  input.classList.add('com-input-staged');
  setMessage(simulatorOnline() ? text('staged') : text('offline'), simulatorOnline() ? 'ready' : 'waiting');
  return true;
}

function activatePreset(row, preferredCom = 1) {
  const frequency = parseComFrequency(row?.dataset.frequency || row?.querySelector('strong')?.textContent);
  if (frequency === null) return;
  const buttons = [...row.querySelectorAll('button')];
  const requested = buttons.find((button) => button.textContent?.includes(`COM${preferredCom}`)) || buttons[0];
  if (requested && !requested.disabled) {
    requested.click();
    return;
  }
  stageFrequency(frequency, preferredCom);
}

function markCurrentPreset(row) {
  const frequency = parseComFrequency(row.dataset.frequency || row.querySelector('strong')?.textContent);
  row.classList.remove('is-active-frequency', 'is-standby-frequency');
  row.removeAttribute('data-radio-state');
  if (frequency === null) return;
  const active = [1, 2].some((com) => parseComFrequency(document.querySelector(`#com${com}-active`)?.textContent) === frequency);
  const standby = [1, 2].some((com) => parseComFrequency(document.querySelector(`#com${com}-standby`)?.textContent) === frequency);
  if (active) {
    row.classList.add('is-active-frequency');
    row.dataset.radioState = text('active');
  } else if (standby) {
    row.classList.add('is-standby-frequency');
    row.dataset.radioState = text('standby');
  }
}

function decoratePresetRows() {
  const container = document.querySelector('#com-frequency-presets');
  if (!container) return;
  for (const row of container.querySelectorAll('.com-preset-row')) {
    const copy = row.querySelector(':scope > span');
    const frequency = parseComFrequency(copy?.querySelector('strong')?.textContent);
    if (frequency !== null) row.dataset.frequency = frequency.toFixed(3);
    markCurrentPreset(row);
    if (copy && copy.dataset.comPolished !== '1') {
      copy.dataset.comPolished = '1';
      copy.setAttribute('role', 'button');
      copy.tabIndex = 0;
      copy.title = text('click');
      copy.setAttribute('aria-label', `${formatComFrequency(frequency)} MHz. ${text('click')}`);
      copy.addEventListener('click', () => activatePreset(row, 1));
      copy.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activatePreset(row, 1);
      });
    }
    const buttons = [...row.querySelectorAll('button')];
    for (const [buttonIndex, button] of buttons.entries()) {
      const com = buttonIndex + 1;
      button.title = button.disabled
        ? `COM${com}: MSFS verbinden, um ${formatComFrequency(frequency)} MHz auf Standby zu setzen.`
        : `COM${com}: ${formatComFrequency(frequency)} MHz auf Standby setzen.`;
    }
  }
}

function normalizeDisplays() {
  for (const id of ['com1-active', 'com1-standby', 'com2-active', 'com2-standby']) {
    const element = document.getElementById(id);
    if (!element) continue;
    const raw = String(element.textContent || '').trim();
    if (!raw || raw === '0.000' || raw === '0' || raw === '—') {
      if (element.textContent !== '—') element.textContent = '—';
      element.classList.add('com-frequency-empty');
    } else {
      element.classList.remove('com-frequency-empty');
    }
  }
}

function wireInputs() {
  for (const com of [1, 2]) {
    const input = inputFor(com);
    if (!input || input.dataset.comPolished === '1') continue;
    input.dataset.comPolished = '1';
    input.title = text('enter');
    input.addEventListener('input', () => {
      input.classList.remove('com-input-staged');
      const raw = String(input.value || '').trim();
      input.classList.toggle('com-input-invalid', Boolean(raw) && parseComFrequency(raw) === null);
    });
    input.addEventListener('blur', () => {
      const frequency = parseComFrequency(input.value);
      if (frequency !== null) input.value = frequency.toFixed(3);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const frequency = parseComFrequency(input.value);
      if (frequency === null) {
        input.classList.add('com-input-invalid');
        setMessage(text('invalid'), 'error');
        return;
      }
      const button = standbyButton(com);
      if (button && !button.disabled) {
        button.click();
      } else {
        stageFrequency(frequency, com);
      }
    });
  }
}

function decorateNextStation() {
  const frequencyElement = document.querySelector('#com-next-frequency');
  const tuneButton = document.querySelector('#com-next-tune');
  if (!frequencyElement) return;
  const frequency = parseComFrequency(frequencyElement.textContent);
  const available = frequency !== null;
  frequencyElement.classList.toggle('is-clickable', available);
  frequencyElement.tabIndex = available ? 0 : -1;
  frequencyElement.setAttribute('role', available ? 'button' : 'status');
  if (!available || frequencyElement.dataset.comPolished === '1') return;
  frequencyElement.dataset.comPolished = '1';
  const activate = () => {
    const current = parseComFrequency(frequencyElement.textContent);
    if (current === null) return;
    if (tuneButton && !tuneButton.disabled) tuneButton.click();
    else stageFrequency(current, 1);
  };
  frequencyElement.addEventListener('click', activate);
  frequencyElement.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    activate();
  });
}

let refreshQueued = false;
function refreshComPolish() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    normalizeDisplays();
    wireInputs();
    decoratePresetRows();
    decorateNextStation();
  });
}

function startComPolish() {
  const page = document.querySelector('[data-page="com"]');
  if (!page) return;
  refreshComPolish();
  const observer = new MutationObserver(refreshComPolish);
  observer.observe(page, { childList: true, subtree: true, characterData: true });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startComPolish, { once: true });
  else startComPolish();
}
