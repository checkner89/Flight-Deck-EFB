from pathlib import Path
import json
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, value):
    (ROOT / path).write_text(value, encoding='utf-8')


def replace_once(value, old, new, label):
    if old not in value:
        raise RuntimeError(f'Anchor not found for {label}')
    return value.replace(old, new, 1)


# --- Privacy hardening for builder public state ---
path = 'src/msfs-efb-package-builder.mjs'
value = read(path)
old = """  publicStatus() {\n    return {\n      ...this.current,\n      building: this.building,\n      configuredSdkRoot: this.configuration.sdkRoot,\n      configuredCommunityDirectory: this.configuration.communityDirectory,\n      lastBuild: this.lastBuild,\n    };\n  }\n\n  #publish(patch = {}) {\n    this.current = { ...this.current, ...patch, lastBuild: this.lastBuild };\n    this.engine?.setIntegration('msfsEfbBuilder', this.publicStatus());\n  }\n"""
new = """  publicStatus() {\n    return {\n      status: this.current.status,\n      supported: this.current.supported,\n      canBuild: this.current.canBuild,\n      canInstall: this.current.canInstall,\n      building: this.building,\n      progressPercent: this.current.progressPercent,\n      step: this.current.step,\n      detail: this.current.detail,\n      sdkDetected: Boolean(this.current.sdk?.ready),\n      communityDetected: Boolean(this.current.communityDirectory),\n      sdkLabel: this.current.sdk?.ready ? (path.win32.basename(this.current.sdk.sdkRoot) || 'MSFS 2024 SDK') : null,\n      communityLabel: this.current.communityDirectory ? path.win32.basename(this.current.communityDirectory) : null,\n      lastBuild: this.lastBuild ? {\n        version: this.lastBuild.version,\n        packageName: this.lastBuild.packageName,\n        builtAt: this.lastBuild.builtAt,\n        installed: this.lastBuild.installed === true,\n      } : null,\n    };\n  }\n\n  detailedStatus() {\n    return {\n      ...this.current,\n      building: this.building,\n      configuredSdkRoot: this.configuration.sdkRoot,\n      configuredCommunityDirectory: this.configuration.communityDirectory,\n      lastBuild: this.lastBuild,\n      public: this.publicStatus(),\n    };\n  }\n\n  #publish(patch = {}) {\n    this.current = { ...this.current, ...patch, lastBuild: this.lastBuild };\n    this.engine?.setIntegration('msfsEfbBuilder', this.publicStatus());\n  }\n"""
value = replace_once(value, old, new, 'builder public status')
write(path, value)

# --- State engine integration defaults ---
path = 'src/state-engine.mjs'
value = read(path)
anchor = """        flightIntelligence: {\n          status: 'waiting',\n"""
insert = """        msfsEfbBuilder: {\n          status: 'not-checked',\n          supported: null,\n          canBuild: false,\n          canInstall: false,\n          building: false,\n          progressPercent: 0,\n          step: 'idle',\n          detail: 'MSFS 2024 EFB package builder has not been checked yet.',\n          sdkDetected: false,\n          communityDetected: false,\n          sdkLabel: null,\n          communityLabel: null,\n          lastBuild: null,\n        },\n        flightIntelligence: {\n          status: 'waiting',\n"""
value = replace_once(value, anchor, insert, 'state builder integration')
write(path, value)

# --- Server integration / API / diagnostics ---
path = 'src/server.mjs'
value = read(path)
value = replace_once(value,
    "import { FlightIntelligenceEngine } from './flight-intelligence-engine.mjs';\n",
    "import { FlightIntelligenceEngine } from './flight-intelligence-engine.mjs';\nimport { MsfsEfbPackageBuilder } from './msfs-efb-package-builder.mjs';\n",
    'server builder import')
value = value.replace("const APP_VERSION = '1.7.0';", "const APP_VERSION = '1.7.1';")
value = replace_once(value,
    """  accessStorageDirectory,\n  updateService,\n} = {}) {\n""",
    """  accessStorageDirectory,\n  msfsEfbBuilderStorageDirectory,\n  updateService,\n} = {}) {\n""",
    'server builder storage option')
