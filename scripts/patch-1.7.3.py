from pathlib import Path
import json
import re


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'{label}: anchor not found in {path}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


# ---------------------------------------------------------------------------
# Traffic enrichment: preserve route/schedule metadata and merge it into the
# primary SimConnect dataset instead of discarding it again.
# ---------------------------------------------------------------------------
injected = Path('src/injected-traffic-client.mjs')
s = injected.read_text(encoding='utf-8')
helper_anchor = """function clean(value) {
  return String(value || '').replace(/\\0/g, '').trim();
}
"""
helpers = r'''

const TRAFFIC_TEXT_FIELDS = ['airline', 'flightNumber', 'currentAirport', 'runway', 'parking', 'origin', 'destination'];

function trafficNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeInjectedTrafficEntry(entry = {}) {
  const atcId = clean(entry.atcId);
  const title = clean(entry.title);
  const airline = clean(entry.airline);
  const flightNumber = clean(entry.flightNumber);
  const suppliedState = clean(entry.state).toLowerCase();
  const inferredState = suppliedState || (entry.onGround
    ? Number(entry.groundSpeed) > 3 ? 'taxi' : 'parked'
    : Number(entry.aglFeet) < 1_500 && Number(entry.verticalSpeedFpm) < -150 ? 'landing' : 'enroute');
  const callsign = atcId || [airline, flightNumber].filter(Boolean).join(' ') || title || `AI-${entry.objectId}`;
  return {
    ...entry,
    title,
    atcId,
    airline,
    flightNumber,
    callsign,
    state: inferredState,
    currentAirport: clean(entry.currentAirport).toUpperCase(),
    runway: clean(entry.runway).toUpperCase(),
    parking: clean(entry.parking),
    origin: clean(entry.origin).toUpperCase(),
    destination: clean(entry.destination).toUpperCase(),
    etdSeconds: trafficNumber(entry.etdSeconds),
    etaSeconds: trafficNumber(entry.etaSeconds),
    scheduleEnriched: Boolean(entry.scheduleEnriched),
    source: entry.source || 'simconnect-all',
  };
}

export function mergeTrafficSources(primary = [], fallback = []) {
  const supplementalById = new Map((Array.isArray(fallback) ? fallback : [])
    .map((entry) => [Number(entry?.objectId), entry])
    .filter(([id]) => Number.isFinite(id)));
  const used = new Set();
  const merged = (Array.isArray(primary) ? primary : []).map((entry) => {
    const id = Number(entry?.objectId);
    const supplemental = supplementalById.get(id);
    if (!supplemental) return entry;
    used.add(id);
    const combined = { ...supplemental, ...entry };
    for (const field of TRAFFIC_TEXT_FIELDS) {
      const primaryValue = clean(entry?.[field]);
      const supplementalValue = clean(supplemental?.[field]);
      combined[field] = primaryValue || supplementalValue;
      if (['currentAirport', 'runway', 'origin', 'destination'].includes(field)) combined[field] = combined[field].toUpperCase();
    }
    for (const field of ['etdSeconds', 'etaSeconds']) {
      combined[field] = trafficNumber(entry?.[field]) ?? trafficNumber(supplemental?.[field]);
    }
    if (supplemental.scheduleEnriched && clean(supplemental.state)) combined.state = clean(supplemental.state).toLowerCase();
    combined.scheduleEnriched = Boolean(entry?.scheduleEnriched || supplemental.scheduleEnriched);
    combined.source = entry?.source || 'simconnect-primary';
    return combined;
  });
  for (const entry of Array.isArray(fallback) ? fallback : []) {
    const id = Number(entry?.objectId);
    if (!Number.isFinite(id) || used.has(id)) continue;
    merged.push(entry);
  }
  return merged;
}
'''
if 'export function normalizeInjectedTrafficEntry' not in s:
    if helper_anchor not in s:
        raise SystemExit('traffic helper anchor missing')
    s = s.replace(helper_anchor, helper_anchor + helpers, 1)

