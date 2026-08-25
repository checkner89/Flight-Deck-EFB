import { applyTranslations, localeFor, resolveLanguage, translate } from './i18n.js?v=1.7.2';
import {
  FLIGHT_PHASES,
  PHASE_ACTIONS,
  calculateFlightProgress,
  calculateFlightTimeline,
  phaseChecklist,
  resolveFlightPhase,
} from './flight-phases.js?v=1.7.2';

const $ = (selector) => document.querySelector(selector);

const elements = {
  app: $('#app'),
  appToolbar: $('#app-toolbar'),
  appHomeButton: $('#app-home-button'),
  appToolbarIcon: $('#app-toolbar-icon'),
  appToolbarTitle: $('#app-toolbar-title'),
  appToolbarContext: $('#app-toolbar-context'),
  mapStage: $('.map-stage'),
  efbPages: $('#efb-pages'),
  efbPageSections: [...document.querySelectorAll('.efb-page[data-page]')],
  callsign: $('#callsign'),
  origin: $('#origin'),
  destination: $('#destination'),
  runway: $('#runway'),
  planButton: $('#plan-button'),
  siStatus: $('#si-status'),
  simStatus: $('#sim-status'),
  clearanceCard: $('#clearance-card'),
  clearanceStation: $('#clearance-station'),
  clearanceText: $('#clearance-text'),
  clearanceTime: $('#clearance-time'),
  routeSource: $('#route-source'),
  guidanceCard: $('#guidance-card'),
  guidanceIcon: $('#guidance-icon'),
  guidanceLabel: $('#guidance-label'),
  deviation: $('#deviation'),
  remaining: $('#remaining'),
  groundSpeed: $('#ground-speed'),
  gateName: $('#gate-name'),
  followButton: $('#follow-button'),
  fitButton: $('#fit-button'),
  fullscreenButton: $('#fullscreen-button'),
  refreshMapButton: $('#refresh-map-button'),
  mapStatus: $('#map-status'),
  mapAirport: $('#map-airport'),
  mapStatusText: $('#map-status-text'),
  shareButton: $('#share-button'),
  quickThemeToggle: $('#quick-theme-toggle'),
  shareDialog: $('#share-dialog'),
  shareQr: $('#share-qr'),
  pairingPin: $('#pairing-pin'),
  sharingUrls: $('#sharing-urls'),
  emptyState: $('#empty-state'),
  emptySi: $('#empty-si'),
  emptySim: $('#empty-sim'),
  warningBanner: $('#warning-banner'),
  warningDetail: $('#warning-detail'),
  warningNewFlight: $('#warning-new-flight'),
  demoBadge: $('#demo-badge'),
  pairOverlay: $('#pair-overlay'),
  pairForm: $('#pair-form'),
  pinInput: $('#pin-input'),
  pairError: $('#pair-error'),
  openPlanEmpty: $('#open-plan-empty'),
  planDialog: $('#plan-dialog'),
  plannerClose: $('#planner-close'),
  airportSearch: $('#airport-search'),
  airportSearchSpinner: $('#airport-search-spinner'),
  airportResults: $('#airport-results'),
  selectedAirport: $('#selected-airport'),
  selectedAirportIcao: $('#selected-airport-icao'),
  selectedAirportName: $('#selected-airport-name'),
  changeAirport: $('#change-airport'),
  plannerMode: $('#planner-mode'),
  runwayField: $('#runway-field'),
  holdingPointField: $('#holding-point-field'),
  plannerHoldingPoint: $('#planner-holding-point'),
  plannerRunway: $('#planner-runway'),
  startField: $('#start-field'),
  plannerStart: $('#planner-start'),
  destinationField: $('#destination-field'),
  plannerDestination: $('#planner-destination'),
  customFields: $('#custom-fields'),
  pickCustomStart: $('#pick-custom-start'),
  pickCustomEnd: $('#pick-custom-end'),
  customStartValue: $('#custom-start-value'),
  customEndValue: $('#custom-end-value'),
  findRoutes: $('#find-routes'),
  plannerMessage: $('#planner-message'),
  routeOptions: $('#route-options'),
  routeCount: $('#route-count'),
  startGuidance: $('#start-guidance'),
  clearPlan: $('#clear-plan'),
  homeClock: $('#home-clock'),
  homeGreeting: $('#home-greeting'),
  homeSimbriefImport: $('#home-simbrief-import'),
  homeNextStep: $('#home-next-step'),
  homeNextStepTitle: $('#home-next-step-title'),
  homeNextStepDetail: $('#home-next-step-detail'),
  homeNextStepAction: $('#home-next-step-action'),
  homeCallsign: $('#home-callsign'),
  homeOrigin: $('#home-origin'),
  homeDestination: $('#home-destination'),
  homeAirport: $('#home-airport'),
  homeRunway: $('#home-runway'),
  homeGate: $('#home-gate'),
  homeAtcSource: $('#home-atc-source'),
  homeAtcDetail: $('#home-atc-detail'),
  homeTaxiSummary: $('#home-taxi-summary'),
  homePlannerApp: $('#home-planner-app'),
  homeNavigraphSummary: $('#home-navigraph-summary'),
  homeGsxSummary: $('#home-gsx-summary'),
  chartsStatusPill: $('#charts-status-pill'),
  chartsAirport: $('#charts-airport'),
  chartsSimGate: $('#charts-sim-gate'),
  navigraphDetail: $('#navigraph-detail'),
  gsxStatusPill: $('#gsx-status-pill'),
  gsxTitle: $('#gsx-title'),
  gsxDetail: $('#gsx-detail'),
  gsxInstall: $('#gsx-install'),
  gsxSim: $('#gsx-sim'),
  gsxControl: $('#gsx-control'),
  gsxServiceStatus: $('#gsx-service-status'),
  gsxServices: $('#gsx-services'),
  atcActivePill: $('#atc-active-pill'),
  providerButtons: [...document.querySelectorAll('.provider-selector [data-provider]')],
  atcSiDot: $('#atc-si-dot'),
  atcBatcDot: $('#atc-batc-dot'),
  atcSiDetail: $('#atc-si-detail'),
  atcBatcDetail: $('#atc-batc-detail'),
  atcClearanceStation: $('#atc-clearance-station'),
  atcClearanceText: $('#atc-clearance-text'),
  atcClearanceTime: $('#atc-clearance-time'),
  siMessageViewButtons: [...document.querySelectorAll('[data-si-message-view]')],
  atcSiMessageList: $('#atc-si-message-list'),
  manualClearanceInput: $('#manual-clearance-input'),
  manualClearanceMessage: $('#manual-clearance-message'),
  applyManualClearance: $('#apply-manual-clearance'),
  settingsMsfsDot: $('#settings-msfs-dot'),
  settingsLnmDot: $('#settings-lnm-dot'),
  settingsAdapterDot: $('#settings-adapter-dot'),
  settingsIntelligenceDot: $('#settings-intelligence-dot'),
  settingsRouteSyncDot: $('#settings-route-sync-dot'),
  settingsEfbBuilderDot: $('#settings-efb-builder-dot'),
  settingsAtcDot: $('#settings-atc-dot'),
  settingsNavDot: $('#settings-nav-dot'),
  settingsGsxDot: $('#settings-gsx-dot'),
  settingsMsfs: $('#settings-msfs'),
  settingsLnm: $('#settings-lnm'),
  settingsAdapter: $('#settings-adapter'),
  settingsIntelligence: $('#settings-intelligence'),
  settingsRouteSync: $('#settings-route-sync'),
  settingsEfbBuilder: $('#settings-efb-builder'),
  settingsAtc: $('#settings-atc'),
  settingsNav: $('#settings-nav'),
  settingsGsx: $('#settings-gsx'),
  msfsEfbBuilderStatus: $('#msfs-efb-builder-status'),
  msfsEfbBuilderDetail: $('#msfs-efb-builder-detail'),
  msfsEfbBuilderSdk: $('#msfs-efb-builder-sdk'),
  msfsEfbBuilderCommunity: $('#msfs-efb-builder-community'),
  msfsEfbBuilderLast: $('#msfs-efb-builder-last'),
  msfsEfbBuilderProgress: $('#msfs-efb-builder-progress'),
  msfsEfbBuilderSdkPath: $('#msfs-efb-builder-sdk-path'),
  msfsEfbBuilderCommunityPath: $('#msfs-efb-builder-community-path'),
  msfsEfbBuilderDetect: $('#msfs-efb-builder-detect'),
  msfsEfbBuilderBuild: $('#msfs-efb-builder-build'),
  msfsEfbBuilderInstall: $('#msfs-efb-builder-install'),
  msfsEfbBuilderOpen: $('#msfs-efb-builder-open'),
  msfsEfbBuilderMessage: $('#msfs-efb-builder-message'),
  settingsShareButton: $('#settings-share-button'),
  newFlightButton: $('#new-flight-button'),
  homeNewFlight: $('#home-new-flight'),
  settingsNewFlight: $('#settings-new-flight'),
  newFlightDialog: $('#new-flight-dialog'),
  confirmNewFlight: $('#confirm-new-flight'),
  languageSelect: $('#language-select'),
  themeSelect: $('#theme-select'),
  textSizeSelect: $('#text-size-select'),
  weightUnitSelect: $('#weight-unit-select'),
  distanceUnitSelect: $('#distance-unit-select'),
  pressureUnitSelect: $('#pressure-unit-select'),
  temperatureUnitSelect: $('#temperature-unit-select'),
  clockFormatSelect: $('#clock-format-select'),
  showPhaseHome: $('#show-phase-home'),
  pilotProfileSelect: $('#pilot-profile-select'),
  applyPilotProfile: $('#apply-pilot-profile'),
  alertModeSelect: $('#alert-mode-select'),
  arrivalTriggerSelect: $('#arrival-trigger-select'),
  fuelBufferSelect: $('#fuel-buffer-select'),
  focusModeDefault: $('#focus-mode-default'),
  resetAppLayout: $('#reset-app-layout'),
  appCustomizationList: $('#app-customization-list'),
  appTiles: [...document.querySelectorAll('[data-app-id]')],
  homePhaseCard: $('#home-phase-card'),
  homePhaseTitle: $('#home-phase-title'),
  homePhaseSource: $('#home-phase-source'),
  homeOpenFlightHub: $('#home-open-flight-hub'),
  homePhaseRail: $('#home-phase-rail'),
  homeNextWaypoint: $('#home-next-waypoint'),
  homeFlightRemaining: $('#home-flight-remaining'),
  homeFlightEta: $('#home-flight-eta'),
  homeFlightFuel: $('#home-flight-fuel'),
  homePhaseActions: $('#home-phase-actions'),
  homeAssistantStatus: $('#home-assistant-status'),
  homeAssistantDetail: $('#home-assistant-detail'),
  homeAssistantList: $('#home-assistant-list'),
  flightIntelligenceStatus: $('#flight-intelligence-status'),
  flightIntelligencePhase: $('#flight-intelligence-phase'),
  flightIntelligenceRaw: $('#flight-intelligence-raw'),
  flightIntelligenceConfidence: $('#flight-intelligence-confidence'),
  flightIntelligenceDetail: $('#flight-intelligence-detail'),
  flightIntelligenceEvidence: $('#flight-intelligence-evidence'),
  routeSyncStatus: $('#route-sync-status'),
  routeSyncFlightdeck: $('#route-sync-flightdeck'),
  routeSyncMsfs: $('#route-sync-msfs'),
  routeSyncMatch: $('#route-sync-match'),
  routeSyncAvionics: $('#route-sync-avionics'),
  routeSyncDetail: $('#route-sync-detail'),
  routeSyncDifferences: $('#route-sync-differences'),
  turnaroundStatus: $('#turnaround-status'),
  turnaroundStage: $('#turnaround-stage'),
  turnaroundProgress: $('#turnaround-progress'),
  turnaroundProgressBar: $('#turnaround-progress-bar'),
  turnaroundDetail: $('#turnaround-detail'),
  turnaroundNext: $('#turnaround-next'),
  turnaroundBlockers: $('#turnaround-blockers'),
  flightPhaseTitle: $('#flight-phase-title'),
  flightPhaseDescription: $('#flight-phase-description'),
  flightPhaseSelect: $('#flight-phase-select'),
  flightPhaseSource: $('#flight-phase-source'),
  flightPhaseRail: $('#flight-phase-rail'),
  focusModeButton: $('#focus-mode-button'),
  journeyReadiness: $('#journey-readiness'),
  journeyReadinessIcon: $('#journey-readiness-icon'),
  journeyReadinessTitle: $('#journey-readiness-title'),
  journeyReadinessDetail: $('#journey-readiness-detail'),
  journeyAlertList: $('#journey-alert-list'),
  reviewOpenItems: $('#review-open-items'),
  journeyChecklistCard: $('#journey-checklist-card'),
  journeyRouteIdent: $('#journey-route-ident'),
  journeyProgressValue: $('#journey-progress-value'),
  journeyProgressBar: $('#journey-progress-bar'),
  journeyNextWaypoint: $('#journey-next-waypoint'),
  journeyNextDistance: $('#journey-next-distance'),
  journeyRemaining: $('#journey-remaining'),
  journeyEta: $('#journey-eta'),
  journeyFuel: $('#journey-fuel'),
  journeyFuelDelta: $('#journey-fuel-delta'),
  journeyWind: $('#journey-wind'),
  journeyTemperature: $('#journey-temperature'),
  phaseActionList: $('#phase-action-list'),
  phaseChecklistProgress: $('#phase-checklist-progress'),
  phaseChecklistList: $('#phase-checklist-list'),
  flightTimeline: $('#flight-timeline'),
  timelineStatus: $('#timeline-status'),
  flightNotesStatus: $('#flight-notes-status'),
  flightNotes: $('#flight-notes'),
  flightStatusPill: $('#flight-status-pill'),
  simbriefIdentifier: $('#simbrief-identifier'),
  simbriefImport: $('#simbrief-import'),
  simbriefMessage: $('#simbrief-message'),
  simbriefGenerated: $('#simbrief-generated'),
  simbriefOrigin: $('#simbrief-origin'),
  simbriefDestination: $('#simbrief-destination'),
  simbriefCallsign: $('#simbrief-callsign'),
  simbriefAircraft: $('#simbrief-aircraft'),
  simbriefRunways: $('#simbrief-runways'),
  simbriefFuel: $('#simbrief-fuel'),
  simbriefPax: $('#simbrief-pax'),
  simbriefEet: $('#simbrief-eet'),
  simbriefRoute: $('#simbrief-route'),
  liveAircraftStatus: $('#live-aircraft-status'),
  liveAircraftType: $('#live-aircraft-type'),
  liveAltitude: $('#live-altitude'),
  liveSpeeds: $('#live-speeds'),
  liveVs: $('#live-vs'),
  liveWeights: $('#live-weights'),
  liveWeather: $('#live-weather'),
  liveAtmosphere: $('#live-atmosphere'),
  liveConfiguration: $('#live-configuration'),
  liveParkingBrake: $('#live-parking-brake'),
  liveEngines: $('#live-engines'),
  liveXpdr: $('#live-xpdr'),
  liveCom1: $('#live-com1'),
  liveCom2: $('#live-com2'),
  briefingStatusPill: $('#briefing-status-pill'),
  briefingWeatherTime: $('#briefing-weather-time'),
  briefingAirports: $('#briefing-airports'),
  briefingFrequencyList: $('#briefing-frequency-list'),
  briefingCommsList: $('#briefing-comms-list'),
  briefingPhase: $('#briefing-phase'),
  comStatusPill: $('#com-status-pill'),
  com1Active: $('#com1-active'),
  com1Standby: $('#com1-standby'),
  com1ActiveIdent: $('#com1-active-ident'),
  com1StandbyIdent: $('#com1-standby-ident'),
  com1Receive: $('#com1-rx'),
  com1Transmit: $('#com1-tx'),
  com1FrequencyInput: $('#com1-frequency-input'),
  com2Active: $('#com2-active'),
  com2Standby: $('#com2-standby'),
  com2ActiveIdent: $('#com2-active-ident'),
  com2StandbyIdent: $('#com2-standby-ident'),
  com2Receive: $('#com2-rx'),
  com2Transmit: $('#com2-tx'),
  com2FrequencyInput: $('#com2-frequency-input'),
  comFrequencyPresets: $('#com-frequency-presets'),
  comMessage: $('#com-message'),
  comNextStationCard: $('#com-next-station-card'),
  comNextStation: $('#com-next-station'),
  comNextFrequency: $('#com-next-frequency'),
  comNextReason: $('#com-next-reason'),
  comNextTune: $('#com-next-tune'),
  comActionButtons: [...document.querySelectorAll('[data-com-action]')],
  flightboardStatusPill: $('#flightboard-status-pill'),
  flightboardAirport: $('#flightboard-airport'),
  flightboardTabs: [...document.querySelectorAll('[data-traffic-view]')],
  flightboardRefresh: $('#flightboard-refresh'),
  flightboardList: $('#flightboard-list'),
  flightboardUpdated: $('#flightboard-updated'),
  navigraphLogin: $('#navigraph-login'),
  navigraphLogout: $('#navigraph-logout'),
  navigraphLoginCode: $('#navigraph-login-code'),
  navigraphUserCode: $('#navigraph-user-code'),
  navigraphVerificationLink: $('#navigraph-verification-link'),
  gsxSetupSteps: $('#gsx-setup-steps'),
  gsxRefresh: $('#gsx-refresh'),
  networkButtons: [...document.querySelectorAll('[data-network]')],
  onlineRefresh: $('#online-refresh'),
  onlineStatusPill: $('#online-status-pill'),
  onlineDetail: $('#online-detail'),
  onlineUpdated: $('#online-updated'),
  onlineAirports: $('#online-airports'),
  onlineControllerList: $('#online-controller-list'),
  onlineAtisList: $('#online-atis-list'),
  fenixStatusPill: $('#fenix-status-pill'),
  fenixDetail: $('#fenix-detail'),
  fenixUrl: $('#fenix-url'),
  fenixConnect: $('#fenix-connect'),
  fenixEmbed: $('#fenix-embed'),
  fenixOpen: $('#fenix-open'),
  fenixFrame: $('#fenix-frame'),
  fenixPlaceholder: $('#fenix-placeholder'),
  homeFenixSummary: $('#home-fenix-summary'),
  aircraftAdapterStatus: $('#aircraft-adapter-status'),
  aircraftAdapterModel: $('#aircraft-adapter-model'),
  aircraftAdapterSource: $('#aircraft-adapter-source'),
  aircraftAdapterDetail: $('#aircraft-adapter-detail'),
  aircraftAdapterControls: $('#aircraft-adapter-controls'),
  aircraftAdapterRefresh: $('#aircraft-adapter-refresh'),
  pmdgStatusPill: $('#pmdg-status-pill'),
  pmdgFamily: $('#pmdg-family'),
  pmdgSdk: $('#pmdg-sdk'),
  pmdgBroadcast: $('#pmdg-broadcast'),
  pmdgControls: $('#pmdg-controls'),
  groundSafetyStatus: $('#ground-safety-status'),
  groundSafetyDetail: $('#ground-safety-detail'),
  groundSafetyList: $('#ground-safety-list'),
  gsxPayloadStatus: $('#gsx-payload-status'),
  gsxPaxTarget: $('#gsx-pax-target'),
  gsxPaxProgress: $('#gsx-pax-progress'),
  gsxCargoProgress: $('#gsx-cargo-progress'),
  gsxPayloadSync: $('#gsx-payload-sync'),
  gsxPayloadMessage: $('#gsx-payload-message'),
  automationStatusPill: $('#automation-status-pill'),
  automationMode: $('#automation-mode'),
  automationDetail: $('#automation-detail'),
  automationVariableCount: $('#automation-variable-count'),
  automationVariableLabel: $('#automation-variable-label'),
  automationVariableName: $('#automation-variable-name'),
  automationVariableUnit: $('#automation-variable-unit'),
  automationAddVariable: $('#automation-add-variable'),
  automationVariableList: $('#automation-variable-list'),
  automationRuleName: $('#automation-rule-name'),
  automationTriggerType: $('#automation-trigger-type'),
  automationTriggerValue: $('#automation-trigger-value'),
  automationConditionField: $('#automation-condition-field'),
  automationOperator: $('#automation-operator'),
  automationComparisonValue: $('#automation-comparison-value'),
  automationActionType: $('#automation-action-type'),
  automationActionTarget: $('#automation-action-target'),
  automationTargetOptions: $('#automation-target-options'),
  automationActionValue: $('#automation-action-value'),
  automationCooldown: $('#automation-cooldown'),
  automationGroundGuard: $('#automation-ground-guard'),
  automationMaxSpeed: $('#automation-max-speed'),
  automationAircraftMatch: $('#automation-aircraft-match'),
  automationAddRule: $('#automation-add-rule'),
  automationFormMessage: $('#automation-form-message'),
  automationRuleCount: $('#automation-rule-count'),
  automationRuleList: $('#automation-rule-list'),
  automationLogStatus: $('#automation-log-status'),
  automationLogList: $('#automation-log-list'),
  trackingStatusPill: $('#tracking-status-pill'),
  trackingViewState: $('#tracking-view-state'),
  trackingRouteIdent: $('#tracking-route-ident'),
  trackingBasemapButtons: [...document.querySelectorAll('[data-tracking-basemap]')],
  trackingFollow: $('#tracking-follow'),
  trackingFit: $('#tracking-fit'),
  trackingAltitude: $('#tracking-altitude'),
  trackingSpeed: $('#tracking-speed'),
  trackingHeading: $('#tracking-heading'),
  trackingDistance: $('#tracking-distance'),
  trackingDuration: $('#tracking-duration'),
  trackingFuel: $('#tracking-fuel'),
  trackingRecorderTitle: $('#tracking-recorder-title'),
  trackingPointCount: $('#tracking-point-count'),
  trackingRecordMessage: $('#tracking-record-message'),
  trackingStart: $('#tracking-start'),
  trackingSave: $('#tracking-save'),
  trackingLive: $('#tracking-live'),
  trackingArchiveCount: $('#tracking-archive-count'),
  flightArchiveList: $('#flight-archive-list'),
  trackingWaypointCount: $('#tracking-waypoint-count'),
  trackingRouteSummary: $('#tracking-route-summary'),
  trackingWaypointList: $('#tracking-waypoint-list'),
  trackingWeatherTime: $('#tracking-weather-time'),
  trackingWeatherList: $('#tracking-weather-list'),
  trackingFlightDate: $('#tracking-flight-date'),
  trackingDetailGrid: $('#tracking-detail-grid'),
  trackingFlightNotesPanel: $('#tracking-flight-notes-panel'),
  trackingFlightNotesText: $('#tracking-flight-notes-text'),
  trackingFlightChecklistSummary: $('#tracking-flight-checklist-summary'),
  trackingArchiveActions: $('#tracking-archive-actions'),
  trackingExportGpx: $('#tracking-export-gpx'),
  trackingExportJson: $('#tracking-export-json'),
  trackingDelete: $('#tracking-delete'),
  diagnosticsStatus: $('#diagnostics-status'),
  diagnosticsList: $('#diagnostics-list'),
  runDiagnostics: $('#run-diagnostics'),
  downloadSupport: $('#download-support'),
  sharingEnabled: $('#sharing-enabled'),
  pairedDeviceList: $('#paired-device-list'),
  simbriefAutoImport: $('#simbrief-auto-import'),
  settingsSimbriefIdentifier: $('#settings-simbrief-identifier'),
  settingsSimbriefSaved: $('#settings-simbrief-saved'),
  openSetupAssistant: $('#open-setup-assistant'),
  destinationPrefetch: $('#destination-prefetch'),
  weatherRefresh: $('#weather-refresh'),
  backupStatus: $('#backup-status'),
  exportBackup: $('#export-backup'),
  importBackup: $('#import-backup'),
  backupFile: $('#backup-file'),
  updateVersion: $('#update-version'),
  updateDetail: $('#update-detail'),
  updateProgress: $('#update-progress'),
  updateProgressLabel: $('#update-progress-label'),
  checkUpdate: $('#check-update'),
  updateDialog: $('#update-dialog'),
  updateDialogTitle: $('#update-dialog-title'),
  updateDialogDetail: $('#update-dialog-detail'),
  updateDialogProgress: $('#update-dialog-progress'),
  updateDialogProgressLabel: $('#update-dialog-progress-label'),
  updateDialogDownload: $('#update-dialog-download'),
  updateDialogInstall: $('#update-dialog-install'),
  updateDialogLater: $('#update-dialog-later'),
  installUpdate: $('#install-update'),
  openLegal: $('#open-legal'),
  legalDialog: $('#legal-dialog'),
  onboardingDialog: $('#onboarding-dialog'),
  onboardingLanguage: $('#onboarding-language'),
  onboardingTheme: $('#onboarding-theme'),
  onboardingTextSize: $('#onboarding-text-size'),
  onboardingDisplayName: $('#onboarding-display-name'),
  onboardingHelpTexts: $('#onboarding-help-texts'),
  onboardingSimbriefIdentifier: $('#onboarding-simbrief-identifier'),
  onboardingSimbriefAuto: $('#onboarding-simbrief-auto'),
  onboardingSteps: [...document.querySelectorAll('[data-onboarding-step]')],
  onboardingProgress: [...document.querySelectorAll('.onboarding-progress i')],
  onboardingChecks: $('#onboarding-checks'),
  onboardingLater: $('#onboarding-later'),
  onboardingBack: $('#onboarding-back'),
  onboardingNext: $('#onboarding-next'),
  onboardingFinish: $('#onboarding-finish'),
  displayName: $('#display-name'),
  showHelpTexts: $('#show-help-texts'),
  simbriefQuickDialog: $('#simbrief-quick-dialog'),
  simbriefQuickIdentifier: $('#simbrief-quick-identifier'),
  simbriefQuickStart: $('#simbrief-quick-start'),
  simbriefQuickMessage: $('#simbrief-quick-message'),
  flightHubNavButtons: [...document.querySelectorAll('[data-flight-hub-tab]')],
  settingsTabButtons: [...document.querySelectorAll('[data-settings-tab]')],
  atcTabButtons: [...document.querySelectorAll('[data-atc-tab]')],
  aircraftViewButtons: [...document.querySelectorAll('[data-aircraft-view-button]')],
};

const preferences = {
  language: localStorage.getItem('flight-deck-language') || 'system',
  theme: localStorage.getItem('flight-deck-theme') || 'system',
  textSize: localStorage.getItem('flight-deck-text-size') || 'standard',
  weightUnit: localStorage.getItem('flight-deck-weight-unit') === 'lb' ? 'lb' : 'kg',
  distanceUnit: localStorage.getItem('flight-deck-distance-unit') === 'km' ? 'km' : 'nm',
  pressureUnit: localStorage.getItem('flight-deck-pressure-unit') === 'inhg' ? 'inhg' : 'hpa',
  temperatureUnit: localStorage.getItem('flight-deck-temperature-unit') === 'f' ? 'f' : 'c',
  clockFormat: localStorage.getItem('flight-deck-clock-format') === '12' ? '12' : '24',
  displayName: (localStorage.getItem('flight-deck-display-name') || '').slice(0, 40),
  showHelpTexts: localStorage.getItem('flight-deck-show-help-texts') !== 'false',
  alertMode: ['normal', 'visual', 'off'].includes(localStorage.getItem('flight-deck-alert-mode'))
    ? localStorage.getItem('flight-deck-alert-mode') : 'normal',
  arrivalTriggerNm: [50, 100, 150, 200].includes(Number(localStorage.getItem('flight-deck-arrival-trigger')))
    ? Number(localStorage.getItem('flight-deck-arrival-trigger')) : 150,
  fuelBufferPounds: [0, 500, 1_000, 2_000].includes(Number(localStorage.getItem('flight-deck-fuel-buffer')))
    ? Number(localStorage.getItem('flight-deck-fuel-buffer')) : 500,
  focusMode: localStorage.getItem('flight-deck-focus-mode') === 'true',
  showPhaseHome: localStorage.getItem('flight-deck-show-phase-home') !== 'false',
  simbriefIdentifier: (localStorage.getItem('flight-deck-simbrief-user') || '').slice(0, 80),
  simbriefAutoImport: localStorage.getItem('flight-deck-simbrief-auto-import') === 'true',
  destinationPrefetch: localStorage.getItem('flight-deck-destination-prefetch') !== 'false',
};
let currentLanguage = resolveLanguage(preferences.language);
const t = (key) => translate(preferences.language, key);

function resolvedTheme() {
  if (preferences.theme === 'light' || preferences.theme === 'dark') return preferences.theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function updateGreeting() {
  if (!elements.homeGreeting) return;
  const hour = new Date().getHours();
  const name = preferences.displayName || 'Captain';
  if (currentLanguage === 'de') {
    const salutation = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend';
    elements.homeGreeting.textContent = `${salutation}, ${name}`;
    return;
  }
  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  elements.homeGreeting.textContent = `${salutation}, ${name}`;
}

function applyPreferences() {
  const previousTheme = document.documentElement.dataset.theme;
  const nextTheme = resolvedTheme();
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.dataset.textSize = ['compact', 'standard', 'large'].includes(preferences.textSize)
    ? preferences.textSize : 'standard';
  currentLanguage = applyTranslations(preferences.language);
  if (elements.languageSelect) elements.languageSelect.value = preferences.language;
  if (elements.themeSelect) elements.themeSelect.value = preferences.theme;
  if (elements.quickThemeToggle) {
    const light = nextTheme === 'light';
    elements.quickThemeToggle.classList.toggle('light-active', light);
    elements.quickThemeToggle.setAttribute('aria-pressed', String(light));
    elements.quickThemeToggle.setAttribute('aria-label', light ? t('switchDark') : t('switchLight'));
    elements.quickThemeToggle.title = light ? t('switchDark') : t('switchLight');
  }
  if (elements.textSizeSelect) elements.textSizeSelect.value = preferences.textSize;
  document.documentElement.dataset.helpText = preferences.showHelpTexts ? 'on' : 'off';
  if (elements.displayName && elements.displayName.value !== preferences.displayName) elements.displayName.value = preferences.displayName;
  if (elements.showHelpTexts) elements.showHelpTexts.checked = preferences.showHelpTexts;
  if (elements.onboardingDisplayName && elements.onboardingDisplayName.value !== preferences.displayName) elements.onboardingDisplayName.value = preferences.displayName;
  if (elements.onboardingHelpTexts) elements.onboardingHelpTexts.checked = preferences.showHelpTexts;
  updateGreeting();
  if (elements.weightUnitSelect) elements.weightUnitSelect.value = preferences.weightUnit;
  if (elements.distanceUnitSelect) elements.distanceUnitSelect.value = preferences.distanceUnit;
  if (elements.pressureUnitSelect) elements.pressureUnitSelect.value = preferences.pressureUnit;
  if (elements.temperatureUnitSelect) elements.temperatureUnitSelect.value = preferences.temperatureUnit;
  if (elements.clockFormatSelect) elements.clockFormatSelect.value = preferences.clockFormat;
  if (elements.alertModeSelect) elements.alertModeSelect.value = preferences.alertMode;
  if (elements.arrivalTriggerSelect) elements.arrivalTriggerSelect.value = String(preferences.arrivalTriggerNm);
  if (elements.fuelBufferSelect) elements.fuelBufferSelect.value = String(preferences.fuelBufferPounds);
  if (elements.focusModeDefault) elements.focusModeDefault.checked = preferences.focusMode;
  if (elements.showPhaseHome) elements.showPhaseHome.checked = preferences.showPhaseHome;
  if (elements.simbriefAutoImport) elements.simbriefAutoImport.checked = preferences.simbriefAutoImport;
  if (elements.simbriefIdentifier && elements.simbriefIdentifier.value !== preferences.simbriefIdentifier) elements.simbriefIdentifier.value = preferences.simbriefIdentifier;
  if (elements.settingsSimbriefIdentifier && elements.settingsSimbriefIdentifier.value !== preferences.simbriefIdentifier) elements.settingsSimbriefIdentifier.value = preferences.simbriefIdentifier;
  if (elements.onboardingSimbriefIdentifier && elements.onboardingSimbriefIdentifier.value !== preferences.simbriefIdentifier) elements.onboardingSimbriefIdentifier.value = preferences.simbriefIdentifier;
  if (elements.destinationPrefetch) elements.destinationPrefetch.checked = preferences.destinationPrefetch;
  if (elements.homePhaseCard) elements.homePhaseCard.hidden = !preferences.showPhaseHome;
  document.documentElement.dataset.focusMode = String(preferences.focusMode);
  if (elements.focusModeButton) {
    elements.focusModeButton.classList.toggle('active', preferences.focusMode);
    elements.focusModeButton.setAttribute('aria-pressed', String(preferences.focusMode));
  }
  if (previousTheme && previousTheme !== nextTheme) window.dispatchEvent(new CustomEvent('flightdeckthemechange'));
}

function setFocusMode(enabled) {
  preferences.focusMode = Boolean(enabled);
  localStorage.setItem('flight-deck-focus-mode', String(preferences.focusMode));
  applyPreferences();
}

applyPreferences();
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
  if (preferences.theme === 'system') applyPreferences();
});