value = replace_once(value,
    """  const routeSync = new RouteSyncService(engine);\n  const flightIntelligence = new FlightIntelligenceEngine(engine);\n  const facilityMapCache = new Map();\n""",
    """  const routeSync = new RouteSyncService(engine);\n  const flightIntelligence = new FlightIntelligenceEngine(engine);\n  const msfsEfbBuilder = new MsfsEfbPackageBuilder(engine, {\n    sourceDirectory: path.join(PROJECT_DIR, 'MSFS-2024-EFB-App'),\n    storageDirectory: msfsEfbBuilderStorageDirectory\n      || (flightStorageDirectory ? path.join(path.dirname(flightStorageDirectory), 'msfs-efb-builder') : undefined),\n    appVersion: APP_VERSION,\n  });\n  await msfsEfbBuilder.start();\n  const facilityMapCache = new Map();\n""",
    'server builder instantiate')
value = replace_once(value,
    """      { id: 'route-sync', label: 'Native MSFS EFB Route Bridge', status: state.integrations.routeSync?.status === 'ready' ? 'ready' : state.integrations.routeSync?.status || 'waiting', detail: state.integrations.routeSync?.detail || '' },\n      { id: 'flight-assistant', label: 'Flight Assistant', status: state.integrations.flightAssistant?.status === 'clear' ? 'ready' : state.integrations.flightAssistant?.status || 'waiting', detail: state.integrations.flightAssistant?.detail || '' },\n""",
    """      { id: 'route-sync', label: 'Native MSFS EFB Route Bridge', status: state.integrations.routeSync?.status === 'ready' ? 'ready' : state.integrations.routeSync?.status || 'waiting', detail: state.integrations.routeSync?.detail || '' },\n      { id: 'msfs-efb-builder', label: 'MSFS 2024 EFB Package Builder', status: ['ready', 'built', 'installed'].includes(state.integrations.msfsEfbBuilder?.status) ? 'ready' : state.integrations.msfsEfbBuilder?.status || 'not-checked', detail: state.integrations.msfsEfbBuilder?.detail || '' },\n      { id: 'flight-assistant', label: 'Flight Assistant', status: state.integrations.flightAssistant?.status === 'clear' ? 'ready' : state.integrations.flightAssistant?.status || 'waiting', detail: state.integrations.flightAssistant?.detail || '' },\n""",
    'server builder diagnostics')
value = replace_once(value,
    """      safety: { automationMode: automation.publicConfiguration().mode, gsxRemoteControl: false, turnaroundRemoteServiceControl: false, adapterControlRequiresExplicitRequest: true, groundSafetyAdvisoryOnly: true, flightAssistantAdvisoryOnly: true, routeSyncUsesDocumentedReadApi: true, secretsIncluded: false },\n""",
    """      safety: { automationMode: automation.publicConfiguration().mode, gsxRemoteControl: false, turnaroundRemoteServiceControl: false, adapterControlRequiresExplicitRequest: true, groundSafetyAdvisoryOnly: true, flightAssistantAdvisoryOnly: true, routeSyncUsesDocumentedReadApi: true, communityInstallExplicitOnly: true, microsoftSdkRedistributed: false, secretsIncluded: false },\n""",
    'server builder safety')