s = s.replace(
    "if (!Number.isInteger(objectId) || this.pendingPlanRequests.has(objectId)) continue;",
    "if (!Number.isInteger(objectId) || [...this.pendingPlanRequests.values()].includes(objectId)) continue;",
    1,
)
s = s.replace(
    "        etaSeconds: data.readFloat64(),\n      };",
    "        etaSeconds: data.readFloat64(),\n        scheduleEnriched: true,\n      };",
    1,
)

pattern = re.compile(r"  #normalizeTrafficEntry\(entry\) \{.*?\n  \}\n\n  #publishMergedTraffic\(\) \{", re.S)
if not pattern.search(s):
    raise SystemExit('normalize traffic method not found')
s = pattern.sub("  #normalizeTrafficEntry(entry) {\n    return normalizeInjectedTrafficEntry(entry);\n  }\n\n  #publishMergedTraffic() {", s, count=1)

publish_pattern = re.compile(r"  #publishMergedTraffic\(\) \{.*?\n  \}\n\n  #restoreMergedTrafficIfNeeded\(\) \{", re.S)
publish_replacement = r'''  #publishMergedTraffic() {
    const integration = this.engine.publicState().integrations?.simTraffic || {};
    const currentAircraft = Array.isArray(integration.aircraft) ? integration.aircraft : [];
    const primary = currentAircraft.filter((entry) => entry?.source !== 'simconnect-all');
    const primaryIds = new Set(primary.map((entry) => Number(entry.objectId)).filter(Number.isFinite));
    const fallbackOnlyCount = this.fallbackAircraft.filter((entry) => !primaryIds.has(Number(entry.objectId))).length;
    const aircraft = mergeTrafficSources(primary, this.fallbackAircraft)
      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
      .slice(0, 300)
      .sort((left, right) => String(left.callsign || '').localeCompare(String(right.callsign || ''), 'en', { numeric: true }));

    this.engine.setIntegration('simTraffic', {
      status: 'ready',
      source: 'SimConnect',
      radiusKm: TRAFFIC_RADIUS_METERS / 1_000,
      updatedAt: new Date().toISOString(),
      detail: fallbackOnlyCount > 0
        ? `${aircraft.length} Simulator-Flugzeuge im Umkreis · ${fallbackOnlyCount} über Injector-Fallback`
        : `${aircraft.length} Simulator-Flugzeuge im Umkreis`,
      injectedFallbackCount: fallbackOnlyCount,
      aircraft,
    });
  }

  #restoreMergedTrafficIfNeeded() {'''
if not publish_pattern.search(s):
    raise SystemExit('publish traffic method not found')
s = publish_pattern.sub(publish_replacement, s, count=1)

restore_pattern = re.compile(r"  #restoreMergedTrafficIfNeeded\(\) \{.*?\n  \}\n\}", re.S)
restore_replacement = r'''  #restoreMergedTrafficIfNeeded() {
    if (this.stopped || this.fallbackAircraft.length === 0) return;
    const current = this.engine.publicState().integrations?.simTraffic;
    const currentById = new Map((Array.isArray(current?.aircraft) ? current.aircraft : [])
      .map((entry) => [Number(entry?.objectId), entry])
      .filter(([id]) => Number.isFinite(id)));
    const needsRestore = this.fallbackAircraft.some((fallback) => {
      const existing = currentById.get(Number(fallback.objectId));
      if (!existing) return true;
      if (fallback.scheduleEnriched && clean(fallback.state) && clean(existing.state).toLowerCase() !== clean(fallback.state).toLowerCase()) return true;
      return TRAFFIC_TEXT_FIELDS.some((field) => clean(fallback[field]) && !clean(existing[field]))
        || (trafficNumber(fallback.etdSeconds) !== null && trafficNumber(existing.etdSeconds) === null)
        || (trafficNumber(fallback.etaSeconds) !== null && trafficNumber(existing.etaSeconds) === null);
    });
    if (needsRestore) {
      queueMicrotask(() => {
        if (!this.stopped) this.#publishMergedTraffic();
      });
    }
  }
}'''
if not restore_pattern.search(s):
    raise SystemExit('restore traffic method not found')
