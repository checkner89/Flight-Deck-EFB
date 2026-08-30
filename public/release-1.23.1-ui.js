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

  // News and cross-module context actions stay mounted because established runtimes own them.
  // Their visibility is handled exclusively by CSS to avoid layout/runtime tug-of-war.
  function removeNewsNavigation(){}
  function removeWrongContextNavigation(){}

  function removeGateAssignment(){
    qsa('.fd122-briefing-nav button, .fd122-brief-section, .fd122-brief-card').forEach(node=>{
      if(/gate\s*assignment/i.test(node.textContent||'')&&!node.hidden)node.hidden=true;
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

  // Home copy is normalized once. Re-running it from a body-wide observer would compete with
  // established translation/state renderers and cause hundreds of needless character mutations.
  normalizeHome();

  function refreshOperationalContext(){
    removeGateAssignment();
    updateTaxiEmptyState();
    enforceToolbarContext();
  }
  refreshOperationalContext();

  let scheduled=false;
  new MutationObserver(()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;refreshOperationalContext();});
  }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});

  window.FlightDeckUI124={refresh:refreshOperationalContext,normalizeHome};
})();