api_anchor = """      if (pathname === '/api/pair' && request.method === 'POST') {\n"""
api_insert = """      if (pathname === '/api/msfs-efb-builder/status' && request.method === 'GET') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Der MSFS EFB Package Builder ist nur in der Windows-App verfügbar.' });\n        return json(response, 200, { builder: msfsEfbBuilder.detailedStatus() });\n      }\n\n      if (pathname === '/api/msfs-efb-builder/detect' && request.method === 'POST') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Der MSFS EFB Package Builder ist nur in der Windows-App verfügbar.' });\n        try {\n          const body = await readJsonBody(request);\n          await msfsEfbBuilder.configure({\n            sdkRoot: body.sdkRoot === '' ? null : body.sdkRoot,\n            communityDirectory: body.communityDirectory === '' ? null : body.communityDirectory,\n          });\n          return json(response, 200, { builder: msfsEfbBuilder.detailedStatus() });\n        } catch (error) {\n          return json(response, 422, { error: error.message, builder: msfsEfbBuilder.detailedStatus() });\n        }\n      }\n\n      if (pathname === '/api/msfs-efb-builder/build' && request.method === 'POST') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Der MSFS EFB Package Builder ist nur in der Windows-App verfügbar.' });\n        try {\n          const body = await readJsonBody(request);\n          const options = { install: body.install === true };\n          if (body.sdkRoot) options.sdkRoot = body.sdkRoot;\n          if (body.communityDirectory) options.communityDirectory = body.communityDirectory;\n          await msfsEfbBuilder.build(options);\n          return json(response, 200, { builder: msfsEfbBuilder.detailedStatus() });\n        } catch (error) {\n          return json(response, 409, { error: error.message, builder: msfsEfbBuilder.detailedStatus() });\n        }\n      }\n\n      if (pathname === '/api/msfs-efb-builder/open-output' && request.method === 'POST') {\n        if (!hostAuthenticated) return json(response, 403, { error: 'Builder-Ausgaben können nur in der Windows-App geöffnet werden.' });\n        try {\n          return json(response, 200, await msfsEfbBuilder.openOutput());\n        } catch (error) {\n          return json(response, 409, { error: error.message });\n        }\n      }\n\n      if (pathname === '/api/pair' && request.method === 'POST') {\n"""
value = replace_once(value, api_anchor, api_insert, 'builder API endpoints')
value = replace_once(value,
    """    automationEngine: automation,\n    accessManager,\n    openInDefaultBrowser,\n""",
    """    automationEngine: automation,\n    msfsEfbPackageBuilder: msfsEfbBuilder,\n    accessManager,\n    openInDefaultBrowser,\n""",
    'server returned builder')
value = replace_once(value,
    """  const application = await createTaxiServer({\n    ...options,\n  });\n""",
    """  const application = await createTaxiServer({\n    ...options,\n    msfsEfbBuilderStorageDirectory: path.join(standaloneDataDirectory, 'msfs-efb-builder'),\n  });\n""",
    'server standalone storage')
write(path, value)

# --- Electron storage integration ---
path = 'src/electron-main.mjs'
value = read(path)
value = replace_once(value,
    """    automationStorageDirectory: path.join(app.getPath('userData'), 'automations'),\n    accessStorageDirectory: path.join(app.getPath('userData'), 'access'),\n    updateService,\n""",
    """    automationStorageDirectory: path.join(app.getPath('userData'), 'automations'),\n    accessStorageDirectory: path.join(app.getPath('userData'), 'access'),\n    msfsEfbBuilderStorageDirectory: path.join(app.getPath('userData'), 'msfs-efb-builder'),\n    updateService,\n""",
    'electron builder storage')
write(path, value)