s = restore_pattern.sub(restore_replacement, s, count=1)
injected.write_text(s, encoding='utf-8')

# Primary traffic refresh must preserve metadata already enriched by the fallback reader.
sim = Path('src/simconnect-client.mjs')
s = sim.read_text(encoding='utf-8')
old = """    const aircraft = batch.aircraft
      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
      .slice(0, 300)
      .sort((left, right) => left.callsign.localeCompare(right.callsign, 'en', { numeric: true }));
"""
new = """    const previousById = new Map((this.engine.publicState().integrations?.simTraffic?.aircraft || [])
      .map((entry) => [Number(entry?.objectId), entry])
      .filter(([id]) => Number.isFinite(id)));
    const metadataFields = ['airline', 'flightNumber', 'currentAirport', 'runway', 'parking', 'origin', 'destination'];
    const aircraft = batch.aircraft
      .filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon))
      .map((entry) => {
        const previous = previousById.get(Number(entry.objectId));
        const merged = { ...entry, source: 'simconnect-primary' };
        if (!previous) return merged;
        for (const field of metadataFields) merged[field] = String(entry[field] || '').trim() || String(previous[field] || '').trim();
        for (const field of ['etdSeconds', 'etaSeconds']) {
          const current = entry[field];
          const prior = previous[field];
          merged[field] = current !== null && current !== undefined && current !== '' ? current : prior ?? null;
        }
        if (previous.scheduleEnriched) {
          merged.scheduleEnriched = true;
          if (previous.state) merged.state = previous.state;
        }
        return merged;
      })
      .slice(0, 300)
      .sort((left, right) => left.callsign.localeCompare(right.callsign, 'en', { numeric: true }));
"""
if old not in s:
    raise SystemExit('primary traffic publish anchor missing')
s = s.replace(old, new, 1)
sim.write_text(s, encoding='utf-8')

# ---------------------------------------------------------------------------
# Updater dialog: show release notes directly and make the dialog visually
# structured rather than a stretched generic modal.
# ---------------------------------------------------------------------------
html = Path('public/index.html')
h = html.read_text(encoding='utf-8')
old_dialog = '''    <dialog id="update-dialog" class="modal update-modal">
      <form method="dialog" class="modal-shell compact-modal-shell update-modal-shell">
        <button id="update-dialog-close" class="modal-close" value="close" aria-label="Schließen">×</button>
        <div class="modal-heading"><span class="modal-icon">↑</span><div><small>FLIGHT DECK EFB UPDATE</small><h2 id="update-dialog-title">Update verfügbar</h2></div></div>
        <p id="update-dialog-detail">Eine neue Version von Flight Deck EFB ist verfügbar.</p>
        <div id="update-dialog-progress" class="update-progress" hidden><i></i><span id="update-dialog-progress-label">0%</span></div>
        <div class="confirm-actions"><button id="update-dialog-later" value="close" class="secondary-card-action" type="button">SPÄTER</button><button id="update-dialog-download" class="primary-card-action" type="button">HERUNTERLADEN</button><button id="update-dialog-install" class="primary-card-action" type="button" hidden>JETZT INSTALLIEREN</button></div>
      </form>
    </dialog>'''
new_dialog = '''    <dialog id="update-dialog" class="modal update-modal">
      <form method="dialog" class="modal-shell update-modal-shell">
        <header class="update-modal-header">
          <span class="update-modal-icon" aria-hidden="true">↑</span>
          <div class="update-modal-copy"><small>FLIGHT DECK EFB UPDATE</small><h2 id="update-dialog-title">Update verfügbar</h2><p id="update-dialog-detail">Eine neue Version von Flight Deck EFB ist verfügbar.</p></div>
          <button id="update-dialog-close" class="modal-close update-modal-close" value="close" aria-label="Schließen">×</button>
        </header>
        <div class="update-version-strip"><span><small>INSTALLED</small><b id="update-dialog-current-version">—</b></span><i>→</i><span><small>AVAILABLE</small><b id="update-dialog-target-version">—</b></span></div>
        <section id="update-dialog-notes-panel" class="update-notes-panel" hidden><div class="update-notes-heading"><small>WHAT'S NEW</small><strong id="update-dialog-notes-title">Änderungen</strong></div><div id="update-dialog-notes" class="update-dialog-notes"></div></section>
        <div id="update-dialog-progress" class="update-progress" hidden><i></i><span id="update-dialog-progress-label">0%</span></div>
        <footer class="update-modal-actions"><button id="update-dialog-later" value="close" class="secondary-card-action" type="button">SPÄTER</button><button id="update-dialog-download" class="primary-card-action" type="button">UPDATE LADEN</button><button id="update-dialog-install" class="primary-card-action" type="button" hidden>NEUSTART &amp; INSTALLIEREN</button></footer>
      </form>
    </dialog>'''
