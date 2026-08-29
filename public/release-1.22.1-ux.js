(() => {
  'use strict';

  const VERSION = '1.22.1';
  const STORAGE_LAST_MODULE = 'flight-deck-last-module';
  const MODULE_LABELS = {
    taxi: 'Taxi', flight: 'Flug & Tracking', briefing: 'Briefing', com: 'COM',
    flightboard: 'Flightboard', atc: 'ATC', ground: 'Ground Services', fenix: 'Aircraft Adapters',
    files: 'Files', news: 'News', settings: 'Settings',
  };

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const visible = (element) => Boolean(element && !element.hidden && element.getClientRects().length);

  function ensureToastStack() {
    let stack = qs('#fd123-toast-stack');
    if (stack) return stack;
    stack = document.createElement('div');
    stack.id = 'fd123-toast-stack';
    stack.className = 'fd123-toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'false');
    document.body.append(stack);
    return stack;
  }

  function announce(message, kind = 'info', duration = 2600) {
    if (!message) return;
    const stack = ensureToastStack();
    const toast = document.createElement('div');
    toast.className = `fd123-toast ${kind}`;
    toast.innerHTML = `<i aria-hidden="true"></i><span>${String(message).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c])}</span>`;
    stack.append(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    window.setTimeout(() => {
      toast.classList.remove('show');
      window.setTimeout(() => toast.remove(), 180);
    }, duration);
  }

  function moduleButton(module) {
    return qs(`[data-open-module="${CSS.escape(module)}"]`);
  }

  function openModule(module, { remember = true } = {}) {
    const button = moduleButton(module);
    if (!button || button.disabled) {
      announce(`${MODULE_LABELS[module] || module} ist derzeit nicht verfügbar.`, 'warning');
      return false;
    }
    if (remember) localStorage.setItem(STORAGE_LAST_MODULE, module);
    button.click();
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        const page = qs(`.efb-page[data-page="${CSS.escape(module)}"]`);
        const heading = page && (qs('h1', page) || qs('h2', page));
        if (heading) {
          heading.setAttribute('tabindex', '-1');
          heading.focus({ preventScroll: true });
        }
      }, 80);
    });
    return true;
  }

  function installResumeAction() {
    const header = qs('.home-launcher-heading');
    const actions = qs('.home-heading-actions', header || document);
    if (!header || !actions || qs('#fd123-resume-module')) return;
    const last = localStorage.getItem(STORAGE_LAST_MODULE);
    if (!last || last === 'home' || !moduleButton(last)) return;
    const button = document.createElement('button');
    button.id = 'fd123-resume-module';
    button.className = 'secondary-card-action fd123-resume-module';
    button.type = 'button';
    button.innerHTML = `<span>WEITER</span><strong>${MODULE_LABELS[last] || last}</strong>`;
    button.title = `Zuletzt verwendetes Modul öffnen: ${MODULE_LABELS[last] || last}`;
    button.addEventListener('click', () => openModule(last));
    actions.prepend(button);
  }

  const PAGE_ACTIONS = {
    flight: [['briefing', 'BRIEFING'], ['taxi', 'TAXI']],
    briefing: [['flight', 'FLUG'], ['ground', 'GROUND']],
    ground: [['taxi', 'TAXI'], ['flight', 'FLUG']],
    com: [['atc', 'ATC'], ['flight', 'FLUG']],
    atc: [['com', 'COM'], ['flight', 'FLUG']],
    flightboard: [['flight', 'FLUG'], ['taxi', 'TAXI']],
    news: [['flight', 'FLUG']],
    files: [['briefing', 'BRIEFING'], ['flight', 'FLUG']],
  };

  function installContextActions() {
    qsa('.efb-page[data-page]').forEach((page) => {
      const pageName = page.dataset.page;
      if (!pageName || pageName === 'home' || qs('.fd123-context-actions', page)) return;
      const heading = qs('.page-heading, .briefing-heading, .ground-heading, header', page);
      if (!heading) return;
      const bar = document.createElement('nav');
      bar.className = 'fd123-context-actions';
      bar.setAttribute('aria-label', 'Schnellnavigation');
      const home = document.createElement('button');
      home.type = 'button';
      home.className = 'fd123-context-home';
      home.textContent = '⌂ HOME';
      home.addEventListener('click', () => openModule('home', { remember: false }) || qs('[data-page="home"]')?.removeAttribute('hidden'));
      bar.append(home);
      for (const [target, label] of PAGE_ACTIONS[pageName] || []) {
        if (!moduleButton(target)) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => openModule(target));
        bar.append(button);
      }
      heading.append(bar);
    });
  }

  function installActionFeedback() {
    const feedback = new Map([
      ['#home-new-flight', ['Neuer Flug wird vorbereitet …', 'info']],
      ['#warning-new-flight', ['Neuer Flug wird vorbereitet …', 'info']],
      ['#home-simbrief-import', ['SimBrief OFP wird geladen …', 'info']],
      ['#find-routes', ['Taxi-Routen werden berechnet …', 'info']],
      ['#start-guidance', ['Taxi Guidance gestartet.', 'success']],
      ['#clear-plan', ['Taxi-Route wurde zurückgesetzt.', 'success']],
      ['#refresh-map-button', ['Airport-Karte wird aktualisiert …', 'info']],
      ['#fit-button', ['Gesamte Taxi-Route wird angezeigt.', 'info']],
    ]);
    for (const [selector, [message, kind]] of feedback) {
      const button = qs(selector);
      if (!button || button.dataset.fd123Feedback === '1') continue;
      button.dataset.fd123Feedback = '1';
      button.addEventListener('click', () => {
        if (!button.disabled && button.getAttribute('aria-disabled') !== 'true') announce(message, kind);
      });
    }
  }

  function installModuleMemory() {
    document.addEventListener('click', (event) => {
      const opener = event.target.closest('[data-open-module]');
      const module = opener?.dataset.openModule;
      if (module && !opener.disabled) localStorage.setItem(STORAGE_LAST_MODULE, module);
    }, true);
  }

  function closeTopLayer() {
    const dialog = qsa('dialog[open]').filter(visible).at(-1);
    if (dialog) {
      dialog.close();
      announce('Dialog geschlossen.');
      return true;
    }
    const drawer = qsa('.news-drawer, .modal, .overlay, [role="dialog"]').filter(visible).at(-1);
    if (!drawer) return false;
    const close = qs('[data-close], .close, .modal-close, .drawer-close, button[aria-label*="schließ" i], button[aria-label*="close" i]', drawer);
    if (close) {
      close.click();
      return true;
    }
    return false;
  }

  function installKeyboardUX() {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (closeTopLayer()) event.preventDefault();
    });
  }

  function improveEmptyStates() {
    const empty = qs('#empty-state');
    const action = qs('#open-plan-empty');
    if (empty && action && !qs('.fd123-empty-hint', empty)) {
      const hint = document.createElement('small');
      hint.className = 'fd123-empty-hint';
      hint.textContent = 'Tipp: Du kannst den Taxiweg vollständig ohne aktive Simulatorverbindung vorbereiten.';
      action.insertAdjacentElement('afterend', hint);
    }
    qsa('.fd122-profile-empty').forEach((node) => {
      if (node.dataset.fd123Enhanced) return;
      node.dataset.fd123Enhanced = '1';
      node.setAttribute('role', 'status');
    });
  }

  function improveDisabledControls() {
    qsa('button:disabled, [aria-disabled="true"]').forEach((button) => {
      if (button.title) return;
      if (button.matches('#start-guidance')) button.title = 'Wähle zuerst eine Taxi-Route.';
      else if (button.matches('[data-app-id="charts"]')) button.title = 'Charts sind derzeit noch nicht verfügbar.';
    });
  }

  function monitorOperationalFeedback() {
    const targets = [
      ['#planner-message', 'Taxi'],
      ['#map-status-text', 'Karte'],
      ['#pair-error', 'Verbindung'],
    ];
    for (const [selector, label] of targets) {
      const node = qs(selector);
      if (!node || node.dataset.fd123Observed) continue;
      node.dataset.fd123Observed = '1';
      let previous = node.textContent.trim();
      new MutationObserver(() => {
        const current = node.textContent.trim();
        if (!current || current === previous) return;
        previous = current;
        const lower = current.toLowerCase();
        if (lower.includes('fehler') || lower.includes('nicht') || lower.includes('failed')) announce(`${label}: ${current}`, 'warning', 4200);
      }).observe(node, { childList: true, subtree: true, characterData: true });
    }
  }

  function enhance() {
    ensureToastStack();
    installResumeAction();
    installContextActions();
    installActionFeedback();
    improveEmptyStates();
    improveDisabledControls();
    monitorOperationalFeedback();
  }

  installModuleMemory();
  installKeyboardUX();
  enhance();
  const observer = new MutationObserver(() => enhance());
  observer.observe(document.body, { childList: true, subtree: true });
  window.FlightDeckUX123 = { version: VERSION, announce, openModule, refresh: enhance };
})();