# --- UI HTML ---
path = 'public/index.html'
value = read(path)
value = value.replace('data-app-version="1.7.0"', 'data-app-version="1.7.1"')
value = value.replace('v1.7.0', 'v1.7.1')
value = value.replace('?v=1.7.0', '?v=1.7.1')
health_anchor = """                <div><i id=\"settings-route-sync-dot\"></i><span><strong>MSFS EFB Route Bridge</strong><small id=\"settings-route-sync\">Native EFB-App noch nicht verbunden</small></span></div>\n                <div><i id=\"settings-atc-dot\"></i>"""
health_insert = """                <div><i id=\"settings-route-sync-dot\"></i><span><strong>MSFS EFB Route Bridge</strong><small id=\"settings-route-sync\">Native EFB-App noch nicht verbunden</small></span></div>\n                <div><i id=\"settings-efb-builder-dot\"></i><span><strong>MSFS EFB Package Builder</strong><small id=\"settings-efb-builder\">SDK wird geprüft</small></span></div>\n                <div><i id=\"settings-atc-dot\"></i>"""
value = replace_once(value, health_anchor, health_insert, 'settings health builder row')
card_anchor = """            <article id=\"settings-devices\" data-settings-panel=\"devices\""""
card = """            <article id=\"settings-msfs-efb-builder\" data-settings-panel=\"system\" class=\"efb-card settings-card msfs-efb-builder-card\">\n              <div class=\"section-title\"><div><small>MSFS 2024 COMMUNITY PACKAGE</small><h2>Native EFB Package Builder</h2></div><span id=\"msfs-efb-builder-status\" class=\"module-status waiting\">NOT CHECKED</span></div>\n              <p id=\"msfs-efb-builder-detail\">Flight Deck sucht das installierte MSFS 2024 SDK und den Community2024-Ordner.</p>\n              <div class=\"bridge-facts\"><span><small>SDK</small><b id=\"msfs-efb-builder-sdk\">—</b></span><span><small>COMMUNITY2024</small><b id=\"msfs-efb-builder-community\">—</b></span><span><small>LAST BUILD</small><b id=\"msfs-efb-builder-last\">—</b></span></div>\n              <div class=\"builder-progress\"><i id=\"msfs-efb-builder-progress\"></i></div>\n              <div class=\"builder-path-grid\"><label><span>SDK root <small>(optional override)</small></span><input id=\"msfs-efb-builder-sdk-path\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"C:\\\\MSFS 2024 SDK\"></label><label><span>Community2024 <small>(optional override)</small></span><input id=\"msfs-efb-builder-community-path\" autocomplete=\"off\" spellcheck=\"false\" placeholder=\"…\\\\Packages\\\\Community2024\"></label></div>\n              <div class=\"connector-actions builder-actions\"><button id=\"msfs-efb-builder-detect\" class=\"secondary-card-action\" type=\"button\">SDK PRÜFEN</button><button id=\"msfs-efb-builder-build\" class=\"primary-card-action\" type=\"button\" disabled>PAKET BAUEN</button><button id=\"msfs-efb-builder-install\" class=\"primary-card-action\" type=\"button\" disabled>BAUEN &amp; INSTALLIEREN</button><button id=\"msfs-efb-builder-open\" class=\"secondary-card-action\" type=\"button\" disabled>OUTPUT ÖFFNEN</button></div>\n              <p id=\"msfs-efb-builder-message\" class=\"form-message\" role=\"status\"></p>\n              <small class=\"safety-note\">Verwendet ausschließlich dein lokal installiertes Microsoft SDK/Template. Microsoft-SDK-Dateien werden nicht mit Flight Deck ausgeliefert. Eine Installation in Community2024 erfolgt nur nach deinem expliziten Klick.</small>\n            </article>\n            <article id=\"settings-devices\" data-settings-panel=\"devices\""""
value = replace_once(value, card_anchor, card, 'settings builder card')
write(path, value)

# --- UI JavaScript ---
path = 'public/app.js'
value = read(path)
value = value.replace("./i18n.js?v=1.7.0", "./i18n.js?v=1.7.1")
value = value.replace("./flight-phases.js?v=1.7.0", "./flight-phases.js?v=1.7.1")
value = replace_once(value,
    """  settingsRouteSyncDot: $('#settings-route-sync-dot'),\n  settingsAtcDot: $('#settings-atc-dot'),\n""",
    """  settingsRouteSyncDot: $('#settings-route-sync-dot'),\n  settingsEfbBuilderDot: $('#settings-efb-builder-dot'),\n  settingsAtcDot: $('#settings-atc-dot'),\n""",
    'app builder dot binding')