if old_dialog not in h:
    raise SystemExit('update dialog markup anchor missing')
h = h.replace(old_dialog, new_dialog, 1)

# Make SayIntentions messages actually occupy the whole ATC workspace.
# Versioned assets / visible version.
h = h.replace('data-app-version="1.7.2"', 'data-app-version="1.7.3"', 1)
h = h.replace('/styles.css?v=1.7.2', '/styles.css?v=1.7.3', 1)
h = h.replace('/si-operations.css?v=1.7.2', '/si-operations.css?v=1.7.3', 1)
h = h.replace('<span id="update-version">v1.7.2</span>', '<span id="update-version">v1.7.3</span>', 1)
h = h.replace('<span>CURRENT v1.7.2</span>', '<span>CURRENT v1.7.3</span>', 1)
changelog_anchor = '<div class="update-changelog"><section><b>1.7.2</b>'
changelog_new = '<div class="update-changelog"><section><b>1.7.3</b><div><strong>Traffic, layout &amp; updater correction</strong><ul><li>FROM/TO enrichment is preserved and merged into the rendered Flightboard traffic.</li><li>Primary traffic refreshes no longer erase schedule metadata.</li><li>Flight Assistant and other flex cards stretch to the intended workspace width again.</li><li>SayIntentions Messages uses the complete ATC width.</li><li>The update popup now shows the release changelog directly.</li></ul></div></section><section><b>1.7.2</b>'
if changelog_anchor not in h:
    raise SystemExit('settings changelog anchor missing')
h = h.replace(changelog_anchor, changelog_new, 1)
html.write_text(h, encoding='utf-8')

app = Path('public/app.js')
a = app.read_text(encoding='utf-8')
a = a.replace("./i18n.js?v=1.7.2", "./i18n.js?v=1.7.3", 1).replace("./flight-phases.js?v=1.7.2", "./flight-phases.js?v=1.7.3", 1)
element_anchor = """  updateDialogTitle: $('#update-dialog-title'),
  updateDialogDetail: $('#update-dialog-detail'),
  updateDialogProgress: $('#update-dialog-progress'),
"""
element_new = """  updateDialogTitle: $('#update-dialog-title'),
  updateDialogDetail: $('#update-dialog-detail'),
  updateDialogCurrentVersion: $('#update-dialog-current-version'),
  updateDialogTargetVersion: $('#update-dialog-target-version'),
  updateDialogNotesPanel: $('#update-dialog-notes-panel'),
  updateDialogNotesTitle: $('#update-dialog-notes-title'),
  updateDialogNotes: $('#update-dialog-notes'),
  updateDialogProgress: $('#update-dialog-progress'),
"""
if element_anchor not in a:
    raise SystemExit('update dialog element anchor missing')
a = a.replace(element_anchor, element_new, 1)

