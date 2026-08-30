(() => {
  'use strict';
  const qs=(s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];

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
      if(small)small.textContent=meta[0];
      if(strong)strong.textContent=meta[1];
      if(detail)detail.textContent=meta[2];
    });
  }

  function removeNewsNavigation(){
    qsa('[data-app-id="news"], [data-open-module="news"]').forEach(node=>node.remove());
  }

  function removeGateAssignment(){
    qsa('.fd122-briefing-nav button, .fd122-brief-section, .fd122-brief-card').forEach(node=>{
      if(/gate\s*assignment/i.test(node.textContent||'')) node.remove();
    });
  }

  function removeWrongContextNavigation(){qsa('.fd123-context-actions').forEach(n=>n.remove());}

  function updateTaxiEmptyState(){
    const stage=qs('.map-stage'); if(!stage)return;
    const empty=qs('#empty-state');
    const noRoute=Boolean(empty && !empty.hidden && getComputedStyle(empty).display!=='none');
    stage.classList.toggle('fd124-no-route',noRoute);
  }

  function enforceToolbarContext(){
    const toolbar=qs('#app-toolbar'); const plan=qs('#plan-button');
    if(!toolbar||!plan)return;
    const taxiVisible=!qs('.map-stage')?.hidden;
    plan.hidden=!taxiVisible;
  }

  function refresh(){normalizeHome();removeNewsNavigation();removeGateAssignment();removeWrongContextNavigation();updateTaxiEmptyState();enforceToolbarContext();}
  refresh();
  let scheduled=false;
  new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
  window.FlightDeckUI124={refresh};
})();