value = replace_once(value,
    """  settingsRouteSync: $('#settings-route-sync'),\n  settingsAtc: $('#settings-atc'),\n""",
    """  settingsRouteSync: $('#settings-route-sync'),\n  settingsEfbBuilder: $('#settings-efb-builder'),\n  settingsAtc: $('#settings-atc'),\n""",
    'app builder status binding')
element_anchor = """  settingsShareButton: $('#settings-share-button'),\n"""
element_insert = """  msfsEfbBuilderStatus: $('#msfs-efb-builder-status'),\n  msfsEfbBuilderDetail: $('#msfs-efb-builder-detail'),\n  msfsEfbBuilderSdk: $('#msfs-efb-builder-sdk'),\n  msfsEfbBuilderCommunity: $('#msfs-efb-builder-community'),\n  msfsEfbBuilderLast: $('#msfs-efb-builder-last'),\n  msfsEfbBuilderProgress: $('#msfs-efb-builder-progress'),\n  msfsEfbBuilderSdkPath: $('#msfs-efb-builder-sdk-path'),\n  msfsEfbBuilderCommunityPath: $('#msfs-efb-builder-community-path'),\n  msfsEfbBuilderDetect: $('#msfs-efb-builder-detect'),\n  msfsEfbBuilderBuild: $('#msfs-efb-builder-build'),\n  msfsEfbBuilderInstall: $('#msfs-efb-builder-install'),\n  msfsEfbBuilderOpen: $('#msfs-efb-builder-open'),\n  msfsEfbBuilderMessage: $('#msfs-efb-builder-message'),\n  settingsShareButton: $('#settings-share-button'),\n"""
value = replace_once(value, element_anchor, element_insert, 'app builder element bindings')
render_anchor = """function renderPhase3(state) {\n  const intelligence = state.integrations?.flightIntelligence || {};\n"""
render_insert = """function renderMsfsEfbBuilder(state) {\n  if (!elements.msfsEfbBuilderStatus) return;\n  const builder = state?.integrations?.msfsEfbBuilder || state?.builder || {};\n  const status = String(builder.status || 'not-checked').toLowerCase();\n  const ready = ['ready', 'built', 'installed'].includes(status);\n  const attention = ['error'].includes(status);\n  const className = ready ? 'connected' : attention ? 'attention' : 'waiting';\n  elements.msfsEfbBuilderStatus.className = `module-status ${className}`;\n  elements.msfsEfbBuilderStatus.textContent = status.replace(/-/g, ' ').toUpperCase();\n  elements.msfsEfbBuilderDetail.textContent = builder.detail || 'MSFS 2024 SDK has not been checked yet.';\n  elements.msfsEfbBuilderSdk.textContent = builder.sdkDetected || builder.sdk?.ready ? 'READY' : status === 'unsupported' ? 'WINDOWS ONLY' : 'NOT FOUND';\n  elements.msfsEfbBuilderCommunity.textContent = builder.communityDetected || builder.communityDirectory ? 'READY' : 'NOT FOUND';\n  const lastBuild = builder.lastBuild;\n  elements.msfsEfbBuilderLast.textContent = lastBuild?.builtAt ? `${lastBuild.installed ? 'INSTALLED · ' : ''}${formatTime(lastBuild.builtAt) || 'BUILT'}` : '—';\n  const progress = Math.max(0, Math.min(100, Number(builder.progressPercent) || 0));\n  elements.msfsEfbBuilderProgress.style.width = `${progress}%`;\n  const building = builder.building === true || status === 'building';\n  elements.msfsEfbBuilderDetect.disabled = building;\n  elements.msfsEfbBuilderBuild.disabled = building || builder.canBuild !== true;\n  elements.msfsEfbBuilderInstall.disabled = building || builder.canInstall !== true;\n  elements.msfsEfbBuilderOpen.disabled = building || !lastBuild;\n  if (elements.settingsEfbBuilderDot) elements.settingsEfbBuilderDot.className = className;\n  if (elements.settingsEfbBuilder) elements.settingsEfbBuilder.textContent = builder.detail || 'SDK wird geprüft';\n  const active = document.activeElement;\n  if (builder.configuredSdkRoot !== undefined && active !== elements.msfsEfbBuilderSdkPath) elements.msfsEfbBuilderSdkPath.value = builder.configuredSdkRoot || '';\n  if (builder.configuredCommunityDirectory !== undefined && active !== elements.msfsEfbBuilderCommunityPath) elements.msfsEfbBuilderCommunityPath.value = builder.configuredCommunityDirectory || '';\n}\n\nasync function requestMsfsEfbBuilder(action, { install = false } = {}) {\n  const endpoint = action === 'detect' ? '/api/msfs-efb-builder/detect'\n    : action === 'open' ? '/api/msfs-efb-builder/open-output' : '/api/msfs-efb-builder/build';\n  const controls = [elements.msfsEfbBuilderDetect, elements.msfsEfbBuilderBuild, elements.msfsEfbBuilderInstall, elements.msfsEfbBuilderOpen].filter(Boolean);\n  for (const control of controls) control.disabled = true;\n  elements.msfsEfbBuilderMessage.textContent = action === 'open' ? 'Opening output …' : action === 'detect' ? 'Checking SDK …' : 'Building native EFB package …';\n  try {\n    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' } };\n    if (action !== 'open') {\n      const sdkRoot = elements.msfsEfbBuilderSdkPath.value.trim();\n      const communityDirectory = elements.msfsEfbBuilderCommunityPath.value.trim();\n      const body = { install };\n      if (action === 'detect') {\n        body.sdkRoot = sdkRoot;\n        body.communityDirectory = communityDirectory;\n      } else {\n        if (sdkRoot) body.sdkRoot = sdkRoot;\n        if (communityDirectory) body.communityDirectory = communityDirectory;\n      }\n      options.body = JSON.stringify(body);\n    }\n    const response = await fetch(authenticatedUrl(endpoint), options);\n    const data = await response.json();\n    if (data.builder) renderMsfsEfbBuilder({ integrations: { msfsEfbBuilder: data.builder } });\n    if (!response.ok) throw new Error(data.error || 'MSFS EFB builder action failed.');\n    elements.msfsEfbBuilderMessage.textContent = action === 'open' ? 'Output opened.' : data.builder?.detail || 'Done.';\n  } catch (error) {\n    elements.msfsEfbBuilderMessage.textContent = error.message;\n  } finally {\n    if (latestState) renderMsfsEfbBuilder(latestState);\n  }\n}\n\nfunction renderPhase3(state) {\n  renderMsfsEfbBuilder(state);\n  const intelligence = state.integrations?.flightIntelligence || {};\n"""
value = replace_once(value, render_anchor, render_insert, 'builder render and actions')
events_anchor = """elements.checkUpdate.addEventListener('click', () => checkForUpdate());\n"""
events_insert = """elements.msfsEfbBuilderDetect?.addEventListener('click', () => requestMsfsEfbBuilder('detect'));\nelements.msfsEfbBuilderBuild?.addEventListener('click', () => requestMsfsEfbBuilder('build'));\nelements.msfsEfbBuilderInstall?.addEventListener('click', () => {\n  if (!window.confirm('Flight Deck EFB jetzt bauen und in Community2024 installieren? Ein vorhandenes Flight-Deck-Paket wird ersetzt.')) return;\n  requestMsfsEfbBuilder('build', { install: true });\n});\nelements.msfsEfbBuilderOpen?.addEventListener('click', () => requestMsfsEfbBuilder('open'));\nelements.checkUpdate.addEventListener('click', () => checkForUpdate());\n"""
value = replace_once(value, events_anchor, events_insert, 'builder event listeners')
write(path, value)