const fenixHost = ['localhost', '127.0.0.1'].includes(location.hostname) ? '127.0.0.1' : location.hostname;
elements.fenixUrl.value = localStorage.getItem('flight-deck-fenix-url') || `http://${fenixHost}:8083/`;
elements.fenixOpen.href = elements.fenixUrl.value;

const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true,
  zoomSnap: 0.25,
}).setView([51.2895, 6.7668], 16);

for (const [name, zIndex] of [
  ['airportBoundary', 210],
  ['airportAreas', 220],
  ['airportRunways', 240],
  ['airportTaxiways', 260],
  ['airportDetails', 280],
  ['airportLabels', 300],
  ['planningPreview', 500],
  ['taxiRoute', 520],
]) {
  map.createPane(name).style.zIndex = String(zIndex);
}

const layers = {
  airport: L.layerGroup().addTo(map),
  airportLabels: L.layerGroup().addTo(map),
  routeHalo: null,
  route: null,
  chevrons: L.layerGroup().addTo(map),
  gates: L.layerGroup().addTo(map),
  holds: L.layerGroup().addTo(map),
  planning: L.layerGroup().addTo(map),
  aircraft: null,
};

let trackingMap = null;
let trackingMapLayer = null;
let trackingSatelliteLayer = null;
let trackingBasemap = 'map';
let trackingFollowAircraft = true;
let trackingLastFollowAt = 0;
let trackingRenderedKey = '';
let trackingStaticRenderKey = '';
let trackingRequestRunning = false;
let trackingArchive = [];
let trackingCurrentFlight = null;
let trackingViewedFlight = null;
let trackingSelectedId = null;
let trackingRefreshTimer = null;
const trackingLayers = {
  planned: null,
  actual: null,
  waypoints: null,
  airports: null,
  traffic: null,
  aircraft: null,
};
const trafficTrails = new Map();
let selectedTrafficTrailId = null;

let token = null;
let eventSource = null;
let latestState = null;
let renderedPathRevision = -1;
let renderedGateFingerprint = '';
let renderedSharingFingerprint = '';
let followAircraft = true;
let lastFollowAt = 0;
let previousWarning = false;
let loadedAirportIcao = null;
let requestedAirportIcao = null;
let latestAirportBounds = null;
let lastMapAttemptAt = 0;
let airportLabelMarkers = [];
let dynamicAirportLayers = [];
let mapRequestSerial = 0;
let loadedAirportMapData = null;
const CLIENT_MAP_CACHE = 'flight-deck-airport-maps-v2';
let deviceManagementAvailable = null;
let autoImportAttempted = false;
let plannerSearchTimer = null;
let plannerSearchSerial = 0;
let activeModule = 'home';
let flightHubTab = 'operations';
let settingsTab = 'system';
let atcTab = 'clearance';
let inferredHomeGate = null;
let forcingAutomaticAtc = false;
let renderedGsxServicesFingerprint = '';
let lastJourneyRecordRefreshAt = 0;
let journeyRecordRequestRunning = false;
let flightOperationsSaving = false;
let flightNotesTimer = null;
let lastOperationalAlertFingerprint = '';
let trafficBoardView = 'all';
let onboardingStep = 1;
let siMessageView = localStorage.getItem('flight-deck-si-message-view') === 'all' ? 'all' : 'recent';
let updateStatusTimer = null;
const deriveAttempts = new Set();

window.addEventListener('flightdeckthemechange', () => {
  if (loadedAirportMapData) renderAirportMap(loadedAirportMapData);
  if (latestState) {
    renderedPathRevision = -1;
    renderPath(latestState);
  }
  map.invalidateSize();
});
const DEFAULT_APP_ORDER = ['taxi', 'flight', 'briefing', 'com', 'flightboard', 'charts', 'atc', 'ground', 'fenix', 'automations', 'settings'];
const ESSENTIAL_APPS = new Set(['flight', 'settings']);
const PILOT_PROFILES = {
  airliner: {
    order: ['flight', 'briefing', 'com', 'flightboard', 'charts', 'taxi', 'ground', 'atc', 'tracking', 'fenix', 'automations', 'settings'],
    hidden: [], alertMode: 'normal', arrivalTriggerNm: 150, fuelBufferPounds: 1_000,
  },
  ga: {
    order: ['flight', 'briefing', 'com', 'flightboard', 'charts', 'tracking', 'taxi', 'atc', 'automations', 'settings', 'ground', 'fenix'],
    hidden: ['ground', 'fenix', 'automations'], alertMode: 'visual', arrivalTriggerNm: 50, fuelBufferPounds: 0,
  },
  online: {
    order: ['flight', 'briefing', 'com', 'flightboard', 'atc', 'charts', 'tracking', 'taxi', 'ground', 'fenix', 'automations', 'settings'],
    hidden: [], alertMode: 'visual', arrivalTriggerNm: 100, fuelBufferPounds: 500,
  },
};
const APP_LABEL_KEYS = {
  taxi: null,
  planner: 'taxiPlanning',
  flight: 'flight',
  tracking: 'tracking',
  briefing: 'briefing',
  com: null,
  flightboard: 'flightboard',
  charts: 'charts',
  atc: 'atcCenter',
  ground: 'groundServices',
  fenix: null,
  automations: 'automations',
  settings: 'settingsShort',
};

function loadAppLayout() {
  try {
    const saved = JSON.parse(localStorage.getItem('flight-deck-app-layout') || '{}');
    const validOrder = Array.isArray(saved.order)
      ? saved.order.filter((id, index, values) => DEFAULT_APP_ORDER.includes(id) && values.indexOf(id) === index)
      : [];
    const order = [...validOrder, ...DEFAULT_APP_ORDER.filter((id) => !validOrder.includes(id))];
    const hidden = Array.isArray(saved.hidden)
      ? saved.hidden.filter((id) => id !== 'charts' && DEFAULT_APP_ORDER.includes(id) && !ESSENTIAL_APPS.has(id))
      : [];
    return { order, hidden };
  } catch {
    return { order: [...DEFAULT_APP_ORDER], hidden: [] };
  }
}

let appLayout = loadAppLayout();
const plannerState = {
  selectedAirport: null,
  routes: [],
  selectedRouteId: null,
  customStart: null,
  customEnd: null,
  picking: null,
  changingAirport: false,
  modeInitialized: false,
  startTouched: false,
};

function loadToken() {
  const url = new URL(window.location.href);
  const urlToken = url.searchParams.get('token');
  if (urlToken) {
    localStorage.setItem('si-taxi-token', urlToken);
    url.searchParams.delete('token');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    return urlToken;
  }
  return localStorage.getItem('si-taxi-token');
}

function authenticatedUrl(pathname) {
  const url = new URL(pathname, window.location.origin);
  url.searchParams.set('token', token);
  return url.toString();
}

function setConnectionChip(element, connection, shortName) {
  const status = connection?.status ?? 'waiting';
  element.className = `connection-chip ${status}`;
  element.title = connection?.detail ?? '';
  const label = element.querySelector('span');
  if (label) label.textContent = shortName;
}

function setStatusDot(element, status) {
  if (!element) return;
  element.className = String(status || 'waiting');
}

function atcProviderLabel(provider, { compact = false } = {}) {
  const labels = {
    auto: compact ? 'ATC AUTO' : 'Automatic',
    sayintentions: compact ? 'ATC SI' : 'SayIntentions',
    beyondatc: compact ? 'ATC BATC' : 'BeyondATC',
    manual: compact ? 'ATC MANUAL' : 'Manual ATC',
  };
  return labels[provider] || labels.auto;
}

function activeAtcConnection(state) {
  const selected = state?.atc?.selectedProvider || 'auto';
  const active = state?.atc?.activeProvider;
  const provider = selected === 'auto' ? active : selected;
  if (provider === 'sayintentions') return state.connections?.sayIntentions;
  if (provider === 'beyondatc') return state.connections?.beyondAtc;
  if (provider === 'manual') return { status: 'connected', detail: 'Manuell übernommene Freigabe' };
  const si = state.connections?.sayIntentions;
  const batc = state.connections?.beyondAtc;
  if (si?.status === 'connected') return si;
  if (batc?.status === 'connected') return batc;
  return si || batc || { status: 'waiting', detail: 'ATC-Quelle wird gesucht' };
}

function switchModule(moduleName, preserveFlightHubTab = false) {
  if (moduleName === 'online') moduleName = 'atc';
  if (moduleName === 'tracking') { flightHubTab = 'tracking'; moduleName = 'flight'; preserveFlightHubTab = true; }
  if (moduleName === 'flight' && !preserveFlightHubTab) flightHubTab = 'operations';
  if (moduleName === 'charts') return;
  const allowed = new Set(['home', 'taxi', 'flight', 'briefing', 'com', 'flightboard', 'ground', 'atc', 'fenix', 'automations', 'settings']);
  const moduleMeta = {
    taxi: { icon: 'T', title: 'Taxi Navigation', context: 'GROUND NAVIGATION' },
    flight: { icon: 'F', title: 'Flug & Tracking', context: 'FLIGHT HUB' },
    tracking: { icon: 'F', title: 'Flug & Tracking', context: 'FLIGHT HUB' },
    briefing: { icon: 'B', title: 'Briefing', context: 'SAYINTENTIONS' },
    com: { icon: 'C', title: 'COM', context: 'COMMUNICATIONS' },
    flightboard: { icon: 'F', title: 'Flightboard', context: 'SIMULATOR TRAFFIC' },
    ground: { icon: 'G', title: 'Ground Services', context: 'GSX PRO' },
    atc: { icon: 'A', title: 'ATC Center', context: 'ATC / VATSIM / IVAO' },
    fenix: { icon: 'X', title: 'Fenix Remote EFB', context: 'A32X' },
    automations: { icon: '⚡', title: 'Automations', context: 'AIRCRAFT LOGIC' },
    settings: { icon: 'S', title: 'Settings', context: 'SYSTEM' },
  };
  activeModule = allowed.has(moduleName) ? moduleName : 'home';
  for (const button of elements.flightHubNavButtons || []) {
    button.classList.toggle('active', activeModule === 'flight' && button.dataset.flightHubTab === flightHubTab);
  }
  const homeActive = activeModule === 'home';
  const taxiActive = activeModule === 'taxi';
  elements.app.classList.toggle('home-mode', homeActive);
  elements.appToolbar.hidden = homeActive;
  elements.mapStage.hidden = !taxiActive;
  elements.efbPages.hidden = taxiActive;
  const visiblePage = activeModule === 'flight' && flightHubTab !== 'operations' ? 'tracking' : activeModule;
  for (const page of elements.efbPageSections) page.hidden = page.dataset.page !== visiblePage;
  if (visiblePage === 'tracking') {
    const trackingPage = document.querySelector('[data-page="tracking"]');
    const archiveOnly = flightHubTab === 'archive';
    trackingPage?.querySelector('.tracking-map-card')?.toggleAttribute('hidden', archiveOnly);
    trackingPage?.querySelector('.tracking-recorder-card')?.toggleAttribute('hidden', archiveOnly);
    trackingPage?.querySelector('.tracking-detail-layout')?.toggleAttribute('hidden', archiveOnly);
    trackingPage?.querySelector('.tracking-archive-card')?.removeAttribute('hidden');
  }
  if (!homeActive) {
    const meta = moduleMeta[activeModule];
    elements.appToolbarIcon.textContent = meta.icon;
    elements.appToolbarTitle.textContent = meta.title;
    elements.appToolbarContext.textContent = meta.context;
  }
  elements.planButton.hidden = !taxiActive;
  if (taxiActive) {
    followAircraft = true;
    syncFollowButton();
    setTimeout(() => {
      map.invalidateSize();
      const aircraft = latestState?.aircraft;
      if (aircraft && Number.isFinite(aircraft.lat) && Number.isFinite(aircraft.lon)) {
        map.setView([aircraft.lat, aircraft.lon], Math.max(map.getZoom(), 17.5), { animate: false });
        renderAircraft(aircraft);
      } else {
        fitRoute({ disableFollow: false });
      }
    }, 100);
  }
  if (visiblePage === 'tracking') {
    ensureTrackingMap();
    setTimeout(() => {
      trackingMap?.invalidateSize();
      refreshTrackingData({ force: true }).catch(() => {});
    }, 70);
    startTrackingRefreshTimer();
  } else {
    stopTrackingRefreshTimer();
  }
  if (token) {
    fetch(authenticatedUrl('/api/automations/context'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app: activeModule }),
    }).catch(() => {});
  }
  if (activeModule === 'settings') setSettingsTab(settingsTab);
  if (activeModule === 'atc') setAtcTab(atcTab);
  if (activeModule === 'automations') refreshAutomationConfiguration().catch(() => {});
}

function applyPanelTab(buttons, selector, attribute, value) {
  for (const button of buttons || []) button.classList.toggle('active', button.dataset[attribute] === value);
  for (const panel of document.querySelectorAll(selector)) panel.hidden = panel.dataset[attribute.replace('Tab', 'Panel')] !== value;
}

function setSettingsTab(tab) {
  settingsTab = ['system', 'appearance', 'flight', 'devices', 'updates'].includes(tab) ? tab : 'system';
  for (const button of elements.settingsTabButtons || []) button.classList.toggle('active', button.dataset.settingsTab === settingsTab);
  for (const panel of document.querySelectorAll('[data-settings-panel]')) panel.hidden = panel.dataset.settingsPanel !== settingsTab;
}

function setAtcTab(tab) {
  atcTab = ['clearance', 'messages', 'networks'].includes(tab) ? tab : 'clearance';
  for (const button of elements.atcTabButtons || []) button.classList.toggle('active', button.dataset.atcTab === atcTab);
  for (const panel of document.querySelectorAll('[data-atc-panel]')) panel.hidden = panel.dataset.atcPanel !== atcTab;
}

function setAircraftView(view = 'fenix') {
  const selected = ['fenix', 'pmdg', 'status'].includes(view) ? view : 'fenix';
  for (const button of elements.aircraftViewButtons || []) button.classList.toggle('active', button.dataset.aircraftViewButton === selected);
  for (const panel of document.querySelectorAll('[data-aircraft-view]')) panel.hidden = panel.dataset.aircraftView !== selected;
}

function setFlightHubTab(tab) {
  flightHubTab = ['operations', 'tracking', 'archive'].includes(tab) ? tab : 'operations';
  switchModule('flight', true);
}

function appLabel(id) {
  const fixed = { taxi: 'Taxi', com: 'COM', fenix: 'Fenix Remote EFB' };
  return fixed[id] || t(APP_LABEL_KEYS[id]) || id;
}

function saveAppLayout() {
  localStorage.setItem('flight-deck-app-layout', JSON.stringify(appLayout));
}

function markPilotProfileCustom() {
  preferences.pilotProfile = 'custom';
  localStorage.setItem('flight-deck-pilot-profile', 'custom');
  if (elements.pilotProfileSelect) elements.pilotProfileSelect.value = 'custom';
}

function applySelectedPilotProfile() {
  const id = elements.pilotProfileSelect?.value;
  const profile = PILOT_PROFILES[id];
  if (!profile) {
    markPilotProfileCustom();
    return;
  }
  preferences.pilotProfile = id;
  preferences.alertMode = profile.alertMode;
  preferences.arrivalTriggerNm = profile.arrivalTriggerNm;
  preferences.fuelBufferPounds = profile.fuelBufferPounds;
  localStorage.setItem('flight-deck-pilot-profile', id);
  localStorage.setItem('flight-deck-alert-mode', preferences.alertMode);
  localStorage.setItem('flight-deck-arrival-trigger', String(preferences.arrivalTriggerNm));
  localStorage.setItem('flight-deck-fuel-buffer', String(preferences.fuelBufferPounds));
  appLayout = { order: [...profile.order], hidden: [...profile.hidden] };
  saveAppLayout();
  applyPreferences();
  applyAppLayout();
  if (latestState) renderFlightJourney(latestState);
}

function isAppEnabled(id) {
  return id === 'new-flight' || (id !== 'charts' && !appLayout.hidden.includes(id));
}

function applyAppLayout() {
  const tileById = new Map(elements.appTiles.map((tile) => [tile.dataset.appId, tile]));
  for (const [index, id] of appLayout.order.entries()) {
    const tile = tileById.get(id);
    if (!tile) continue;
    tile.style.order = String(index);
    tile.hidden = id === 'charts' ? false : appLayout.hidden.includes(id) && !ESSENTIAL_APPS.has(id);
  }
  renderAppCustomization();
}

function moveApp(id, direction) {
  const current = appLayout.order.indexOf(id);
  const next = current + direction;
  if (current < 0 || next < 0 || next >= appLayout.order.length) return;
  [appLayout.order[current], appLayout.order[next]] = [appLayout.order[next], appLayout.order[current]];
  markPilotProfileCustom();
  saveAppLayout();
  applyAppLayout();
}

function renderAppCustomization() {
  if (!elements.appCustomizationList) return;
  elements.appCustomizationList.replaceChildren();
  for (const [index, id] of appLayout.order.entries()) {
    const row = document.createElement('div');
    row.className = 'app-customization-row';
    const icon = document.createElement('i');
    icon.textContent = String(index + 1).padStart(2, '0');
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = appLabel(id);
    const hint = document.createElement('small');
    const unavailable = id === 'charts';
    hint.textContent = unavailable ? t('comingLater') : ESSENTIAL_APPS.has(id) ? t('alwaysAvailable') : t('homeVisibility');
    copy.append(title, hint);
    const actions = document.createElement('div');
    actions.className = 'app-layout-actions';
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.title = t('moveUp');
    up.disabled = unavailable || index === 0;
    up.addEventListener('click', () => moveApp(id, -1));
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.title = t('moveDown');
    down.disabled = unavailable || index === appLayout.order.length - 1;
    down.addEventListener('click', () => moveApp(id, 1));
    const visible = document.createElement('input');
    visible.type = 'checkbox';
    visible.checked = unavailable ? false : !appLayout.hidden.includes(id);
    visible.disabled = unavailable || ESSENTIAL_APPS.has(id);
    visible.title = t('showOnHome');
    visible.addEventListener('change', () => {
      appLayout.hidden = visible.checked
        ? appLayout.hidden.filter((entry) => entry !== id)
        : [...new Set([...appLayout.hidden, id])];
      markPilotProfileCustom();
      saveAppLayout();
      applyAppLayout();
      if (latestState) renderFlightJourney(latestState);
    });
    actions.append(up, down, visible);
    row.append(icon, copy, actions);
    elements.appCustomizationList.append(row);
  }
}

function formatDistance(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)} km`;
  return `${Math.round(value)} m`;
}

function formatTime(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.toLocaleTimeString(localeFor(currentLanguage), {
    hour: '2-digit', minute: '2-digit', hour12: preferences.clockFormat === '12',
  })} LT`;
}

