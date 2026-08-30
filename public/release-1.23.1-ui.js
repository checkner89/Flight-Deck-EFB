(() => {
  'use strict';
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const setText=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};

  const HOME_LABELS={
    flight:['FLIGHT OPERATIONS','Flug & Tracking','Flugstatus, Live-Daten, Route und Archiv'],
    briefing:['PREFLIGHT','Briefing','OFP, Wetter, NOTAMs, Runways und Readiness'],
    taxi:['GROUND NAVIGATION','Taxi','Taxiweg planen und Guidance starten'],
    com:['RADIO','COM','Aktive und Standby-Frequenzen'],
    atc:['ATC','ATC & Networks','SayIntentions, BeyondATC, VATSIM und IVAO'],
    flightboard:['TRAFFIC','Traffic','Verkehr in der Umgebung und am Flughafen'],
    ground:['TURNAROUND','Ground Services','GSX-Status und relevante Bodenservices'],
    fenix:['AIRCRAFT','Aircraft Adapters','Flugzeugspezifische lokale Integrationen'],
    automations:['ASSISTANCE','Automationen','Kontextbezogene Simulator-Aktionen'],
    files:['DOCUMENTS','Dokumente','OFP und Briefing-Unterlagen'],
    settings:['SYSTEM','Einstellungen','Verbindungen, Darstellung und Geräte'],
  };

  function normalizeHome(){
    qsa('.app-launcher-grid .efb-app-tile[data-app-id]').forEach(tile=>{
      const meta=HOME_LABELS[tile.dataset.appId];
      if(!meta)return;
      const copy=qs('.app-tile-copy',tile); if(!copy)return;
      const small=qs('small',copy), strong=qs('strong',copy), detail=copy.querySelector(':scope > span');
      setText(small,meta[0]);
      setText(strong,meta[1]);
      setText(detail,meta[2]);
    });
  }

  // Keep the nodes in the DOM because the established app runtime owns their event handlers.
  // Visibility is handled in CSS so hiding News cannot break startup bindings.
  function removeNewsNavigation(){
    qsa('[data-app-id="news"], [data-open-module="news"]').forEach(node=>{
      if(node.dataset.fd1231Suppressed!=='true')node.dataset.fd1231Suppressed='true';
    });
  }

  // The release materializer removes Gate / Stand from the briefing source. This is a defensive
  // fallback for dynamically supplied Gate Assignment blocks and never removes DOM nodes.
  function removeGateAssignment(){
    qsa('.fd122-briefing-nav button, .fd122-brief-section, .fd122-brief-card').forEach(node=>{
      if(/gate\s*assignment/i.test(node.textContent||'')&&!node.hidden)node.hidden=true;
    });
  }

  // Existing 1.22.1 context actions remain mounted for runtime compatibility and are hidden by CSS.
  function removeWrongContextNavigation(){
    qsa('.fd123-context-actions').forEach(node=>{
      if(node.dataset.fd1231Suppressed!=='true')node.dataset.fd1231Suppressed='true';
    });
  }

  function updateTaxiEmptyState(){
    const stage=qs('.map-stage'); if(!stage)return;
    const empty=qs('#empty-state');
    const noRoute=Boolean(empty && !empty.hidden && getComputedStyle(empty).display!=='none');
    if(stage.classList.contains('fd124-no-route')!==noRoute)stage.classList.toggle('fd124-no-route',noRoute);
  }

  function enforceToolbarContext(){
    const toolbar=qs('#app-toolbar'); const plan=qs('#plan-button');
    if(!toolbar||!plan)return;
    const taxiVisible=!qs('.map-stage')?.hidden;
    const shouldHide=!taxiVisible;
    if(plan.hidden!==shouldHide)plan.hidden=shouldHide;
  }

  function refresh(){normalizeHome();removeNewsNavigation();removeGateAssignment();removeWrongContextNavigation();updateTaxiEmptyState();enforceToolbarContext();}
  refresh();
  let scheduled=false;
  new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;refresh();});
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
  window.FlightDeckUI124={refresh};
})();