# --- CSS ---
path = 'public/styles.css'
value = read(path)
value += """\n\n/* 1.7.1 · MSFS 2024 native EFB package builder */\n.msfs-efb-builder-card { grid-column: 1 / -1; }\n.builder-path-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin:14px 0; }\n.builder-path-grid label { display:flex; flex-direction:column; gap:6px; min-width:0; }\n.builder-path-grid label > span { color:var(--muted, #8faaba); font-size:12px; font-weight:700; letter-spacing:.02em; }\n.builder-path-grid input { width:100%; min-width:0; }\n.builder-progress { height:6px; overflow:hidden; margin:12px 0 4px; border-radius:99px; background:rgba(143,170,186,.12); }\n.builder-progress > i { display:block; width:0; height:100%; border-radius:inherit; background:currentColor; transition:width .25s ease; }\n.builder-actions { flex-wrap:wrap; }\n.msfs-efb-builder-card .safety-note { display:block; margin-top:10px; }\n@media (max-width:900px) { .builder-path-grid { grid-template-columns:1fr; } }\n"""
write(path, value)

# --- Service worker ---
path = 'public/service-worker.js'
value = read(path).replace("flight-deck-efb-v170", "flight-deck-efb-v171").replace('?v=1.7.0', '?v=1.7.1')
write(path, value)

