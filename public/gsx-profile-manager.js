(() => {
  'use strict';

  const DB_NAME = 'flight-deck-gsx-profiles';
  const DB_STORE = 'handles';
  const PROFILE_DIR_KEY = 'profile-directory';
  const COMMUNITY_DIR_KEY = 'community-directory';
  const HANDLER_DIR_KEY = 'handler-lib-directory';
  const IGNORED_KEY = 'flight-deck-gsx-profile-ignored';
  const PAGE_ID = 'gsxprofiles';
  const PROFILE_EXTENSIONS = new Set(['.ini', '.py']);
  const ICAO_BLACKLIST = new Set(['MSFS', 'ASOB', 'PACK', 'SCEN', 'AERO', 'CITY', 'WORLD', 'PORT', 'SIMU', 'FLIG']);

  const state = {
    profileHandle: null,
    communityHandle: null,
    handlerHandle: null,
    profiles: [],
    airports: [],
    ignored: loadIgnored(),
    importCandidates: [],
    importSourceName: '',
    filter: 'all',
    search: '',
    busy: false,
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function loadIgnored() {
    try {
      const parsed = JSON.parse(localStorage.getItem(IGNORED_KEY) || '[]');
      return new Set(Array.isArray(parsed) ? parsed.map((value) => String(value).toUpperCase()) : []);
    } catch {
      return new Set();
    }
  }

  function saveIgnored() {
    localStorage.setItem(IGNORED_KEY, JSON.stringify([...state.ignored].sort()));
  }

  function extname(filename) {
    const index = String(filename).lastIndexOf('.');
    return index >= 0 ? String(filename).slice(index).toLowerCase() : '';
  }

  function basename(filename) {
    return String(filename).replaceAll('\\', '/').split('/').filter(Boolean).at(-1) || '';
  }

  function findIcao(value) {
    const normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ');
    const matches = normalized.match(/\b[A-Z]{4}\b/g) || [];
    return matches.find((entry) => !ICAO_BLACKLIST.has(entry)) || null;
  }

  function profileVariant(pathname) {
    const value = String(pathname || '').toLowerCase();
    if (/2024|msfs\s*24|msfs2024/.test(value)) return 'MSFS 2024';
    if (/2020|msfs\s*20|msfs2020/.test(value)) return 'MSFS 2020';
    return 'Standard';
  }

  function dbOpen() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveHandle(key, handle) {
    try {
      const db = await dbOpen();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(handle, key);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } catch {
      // Directory handles are only a convenience; the manager still works without persistence.
    }
  }

  async function loadHandle(key) {
    try {
      const db = await dbOpen();
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value;
    } catch {
      return null;
    }
  }

  async function permission(handle, mode = 'read') {
    if (!handle) return false;
    try {
      const options = { mode };
      if ((await handle.queryPermission(options)) === 'granted') return true;
      return (await handle.requestPermission(options)) === 'granted';
    } catch {
      return false;
    }
  }

  function createTile() {
    const grid = document.querySelector('.app-launcher-grid');
    if (!grid || grid.querySelector('[data-app-id="gsxprofiles"]')) return;
    const button = document.createElement('button');
    button.className = 'efb-app-tile gsx-profiles-app';
    button.type = 'button';
    button.dataset.appId = 'gsxprofiles';
    button.style.order = '8';
    button.innerHTML = `
      <span class="app-tile-icon"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 11h32v26H8zM14 17h20M14 24h12M14 31h9"/><path d="M31 28v10m-5-5h10"/></svg></span>
      <span class="app-tile-copy"><small>GSX PRO · PROFILE LIBRARY</small><strong>GSX Profiles</strong><span>Profile scannen, ZIP importieren und Varianten verwalten</span></span><i class="app-open-arrow">›</i>`;
    const ground = grid.querySelector('[data-app-id="ground"]');
    if (ground?.nextSibling) grid.insertBefore(button, ground.nextSibling);
    else grid.append(button);
    button.addEventListener('click', openPage);
  }

  function createPage() {
    const pages = document.getElementById('efb-pages');
    if (!pages || pages.querySelector('[data-page="gsxprofiles"]')) return;
    const page = document.createElement('section');
    page.className = 'efb-page gsx-profiles-page';
    page.dataset.page = PAGE_ID;
    page.hidden = true;
    page.innerHTML = `
      <header class="page-heading gsx-profile-heading">
        <div><small>GSX PRO · LOCAL PROFILE LIBRARY</small><h1>GSX Profile Manager</h1><p>Lokale GSX-Airportprofile prüfen und Profile aus ZIP-Dateien sicher in deine GSX-Ordner installieren.</p></div>
        <span id="gsxp-status" class="module-status waiting">SETUP</span>
      </header>

      <section class="gsxp-stats" aria-label="GSX Profilstatus">
        <article><small>ERKANNTE AIRPORTS</small><strong id="gsxp-total-airports">0</strong><span>Community-Scan</span></article>
        <article><small>MIT PROFIL</small><strong id="gsxp-installed-count">0</strong><span>GSX Profile</span></article>
        <article><small>OHNE PROFIL</small><strong id="gsxp-missing-count">0</strong><span>mögliche Treffer</span></article>
        <article><small>IGNORIERT</small><strong id="gsxp-ignored-count">0</strong><span>lokal ausgeblendet</span></article>
      </section>

      <div class="gsxp-layout">
        <article class="efb-card gsxp-setup-card">
          <div class="section-title"><div><small>ONE-TIME SETUP</small><h2>Ordner verbinden</h2></div><span id="gsxp-folder-state">LOCAL ONLY</span></div>
          <p>Flight Deck speichert nur die vom Windows-Dateidialog erteilten Ordnerberechtigungen. Keine GSX-Dateien werden hochgeladen.</p>
          <div class="gsxp-folder-list">
            <button id="gsxp-pick-profiles" type="button"><i>01</i><span><strong>GSX Profilordner</strong><small id="gsxp-profile-folder">%APPDATA%\\Virtuali\\GSX\\MSFS</small></span><b>AUSWÄHLEN</b></button>
            <button id="gsxp-pick-community" type="button"><i>02</i><span><strong>MSFS 2024 Community</strong><small id="gsxp-community-folder">Optional für Missing-Profile-Scan</small></span><b>AUSWÄHLEN</b></button>
            <button id="gsxp-pick-handlers" type="button"><i>03</i><span><strong>GSX Handler lib</strong><small id="gsxp-handler-folder">Optional · %APPDATA%\\Virtuali\\Handlers\\lib</small></span><b>AUSWÄHLEN</b></button>
          </div>
          <div class="connector-actions"><button id="gsxp-scan" class="primary-card-action" type="button">JETZT SCANNEN</button></div>
          <p id="gsxp-message" class="form-message" role="status"></p>
        </article>

        <article class="efb-card gsxp-import-card">
          <div class="section-title"><div><small>DRAG & DROP</small><h2>Profil installieren</h2></div><span>ZIP / INI / PY</span></div>
          <div id="gsxp-dropzone" class="gsxp-dropzone" tabindex="0" role="button">
            <i>＋</i><strong>GSX Profil hier ablegen</strong><span>ZIP hineinziehen oder Datei auswählen. Bei mehreren Profilen fragt Flight Deck nach der gewünschten Variante.</span>
            <button id="gsxp-browse" class="secondary-card-action" type="button">DATEI AUSWÄHLEN</button>
            <input id="gsxp-files" type="file" accept=".zip,.ini,.py,application/zip" multiple hidden>
          </div>
          <div id="gsxp-import-preview" class="gsxp-import-preview" hidden>
            <div class="section-title"><div><small>IMPORT PREVIEW</small><h3 id="gsxp-import-title">Profil auswählen</h3></div><button id="gsxp-cancel-import" class="text-mini-action" type="button">VERWERFEN</button></div>
            <div id="gsxp-candidates" class="gsxp-candidates"></div>
            <div class="gsxp-import-actions"><button id="gsxp-install" class="primary-card-action" type="button">AUSGEWÄHLTES PROFIL INSTALLIEREN</button></div>
          </div>
        </article>
      </div>

      <article class="efb-card gsxp-library-card">
        <header class="gsxp-library-toolbar">
          <div><small>LOCAL INVENTORY</small><h2>Airport Profiles</h2></div>
          <div class="gsxp-library-actions">
            <label><span class="sr-only">Suchen</span><input id="gsxp-search" type="search" placeholder="ICAO, Airport oder Add-on suchen …"></label>
            <div class="gsxp-filter" role="group" aria-label="Profilfilter">
              <button type="button" class="active" data-gsxp-filter="all">ALLE</button>
              <button type="button" data-gsxp-filter="installed">MIT PROFIL</button>
              <button type="button" data-gsxp-filter="missing">OHNE PROFIL</button>
              <button type="button" data-gsxp-filter="ignored">IGNORIERT</button>
            </div>
          </div>
        </header>
        <div class="gsxp-table-head"><span>ICAO</span><span>AIRPORT / PACKAGE</span><span>PROFILE</span><span>STATUS</span><span></span></div>
        <div id="gsxp-library" class="gsxp-library"><p class="empty-list">Verbinde zuerst deinen GSX Profilordner und starte den Scan.</p></div>
      </article>`;

    const settings = pages.querySelector('[data-page="settings"]');
    if (settings) pages.insertBefore(page, settings);
    else pages.append(page);
    wirePage(page);
  }

  function openPage() {
    const page = document.querySelector('[data-page="gsxprofiles"]');
    if (!page) return;
    document.getElementById('app')?.classList.remove('home-mode');
    const toolbar = document.getElementById('app-toolbar');
    if (toolbar) toolbar.hidden = false;
    const mapStage = document.querySelector('.map-stage');
    if (mapStage) mapStage.hidden = true;
    const pages = document.getElementById('efb-pages');
    if (pages) pages.hidden = false;
    for (const section of document.querySelectorAll('.efb-page[data-page]')) section.hidden = section !== page;
    const icon = document.getElementById('app-toolbar-icon');
    const title = document.getElementById('app-toolbar-title');
    const context = document.getElementById('app-toolbar-context');
    if (icon) icon.textContent = 'P';
    if (title) title.textContent = 'GSX Profile Manager';
    if (context) context.textContent = 'GSX PROFILES';
    const plan = document.getElementById('plan-button');
    if (plan) plan.hidden = true;
    restoreHandles().then(() => renderAll()).catch(() => {});
  }

  function wirePage(page) {
    const dropzone = page.querySelector('#gsxp-dropzone');
    const fileInput = page.querySelector('#gsxp-files');
    page.querySelector('#gsxp-browse')?.addEventListener('click', (event) => {
      event.stopPropagation();
      fileInput?.click();
    });
    dropzone?.addEventListener('click', (event) => {
      if (!event.target.closest('button')) fileInput?.click();
    });
    dropzone?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput?.click();
      }
    });
    for (const type of ['dragenter', 'dragover']) {
      dropzone?.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.add('dragging');
      });
    }
    for (const type of ['dragleave', 'drop']) {
      dropzone?.addEventListener(type, (event) => {
        event.preventDefault();
        dropzone.classList.remove('dragging');
      });
    }
    dropzone?.addEventListener('drop', (event) => handleFiles([...event.dataTransfer.files]));
    fileInput?.addEventListener('change', () => {
      handleFiles([...fileInput.files]);
      fileInput.value = '';
    });

    page.querySelector('#gsxp-pick-profiles')?.addEventListener('click', () => pickDirectory(PROFILE_DIR_KEY));
    page.querySelector('#gsxp-pick-community')?.addEventListener('click', () => pickDirectory(COMMUNITY_DIR_KEY));
    page.querySelector('#gsxp-pick-handlers')?.addEventListener('click', () => pickDirectory(HANDLER_DIR_KEY));
    page.querySelector('#gsxp-scan')?.addEventListener('click', scanAll);
    page.querySelector('#gsxp-cancel-import')?.addEventListener('click', clearImport);
    page.querySelector('#gsxp-install')?.addEventListener('click', installSelected);
    page.querySelector('#gsxp-search')?.addEventListener('input', (event) => {
      state.search = event.target.value.trim().toLowerCase();
      renderLibrary();
    });
    for (const button of page.querySelectorAll('[data-gsxp-filter]')) {
      button.addEventListener('click', () => {
        state.filter = button.dataset.gsxpFilter;
        for (const peer of page.querySelectorAll('[data-gsxp-filter]')) peer.classList.toggle('active', peer === button);
        renderLibrary();
      });
    }
    page.querySelector('#gsxp-library')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-gsxp-ignore]');
      if (!button) return;
      const icao = String(button.dataset.gsxpIgnore || '').toUpperCase();
      if (!icao) return;
      if (state.ignored.has(icao)) state.ignored.delete(icao);
      else state.ignored.add(icao);
      saveIgnored();
      renderAll();
    });
  }

  async function restoreHandles() {
    if (!state.profileHandle) state.profileHandle = await loadHandle(PROFILE_DIR_KEY);
    if (!state.communityHandle) state.communityHandle = await loadHandle(COMMUNITY_DIR_KEY);
    if (!state.handlerHandle) state.handlerHandle = await loadHandle(HANDLER_DIR_KEY);
    renderFolders();
  }

  function fileSystemSupported() {
    return typeof window.showDirectoryPicker === 'function';
  }

  async function pickDirectory(key) {
    const message = document.getElementById('gsxp-message');
    if (!fileSystemSupported()) {
      if (message) message.textContent = 'Der lokale Ordnerzugriff ist in diesem Browser nicht verfügbar. Öffne den Manager in der Windows-App.';
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      if (key === PROFILE_DIR_KEY) state.profileHandle = handle;
      if (key === COMMUNITY_DIR_KEY) state.communityHandle = handle;
      if (key === HANDLER_DIR_KEY) state.handlerHandle = handle;
      await saveHandle(key, handle);
      renderFolders();
      if (key === PROFILE_DIR_KEY || key === COMMUNITY_DIR_KEY) await scanAll();
    } catch (error) {
      if (error?.name !== 'AbortError' && message) message.textContent = error.message;
    }
  }

  function renderFolders() {
    const profile = document.getElementById('gsxp-profile-folder');
    const community = document.getElementById('gsxp-community-folder');
    const handlers = document.getElementById('gsxp-handler-folder');
    if (profile) profile.textContent = state.profileHandle?.name || '%APPDATA%\\Virtuali\\GSX\\MSFS';
    if (community) community.textContent = state.communityHandle?.name || 'Optional für Missing-Profile-Scan';
    if (handlers) handlers.textContent = state.handlerHandle?.name || 'Optional · %APPDATA%\\Virtuali\\Handlers\\lib';
    const folderState = document.getElementById('gsxp-folder-state');
    if (folderState) folderState.textContent = state.profileHandle ? 'PROFILE DIR READY' : 'LOCAL ONLY';
  }

  async function scanAll() {
    if (state.busy) return;
    state.busy = true;
    setStatus('waiting', 'SCANNING');
    const message = document.getElementById('gsxp-message');
    if (message) message.textContent = 'Lokale GSX-Profile und MSFS-Airports werden geprüft …';
    try {
      await restoreHandles();
      state.profiles = await scanProfileDirectory(state.profileHandle);
      state.airports = await scanCommunityDirectory(state.communityHandle);
      if (message) {
        message.textContent = state.profileHandle
          ? `${state.profiles.length} Profil-Dateien erkannt${state.communityHandle ? ` · ${state.airports.length} mögliche Airport-Packages` : ''}.`
          : 'GSX Profilordner noch nicht verbunden.';
      }
      setStatus(state.profileHandle ? 'connected' : 'waiting', state.profileHandle ? 'READY' : 'SETUP');
      renderAll();
    } catch (error) {
      if (message) message.textContent = error.message;
      setStatus('attention', 'CHECK SETUP');
    } finally {
      state.busy = false;
    }
  }

  function setStatus(className, label) {
    const status = document.getElementById('gsxp-status');
    if (!status) return;
    status.className = `module-status ${className}`;
    status.textContent = label;
  }

  async function scanProfileDirectory(handle) {
    if (!handle || !(await permission(handle, 'read'))) return [];
    const result = [];
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind !== 'file' || !PROFILE_EXTENSIONS.has(extname(name))) continue;
      let icao = findIcao(name);
      if (!icao && extname(name) === '.ini') {
        try {
          const file = await entry.getFile();
          const text = await file.slice(0, 64 * 1024).text();
          const explicit = text.match(/^\s*(?:icao|airport)\s*=\s*([A-Z0-9]{4})\b/im);
          icao = explicit?.[1]?.toUpperCase() || findIcao(text.slice(0, 8_000));
        } catch {
          // Filename detection remains the fallback.
        }
      }
      result.push({ name, icao: icao || '----', type: extname(name).slice(1).toUpperCase() });
    }
    return result.sort((left, right) => left.name.localeCompare(right.name));
  }

  async function scanCommunityDirectory(handle) {
    if (!handle || !(await permission(handle, 'read'))) return [];
    const values = [];
    let scanned = 0;
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind !== 'directory') continue;
      scanned += 1;
      if (scanned > 5_000) break;
      let title = name;
      let packageName = name;
      try {
        const manifestHandle = await entry.getFileHandle('manifest.json');
        const manifest = JSON.parse(await (await manifestHandle.getFile()).text());
        title = manifest.title || manifest.package_name || manifest.content_type || name;
        packageName = manifest.package_name || name;
      } catch {
        // Many add-ons still provide useful ICAO information in their folder name.
      }
      const icao = findIcao(`${name} ${title} ${packageName}`);
      if (!icao) continue;
      values.push({ icao, name: title, packageName, source: 'Community' });
    }
    return [...new Map(values.map((entry) => [entry.icao, entry])).values()].sort((a, b) => a.icao.localeCompare(b.icao));
  }

  function profileGroups() {
    const groups = new Map();
    for (const profile of state.profiles) {
      const key = profile.icao || '----';
      const group = groups.get(key) || { icao: key, files: [] };
      group.files.push(profile);
      groups.set(key, group);
    }
    return groups;
  }

  function libraryRows() {
    const groups = profileGroups();
    const rows = [];
    for (const airport of state.airports) {
      const profile = groups.get(airport.icao);
      rows.push({ ...airport, installed: Boolean(profile), files: profile?.files || [], ignored: state.ignored.has(airport.icao) });
      groups.delete(airport.icao);
    }
    for (const group of groups.values()) {
      if (group.icao === '----') continue;
      rows.push({ icao: group.icao, name: 'GSX Profile', packageName: '', source: 'GSX', installed: true, files: group.files, ignored: state.ignored.has(group.icao) });
    }
    return rows.sort((a, b) => a.icao.localeCompare(b.icao));
  }

  function renderAll() {
    renderFolders();
    const rows = libraryRows();
    const airports = state.airports.length || new Set(state.profiles.map((entry) => entry.icao).filter((icao) => icao && icao !== '----')).size;
    const installed = rows.filter((entry) => entry.installed && !entry.ignored).length;
    const missing = rows.filter((entry) => !entry.installed && !entry.ignored).length;
    const ignored = rows.filter((entry) => entry.ignored).length;
    const write = (id, value) => { const node = document.getElementById(id); if (node) node.textContent = String(value); };
    write('gsxp-total-airports', airports);
    write('gsxp-installed-count', installed);
    write('gsxp-missing-count', missing);
    write('gsxp-ignored-count', ignored);
    renderLibrary();
  }

  function renderLibrary() {
    const container = document.getElementById('gsxp-library');
    if (!container) return;
    let rows = libraryRows();
    if (state.filter === 'installed') rows = rows.filter((entry) => entry.installed && !entry.ignored);
    if (state.filter === 'missing') rows = rows.filter((entry) => !entry.installed && !entry.ignored);
    if (state.filter === 'ignored') rows = rows.filter((entry) => entry.ignored);
    if (state.search) rows = rows.filter((entry) => `${entry.icao} ${entry.name} ${entry.packageName}`.toLowerCase().includes(state.search));
    container.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = state.profileHandle ? 'Keine passenden Profile für diesen Filter.' : 'Verbinde zuerst deinen GSX Profilordner und starte den Scan.';
      container.append(empty);
      return;
    }
    for (const row of rows) {
      const entry = document.createElement('article');
      entry.className = `gsxp-library-row${row.installed ? ' installed' : ' missing'}${row.ignored ? ' ignored' : ''}`;
      const fileLabel = row.files.length ? `${row.files.length} Datei${row.files.length === 1 ? '' : 'en'} · ${row.files.map((file) => file.type).join(' / ')}` : 'Kein lokales GSX-Profil';
      entry.innerHTML = `
        <strong class="gsxp-icao">${escapeHtml(row.icao)}</strong>
        <span class="gsxp-airport"><b>${escapeHtml(row.name || row.packageName || row.icao)}</b><small>${escapeHtml([row.packageName && row.packageName !== row.name ? row.packageName : '', row.source].filter(Boolean).join(' · '))}</small></span>
        <span class="gsxp-profile-files"><b>${escapeHtml(row.installed ? 'Profil erkannt' : '—')}</b><small>${escapeHtml(fileLabel)}</small></span>
        <em class="gsxp-profile-status">${row.ignored ? 'IGNORIERT' : row.installed ? 'INSTALLIERT' : 'FEHLT'}</em>
        <button class="text-mini-action" type="button" data-gsxp-ignore="${escapeHtml(row.icao)}">${row.ignored ? 'REAKTIVIEREN' : 'IGNORIEREN'}</button>`;
      container.append(entry);
    }
  }

  async function handleFiles(files) {
    const accepted = files.filter((file) => ['.zip', '.ini', '.py'].includes(extname(file.name)));
    if (!accepted.length) {
      setImportMessage('Keine unterstützte Datei erkannt. Unterstützt werden ZIP, INI und PY.');
      return;
    }
    try {
      setStatus('waiting', 'IMPORT');
      const entries = [];
      for (const file of accepted) {
        if (extname(file.name) === '.zip') entries.push(...await readZip(file));
        else entries.push({ path: file.name, name: basename(file.name), data: new Uint8Array(await file.arrayBuffer()), source: file.name });
      }
      const profileEntries = entries.filter((entry) => PROFILE_EXTENSIONS.has(extname(entry.name)));
      if (!profileEntries.length) throw new Error('Im Archiv wurden keine GSX .ini/.py-Dateien gefunden.');
      state.importSourceName = accepted.map((file) => file.name).join(', ');
      state.importCandidates = buildCandidates(profileEntries);
      renderImportPreview();
      setStatus('connected', 'PREVIEW');
    } catch (error) {
      clearImport();
      setImportMessage(error.message);
      setStatus('attention', 'IMPORT ERROR');
    }
  }

  function buildCandidates(entries) {
    const groups = new Map();
    for (const entry of entries) {
      const normalizedPath = entry.path.replaceAll('\\', '/');
      const parent = normalizedPath.includes('/') ? normalizedPath.split('/').slice(0, -1).join('/') : '(root)';
      const icao = findIcao(`${normalizedPath} ${entry.name}`) || 'UNKN';
      const variant = profileVariant(normalizedPath);
      const key = `${icao}|${variant}|${parent}`;
      const group = groups.get(key) || { id: key, icao, variant, parent, files: [], selected: false };
      group.files.push(entry);
      groups.set(key, group);
    }
    const candidates = [...groups.values()]
      .filter((group) => group.files.some((entry) => extname(entry.name) === '.ini') || group.files.length === 1)
      .sort((a, b) => `${a.icao}${a.variant}`.localeCompare(`${b.icao}${b.variant}`));
    if (candidates.length) candidates[0].selected = true;
    return candidates;
  }

  function renderImportPreview() {
    const panel = document.getElementById('gsxp-import-preview');
    const title = document.getElementById('gsxp-import-title');
    const container = document.getElementById('gsxp-candidates');
    if (!panel || !container) return;
    panel.hidden = false;
    if (title) title.textContent = state.importCandidates.length > 1 ? 'Welches Profil möchtest du installieren?' : 'Profil vor Installation prüfen';
    container.replaceChildren();
    for (const candidate of state.importCandidates) {
      const label = document.createElement('label');
      label.className = 'gsxp-candidate';
      label.innerHTML = `<input type="radio" name="gsxp-candidate" value="${escapeHtml(candidate.id)}" ${candidate.selected ? 'checked' : ''}><span><strong>${escapeHtml(candidate.icao === 'UNKN' ? 'Profil' : candidate.icao)} · ${escapeHtml(candidate.variant)}</strong><small>${escapeHtml(candidate.parent === '(root)' ? state.importSourceName : candidate.parent)}</small><b>${escapeHtml(candidate.files.map((file) => file.name).join(' · '))}</b></span>`;
      label.querySelector('input').addEventListener('change', () => {
        for (const item of state.importCandidates) item.selected = item.id === candidate.id;
      });
      container.append(label);
    }
    if (state.importCandidates.length > 1) {
      const all = document.createElement('label');
      all.className = 'gsxp-candidate install-all';
      all.innerHTML = '<input type="radio" name="gsxp-candidate" value="__all__"><span><strong>Alle erkannten Profile</strong><small>Installiert jede gefundene Variante aus dem Archiv.</small></span>';
      all.querySelector('input').addEventListener('change', () => {
        for (const item of state.importCandidates) item.selected = true;
      });
      container.append(all);
    }
  }

  function setImportMessage(message) {
    const target = document.getElementById('gsxp-message');
    if (target) target.textContent = message;
  }

  function clearImport() {
    state.importCandidates = [];
    state.importSourceName = '';
    const panel = document.getElementById('gsxp-import-preview');
    if (panel) panel.hidden = true;
  }

  async function installSelected() {
    if (!state.importCandidates.length) return;
    await restoreHandles();
    if (!state.profileHandle || !(await permission(state.profileHandle, 'readwrite'))) {
      setImportMessage('Bitte zuerst den GSX Profilordner auswählen und Schreibzugriff erlauben.');
      return;
    }
    const chosenValue = document.querySelector('input[name="gsxp-candidate"]:checked')?.value;
    const candidates = chosenValue === '__all__'
      ? state.importCandidates
      : state.importCandidates.filter((entry) => entry.id === chosenValue || entry.selected && !chosenValue);
    const files = candidates.flatMap((candidate) => candidate.files);
    const profileFiles = [];
    const handlerLibFiles = [];
    for (const file of files) {
      const normalized = file.path.replaceAll('\\', '/').toLowerCase();
      if (normalized.includes('/lib/') && extname(file.name) === '.py' && !file.name.toLowerCase().endsWith('_handler.py')) handlerLibFiles.push(file);
      else profileFiles.push(file);
    }
    const existing = [];
    for (const file of profileFiles) {
      try { await state.profileHandle.getFileHandle(basename(file.name)); existing.push(basename(file.name)); } catch { /* New file. */ }
    }
    if (existing.length && !window.confirm(`${existing.length} Datei(en) existieren bereits und werden ersetzt:\n\n${existing.slice(0, 12).join('\n')}${existing.length > 12 ? '\n…' : ''}\n\nFortfahren?`)) return;

    const installButton = document.getElementById('gsxp-install');
    if (installButton) installButton.disabled = true;
    try {
      let written = 0;
      for (const file of profileFiles) {
        await writeFile(state.profileHandle, basename(file.name), file.data);
        written += 1;
      }
      let handlerWritten = 0;
      if (handlerLibFiles.length) {
        if (state.handlerHandle && await permission(state.handlerHandle, 'readwrite')) {
          for (const file of handlerLibFiles) {
            await writeFile(state.handlerHandle, basename(file.name), file.data);
            handlerWritten += 1;
          }
        }
      }
      const handlerNote = handlerLibFiles.length
        ? handlerWritten === handlerLibFiles.length
          ? ` · ${handlerWritten} Handler-Lib-Datei(en)`
          : ` · ${handlerLibFiles.length} Handler-Lib-Datei(en) erkannt, Handler-Ordner noch nicht verbunden`
        : '';
      setImportMessage(`${written} GSX Profil-Datei(en) installiert${handlerNote}.`);
      clearImport();
      await scanAll();
    } catch (error) {
      setImportMessage(`Installation fehlgeschlagen: ${error.message}`);
      setStatus('attention', 'INSTALL ERROR');
    } finally {
      if (installButton) installButton.disabled = false;
    }
  }

  async function writeFile(directory, filename, data) {
    const safeName = basename(filename).replace(/[<>:"/\\|?*]/g, '_');
    if (!safeName || safeName === '.' || safeName === '..') throw new Error('Ungültiger Dateiname im Profilarchiv.');
    const handle = await directory.getFileHandle(safeName, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
  }

  async function readZip(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const eocd = findEocd(view);
    if (eocd < 0) throw new Error(`${file.name}: ZIP-Verzeichnis nicht gefunden.`);
    const total = view.getUint16(eocd + 10, true);
    let offset = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder('utf-8');
    const entries = [];
    for (let index = 0; index < total && offset + 46 <= bytes.length; index += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error(`${file.name}: ungültiger ZIP-Eintrag.`);
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const uncompressedSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const nameBytes = bytes.slice(offset + 46, offset + 46 + nameLength);
      const pathname = decoder.decode(nameBytes).replaceAll('\\', '/');
      offset += 46 + nameLength + extraLength + commentLength;
      if (!pathname || pathname.endsWith('/') || !PROFILE_EXTENSIONS.has(extname(pathname))) continue;
      if (flags & 0x1) throw new Error(`${file.name}: verschlüsselte ZIP-Dateien werden nicht unterstützt.`);
      if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error(`${file.name}: lokaler ZIP-Header fehlt.`);
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataStart, dataStart + compressedSize);
      const data = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
      if (!data) throw new Error(`${file.name}: ZIP-Kompressionsmethode ${method} wird nicht unterstützt.`);
      if (uncompressedSize && data.length !== uncompressedSize) {
        // Some creators produce archives with metadata quirks; content is still accepted if decompression succeeded.
      }
      entries.push({ path: pathname, name: basename(pathname), data, source: file.name });
    }
    return entries;
  }

  function findEocd(view) {
    const minimum = Math.max(0, view.byteLength - 65_557);
    for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) return offset;
    }
    return -1;
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('ZIP-Dekomprimierung wird von diesem Chromium-Build nicht unterstützt.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function initialize() {
    createTile();
    createPage();
    restoreHandles().then(() => renderAll()).catch(() => {});
  }

  initialize();
})();
