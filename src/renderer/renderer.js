'use strict';

const els = {
  appVersion: document.getElementById('appVersion'),
  simconnectBadge: document.getElementById('simconnectBadge'),
  simconnectDetail: document.getElementById('simconnectDetail'),
  simconnectTechnical: document.getElementById('simconnectTechnical'),
  simconnectMeta: document.getElementById('simconnectMeta'),
  simconnectApplication: document.getElementById('simconnectApplication'),
  retrySimConnect: document.getElementById('retrySimConnect'),
  retryHint: document.getElementById('retryHint'),
  updateBadge: document.getElementById('updateBadge'),
  updateDetail: document.getElementById('updateDetail'),
  updateProgressWrap: document.getElementById('updateProgressWrap'),
  updateProgress: document.getElementById('updateProgress'),
  updatePercent: document.getElementById('updatePercent'),
  checkUpdates: document.getElementById('checkUpdates'),
  installUpdate: document.getElementById('installUpdate')
};

const badgeMap = {
  disconnected: ['GETRENNT', 'badge--warning'],
  connecting: ['VERBINDET …', 'badge--info'],
  connected: ['VERBUNDEN', 'badge--success'],
  error: ['FEHLER', 'badge--danger'],
  idle: ['BEREIT', 'badge--neutral'],
  checking: ['PRÜFUNG …', 'badge--info'],
  available: ['UPDATE', 'badge--info'],
  downloading: ['DOWNLOAD', 'badge--info'],
  ready: ['BEREIT', 'badge--success'],
  current: ['AKTUELL', 'badge--success'],
  development: ['DEV', 'badge--neutral']
};

function setBadge(element, status) {
  const [label, className] = badgeMap[status] || [String(status || 'STATUS').toUpperCase(), 'badge--neutral'];
  element.textContent = label;
  element.className = `badge ${className}`;
}

function renderSimConnect(state = {}) {
  setBadge(els.simconnectBadge, state.status);
  els.simconnectDetail.textContent = state.detail || 'Kein Status verfügbar.';

  const technical = state.technicalDetail?.trim();
  els.simconnectTechnical.hidden = !technical;
  els.simconnectTechnical.textContent = technical ? `Technische Diagnose: ${technical}` : '';

  const appName = state.applicationName?.trim();
  els.simconnectMeta.hidden = !appName;
  els.simconnectApplication.textContent = appName || '–';

  els.retrySimConnect.disabled = state.status === 'connecting';

  if (state.retryAt && state.status !== 'connected') {
    els.retryHint.dataset.retryAt = String(state.retryAt);
  } else {
    delete els.retryHint.dataset.retryAt;
    els.retryHint.textContent = state.attempt ? `Verbindungsversuch ${state.attempt}` : '';
  }
}

function renderRetryCountdown() {
  const retryAt = Number(els.retryHint.dataset.retryAt || 0);
  if (!retryAt) return;

  const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  els.retryHint.textContent = seconds > 0
    ? `Neuer automatischer Versuch in ${seconds} s`
    : 'Neuer Verbindungsversuch läuft …';
}

function renderUpdate(state = {}) {
  setBadge(els.updateBadge, state.status);
  els.updateDetail.textContent = state.detail || 'Kein Status verfügbar.';

  const percent = Number.isFinite(state.percent) ? Math.max(0, Math.min(100, state.percent)) : null;
  els.updateProgressWrap.hidden = percent === null;
  if (percent !== null) {
    els.updateProgress.style.width = `${percent}%`;
    els.updatePercent.textContent = `${Math.round(percent)} %`;
  }

  els.checkUpdates.disabled = ['checking', 'downloading'].includes(state.status);
  els.installUpdate.hidden = state.status !== 'ready';
}

async function bootstrap() {
  els.appVersion.textContent = await window.flightDeck.getVersion();

  renderSimConnect(await window.flightDeck.getSimConnectStatus());
  renderUpdate(await window.flightDeck.getUpdateStatus());

  window.flightDeck.onSimConnectStatus(renderSimConnect);
  window.flightDeck.onUpdateStatus(renderUpdate);

  els.retrySimConnect.addEventListener('click', async () => {
    els.retrySimConnect.disabled = true;
    renderSimConnect(await window.flightDeck.retrySimConnect());
  });

  els.checkUpdates.addEventListener('click', async () => {
    els.checkUpdates.disabled = true;
    const result = await window.flightDeck.checkForUpdates();
    if (result?.status) renderUpdate(result);
  });

  els.installUpdate.addEventListener('click', async () => {
    els.installUpdate.disabled = true;
    await window.flightDeck.installUpdate();
  });

  renderRetryCountdown();
  setInterval(renderRetryCountdown, 500);
}

bootstrap().catch((error) => {
  console.error('Renderer bootstrap failed', error);
});