# --- Version package files ---
path = 'package.json'
pkg = json.loads(read(path))
pkg['version'] = '1.7.1'
pkg['description'] = 'Flight Deck EFB for MSFS with a local MSFS 2024 native EFB Community package builder, route bridging, flight intelligence, turnaround coordination, taxi safety and guarded simulator integrations.'
write(path, json.dumps(pkg, indent=2) + '\n')

path = 'package-lock.json'
value = read(path)
value = re.sub(r'("version"\s*:\s*")1\.7\.0("\s*,)', r'\g<1>1.7.1\2', value, count=2)
write(path, value)

# --- Documentation ---
path = 'CHANGELOG.md'
value = read(path)
section = """## 1.7.1 — Native EFB Community Package Builder\n\n- Added a Windows-hosted MSFS 2024 EFB Package Builder that detects the locally installed SDK/EFB template and uses the installed `fspackagetool.exe` instead of redistributing Microsoft SDK files.\n- Added automatic `Community2024` discovery by reading `InstalledPackagesPath` from the user's existing `UserCfg.opt`; Flight Deck never modifies that file.\n- Added explicit **Build Package** and **Build & Install** actions plus ZIP export and Explorer output access. Community installation is never performed without an explicit user action.\n- Builder work happens in an isolated local copy of the SDK EFB sample, preserving compatibility with the user's installed SDK project format.\n- SDK/Community paths and detailed build output remain Windows-host-only; paired tablets receive only sanitized builder readiness/progress state.\n- Added builder status, progress, path overrides and diagnostics to Settings, plus release-CI contract checks for the new service and UI.\n\n"""
value = replace_once(value, '# Flight Deck EFB changelog\n\n', '# Flight Deck EFB changelog\n\n' + section, 'changelog 1.7.1')
write(path, value)

