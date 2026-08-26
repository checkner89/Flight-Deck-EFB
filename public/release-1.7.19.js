(() => {
  'use strict';

  const ROOT = document.documentElement;
  const FOCUS_STORAGE_KEY = 'flight-deck-focus-mode';

  function focusEnabled() {
    return ROOT.dataset.focusMode === 'true';
  }

  function syncFocusButton(button) {
    if (!button) return;
    const active = focusEnabled();
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
    button.title = active ? 'Fokusmodus beenden' : 'Fokusmodus aktivieren';
    const label = button.querySelector('span');
    if (label) label.textContent = active ? 'FOCUS ON' : 'FOCUS';
  }

  function toggleFocus() {
    const nativeButton = document.getElementById('focus-mode-button');
    if (nativeButton) {
      nativeButton.click();
      return;
    }
    const next = !focusEnabled();
    ROOT.dataset.focusMode = String(next);
    localStorage.setItem(FOCUS_STORAGE_KEY, String(next));
  }

  function ensureFocusButton() {
    const actions = document.querySelector('#app-toolbar .app-toolbar-actions');
    if (!actions || actions.querySelector('.release-focus-toggle')) return null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'release-focus-toggle';
    button.setAttribute('aria-label', 'Fokusmodus umschalten');
    button.innerHTML = '<span>FOCUS</span>';
    button.addEventListener('click', toggleFocus);
    const context = actions.querySelector('#app-toolbar-context');
    actions.insertBefore(button, context || null);
    syncFocusButton(button);
    return button;
  }

  function initialize() {
    const button = ensureFocusButton();
    const observer = new MutationObserver(() => syncFocusButton(button || document.querySelector('.release-focus-toggle')));
    observer.observe(ROOT, { attributes: true, attributeFilter: ['data-focus-mode'] });
    const toolbarObserver = new MutationObserver(() => ensureFocusButton());
    toolbarObserver.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