function formatPin(value) {
  const pin = String(value ?? '').padStart(6, '—');
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

function bearingDegrees(start, end) {
  const lat1 = start.lat * Math.PI / 180;
  const lat2 = end.lat * Math.PI / 180;
  const deltaLon = (end.lon - start.lon) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function approximateDistanceMeters(start, end) {
  const latScale = 111_320;
  const lonScale = Math.cos((start.lat + end.lat) * Math.PI / 360) * 111_320;
  return Math.hypot((end.lat - start.lat) * latScale, (end.lon - start.lon) * lonScale);
}

function midpoint(start, end) {
  return [(start.lat + end.lat) / 2, (start.lon + end.lon) / 2];
}

function airportTargetIcao(state) {
  return String(state?.planning?.selectedAirport?.icao
    || state?.flight?.currentAirport
    || state?.flight?.origin
    || state?.flight?.destination
    || state?.integrations?.simbrief?.flight?.origin
    || state?.integrations?.simbrief?.flight?.destination
    || '')
    .trim()
    .toUpperCase();
}

function mapStatus(status, icao, text) {
  elements.mapStatus.className = `map-status ${status}`;
  elements.mapAirport.textContent = icao || 'AIRPORT MAP';
  elements.mapStatusText.textContent = text;
  elements.refreshMapButton.classList.toggle('loading', status === 'loading');
}

async function readClientMapCache(icao) {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(CLIENT_MAP_CACHE);
    const response = await cache.match(`/__flight-deck-map/${encodeURIComponent(icao)}`);
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function writeClientMapCache(mapData) {
  if (!('caches' in window) || !mapData?.icao) return;
  try {
    const cache = await caches.open(CLIENT_MAP_CACHE);
    await cache.put(`/__flight-deck-map/${encodeURIComponent(mapData.icao)}`, new Response(JSON.stringify(mapData), {
      headers: { 'Content-Type': 'application/json' },
    }));
  } catch {
    // The host disk cache remains the fallback.
  }
}

function metersToPixels(meters, latitude, zoom = map.getZoom()) {
  const metersPerPixel = 156543.03392 * Math.cos(latitude * Math.PI / 180) / (2 ** zoom);
  return meters / Math.max(0.02, metersPerPixel);
}

function updateAirportLayerWidths() {
  const zoom = map.getZoom();
  for (const entry of dynamicAirportLayers) {
    if (entry.kind === 'runway') {
      const width = metersToPixels(entry.widthMeters, entry.latitude);
      const pavement = Math.max(4, Math.min(38, width));
      entry.outline.setStyle({ weight: pavement + 2.2 });
      entry.surface.setStyle({ weight: pavement });
      entry.centerline.setStyle({ weight: Math.max(0.8, Math.min(1.8, pavement * 0.07)) });
    } else if (entry.kind === 'taxiway') {
      const width = metersToPixels(entry.widthMeters, entry.latitude);
      const detailed = zoom >= 15.65;
      const pavement = Math.max(1.2, Math.min(24, width));
      entry.surface.setStyle({
        weight: detailed ? pavement : 1.4,
        opacity: detailed ? 0.98 : 0.38,
      });
      entry.centerline.setStyle({
        weight: detailed ? 1.05 : 0.9,
        opacity: detailed ? 0.86 : 0.72,
      });
    } else if (entry.kind === 'parking') {
      const visible = zoom >= 16.1;
      entry.line?.setStyle({ opacity: visible ? 0.7 : 0.08 });
      entry.marker?.setStyle({ opacity: visible ? 0.95 : 0, fillOpacity: visible ? 0.85 : 0 });
    }
  }
  for (const entry of airportLabelMarkers) {
    const opacity = zoom >= entry.minZoom ? 1 : 0;
    if (typeof entry.marker.setOpacity === 'function') entry.marker.setOpacity(opacity);
    else entry.marker.setStyle({ opacity, fillOpacity: opacity * 0.88 });
  }
}

function addLodMarker(marker, minZoom) {
  marker.addTo(layers.airport);
  airportLabelMarkers.push({ marker, minZoom });
  return marker;
}

function addAirportLabel(latLng, text, className, minZoom = 14) {
  if (!text) return;
  const marker = L.marker(latLng, {
    pane: 'airportLabels',
    interactive: false,
    icon: L.divIcon({
      className: `airport-label-wrapper ${className}`,
      html: `<span>${escapeHtml(text)}</span>`,
      iconSize: [1, 1],
      iconAnchor: [0, 0],
    }),
  }).addTo(layers.airportLabels);
  airportLabelMarkers.push({ marker, minZoom });
}

function featureCenter(feature) {
  const coordinates = feature.coordinates ?? [];
  if (coordinates.length === 0) return null;
  const middle = coordinates[Math.floor((coordinates.length - 1) / 2)];
  return [middle[0], middle[1]];
}

function airportMapPalette() {
  const light = document.documentElement.dataset.theme === 'light';
  return light ? {
    boundary: '#8ba2b0', aerodrome: '#dce6eb', apronOutline: '#879ba7', apron: '#c8d3da',
    terminalOutline: '#607887', terminal: '#90a2ad', buildingOutline: '#8498a4', building: '#b2c0c8',
    runwayOutline: '#536a78', runway: '#6f818c', runwayCenter: '#f7fafb', taxiOutline: '#7f919a',
    taxi: '#aab8c0', taxiCenter: '#9b7a00', service: '#7e919c', painted: '#9b7a00', closed: '#b64858',
    parking: '#8a7410', parkingFill: '#eef3f5', gateOutline: '#58717e', gateFill: '#d5e0e5',
    routeHalo: '#f7fbfc', route: '#008f88',
  } : {
    boundary: '#273546', aerodrome: '#0c1724', apronOutline: '#596477', apron: '#273244',
    terminalOutline: '#9aa5b4', terminal: '#7d8797', buildingOutline: '#778395', building: '#566274',
    runwayOutline: '#d9dee3', runway: '#323b49', runwayCenter: '#f5f6f7', taxiOutline: '#657184',
    taxi: '#2d3948', taxiCenter: '#dbc95e', service: '#596675', painted: '#d6c55f', closed: '#a75b65',
    parking: '#b9b36b', parkingFill: '#172431', gateOutline: '#bac3cd', gateFill: '#263241',
    routeHalo: '#00131d', route: '#12dfd4',
  };
}

function renderAirportMap(mapData) {
  layers.airport.clearLayers();
  layers.airportLabels.clearLayers();
  dynamicAirportLayers = [];
  airportLabelMarkers = [];
  const palette = airportMapPalette();

  const taxiwayLabels = new Set();
  for (const feature of mapData.features ?? []) {
    const latLngs = feature.coordinates ?? [];
    if (latLngs.length === 0) continue;
    const center = featureCenter(feature);
    const options = { interactive: false };

    if (feature.kind === 'aerodrome' && feature.geometry === 'polygon') {
      L.polygon(latLngs, {
        ...options,
        pane: 'airportBoundary',
        color: palette.boundary,
        weight: 1,
        opacity: 0.85,
        fillColor: palette.aerodrome,
        fillOpacity: 0.55,
      }).addTo(layers.airport);
      continue;
    }

    if (feature.kind === 'apron' && feature.geometry === 'polygon') {
      L.polygon(latLngs, {
        ...options,
        pane: 'airportAreas',
        color: palette.apronOutline,
        weight: 1.1,
        opacity: 0.95,
        fillColor: palette.apron,
        fillOpacity: 0.93,
      }).addTo(layers.airport);
      if (feature.name && center) addAirportLabel(center, feature.name, 'apron-label', 15.5);
      continue;
    }

    if (['terminal', 'building'].includes(feature.kind) && feature.geometry === 'polygon') {
      L.polygon(latLngs, {
        ...options,
        pane: 'airportDetails',
        color: feature.kind === 'terminal' ? palette.terminalOutline : palette.buildingOutline,
        weight: 0.9,
        opacity: 0.95,
        fillColor: feature.kind === 'terminal' ? palette.terminal : palette.building,
        fillOpacity: feature.kind === 'terminal' ? 0.88 : 0.72,
      }).addTo(layers.airport);
      if (feature.name && center) addAirportLabel(
        center,
        feature.name,
        feature.kind === 'terminal' ? 'terminal-label' : 'building-label',
        feature.kind === 'terminal' ? 15.1 : 17.1,
      );
      continue;
    }

    if (feature.kind === 'runway' && feature.geometry !== 'point' && !feature.graphOnly) {
      const latitude = center?.[0] ?? mapData.center.lat;
      const outline = L.polyline(latLngs, {
        ...options,
        pane: 'airportRunways',
        color: palette.runwayOutline,
        opacity: 0.9,
        lineCap: 'butt',
        lineJoin: 'miter',
      }).addTo(layers.airport);
      const surface = L.polyline(latLngs, {
        ...options,
        pane: 'airportRunways',
        color: palette.runway,
        opacity: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
      }).addTo(layers.airport);
      const centerline = L.polyline(latLngs, {
        ...options,
        pane: 'airportRunways',
        color: palette.runwayCenter,
        opacity: 0.86,
        dashArray: '12 10',
        lineCap: 'butt',
      }).addTo(layers.airport);
      dynamicAirportLayers.push({
        kind: 'runway',
        widthMeters: feature.widthMeters || 45,
        latitude,
        outline,
        surface,
        centerline,
      });
      if (feature.ref) {
        const refs = feature.ref.split('/');
        addAirportLabel(latLngs[0], refs[0], 'runway-label', 13);
        addAirportLabel(latLngs.at(-1), refs[1] || refs[0], 'runway-label', 13);
      }
      continue;
    }

    if (feature.kind === 'taxiway' && feature.geometry === 'polygon') {
      L.polygon(latLngs, {
        ...options,
        pane: 'airportTaxiways',
        color: palette.taxiOutline,
        weight: 0.8,
        opacity: 0.82,
        fillColor: palette.taxi,
        fillOpacity: 1,
      }).addTo(layers.airport);
    } else if (feature.kind === 'taxiway' && feature.geometry === 'line') {
      const latitude = center?.[0] ?? mapData.center.lat;
      const surface = L.polyline(latLngs, {
        ...options,
        pane: 'airportTaxiways',
        color: palette.taxi,
        opacity: 0.98,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(layers.airport);
      const centerline = L.polyline(latLngs, {
        ...options,
        pane: 'airportTaxiways',
        color: palette.taxiCenter,
        opacity: 0.86,
        weight: 1,
        lineCap: 'butt',
        lineJoin: 'round',
      }).addTo(layers.airport);
      dynamicAirportLayers.push({
        kind: 'taxiway',
        widthMeters: feature.widthMeters || 15,
        latitude,
        surface,
        centerline,
      });
    }
    if (feature.kind === 'taxiway' && feature.ref && center && !taxiwayLabels.has(feature.ref)) {
      taxiwayLabels.add(feature.ref);
      addAirportLabel(center, feature.ref, 'taxiway-label', 16);
    }

    if (['service_road', 'closed_taxiway', 'painted_line'].includes(feature.kind) && feature.geometry === 'line') {
      const closed = feature.kind === 'closed_taxiway';
      const painted = feature.kind === 'painted_line';
      L.polyline(latLngs, {
        ...options,
        pane: 'airportDetails',
        color: closed ? palette.closed : painted ? palette.painted : palette.service,
        weight: closed ? 2.2 : painted ? 0.9 : 1.4,
        opacity: closed ? 0.72 : painted ? 0.62 : 0.48,
        dashArray: closed ? '5 5' : painted ? '2 5' : null,
        lineCap: 'round',
      }).addTo(layers.airport);
    }

    if (feature.kind === 'parking_position') {
      if (feature.geometry === 'point') {
        const capabilities = `${feature.hasJetway ? '<b title="Jetway">J</b>' : ''}${feature.hasVdgs ? '<b title="VDGS">V</b>' : ''}`;
        const marker = L.marker(latLngs[0], {
          ...options,
          pane: 'airportDetails',
          icon: L.divIcon({
            className: 'stand-position-wrapper',
            html: `<span class="stand-position-symbol"><i></i>${capabilities}</span>`,
            iconSize: [28, 18],
            iconAnchor: [14, 9],
          }),
        });
        addLodMarker(marker, 16.1);
        if (feature.ref || feature.name) addAirportLabel(latLngs[0], feature.ref || feature.name, 'stand-label', 17);
      } else {
        const line = L.polyline(latLngs, {
          ...options,
          pane: 'airportDetails',
          color: palette.parking,
          opacity: 0.7,
          weight: 1,
          lineCap: 'butt',
        }).addTo(layers.airport);
        const marker = L.circleMarker(latLngs.at(-1), {
          ...options,
          pane: 'airportDetails',
          radius: 2.2,
          color: palette.parking,
          weight: 1,
          fillColor: palette.parkingFill,
          fillOpacity: 0.85,
        }).addTo(layers.airport);
        dynamicAirportLayers.push({ kind: 'parking', line, marker });
        if (feature.ref || feature.name) addAirportLabel(latLngs.at(-1), feature.ref || feature.name, 'stand-label', 17);
      }
    }

    if (feature.kind === 'holding_position' && feature.geometry === 'point') {
      const marker = L.marker(latLngs[0], {
        ...options,
        pane: 'airportDetails',
        icon: L.divIcon({
          className: 'hold-position-wrapper',
          html: '<span class="hold-position-symbol"><i></i><i></i></span>',
          iconSize: [18, 12],
          iconAnchor: [9, 6],
        }),
      });
      addLodMarker(marker, 15.8);
    }

    if (feature.kind === 'gate' && feature.geometry === 'point') {
      const marker = L.circleMarker(latLngs[0], {
        ...options,
        pane: 'airportDetails',
        radius: 2,
        color: palette.gateOutline,
        weight: 1,
        fillColor: palette.gateFill,
        fillOpacity: 1,
      });
      addLodMarker(marker, 16.8);
      if (feature.ref || feature.name) addAirportLabel(latLngs[0], feature.ref || feature.name, 'gate-label', 17.3);
    }
  }

  latestAirportBounds = Array.isArray(mapData.bounds) ? L.latLngBounds(mapData.bounds) : null;
  loadedAirportIcao = mapData.icao;
  loadedAirportMapData = mapData;
  renderGate(latestState?.gate || latestState?.taxi?.pathMetadata?.destination || null);
  elements.mapStatus.title = mapData.airport?.name || mapData.icao;
  updateAirportLayerWidths();
  const counts = mapData.counts ?? {};
  const details = [
    `${counts.runway ?? 0} RWY`,
    `${counts.taxiway ?? 0} TWY`,
    `${counts.parking_position ?? 0} STANDS`,
  ].join(' · ');
  const cacheLabels = {
    cached: 'OFFLINE GESPEICHERT',
    downloaded: 'HERUNTERGELADEN · OFFLINE BEREIT',
    offline: 'OFFLINE · LETZTER STAND',
    preview: 'RUNWAYS BEREIT · TAXIWAYS UND GATES LADEN',
  };
  const preview = mapData.cache?.status === 'preview';
  const geometrySource = mapData.cache?.simulatorFacility ? 'MSFS FACILITY' : null;
  mapStatus(preview ? 'loading' : mapData.cache?.status || 'ready', mapData.icao, `${details} · ${[geometrySource, cacheLabels[mapData.cache?.status] || 'BEREIT'].filter(Boolean).join(' · ')}`);
  if (!preview) {
    syncPlannerFromMap(mapData);
    maybeDeriveTaxiRoute().catch(() => {});
  }

  if ((latestState?.taxi?.path?.length ?? 0) < 2 && latestAirportBounds?.isValid()) {
    map.fitBounds(latestAirportBounds, { padding: [45, 45], maxZoom: 15.5, animate: false });
  }
}

async function loadAirportMap(state, { forceRefresh = false } = {}) {
  const icao = airportTargetIcao(state);
  if (!icao) {
    mapStatus('waiting', null, 'Warte auf Flughafendaten');
    return;
  }
  if (!forceRefresh && (loadedAirportIcao === icao || requestedAirportIcao === icao)) return;
  if (!forceRefresh && Date.now() - lastMapAttemptAt < 5_000) return;
  lastMapAttemptAt = Date.now();
  requestedAirportIcao = icao;
  const requestSerial = ++mapRequestSerial;
  if (!forceRefresh) {
    const clientCached = await readClientMapCache(icao);
    if (clientCached?.icao === icao && requestSerial === mapRequestSerial) {
      clientCached.cache = { status: 'cached', offlineReady: true };
      renderAirportMap(clientCached);
      requestedAirportIcao = null;
      return;
    }
    try {
      const previewResponse = await fetch(authenticatedUrl('/api/airport-map/preview'), { cache: 'no-store' });
      if (previewResponse.ok && requestSerial === mapRequestSerial) renderAirportMap(await previewResponse.json());
    } catch {
      // Continue directly with the detailed map.
    }
  }
  mapStatus('loading', icao, forceRefresh ? 'Karte wird aktualisiert …' : 'Airport-Vektoren werden geladen …');
  try {
    const response = await fetch(authenticatedUrl('/api/airport-map/current'), {
      method: forceRefresh ? 'POST' : 'GET',
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`);
    if (requestSerial === mapRequestSerial) {
      renderAirportMap(data);
      writeClientMapCache(data).catch(() => {});
    }
  } catch (error) {
    if (requestSerial === mapRequestSerial) mapStatus('error', icao, `Karte nicht verfügbar · ${error.message}`);
  } finally {
    if (requestSerial === mapRequestSerial) requestedAirportIcao = null;
  }
}

function renderPath(state) {
  const path = state.taxi?.path ?? [];
  if (state.taxi?.pathRevision === renderedPathRevision) return;
  renderedPathRevision = state.taxi?.pathRevision ?? 0;

  if (layers.routeHalo) map.removeLayer(layers.routeHalo);
  if (layers.route) map.removeLayer(layers.route);
  layers.chevrons.clearLayers();
  layers.holds.clearLayers();

  if (path.length < 2) return;
  const palette = airportMapPalette();
  const latLngs = path.map((point) => [point.lat, point.lon]);
  layers.routeHalo = L.polyline(latLngs, {
    pane: 'taxiRoute',
    color: palette.routeHalo,
    opacity: 0.9,
    weight: 13,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(map);
  layers.route = L.polyline(latLngs, {
    pane: 'taxiRoute',
    color: palette.route,
    opacity: 0.98,
    weight: 6,
    lineCap: 'round',
    lineJoin: 'round',
    interactive: false,
  }).addTo(map);

  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    if (approximateDistanceMeters(start, end) < 18) continue;
    const bearing = bearingDegrees(start, end);
    const icon = L.divIcon({
      className: 'route-chevron-wrapper',
      html: `<div class="route-chevron" style="transform:rotate(${bearing - 90}deg)">›</div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    L.marker(midpoint(start, end), { icon, interactive: false }).addTo(layers.chevrons);
  }

  for (const hold of state.taxi?.holdShorts ?? []) {
    const icon = L.divIcon({
      className: 'hold-wrapper',
      html: `<div class="hold-marker"><i></i><b>${escapeHtml(hold.label || 'HOLD SHORT')}</b></div>`,
      iconSize: [170, 30],
      iconAnchor: [8, 15],
    });
    L.marker([hold.lat, hold.lon], { icon, interactive: false }).addTo(layers.holds);
  }

  fitRoute({ disableFollow: false });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderGate(gate) {
  let resolvedGate = gate;
  if (resolvedGate && (!Number.isFinite(resolvedGate.lat) || !Number.isFinite(resolvedGate.lon)) && loadedAirportMapData) {
    const wantedId = resolvedGate.id;
    const wantedName = String(resolvedGate.name || '').toUpperCase().replace(/^GATE\s+/, '').trim();
    const feature = (loadedAirportMapData.features || []).find((candidate) => (
      ['parking_position', 'gate'].includes(candidate.kind)
      && ((wantedId && candidate.id === wantedId)
        || (wantedName && [candidate.ref, candidate.name]
          .some((value) => String(value || '').toUpperCase().replace(/^GATE\s+/, '').trim() === wantedName)))
    ));
    const coordinate = feature?.geometry === 'line' ? feature.coordinates?.at(-1) : feature?.coordinates?.[0];
    if (coordinate) resolvedGate = { ...resolvedGate, lat: coordinate[0], lon: coordinate[1] };
  }
  const fingerprint = resolvedGate ? `${resolvedGate.name}|${resolvedGate.lat}|${resolvedGate.lon}` : '';
  if (fingerprint === renderedGateFingerprint) return;
  renderedGateFingerprint = fingerprint;
  layers.gates.clearLayers();
  if (!resolvedGate || !Number.isFinite(resolvedGate.lat) || !Number.isFinite(resolvedGate.lon)) return;
  const label = resolvedGate.name || 'GATE';
  const icon = L.divIcon({
    className: 'gate-wrapper',
    html: `<div class="gate-marker"><i>G</i><b>${escapeHtml(label)}</b></div>`,
    iconSize: [130, 30],
    iconAnchor: [8, 15],
  });
  L.marker([resolvedGate.lat, resolvedGate.lon], { icon, interactive: false }).addTo(layers.gates);
}

function aircraftIcon(heading) {
  return L.divIcon({
    className: 'aircraft-wrapper',
    html: `<div class="aircraft-pointer" style="transform:rotate(${heading}deg)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8c-1 0-1.6 1-1.6 2.1v5.3L3.2 13v2l7.2-1.7v4.6l-2.1 1.6v1.6l3.7-.9 3.7.9v-1.6l-2.1-1.6v-4.6l7.2 1.7v-2l-7.2-3.8V3.9c0-1.1-.6-2.1-1.6-2.1Z"/></svg>
    </div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function renderAircraft(aircraft) {
  if (!aircraft || !Number.isFinite(aircraft.lat) || !Number.isFinite(aircraft.lon)) return;
  const latLng = [aircraft.lat, aircraft.lon];
  if (!layers.aircraft) {
    layers.aircraft = L.marker(latLng, {
      icon: aircraftIcon(aircraft.heading || 0),
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);
  } else {
    layers.aircraft.setLatLng(latLng);
    const pointer = layers.aircraft.getElement()?.querySelector('.aircraft-pointer');
    if (pointer) pointer.style.transform = `rotate(${aircraft.heading || 0}deg)`;
  }

  if (followAircraft && Date.now() - lastFollowAt > 1_200) {
    lastFollowAt = Date.now();
    const currentCenter = map.getCenter();
    const currentPoint = map.latLngToContainerPoint(currentCenter);
    const aircraftPoint = map.latLngToContainerPoint(latLng);
    if (currentPoint.distanceTo(aircraftPoint) > 80 || map.getZoom() < 17) {
      map.panTo(latLng, { animate: true, duration: 0.5 });
      if (map.getZoom() < 17) map.setZoom(17);
    }
  }
}

function fitRoute({ disableFollow = true } = {}) {
  const path = latestState?.taxi?.path ?? [];
  const coordinates = path.map((point) => [point.lat, point.lon]);
  if (latestState?.gate && Number.isFinite(latestState.gate.lat) && Number.isFinite(latestState.gate.lon)) {
    coordinates.push([latestState.gate.lat, latestState.gate.lon]);
  }
  if (coordinates.length >= 2) {
    if (disableFollow) {
      followAircraft = false;
      syncFollowButton();
    }
    if (!followAircraft || !latestState?.aircraft || !Number.isFinite(latestState.aircraft.lat) || !Number.isFinite(latestState.aircraft.lon)) {
      map.fitBounds(coordinates, { padding: [100, 100], maxZoom: 18.6, animate: true });
    }
  } else if (latestState?.aircraft) {
    map.setView([latestState.aircraft.lat, latestState.aircraft.lon], 18);
  } else if (latestAirportBounds?.isValid()) {
    map.fitBounds(latestAirportBounds, { padding: [45, 45], maxZoom: 15.5, animate: true });
  }
}

function syncFollowButton() {
  elements.followButton.classList.toggle('active', followAircraft);
  elements.followButton.setAttribute('aria-pressed', String(followAircraft));
}

function renderGuidance(state) {
  const guidance = state.guidance ?? {};
  const status = guidance.status ?? 'unavailable';
  const labels = {
    'on-route': ['✓', 'AUF FREIGEGEBENER ROUTE'],
    attention: ['!', 'ROUTE PRÜFEN'],
    'off-route': ['!', 'ABWEICHUNG'],
    unavailable: ['•', 'WARTE AUF ROUTE'],
  };
  const [icon, label] = labels[status] ?? labels.unavailable;
  elements.guidanceCard.className = `guidance-card ${status}`;
  elements.guidanceIcon.textContent = icon;
  elements.guidanceLabel.textContent = label;
  elements.deviation.textContent = guidance.available ? formatDistance(guidance.deviationMeters) : '—';
  elements.remaining.textContent = guidance.available ? formatDistance(guidance.remainingMeters) : '—';
  elements.groundSpeed.textContent = state.aircraft
    ? `${Math.round(state.aircraft.groundSpeed || 0)} kt`
    : '—';
  elements.gateName.textContent = state.gate?.name || state.taxi?.pathMetadata?.destination?.name || '—';

  const safetyAlert = state.integrations?.groundSafety?.alerts?.[0] || null;
  const warning = Boolean(safetyAlert || guidance.warning);
  const mismatch = guidance.reason === 'route-position-mismatch';
  elements.warningBanner.hidden = !warning && !mismatch;
  elements.warningBanner.classList.toggle('route-mismatch', mismatch);
  for (const level of ['caution', 'warning', 'critical']) elements.warningBanner.classList.toggle(`severity-${level}`, safetyAlert?.severity === level);
  elements.warningBanner.querySelector('strong').textContent = safetyAlert?.title || (mismatch ? 'ROUTE / POSITION UNPLAUSIBEL' : 'TAXIWEG VERLASSEN');
  elements.warningDetail.textContent = safetyAlert?.detail || (mismatch
    ? 'Alte Flugdaten erkannt. Die Abweichungswarnung wurde sicher deaktiviert.'
    : `${Math.round(guidance.deviationMeters || 0)} m von der freigegebenen Route entfernt`);
  elements.warningNewFlight.hidden = !mismatch;
  if (warning && !previousWarning && navigator.vibrate) navigator.vibrate(safetyAlert?.severity === 'critical' ? [220, 80, 220, 80, 220] : [180, 100, 180]);
  previousWarning = warning;
}

function renderClearance(taxi) {
  const clearance = taxi?.clearance;
  const sourceLabels = {
    sayintentions: 'SI EXACT',
    beyondatc: 'BATC EXACT',
    'clearance-map': 'AUS FREIGABE ABGELEITET',
    manual: 'MANUELL GEPLANT',
  };
  const sourceLabel = sourceLabels[taxi?.pathSource];
  elements.routeSource.hidden = !sourceLabel;
  elements.routeSource.textContent = sourceLabel || '';
  if (!clearance?.text) {
    const planned = taxi?.pathSource === 'manual' && (taxi?.path?.length ?? 0) > 1;
    elements.clearanceCard.classList.toggle('no-clearance', !planned);
    elements.clearanceStation.textContent = planned ? 'TAXI GUIDANCE' : 'CURRENT CLEARANCE';
    elements.clearanceText.textContent = planned
      ? taxi.pathMetadata?.label || 'Manuell geplanter Taxiweg ist aktiv.'
      : 'Warte auf Taxifreigabe oder manuelle Planung …';
    elements.clearanceTime.textContent = '';
    return;
  }
  elements.clearanceCard.classList.remove('no-clearance');
  elements.clearanceStation.textContent = clearance.station || 'CURRENT CLEARANCE';
  elements.clearanceText.textContent = clearance.text;
  elements.clearanceTime.textContent = formatTime(clearance.time);
}

function renderSharing(sharing) {
  const fingerprint = JSON.stringify([sharing?.pairingPin, sharing?.urls, Boolean(sharing?.qrDataUrl), sharing?.enabled, sharing?.deviceCount]);
  if (fingerprint === renderedSharingFingerprint) return;
  renderedSharingFingerprint = fingerprint;
  if (elements.sharingEnabled) {
    elements.sharingEnabled.checked = sharing?.enabled !== false;
    elements.sharingEnabled.disabled = deviceManagementAvailable === false;
  }
  elements.pairingPin.textContent = formatPin(sharing?.pairingPin);
  if (sharing?.qrDataUrl) elements.shareQr.src = sharing.qrDataUrl;
  elements.sharingUrls.replaceChildren();
  for (const url of sharing?.urls ?? []) {
    const code = document.createElement('code');
    code.textContent = url;
    elements.sharingUrls.append(code);
  }
}

function renderGsxServices(gsx) {
  const fallback = [
    ['boarding', 'Boarding'], ['deboarding', 'Deboarding'], ['catering', 'Catering'],
    ['refueling', 'Refueling'], ['pushback', 'Pushback'], ['deicing', 'De-Icing'],
  ].map(([id, label]) => ({ id, label, status: 'offline', statusLabel: 'OFFLINE', available: false }));
  const services = gsx?.services?.length ? gsx.services : fallback;
  elements.gsxServices.replaceChildren();
  for (const service of services) {
    const row = document.createElement('div');
    const status = service.status || (service.available ? 'available' : 'offline');
    row.className = `service-item ${status}`;
    row.innerHTML = `<span><strong>${escapeHtml(service.label)}</strong><small>${escapeHtml(service.statusLabel || status.toUpperCase())}</small></span><i>${service.active ? '●' : service.completed ? '✓' : service.available ? '○' : '—'}</i>`;
    elements.gsxServices.append(row);
  }
}

function formatWeight(pounds) {
  if (pounds === null || pounds === undefined || pounds === '') return '—';
  if (!Number.isFinite(Number(pounds))) return '—';
  if (preferences.weightUnit === 'lb') {
    return `${Math.round(Number(pounds)).toLocaleString(localeFor(currentLanguage))} lb`;
  }
  return `${Math.round(Number(pounds) * 0.453592).toLocaleString(localeFor(currentLanguage))} kg`;
}

function formatTemperature(celsius) {
  if (!Number.isFinite(Number(celsius))) return '—';
  if (preferences.temperatureUnit === 'f') return `${Math.round(Number(celsius) * 9 / 5 + 32)} °F`;
  return `${Math.round(Number(celsius))} °C`;
}

function formatPressure(hectopascal) {
  if (!Number.isFinite(Number(hectopascal))) return '—';
  if (preferences.pressureUnit === 'inhg') return `${(Number(hectopascal) * 0.0295299830714).toFixed(2)} inHg`;
  return `${Math.round(Number(hectopascal))} hPa`;
}

function formatFrequency(active, standby) {
  const format = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—';
  return `${format(active)} / ${format(standby)}`;
}

function renderFlightData(state) {
  const simbrief = state.integrations?.simbrief || {};
  const flight = simbrief.flight || {
    ...state.flight,
    route: state.flight?.flightPlanRoute,
    aircraftType: state.aircraft?.aircraftTitle,
    registration: state.aircraft?.registration,
  };
  const aircraft = state.aircraft || {};
  const imported = Boolean(simbrief.imported && simbrief.flight);
  elements.flightStatusPill.className = `module-status ${imported || flight.origin || flight.destination ? 'connected' : simbrief.status === 'error' ? 'attention' : 'waiting'}`;
  elements.flightStatusPill.textContent = imported ? 'OFP READY' : flight.origin || flight.destination ? 'SI / MSFS LIVE' : simbrief.status === 'error' ? 'IMPORT ERROR' : 'NO OFP';
  elements.simbriefGenerated.textContent = imported ? formatTime(simbrief.generatedAt) : '—';
  elements.simbriefOrigin.textContent = flight.origin || '—';
  elements.simbriefDestination.textContent = flight.destination || '—';
  elements.simbriefCallsign.textContent = flight.callsign || '—';
  elements.simbriefAircraft.textContent = [flight.aircraftType, flight.registration].filter(Boolean).join(' · ') || '—';
  elements.simbriefRunways.textContent = [flight.departureRunway, flight.arrivalRunway].filter(Boolean).join(' → ') || '—';
  elements.simbriefFuel.textContent = formatWeight(flight.blockFuelPounds);
  elements.simbriefPax.textContent = Number.isFinite(flight.passengers) ? String(flight.passengers) : '—';
  elements.simbriefEet.textContent = Number.isFinite(flight.enrouteSeconds)
    ? `${Math.floor(flight.enrouteSeconds / 3_600)}:${String(Math.floor(flight.enrouteSeconds / 60) % 60).padStart(2, '0')}` : '—';
  elements.simbriefRoute.textContent = flight.route || state.flight?.flightPlanRoute || 'Warte auf automatisch erkannten Flugplan …';

  const simOnline = ['connected', 'demo'].includes(state.connections?.simConnect?.status);
  elements.liveAircraftStatus.textContent = simOnline ? 'ONLINE' : 'OFFLINE';
  elements.liveAircraftType.textContent = [aircraft.aircraftTitle || flight.aircraftType, aircraft.registration || flight.registration].filter(Boolean).join(' · ') || '—';
  elements.liveAltitude.textContent = Number.isFinite(aircraft.altitudeFeet)
    ? `${Math.round(aircraft.altitudeFeet).toLocaleString(localeFor(currentLanguage))} / ${Number.isFinite(aircraft.aglFeet) ? Math.round(aircraft.aglFeet).toLocaleString(localeFor(currentLanguage)) : '—'} ft`
    : '—';
  elements.liveSpeeds.textContent = aircraft.lat === undefined ? '—' : `${Math.round(aircraft.indicatedAirspeed || 0)} / ${Math.round(aircraft.groundSpeed || 0)} kt`;
  elements.liveVs.textContent = Number.isFinite(aircraft.verticalSpeedFpm) ? `${Math.round(aircraft.verticalSpeedFpm)} ft/min` : '—';
  elements.liveWeights.textContent = [formatWeight(aircraft.fuelWeightPounds), formatWeight(aircraft.grossWeightPounds)].join(' / ');
  elements.liveWeather.textContent = Number.isFinite(aircraft.ambientWindDirection) && Number.isFinite(aircraft.ambientWindSpeedKnots)
    ? `${String(Math.round(aircraft.ambientWindDirection) % 360).padStart(3, '0')}°/${Math.round(aircraft.ambientWindSpeedKnots)} kt · ${formatTemperature(aircraft.ambientTemperatureC)}`
    : '—';
  elements.liveAtmosphere.textContent = Number.isFinite(aircraft.seaLevelPressureHpa)
    ? `${formatPressure(aircraft.seaLevelPressureHpa)} · ${Number.isFinite(aircraft.visibilityMeters) ? `${(aircraft.visibilityMeters / 1_000).toFixed(1)} km` : '—'}`
    : '—';
  elements.liveConfiguration.textContent = aircraft.gearDown === null || aircraft.gearDown === undefined
    ? '—'
    : `GEAR ${aircraft.gearDown ? 'DN' : 'UP'} · FLAPS ${Number.isFinite(aircraft.flapsHandleIndex) ? Math.round(aircraft.flapsHandleIndex) : '—'} · AP ${aircraft.autopilotMaster ? 'ON' : 'OFF'}`;
  elements.liveParkingBrake.textContent = aircraft.parkingBrake === null || aircraft.parkingBrake === undefined ? '—' : aircraft.parkingBrake ? 'SET' : 'RELEASED';
  elements.liveEngines.textContent = aircraft.enginesRunning === null || aircraft.enginesRunning === undefined ? '—' : aircraft.enginesRunning ? 'RUNNING' : 'OFF';
  elements.liveXpdr.textContent = Number.isFinite(aircraft.transponderCode) ? String(Math.round(aircraft.transponderCode)).padStart(4, '0') : '—';
  elements.liveCom1.textContent = formatFrequency(aircraft.com1Active, aircraft.com1Standby);
  elements.liveCom2.textContent = formatFrequency(aircraft.com2Active, aircraft.com2Standby);
}

function phaseDescriptionKey(id) {
  return `phaseDescription${String(id).split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join('')}`;
}

function formatEta(seconds) {
  if (!Number.isFinite(Number(seconds))) return 'ETA —';
  const eta = new Date(Date.now() + Math.max(0, Number(seconds)) * 1_000);
  return `ETA ${eta.toLocaleTimeString(localeFor(currentLanguage), {
    hour: '2-digit', minute: '2-digit', hour12: preferences.clockFormat === '12',
  })} LT · ${formatDuration(seconds)}`;
}

function renderPhaseRail(container, activePhase, { compact = false } = {}) {
  if (!container) return;
  container.replaceChildren();
  const activeIndex = Math.max(0, FLIGHT_PHASES.findIndex((entry) => entry.id === activePhase));
  for (const [index, phase] of FLIGHT_PHASES.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `phase-step${index < activeIndex ? ' complete' : ''}${index === activeIndex ? ' active' : ''}`;
    button.setAttribute('aria-current', index === activeIndex ? 'step' : 'false');
    button.title = t(phase.labelKey);
    const marker = document.createElement('i');
    marker.textContent = index < activeIndex ? '✓' : String(index + 1).padStart(2, '0');
    const label = document.createElement('span');
    label.textContent = t(compact ? phase.shortKey : phase.labelKey);
    button.append(marker, label);
    button.addEventListener('click', () => {
      if (container === elements.homePhaseRail) {
        switchModule('flight');
        return;
      }
      updateFlightOperations({ phaseOverride: phase.id }).catch(() => {});
    });
    container.append(button);
  }
}

function runPhaseAction(action) {
  if (action === 'new-flight') {
    openNewFlightDialog();
    return;
  }
  if (action === 'planner') {
    switchModule('taxi');
    setTimeout(openPlanner, 80);
    return;
  }
  switchModule(action);
}

function renderPhaseActions(container, phase, limit = Infinity) {
  if (!container) return;
  container.replaceChildren();
  const actions = (PHASE_ACTIONS[phase] || []).filter(isAppEnabled).slice(0, limit);
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = container === elements.homePhaseActions ? 'phase-quick-action' : 'phase-action-button';
    button.textContent = action === 'new-flight' ? t('newFlight') : appLabel(action);
    button.addEventListener('click', () => runPhaseAction(action));
    container.append(button);
  }
}

async function updateFlightOperations(patch, { status = null } = {}) {
  if (!token) return null;
  if (status && elements.flightNotesStatus) elements.flightNotesStatus.textContent = status;
  const response = await fetch(authenticatedUrl('/api/flight/operations'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t('saveFailed'));
  latestState = data.state;
  renderFlightJourney(data.state);
  return data.operations;
}

function checklistKey(phase, id) {
  return `${phase}:${id}`;
}

function phaseChecklistState(phase, state) {
  const operations = state.integrations?.flightOperations || {};
  const savedChecks = operations.checklist || {};
  const items = phaseChecklist(phase, state, trackingCurrentFlight).map((item) => ({
    ...item,
    checked: item.automatic ? item.complete : Boolean(savedChecks[checklistKey(phase, item.id)]),
  }));
  return {
    items,
    completed: items.filter((item) => item.checked).length,
    open: items.filter((item) => !item.checked),
    savedChecks,
  };
}

function renderPhaseChecklist(phase, state, snapshot = phaseChecklistState(phase, state)) {
  const { items, completed, savedChecks } = snapshot;
  elements.phaseChecklistList.replaceChildren();
  for (const item of items) {
    const key = checklistKey(phase, item.id);
    const checked = item.checked;
    const row = document.createElement(item.automatic ? 'div' : 'button');
    if (!item.automatic) row.type = 'button';
    row.className = `phase-check-item${checked ? ' complete' : ''}`;
    const marker = document.createElement('i');
    marker.textContent = checked ? '✓' : '';
    const label = document.createElement('span');
    label.textContent = t(item.labelKey);
    const source = document.createElement('small');
    source.textContent = t(item.automatic ? 'automaticStatus' : 'manualStatus');
    row.append(marker, label, source);
    if (!item.automatic) {
      row.setAttribute('aria-pressed', String(checked));
      row.addEventListener('click', async () => {
        row.disabled = true;
        try {
          await updateFlightOperations({ checklist: { ...savedChecks, [key]: !checked } });
        } catch (error) {
          elements.flightNotesStatus.textContent = error.message;
        } finally {
          row.disabled = false;
        }
      });
    }
    elements.phaseChecklistList.append(row);
  }
  elements.phaseChecklistProgress.textContent = `${completed} / ${items.length}`;
}

function renderJourneyReadiness(snapshot) {
  const ready = snapshot.open.length === 0;
  elements.journeyReadiness.classList.toggle('ready', ready);
  elements.journeyReadinessIcon.textContent = ready ? '✓' : '!';
  elements.journeyReadinessTitle.textContent = ready
    ? t('readyForPhase')
    : `${snapshot.open.length} ${t('itemsOpen')}`;
  elements.journeyReadinessDetail.textContent = ready
    ? t('noOpenItems')
    : snapshot.open.slice(0, 3).map((item) => t(item.labelKey)).join(' · ');
  elements.reviewOpenItems.hidden = ready;
}

function timelineClock(value) {
  return value ? formatTime(value).replace(/ LT$/, '') : '—';
}

function renderFlightTimeline(timeline) {
  elements.flightTimeline.replaceChildren();
  const live = timeline.events.some((event) => event.actualAt || event.predictedAt);
  elements.timelineStatus.textContent = timeline.hasPlan
    ? (live ? t('liveSchedule') : 'SIMBRIEF')
    : t('noSchedule');
  for (const event of timeline.events) {
    const row = document.createElement('div');
    row.className = `timeline-event ${event.status}`;
    const title = document.createElement('strong');
    title.textContent = event.id.toUpperCase();
    const planned = document.createElement('span');
    planned.textContent = `${t('planned')} ${timelineClock(event.plannedAt)}`;
    const operational = document.createElement('span');
    operational.textContent = event.actualAt
      ? `${t('actual')} ${timelineClock(event.actualAt)}`
      : event.predictedAt ? `${t('predicted')} ${timelineClock(event.predictedAt)}` : '—';
    const delta = document.createElement('small');
    if (Number.isFinite(event.deltaMinutes)) {
      const absolute = Math.abs(event.deltaMinutes);
      delta.className = `timeline-delay${event.deltaMinutes < 0 ? ' early' : ''}`;
      delta.textContent = event.deltaMinutes === 0
        ? t('onTime')
        : `${absolute} ${t(event.deltaMinutes > 0 ? 'minutesLate' : 'minutesEarly')}`;
    } else {
      delta.textContent = '—';
    }
    row.append(title, planned, operational, delta);
    elements.flightTimeline.append(row);
  }
}

function renderOperationalAlerts(state, phase, progress, timeline) {
  const alerts = [];
  if (preferences.alertMode !== 'off') {
    if (Number.isFinite(progress.projectedReserveMarginPounds)
      && progress.projectedReserveMarginPounds < preferences.fuelBufferPounds) {
      alerts.push({ severity: 'danger', text: `${t('alertFuelReserve')} · ${formatWeight(progress.projectedReserveMarginPounds)}` });
    }
    const arrivalDistance = progress.remainingRouteNm ?? progress.destinationDistanceNm;
    if (['cruise', 'descent', 'approach'].includes(phase)
      && Number.isFinite(arrivalDistance)
      && arrivalDistance <= preferences.arrivalTriggerNm) {
      const arrival = phaseChecklistState('descent', state);
      const arrivalIds = new Set(['destination-weather', 'arrival-runway', 'arrival-taxi', 'arrival-briefing', 'landing-data']);
      if (arrival.open.some((item) => arrivalIds.has(item.id))) {
        alerts.push({ severity: 'info', text: `${t('alertArrivalPlan')} · ${formatNauticalMiles(arrivalDistance)}` });
      }
    }
    const scheduleDelta = timeline.activeEvent?.deltaMinutes;
    if (Number.isFinite(scheduleDelta) && scheduleDelta >= 15) {
      alerts.push({ severity: 'warning', text: `${t('alertScheduleDelay')} · +${scheduleDelta} min` });
    }
  }
  elements.journeyAlertList.replaceChildren();
  for (const alert of alerts) {
    const chip = document.createElement('span');
    chip.className = `journey-alert ${alert.severity}`;
    chip.textContent = alert.text;
    elements.journeyAlertList.append(chip);
  }
  const fingerprint = JSON.stringify(alerts);
  if (preferences.alertMode === 'normal' && alerts.length && fingerprint !== lastOperationalAlertFingerprint) {
    try { navigator.vibrate?.(120); } catch { /* Vibration is optional. */ }
  }
  lastOperationalAlertFingerprint = fingerprint;
}

function renderFlightJourney(state) {
  if (!state || !elements.flightPhaseTitle) return;
  const operations = state.integrations?.flightOperations || { phaseOverride: 'auto', checklist: {}, notes: '' };
  const phase = resolveFlightPhase(state, trackingCurrentFlight, operations.phaseOverride);
  const meta = FLIGHT_PHASES.find((entry) => entry.id === phase) || FLIGHT_PHASES[0];
  const progress = calculateFlightProgress(state);
  const timeline = calculateFlightTimeline(state, trackingCurrentFlight, phase);
  const checklist = phaseChecklistState(phase, state);
  const flight = state.integrations?.simbrief?.flight || state.flight || {};
  const aircraft = state.aircraft || {};
  const automatic = !operations.phaseOverride || operations.phaseOverride === 'auto';
  const sourceParts = [];
  if (['connected', 'demo'].includes(state.connections?.sayIntentions?.status)) sourceParts.push('SI');
  if (['connected', 'demo'].includes(state.connections?.simConnect?.status)) sourceParts.push('MSFS');
  const source = automatic
    ? `${t('automaticStatus')} · ${sourceParts.join(' / ') || t('waiting')}`
    : t('manualStatus');
  const phaseTitle = t(meta.labelKey);
  const nextIdent = progress.nextWaypoint?.ident || progress.nextWaypoint?.name || '—';
  const remaining = formatNauticalMiles(progress.remainingRouteNm ?? progress.destinationDistanceNm);
  const eta = formatEta(progress.etaSeconds);
  const fuel = formatWeight(progress.fuelRemainingPounds);
  const percent = Number.isFinite(progress.completedPercent) ? Math.round(progress.completedPercent) : null;

  elements.homePhaseCard.hidden = !preferences.showPhaseHome;
  elements.homePhaseTitle.textContent = phaseTitle;
  elements.homePhaseSource.textContent = source.toUpperCase();
  elements.homeNextWaypoint.textContent = nextIdent;
  elements.homeFlightRemaining.textContent = remaining;
  elements.homeFlightEta.textContent = eta.replace(/^ETA /, '').split(' · ')[0];
  elements.homeFlightFuel.textContent = fuel;
  renderPhaseRail(elements.homePhaseRail, phase, { compact: true });
  renderPhaseActions(elements.homePhaseActions, phase, 2);

  elements.flightPhaseTitle.textContent = phaseTitle;
  elements.flightPhaseDescription.textContent = t(phaseDescriptionKey(phase));
  elements.flightPhaseSelect.value = automatic ? 'auto' : phase;
  elements.flightPhaseSource.textContent = source.toUpperCase();
  renderPhaseRail(elements.flightPhaseRail, phase);
  elements.journeyRouteIdent.textContent = [flight.origin || state.flight?.origin || '—', flight.destination || state.flight?.destination || '—'].join(' → ');
  elements.journeyProgressValue.textContent = percent === null ? '—' : `${percent}%`;
  elements.journeyProgressBar.style.width = `${percent ?? 0}%`;
  elements.journeyNextWaypoint.textContent = nextIdent;
  elements.journeyNextDistance.textContent = formatNauticalMiles(progress.nextWaypointDistanceNm);
  elements.journeyRemaining.textContent = remaining;
  elements.journeyEta.textContent = eta;
  elements.journeyFuel.textContent = fuel;
  if (Number.isFinite(progress.projectedLandingFuelPounds)) {
    const margin = Number.isFinite(progress.projectedReserveMarginPounds)
      ? ` · ${t('reserveMargin')} ${formatWeight(progress.projectedReserveMarginPounds)}` : '';
    elements.journeyFuelDelta.textContent = `${t('projectedLandingFuel')} ${formatWeight(progress.projectedLandingFuelPounds)}${margin}`;
  } else if (Number.isFinite(progress.fuelDeltaToPlannedPounds)) {
    const value = Number(progress.fuelDeltaToPlannedPounds);
    elements.journeyFuelDelta.textContent = value >= 0
      ? `${formatWeight(value)} ${t('plannedBurnRemaining')}`
      : `${formatWeight(Math.abs(value))} ${t('abovePlannedBurn')}`;
  } else {
    elements.journeyFuelDelta.textContent = t('noFuelPlan');
  }
  elements.journeyWind.textContent = Number.isFinite(Number(aircraft.ambientWindDirection)) && Number.isFinite(Number(aircraft.ambientWindSpeedKnots))
    ? `${String(Math.round(aircraft.ambientWindDirection) % 360).padStart(3, '0')}° / ${Math.round(aircraft.ambientWindSpeedKnots)} kt`
    : '—';
  const conditionParts = [];
  if (Number.isFinite(Number(aircraft.ambientTemperatureC))) conditionParts.push(formatTemperature(aircraft.ambientTemperatureC));
  if (Number.isFinite(Number(aircraft.aglFeet))) conditionParts.push(`${Math.round(aircraft.aglFeet).toLocaleString(localeFor(currentLanguage))} ft AGL`);
  elements.journeyTemperature.textContent = conditionParts.join(' · ') || '—';
  renderPhaseActions(elements.phaseActionList, phase);
  renderPhaseChecklist(phase, state, checklist);
  renderJourneyReadiness(checklist);
  renderFlightTimeline(timeline);
  renderOperationalAlerts(state, phase, progress, timeline);
  if (document.activeElement !== elements.flightNotes) elements.flightNotes.value = operations.notes || '';
  if (!flightOperationsSaving) elements.flightNotesStatus.textContent = t('saved');
}

async function refreshJourneyRecord({ force = false } = {}) {
  if (!token || journeyRecordRequestRunning) return;
  if (!force && Date.now() - lastJourneyRecordRefreshAt < 10_000) return;
  lastJourneyRecordRefreshAt = Date.now();
  journeyRecordRequestRunning = true;
  try {
    const response = await fetch(authenticatedUrl('/api/flights/current'), { cache: 'no-store' });
    const data = await response.json();
    if (response.ok) trackingCurrentFlight = data.flight || null;
    if (latestState) renderFlightJourney(latestState);
  } finally {
    journeyRecordRequestRunning = false;
  }
}

function ensureTrackingMap() {
  if (trackingMap) return trackingMap;
  trackingMap = L.map('tracking-map', {
    zoomControl: true,
    attributionControl: true,
    preferCanvas: true,
    zoomSnap: 0.25,
    worldCopyJump: true,
  }).setView([50.5, 8.5], 5.5);
  trackingMap.createPane('trackingPlanned').style.zIndex = '410';
  trackingMap.createPane('trackingActual').style.zIndex = '430';
  trackingMap.createPane('trackingMarkers').style.zIndex = '450';
  trackingMap.createPane('trackingTraffic').style.zIndex = '445';
  trackingMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc',
    updateWhenIdle: true,
    keepBuffer: 3,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
  });
  trackingSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    updateWhenIdle: true,
    keepBuffer: 3,
    attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics and contributors',
  });
  trackingBasemap = localStorage.getItem('flight-deck-tracking-basemap') === 'satellite' ? 'satellite' : 'map';
  (trackingBasemap === 'satellite' ? trackingSatelliteLayer : trackingMapLayer).addTo(trackingMap);
  document.querySelector('#tracking-map')?.classList.toggle('satellite-active', trackingBasemap === 'satellite');
  for (const button of elements.trackingBasemapButtons) button.classList.toggle('active', button.dataset.trackingBasemap === trackingBasemap);
  trackingLayers.planned = L.layerGroup().addTo(trackingMap);
  trackingLayers.actual = L.layerGroup().addTo(trackingMap);
  trackingLayers.waypoints = L.layerGroup().addTo(trackingMap);
  trackingLayers.airports = L.layerGroup().addTo(trackingMap);
  trackingLayers.traffic = L.layerGroup().addTo(trackingMap);
  trackingMap.on('dragstart', () => {
    trackingFollowAircraft = false;
    elements.trackingFollow.classList.remove('active');
  });
  return trackingMap;
}

function setTrackingBasemap(mode) {
  ensureTrackingMap();
  trackingBasemap = mode === 'satellite' ? 'satellite' : 'map';
  const selectedLayer = trackingBasemap === 'satellite' ? trackingSatelliteLayer : trackingMapLayer;
  const oldLayer = trackingBasemap === 'satellite' ? trackingMapLayer : trackingSatelliteLayer;
  if (trackingMap.hasLayer(oldLayer)) trackingMap.removeLayer(oldLayer);
  if (!trackingMap.hasLayer(selectedLayer)) selectedLayer.addTo(trackingMap);
  const container = document.querySelector('#tracking-map');
  container?.classList.toggle('satellite-active', trackingBasemap === 'satellite');
  for (const button of elements.trackingBasemapButtons) button.classList.toggle('active', button.dataset.trackingBasemap === trackingBasemap);
  localStorage.setItem('flight-deck-tracking-basemap', trackingBasemap);
}

function startTrackingRefreshTimer() {
  stopTrackingRefreshTimer();
  trackingRefreshTimer = setInterval(() => refreshTrackingData().catch(() => {}), 3_000);
}

function stopTrackingRefreshTimer() {
  clearInterval(trackingRefreshTimer);
  trackingRefreshTimer = null;
}

function formatFlightDate(value, { time = true } = {}) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(localeFor(currentLanguage), time
    ? { dateStyle: 'medium', timeStyle: 'short', hour12: preferences.clockFormat === '12' }
    : { dateStyle: 'medium' });
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return '—';
  const total = Math.max(0, Math.round(Number(seconds)));
  const hours = Math.floor(total / 3_600);
  const minutes = Math.floor(total / 60) % 60;
  const remainingSeconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')} h`
    : `${minutes}:${String(remainingSeconds).padStart(2, '0')} min`;
}

function formatNauticalMiles(value) {
  if (!Number.isFinite(Number(value))) return '—';
  const distance = preferences.distanceUnit === 'km' ? Number(value) * 1.852 : Number(value);
  const decimals = distance >= 100 ? 0 : 1;
  return `${distance.toFixed(decimals)} ${preferences.distanceUnit === 'km' ? 'km' : 'NM'}`;
}

function trackingFallbackRecord(state) {
  const simbrief = state?.integrations?.simbrief?.flight || {};
  const flight = state?.flight || {};
  const aircraft = state?.aircraft || {};
  const siWeather = state?.integrations?.sayIntentions?.weather || {};
  const officialWeather = state?.integrations?.aviationWeather || {};
  return {
    id: null,
    status: 'waiting',
    startedAt: null,
    endedAt: null,
    flight: {
      callsign: flight.callsign || simbrief.callsign || null,
      origin: flight.origin || simbrief.origin || null,
      originName: simbrief.originName || null,
      destination: flight.destination || simbrief.destination || null,
      destinationName: simbrief.destinationName || null,
      departureRunway: flight.departureRunway || simbrief.departureRunway || null,
      arrivalRunway: flight.arrivalRunway || simbrief.arrivalRunway || null,
      gate: state?.gate?.name || null,
      aircraftType: simbrief.aircraftType || null,
      aircraftName: aircraft.aircraftTitle || simbrief.aircraftName || null,
      registration: aircraft.registration || simbrief.registration || null,
    },
    plan: {
      source: state?.integrations?.simbrief?.imported ? 'simbrief' : flight.flightPlanRoute ? 'sayintentions' : 'simulator',
      route: simbrief.route || flight.flightPlanRoute || null,
      sid: flight.sid || null,
      star: flight.star || null,
      waypoints: simbrief.waypoints || [],
      originPosition: simbrief.originPosition || flight.originPosition || null,
      destinationPosition: simbrief.destinationPosition || flight.destinationPosition || null,
    },
    track: [],
    weather: [{
      capturedAt: siWeather.updatedAt || new Date().toISOString(),
      airports: siWeather.airports || [],
      officialAirports: officialWeather.airports || [],
      simbrief: {
        origin: simbrief.origin || flight.origin || null,
        originMetar: simbrief.originMetar || null,
        destination: simbrief.destination || flight.destination || null,
        destinationMetar: simbrief.destinationMetar || null,
      },
    }],
    stats: { pointCount: 0, distanceNm: 0, durationSeconds: 0, airborneSeconds: 0 },
  };
}

function trackingPlanPoints(record) {
  const waypoints = (record?.plan?.waypoints || []).filter((entry) => Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lon)));
  if (waypoints.length > 1) return waypoints;
  return [record?.plan?.originPosition, record?.plan?.destinationPosition]
    .filter((entry) => Number.isFinite(Number(entry?.lat)) && Number.isFinite(Number(entry?.lon)));
}

function trackingActualPoints(record) {
  return (record?.track || []).filter((entry) => Number.isFinite(Number(entry.lat)) && Number.isFinite(Number(entry.lon)));
}

function trackingDisplayPoints(points, maximum = 3_000) {
  if (points.length <= maximum) return points;
  const result = [];
  const step = (points.length - 1) / (maximum - 1);
  for (let index = 0; index < maximum; index += 1) result.push(points[Math.round(index * step)]);
  result[result.length - 1] = points.at(-1);
  return result;
}

function weatherByAirport(record) {
  const latest = record?.weather?.at(-1) || {};
  const values = new Map();
  for (const item of latest.airports || []) {
    if (item.airport) values.set(String(item.airport).toUpperCase(), item);
  }
  for (const item of latest.officialAirports || []) {
    if (!item.airport) continue;
    const key = String(item.airport).toUpperCase();
    values.set(key, { ...item, ...(values.get(key) || {}) });
  }
  const simbrief = latest.simbrief || {};
  if (simbrief.origin && simbrief.originMetar && !values.has(String(simbrief.origin).toUpperCase())) {
    values.set(String(simbrief.origin).toUpperCase(), { airport: simbrief.origin, metar: simbrief.originMetar });
  }
  if (simbrief.destination && simbrief.destinationMetar && !values.has(String(simbrief.destination).toUpperCase())) {
    values.set(String(simbrief.destination).toUpperCase(), { airport: simbrief.destination, metar: simbrief.destinationMetar });
  }
  return values;
}

function trackingBounds(record, liveAircraft = null) {
  const points = [...trackingPlanPoints(record), ...trackingActualPoints(record)];
  if (liveAircraft && Number.isFinite(Number(liveAircraft.lat)) && Number.isFinite(Number(liveAircraft.lon))) points.push(liveAircraft);
  return points.length ? L.latLngBounds(points.map((entry) => [Number(entry.lat), Number(entry.lon)])) : null;
}

function fitTrackingFlight() {
  if (!trackingMap || !trackingViewedFlight) return;
  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;
  const bounds = trackingBounds(trackingViewedFlight, liveAircraft);
  if (bounds?.isValid()) trackingMap.fitBounds(bounds, { padding: [38, 38], maxZoom: 12, animate: true });
}

function trafficTrailKey(entry = {}) {
  return String(entry.objectId ?? entry.id ?? entry.callsign ?? entry.atcId ?? '').trim();
}

function updateTrafficTrails(entries = []) {
  const now = Date.now();
  for (const entry of entries.slice(0, 80)) {
    const lat = Number(entry.lat ?? entry.latitude);
    const lon = Number(entry.lon ?? entry.longitude);
    const key = trafficTrailKey(entry);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const trail = trafficTrails.get(key) || { key, callsign: entry.callsign || entry.atcId || `AI-${key}`, points: [], lastSeen: now, entry: {} };
    trail.callsign = entry.callsign || entry.atcId || trail.callsign;
    trail.entry = { ...trail.entry, ...entry };
    trail.lastSeen = now;
    const point = { lat, lon, time: now, altitudeFeet: Number(entry.altitudeFeet), groundSpeed: Number(entry.groundSpeed) };
    const previous = trail.points.at(-1);
    if (!previous || approximateDistanceMeters(previous, point) >= 35 || now - previous.time >= 12_000) {
      trail.points.push(point);
      if (trail.points.length > 600) trail.points.splice(0, trail.points.length - 600);
    }
    trafficTrails.set(key, trail);
  }
  for (const [key, trail] of trafficTrails) {
    if (now - trail.lastSeen > 180_000) {
      trafficTrails.delete(key);
      if (selectedTrafficTrailId === key) selectedTrafficTrailId = null;
    }
  }
}

function renderTrackingTraffic(state) {
  if (!trackingLayers.traffic || trackingSelectedId) {
    trackingLayers.traffic?.clearLayers();
    return;
  }
  const entries = Array.isArray(state?.integrations?.simTraffic?.aircraft) ? state.integrations.simTraffic.aircraft : [];
  updateTrafficTrails(entries);
  trackingLayers.traffic.clearLayers();
  const selected = selectedTrafficTrailId ? trafficTrails.get(selectedTrafficTrailId) : null;
  if (selected?.points?.length > 1) {
    L.polyline(selected.points.map((point) => [point.lat, point.lon]), {
      pane: 'trackingTraffic', color: '#f1b94d', opacity: 0.92, weight: 3, dashArray: '7 5', lineCap: 'round', interactive: false,
    }).addTo(trackingLayers.traffic);
  }
  for (const entry of entries.slice(0, 80)) {
    const lat = Number(entry.lat ?? entry.latitude);
    const lon = Number(entry.lon ?? entry.longitude);
    const key = trafficTrailKey(entry);
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const callsign = entry.callsign || entry.atcId || `AI-${key}`;
    const isSelected = key === selectedTrafficTrailId;
    const marker = L.marker([lat, lon], {
      pane: 'trackingTraffic',
      zIndexOffset: isSelected ? 900 : 200,
      icon: L.divIcon({
        className: `tracking-traffic-icon${isSelected ? ' selected' : ''}`,
        html: `<span>${escapeHtml(callsign)}</span>`,
        iconSize: [1, 1], iconAnchor: [0, 0],
      }),
    }).addTo(trackingLayers.traffic);
    const trail = trafficTrails.get(key);
    marker.bindPopup(`<strong>${escapeHtml(callsign)}</strong><br>${escapeHtml([entry.origin, entry.destination].filter(Boolean).join(' → ') || entry.airline || entry.title || 'Simulator Traffic')}<br>${Number.isFinite(Number(entry.altitudeFeet)) ? `${Math.round(Number(entry.altitudeFeet)).toLocaleString(localeFor(currentLanguage))} ft` : ''}${Number.isFinite(Number(entry.groundSpeed)) ? ` · ${Math.round(Number(entry.groundSpeed))} kt` : ''}<br><small>Route: ${trail?.points?.length > 1 ? 'seit Start dieser EFB-Sitzung beobachtet' : 'noch keine ausreichende Historie'}</small>`);
    marker.on('click', () => {
      selectedTrafficTrailId = selectedTrafficTrailId === key ? null : key;
      renderTrackingMap(trackingViewedFlight || trackingFallbackRecord(latestState || {}));
    });
  }
}

function renderTrackingMap(record) {
  ensureTrackingMap();
  trackingLayers.actual.clearLayers();
  if (trackingLayers.aircraft) {
    trackingMap.removeLayer(trackingLayers.aircraft);
    trackingLayers.aircraft = null;
  }

  const planPoints = trackingPlanPoints(record);
  const actualPoints = trackingActualPoints(record);
  const displayActualPoints = trackingDisplayPoints(actualPoints);
  if (displayActualPoints.length > 1) {
    L.polyline(displayActualPoints.map((entry) => [entry.lat, entry.lon]), {
      pane: 'trackingActual', color: '#19e4d5', opacity: 0.96, weight: 4, lineCap: 'round', lineJoin: 'round', interactive: false,
    }).addTo(trackingLayers.actual);
  }

  renderTrackingTraffic(latestState || {});
  const weather = weatherByAirport(record);
  const staticRenderKey = JSON.stringify([
    trackingSelectedId || record?.id || 'pending',
    currentLanguage,
    (record?.plan?.waypoints || []).map((entry) => [entry.ident, entry.lat, entry.lon, entry.altitudeFeet]),
    [...weather.entries()],
  ]);
  if (staticRenderKey !== trackingStaticRenderKey) {
    trackingStaticRenderKey = staticRenderKey;
    trackingLayers.planned.clearLayers();
    trackingLayers.waypoints.clearLayers();
    trackingLayers.airports.clearLayers();
    if (planPoints.length > 1) {
      L.polyline(planPoints.map((entry) => [entry.lat, entry.lon]), {
        pane: 'trackingPlanned', color: '#b6d0df', opacity: 0.78, weight: 2.5, dashArray: '9 8', lineCap: 'round', interactive: false,
      }).addTo(trackingLayers.planned);
    }
    for (const [index, entry] of (record?.plan?.waypoints || []).entries()) {
      if (!Number.isFinite(Number(entry.lat)) || !Number.isFinite(Number(entry.lon))) continue;
      const ident = entry.ident || `WP${index + 1}`;
      const marker = L.marker([entry.lat, entry.lon], {
        pane: 'trackingMarkers',
        icon: L.divIcon({ className: 'tracking-waypoint-icon', html: `<span>${escapeHtml(String(index + 1))}</span>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
      }).addTo(trackingLayers.waypoints);
      marker.bindTooltip(escapeHtml(ident), { direction: 'top', offset: [0, -8], className: 'tracking-waypoint-tooltip' });
      marker.bindPopup(`<strong>${escapeHtml(ident)}</strong><br>${escapeHtml([entry.airway, entry.type].filter(Boolean).join(' · '))}<br>${Number.isFinite(Number(entry.altitudeFeet)) ? `${Math.round(entry.altitudeFeet).toLocaleString(localeFor(currentLanguage))} ft` : ''}`);
    }
    const airportEntries = [
      { icao: record?.flight?.origin, point: record?.plan?.originPosition || planPoints[0] },
      { icao: record?.flight?.destination, point: record?.plan?.destinationPosition || planPoints.at(-1) },
    ];
    for (const entry of airportEntries) {
      if (!entry.icao || !Number.isFinite(Number(entry.point?.lat)) || !Number.isFinite(Number(entry.point?.lon))) continue;
      const marker = L.marker([entry.point.lat, entry.point.lon], {
        pane: 'trackingMarkers',
        icon: L.divIcon({ className: 'tracking-airport-icon', html: `<span>${escapeHtml(entry.icao)}</span>`, iconSize: [42, 25], iconAnchor: [21, 12] }),
      }).addTo(trackingLayers.airports);
      const wx = weather.get(String(entry.icao).toUpperCase());
      marker.bindPopup(`<strong>${escapeHtml(entry.icao)}</strong>${wx?.metar ? `<br><small>METAR</small><br>${escapeHtml(wx.metar)}` : ''}${wx?.atis ? `<br><small>ATIS</small><br>${escapeHtml(wx.atis)}` : ''}`);
    }
  }

  const liveAircraft = trackingSelectedId ? null : latestState?.aircraft;
  const aircraft = liveAircraft && Number.isFinite(Number(liveAircraft.lat)) ? liveAircraft : actualPoints.at(-1);
  if (aircraft && Number.isFinite(Number(aircraft.lat)) && Number.isFinite(Number(aircraft.lon))) {
    const heading = Number(aircraft.heading ?? aircraft.headingDegrees ?? 0);
    trackingLayers.aircraft = L.marker([aircraft.lat, aircraft.lon], {
      pane: 'trackingMarkers',
      zIndexOffset: 1_000,
      icon: L.divIcon({ className: 'tracking-aircraft-icon', html: `<span><b style="transform:rotate(${heading}deg)">↑</b></span>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
    }).addTo(trackingMap);
  }

  const renderKey = trackingSelectedId ? `archive:${trackingSelectedId}` : `live:${record?.id || 'pending'}`;
  if (renderKey !== trackingRenderedKey) {
    trackingRenderedKey = renderKey;
    const bounds = trackingBounds(record, liveAircraft);
    if (bounds?.isValid()) trackingMap.fitBounds(bounds, { padding: [38, 38], maxZoom: 11, animate: false });
  }
  if (!trackingSelectedId && trackingFollowAircraft && liveAircraft && Date.now() - trackingLastFollowAt > 1_500) {
    trackingLastFollowAt = Date.now();
    const minimumZoom = liveAircraft.onGround ? 13.5 : 7.5;
    trackingMap.setView([liveAircraft.lat, liveAircraft.lon], Math.max(minimumZoom, trackingMap.getZoom()), { animate: true });
  }
}

function renderTrackingArchiveList() {
  elements.flightArchiveList.replaceChildren();
  elements.trackingArchiveCount.textContent = String(trackingArchive.length);
  if (!trackingArchive.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = t('noFlights');
    elements.flightArchiveList.append(empty);
    return;
  }
  for (const flight of trackingArchive) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `flight-archive-entry ${flight.status === 'recording' ? 'recording' : ''}${flight.id === trackingSelectedId ? ' active' : ''}`;
    const route = [flight.flight?.origin, flight.flight?.destination].filter(Boolean).join(' → ') || flight.flight?.callsign || t('recordedFlight');
    const detail = [formatFlightDate(flight.startedAt), flight.flight?.aircraftType || flight.flight?.aircraftName, formatNauticalMiles(flight.stats?.distanceNm)].filter((value) => value && value !== '—').join(' · ');
    button.innerHTML = `<span><strong>${escapeHtml(route)}</strong><small>${escapeHtml(detail)}</small></span><b>${flight.status === 'recording' ? t('recording') : formatDuration(flight.stats?.durationSeconds)}</b>`;
    button.addEventListener('click', () => flight.status === 'recording' ? showLiveTracking() : openTrackedFlight(flight.id));
    elements.flightArchiveList.append(button);
  }
}

function renderTrackingWaypoints(record) {
  const waypoints = record?.plan?.waypoints || [];
  elements.trackingWaypointCount.textContent = `${waypoints.length} WPT`;
  elements.trackingRouteSummary.textContent = record?.plan?.route
    || [record?.flight?.origin, record?.plan?.sid, record?.plan?.star, record?.flight?.destination].filter(Boolean).join(' · ')
    || t('noPlannedRoute');
  elements.trackingWaypointList.replaceChildren();
  for (const [index, waypoint] of waypoints.entries()) {
    const row = document.createElement('div');
    row.className = 'tracking-waypoint-row';
    row.innerHTML = `<i>${index + 1}</i><span><strong>${escapeHtml(waypoint.ident || `WP${index + 1}`)}</strong><small>${escapeHtml([waypoint.airway, waypoint.type, waypoint.stage].filter(Boolean).join(' · '))}</small></span><b>${Number.isFinite(Number(waypoint.altitudeFeet)) ? `${Math.round(waypoint.altitudeFeet).toLocaleString(localeFor(currentLanguage))} ft` : '—'}</b>`;
    row.addEventListener('click', () => trackingMap?.setView([waypoint.lat, waypoint.lon], Math.max(9, trackingMap.getZoom()), { animate: true }));
    elements.trackingWaypointList.append(row);
  }
  if (!waypoints.length) elements.trackingWaypointList.innerHTML = `<p class="empty-list">${escapeHtml(t('noWaypointCoordinates'))}</p>`;
}

function renderTrackingWeather(record) {
  const latest = record?.weather?.at(-1) || {};
  elements.trackingWeatherTime.textContent = formatTime(latest.capturedAt) || '—';
  elements.trackingWeatherList.replaceChildren();
  const weather = [...weatherByAirport(record).values()];
  for (const entry of weather) {
    const card = document.createElement('article');
    card.className = 'tracking-weather-item';
    card.innerHTML = `<header><strong>${escapeHtml(entry.airport || 'WX')}</strong><span>${escapeHtml(entry.activeRunway ? `RWY ${entry.activeRunway}` : [entry.windDirection, entry.windSpeed].every((value) => Number.isFinite(Number(value))) ? `${String(Math.round(entry.windDirection)).padStart(3, '0')}° / ${Math.round(entry.windSpeed)} kt` : '')}</span></header><p>${escapeHtml(entry.metar || t('noMetar'))}</p>${entry.atis ? `<p>${escapeHtml(entry.atis)}</p>` : ''}`;
    elements.trackingWeatherList.append(card);
  }
  if (!weather.length) elements.trackingWeatherList.innerHTML = `<p class="empty-list">${escapeHtml(t('noWeatherRecorded'))}</p>`;
}

function renderTrackingDetails(record) {
  const stats = record?.stats || {};
  const values = [
    ['CALLSIGN', record?.flight?.callsign || '—'],
    ['AIRCRAFT', [record?.flight?.aircraftType, record?.flight?.registration].filter(Boolean).join(' · ') || record?.flight?.aircraftName || '—'],
    ['RUNWAYS', [record?.flight?.departureRunway, record?.flight?.arrivalRunway].filter(Boolean).join(' → ') || '—'],
    ['GATE', record?.flight?.gate || '—'],
    ['TOTAL TIME', formatDuration(stats.durationSeconds)],
    ['AIRBORNE', formatDuration(stats.airborneSeconds)],
    ['DISTANCE', formatNauticalMiles(stats.distanceNm)],
    ['MAX ALT', Number.isFinite(Number(stats.maxAltitudeFeet)) ? `${Math.round(stats.maxAltitudeFeet).toLocaleString(localeFor(currentLanguage))} ft` : '—'],
    ['MAX GS', Number.isFinite(Number(stats.maxGroundSpeedKnots)) ? `${Math.round(stats.maxGroundSpeedKnots)} kt` : '—'],
    ['FUEL USED', formatWeight(stats.fuelUsedPounds)],
    ['AUTOMATIONS', String(record?.automations?.length || 0)],
    ['TAKEOFF', formatTime(stats.takeoffAt) || '—'],
    ['LANDING', formatTime(stats.landedAt) || '—'],
  ];
  elements.trackingFlightDate.textContent = formatFlightDate(record?.startedAt, { time: false });
  elements.trackingDetailGrid.innerHTML = values.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  const notes = String(record?.operations?.notes || '').trim();
  const manualChecks = Object.values(record?.operations?.checklist || {}).filter(Boolean).length;
  elements.trackingFlightNotesPanel.hidden = !notes && manualChecks === 0;
  elements.trackingFlightNotesText.textContent = notes || t('noFlightNotes');
  elements.trackingFlightChecklistSummary.textContent = `${manualChecks} ${t('manualChecksSaved')}`;
}

function renderTrackingRecord(record) {
  const flight = record || trackingFallbackRecord(latestState || {});
  trackingViewedFlight = flight;
  const archived = Boolean(trackingSelectedId);
  const recording = !archived && trackingCurrentFlight?.status === 'recording';
  const aircraft = archived ? trackingActualPoints(flight).at(-1) || {} : latestState?.aircraft || trackingActualPoints(flight).at(-1) || {};
  const stats = flight.stats || {};
  const liveDuration = recording && flight.startedAt
    ? Math.max(Number(stats.durationSeconds || 0), Math.round((Date.now() - Date.parse(flight.startedAt)) / 1_000))
    : stats.durationSeconds;
  elements.trackingStatusPill.className = `module-status ${recording ? 'connected' : archived ? 'connected' : 'waiting'}`;
  elements.trackingStatusPill.textContent = recording ? t('recording') : archived ? t('saved') : t('waiting');
  elements.trackingViewState.textContent = archived ? `${t('archive')} · ${formatFlightDate(flight.startedAt)}` : t('liveMap');
  elements.trackingRouteIdent.textContent = [flight.flight?.callsign, [flight.flight?.origin, flight.flight?.destination].filter(Boolean).join(' → ')].filter(Boolean).join(' · ') || '— → —';
  elements.trackingAltitude.textContent = Number.isFinite(Number(aircraft.altitudeFeet)) ? `${Math.round(aircraft.altitudeFeet).toLocaleString(localeFor(currentLanguage))} ft` : '—';
  const gs = aircraft.groundSpeedKnots ?? aircraft.groundSpeed;
  const ias = aircraft.indicatedAirspeedKnots ?? aircraft.indicatedAirspeed;
  elements.trackingSpeed.textContent = Number.isFinite(Number(gs)) ? `${Math.round(gs)} / ${Math.round(Number(ias) || 0)} kt` : '—';
  const heading = aircraft.headingDegrees ?? aircraft.heading;
  elements.trackingHeading.textContent = Number.isFinite(Number(heading)) ? `${String(Math.round(heading) % 360).padStart(3, '0')}°` : '—';
  elements.trackingDistance.textContent = formatNauticalMiles(stats.distanceNm);
  elements.trackingDuration.textContent = formatDuration(liveDuration);
  elements.trackingFuel.textContent = formatWeight(stats.fuelUsedPounds);
  elements.trackingPointCount.textContent = `${stats.pointCount || flight.track?.length || 0} PTS`;
  elements.trackingRecorderTitle.textContent = recording ? t('recordingActive') : archived ? t('savedReplay') : t('automaticRecording');
  elements.trackingRecordMessage.textContent = recording
    ? t('recordingSaving')
    : archived ? `${formatFlightDate(flight.startedAt)} · ${formatNauticalMiles(stats.distanceNm)} · ${formatDuration(stats.durationSeconds)}`
      : t('recordingWait');
  elements.trackingStart.hidden = recording || archived;
  elements.trackingSave.hidden = !recording || archived;
  elements.trackingLive.hidden = !archived;
  elements.trackingArchiveActions.hidden = !archived;
  if (archived && flight.id) {
    elements.trackingExportGpx.href = authenticatedUrl(`/api/flights/${flight.id}/export.gpx`);
    elements.trackingExportJson.href = authenticatedUrl(`/api/flights/${flight.id}/export.json`);
  }
  renderTrackingWaypoints(flight);
  renderTrackingWeather(flight);
  renderTrackingDetails(flight);
  renderTrackingMap(flight);
}

async function refreshTrackingData({ force = false } = {}) {
  if (!token || trackingRequestRunning || (activeModule !== 'tracking' && !force)) return;
  trackingRequestRunning = true;
  try {
    const trackAfter = trackingCurrentFlight?.id && trackingCurrentFlight.status === 'recording'
      ? trackingCurrentFlight.track?.length || 0
      : 0;
    const [archiveResponse, currentResponse] = await Promise.all([
      fetch(authenticatedUrl('/api/flights'), { cache: 'no-store' }),
      fetch(authenticatedUrl(`/api/flights/current${trackAfter ? `?after=${trackAfter}` : ''}`), { cache: 'no-store' }),
    ]);
    const archiveData = await archiveResponse.json();
    const currentData = await currentResponse.json();
    if (!archiveResponse.ok || !currentResponse.ok) throw new Error(archiveData.error || currentData.error || 'Flight archive could not be loaded.');
    trackingArchive = archiveData.flights || [];
    const incoming = currentData.flight || null;
    if (incoming?.id && incoming.id === trackingCurrentFlight?.id && incoming.trackOffset === trackingCurrentFlight.track?.length) {
      trackingCurrentFlight = {
        ...incoming,
        track: [...(trackingCurrentFlight.track || []), ...(incoming.track || [])],
      };
    } else {
      trackingCurrentFlight = incoming;
    }
    renderTrackingArchiveList();
    if (latestState) renderFlightJourney(latestState);
    if (!trackingSelectedId) renderTrackingRecord(trackingCurrentFlight || trackingFallbackRecord(latestState || {}));
  } catch (error) {
    elements.trackingRecordMessage.textContent = error.message;
  } finally {
    trackingRequestRunning = false;
  }
}

async function openTrackedFlight(id) {
  if (!id) return;
  trackingSelectedId = id;
  trackingFollowAircraft = false;
  elements.trackingFollow.classList.remove('active');
  elements.trackingRecordMessage.textContent = t('loadingSavedFlight');
  try {
    const response = await fetch(authenticatedUrl(`/api/flights/${id}`), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Saved flight could not be loaded.');
    trackingViewedFlight = data.flight;
    trackingRenderedKey = '';
    renderTrackingArchiveList();
    renderTrackingRecord(data.flight);
  } catch (error) {
    elements.trackingRecordMessage.textContent = error.message;
  }
}

function showLiveTracking() {
  trackingSelectedId = null;
  trackingFollowAircraft = true;
  trackingRenderedKey = '';
  elements.trackingFollow.classList.add('active');
  renderTrackingArchiveList();
  renderTrackingRecord(trackingCurrentFlight || trackingFallbackRecord(latestState || {}));
  refreshTrackingData({ force: true }).catch(() => {});
}

async function startFlightRecording() {
  elements.trackingStart.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/flights/current/start'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Recording could not be started.');
    trackingSelectedId = null;
    await refreshTrackingData({ force: true });
  } catch (error) {
    elements.trackingRecordMessage.textContent = error.message;
  } finally {
    elements.trackingStart.disabled = false;
  }
}

async function saveCurrentFlight() {
  elements.trackingSave.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/flights/current/save'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Flight could not be saved.');
    await refreshTrackingData({ force: true });
    await openTrackedFlight(data.saved.id);
  } catch (error) {
    elements.trackingRecordMessage.textContent = error.message;
  } finally {
    elements.trackingSave.disabled = false;
  }
}

async function deleteTrackedFlight() {
  if (!trackingSelectedId || !window.confirm(t('deleteFlightConfirm'))) return;
  elements.trackingDelete.disabled = true;
  try {
    const response = await fetch(authenticatedUrl(`/api/flights/${trackingSelectedId}`), { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Flight could not be deleted.');
    trackingSelectedId = null;
    trackingRenderedKey = '';
    await refreshTrackingData({ force: true });
  } catch (error) {
    elements.trackingRecordMessage.textContent = error.message;
  } finally {
    elements.trackingDelete.disabled = false;
  }
}

function renderBriefing(state) {
  const si = state.integrations?.sayIntentions || {};
  const weather = si.weather || {};
  const official = state.integrations?.aviationWeather || {};
  const connected = state.connections?.sayIntentions?.status === 'connected' || official.status === 'ready';
  elements.briefingStatusPill.className = `module-status ${connected ? 'connected' : 'waiting'}`;
  elements.briefingStatusPill.textContent = state.connections?.sayIntentions?.status === 'connected' ? 'SI + WEATHER' : official.status === 'ready' ? 'OFFICIAL WEATHER' : 'WAITING';
  elements.briefingWeatherTime.textContent = formatTime(weather.updatedAt || official.updatedAt) || '—';
  elements.briefingPhase.textContent = `PHASE ${state.flight?.flightPhase ?? '—'}`;

  elements.briefingAirports.replaceChildren();
  const airportWeather = new Map();
  for (const airport of official.airports || []) airportWeather.set(String(airport.airport || '').toUpperCase(), { ...airport, source: official.source });
  for (const airport of weather.airports || []) {
    const key = String(airport.airport || '').toUpperCase();
    airportWeather.set(key, { ...(airportWeather.get(key) || {}), ...airport, source: 'SayIntentions' });
  }
  for (const airport of airportWeather.values()) {
    const card = document.createElement('article');
    card.className = 'weather-airport-card';
    card.innerHTML = `<header><strong>${escapeHtml(airport.airport)}</strong><span>${escapeHtml(airport.activeRunway ? `RWY ${airport.activeRunway}` : airport.flightCategory || airport.source || 'RWY —')}</span></header><p class="metar-line">${escapeHtml(airport.metar || 'No METAR')}</p><details><summary>ATIS / TAF</summary><p>${escapeHtml(airport.atis || 'No ATIS')}</p><p>${escapeHtml(airport.taf || 'No TAF')}</p></details>`;
    elements.briefingAirports.append(card);
  }
  if (!elements.briefingAirports.childElementCount) elements.briefingAirports.innerHTML = '<p class="empty-list">No airport weather received yet.</p>';

  elements.briefingFrequencyList.replaceChildren();
  for (const entry of weather.comms || []) {
    const row = document.createElement('div');
    row.className = 'frequency-row';
    row.innerHTML = `<span><small>${escapeHtml([entry.airport, entry.type].filter(Boolean).join(' · '))}</small><strong>${escapeHtml(entry.frequency)}</strong><b>${escapeHtml(entry.callsign || '')}</b></span><button type="button">COM1 STBY</button>`;
    row.querySelector('button').addEventListener('click', () => tuneSiFrequency(entry.frequency, row.querySelector('button')));
    elements.briefingFrequencyList.append(row);
  }
  if (!elements.briefingFrequencyList.childElementCount) elements.briefingFrequencyList.innerHTML = '<p class="empty-list">No SI frequencies available.</p>';

  elements.briefingCommsList.replaceChildren();
  for (const entry of [...(si.comms || [])].reverse().slice(0, 20)) {
    const row = document.createElement('article');
    row.className = 'comms-entry';
    row.innerHTML = `<header><strong>${escapeHtml(entry.station || entry.ident || 'ATC')}</strong><span>${escapeHtml(entry.frequency || '')} · ${escapeHtml(formatTime(entry.time))}</span></header>${entry.pilot ? `<p><b>PILOT</b>${escapeHtml(entry.pilot)}</p>` : ''}${entry.atc ? `<p><b>ATC</b>${escapeHtml(entry.atc)}</p>` : ''}`;
    elements.briefingCommsList.append(row);
  }
  if (!elements.briefingCommsList.childElementCount) elements.briefingCommsList.innerHTML = '<p class="empty-list">No communication received.</p>';
}

function renderAtcMessages(state) {
  if (!elements.atcSiMessageList) return;
  for (const button of elements.aircraftViewButtons || []) {
  button.addEventListener('click', () => setAircraftView(button.dataset.aircraftViewButton));
}
setAircraftView('fenix');
for (const button of elements.siMessageViewButtons) {
    const active = button.dataset.siMessageView === siMessageView;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
  const comms = [...(state.integrations?.sayIntentions?.comms || [])].reverse();
  const visible = siMessageView === 'all' ? comms : comms.slice(0, 10);
  elements.atcSiMessageList.replaceChildren();
  for (const entry of visible) {
    const row = document.createElement('article');
    row.className = 'atc-message-entry';
    const flags = [entry.acars ? 'ACARS' : null, entry.copilot ? 'COPILOT' : null, entry.language || null].filter(Boolean);
    row.innerHTML = `<header><span><strong>${escapeHtml(entry.station || entry.ident || 'ATC')}</strong><small>${escapeHtml(entry.frequency || entry.channel || '')}</small></span><span>${flags.map((flag) => `<b>${escapeHtml(String(flag).toUpperCase())}</b>`).join('')}<time>${escapeHtml(formatTime(entry.time) || '—')}</time></span></header>${entry.pilot ? `<p class="pilot-message"><b>PILOT</b><span>${escapeHtml(entry.pilot)}</span></p>` : ''}${entry.atc ? `<p class="atc-message"><b>ATC</b><span>${escapeHtml(entry.atc)}</span></p>` : ''}`;
    elements.atcSiMessageList.append(row);
  }
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = t('noSiMessages');
    elements.atcSiMessageList.append(empty);
  }
}

function radioValue(com, key, fallback = null) {
  const value = com?.[key];
  return value === null || value === undefined || value === '' ? fallback : value;
}

function formatRadioFrequency(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3) : '—';
}

function nextComSuggestion(entries, state) {
  const phase = resolveFlightPhase(state);
  const preference = {
    preflight: ['atis', 'delivery', 'clearance', 'ground'],
    'taxi-out': ['ground', 'tower'],
    takeoff: ['tower', 'departure'],
    climb: ['departure', 'center'],
    cruise: ['center'],
    descent: ['atis', 'center', 'approach'],
    approach: ['approach', 'tower'],
    landing: ['tower', 'ground'],
    'taxi-in': ['ground'],
    postflight: ['ground'],
  }[phase] || ['atis', 'ground', 'tower', 'departure', 'center', 'approach'];
  const active = new Set([
    Number(state?.integrations?.com?.com1Active ?? state?.aircraft?.com1Active),
    Number(state?.integrations?.com?.com2Active ?? state?.aircraft?.com2Active),
  ].filter(Number.isFinite).map((value) => value.toFixed(3)));
  const destination = String(state?.flight?.destination || state?.integrations?.simbrief?.flight?.destination || '').toUpperCase();
  const origin = String(state?.flight?.origin || state?.integrations?.simbrief?.flight?.origin || '').toUpperCase();
  return entries.map((entry) => {
    const text = `${entry.label || ''} ${entry.callsign || ''} ${entry.type || ''}`.toLowerCase();
    let score = 0;
    const roleIndex = preference.findIndex((role) => text.includes(role));
    if (roleIndex >= 0) score += 100 - roleIndex * 14;
    if (destination && text.toUpperCase().includes(destination) && ['descent', 'approach', 'landing', 'taxi-in'].includes(phase)) score += 35;
    if (origin && text.toUpperCase().includes(origin) && ['preflight', 'taxi-out', 'takeoff', 'climb'].includes(phase)) score += 35;
    if (active.has(Number(entry.frequency).toFixed(3))) score -= 80;
    return { ...entry, score, phase };
  }).sort((a, b) => b.score - a.score)[0] || null;
}

function renderCom(state) {
  const integration = state.integrations?.com || {};
  const aircraft = state.aircraft || {};
  const com = { ...aircraft, ...integration };
  const simulatorOnline = ['connected', 'demo'].includes(state.connections?.simConnect?.status);
  elements.comStatusPill.className = `module-status ${simulatorOnline ? 'connected' : 'waiting'}`;
  elements.comStatusPill.textContent = simulatorOnline ? 'SIM ONLINE' : 'SIM OFFLINE';

  for (const index of [1, 2]) {
    const prefix = `com${index}`;
    const active = radioValue(com, `${prefix}Active`);
    const standby = radioValue(com, `${prefix}Standby`);
    elements[`${prefix}Active`].textContent = formatRadioFrequency(active);
    elements[`${prefix}Standby`].textContent = formatRadioFrequency(standby);
    elements[`${prefix}ActiveIdent`].textContent = [radioValue(com, `${prefix}ActiveIdent`, ''), radioValue(com, `${prefix}ActiveType`, '')].filter(Boolean).join(' · ') || '—';
    elements[`${prefix}StandbyIdent`].textContent = [radioValue(com, `${prefix}StandbyIdent`, ''), radioValue(com, `${prefix}StandbyType`, '')].filter(Boolean).join(' · ') || '—';
    const receiving = Boolean(radioValue(com, `${prefix}Receive`, false));
    const transmitting = Boolean(radioValue(com, `${prefix}Transmit`, false));
    elements[`${prefix}Receive`].textContent = receiving ? 'RX ON' : 'RX OFF';
    elements[`${prefix}Receive`].classList.toggle('active', receiving);
    elements[`${prefix}Transmit`].textContent = transmitting ? 'TX SELECTED' : 'TX OFF';
    elements[`${prefix}Transmit`].classList.toggle('active', transmitting);
  }
  for (const button of elements.comActionButtons) button.disabled = !simulatorOnline;

  const presets = [];
  for (const entry of state.integrations?.sayIntentions?.weather?.comms || []) {
    presets.push({
      frequency: entry.frequency,
      label: [entry.airport, entry.type].filter(Boolean).join(' · '),
      callsign: entry.callsign || '',
      source: 'SayIntentions',
      type: entry.type || entry.stationType || '',
    });
  }
  const online = state.integrations?.onlineNetworks || {};
  for (const entry of [...(online.controllers || []), ...(online.atis || [])]) {
    presets.push({
      frequency: entry.frequency,
      label: entry.callsign || entry.name || online.selected?.toUpperCase(),
      callsign: entry.name || '',
      source: String(online.selected || '').toUpperCase(),
      type: entry.type || entry.callsign || '',
    });
  }
  const unique = [...new Map(presets
    .filter((entry) => Number.isFinite(Number(entry.frequency)))
    .map((entry) => [`${Number(entry.frequency).toFixed(3)}|${entry.label}`, entry])).values()]
    .slice(0, 24);
  const nextStation = nextComSuggestion(unique, state);
  if (elements.comNextStation) {
    elements.comNextStation.textContent = nextStation?.label || 'Keine passende Station verfügbar';
    elements.comNextFrequency.textContent = nextStation ? formatRadioFrequency(nextStation.frequency) : '—';
    elements.comNextReason.textContent = nextStation
      ? `Empfehlung für ${String(nextStation.phase || 'aktuelle Flugphase').toUpperCase()} · ${nextStation.source || 'ATC'} · expliziter Klick erforderlich`
      : 'Sobald ATC- oder Netzwerkfrequenzen verfügbar sind, erscheint hier die nächste sinnvolle Station.';
    elements.comNextTune.disabled = !simulatorOnline || !nextStation;
    elements.comNextTune.onclick = nextStation ? () => setComFromPreset(nextStation.frequency, 1, elements.comNextTune) : null;
  }
  elements.comFrequencyPresets.replaceChildren();
  for (const entry of unique) {
    const row = document.createElement('div');
    row.className = 'frequency-row com-preset-row';
    const copy = document.createElement('span');
    copy.innerHTML = `<small>${escapeHtml([entry.label, entry.source].filter(Boolean).join(' · '))}</small><strong>${escapeHtml(formatRadioFrequency(entry.frequency))}</strong><b>${escapeHtml(entry.callsign)}</b>`;
    const actions = document.createElement('div');
    for (const index of [1, 2]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = !simulatorOnline;
      button.textContent = `COM${index} STBY`;
      button.addEventListener('click', () => setComFromPreset(entry.frequency, index, button));
      actions.append(button);
    }
    row.append(copy, actions);
    elements.comFrequencyPresets.append(row);
  }
  if (!unique.length) elements.comFrequencyPresets.innerHTML = '<p class="empty-list">No frequencies available from ATC or online networks.</p>';
}

function normalizeFlightboardCallsign(value = '') {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function enrichTrafficFromKnownFlightPlans(entries, state) {
  const onlinePilots = Array.isArray(state?.integrations?.onlineNetworks?.pilots) ? state.integrations.onlineNetworks.pilots : [];
  const onlineByCallsign = new Map(onlinePilots.map((pilot) => [normalizeFlightboardCallsign(pilot.callsign), pilot]));
  return entries.map((entry) => {
    const pilot = onlineByCallsign.get(normalizeFlightboardCallsign(entry.callsign || entry.atcId));
    if (!pilot) return entry;
    return {
      ...entry,
      origin: entry.origin || pilot.departure || '',
      destination: entry.destination || pilot.arrival || '',
      airline: entry.airline || pilot.name || '',
      route: entry.route || pilot.route || '',
    };
  });
}

function currentFlightboardAirport(state) {
  const flight = state.flight || {};
  const phase = resolveFlightPhase(state);
  const arrivalPhase = ['descent', 'approach', 'landing', 'taxi-in', 'postflight'].includes(phase);
  return String(
    flight.currentAirport
    || state.planning?.selectedAirport?.icao
    || (arrivalPhase ? flight.destination : flight.origin)
    || flight.destination
    || flight.origin
    || '',
  ).trim().toUpperCase();
}

function normalizedTrafficState(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function trafficStateInfo(value) {
  const state = normalizedTrafficState(value);
  const rules = [
    [/shutdown|sleep|parked/, 'trafficParked', 'parked'],
    [/startup|preflight|clearance/, 'trafficPreparing', 'preparing'],
    [/push/, 'trafficPushback', 'ground'],
    [/taxi out/, 'trafficTaxiOut', 'ground'],
    [/takeoff|depart/, 'trafficDeparting', 'airborne'],
    [/simple\s*flight|flt plan|waypoint|enroute|cruise|climb|pattern/, 'trafficEnroute', 'airborne'],
    [/landing|approach/, 'trafficLanding', 'airborne'],
    [/rollout/, 'trafficRollout', 'ground'],
    [/taxi in/, 'trafficTaxiIn', 'ground'],
    [/taxi/, 'trafficTaxi', 'ground'],
  ];
  const match = rules.find(([pattern]) => pattern.test(state));
  return match ? { label: t(match[1]), className: match[2] } : { label: state ? state.toUpperCase() : t('trafficUnknown'), className: 'unknown' };
}

function trafficScheduleTime(seconds, state = latestState) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value === 0) return '—';
  const simulatorLocalTime = Number(state?.aircraft?.localTimeSeconds);
  const now = new Date();
  const localSecondOfDay = Number.isFinite(simulatorLocalTime)
    ? simulatorLocalTime
    : now.getHours() * 3_600 + now.getMinutes() * 60 + now.getSeconds();
  const secondOfDay = ((Math.round(localSecondOfDay + value) % 86_400) + 86_400) % 86_400;
  const hours = Math.floor(secondOfDay / 3_600);
  const minutes = Math.floor(secondOfDay / 60) % 60;
  if (preferences.clockFormat === '12') {
    const marker = hours >= 12 ? 'PM' : 'AM';
    return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${marker}`;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function trafficMatchesAirport(entry, airport) {
  if (!airport) return true;
  return [entry.currentAirport, entry.origin, entry.destination].some((value) => String(value || '').toUpperCase() === airport);
}

function trafficMatchesView(entry, airport) {
  if (trafficBoardView === 'all') return true;
  const state = normalizedTrafficState(entry.state);
  if (trafficBoardView === 'departures') {
    return String(entry.origin || '').toUpperCase() === airport
      || (entry.onGround && !/landing|rollout|taxi in/.test(state))
      || /startup|preflight|clearance|push|taxi out|takeoff|depart/.test(state);
  }
  return String(entry.destination || '').toUpperCase() === airport
    || (!entry.onGround && /landing|approach/.test(state))
    || /landing|approach|rollout|taxi in/.test(state);
}

const AIRLINE_META_BY_ICAO = {
  BTI: ['BT', 'airBaltic', 'airbaltic.com'], DLH: ['LH', 'Lufthansa', 'lufthansa.com'], BAW: ['BA', 'British Airways', 'britishairways.com'],
  RYR: ['FR', 'Ryanair', 'ryanair.com'], EZY: ['U2', 'easyJet', 'easyjet.com'], KLM: ['KL', 'KLM', 'klm.com'], AFR: ['AF', 'Air France', 'airfrance.com'],
  TAP: ['TP', 'TAP Air Portugal', 'flytap.com'], IBE: ['IB', 'Iberia', 'iberia.com'], UAE: ['EK', 'Emirates', 'emirates.com'], QTR: ['QR', 'Qatar Airways', 'qatarairways.com'],
  THY: ['TK', 'Turkish Airlines', 'turkishairlines.com'], SWR: ['LX', 'SWISS', 'swiss.com'], AUA: ['OS', 'Austrian', 'austrian.com'], BEL: ['SN', 'Brussels Airlines', 'brusselsairlines.com'],
  SAS: ['SK', 'SAS', 'flysas.com'], FIN: ['AY', 'Finnair', 'finnair.com'], EIN: ['EI', 'Aer Lingus', 'aerlingus.com'], WZZ: ['W6', 'Wizz Air', 'wizzair.com'],
  VLG: ['VY', 'Vueling', 'vueling.com'], CFG: ['DE', 'Condor', 'condor.com'], EWG: ['EW', 'Eurowings', 'eurowings.com'], TUI: ['X3', 'TUI fly', 'tuifly.com'],
  AEE: ['A3', 'Aegean', 'aegeanair.com'], LOT: ['LO', 'LOT', 'lot.com'], DAL: ['DL', 'Delta', 'delta.com'], UAL: ['UA', 'United', 'united.com'],
  AAL: ['AA', 'American', 'aa.com'], ACA: ['AC', 'Air Canada', 'aircanada.com'], JBU: ['B6', 'JetBlue', 'jetblue.com'], VIR: ['VS', 'Virgin Atlantic', 'virginatlantic.com'],
  SIA: ['SQ', 'Singapore Airlines', 'singaporeair.com'], CPA: ['CX', 'Cathay Pacific', 'cathaypacific.com'], ANA: ['NH', 'ANA', 'ana.co.jp'], JAL: ['JL', 'Japan Airlines', 'jal.com'],
  KAL: ['KE', 'Korean Air', 'koreanair.com'], ETD: ['EY', 'Etihad', 'etihad.com'], QFA: ['QF', 'Qantas', 'qantas.com'], ANZ: ['NZ', 'Air New Zealand', 'airnewzealand.com'], ICE: ['FI', 'Icelandair', 'icelandair.com'], NSZ: ['D8', 'Norwegian', 'norwegian.com'],
};
const AIRLINE_META_BY_NAME = [
  [/air\s*baltic/i, ['BT', 'airBaltic', 'airbaltic.com']], [/lufthansa/i, ['LH', 'Lufthansa', 'lufthansa.com']], [/speedbird|british airways/i, ['BA', 'British Airways', 'britishairways.com']],
  [/ryanair/i, ['FR', 'Ryanair', 'ryanair.com']], [/easyjet/i, ['U2', 'easyJet', 'easyjet.com']], [/klm/i, ['KL', 'KLM', 'klm.com']], [/air france/i, ['AF', 'Air France', 'airfrance.com']],
  [/condor/i, ['DE', 'Condor', 'condor.com']], [/eurowings/i, ['EW', 'Eurowings', 'eurowings.com']], [/wizz/i, ['W6', 'Wizz Air', 'wizzair.com']],
];

function trafficAirlineMeta(entry = {}) {
  const callsign = String(entry.callsign || entry.atcId || '').trim().toUpperCase();
  const icao = callsign.match(/^([A-Z]{3})/)?.[1];
  if (icao && AIRLINE_META_BY_ICAO[icao]) return AIRLINE_META_BY_ICAO[icao];
  const text = [entry.airline, entry.title, entry.callsign].filter(Boolean).join(' ');
  return AIRLINE_META_BY_NAME.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function trafficAirlineLogo(entry = {}) {
  const meta = trafficAirlineMeta(entry);
  const fallback = meta?.[0] || String(entry.airline || entry.callsign || 'AI').replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'AI';
  const name = meta?.[1] || entry.airline || 'Airline';
  const domain = meta?.[2];
  const image = domain ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64" alt="${escapeHtml(name)}" loading="lazy" referrerpolicy="no-referrer">` : '';
  return `<span class="traffic-airline-logo" title="${escapeHtml(name)}">${image}<b>${escapeHtml(fallback)}</b></span>`;
}

function trafficRouteFields(entry = {}, boardAirport = '') {
  const state = normalizedTrafficState(entry.state);
  const airport = String(boardAirport || '').toUpperCase();
  const current = String(entry.currentAirport || '').toUpperCase();
  let origin = String(entry.origin || '').toUpperCase();
  let destination = String(entry.destination || '').toUpperCase();
  const knownAirport = current || airport;
  const arrivalState = /landing|approach|rollout|taxi in/.test(state);
  if (!origin && knownAirport && !arrivalState && (entry.onGround || /startup|preflight|clearance|push|taxi out|takeoff|depart|taxi/.test(state))) origin = knownAirport;
  if (!destination && knownAirport && arrivalState) destination = knownAirport;
  return { origin: origin || '—', destination: destination || '—' };
}

function renderFlightboard(state) {
  const integration = state.integrations?.simTraffic || {};
  const simulatorOnline = ['connected', 'demo'].includes(state.connections?.simConnect?.status);
  const airport = currentFlightboardAirport(state);
  const all = enrichTrafficFromKnownFlightPlans(Array.isArray(integration.aircraft) ? integration.aircraft : [], state);
  const airportTraffic = airport ? all.filter((entry) => trafficMatchesAirport(entry, airport)) : all;
  const candidates = trafficBoardView === 'all' ? all : (airportTraffic.length ? [...new Map([...airportTraffic, ...all].map((entry) => [entry.objectId ?? entry.callsign, entry])).values()] : all);
  const visible = candidates.filter((entry) => trafficMatchesView(entry, airport));

  elements.flightboardStatusPill.className = `module-status ${simulatorOnline ? 'connected' : 'waiting'}`;
  elements.flightboardStatusPill.textContent = simulatorOnline ? `${all.length} LIVE` : 'SIM OFFLINE';
  elements.flightboardAirport.textContent = trafficBoardView === 'all' ? `ALL NEARBY · ${all.length}` : (airport || 'ALL NEARBY');
  elements.flightboardUpdated.textContent = integration.updatedAt ? `${t('updated')} ${formatTime(integration.updatedAt)}` : '—';
  elements.flightboardRefresh.disabled = !simulatorOnline;
  for (const button of elements.flightboardTabs) button.classList.toggle('active', button.dataset.trafficView === trafficBoardView);

  const sorted = [...visible].sort((left, right) => {
    const leftTime = Number(trafficBoardView === 'arrivals' ? left.etaSeconds : left.etdSeconds) || Number.MAX_SAFE_INTEGER;
    const rightTime = Number(trafficBoardView === 'arrivals' ? right.etaSeconds : right.etdSeconds) || Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime || String(left.callsign).localeCompare(String(right.callsign), 'en', { numeric: true });
  });
  elements.flightboardList.replaceChildren();
  for (const entry of sorted) {
    const status = trafficStateInfo(entry.state);
    const route = trafficRouteFields(entry, airport);
    const row = document.createElement('div');
    row.className = 'flightboard-row';
    row.setAttribute('role', 'row');
    const schedule = trafficBoardView === 'arrivals' ? entry.etaSeconds
      : trafficBoardView === 'departures' ? entry.etdSeconds
        : /landing|approach|rollout|taxi in/.test(normalizedTrafficState(entry.state)) ? entry.etaSeconds : entry.etdSeconds;
    row.innerHTML = `<time>${escapeHtml(trafficScheduleTime(schedule))}</time><span class="flightboard-flight">${trafficAirlineLogo(entry)}<span><strong>${escapeHtml(entry.callsign || `AI-${entry.objectId}`)}</strong><small>${escapeHtml(entry.airline || entry.title || 'MSFS TRAFFIC')}</small></span></span><b>${escapeHtml(route.origin)}</b><b>${escapeHtml(route.destination)}</b><span><strong>${escapeHtml(entry.runway || '—')}</strong><small>${escapeHtml(entry.parking || (entry.onGround ? `${Math.round(Number(entry.groundSpeed) || 0)} kt` : `${Math.round(Number(entry.altitudeFeet) || 0)} ft`))}</small></span><em class="traffic-status ${escapeHtml(status.className)}">${escapeHtml(status.label)}</em>`;
    row.querySelector('.traffic-airline-logo img')?.addEventListener('error', (event) => event.currentTarget.remove(), { once: true });
    elements.flightboardList.append(row);
  }
  if (!sorted.length) {
    const message = simulatorOnline ? t('noSimulatorTraffic') : t('startMsfsForTraffic');
    elements.flightboardList.innerHTML = `<p class="empty-list">${escapeHtml(message)}</p>`;
  }
}

function renderHomeNextStep(state) {
  const onboardingComplete = localStorage.getItem('flight-deck-onboarding-v2') === 'complete';
  const simbriefReady = Boolean(state.integrations?.simbrief?.imported && state.integrations?.simbrief?.flight);
  const simulatorOnline = ['connected', 'demo'].includes(state.connections?.simConnect?.status);
  let next = null;
  if (!onboardingComplete) next = { title: t('nextSetupTitle'), detail: t('nextSetupDetail'), action: 'setup', label: t('continue') };
  else if (!simulatorOnline) next = { title: t('nextSimulatorTitle'), detail: t('nextSimulatorDetail'), action: 'diagnostics', label: t('runChecks') };
  else if (!state.flight?.origin && !state.flight?.destination && !simbriefReady) next = { title: 'Flug wird automatisch erkannt', detail: 'Lade einen Flug in MSFS oder starte deine SayIntentions-Flugsitzung.', action: 'diagnostics', label: t('runChecks') };
  elements.homeNextStep.hidden = !next;
  if (!next) return;
  elements.homeNextStepTitle.textContent = next.title;
  elements.homeNextStepDetail.textContent = next.detail;
  elements.homeNextStepAction.textContent = next.label;
  elements.homeNextStepAction.dataset.nextAction = next.action;
}

function renderOnlineNetworks(state) {
  const online = state.integrations?.onlineNetworks || {};
  const selected = online.selected || 'off';
  for (const button of elements.networkButtons) button.classList.toggle('active', button.dataset.network === selected);
  elements.onlineStatusPill.className = `module-status ${online.status === 'ready' ? 'connected' : online.status === 'error' ? 'attention' : 'waiting'}`;
  elements.onlineStatusPill.textContent = selected === 'off' ? 'OFF' : `${selected.toUpperCase()} ${online.status === 'ready' ? 'LIVE' : online.status?.toUpperCase() || ''}`;
  elements.onlineDetail.textContent = online.detail || 'Choose VATSIM or IVAO.';
  elements.onlineUpdated.textContent = formatTime(online.updatedAt) || '—';
  elements.onlineAirports.textContent = (online.airports || []).join(' · ') || '—';
  elements.onlineControllerList.replaceChildren();
  for (const controller of online.controllers || []) {
    const row = document.createElement('article');
    row.innerHTML = `<span><strong>${escapeHtml(controller.callsign)}</strong><small>${escapeHtml(controller.name || '')}</small></span><b>${escapeHtml(controller.frequency || '—')}</b>`;
    elements.onlineControllerList.append(row);
  }
  if (!elements.onlineControllerList.childElementCount) elements.onlineControllerList.innerHTML = '<p class="empty-list">No relevant controllers online.</p>';
  elements.onlineAtisList.replaceChildren();
  for (const atis of online.atis || []) {
    const details = document.createElement('details');
    details.innerHTML = `<summary><span><strong>${escapeHtml(atis.callsign)}</strong><small>${escapeHtml(atis.code ? `Information ${atis.code}` : '')}</small></span><b>${escapeHtml(atis.frequency || '—')}</b></summary><p>${escapeHtml((atis.text || []).join(' '))}</p>`;
    elements.onlineAtisList.append(details);
  }
  if (!elements.onlineAtisList.childElementCount) elements.onlineAtisList.innerHTML = '<p class="empty-list">No relevant ATIS online.</p>';
}

function renderGsxSetup(gsx) {
  elements.gsxSetupSteps.replaceChildren();
  for (const step of gsx.setupSteps || []) {
    const row = document.createElement('div');
    row.className = step.complete ? 'complete' : '';
    row.innerHTML = `<i>${step.complete ? '✓' : '•'}</i><span>${escapeHtml(step.label)}</span>`;
    elements.gsxSetupSteps.append(row);
  }
}

function renderNavigraph(navigraph) {
  elements.navigraphLogin.hidden = Boolean(navigraph.authenticated);
  elements.navigraphLogout.hidden = !navigraph.authenticated;
  const login = navigraph.login;
  elements.navigraphLoginCode.hidden = !login;
  if (login) {
    elements.navigraphUserCode.textContent = login.userCode || '—';
    elements.navigraphVerificationLink.href = login.verificationUriComplete || login.verificationUri || 'https://navigraph.com/code';
  }
}

function renderFenix(state) {
  const fenix = state.integrations?.fenix || {};
  const adapter = state.integrations?.aircraftAdapter || {};
  const pmdg = adapter.pmdg || {};
  const active = adapter.active || 'generic';
  elements.fenixStatusPill.className = `module-status ${fenix.reachable ? 'connected' : fenix.status === 'disconnected' ? 'attention' : 'waiting'}`;
  elements.fenixStatusPill.textContent = fenix.reachable ? 'CONNECTED' : (fenix.status || 'NOT CHECKED').toUpperCase();
  elements.fenixDetail.textContent = fenix.detail || 'Fenix Remote EFB has not been checked.';
  elements.fenixEmbed.disabled = !fenix.reachable;
  elements.aircraftAdapterStatus.className = `module-status ${adapter.status === 'ready' ? 'connected' : adapter.status === 'attention' ? 'attention' : 'waiting'}`;
  elements.aircraftAdapterStatus.textContent = active === 'generic' ? 'GENERIC' : active.toUpperCase();
  elements.aircraftAdapterModel.textContent = adapter.title || (active.startsWith('pmdg') ? pmdg.activeFamily || 'PMDG' : active === 'fenix' ? 'Fenix A32X' : 'Generic SimConnect');
  elements.aircraftAdapterSource.textContent = active === 'fenix' ? 'MSFS INPUT EVENTS + EFB' : active.startsWith('pmdg') ? 'LOCAL PMDG SDK' : 'SIMCONNECT';
  elements.aircraftAdapterDetail.textContent = adapter.detail || 'Warte auf geladenes Flugzeug.';
  elements.aircraftAdapterControls.textContent = String(adapter.controlCount || 0);
  const packageInfo = (pmdg.packages || []).find((entry) => !pmdg.activeFamily || entry.family === pmdg.activeFamily) || (pmdg.packages || [])[0];
  elements.pmdgStatusPill.className = `module-status ${pmdg.detected ? 'connected' : 'waiting'}`;
  elements.pmdgStatusPill.textContent = pmdg.detected ? 'SDK DETECTED' : 'NOT DETECTED';
  elements.pmdgFamily.textContent = pmdg.activeFamily || packageInfo?.family || '—';
  elements.pmdgSdk.textContent = packageInfo?.sdkHeader || '—';
  elements.pmdgBroadcast.textContent = pmdg.broadcastEnabled === true ? 'ON' : pmdg.broadcastEnabled === false ? 'OFF' : '—';
  elements.pmdgControls.textContent = String(pmdg.controlCount || 0);
  elements.homeFenixSummary.textContent = adapter.detail || 'Fenix / PMDG adapter detection';
}

function renderGroundSafety(state) {
  const safety = state.integrations?.groundSafety || {};
  const severity = safety.highestSeverity || 'clear';
  elements.groundSafetyStatus.className = `module-status ${severity === 'clear' ? 'connected' : severity === 'caution' ? 'waiting' : 'attention'}`;
  elements.groundSafetyStatus.textContent = severity.toUpperCase();
  elements.groundSafetyDetail.textContent = safety.detail || 'Keine aktiven Ground-Safety-Warnungen';
  elements.groundSafetyList.replaceChildren();
  for (const item of safety.alerts || []) {
    const row = document.createElement('article');
    row.className = `ground-safety-alert ${item.severity || 'caution'}`;
    row.innerHTML = `<i></i><span><strong>${escapeHtml(item.title || 'GROUND ALERT')}</strong><small>${escapeHtml(item.detail || '')}</small></span><b>${escapeHtml(String(item.severity || '').toUpperCase())}</b>`;
    elements.groundSafetyList.append(row);
  }
  if (!elements.groundSafetyList.childElementCount) elements.groundSafetyList.innerHTML = '<p class="empty-list">No active alerts.</p>';
}

function automationState(state = latestState) {
  const integration = state?.integrations?.automations || {};
  return {
    mode: integration.mode || 'test',
    detail: integration.detail || t('automationTestHelp'),
    variables: integration.variableDefinitions || [],
    values: integration.values || {},
    rules: integration.rules || [],
    log: integration.log || [],
    inputEventCount: Number(integration.inputEventCount || 0),
  };
}

function populateAutomationTriggerOptions() {
  const type = elements.automationTriggerType.value;
  const current = elements.automationTriggerValue.value;
  const options = [];
  if (type === 'phase-enter') {
    options.push(...FLIGHT_PHASES.map((phase) => ({ value: phase.id, label: t(phase.labelKey) })));
  } else if (type === 'app-open') {
    options.push(...DEFAULT_APP_ORDER.filter((id) => !['planner', 'charts'].includes(id)).map((id) => ({ value: id, label: appLabel(id) })));
  } else if (type === 'atc-station') {
    options.push(
      { value: 'clearance', label: 'Clearance Delivery' },
      { value: 'ground', label: 'Ground' },
      { value: 'tower', label: 'Tower' },
      { value: 'departure', label: 'Departure' },
      { value: 'center', label: 'Center' },
      { value: 'approach', label: 'Approach' },
      { value: 'ctaf', label: 'CTAF / UNICOM' },
    );
  } else {
    options.push(...automationState().variables.map((entry) => ({ value: entry.name, label: `${entry.label} · ${entry.name}` })));
  }
  elements.automationTriggerValue.replaceChildren();
  for (const option of options) {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    elements.automationTriggerValue.append(node);
  }
  if (options.some((entry) => entry.value === current)) elements.automationTriggerValue.value = current;
  elements.automationConditionField.hidden = type !== 'variable-condition';
}

async function populateAutomationTargets() {
  elements.automationTargetOptions.replaceChildren();
  if (elements.automationActionType.value === 'sim-event') {
    elements.automationActionTarget.placeholder = 'LANDING_LIGHTS_SET';
    return;
  }
  if (elements.automationActionType.value === 'input-event') {
    elements.automationActionTarget.placeholder = 'MSFS 2024 Input Event';
    try {
      const response = await fetch(authenticatedUrl('/api/simconnect/input-events?limit=300'), { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) return;
      for (const event of data.events || []) {
        const option = document.createElement('option');
        option.value = event.name;
        elements.automationTargetOptions.append(option);
      }
    } catch {
      // A typed event name can still be saved and will be validated when MSFS is connected.
    }
    return;
  }
  elements.automationActionTarget.placeholder = 'L:VARIABLE_NAME';
  for (const variable of automationState().variables) {
    const option = document.createElement('option');
    option.value = variable.name;
    option.label = variable.label;
    elements.automationTargetOptions.append(option);
  }
}

async function saveAutomationConfiguration(patch) {
  const response = await fetch(authenticatedUrl('/api/automations'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t('saveFailed'));
  latestState = data.state;
  renderAutomation(data.state);
  return data.configuration;
}

async function refreshAutomationConfiguration() {
  if (!token) return;
  const response = await fetch(authenticatedUrl('/api/automations'), { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || t('saveFailed'));
  latestState = data.state;
  renderAutomation(data.state);
}

function automationRuleTrigger(rule) {
  if (rule.triggerType === 'phase-enter') {
    const phase = FLIGHT_PHASES.find((entry) => entry.id === rule.triggerValue);
    return `${t('triggerPhase')}: ${phase ? t(phase.labelKey) : rule.triggerValue}`;
  }
  if (rule.triggerType === 'app-open') return `${t('triggerApp')}: ${appLabel(rule.triggerValue)}`;
  if (rule.triggerType === 'atc-station') return `ATC: ${rule.triggerValue.toUpperCase()}`;
  return `${rule.triggerValue} ${rule.operator} ${rule.comparisonValue}`;
}

function renderAutomation(state) {
  if (!elements.automationMode) return;
  const automation = automationState(state);
  elements.automationMode.value = automation.mode;
  elements.automationStatusPill.className = `module-status ${automation.mode === 'armed' ? 'attention' : automation.mode === 'test' ? 'waiting' : 'off'}`;
  elements.automationStatusPill.textContent = automation.mode.toUpperCase();
  elements.automationDetail.textContent = automation.detail;
  elements.automationVariableCount.textContent = String(automation.variables.length);
  elements.automationRuleCount.textContent = String(automation.rules.length);
  elements.automationLogStatus.textContent = automation.log[0]?.status?.toUpperCase() || '—';

  elements.automationVariableList.replaceChildren();
  for (const variable of automation.variables) {
    const row = document.createElement('div');
    row.className = 'automation-list-row';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = variable.label;
    const detail = document.createElement('small');
    detail.textContent = `${variable.name} · ${variable.unit}`;
    copy.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'automation-row-actions';
    const value = document.createElement('strong');
    value.className = 'automation-value';
    value.textContent = Number.isFinite(Number(automation.values[variable.name]))
      ? Number(automation.values[variable.name]).toLocaleString(localeFor(currentLanguage), { maximumFractionDigits: 3 }) : '—';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = t('remove');
    remove.addEventListener('click', async () => {
      const variables = automation.variables.filter((entry) => entry.id !== variable.id);
      const rules = automation.rules.filter((entry) => entry.triggerValue !== variable.name && entry.actionTarget !== variable.name);
      await saveAutomationConfiguration({ variables, rules }).catch((error) => { elements.automationFormMessage.textContent = error.message; });
    });
    actions.append(value, remove);
    row.append(copy, actions);
    elements.automationVariableList.append(row);
  }
  if (!automation.variables.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = t('noVariables');
    elements.automationVariableList.append(empty);
  }

  elements.automationRuleList.replaceChildren();
  for (const rule of automation.rules) {
    const row = document.createElement('div');
    row.className = 'automation-list-row';
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = rule.name;
    const detail = document.createElement('small');
    const guards = [
      rule.requireOnGround === 'yes' ? 'GROUND' : rule.requireOnGround === 'no' ? 'AIRBORNE' : null,
      Number.isFinite(rule.maxGroundSpeed) ? `≤ ${rule.maxGroundSpeed} kt` : null,
      rule.aircraftMatch ? `ACFT: ${rule.aircraftMatch}` : null,
    ].filter(Boolean).join(' · ');
    detail.textContent = `${automationRuleTrigger(rule)} → ${rule.actionTarget} = ${rule.actionValue}${guards ? ` · ${guards}` : ''}`;
    copy.append(title, detail);
    const actions = document.createElement('div');
    actions.className = 'automation-row-actions';
    const enabled = document.createElement('input');
    enabled.type = 'checkbox';
    enabled.checked = rule.enabled;
    enabled.title = t('enabled');
    enabled.addEventListener('change', () => saveAutomationConfiguration({
      rules: automation.rules.map((entry) => entry.id === rule.id ? { ...entry, enabled: enabled.checked } : entry),
    }).catch((error) => { elements.automationFormMessage.textContent = error.message; }));
    const run = document.createElement('button');
    run.type = 'button';
    run.textContent = '▶';
    run.title = t('runNow');
    run.addEventListener('click', async () => {
      run.disabled = true;
      try {
        const response = await fetch(authenticatedUrl(`/api/automations/rules/${rule.id}/run`), { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t('saveFailed'));
        latestState = data.state;
        renderAutomation(data.state);
      } catch (error) {
        elements.automationFormMessage.textContent = error.message;
      } finally {
        run.disabled = false;
      }
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.title = t('remove');
    remove.addEventListener('click', () => saveAutomationConfiguration({
      rules: automation.rules.filter((entry) => entry.id !== rule.id),
    }).catch((error) => { elements.automationFormMessage.textContent = error.message; }));
    actions.append(enabled, run, remove);
    row.append(copy, actions);
    elements.automationRuleList.append(row);
  }
  if (!automation.rules.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = t('noRules');
    elements.automationRuleList.append(empty);
  }

  elements.automationLogList.replaceChildren();
  for (const entry of automation.log) {
    const row = document.createElement('div');
    row.className = 'automation-list-row';
    const time = document.createElement('time');
    time.textContent = timelineClock(entry.time);
    const copy = document.createElement('span');
    const title = document.createElement('strong');
    title.textContent = `${entry.status.toUpperCase()} · ${entry.name}`;
    if (entry.status === 'error') title.className = 'automation-status-error';
    const detail = document.createElement('small');
    detail.textContent = entry.detail;
    copy.append(title, detail);
    row.append(time, copy);
    elements.automationLogList.append(row);
  }
  if (!automation.log.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-list';
    empty.textContent = t('noAutomationLog');
    elements.automationLogList.append(empty);
  }
  populateAutomationTriggerOptions();
  populateAutomationTargets();
}

function homeGateLabel(state) {
  const explicit = state?.gate?.name;
  if (explicit) { inferredHomeGate = explicit; return explicit; }
  const aircraft = state?.aircraft;
  if (!aircraft?.onGround) return inferredHomeGate || '—';
  const speed = Number(aircraft.groundSpeed) || 0;
  if (speed > 8 || !loadedAirportMapData?.features?.length) return inferredHomeGate || '—';
  let best = null;
  for (const feature of loadedAirportMapData.features) {
    if (feature.kind !== 'parking_position') continue;
    const raw = Array.isArray(feature.coordinates) ? feature.coordinates.at(-1) : null;
    const lat = Number(raw?.lat ?? raw?.[0]);
    const lon = Number(raw?.lon ?? raw?.lng ?? raw?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const distance = approximateDistanceMeters(aircraft, { lat, lon });
    if (distance <= 90 && (!best || distance < best.distance)) best = { distance, label: feature.ref || feature.name || 'Stand' };
  }
  if (best) inferredHomeGate = String(best.label).trim();
  return inferredHomeGate || '—';
}

function renderEfb(state) {
  const flight = state.flight ?? {};
  const taxi = state.taxi ?? {};
  const atc = state.atc ?? {};
  const selectedProvider = atc.selectedProvider || 'auto';
  const effectiveProvider = selectedProvider === 'auto' ? atc.activeProvider || 'auto' : selectedProvider;
  const atcConnection = activeAtcConnection(state);
  const navigraph = state.integrations?.navigraph ?? {};
  const gsx = state.integrations?.gsx ?? {};
  const simConnection = state.connections?.simConnect ?? {};
  const currentAirport = airportTargetIcao(state) || '—';
  const runway = taxi.pathMetadata?.runway || flight.departureRunway || flight.arrivalRunway || '—';
  const gate = homeGateLabel(state);

  elements.homeClock.textContent = `${new Date().toLocaleTimeString(localeFor(currentLanguage), {
    hour: '2-digit', minute: '2-digit', hour12: preferences.clockFormat === '12',
  })} LT`;
  const planFlight = state.integrations?.simbrief?.flight || {};
  elements.homeCallsign.textContent = flight.callsign || planFlight.callsign || 'NO FLIGHT';
  elements.homeOrigin.textContent = flight.origin || planFlight.origin || '—';
  elements.homeDestination.textContent = flight.destination || planFlight.destination || state.planning?.selectedAirport?.icao || '—';
  elements.homeAirport.textContent = currentAirport;
  elements.homeRunway.textContent = runway === '—' ? runway : `RWY ${runway}`;
  elements.homeGate.textContent = gate;
  elements.homeAtcSource.textContent = atcProviderLabel(effectiveProvider).toUpperCase();
  elements.homeAtcDetail.textContent = atcConnection?.detail || 'ATC-Quelle wird gesucht.';
  elements.homeTaxiSummary.textContent = (taxi.path?.length ?? 0) > 1
    ? `${taxi.path.length} Routenpunkte · ${taxi.pathMetadata?.label || atcProviderLabel(effectiveProvider)}`
    : t('taxiSummary');
  elements.homeNavigraphSummary.textContent = t('chartsPaused');
  elements.homeGsxSummary.textContent = gsx.detail || 'GSX-Installation wird gesucht.';
  renderHomeNextStep(state);

  const navStatus = navigraph.status || 'configuration-required';
  elements.chartsStatusPill.className = `module-status ${navStatus}`;
  elements.chartsStatusPill.textContent = navigraph.authenticated
    ? 'CONNECTED'
    : navigraph.configured ? 'LOGIN REQUIRED' : 'SETUP REQUIRED';
  elements.chartsAirport.textContent = currentAirport;
  const simulatorOnline = ['connected', 'demo'].includes(simConnection.status);
  elements.chartsSimGate.textContent = simulatorOnline ? 'SIM ONLINE' : 'SIM OFFLINE';
  elements.navigraphDetail.textContent = navigraph.detail
    || 'Für echte Charts benötigt diese App eine Navigraph-Developer-Freigabe und einen persönlichen Login.';

  const gsxStatus = gsx.status || 'waiting';
  elements.gsxStatusPill.className = `module-status ${gsxStatus}`;
  elements.gsxStatusPill.textContent = gsx.status === 'bridge-ready'
    ? 'BRIDGE READY' : gsx.installed ? 'INSTALLED' : 'SEARCHING';
  elements.gsxTitle.textContent = gsx.installed ? 'GSX Pro erkannt' : 'Installation wird gesucht';
  elements.gsxDetail.textContent = gsx.detail || 'GSX Pro wird in den Standardordnern gesucht.';
  elements.gsxInstall.textContent = gsx.installed ? 'ERKANNT' : 'NICHT ERKANNT';
  elements.gsxSim.textContent = simulatorOnline ? 'ONLINE' : 'OFFLINE';
  elements.gsxControl.textContent = gsx.runtimeDetected ? 'RUNNING' : 'OFFLINE';
  elements.gsxServiceStatus.textContent = gsx.liveData ? 'LIVE LVAR STATUS' : 'WAITING FOR LIVE DATA';
  const payload = gsx.payload || {};
  elements.gsxPayloadStatus.textContent = payload.sync?.syncedAt ? `SYNC ${formatTime(payload.sync.syncedAt)}` : 'EXPLICIT SYNC';
  elements.gsxPaxTarget.textContent = Number.isFinite(Number(payload.passengerTarget)) ? String(Math.round(payload.passengerTarget)) : '—';
  const boarded = Number.isFinite(Number(payload.boardingTotal)) ? payload.boardingTotal : payload.boardingPassengers;
  elements.gsxPaxProgress.textContent = Number.isFinite(Number(boarded)) ? String(Math.round(boarded)) : '—';
  elements.gsxCargoProgress.textContent = Number.isFinite(Number(payload.boardingCargoPercent)) ? `${Math.round(payload.boardingCargoPercent)} %` : '—';
  renderGsxServices(gsx);
  renderGroundSafety(state);
  renderGsxSetup(gsx);
  renderNavigraph(navigraph);
  renderAutomation(state);

  elements.atcActivePill.className = `module-status ${atcConnection?.status || 'waiting'}`;
  elements.atcActivePill.textContent = effectiveProvider === 'auto' ? 'AUTO' : `AUTO · ${atcProviderLabel(effectiveProvider).toUpperCase()}`;
  document.getElementById('atc-auto-source-label')?.replaceChildren(document.createTextNode(effectiveProvider === 'auto' ? 'Wird erkannt …' : atcProviderLabel(effectiveProvider)));
  ensureAutomaticAtcProvider(state);
  for (const button of elements.providerButtons) {
    const active = button.dataset.provider === selectedProvider;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  }
  setStatusDot(elements.atcSiDot, state.connections?.sayIntentions?.status);
  setStatusDot(elements.atcBatcDot, state.connections?.beyondAtc?.status);
  elements.atcSiDetail.textContent = state.connections?.sayIntentions?.detail || 'Wird gesucht';
  elements.atcBatcDetail.textContent = state.connections?.beyondAtc?.detail || 'Log wird gesucht';
  const clearance = taxi.clearance;
  elements.atcClearanceStation.textContent = clearance?.station || (clearance ? atcProviderLabel(clearance.provider) : '—');
  elements.atcClearanceText.textContent = clearance?.text || 'Noch keine Taxifreigabe empfangen.';
  elements.atcClearanceTime.textContent = formatTime(clearance?.time);

  const littleNavmap = state.integrations?.littleNavmap || {};
  const adapter = state.integrations?.aircraftAdapter || {};
  setStatusDot(elements.settingsMsfsDot, simConnection.status);
  setStatusDot(elements.settingsLnmDot, littleNavmap.status);
  setStatusDot(elements.settingsAdapterDot, adapter.status);
  setStatusDot(elements.settingsAtcDot, atcConnection?.status);
  setStatusDot(elements.settingsNavDot, navStatus);
  setStatusDot(elements.settingsGsxDot, state.connections?.gsx?.status || gsxStatus);
  elements.settingsMsfs.textContent = simConnection.detail || 'Wird gesucht';
  elements.settingsLnm.textContent = littleNavmap.detail || 'WebAPI wird gesucht';
  elements.settingsAdapter.textContent = adapter.detail || 'Fenix / PMDG wird erkannt';
  elements.settingsAtc.textContent = `${effectiveProvider === 'auto' ? 'AUTO' : atcProviderLabel(effectiveProvider)} · ${atcConnection?.detail || 'wartet'}`;
  elements.settingsNav.textContent = navigraph.detail || 'Setup erforderlich';
  elements.settingsGsx.textContent = gsx.detail || 'Wird gesucht';
  renderFlightData(state);
  renderFlightJourney(state);
  renderBriefing(state);
  renderAtcMessages(state);
  renderCom(state);
  renderFlightboard(state);
  renderOnlineNetworks(state);
  renderFenix(state);
}

function ensureAutomaticAtcProvider(state) {
  if (forcingAutomaticAtc || state?.atc?.selectedProvider === 'auto' || !token) return;
  forcingAutomaticAtc = true;
  fetch(authenticatedUrl('/api/atc/provider'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 'auto' }),
  }).then((response) => response.json()).then((data) => { if (data?.state) renderState(data.state); }).catch(() => {}).finally(() => { forcingAutomaticAtc = false; });
}

async function selectAtcProvider(provider) {
  for (const button of elements.providerButtons) button.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/atc/provider'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'ATC-Quelle konnte nicht geändert werden.');
    renderState(data.state);
  } catch (error) {
    elements.manualClearanceMessage.textContent = error.message;
  } finally {
    for (const button of elements.providerButtons) button.disabled = false;
  }
}

async function applyManualClearance() {
  const text = elements.manualClearanceInput.value.trim();
  elements.manualClearanceMessage.textContent = '';
  if (text.length < 4) {
    elements.manualClearanceMessage.textContent = 'Bitte eine vollständige Freigabe eingeben.';
    return;
  }
  elements.applyManualClearance.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/atc/clearance'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, station: 'Manual ATC' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Freigabe konnte nicht übernommen werden.');
    elements.manualClearanceInput.value = '';
    elements.manualClearanceMessage.textContent = 'Freigabe übernommen · Taxiweg wird abgeleitet.';
    renderState(data.state);
    switchModule('taxi');
  } catch (error) {
    elements.manualClearanceMessage.textContent = error.message;
  } finally {
    elements.applyManualClearance.disabled = false;
  }
}

function openNewFlightDialog() {
  if (typeof elements.newFlightDialog.showModal === 'function' && !elements.newFlightDialog.open) elements.newFlightDialog.showModal();
  else elements.newFlightDialog.setAttribute('open', '');
}

async function resetFlight() {
  elements.confirmNewFlight.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/flight/reset'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Flight data could not be reset.');
    renderedPathRevision = -1;
    renderedGateFingerprint = '';
    lastOperationalAlertFingerprint = '';
    trackingCurrentFlight = null;
    deriveAttempts.clear();
    plannerState.routes = [];
    plannerState.selectedRouteId = null;
    plannerState.selectedAirport = null;
    layers.planning.clearLayers();
    renderState(data.state);
    if (typeof elements.newFlightDialog.close === 'function') elements.newFlightDialog.close();
    switchModule('home');
  } catch (error) {
    elements.confirmNewFlight.textContent = error.message;
  } finally {
    elements.confirmNewFlight.disabled = false;
  }
}

function saveSimbriefIdentifier(value, { announce = false } = {}) {
  const identifier = String(value || '').trim().slice(0, 80);
  preferences.simbriefIdentifier = identifier;
  if (identifier) localStorage.setItem('flight-deck-simbrief-user', identifier);
  else localStorage.removeItem('flight-deck-simbrief-user');
  for (const input of [elements.simbriefIdentifier, elements.settingsSimbriefIdentifier, elements.onboardingSimbriefIdentifier]) {
    if (input && input.value !== identifier) input.value = identifier;
  }
  if (elements.settingsSimbriefSaved) {
    elements.settingsSimbriefSaved.textContent = identifier ? t('savedLocally') : t('notSet');
    elements.settingsSimbriefSaved.classList.toggle('empty', !identifier);
    if (announce) {
      elements.settingsSimbriefSaved.classList.add('flash');
      setTimeout(() => elements.settingsSimbriefSaved.classList.remove('flash'), 900);
    }
  }
  if (latestState) renderHomeNextStep(latestState);
  return identifier;
}

async function importSimBrief({ silent = false } = {}) {
  const identifier = saveSimbriefIdentifier(elements.simbriefIdentifier.value);
  if (!identifier) {
    if (!silent) elements.simbriefMessage.textContent = 'Enter a SimBrief Pilot ID or username.';
    return;
  }
  elements.simbriefImport.disabled = true;
  elements.simbriefMessage.textContent = 'Loading latest OFP …';
  try {
    const response = await fetch(authenticatedUrl('/api/simbrief/import'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, prefetchDestination: preferences.destinationPrefetch }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'SimBrief import failed.');
    elements.simbriefMessage.textContent = `${data.summary.flight.origin} → ${data.summary.flight.destination} imported.`;
    renderState(data.state);
  } catch (error) {
    elements.simbriefMessage.textContent = error.message;
  } finally {
    elements.simbriefImport.disabled = false;
  }
}

async function importSimBriefFromHome() {
  if (preferences.simbriefIdentifier) {
    elements.simbriefIdentifier.value = preferences.simbriefIdentifier;
    const prior = elements.homeSimbriefImport.textContent;
    elements.homeSimbriefImport.disabled = true;
    elements.homeSimbriefImport.textContent = 'IMPORT …';
    try { await importSimBrief(); }
    finally { elements.homeSimbriefImport.disabled = false; elements.homeSimbriefImport.textContent = prior; }
    return;
  }
  elements.simbriefQuickIdentifier.value = '';
  elements.simbriefQuickMessage.textContent = '';
  if (typeof elements.simbriefQuickDialog.showModal === 'function' && !elements.simbriefQuickDialog.open) elements.simbriefQuickDialog.showModal();
}

async function importSimBriefQuick() {
  const identifier = saveSimbriefIdentifier(elements.simbriefQuickIdentifier.value, { announce: true });
  if (!identifier) {
    elements.simbriefQuickMessage.textContent = 'Bitte Pilot-ID oder Benutzername eingeben.';
    return;
  }
  elements.simbriefIdentifier.value = identifier;
  elements.simbriefQuickStart.disabled = true;
  try {
    await importSimBrief();
    elements.simbriefQuickDialog.close?.();
  } catch (error) {
    elements.simbriefQuickMessage.textContent = error.message;
  } finally {
    elements.simbriefQuickStart.disabled = false;
  }
}

function filenameFromResponse(response, fallback) {
  const header = response.headers.get('Content-Disposition') || '';
  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

async function downloadResponse(response, fallbackName) {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Download failed (${response.status}).`);
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filenameFromResponse(response, fallbackName);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2_000);
}

function diagnosticsLabel(status) {
  const value = String(status || 'waiting').toLowerCase();
  if (['connected', 'ready', 'cached', 'installed', 'running'].includes(value)) return 'ready';
  if (['error', 'missing', 'disconnected'].includes(value)) return 'error';
  return 'waiting';
}

async function runDiagnostics({ onboarding = false } = {}) {
  if (!token) return null;
  if (elements.diagnosticsStatus) elements.diagnosticsStatus.textContent = 'CHECKING';
  try {
    const response = await fetch(authenticatedUrl('/api/diagnostics'), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Diagnostics failed.');
    if (elements.diagnosticsList) {
      elements.diagnosticsList.replaceChildren();
      for (const check of data.checks || []) {
        const row = document.createElement('div');
        row.className = `diagnostic-row ${diagnosticsLabel(check.status)}`;
        row.innerHTML = `<i></i><span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail || check.status)}</small></span><b>${escapeHtml(String(check.status || 'waiting').toUpperCase())}</b>`;
        elements.diagnosticsList.append(row);
      }
    }
    const hasError = (data.checks || []).some((check) => diagnosticsLabel(check.status) === 'error');
    if (elements.diagnosticsStatus) elements.diagnosticsStatus.textContent = hasError ? 'ACTION NEEDED' : 'CHECKED';
    if (onboarding && elements.onboardingChecks) {
      elements.onboardingChecks.replaceChildren();
      for (const check of data.checks || []) {
        const row = document.createElement('span');
        row.className = diagnosticsLabel(check.status);
        row.innerHTML = `<i></i><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail || check.status)}</small>`;
        elements.onboardingChecks.append(row);
      }
    }
    return data;
  } catch (error) {
    if (elements.diagnosticsStatus) elements.diagnosticsStatus.textContent = 'FAILED';
    if (elements.diagnosticsList) elements.diagnosticsList.innerHTML = `<p class="empty-list">${escapeHtml(error.message)}</p>`;
    return null;
  }
}

async function refreshDevices() {
  if (!token || !elements.pairedDeviceList) return;
  const response = await fetch(authenticatedUrl('/api/devices'), { cache: 'no-store' });
  if (response.status === 403) {
    deviceManagementAvailable = false;
    elements.sharingEnabled.disabled = true;
    elements.pairedDeviceList.innerHTML = '<p class="empty-list">Manage paired devices in the Windows host app.</p>';
    return;
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Paired devices could not be loaded.');
  deviceManagementAvailable = true;
  elements.sharingEnabled.disabled = false;
  elements.sharingEnabled.checked = data.sharingEnabled !== false;
  elements.pairedDeviceList.replaceChildren();
  for (const device of data.devices || []) {
    const row = document.createElement('div');
    row.className = 'paired-device-row';
    row.innerHTML = `<span><strong>${escapeHtml(device.name || 'Tablet')}</strong><small>${escapeHtml(device.lastSeenAt ? `Last seen ${formatTime(device.lastSeenAt)}` : 'Paired')}</small></span><button type="button" data-revoke-device="${escapeHtml(device.id)}">REVOKE</button>`;
    elements.pairedDeviceList.append(row);
  }
  if (!elements.pairedDeviceList.childElementCount) elements.pairedDeviceList.innerHTML = '<p class="empty-list">No paired devices yet.</p>';
}

function backupPreferences() {
  return {
    ...preferences,
    appLayout,
    simbriefIdentifier: elements.simbriefIdentifier.value.trim(),
  };
}

function restorePreferences(value = {}) {
  const selections = {
    language: ['system', 'de', 'en', 'fr', 'es', 'it', 'nl'], theme: ['system', 'dark', 'light'], textSize: ['compact', 'standard', 'large'],
    weightUnit: ['kg', 'lb'], distanceUnit: ['nm', 'km'], pressureUnit: ['hpa', 'inhg'], temperatureUnit: ['c', 'f'], clockFormat: ['12', '24'],
    alertMode: ['normal', 'visual', 'off'],
  };
  const storageKeys = {
    language: 'flight-deck-language', theme: 'flight-deck-theme', textSize: 'flight-deck-text-size', weightUnit: 'flight-deck-weight-unit',
    distanceUnit: 'flight-deck-distance-unit', pressureUnit: 'flight-deck-pressure-unit', temperatureUnit: 'flight-deck-temperature-unit',
    clockFormat: 'flight-deck-clock-format', alertMode: 'flight-deck-alert-mode',
  };
  for (const [key, allowed] of Object.entries(selections)) {
    if (!allowed.includes(value[key])) continue;
    preferences[key] = value[key];
    localStorage.setItem(storageKeys[key], String(value[key]));
  }
  for (const [key, storageKey, allowed] of [
    ['arrivalTriggerNm', 'flight-deck-arrival-trigger', [50, 100, 150, 200]],
    ['fuelBufferPounds', 'flight-deck-fuel-buffer', [0, 500, 1_000, 2_000]],
  ]) {
    if (!allowed.includes(Number(value[key]))) continue;
    preferences[key] = Number(value[key]);
    localStorage.setItem(storageKey, String(value[key]));
  }
  for (const [key, storageKey] of [
    ['focusMode', 'flight-deck-focus-mode'], ['showPhaseHome', 'flight-deck-show-phase-home'], ['showHelpTexts', 'flight-deck-show-help-texts'],
    ['simbriefAutoImport', 'flight-deck-simbrief-auto-import'], ['destinationPrefetch', 'flight-deck-destination-prefetch'],
  ]) {
    if (typeof value[key] !== 'boolean') continue;
    preferences[key] = value[key];
    localStorage.setItem(storageKey, String(value[key]));
  }
  if (typeof value.displayName === 'string') { preferences.displayName = value.displayName.slice(0, 40); localStorage.setItem('flight-deck-display-name', preferences.displayName); }
  if (value.appLayout && Array.isArray(value.appLayout.order)) {
    localStorage.setItem('flight-deck-app-layout', JSON.stringify(value.appLayout));
    appLayout = loadAppLayout();
  }
  if (typeof value.simbriefIdentifier === 'string') {
    saveSimbriefIdentifier(value.simbriefIdentifier.slice(0, 80));
  }
  applyPreferences();
  applyAppLayout();
}

async function exportBackup() {
  elements.backupStatus.textContent = 'EXPORTING';
  try {
    const response = await fetch(authenticatedUrl('/api/backup/export'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: backupPreferences() }),
    });
    await downloadResponse(response, 'Flight-Deck-EFB-Backup.json');
    elements.backupStatus.textContent = 'EXPORTED';
  } catch (error) {
    elements.backupStatus.textContent = error.message;
  }
}

async function importBackupFile(file) {
  elements.backupStatus.textContent = 'RESTORING';
  try {
    const backup = JSON.parse(await file.text());
    const response = await fetch(authenticatedUrl('/api/backup/import'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backup }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Backup could not be restored.');
    restorePreferences(data.preferences);
    renderState(data.state);
    await refreshTrackingData({ force: true });
    elements.backupStatus.textContent = 'RESTORED';
  } catch (error) {
    elements.backupStatus.textContent = error.message;
  } finally {
    elements.backupFile.value = '';
  }
}

async function refreshOfficialWeather() {
  elements.weatherRefresh.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/weather/refresh'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Weather could not be refreshed.');
    if (data.state) renderState(data.state);
    elements.weatherRefresh.textContent = `✓ ${t('refreshWeather')}`;
  } catch (error) {
    elements.weatherRefresh.textContent = error.message;
  } finally {
    setTimeout(() => { elements.weatherRefresh.textContent = t('refreshWeather'); elements.weatherRefresh.disabled = false; }, 2_000);
  }
}

function showOnboardingStep(step) {
  onboardingStep = Math.max(1, Math.min(3, Number(step) || 1));
  for (const section of elements.onboardingSteps) section.hidden = Number(section.dataset.onboardingStep) !== onboardingStep;
  for (const [index, marker] of elements.onboardingProgress.entries()) {
    marker.classList.toggle('active', index + 1 === onboardingStep);
    marker.classList.toggle('complete', index + 1 < onboardingStep);
  }
  elements.onboardingBack.hidden = onboardingStep === 1;
  elements.onboardingNext.hidden = onboardingStep === 3;
  elements.onboardingFinish.hidden = onboardingStep !== 3;
  if (onboardingStep === 3) runDiagnostics({ onboarding: true }).catch(() => {});
}

function saveOnboardingDisplay() {
  preferences.language = elements.onboardingLanguage.value;
  preferences.theme = elements.onboardingTheme.value;
  preferences.textSize = elements.onboardingTextSize.value;
  localStorage.setItem('flight-deck-language', preferences.language);
  localStorage.setItem('flight-deck-theme', preferences.theme);
  localStorage.setItem('flight-deck-text-size', preferences.textSize);
  preferences.displayName = String(elements.onboardingDisplayName?.value || '').trim().slice(0, 40);
  preferences.showHelpTexts = elements.onboardingHelpTexts?.checked !== false;
  localStorage.setItem('flight-deck-display-name', preferences.displayName);
  localStorage.setItem('flight-deck-show-help-texts', String(preferences.showHelpTexts));
  applyPreferences();
}

function saveOnboardingSimbrief() {
  saveSimbriefIdentifier(elements.onboardingSimbriefIdentifier.value, { announce: true });
  preferences.simbriefAutoImport = elements.onboardingSimbriefAuto.checked;
  localStorage.setItem('flight-deck-simbrief-auto-import', String(preferences.simbriefAutoImport));
  elements.simbriefAutoImport.checked = preferences.simbriefAutoImport;
}

function openOnboarding({ force = false } = {}) {
  if (!force && localStorage.getItem('flight-deck-onboarding-v2')) return;
  elements.onboardingLanguage.value = preferences.language;
  elements.onboardingTheme.value = preferences.theme;
  elements.onboardingTextSize.value = preferences.textSize;
  if (elements.onboardingDisplayName) elements.onboardingDisplayName.value = preferences.displayName;
  if (elements.onboardingHelpTexts) elements.onboardingHelpTexts.checked = preferences.showHelpTexts;
  elements.onboardingSimbriefIdentifier.value = preferences.simbriefIdentifier;
  elements.onboardingSimbriefAuto.checked = preferences.simbriefAutoImport;
  showOnboardingStep(1);
  if (typeof elements.onboardingDialog.showModal === 'function' && !elements.onboardingDialog.open) elements.onboardingDialog.showModal();
  else elements.onboardingDialog.setAttribute('open', '');
}

async function maybeShowOnboarding() {
  openOnboarding();
}

async function afterAuthentication() {
  refreshDevices().catch(() => {});
  checkForUpdate({ startup: true }).catch(() => refreshUpdateStatus().catch(() => {}));
  maybeShowOnboarding().catch(() => {});
  const identifier = elements.simbriefIdentifier.value.trim();
  if (!autoImportAttempted && preferences.simbriefAutoImport && identifier && !sessionStorage.getItem('flight-deck-simbrief-imported')) {
    autoImportAttempted = true;
    sessionStorage.setItem('flight-deck-simbrief-imported', 'attempted');
    importSimBrief({ silent: true }).catch(() => {});
  }
}

function renderUpdateStatus(status = {}) {
  if (!elements.updateDetail) return;
  const currentVersion = status.currentVersion || document.documentElement.dataset.appVersion || '1.7.0';
  elements.updateVersion.textContent = `v${currentVersion}`;
  const states = {
    manual: t('updateReadyManual'), idle: t('updateReady'), checking: t('checkingUpdates'),
    available: t('updateAvailable'), downloading: t('downloadingUpdate'), downloaded: t('updateDownloaded'),
    current: t('upToDate'), error: t('updateFailed'), unsupported: t('updateUnsupported'),
  };
  const detail = status.detail || states[status.state] || t('updateReadyManual');
  elements.updateDetail.textContent = detail;
  const progress = Math.max(0, Math.min(100, Number(status.percent) || 0));
  elements.updateProgress.hidden = status.state !== 'downloading';
  elements.updateProgress.style.setProperty('--update-progress', `${progress}%`);
  elements.updateProgressLabel.textContent = `${Math.round(progress)}%`;
  elements.checkUpdate.disabled = status.canManage === false || ['checking', 'downloading'].includes(status.state);
  elements.installUpdate.hidden = status.state !== 'downloaded';

  if (elements.updateDialog) {
    elements.updateDialogDetail.textContent = detail;
    elements.updateDialogTitle.textContent = status.state === 'downloaded'
      ? `Version ${status.releaseName || ''} ist bereit`
      : status.state === 'downloading' ? 'Update wird heruntergeladen'
        : `Update ${status.releaseName || ''} verfügbar`.replace(/\s+/g, ' ').trim();
    elements.updateDialogProgress.hidden = status.state !== 'downloading';
    elements.updateDialogProgress.style.setProperty('--update-progress', `${progress}%`);
    elements.updateDialogProgressLabel.textContent = `${Math.round(progress)}%`;
    elements.updateDialogDownload.hidden = status.state !== 'available';
    elements.updateDialogInstall.hidden = status.state !== 'downloaded';
    elements.updateDialogLater.hidden = status.state === 'downloading';
    if (status.canManage !== false && ['available', 'downloading', 'downloaded'].includes(status.state)
        && typeof elements.updateDialog.showModal === 'function' && !elements.updateDialog.open) {
      elements.updateDialog.showModal();
    }
  }
  clearTimeout(updateStatusTimer);
  if (['checking', 'downloading'].includes(status.state)) {
    updateStatusTimer = setTimeout(() => refreshUpdateStatus().catch(() => {}), 1200);
  }
}

async function refreshUpdateStatus() {
  const response = await fetch(authenticatedUrl('/api/update/status'), { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json();
  renderUpdateStatus(data);
  return data;
}

async function checkForUpdate({ startup = false } = {}) {
  const existing = await refreshUpdateStatus().catch(() => null);
  if (existing?.canManage === false) return existing;
  if (elements.checkUpdate) elements.checkUpdate.disabled = true;
  renderUpdateStatus({ state: 'checking', currentVersion: document.documentElement.dataset.appVersion || '1.7.0', canManage: existing?.canManage });
  try {
    const response = await fetch(authenticatedUrl('/api/update/check'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t('updateFailed'));
    renderUpdateStatus(data);
    return data;
  } catch (error) {
    const failed = { state: 'error', currentVersion: document.documentElement.dataset.appVersion || '1.7.0', detail: error.message, canManage: existing?.canManage };
    renderUpdateStatus(failed);
    if (!startup) throw error;
    return failed;
  } finally {
    if (elements.checkUpdate) elements.checkUpdate.disabled = false;
  }
}

async function downloadAvailableUpdate() {
  elements.updateDialogDownload.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/update/download'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t('updateFailed'));
    renderUpdateStatus(data);
  } catch (error) {
    renderUpdateStatus({ state: 'error', currentVersion: document.documentElement.dataset.appVersion || '1.7.0', detail: error.message });
  } finally {
    elements.updateDialogDownload.disabled = false;
  }
}

async function installDownloadedUpdate() {
  if (elements.installUpdate) elements.installUpdate.disabled = true;
  if (elements.updateDialogInstall) elements.updateDialogInstall.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/update/install'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t('updateFailed'));
    renderUpdateStatus(data);
  } catch (error) {
    renderUpdateStatus({ state: 'error', currentVersion: document.documentElement.dataset.appVersion || '1.7.0', detail: error.message });
    if (elements.installUpdate) elements.installUpdate.disabled = false;
    if (elements.updateDialogInstall) elements.updateDialogInstall.disabled = false;
  }
}

async function beginNavigraphLogin() {
  elements.navigraphLogin.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/navigraph/login'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Navigraph login could not be started.');
    renderState(data.state);
    if (data.login?.verificationUriComplete) window.open(data.login.verificationUriComplete, '_blank', 'noopener');
  } catch (error) {
    elements.navigraphDetail.textContent = error.message;
  } finally {
    elements.navigraphLogin.disabled = false;
  }
}

async function logoutNavigraph() {
  const response = await fetch(authenticatedUrl('/api/navigraph/logout'), { method: 'POST' });
  if (response.ok) renderState((await response.json()).state);
}

async function setComFromPreset(frequency, com, button) {
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = 'TUNING …';
  try {
    const response = await fetch(authenticatedUrl('/api/com'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'set', frequency, com, mode: 'standby' }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Frequency could not be tuned.');
    button.textContent = 'SET ✓';
    if (data.state) renderState(data.state);
  } catch (error) {
    button.textContent = 'ERROR';
    button.title = error.message;
  } finally {
    setTimeout(() => {
      button.disabled = false;
      button.textContent = previous;
    }, 1_800);
  }
}

async function tuneSiFrequency(frequency, button) {
  return setComFromPreset(frequency, 1, button);
}

async function handleComAction(button) {
  const action = button.dataset.comAction;
  const com = Number(button.dataset.com);
  const mode = button.dataset.mode;
  const input = com === 1 ? elements.com1FrequencyInput : elements.com2FrequencyInput;
  const integration = latestState?.integrations?.com || latestState?.aircraft || {};
  const body = { action, com };
  if (action === 'set') {
    const frequency = Number(String(input.value).replace(',', '.'));
    if (!Number.isFinite(frequency)) {
      elements.comMessage.textContent = t('invalidComFrequency');
      input.focus();
      return;
    }
    if (mode === 'active' && !window.confirm(`${t('setActiveConfirm')} COM${com} ${frequency.toFixed(3)} MHz?`)) return;
    Object.assign(body, { frequency, mode });
  } else if (action === 'receive') {
    body.enabled = !Boolean(integration[`com${com}Receive`]);
  }
  const prior = button.textContent;
  button.disabled = true;
  elements.comMessage.textContent = t('applying');
  try {
    const response = await fetch(authenticatedUrl('/api/com'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t('comActionFailed'));
    elements.comMessage.textContent = t('comActionApplied');
    if (data.state) renderState(data.state);
  } catch (error) {
    elements.comMessage.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = prior;
  }
}

async function refreshOnlineNetwork(network) {
  const selected = network || elements.networkButtons.find((button) => button.classList.contains('active'))?.dataset.network || 'off';
  for (const button of elements.networkButtons) button.disabled = true;
  elements.onlineRefresh.disabled = true;
  elements.onlineDetail.textContent = selected === 'off' ? 'Online network disabled.' : `Loading ${selected.toUpperCase()} …`;
  try {
    const response = await fetch(authenticatedUrl('/api/networks/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ network: selected }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Network data could not be loaded.');
    if (latestState) {
      latestState.integrations.onlineNetworks = data.network;
      renderOnlineNetworks(latestState);
    }
  } catch (error) {
    elements.onlineDetail.textContent = error.message;
  } finally {
    for (const button of elements.networkButtons) button.disabled = false;
    elements.onlineRefresh.disabled = false;
  }
}

async function refreshGsx() {
  elements.gsxRefresh.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/gsx/refresh'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'GSX check failed.');
    if (latestState) {
      latestState.integrations.gsx = data.gsx;
      renderEfb(latestState);
    }
  } catch (error) {
    elements.gsxDetail.textContent = error.message;
  } finally {
    elements.gsxRefresh.disabled = false;
  }
}

async function refreshAircraftAdapter() {
  if (!elements.aircraftAdapterRefresh) return;
  elements.aircraftAdapterRefresh.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/aircraft-adapter/refresh'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Aircraft Adapter check failed.');
    if (data.state) renderState(data.state);
  } catch (error) {
    elements.aircraftAdapterDetail.textContent = error.message;
  } finally {
    elements.aircraftAdapterRefresh.disabled = false;
  }
}

async function syncGsxPayload() {
  if (!elements.gsxPayloadSync) return;
  elements.gsxPayloadSync.disabled = true;
  elements.gsxPayloadMessage.textContent = 'Syncing …';
  try {
    const response = await fetch(authenticatedUrl('/api/gsx/payload-sync'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'GSX payload sync failed.');
    elements.gsxPayloadMessage.textContent = `${data.result.passengers} PAX an GSX übertragen.`;
    if (latestState) { latestState.integrations.gsx = data.gsx; renderEfb(latestState); }
  } catch (error) {
    elements.gsxPayloadMessage.textContent = error.message;
  } finally {
    elements.gsxPayloadSync.disabled = false;
  }
}

async function connectFenix() {
  const value = elements.fenixUrl.value.trim();
  elements.fenixConnect.disabled = true;
  elements.fenixDetail.textContent = 'Checking Fenix Remote EFB …';
  try {
    const response = await fetch(authenticatedUrl('/api/fenix/check'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || 'Fenix is not reachable.');
    localStorage.setItem('flight-deck-fenix-url', data.url);
    elements.fenixUrl.value = data.url;
    elements.fenixOpen.href = data.url;
    elements.fenixEmbed.disabled = false;
    elements.fenixDetail.textContent = data.detail;
  } catch (error) {
    elements.fenixDetail.textContent = error.message;
    elements.fenixEmbed.disabled = true;
  } finally {
    elements.fenixConnect.disabled = false;
  }
}

function embedFenix() {
  const url = elements.fenixUrl.value.trim();
  elements.fenixFrame.src = url;
  elements.fenixFrame.hidden = false;
  elements.fenixPlaceholder.hidden = true;
}

function replaceSelectOptions(select, placeholder, values, { valueKey = 'value', labelKey = 'label' } = {}) {
  const previous = select.value;
  select.replaceChildren();
  if (placeholder) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    select.append(option);
  }
  for (const value of values) {
    const option = document.createElement('option');
    option.value = String(value[valueKey]);
    option.textContent = String(value[labelKey]);
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === previous)) select.value = previous;
}

function airportForPlanner(mapData = loadedAirportMapData) {
  if (!mapData) return null;
  return {
    icao: mapData.icao,
    name: mapData.airport?.name || mapData.icao,
    municipality: mapData.airport?.municipality || null,
    country: mapData.airport?.country || null,
    lat: mapData.center?.lat,
    lon: mapData.center?.lon,
  };
}

function showSelectedAirport(airport) {
  plannerState.selectedAirport = airport || null;
  const selected = Boolean(airport);
  elements.selectedAirport.hidden = !selected;
  elements.airportSearch.parentElement.hidden = selected;
  elements.airportResults.hidden = true;
  elements.selectedAirportIcao.textContent = airport?.icao || '—';
  elements.selectedAirportName.textContent = [airport?.name, airport?.municipality].filter(Boolean).join(' · ') || '—';
}

function syncPlannerFromMap(mapData) {
  const selectedFromState = latestState?.planning?.selectedAirport;
  showSelectedAirport(selectedFromState?.icao === mapData.icao ? selectedFromState : airportForPlanner(mapData));
  updatePlannerControls();
}

function updatePlannerControls() {
  const mapReady = loadedAirportMapData
    && (!plannerState.selectedAirport || loadedAirportMapData.icao === plannerState.selectedAirport.icao);
  const planning = mapReady ? loadedAirportMapData.planning ?? { runways: [], stands: [] } : { runways: [], stands: [] };
  const runways = planning.runways.map((runway) => ({ value: runway, label: `RWY ${runway}` }));
  const stands = planning.stands.map((stand) => ({ value: stand.id, label: stand.ref || stand.name || stand.id }));
  replaceSelectOptions(elements.plannerRunway, 'Runway auswählen', runways);
  if (!elements.plannerRunway.value && runways.length > 0) {
    const preferredRunway = String(
      latestState?.taxi?.pathMetadata?.runway
      || latestState?.flight?.departureRunway
      || latestState?.flight?.arrivalRunway
      || '',
    ).toUpperCase();
    elements.plannerRunway.value = runways.some((entry) => entry.value === preferredRunway)
      ? preferredRunway
      : runways[0].value;
  }

  const holdingPoints = planning.holdingPoints?.[elements.plannerRunway.value] || [];
  replaceSelectOptions(elements.plannerHoldingPoint, 'Holding Point automatisch', holdingPoints.map((point, index) => ({
    value: point.id,
    label: `${index === 0 ? 'Äußerster · ' : ''}${point.label}${Number.isFinite(point.runwayDistanceMeters) ? ` · ${Math.round(point.runwayDistanceMeters)} m zur Runway` : ''}`,
  })));
  if (holdingPoints.length && !elements.plannerHoldingPoint.value) elements.plannerHoldingPoint.value = holdingPoints[0].id;

  const startValues = [];
  if (Number.isFinite(latestState?.aircraft?.lat) && latestState?.aircraft?.onGround) {
    startValues.push({ value: 'aircraft', label: 'Aktuelle Flugzeugposition' });
  }
  startValues.push(...stands.map((stand) => ({ ...stand, label: `Stand ${stand.label}` })));
  replaceSelectOptions(elements.plannerStart, 'Start auswählen', startValues);
  replaceSelectOptions(elements.plannerDestination, 'Gate / Stand auswählen', stands);
  if (!plannerState.startTouched && startValues.some((entry) => entry.value === 'aircraft')) {
    elements.plannerStart.value = 'aircraft';
  } else if (!elements.plannerStart.value && startValues.length > 0) {
    elements.plannerStart.value = startValues[0].value;
  }

  const mode = elements.plannerMode.value;
  elements.runwayField.hidden = mode === 'custom';
  elements.holdingPointField.hidden = mode !== 'departure';
  elements.startField.hidden = mode !== 'departure';
  elements.destinationField.hidden = mode !== 'arrival';
  elements.customFields.hidden = mode !== 'custom';
  elements.findRoutes.disabled = !mapReady;
  if (!mapReady && plannerState.selectedAirport) {
    elements.plannerMessage.textContent = `Karte für ${plannerState.selectedAirport.icao} wird geladen …`;
  } else if (mapReady && elements.plannerMessage.textContent.includes('wird geladen')) {
    elements.plannerMessage.textContent = '';
  }
}

function openPlanner() {
  if (!plannerState.modeInitialized) {
    elements.plannerMode.value = latestState?.aircraft && !latestState.aircraft.onGround ? 'arrival' : 'departure';
    plannerState.modeInitialized = true;
  }
  if (typeof elements.planDialog.showModal === 'function' && !elements.planDialog.open) elements.planDialog.showModal();
  else elements.planDialog.setAttribute('open', '');
  if (loadedAirportMapData) syncPlannerFromMap(loadedAirportMapData);
  else showSelectedAirport(latestState?.planning?.selectedAirport || null);
  if (!plannerState.selectedAirport) setTimeout(() => elements.airportSearch.focus(), 80);
  updatePlannerControls();
}

function closePlanner() {
  if (typeof elements.planDialog.close === 'function') elements.planDialog.close();
  else elements.planDialog.removeAttribute('open');
}

async function chooseAirport(airport) {
  plannerState.changingAirport = false;
  elements.plannerMessage.textContent = `${airport.icao} wird vorbereitet …`;
  showSelectedAirport(airport);
  plannerState.routes = [];
  plannerState.selectedRouteId = null;
  renderRouteOptions();
  try {
    const response = await fetch(authenticatedUrl('/api/planning/airport'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icao: airport.icao }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Flughafen konnte nicht ausgewählt werden.');
    plannerState.selectedAirport = data.airport;
    loadedAirportIcao = loadedAirportIcao === airport.icao ? null : loadedAirportIcao;
    await loadAirportMap({ ...(latestState || {}), planning: { selectedAirport: data.airport } });
  } catch (error) {
    elements.plannerMessage.textContent = error.message;
  }
}

function renderAirportResults(airports) {
  elements.airportResults.replaceChildren();
  if (airports.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Kein passender Flughafen gefunden.';
    elements.airportResults.append(empty);
  }
  for (const airport of airports) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'airport-result';
    const distance = Number.isFinite(airport.distanceKm) ? ` · ${airport.distanceKm} km` : '';
    button.innerHTML = `<strong>${escapeHtml(airport.icao)}</strong><span>${escapeHtml(airport.name || airport.icao)}<small>${escapeHtml([airport.municipality, airport.country].filter(Boolean).join(', '))}${distance}</small></span>`;
    button.addEventListener('click', () => chooseAirport(airport));
    elements.airportResults.append(button);
  }
  elements.airportResults.hidden = false;
}

async function searchAirports(query) {
  const serial = ++plannerSearchSerial;
  elements.airportSearchSpinner.hidden = false;
  try {
    const response = await fetch(authenticatedUrl(`/api/airports/search?q=${encodeURIComponent(query)}`), { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Suche fehlgeschlagen.');
    if (serial === plannerSearchSerial) renderAirportResults(data.airports || []);
  } catch (error) {
    if (serial === plannerSearchSerial) elements.plannerMessage.textContent = error.message;
  } finally {
    if (serial === plannerSearchSerial) elements.airportSearchSpinner.hidden = true;
  }
}

function routeById(id = plannerState.selectedRouteId) {
  return plannerState.routes.find((route) => route.uiId === id) || null;
}

function renderPlanningOverlay() {
  layers.planning.clearLayers();
  const route = routeById();
  if (route?.path?.length > 1) {
    const points = route.path.map((point) => [point.lat, point.lon]);
    L.polyline(points, {
      pane: 'planningPreview',
      color: '#02131d',
      opacity: 0.88,
      weight: 10,
      lineCap: 'round',
      interactive: false,
    }).addTo(layers.planning);
    L.polyline(points, {
      pane: 'planningPreview',
      color: '#72e7d5',
      opacity: 0.94,
      weight: 4,
      dashArray: '10 7',
      lineCap: 'round',
      interactive: false,
    }).addTo(layers.planning);
  }
  for (const [key, label] of [['customStart', 'A'], ['customEnd', 'B']]) {
    const point = plannerState[key];
    if (!point) continue;
    L.marker([point.lat, point.lon], {
      pane: 'planningPreview',
      interactive: false,
      icon: L.divIcon({ className: 'planning-point-wrapper', html: `<span>${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
    }).addTo(layers.planning);
  }
}

function selectRoute(id, { fit = true } = {}) {
  plannerState.selectedRouteId = id;
  renderRouteOptions();
  renderPlanningOverlay();
  const route = routeById();
  elements.startGuidance.disabled = !route;
  if (fit && route?.path?.length > 1) {
    const bounds = L.latLngBounds(route.path.map((point) => [point.lat, point.lon]));
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 18.2, animate: true });
  }
}

function renderRouteOptions() {
  elements.routeOptions.replaceChildren();
  elements.routeCount.textContent = plannerState.routes.length > 0 ? `${plannerState.routes.length} GEFUNDEN` : '';
  if (plannerState.routes.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Wähle Flughafen und Ziel, um passende Routen zu berechnen.';
    elements.routeOptions.append(empty);
    elements.startGuidance.disabled = true;
    return;
  }
  for (const [index, route] of plannerState.routes.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `route-option${route.uiId === plannerState.selectedRouteId ? ' selected' : ''}`;
    const taxiwayText = route.taxiways?.length ? route.taxiways.join(' · ') : 'Direkte Taxiway-Verbindung';
    button.innerHTML = `<i>${index + 1}</i><span><strong>${escapeHtml(route.label)}</strong><small>${escapeHtml(taxiwayText)}</small></span><b>${escapeHtml(formatDistance(route.distanceMeters))}</b>`;
    button.addEventListener('click', () => selectRoute(route.uiId));
    elements.routeOptions.append(button);
  }
}

function planningRequest() {
  const mode = elements.plannerMode.value;
  if (mode === 'custom') {
    if (!plannerState.customStart || !plannerState.customEnd) throw new Error('Setze Start und Ziel auf der Karte.');
    return { mode, start: plannerState.customStart, destination: plannerState.customEnd };
  }
  const runway = elements.plannerRunway.value;
  if (!runway) throw new Error('Wähle eine Runway.');
  if (mode === 'departure') {
    const value = elements.plannerStart.value;
    if (!value) throw new Error('Wähle eine Startposition.');
    const holdingPoint = elements.plannerHoldingPoint.value || null;
    return { mode, runway, holdingPoint, start: value === 'aircraft' ? { type: 'aircraft' } : { type: 'feature', id: value } };
  }
  const destination = elements.plannerDestination.value;
  if (!destination) throw new Error('Wähle ein Gate oder einen Stand.');
  return { mode, runway, destination: { type: 'feature', id: destination } };
}

async function findTaxiRoutes() {
  elements.plannerMessage.textContent = '';
  let request;
  try {
    request = planningRequest();
  } catch (error) {
    elements.plannerMessage.textContent = error.message;
    return;
  }
  elements.findRoutes.disabled = true;
  elements.findRoutes.classList.add('loading');
  elements.findRoutes.textContent = 'ROUTEN WERDEN BERECHNET …';
  try {
    const response = await fetch(authenticatedUrl('/api/taxi-plan/routes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Keine Route gefunden.');
    plannerState.routes = (data.routes || []).map((route, index) => ({ ...route, uiId: `${route.id}-${index}` }));
    plannerState.selectedRouteId = plannerState.routes[0]?.uiId || null;
    renderRouteOptions();
    renderPlanningOverlay();
    elements.startGuidance.disabled = plannerState.routes.length === 0;
    elements.plannerMessage.textContent = plannerState.routes.length > 0
      ? 'Route wählen, auf der Karte prüfen und Guidance starten.'
      : 'Keine passende Route gefunden.';
  } catch (error) {
    plannerState.routes = [];
    plannerState.selectedRouteId = null;
    renderRouteOptions();
    elements.plannerMessage.textContent = error.message;
  } finally {
    elements.findRoutes.classList.remove('loading');
    elements.findRoutes.textContent = 'TAXIROUTEN BERECHNEN';
    updatePlannerControls();
  }
}

async function startPlannedGuidance() {
  const route = routeById();
  if (!route) return;
  const request = planningRequest();
  elements.startGuidance.disabled = true;
  try {
    const destination = request.mode === 'arrival' ? {
      id: request.destination.id,
      name: elements.plannerDestination.selectedOptions[0]?.textContent || 'Gate / Stand',
    } : null;
    const response = await fetch(authenticatedUrl('/api/taxi-plan/start'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ route, mode: request.mode, runway: request.runway || null, destination }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Guidance konnte nicht gestartet werden.');
    layers.planning.clearLayers();
    closePlanner();
  } catch (error) {
    elements.plannerMessage.textContent = error.message;
    elements.startGuidance.disabled = false;
  }
}

async function clearPlannedGuidance() {
  try {
    await fetch(authenticatedUrl('/api/taxi-plan/clear'), { method: 'POST' });
  } finally {
    plannerState.routes = [];
    plannerState.selectedRouteId = null;
    layers.planning.clearLayers();
    renderRouteOptions();
  }
}

function beginCustomPick(which) {
  plannerState.picking = which;
  closePlanner();
  document.body.classList.add('picking-map-point');
  mapStatus('attention', loadedAirportIcao, which === 'customStart' ? 'Startpunkt auf der Karte anklicken' : 'Zielpunkt auf der Karte anklicken');
}

async function maybeDeriveTaxiRoute() {
  const state = latestState;
  const clearance = state?.taxi?.clearance;
  if (!clearance?.text || (state.taxi?.path?.length ?? 0) > 1 || !loadedAirportMapData) return;
  if (loadedAirportMapData.icao !== airportTargetIcao(state)) return;
  const fingerprint = `${loadedAirportMapData.icao}|${clearance.id ?? clearance.time ?? ''}|${clearance.text}`;
  if (deriveAttempts.has(fingerprint)) return;
  deriveAttempts.add(fingerprint);
  const response = await fetch(authenticatedUrl('/api/taxi-route/derive'), { method: 'POST' });
  if (!response.ok) return;
  const data = await response.json();
  if (!data.applied) return;
  elements.plannerMessage.textContent = 'Taxiweg wurde aus der ATC-Freigabe und dem Airport-Netz abgeleitet.';
}

function phase3RouteLabel(route) {
  if (!route) return '—';
  const from = route.departureAirport || '—';
  const to = route.destinationAirport || '—';
  return `${from} → ${to}`;
}

function phase3StatusClass(value) {
  const status = String(value || '').toLowerCase();
  if (['ready', 'matched', 'stable', 'clear', 'complete', 'connected'].includes(status)) return 'connected';
  if (['attention', 'warning', 'critical', 'different', 'error'].includes(status)) return 'attention';
  return 'waiting';
}

function renderMsfsEfbBuilder(state) {
  if (!elements.msfsEfbBuilderStatus) return;
  const builder = state?.integrations?.msfsEfbBuilder || state?.builder || {};
  const status = String(builder.status || 'not-checked').toLowerCase();
  const ready = ['ready', 'built', 'installed'].includes(status);
  const attention = ['error'].includes(status);
  const className = ready ? 'connected' : attention ? 'attention' : 'waiting';
  elements.msfsEfbBuilderStatus.className = `module-status ${className}`;
  elements.msfsEfbBuilderStatus.textContent = status.replace(/-/g, ' ').toUpperCase();
  elements.msfsEfbBuilderDetail.textContent = builder.detail || 'MSFS 2024 SDK has not been checked yet.';
  elements.msfsEfbBuilderSdk.textContent = builder.sdkDetected || builder.sdk?.ready ? 'READY' : status === 'unsupported' ? 'WINDOWS ONLY' : 'NOT FOUND';
  elements.msfsEfbBuilderCommunity.textContent = builder.communityDetected || builder.communityDirectory ? 'READY' : 'NOT FOUND';
  const lastBuild = builder.lastBuild;
  elements.msfsEfbBuilderLast.textContent = lastBuild?.builtAt ? `${lastBuild.installed ? 'INSTALLED · ' : ''}${formatTime(lastBuild.builtAt) || 'BUILT'}` : '—';
  const progress = Math.max(0, Math.min(100, Number(builder.progressPercent) || 0));
  elements.msfsEfbBuilderProgress.style.width = `${progress}%`;
  const building = builder.building === true || status === 'building';
  elements.msfsEfbBuilderDetect.disabled = building;
  elements.msfsEfbBuilderBuild.disabled = building || builder.canBuild !== true;
  elements.msfsEfbBuilderInstall.disabled = building || builder.canInstall !== true;
  elements.msfsEfbBuilderOpen.disabled = building || !lastBuild;
  if (elements.settingsEfbBuilderDot) elements.settingsEfbBuilderDot.className = className;
  if (elements.settingsEfbBuilder) elements.settingsEfbBuilder.textContent = builder.detail || 'SDK wird geprüft';
  const active = document.activeElement;
  if (builder.configuredSdkRoot !== undefined && active !== elements.msfsEfbBuilderSdkPath) elements.msfsEfbBuilderSdkPath.value = builder.configuredSdkRoot || '';
  if (builder.configuredCommunityDirectory !== undefined && active !== elements.msfsEfbBuilderCommunityPath) elements.msfsEfbBuilderCommunityPath.value = builder.configuredCommunityDirectory || '';
}

async function requestMsfsEfbBuilder(action, { install = false } = {}) {
  const endpoint = action === 'detect' ? '/api/msfs-efb-builder/detect'
    : action === 'open' ? '/api/msfs-efb-builder/open-output' : '/api/msfs-efb-builder/build';
  const controls = [elements.msfsEfbBuilderDetect, elements.msfsEfbBuilderBuild, elements.msfsEfbBuilderInstall, elements.msfsEfbBuilderOpen].filter(Boolean);
  for (const control of controls) control.disabled = true;
  elements.msfsEfbBuilderMessage.textContent = action === 'open' ? 'Opening output …' : action === 'detect' ? 'Checking SDK …' : 'Building native EFB package …';
  try {
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
    if (action !== 'open') {
      const sdkRoot = elements.msfsEfbBuilderSdkPath.value.trim();
      const communityDirectory = elements.msfsEfbBuilderCommunityPath.value.trim();
      const body = { install };
      if (action === 'detect') {
        body.sdkRoot = sdkRoot;
        body.communityDirectory = communityDirectory;
      } else {
        if (sdkRoot) body.sdkRoot = sdkRoot;
        if (communityDirectory) body.communityDirectory = communityDirectory;
      }
      options.body = JSON.stringify(body);
    }
    const response = await fetch(authenticatedUrl(endpoint), options);
    const data = await response.json();
    if (data.builder) renderMsfsEfbBuilder({ integrations: { msfsEfbBuilder: data.builder } });
    if (!response.ok) throw new Error(data.error || 'MSFS EFB builder action failed.');
    elements.msfsEfbBuilderMessage.textContent = action === 'open' ? 'Output opened.' : data.builder?.detail || 'Done.';
  } catch (error) {
    elements.msfsEfbBuilderMessage.textContent = error.message;
  } finally {
    if (latestState) renderMsfsEfbBuilder(latestState);
  }
}

function renderPhase3(state) {
  renderMsfsEfbBuilder(state);
  const intelligence = state.integrations?.flightIntelligence || {};
  const routeSync = state.integrations?.routeSync || {};
  const turnaround = state.integrations?.turnaround || {};
  const assistant = state.integrations?.flightAssistant || {};

  if (elements.flightIntelligenceStatus) {
    elements.flightIntelligenceStatus.className = `module-status ${phase3StatusClass(intelligence.status)}`;
    elements.flightIntelligenceStatus.textContent = String(intelligence.status || 'waiting').toUpperCase();
    elements.flightIntelligencePhase.textContent = String(intelligence.phase || '—').toUpperCase();
    elements.flightIntelligenceRaw.textContent = String(intelligence.rawPhase || '—').toUpperCase();
    elements.flightIntelligenceConfidence.textContent = Number.isFinite(Number(intelligence.confidence)) ? `${Math.round(Number(intelligence.confidence) * 100)}%` : '—';
    elements.flightIntelligenceDetail.textContent = intelligence.detail || 'Waiting for simulator state.';
    elements.flightIntelligenceEvidence.textContent = (intelligence.evidence || []).join(' · ') || '—';
  }

  if (elements.routeSyncStatus) {
    elements.routeSyncStatus.className = `module-status ${phase3StatusClass(routeSync.status)}`;
    elements.routeSyncStatus.textContent = String(routeSync.status || 'waiting').replace(/-/g, ' ').toUpperCase();
    elements.routeSyncFlightdeck.textContent = phase3RouteLabel(routeSync.flightDeckRoute);
    elements.routeSyncMsfs.textContent = phase3RouteLabel(routeSync.msfsEfbRoute);
    elements.routeSyncMatch.textContent = Number.isFinite(Number(routeSync.comparison?.matchPercent)) ? `${Math.round(routeSync.comparison.matchPercent)}%` : '—';
    elements.routeSyncAvionics.textContent = routeSync.avionicsSync?.lastAt ? formatTime(routeSync.avionicsSync.lastAt) : '—';
    elements.routeSyncDetail.textContent = routeSync.detail || 'Open the native MSFS EFB app to compare routes.';
    elements.routeSyncDifferences.replaceChildren();
    for (const item of routeSync.comparison?.mismatches || []) {
      const row = document.createElement('span');
      row.innerHTML = `<b>${escapeHtml(String(item.field || 'route').toUpperCase())}</b><small>${escapeHtml(item.flightDeck || '—')} ↔ ${escapeHtml(item.msfsEfb || '—')}</small>`;
      elements.routeSyncDifferences.append(row);
    }
  }

  if (elements.turnaroundStatus) {
    elements.turnaroundStatus.className = `module-status ${phase3StatusClass(turnaround.status)}`;
    elements.turnaroundStatus.textContent = String(turnaround.status || 'waiting').toUpperCase();
    elements.turnaroundStage.textContent = String(turnaround.stage || '—').replace(/-/g, ' ').toUpperCase();
    const progress = Math.max(0, Math.min(100, Number(turnaround.progressPercent) || 0));
    elements.turnaroundProgress.textContent = `${Math.round(progress)}%`;
    elements.turnaroundProgressBar.style.width = `${progress}%`;
    elements.turnaroundDetail.textContent = turnaround.detail || 'Waiting for aircraft and ground-service state.';
    elements.turnaroundNext.textContent = turnaround.recommendedNext || '—';
    elements.turnaroundBlockers.replaceChildren();
    for (const blocker of turnaround.blockers || []) {
      const chip = document.createElement('span');
      chip.textContent = blocker;
      elements.turnaroundBlockers.append(chip);
    }
  }

  if (elements.homeAssistantStatus) {
    elements.homeAssistantStatus.className = `module-status ${phase3StatusClass(assistant.status)}`;
    elements.homeAssistantStatus.textContent = String(assistant.status || 'clear').toUpperCase();
    elements.homeAssistantDetail.textContent = assistant.detail || 'No operational advisories.';
    elements.homeAssistantList.replaceChildren();
    for (const item of assistant.advisories || []) {
      const row = document.createElement('article');
      row.className = `flight-assistant-item ${item.severity || 'info'}`;
      const copy = document.createElement('span');
      copy.innerHTML = `<strong>${escapeHtml(item.title || 'ADVISORY')}</strong><small>${escapeHtml(item.detail || '')}</small>`;
      row.append(copy);
      if (item.action && isAppEnabled(item.action)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'OPEN';
        button.addEventListener('click', () => switchModule(item.action));
        row.append(button);
      }
      elements.homeAssistantList.append(row);
    }
    if (!elements.homeAssistantList.childElementCount) elements.homeAssistantList.innerHTML = '<p class="empty-list">No active advisories.</p>';
  }

  if (elements.settingsIntelligenceDot) {
    setStatusDot(elements.settingsIntelligenceDot, intelligence.status === 'stable' ? 'ready' : intelligence.status);
    elements.settingsIntelligence.textContent = intelligence.detail || 'Automatic flight phase is waiting for data';
  }
  if (elements.settingsRouteSyncDot) {
    setStatusDot(elements.settingsRouteSyncDot, routeSync.status === 'ready' ? 'ready' : routeSync.status);
    elements.settingsRouteSync.textContent = routeSync.detail || 'Native MSFS EFB app not connected';
  }
}

function renderState(state) {
  renderPhase3(state);
  latestState = state;
  const flight = state.flight ?? {};
  const plannedAirport = state.planning?.selectedAirport;
  const planningAwayFromAircraft = plannedAirport
    && (!state.aircraft?.onGround || String(flight.currentAirport || '').toUpperCase() !== plannedAirport.icao);
  if (planningAwayFromAircraft && followAircraft) {
    followAircraft = false;
    syncFollowButton();
  }
  const planFlight = state.integrations?.simbrief?.flight || {};
  elements.callsign.textContent = flight.callsign || planFlight.callsign || '—';
  elements.origin.textContent = flight.origin || planFlight.origin || '—';
  elements.destination.textContent = plannedAirport?.icao || flight.destination || planFlight.destination || '—';
  const runway = state.taxi?.pathMetadata?.runway || flight.departureRunway || flight.arrivalRunway;
  elements.runway.textContent = `RWY ${runway || '—'}`;
  const selectedProvider = state.atc?.selectedProvider || 'auto';
  setConnectionChip(elements.siStatus, activeAtcConnection(state), atcProviderLabel(selectedProvider, { compact: true }));
  setConnectionChip(elements.simStatus, state.connections?.simConnect, 'MSFS');
  elements.emptySi.textContent = activeAtcConnection(state)?.detail || 'ATC-Quelle wird gesucht';
  elements.emptySim.textContent = state.connections?.simConnect?.detail || 'MSFS wird gesucht';
  elements.demoBadge.hidden = state.mode !== 'demo';

  renderClearance(state.taxi);
  renderGuidance(state);
  renderPath(state);
  renderGate(state.gate || state.taxi?.pathMetadata?.destination || null);
  renderAircraft(state.aircraft);
  renderSharing(state.sharing);
  renderEfb(state);
  refreshJourneyRecord().catch(() => {});
  loadAirportMap(state).catch(() => {});
  maybeDeriveTaxiRoute().catch(() => {});
  elements.emptyState.hidden = (state.taxi?.path?.length ?? 0) >= 2;
  if (elements.planDialog.open && plannedAirport && !plannerState.changingAirport) showSelectedAirport(plannedAirport);
}

async function validateToken(candidate) {
  if (!candidate) return false;
  token = candidate;
  const response = await fetch(authenticatedUrl('/api/state'), { cache: 'no-store' });
  if (!response.ok) return false;
  renderState(await response.json());
  return true;
}

function connectEvents() {
  eventSource?.close();
  eventSource = new EventSource(authenticatedUrl('/api/events'));
  eventSource.addEventListener('state', (event) => {
    try {
      renderState(JSON.parse(event.data));
    } catch {
      // Ignore a malformed update and keep the last valid state.
    }
  });
}

async function start() {
  const candidate = loadToken();
  try {
    if (await validateToken(candidate)) {
      elements.pairOverlay.hidden = true;
      connectEvents();
      afterAuthentication().catch(() => {});
    } else {
      localStorage.removeItem('si-taxi-token');
      token = null;
      elements.pairOverlay.hidden = false;
      setTimeout(() => elements.pinInput.focus(), 100);
    }
  } catch {
    elements.pairOverlay.hidden = false;
    elements.pairError.textContent = 'Windows-App ist nicht erreichbar.';
  }

  if ('serviceWorker' in navigator && !/Electron\//i.test(navigator.userAgent)) {
    navigator.serviceWorker.register('/service-worker.js?v=1.4.1', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch(() => {});
  }
}

elements.pairForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.pairError.textContent = '';
  try {
    const response = await fetch('/api/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pin: elements.pinInput.value.replace(/\D/g, ''),
        deviceName: /iPad/i.test(navigator.userAgent) ? 'iPad'
          : /Android/i.test(navigator.userAgent) ? 'Android tablet'
            : /Electron/i.test(navigator.userAgent) ? 'Windows app' : 'Web browser',
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Verbindung fehlgeschlagen.');
    token = data.token;
    localStorage.setItem('si-taxi-token', token);
    elements.pairOverlay.hidden = true;
    await validateToken(token);
    connectEvents();
    afterAuthentication().catch(() => {});
  } catch (error) {
    elements.pairError.textContent = error.message;
    elements.pinInput.select();
  }
});

elements.pinInput.addEventListener('input', () => {
  elements.pinInput.value = elements.pinInput.value.replace(/\D/g, '').slice(0, 6);
});

elements.followButton.addEventListener('click', () => {
  followAircraft = !followAircraft;
  syncFollowButton();
  if (followAircraft && latestState?.aircraft) {
    map.setView([latestState.aircraft.lat, latestState.aircraft.lon], Math.max(17, map.getZoom()), { animate: true });
  }
});

elements.fitButton.addEventListener('click', fitRoute);
elements.refreshMapButton.addEventListener('click', () => {
  if (latestState) loadAirportMap(latestState, { forceRefresh: true }).catch(() => {});
});
map.on('dragstart', () => {
  followAircraft = false;
  syncFollowButton();
});
map.on('click', (event) => {
  if (!plannerState.picking) return;
  const key = plannerState.picking;
  plannerState[key] = { lat: event.latlng.lat, lon: event.latlng.lng };
  plannerState.picking = null;
  document.body.classList.remove('picking-map-point');
  const coordinateText = `${event.latlng.lat.toFixed(5)}, ${event.latlng.lng.toFixed(5)}`;
  if (key === 'customStart') elements.customStartValue.textContent = coordinateText;
  else elements.customEndValue.textContent = coordinateText;
  renderPlanningOverlay();
  mapStatus('ready', loadedAirportIcao, 'Punkt gesetzt · Planung fortsetzen');
  setTimeout(openPlanner, 120);
});
map.on('zoomend', updateAirportLayerWidths);

elements.planButton.addEventListener('click', openPlanner);
elements.openPlanEmpty.addEventListener('click', openPlanner);
elements.plannerClose.addEventListener('click', closePlanner);
elements.changeAirport.addEventListener('click', () => {
  plannerState.changingAirport = true;
  showSelectedAirport(null);
  elements.airportSearch.value = '';
  elements.airportSearch.parentElement.hidden = false;
  elements.airportSearch.focus();
  searchAirports('').catch(() => {});
});
elements.airportSearch.addEventListener('input', () => {
  clearTimeout(plannerSearchTimer);
  const query = elements.airportSearch.value.trim();
  if (query.length < 2) {
    elements.airportResults.hidden = true;
    return;
  }
  plannerSearchTimer = setTimeout(() => searchAirports(query), 220);
});
elements.airportSearch.addEventListener('focus', () => {
  if (!elements.airportSearch.value.trim()) searchAirports('').catch(() => {});
});
elements.plannerMode.addEventListener('change', () => {
  plannerState.routes = [];
  plannerState.selectedRouteId = null;
  renderRouteOptions();
  renderPlanningOverlay();
  updatePlannerControls();
});
elements.plannerStart.addEventListener('change', () => {
  plannerState.startTouched = true;
});
elements.plannerRunway.addEventListener('change', () => {
  plannerState.routes = [];
  plannerState.selectedRouteId = null;
  renderRouteOptions();
  renderPlanningOverlay();
  updatePlannerControls();
});
elements.findRoutes.addEventListener('click', findTaxiRoutes);
elements.startGuidance.addEventListener('click', startPlannedGuidance);
elements.clearPlan.addEventListener('click', clearPlannedGuidance);
elements.pickCustomStart.addEventListener('click', () => beginCustomPick('customStart'));
elements.pickCustomEnd.addEventListener('click', () => beginCustomPick('customEnd'));

for (const button of document.querySelectorAll('[data-open-module]')) {
  button.addEventListener('click', () => switchModule(button.dataset.openModule));
}
elements.appHomeButton.addEventListener('click', () => switchModule('home'));
elements.homePlannerApp?.addEventListener('click', () => {
  switchModule('taxi');
  setTimeout(openPlanner, 80);
});
elements.homeOpenFlightHub.addEventListener('click', () => switchModule('flight'));
elements.homeSimbriefImport?.addEventListener('click', importSimBriefFromHome);
elements.simbriefQuickStart?.addEventListener('click', importSimBriefQuick);
elements.simbriefQuickIdentifier?.addEventListener('keydown', (event) => { if (event.key === 'Enter') importSimBriefQuick(); });
for (const button of elements.flightHubNavButtons || []) button.addEventListener('click', () => setFlightHubTab(button.dataset.flightHubTab));
for (const button of elements.settingsTabButtons || []) button.addEventListener('click', () => setSettingsTab(button.dataset.settingsTab));
for (const button of elements.atcTabButtons || []) button.addEventListener('click', () => setAtcTab(button.dataset.atcTab));
elements.homeNextStepAction.addEventListener('click', () => {
  const action = elements.homeNextStepAction.dataset.nextAction;
  if (action === 'setup') openOnboarding({ force: true });
  else if (action === 'settings' || action === 'diagnostics') {
    switchModule('settings');
    if (action === 'diagnostics') setTimeout(() => runDiagnostics(), 120);
  } else if (action === 'import') {
    switchModule('flight');
    setTimeout(() => importSimBrief(), 100);
  }
});
elements.focusModeButton.addEventListener('click', () => setFocusMode(!preferences.focusMode));
elements.reviewOpenItems.addEventListener('click', () => {
  elements.journeyChecklistCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  elements.phaseChecklistList.querySelector('button:not(.complete)')?.focus({ preventScroll: true });
});
elements.flightPhaseSelect.addEventListener('change', async () => {
  elements.flightPhaseSelect.disabled = true;
  try {
    await updateFlightOperations({ phaseOverride: elements.flightPhaseSelect.value });
  } catch (error) {
    elements.flightNotesStatus.textContent = error.message;
  } finally {
    elements.flightPhaseSelect.disabled = false;
  }
});

async function saveFlightNotes() {
  clearTimeout(flightNotesTimer);
  flightNotesTimer = null;
  flightOperationsSaving = true;
  elements.flightNotesStatus.textContent = t('saving');
  try {
    await updateFlightOperations({ notes: elements.flightNotes.value }, { status: t('saving') });
    elements.flightNotesStatus.textContent = t('saved');
  } catch (error) {
    elements.flightNotesStatus.textContent = error.message || t('saveFailed');
  } finally {
    flightOperationsSaving = false;
  }
}

elements.flightNotes.addEventListener('input', () => {
  flightOperationsSaving = true;
  elements.flightNotesStatus.textContent = t('saving');
  clearTimeout(flightNotesTimer);
  flightNotesTimer = setTimeout(saveFlightNotes, 550);
});
elements.flightNotes.addEventListener('blur', () => {
  if (flightNotesTimer) saveFlightNotes();
});
for (const button of elements.providerButtons) {
  button.addEventListener('click', () => selectAtcProvider(button.dataset.provider));
}
for (const button of elements.siMessageViewButtons) {
  button.addEventListener('click', () => {
    siMessageView = button.dataset.siMessageView === 'all' ? 'all' : 'recent';
    localStorage.setItem('flight-deck-si-message-view', siMessageView);
    if (latestState) renderAtcMessages(latestState);
  });
}
elements.applyManualClearance.addEventListener('click', applyManualClearance);
elements.manualClearanceInput.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') applyManualClearance();
});
elements.settingsShareButton.addEventListener('click', () => elements.shareButton.click());
for (const button of [elements.newFlightButton, elements.homeNewFlight, elements.settingsNewFlight, elements.warningNewFlight]) {
  button.addEventListener('click', openNewFlightDialog);
}
elements.confirmNewFlight.addEventListener('click', resetFlight);
saveSimbriefIdentifier(preferences.simbriefIdentifier);
elements.simbriefImport.addEventListener('click', importSimBrief);
elements.simbriefIdentifier.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') importSimBrief();
});
elements.simbriefIdentifier.addEventListener('change', () => saveSimbriefIdentifier(elements.simbriefIdentifier.value, { announce: true }));
elements.settingsSimbriefIdentifier.addEventListener('change', () => saveSimbriefIdentifier(elements.settingsSimbriefIdentifier.value, { announce: true }));
elements.settingsSimbriefIdentifier.addEventListener('blur', () => saveSimbriefIdentifier(elements.settingsSimbriefIdentifier.value, { announce: true }));
elements.onboardingSimbriefIdentifier.addEventListener('change', () => saveSimbriefIdentifier(elements.onboardingSimbriefIdentifier.value));
for (const button of elements.comActionButtons) button.addEventListener('click', () => handleComAction(button));
for (const input of [elements.com1FrequencyInput, elements.com2FrequencyInput]) {
  input.addEventListener('input', () => { input.value = input.value.replace(',', '.').replace(/[^0-9.]/g, '').slice(0, 7); });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const radio = input === elements.com1FrequencyInput ? '1' : '2';
    elements.comActionButtons.find((button) => button.dataset.com === radio && button.dataset.comAction === 'set' && button.dataset.mode === 'standby')?.click();
  });
}
for (const button of elements.flightboardTabs) {
  button.addEventListener('click', () => {
    trafficBoardView = button.dataset.trafficView;
    if (latestState) renderFlightboard(latestState);
  });
}
elements.flightboardRefresh.addEventListener('click', async () => {
  elements.flightboardRefresh.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/traffic/refresh'), { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t('trafficRefreshFailed'));
    elements.flightboardUpdated.textContent = t('refreshRequested');
  } catch (error) {
    elements.flightboardUpdated.textContent = error.message;
  } finally {
    setTimeout(() => { elements.flightboardRefresh.disabled = false; }, 1_000);
  }
});
elements.navigraphLogin.addEventListener('click', beginNavigraphLogin);
elements.navigraphLogout.addEventListener('click', logoutNavigraph);
elements.gsxRefresh.addEventListener('click', refreshGsx);
elements.gsxPayloadSync?.addEventListener('click', syncGsxPayload);
elements.aircraftAdapterRefresh?.addEventListener('click', refreshAircraftAdapter);
elements.runDiagnostics.addEventListener('click', () => runDiagnostics());
elements.downloadSupport.addEventListener('click', async () => {
  elements.downloadSupport.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/support-bundle'), { cache: 'no-store' });
    await downloadResponse(response, 'Flight-Deck-EFB-Support.json');
  } catch (error) {
    elements.diagnosticsStatus.textContent = error.message;
  } finally {
    elements.downloadSupport.disabled = false;
  }
});
elements.sharingEnabled.addEventListener('change', async () => {
  const requested = elements.sharingEnabled.checked;
  elements.sharingEnabled.disabled = true;
  try {
    const response = await fetch(authenticatedUrl('/api/sharing'), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: requested }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sharing setting could not be changed.');
    elements.sharingEnabled.checked = data.enabled;
    await refreshDevices();
  } catch (error) {
    elements.sharingEnabled.checked = !requested;
    elements.pairedDeviceList.innerHTML = `<p class="empty-list">${escapeHtml(error.message)}</p>`;
  } finally {
    elements.sharingEnabled.disabled = deviceManagementAvailable === false;
  }
});
elements.pairedDeviceList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-revoke-device]');
  if (!button) return;
  button.disabled = true;
  const response = await fetch(authenticatedUrl(`/api/devices/${encodeURIComponent(button.dataset.revokeDevice)}`), { method: 'DELETE' });
  if (response.ok) await refreshDevices();
  else button.disabled = false;
});
elements.simbriefAutoImport.addEventListener('change', () => {
  preferences.simbriefAutoImport = elements.simbriefAutoImport.checked;
  localStorage.setItem('flight-deck-simbrief-auto-import', String(preferences.simbriefAutoImport));
  elements.onboardingSimbriefAuto.checked = preferences.simbriefAutoImport;
});
elements.destinationPrefetch.addEventListener('change', () => {
  preferences.destinationPrefetch = elements.destinationPrefetch.checked;
  localStorage.setItem('flight-deck-destination-prefetch', String(preferences.destinationPrefetch));
});
elements.weatherRefresh.addEventListener('click', refreshOfficialWeather);
elements.exportBackup.addEventListener('click', exportBackup);
elements.importBackup.addEventListener('click', () => elements.backupFile.click());
elements.backupFile.addEventListener('change', () => {
  const file = elements.backupFile.files?.[0];
  if (file) importBackupFile(file);
});
elements.onboardingLater.addEventListener('click', () => {
  localStorage.setItem('flight-deck-onboarding-v2', 'dismissed');
  elements.onboardingDialog.close?.();
  if (latestState) renderHomeNextStep(latestState);
});
elements.onboardingBack.addEventListener('click', () => showOnboardingStep(onboardingStep - 1));
elements.onboardingNext.addEventListener('click', () => {
  if (onboardingStep === 1) saveOnboardingDisplay();
  if (onboardingStep === 2) saveOnboardingSimbrief();
  showOnboardingStep(onboardingStep + 1);
});
elements.onboardingFinish.addEventListener('click', () => {
  saveOnboardingDisplay();
  saveOnboardingSimbrief();
  localStorage.setItem('flight-deck-onboarding-v2', 'complete');
  elements.onboardingDialog.close?.();
  if (latestState) renderHomeNextStep(latestState);
});
elements.openSetupAssistant.addEventListener('click', () => openOnboarding({ force: true }));
elements.openLegal.addEventListener('click', () => {
  if (typeof elements.legalDialog.showModal === 'function') elements.legalDialog.showModal();
  else elements.legalDialog.setAttribute('open', '');
});
elements.msfsEfbBuilderDetect?.addEventListener('click', () => requestMsfsEfbBuilder('detect'));
elements.msfsEfbBuilderBuild?.addEventListener('click', () => requestMsfsEfbBuilder('build'));
elements.msfsEfbBuilderInstall?.addEventListener('click', () => {
  if (!window.confirm('Flight Deck EFB jetzt bauen und in Community2024 installieren? Ein vorhandenes Flight-Deck-Paket wird ersetzt.')) return;
  requestMsfsEfbBuilder('build', { install: true });
});
elements.msfsEfbBuilderOpen?.addEventListener('click', () => requestMsfsEfbBuilder('open'));
elements.checkUpdate.addEventListener('click', () => checkForUpdate());
elements.updateDialogDownload?.addEventListener('click', downloadAvailableUpdate);
elements.updateDialogInstall?.addEventListener('click', installDownloadedUpdate);
elements.installUpdate.addEventListener('click', installDownloadedUpdate);
for (const button of elements.networkButtons) {
  button.addEventListener('click', () => refreshOnlineNetwork(button.dataset.network));
}
elements.onlineRefresh.addEventListener('click', () => refreshOnlineNetwork());
for (const button of elements.trackingBasemapButtons) {
  button.addEventListener('click', () => setTrackingBasemap(button.dataset.trackingBasemap));
}
elements.trackingFollow.addEventListener('click', () => {
  trackingFollowAircraft = !trackingFollowAircraft;
  elements.trackingFollow.classList.toggle('active', trackingFollowAircraft);
  if (trackingFollowAircraft && latestState?.aircraft && trackingMap) {
    trackingMap.setView([latestState.aircraft.lat, latestState.aircraft.lon], Math.max(latestState.aircraft.onGround ? 13.5 : 7.5, trackingMap.getZoom()), { animate: true });
  }
});
elements.trackingFit.addEventListener('click', () => {
  trackingFollowAircraft = false;
  elements.trackingFollow.classList.remove('active');
  fitTrackingFlight();
});
elements.trackingStart?.addEventListener('click', startFlightRecording);
elements.trackingSave.addEventListener('click', saveCurrentFlight);
elements.trackingLive.addEventListener('click', showLiveTracking);
elements.trackingDelete.addEventListener('click', deleteTrackedFlight);
elements.fenixConnect.addEventListener('click', connectFenix);
elements.fenixEmbed.addEventListener('click', embedFenix);
elements.fenixUrl.addEventListener('input', () => {
  elements.fenixOpen.href = elements.fenixUrl.value.trim() || 'http://127.0.0.1:8083/';
});
elements.automationMode.addEventListener('change', async () => {
  const requested = elements.automationMode.value;
  if (requested === 'armed' && !window.confirm(t('automationArmConfirm'))) {
    elements.automationMode.value = automationState().mode;
    return;
  }
  elements.automationMode.disabled = true;
  try {
    await saveAutomationConfiguration({ mode: requested });
  } catch (error) {
    elements.automationFormMessage.textContent = error.message;
    elements.automationMode.value = automationState().mode;
  } finally {
    elements.automationMode.disabled = false;
  }
});
elements.automationTriggerType.addEventListener('change', populateAutomationTriggerOptions);
elements.automationActionType.addEventListener('change', populateAutomationTargets);
elements.automationAddVariable.addEventListener('click', async () => {
  const name = elements.automationVariableName.value.trim();
  if (!name) {
    elements.automationFormMessage.textContent = t('variableNameRequired');
    return;
  }
  elements.automationAddVariable.disabled = true;
  try {
    const current = automationState();
    const configuration = await saveAutomationConfiguration({ variables: [...current.variables, {
      label: elements.automationVariableLabel.value.trim() || name,
      name,
      unit: elements.automationVariableUnit.value.trim() || 'number',
    }] });
    if (configuration.variables.length <= current.variables.length) throw new Error(t('variableNameRequired'));
    elements.automationVariableLabel.value = '';
    elements.automationVariableName.value = '';
    elements.automationFormMessage.textContent = t('saved');
  } catch (error) {
    elements.automationFormMessage.textContent = error.message;
  } finally {
    elements.automationAddVariable.disabled = false;
  }
});
elements.automationAddRule.addEventListener('click', async () => {
  const triggerValue = elements.automationTriggerValue.value;
  const actionTarget = elements.automationActionTarget.value.trim();
  if (!triggerValue || !actionTarget) {
    elements.automationFormMessage.textContent = t('ruleFieldsRequired');
    return;
  }
  elements.automationAddRule.disabled = true;
  try {
    const current = automationState();
    const rules = [...current.rules, {
      name: elements.automationRuleName.value.trim() || `${appLabel(triggerValue)} → ${actionTarget}`,
      enabled: true,
      triggerType: elements.automationTriggerType.value,
      triggerValue,
      operator: elements.automationOperator.value,
      comparisonValue: Number(elements.automationComparisonValue.value),
      actionType: elements.automationActionType.value,
      actionTarget,
      actionValue: Number(elements.automationActionValue.value),
      cooldownSeconds: Number(elements.automationCooldown.value),
      requireOnGround: elements.automationGroundGuard.value,
      maxGroundSpeed: elements.automationMaxSpeed.value === '' ? null : Number(elements.automationMaxSpeed.value),
      aircraftMatch: elements.automationAircraftMatch.value.trim(),
    }];
    const configuration = await saveAutomationConfiguration({ rules });
    if (configuration.rules.length <= current.rules.length) throw new Error(t('invalidAutomationRule'));
    elements.automationRuleName.value = '';
    elements.automationActionTarget.value = '';
    elements.automationMaxSpeed.value = '';
    elements.automationAircraftMatch.value = '';
    elements.automationFormMessage.textContent = t('saved');
  } catch (error) {
    elements.automationFormMessage.textContent = error.message;
  } finally {
    elements.automationAddRule.disabled = false;
  }
});
elements.languageSelect.addEventListener('change', () => {
  preferences.language = elements.languageSelect.value;
  localStorage.setItem('flight-deck-language', preferences.language);
  applyPreferences();
  applyAppLayout();
  if (latestState) renderEfb(latestState);
  if (trackingViewedFlight) renderTrackingRecord(trackingViewedFlight);
});
elements.themeSelect.addEventListener('change', () => {
  preferences.theme = elements.themeSelect.value;
  localStorage.setItem('flight-deck-theme', preferences.theme);
  applyPreferences();
});
elements.quickThemeToggle.addEventListener('click', () => {
  preferences.theme = resolvedTheme() === 'light' ? 'dark' : 'light';
  localStorage.setItem('flight-deck-theme', preferences.theme);
  applyPreferences();
});
elements.displayName?.addEventListener('change', () => {
  preferences.displayName = String(elements.displayName.value || '').trim().slice(0, 40);
  localStorage.setItem('flight-deck-display-name', preferences.displayName);
  applyPreferences();
});
elements.showHelpTexts?.addEventListener('change', () => {
  preferences.showHelpTexts = elements.showHelpTexts.checked;
  localStorage.setItem('flight-deck-show-help-texts', String(preferences.showHelpTexts));
  applyPreferences();
});
elements.textSizeSelect.addEventListener('change', () => {
  preferences.textSize = elements.textSizeSelect.value;
  localStorage.setItem('flight-deck-text-size', preferences.textSize);
  applyPreferences();
});
elements.weightUnitSelect.addEventListener('change', () => {
  preferences.weightUnit = elements.weightUnitSelect.value === 'lb' ? 'lb' : 'kg';
  localStorage.setItem('flight-deck-weight-unit', preferences.weightUnit);
  if (latestState) renderEfb(latestState);
  if (trackingViewedFlight) renderTrackingRecord(trackingViewedFlight);
});
elements.distanceUnitSelect.addEventListener('change', () => {
  preferences.distanceUnit = elements.distanceUnitSelect.value === 'km' ? 'km' : 'nm';
  localStorage.setItem('flight-deck-distance-unit', preferences.distanceUnit);
  if (latestState) renderEfb(latestState);
  if (trackingViewedFlight) renderTrackingRecord(trackingViewedFlight);
});
elements.pressureUnitSelect.addEventListener('change', () => {
  preferences.pressureUnit = elements.pressureUnitSelect.value === 'inhg' ? 'inhg' : 'hpa';
  localStorage.setItem('flight-deck-pressure-unit', preferences.pressureUnit);
  if (latestState) renderEfb(latestState);
});
elements.temperatureUnitSelect.addEventListener('change', () => {
  preferences.temperatureUnit = elements.temperatureUnitSelect.value === 'f' ? 'f' : 'c';
  localStorage.setItem('flight-deck-temperature-unit', preferences.temperatureUnit);
  if (latestState) renderEfb(latestState);
});
elements.clockFormatSelect.addEventListener('change', () => {
  preferences.clockFormat = elements.clockFormatSelect.value === '12' ? '12' : '24';
  localStorage.setItem('flight-deck-clock-format', preferences.clockFormat);
  if (latestState) renderEfb(latestState);
  if (trackingViewedFlight) renderTrackingRecord(trackingViewedFlight);
});
elements.applyPilotProfile?.addEventListener('click', applySelectedPilotProfile);
elements.alertModeSelect.addEventListener('change', () => {
  preferences.alertMode = ['normal', 'visual', 'off'].includes(elements.alertModeSelect.value)
    ? elements.alertModeSelect.value : 'normal';
  localStorage.setItem('flight-deck-alert-mode', preferences.alertMode);
  if (latestState) renderFlightJourney(latestState);
});
elements.arrivalTriggerSelect.addEventListener('change', () => {
  preferences.arrivalTriggerNm = Number(elements.arrivalTriggerSelect.value) || 150;
  localStorage.setItem('flight-deck-arrival-trigger', String(preferences.arrivalTriggerNm));
  if (latestState) renderFlightJourney(latestState);
});
elements.fuelBufferSelect.addEventListener('change', () => {
  preferences.fuelBufferPounds = Number(elements.fuelBufferSelect.value) || 0;
  localStorage.setItem('flight-deck-fuel-buffer', String(preferences.fuelBufferPounds));
  if (latestState) renderFlightJourney(latestState);
});
elements.focusModeDefault.addEventListener('change', () => setFocusMode(elements.focusModeDefault.checked));
elements.showPhaseHome.addEventListener('change', () => {
  preferences.showPhaseHome = elements.showPhaseHome.checked;
  localStorage.setItem('flight-deck-show-phase-home', String(preferences.showPhaseHome));
  elements.homePhaseCard.hidden = !preferences.showPhaseHome;
});
elements.resetAppLayout.addEventListener('click', () => {
  appLayout = { order: [...DEFAULT_APP_ORDER], hidden: [] };
  markPilotProfileCustom();
  saveAppLayout();
  applyAppLayout();
  if (latestState) renderFlightJourney(latestState);
});

elements.shareButton.addEventListener('click', () => {
  if (typeof elements.shareDialog.showModal === 'function') elements.shareDialog.showModal();
  else elements.shareDialog.setAttribute('open', '');
});

elements.fullscreenButton.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {
    // Fullscreen is optional on some mobile browsers.
  }
});

window.addEventListener('resize', () => {
  map.invalidateSize();
  trackingMap?.invalidateSize();
});
renderRouteOptions();
applyAppLayout();
switchModule('home');
start();
