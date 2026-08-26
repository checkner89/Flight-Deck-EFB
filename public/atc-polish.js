const ATC_PAGE_SELECTOR = '[data-page="atc"]';
const SI_CONTROLS_SELECTOR = '#si-atc-operations';

function activeAtcTab(page) {
  return page?.querySelector('.atc-subnav [data-atc-tab].active')?.dataset.atcTab || 'clearance';
}

export function arrangeSiAtcControls(root = document) {
  const page = root.querySelector?.(ATC_PAGE_SELECTOR) || document.querySelector(ATC_PAGE_SELECTOR);
  if (!page) return false;
  const layout = page.querySelector('.combined-atc-layout, .atc-layout, .atc-center-layout, .atc-page-layout');
  const card = page.querySelector(SI_CONTROLS_SELECTOR);
  if (!layout || !card) return false;

  card.dataset.atcPanel = 'clearance';
  card.setAttribute('aria-label', 'SayIntentions session controls');

  const compatibility = layout.querySelector('.atc-compatibility-note[data-atc-panel="clearance"], .atc-compatibility-note');
  if (compatibility && card.nextElementSibling !== compatibility) {
    layout.insertBefore(card, compatibility);
  }

  card.hidden = activeAtcTab(page) !== 'clearance';
  return true;
}

let observer = null;

function scheduleArrange() {
  queueMicrotask(() => arrangeSiAtcControls());
}

function start() {
  arrangeSiAtcControls();

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-atc-tab]')) scheduleArrange();
  });

  observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length || mutation.removedNodes.length)) {
      arrangeSiAtcControls();
    }
  });

  const page = document.querySelector(ATC_PAGE_SELECTOR);
  observer.observe(page || document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
