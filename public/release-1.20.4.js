const FD24_ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5V20H4z"/><path d="M9 20v-5h6v5"/>',
  flight: '<path d="M4 18h16M7 15V6h10v9M10 10h4"/><path d="m12 2 2 4h-4z"/>',
  docs: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
  taxi: '<path d="M4 16h11V9H9l-3 4H4zM15 12h3l2 3v1h-5"/><circle cx="8" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  com: '<path d="M5 8h14v10H5zM8 8l2-4h4l2 4M8 12h5M8 15h3"/><circle cx="16.5" cy="14.5" r="1.5"/>',
  map: '<path d="m4 6 5-2 6 2 5-2v14l-5 2-6-2-5 2zM9 4v14m6-12v14"/>',
  apps: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.4 3h-4.8L9 6.1a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.8 1l.6 3.1h4.8l.6-3.1a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/>',
  theme: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${FD24_ICONS[name] || FD24_ICONS.apps}</svg>`;
}

function navigate(module) {
  if (module === 'documents') {
    const launcher = document.querySelector('[data-fd-docs-launcher]');
    if (launcher) launcher.click();
    return;
  }
  window.dispatchEvent(new CustomEvent('flightdeck:navigate', { detail: { module } }));
}

function setActive(module) {
  const normalized = module === 'tracking' ? 'map' : module === 'home' ? 'home' : module;
  document.querySelectorAll('.fd-global-rail [data-fd24-module]').forEach((button) => {
    const target = button.dataset.fd24Module;
    button.classList.toggle('active', target === normalized || (target === 'apps' && normalized === 'home'));
  });
}

function installRail() {
  if (document.querySelector('.fd-global-rail')) return;
  const rail = document.createElement('nav');
  rail.className = 'fd-global-rail';
  rail.setAttribute('aria-label', 'Flight Deck navigation');
  const items = [
    ['home', 'home', 'Home'],
    ['flight', 'flight', 'Flight'],
    ['documents', 'docs', 'OFP & Docs'],
    ['taxi', 'taxi', 'Taxi'],
    ['com', 'com', 'COM'],
    ['map', 'map', 'Live Map'],
    ['apps', 'apps', 'Apps'],
    ['settings', 'settings', 'Settings'],
  ];
  for (const [module, glyph, label] of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.fd24Module = module;
    button.title = label;
    button.innerHTML = `${icon(glyph)}<span>${label}</span>`;
    button.addEventListener('click', () => navigate(module === 'map' ? 'tracking' : module === 'apps' ? 'home' : module));
    rail.append(button);
  }
  const spacer = document.createElement('span');
  spacer.className = 'fd-rail-spacer';
  rail.insertBefore(spacer, rail.lastElementChild);
  const theme = document.createElement('button');
  theme.type = 'button';
  theme.className = 'fd-rail-theme';
  theme.title = 'Light / Dark Mode';
  theme.innerHTML = `${icon('theme')}<span>Theme</span>`;
  theme.addEventListener('click', () => document.getElementById('quick-theme-toggle')?.click());
  rail.append(theme);
  document.body.append(rail);
  setActive(document.documentElement.dataset.flightdeckModule || 'home');
}

window.addEventListener('flightdeck:modulechange', (event) => setActive(event.detail?.module || 'home'));
window.addEventListener('flightdeck:documents-open', () => setActive('documents'));
window.addEventListener('flightdeck:documents-close', () => setActive(document.documentElement.dataset.flightdeckModule || 'home'));

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installRail, { once: true });
else installRail();