path = 'README.md'
value = read(path)
value = value.replace('**Current release: 1.7.0 — Phase 3 Native EFB & Flight Intelligence**', '**Current release: 1.7.1 — Native EFB Community Package Builder**')
old = '## 1.7.0 highlights\n\n'
new = """## 1.7.1 highlights\n\n- **One-click native EFB builder:** Settings → System can detect the locally installed MSFS 2024 SDK/EFB sample and build Flight Deck with that exact Microsoft template.\n- **Official Package Tool path:** the builder invokes the user's installed `fspackagetool.exe` to compile the Community package; Microsoft SDK/template files are not distributed with Flight Deck.\n- **Community2024 detection:** Flight Deck reads the existing `InstalledPackagesPath` from `UserCfg.opt` and targets `Community2024`. It never changes `UserCfg.opt`.\n- **Explicit install only:** **PAKET BAUEN** creates a reusable local package/ZIP; **BAUEN & INSTALLIEREN** additionally copies the finished package into Community2024 after an explicit confirmation.\n- **Private local paths:** full SDK/Community/build paths remain inside the Windows host and are not exposed to paired tablets or support exports.\n\n## 1.7.0 highlights\n\n"""
value = replace_once(value, old, new, 'README highlights')
value = value.replace('Flight-Deck-EFB-Setup-1.7.0.exe', 'Flight-Deck-EFB-Setup-1.7.1.exe')
native_anchor = '## Native MSFS 2024 EFB app\n'
if native_anchor in value:
    value = value.replace(native_anchor, """## Native MSFS 2024 EFB app\n\n### Recommended: build from Flight Deck\n\n1. Install the MSFS 2024 SDK from Developer Mode if it is not already installed.\n2. Open **Settings → System → Native EFB Package Builder**.\n3. Select **SDK PRÜFEN**. Flight Deck checks the installed EFB sample and `fspackagetool.exe` and reads the existing `InstalledPackagesPath` from `UserCfg.opt` to locate `Community2024`.\n4. Select **PAKET BAUEN** to create a reusable Community package plus ZIP, or **BAUEN & INSTALLIEREN** to additionally copy the finished package into `Community2024`.\n5. Restart/reload the simulator package list and open **Flight Deck EFB** in the simulator EFB.\n\nThe builder copies the Microsoft sample only into an isolated local workspace for the build. Microsoft SDK files are never shipped with Flight Deck or uploaded anywhere. Manual path overrides remain available for non-standard SDK/Community installations.\n\n""", 1)
write(path, value)

path = 'MSFS-2024-EFB-App/README.md'
value = read(path)
value = value.replace('Flight Deck EFB 1.7.0', 'Flight Deck EFB 1.7.1')
manual_anchor = '## Build with your installed MSFS 2024 SDK\n'
recommended = """## Recommended build method in 1.7.1\n\nUse the Windows app under **Settings → System → Native EFB Package Builder**. It detects the installed SDK/EFB sample and `fspackagetool.exe`, prepares an isolated copy of the SDK sample, replaces only the Flight Deck app source, builds the template and exports a Community package/ZIP. If requested explicitly, it can copy the finished package to `Community2024`.\n\nThe builder reads `InstalledPackagesPath` from the existing MSFS `UserCfg.opt` to locate the package root; it never modifies that file. Full local paths stay in the Windows host and are not shared with paired tablets.\n\n## Manual build with your installed MSFS 2024 SDK\n"""
value = replace_once(value, manual_anchor, recommended, 'native README builder section')
write(path, value)

path = 'PRIVACY.md'
value = read(path).replace('Effective for version 1.7.0', 'Effective for version 1.7.1')
value += """\n\n## MSFS 2024 EFB Package Builder\n\nThe optional builder reads the locally installed MSFS 2024 SDK/template and may read `UserCfg.opt` only to determine `InstalledPackagesPath`/`Community2024`. It does not modify `UserCfg.opt`, upload SDK files, or send local SDK/Community paths to paired devices. Optional path overrides, build logs and package exports are stored locally on the Windows host. Installation into Community2024 occurs only after an explicit user action.\n"""
write(path, value)

path = 'THIRD_PARTY_NOTICES.md'
value = read(path).replace('Third-party notices — Flight Deck EFB 1.7.0', 'Third-party notices — Flight Deck EFB 1.7.1')
value += """\n\n## Microsoft Flight Simulator 2024 SDK build integration\n\nFlight Deck EFB does not redistribute the Microsoft Flight Simulator SDK or EFB template. The optional local package builder operates on the SDK/template installed by the user and invokes the user's installed `fspackagetool.exe`. Those Microsoft files retain their original terms and remain local to the user's PC.\n"""
write(path, value)

# sanity sweep
for file_name in ['package.json', 'public/index.html', 'public/service-worker.js', 'README.md', 'PRIVACY.md', 'THIRD_PARTY_NOTICES.md']:
    if '1.7.0' in read(file_name) and file_name in {'package.json', 'public/index.html', 'public/service-worker.js'}:
        raise RuntimeError(f'stale runtime version in {file_name}')

print('Phase 3.1 / 1.7.1 migration applied.')