render_anchor = 'function renderUpdateStatus(status = {}) {'
notes_helper = r'''function releaseNotesText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? entry : entry?.note || '').filter(Boolean).join('\n');
  return '';
}

function renderUpdateDialogNotes(value, version = '') {
  if (!elements.updateDialogNotes || !elements.updateDialogNotesPanel) return;
  const raw = releaseNotesText(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r/g, '')
    .trim();
  elements.updateDialogNotes.replaceChildren();
  elements.updateDialogNotesTitle.textContent = version ? `Neu in ${version}` : 'Änderungen';
  if (!raw) {
    elements.updateDialogNotesPanel.hidden = true;
    return;
  }
  const fragment = document.createDocumentFragment();
  let list = null;
  const flushList = () => {
    if (list) fragment.append(list);
    list = null;
  };
  for (const sourceLine of raw.split('\n').slice(0, 80)) {
    const line = sourceLine.trim();
    if (!line || /^>\s*Flight simulation/i.test(line)) continue;
    if (/^#{1,4}\s+/.test(line)) {
      flushList();
      const heading = document.createElement('strong');
      heading.className = 'update-note-heading';
      heading.textContent = line.replace(/^#{1,4}\s+/, '').replace(/\*\*/g, '');
      fragment.append(heading);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      list ||= document.createElement('ul');
      const item = document.createElement('li');
      item.textContent = line.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
      list.append(item);
      continue;
    }
    flushList();
    const paragraph = document.createElement('p');
    paragraph.textContent = line.replace(/\*\*/g, '');
    fragment.append(paragraph);
  }
  flushList();
  elements.updateDialogNotes.append(fragment);
  elements.updateDialogNotesPanel.hidden = elements.updateDialogNotes.childElementCount === 0;
}

'''
if notes_helper not in a:
    if render_anchor not in a:
        raise SystemExit('render update status anchor missing')
    a = a.replace(render_anchor, notes_helper + render_anchor, 1)

status_anchor = """  const currentVersion = status.currentVersion || document.documentElement.dataset.appVersion || '1.7.0';
  elements.updateVersion.textContent = `v${currentVersion}`;
"""
status_new = """  const currentVersion = status.currentVersion || document.documentElement.dataset.appVersion || '1.7.3';
  elements.updateVersion.textContent = `v${currentVersion}`;
  if (elements.updateDialogCurrentVersion) elements.updateDialogCurrentVersion.textContent = `v${currentVersion}`;
  if (elements.updateDialogTargetVersion) elements.updateDialogTargetVersion.textContent = status.releaseName ? `v${status.releaseName}` : '—';
  renderUpdateDialogNotes(status.releaseNotes, status.releaseName ? `v${status.releaseName}` : '');
"""
if status_anchor not in a:
    raise SystemExit('render update version anchor missing')
a = a.replace(status_anchor, status_new, 1)
a = a.replace("document.documentElement.dataset.appVersion || '1.7.0'", "document.documentElement.dataset.appVersion || '1.7.3'")
app.write_text(a, encoding='utf-8')

# Update release-note hydration in Electron so the popup still gets a changelog
# if electron-updater did not include releaseNotes in its first event.
electron = Path('src/electron-main.mjs')
e = electron.read_text(encoding='utf-8')
fetch_helper_anchor = """function normalizeReleaseNotes(value) {
  if (typeof value === 'string') return value.slice(0, 12000);
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? entry : entry?.note || '').filter(Boolean).join('\\n').slice(0, 12000);
  return '';
}
"""
fetch_helper = r'''

async function fetchGitHubReleaseNotes(version) {
  const normalized = String(version || '').trim().replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(normalized)) return '';
  try {
    const response = await fetch(`https://api.github.com/repos/checkner89/Flight-Deck-EFB/releases/tags/v${normalized}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Flight-Deck-EFB-Updater' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return '';
    const body = await response.json();
    return normalizeReleaseNotes(body?.body || '');
  } catch {
    return '';
  }
}
'''
if 'async function fetchGitHubReleaseNotes' not in e:
    if fetch_helper_anchor not in e:
        raise SystemExit('electron release notes helper anchor missing')
    e = e.replace(fetch_helper_anchor, fetch_helper_anchor + fetch_helper, 1)

old_available = """    autoUpdater.on('update-available', (info) => set({ state: 'available', percent: 0, releaseName: info?.version || null, releaseNotes: normalizeReleaseNotes(info?.releaseNotes), detail: `Version ${info?.version || ''} ist verfügbar.`.replace(/\\s+/g, ' ').trim() }));
"""
new_available = """    autoUpdater.on('update-available', (info) => {
      const releaseName = info?.version || null;
      const releaseNotes = normalizeReleaseNotes(info?.releaseNotes);
      set({ state: 'available', percent: 0, releaseName, releaseNotes, detail: `Version ${releaseName || ''} ist verfügbar.`.replace(/\\s+/g, ' ').trim() });
      if (!releaseNotes && releaseName) fetchGitHubReleaseNotes(releaseName).then((notes) => {
        if (notes && value.releaseName === releaseName) set({ releaseNotes: notes });
      });
    });
"""
if old_available not in e:
    raise SystemExit('electron update-available anchor missing')
e = e.replace(old_available, new_available, 1)
e = e.replace(
    "releaseNotes: normalizeReleaseNotes(info?.releaseNotes), detail: `Version ${info?.version || ''} ist bereit.",
    "releaseNotes: normalizeReleaseNotes(info?.releaseNotes) || value.releaseNotes || '', detail: `Version ${info?.version || ''} ist bereit.",
    1,
)
electron.write_text(e, encoding='utf-8')

# ---------------------------------------------------------------------------
# CSS: undo the global flex-card shrink, make Assistant + SI full width, and
# redesign the updater modal.
# ---------------------------------------------------------------------------
css = Path('public/styles.css')
c = css.read_text(encoding='utf-8')
c = c.replace(
    '.efb-pages .efb-card { min-width: 0; min-height: 0; height: auto; align-self: start; }',
    '.efb-pages .efb-card { min-width: 0; min-height: 0; height: auto; }',
    1,
)
c += r'''

/* 1.7.3 corrective UI layout */
.home-launcher > .efb-card { width: 100%; max-width: none; align-self: stretch; }
.home-assistant-card { width: 100%; max-width: none; align-self: stretch !important; padding: 17px 18px; }
.home-assistant-card > p { margin: 7px 0 10px; }
.home-assistant-card .flight-assistant-list { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin: 8px 0 0; }
.home-assistant-card .flight-assistant-item { min-height: 70px; align-items: flex-start; }
.home-assistant-card .safety-note { margin-top: 10px; }
.combined-atc-layout .atc-messages-card { grid-column: 1 / -1 !important; width: 100%; }
.aircraft-view, .aircraft-view-stack, .fenix-efb-view { width: 100%; max-width: none; }
.ground-layout > .efb-card,
.automation-layout > .efb-card,
.settings-grid > .efb-card,
.flight-page-layout > .efb-card,
.briefing-layout > .efb-card,
.atc-layout > .efb-card,
.combined-atc-layout > .efb-card { align-self: start; }

.update-modal { width: min(680px, calc(100% - 32px)); max-height: min(820px, calc(100% - 32px)); overflow: hidden; border-radius: 22px; }
.update-modal-shell { width: 100%; max-width: none; padding: 0; overflow: hidden; }
.update-modal-header { position: relative; display: grid; grid-template-columns: 54px minmax(0, 1fr) 40px; gap: 14px; align-items: start; padding: 22px 22px 18px; border-bottom: 1px solid var(--line); background: linear-gradient(145deg, rgba(22,227,212,.09), rgba(45,184,255,.025)); }
.update-modal-icon { display: grid; place-items: center; width: 54px; height: 54px; border-radius: 15px; background: rgba(22,227,212,.11); color: var(--cyan); font-size: 27px; font-weight: 500; }
.update-modal-copy { min-width: 0; }
.update-modal-copy > small { display: block; margin: 1px 0 5px; color: var(--cyan); font-size: 9px; font-weight: 900; letter-spacing: .16em; }
.update-modal-copy h2 { margin: 0; font-size: 22px; letter-spacing: -.02em; }
.update-modal-copy p { margin: 7px 0 0; color: var(--muted); font-size: 12px; line-height: 1.45; }
.update-modal-close { position: static; width: 36px; height: 36px; justify-self: end; border: 1px solid var(--line); border-radius: 50%; background: rgba(255,255,255,.03); color: var(--muted); font-size: 21px; line-height: 1; }
.update-modal-close:hover { border-color: rgba(22,227,212,.4); background: rgba(22,227,212,.08); color: var(--cyan); }
.update-version-strip { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 14px; margin: 18px 22px 0; padding: 13px 15px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,.025); }
.update-version-strip span { display: grid; gap: 3px; }
.update-version-strip span:last-child { text-align: right; }
.update-version-strip small { color: var(--muted); font-size: 8px; font-weight: 850; letter-spacing: .14em; }
.update-version-strip b { font-size: 15px; }
.update-version-strip i { color: var(--cyan); font-size: 17px; font-style: normal; }
.update-notes-panel { margin: 14px 22px 0; padding: 14px 15px; border: 1px solid rgba(22,227,212,.18); border-radius: 12px; background: rgba(22,227,212,.035); }
.update-notes-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
.update-notes-heading small { color: var(--cyan); font-size: 8px; font-weight: 900; letter-spacing: .14em; }
.update-notes-heading strong { font-size: 11px; }
.update-dialog-notes { max-height: 230px; overflow: auto; padding-right: 6px; color: var(--muted); font-size: 11px; line-height: 1.45; }
.update-dialog-notes .update-note-heading { display: block; margin: 9px 0 5px; color: var(--text); font-size: 11px; }
.update-dialog-notes .update-note-heading:first-child { margin-top: 0; }
.update-dialog-notes ul { display: grid; gap: 6px; margin: 0; padding-left: 18px; }
.update-dialog-notes li::marker { color: var(--cyan); }
.update-dialog-notes p { margin: 6px 0; }
.update-modal-shell > .update-progress { margin: 14px 22px 0; }
.update-modal-actions { display: flex; justify-content: flex-end; gap: 9px; padding: 18px 22px 22px; }
.update-modal-actions button { min-height: 40px; }
@media (max-width: 720px) {
  .home-assistant-card .flight-assistant-list { grid-template-columns: 1fr; }
  .update-modal { width: calc(100% - 18px); max-height: calc(100% - 18px); }
  .update-modal-header { grid-template-columns: 46px minmax(0,1fr) 36px; padding: 17px; }
  .update-modal-icon { width: 46px; height: 46px; }
  .update-version-strip, .update-notes-panel { margin-inline: 17px; }
  .update-modal-actions { padding: 16px 17px 18px; flex-wrap: wrap; }
}
html[data-theme="light"] .update-modal-header { background: linear-gradient(145deg, rgba(0,145,137,.09), rgba(23,141,185,.025)); }
html[data-theme="light"] .update-modal-close { background: rgba(255,255,255,.7); color: #496875; }
html[data-theme="light"] .update-version-strip { background: rgba(255,255,255,.62); }
html[data-theme="light"] .update-notes-panel { background: rgba(0,145,137,.045); border-color: rgba(0,145,137,.2); }
html[data-theme="light"] .update-dialog-notes .update-note-heading { color: #173642; }
'''
css.write_text(c, encoding='utf-8')

# ---------------------------------------------------------------------------
# Version + docs + changelog.
# ---------------------------------------------------------------------------
package = Path('package.json')
pkg = json.loads(package.read_text(encoding='utf-8'))
pkg['version'] = '1.7.3'
package.write_text(json.dumps(pkg, indent=2) + '\n', encoding='utf-8')

lock = Path('package-lock.json')
lock_data = json.loads(lock.read_text(encoding='utf-8'))
lock_data['version'] = '1.7.3'
if '' in lock_data.get('packages', {}): lock_data['packages']['']['version'] = '1.7.3'
lock.write_text(json.dumps(lock_data, indent=2) + '\n', encoding='utf-8')

service = Path('public/service-worker.js')
sv = service.read_text(encoding='utf-8').replace('flight-deck-efb-v172', 'flight-deck-efb-v173').replace('?v=1.7.2', '?v=1.7.3')
service.write_text(sv, encoding='utf-8')

for name in ['README.md', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md', 'MSFS-2024-EFB-App/README.md', 'src/server.mjs']:
    p = Path(name)
    value = p.read_text(encoding='utf-8').replace('1.7.2', '1.7.3')
    p.write_text(value, encoding='utf-8')

changelog = Path('CHANGELOG.md')
cv = changelog.read_text(encoding='utf-8')
marker = '# Flight Deck EFB changelog\n\n'
section = '''## 1.7.3 — Traffic, layout & updater corrective hotfix\n\n- Fixed the Flightboard enrichment pipeline: FROM/TO, current airport, runway, parking, airline/flight number and ETD/ETA are no longer erased after the optional AI Traffic request succeeds.\n- Merges schedule metadata into the primary SimConnect object when both readers report the same aircraft, and preserves that metadata across later primary traffic refreshes.\n- Keeps unknown route fields unknown when an injector does not expose a simulator schedule; Flight Deck does not invent destinations.\n- Reverted the global card shrink introduced in 1.7.2. Flex-based Home cards now stretch to the intended workspace width, while grid cards still keep content-height behavior.\n- Flight Assistant uses the full Home width and lays advisories out responsively instead of collapsing into a narrow column.\n- SayIntentions Messages now spans the complete ATC workspace.\n- Rebuilt the update dialog with installed/available version context, a readable close control and release notes / changelog directly inside the popup.\n- If electron-updater does not provide release notes immediately, the Windows host fetches the matching public GitHub Release body as a fallback.\n\n'''
if '## 1.7.3 — Traffic, layout & updater corrective hotfix' not in cv:
    if marker not in cv: raise SystemExit('changelog marker missing')
    cv = cv.replace(marker, marker + section, 1)
changelog.write_text(cv, encoding='utf-8')

# Durable traffic regression test used by release CI.
verify = Path('scripts/verify-traffic-merge.mjs')
verify.write_text(r'''import assert from 'node:assert/strict';
import { mergeTrafficSources, normalizeInjectedTrafficEntry } from '../src/injected-traffic-client.mjs';

const base = normalizeInjectedTrafficEntry({
  objectId: 42, lat: 51.2, lon: 6.7, altitudeFeet: 0, aglFeet: 0, groundSpeed: 0,
  verticalSpeedFpm: 0, onGround: true, title: 'FSLTL_A320', atcId: 'DLH4AB',
});
assert.equal(base.origin, '');
assert.equal(base.destination, '');
assert.equal(base.state, 'parked');

const enriched = normalizeInjectedTrafficEntry({
  ...base, airline: 'DLH', flightNumber: '4AB', state: 'preflight support', currentAirport: 'EDDL',
  origin: 'EDDL', destination: 'EDDM', runway: '23L', parking: 'Gate A 12', etdSeconds: 600,
  etaSeconds: 4200, scheduleEnriched: true,
});
assert.equal(enriched.origin, 'EDDL');
assert.equal(enriched.destination, 'EDDM');
assert.equal(enriched.airline, 'DLH');
assert.equal(enriched.state, 'preflight support');

const primary = [{ ...base, source: 'simconnect-primary', callsign: 'DLH4AB' }];
const merged = mergeTrafficSources(primary, [enriched]);
assert.equal(merged.length, 1, 'same object id must not duplicate the aircraft');
assert.equal(merged[0].origin, 'EDDL', 'FROM must survive merge');
assert.equal(merged[0].destination, 'EDDM', 'TO must survive merge');
assert.equal(merged[0].runway, '23L');
assert.equal(merged[0].parking, 'Gate A 12');
assert.equal(merged[0].state, 'preflight support', 'schedule state must beat generic parked/enroute inference');
assert.equal(merged[0].source, 'simconnect-primary');

const fallbackOnly = normalizeInjectedTrafficEntry({ ...base, objectId: 99, atcId: 'AFR87YU', origin: 'LFPG', destination: 'EDDL', scheduleEnriched: true });
const withFallback = mergeTrafficSources(primary, [enriched, fallbackOnly]);
assert.equal(withFallback.length, 2);
assert.equal(withFallback.find((entry) => entry.objectId === 99)?.destination, 'EDDL');

console.log('Traffic merge regression OK');
''', encoding='utf-8')

print('1.7.3 patch applied')
