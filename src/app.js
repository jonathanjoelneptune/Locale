import {CONFIG} from "./config.js";
import {Header} from "./components/header.js";
import {Filters} from "./components/filters.js";
import {DateControls,todayKey,addDays} from "./components/dateControls.js";
import {AreaFilter} from "./components/areaFilter.js";
import {renderSidebar} from "./components/sidebar.js";
import {createMap} from "./components/map.js";
import {EventDetail} from "./components/eventDetail.js";
import {loadEvents} from "./providers/index.js";
import {filterEvents,hasPreciseLocation,eventMatchesTimeAndCategory} from "./services/events.js";
import {annotateEventsWithAreas,countEventsByArea,createAreaLookup} from "./services/areas.js";
import {loadAreaGeometry} from "./data/areaGeometry.js";
import {rankHighlights} from "./services/highlights.js";
import {geocode} from "./services/geocode.js";
import {ensureLeaflet} from "./services/leaflet.js";

const saved=new Set(JSON.parse(localStorage.getItem("locale-saved")||"[]"));
const selectedAreas=new Set(JSON.parse(localStorage.getItem("locale-selected-areas")||"[]"));
const today=todayKey();
const state={
  center:{...CONFIG.defaultCenter},
  placeLabel:CONFIG.defaultPlaceLabel,
  radius:CONFIG.defaultRadiusMiles,
  zoom:CONFIG.defaultZoom,
  dateStart:today,
  dateEnd:today,
  dateMode:"single",
  quickPreset:null,
  calendarOpen:false,
  calendarMonth:today.slice(0,7),
  rangeAnchor:null,
  categories:new Set,
  selectedAreaIds:selectedAreas,
  areaFeatures:[],
  areaNameById:{},
  areaQuery:"",
  areaExpanded:false,
  areaFitPending:false,
  areasReady:false,
  areaRevision:0,
  events:[],
  hasFit:false,
  sort:"time",
  listMode:"events",
  saved,
  venueFilter:null,
  resultScope:"nearby",
  viewport:null,
  mapStyle:["standard","humanitarian","satellite"].includes(localStorage.getItem("locale-map-style"))?localStorage.getItem("locale-map-style"):"standard"
};

const root=document.querySelector("#app");
root.innerHTML=`<div id="eventDetailRoot"></div>
<div id="splash" class="locale-splash"><div class="splash-mark">⌖</div><strong>Locale</strong><span>Finding what’s happening around you…</span></div>
<div class="shell dual-shell">
  <aside class="discovery-panel discovery-left">
    <div class="discovery-controls">
      ${Header()}
      <section class="radius-panel">
        <div class="radius-title"><span id="placeLabel">${state.placeLabel}</span><strong id="radiusLabel">${state.radius} miles</strong></div>
        <input id="radius" type="range" min="5" max="50" step="5" value="${state.radius}">
        <div class="radius-ticks"><span>5</span><span>15</span><span>25</span><span>35</span><span>50</span></div>
        <small id="radiusAreaNote" class="radius-area-note">Radius resumes when selected areas are cleared.</small>
      </section>
      <div id="areaControls"></div>
      <div id="dateControls"></div>
    </div>
  </aside>
  <button id="discoveryToggle" class="edge-toggle discovery-toggle-left" type="button" aria-label="Toggle search controls"><span class="drawer-arrow">‹</span><span class="drawer-label">Search</span></button>
  <main class="map-stage">
    <div id="map" class="map"></div>
    <button id="useMapCenter" class="search-area-button" type="button">⟳ &nbsp; Search This Area</button>
    <button id="clearAreaSelectionMap" class="clear-area-map-button" type="button" hidden>Show all San Diego</button>
    <div class="map-radius-label" id="mapRadiusLabel">${state.radius} miles</div>
    <div class="map-style-picker"><label>MAP</label><select id="mapStyle"><option value="standard">Standard</option><option value="humanitarian">Humanitarian</option><option value="satellite">Satellite</option></select></div>
  </main>
  <button id="resultsToggle" class="edge-toggle results-toggle-right" type="button" aria-label="Toggle event panel"><span class="drawer-arrow">›</span><span class="drawer-label">Events</span><span id="resultsRailCount">0</span></button>
  <aside class="event-rail event-right">
    <div id="filters" class="filters-panel event-filters"></div>
    <aside id="sidebar" class="sidebar results-panel results-right"></aside>
  </aside>
  <section class="highlights compact-highlights">
    <div class="highlight-heading"><div class="highlight-title-row"><strong>Highlights</strong><span>Top events in your selected dates and search area</span></div><button id="viewAllHighlights" type="button">View All →</button></div>
    <div id="highlightCards" class="highlight-cards"></div>
  </section>
</div>`;

let mapUI=null;
const mapEl=document.querySelector("#map");
mapEl.innerHTML=`<div class="map-loading">Map starting…</div>`;

function finishSplash(){
  const splash=document.querySelector("#splash");
  splash?.classList.add("is-done");
  setTimeout(()=>splash?.remove(),350);
}

function initMapLater(){
  const failTimer=setTimeout(()=>{
    if(!mapUI)mapEl.innerHTML=`<div class="map-error"><strong>Map taking too long</strong><span>Events are still available in the list.</span><button id="retryMap" type="button">Retry map</button></div>`;
    document.querySelector("#retryMap")?.addEventListener("click",()=>initMapLater());
  },3500);
  setTimeout(async()=>{
    try{
      await ensureLeaflet(2000);
      clearTimeout(failTimer);
      if(mapUI)return;
      mapEl.innerHTML="";
      mapUI=createMap(
        mapEl,
        state,
        (center,zoom)=>{
          state.center=center;
          state.zoom=zoom;
          state.venueFilter=null;
          state.resultScope="nearby";
          state.viewport=null;
          render();
        },
        handleMapMarker,
        ()=>{
          if(state.venueFilter){
            state.venueFilter=null;
            state.hasFit=true;
            render();
          }else{
            document.querySelectorAll(".card.selected").forEach(x=>x.classList.remove("selected"));
            mapUI?.selectEvent("__none__");
          }
        },
        viewport=>{
          state.zoom=viewport.zoom;
          state.viewport=viewport.bounds;
          state.resultScope="viewport";
          state.venueFilter=null;
          render();
        },
        handleMapArea
      );
      state.hasFit=false;
      render();
    }catch(error){
      clearTimeout(failTimer);
      mapEl.innerHTML=`<div class="map-error"><strong>Map unavailable</strong><span>Events are still available in the list.</span><button id="retryMap" type="button">Retry map</button></div>`;
      document.querySelector("#retryMap")?.addEventListener("click",()=>initMapLater());
      console.error(error);
    }
  },0);
}

function inViewport(event,bounds){
  if(!bounds||!hasPreciseLocation(event))return false;
  const lat=Number(event.lat),lng=Number(event.lng);
  const latitudeOk=lat>=bounds.south&&lat<=bounds.north;
  const longitudeOk=bounds.west<=bounds.east
    ?lng>=bounds.west&&lng<=bounds.east
    :lng>=bounds.west||lng<=bounds.east;
  return latitudeOk&&longitudeOk;
}

function currentEventView(){
  const nearby=filterEvents(state.events,state);
  let visible=state.resultScope==="viewport"&&state.viewport
    ?nearby.filter(event=>inViewport(event,state.viewport))
    :nearby;
  if(state.venueFilter)visible=visible.filter(event=>state.venueFilter.ids.includes(event.id));
  return {nearby,visible};
}

let areaCountCache={key:"",counts:new Map};

function currentAreaCounts(){
  const key=[
    state.areaRevision,
    state.events.length,
    state.dateStart,
    state.dateEnd,
    state.quickPreset||"",
    [...state.categories].sort().join(",")
  ].join("|");
  if(areaCountCache.key===key)return areaCountCache.counts;
  areaCountCache={
    key,
    counts:countEventsByArea(state.events,{predicate:event=>eventMatchesTimeAndCategory(event,state)})
  };
  return areaCountCache.counts;
}

function renderAreaControls(){
  const target=document.querySelector("#areaControls");
  if(!target)return;
  if(!state.areasReady){
    target.innerHTML='<section class="area-filter area-filter-loading"><div class="filter-heading"><span>AREAS</span></div><div class="area-loading">Loading mapped areas…</div></section>';
    return;
  }
  target.innerHTML=AreaFilter(state,state.areaFeatures,currentAreaCounts());
  bindAreaControls();
}

function renderSidebarFromState(){
  const {visible}=currentEventView();
  const count=document.querySelector("#resultsRailCount");
  if(count)count.textContent=visible.length;
  renderSidebar(document.querySelector("#sidebar"),visible,state);
}

function render(){
  document.querySelector("#dateControls").innerHTML=DateControls(state);
  document.querySelector("#filters").innerHTML=Filters(state);
  document.querySelector("#placeLabel").textContent=state.placeLabel;
  renderAreaControls();

  const areaMode=state.selectedAreaIds.size>0;
  document.querySelector(".radius-panel")?.classList.toggle("area-mode",areaMode);
  const mapRadiusLabel=document.querySelector("#mapRadiusLabel");
  if(mapRadiusLabel)mapRadiusLabel.hidden=areaMode;
  const clearAreaMap=document.querySelector("#clearAreaSelectionMap");
  if(clearAreaMap)clearAreaMap.hidden=!areaMode;

  const {nearby,visible}=currentEventView();
  const count=document.querySelector("#resultsRailCount");
  if(count)count.textContent=visible.length;
  renderSidebar(document.querySelector("#sidebar"),visible,state);

  mapUI?.setAreas(state.areaFeatures,state.selectedAreaIds);
  mapUI?.setRadius(state.radius,state.center,{visible:!areaMode});
  mapUI?.renderEvents(visible);

  if(areaMode&&state.areaFitPending&&mapUI){
    mapUI.focusAreas([...state.selectedAreaIds]);
    state.areaFitPending=false;
    state.hasFit=true;
  }else if(state.events.length&&!state.hasFit&&nearby.length){
    mapUI?.fitEvents(nearby);
    state.hasFit=true;
  }

  renderHighlights(nearby);
  bindDiscoveryFilters();
}

function renderHighlights(events){
  const section=document.querySelector(".highlights");
  const el=document.querySelector("#highlightCards");
  section.classList.toggle("is-empty",!events.length);
  const highlights=rankHighlights(events,{limit:6});
  const symbols={sports:"◆",music:"♫",festival:"✦",food:"◇",theater:"◈",comedy:"✺",family:"●",community:"✺",nightlife:"☾",other:"＋"};
  el.innerHTML=highlights.length?highlights.map(event=>`<button class="highlight-card event-surface category-surface-${event.category}" data-highlight="${event.id}" data-url="${event.url||""}"><span class="highlight-art category-art category-bg-${event.category} ${event.image?"has-image":"is-fallback"}">${event.image?`<img src="${event.image}" alt="" loading="lazy">`:`<span class="category-art-symbol" aria-hidden="true">${symbols[event.category]||"✦"}</span><small>${event.category}</small>`}</span><span class="highlight-copy"><strong>${event.title}</strong><small>${event.venue} · ${Number.isFinite(event.distance)?event.distance.toFixed(1)+" mi":"Location approximate"}</small><em>Explore event →</em></span></button>`).join(""):`<div class="highlight-empty">Highlights will appear here as real event sources come online.</div>`;
  el.querySelectorAll("[data-highlight]").forEach(button=>button.onclick=()=>{selectEvent(button.dataset.highlight);openEventDetail(button.dataset.highlight)});
}

function monthShift(key,delta){
  const [year,month]=String(key).split("-").map(Number);
  const date=new Date(year,month-1+delta,1);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}

function resetMapScope(){
  state.venueFilter=null;
  state.resultScope="nearby";
  state.viewport=null;
  state.hasFit=false;
  if(state.selectedAreaIds?.size)state.areaFitPending=true;
}

function persistSelectedAreas(){
  localStorage.setItem("locale-selected-areas",JSON.stringify([...state.selectedAreaIds]));
}

function setAreaSelection(ids,{fit=true}={}){
  state.selectedAreaIds=new Set(ids);
  persistSelectedAreas();
  resetMapScope();
  state.areaFitPending=fit&&state.selectedAreaIds.size>0;
  render();
}

function toggleAreaSelection(id){
  const next=new Set(state.selectedAreaIds);
  next.has(id)?next.delete(id):next.add(id);
  setAreaSelection(next);
}

function removeAreaSelection(id){
  if(!state.selectedAreaIds.has(id))return;
  const next=new Set(state.selectedAreaIds);
  next.delete(id);
  setAreaSelection(next,{fit:next.size>0});
}

function clearAreaSelection({renderNow=true}={}){
  if(!state.selectedAreaIds.size)return;
  state.selectedAreaIds=new Set;
  persistSelectedAreas();
  state.areaFitPending=false;
  resetMapScope();
  if(renderNow)render();
}

function bindAreaControls(){
  document.querySelectorAll("#areaControls [data-area-id]").forEach(button=>button.onclick=()=>toggleAreaSelection(button.dataset.areaId));
  document.querySelectorAll("#areaControls [data-remove-area]").forEach(button=>button.onclick=event=>{
    event.stopPropagation();
    removeAreaSelection(button.dataset.removeArea);
  });
  document.querySelector("#clearAreas")?.addEventListener("click",()=>clearAreaSelection());
  document.querySelector("#toggleAreas")?.addEventListener("click",()=>{
    state.areaExpanded=!state.areaExpanded;
    renderAreaControls();
  });
  const search=document.querySelector("#areaSearch");
  search?.addEventListener("input",event=>{
    const cursor=event.target.selectionStart;
    state.areaQuery=event.target.value;
    renderAreaControls();
    const replacement=document.querySelector("#areaSearch");
    replacement?.focus();
    if(Number.isInteger(cursor))replacement?.setSelectionRange(cursor,cursor);
  });
}

function handleMapArea(hit){
  const id=hit?.id;
  if(!id)return;
  const original=hit.originalEvent;
  const additive=!!(original?.shiftKey||original?.ctrlKey||original?.metaKey);
  if(additive){
    toggleAreaSelection(id);
    return;
  }
  if(state.selectedAreaIds.size===1&&state.selectedAreaIds.has(id)){
    state.areaFitPending=true;
    render();
    return;
  }
  setAreaSelection([id]);
}

function chooseDate(key){
  resetMapScope();
  state.quickPreset=null;
  state.calendarMonth=key.slice(0,7);
  if(state.dateMode==="single"){
    state.dateStart=key;
    state.dateEnd=key;
    state.rangeAnchor=null;
    state.calendarOpen=false;
  }else if(!state.rangeAnchor){
    state.rangeAnchor=key;
    state.dateStart=key;
    state.dateEnd=key;
  }else{
    state.dateStart=state.rangeAnchor<key?state.rangeAnchor:key;
    state.dateEnd=state.rangeAnchor<key?key:state.rangeAnchor;
    state.rangeAnchor=null;
    state.calendarOpen=false;
  }
  render();
}

function weekendRange(base=todayKey()){
  const date=new Date(base+"T12:00:00");
  const dow=date.getDay();
  const daysUntilSaturday=(6-dow+7)%7;
  const start=addDays(base,daysUntilSaturday);
  return [start,addDays(start,1)];
}

function applyQuickPreset(preset){
  const today=todayKey();
  state.quickPreset=preset;
  state.rangeAnchor=null;
  state.calendarOpen=false;
  if(preset==="tomorrow"){
    state.dateMode="single";
    state.dateStart=addDays(today,1);
    state.dateEnd=state.dateStart;
  }else if(preset==="weekend"){
    state.dateMode="range";
    [state.dateStart,state.dateEnd]=weekendRange(today);
  }else if(preset==="7days"){
    state.dateMode="range";
    state.dateStart=today;
    state.dateEnd=addDays(today,6);
  }else if(preset==="30days"){
    state.dateMode="range";
    state.dateStart=today;
    state.dateEnd=addDays(today,29);
  }else{
    state.dateMode="single";
    state.dateStart=today;
    state.dateEnd=today;
  }
  state.calendarMonth=state.dateStart.slice(0,7);
  resetMapScope();
  render();
}

function bindDiscoveryFilters(){
  document.querySelectorAll("#filters [data-category]").forEach(button=>button.onclick=()=>{
    const category=button.dataset.category;
    resetMapScope();
    state.categories.has(category)?state.categories.delete(category):state.categories.add(category);
    render();
  });
  document.querySelector("#clearCategory")?.addEventListener("click",()=>{
    resetMapScope();
    state.categories.clear();
    render();
  });

  document.querySelectorAll("[data-date-preset]").forEach(button=>button.onclick=()=>applyQuickPreset(button.dataset.datePreset));

  document.querySelector("#dateSummary")?.addEventListener("click",()=>{
    state.calendarOpen=!state.calendarOpen;
    render();
  });
  document.querySelector("#todayDate")?.addEventListener("click",()=>{
    const key=todayKey();
    resetMapScope();
    state.quickPreset="today";
    state.dateMode="single";
    state.dateStart=key;
    state.dateEnd=key;
    state.rangeAnchor=null;
    state.calendarMonth=key.slice(0,7);
    render();
  });
  document.querySelectorAll("[data-date-mode]").forEach(button=>button.onclick=()=>{
    state.quickPreset=null;
    state.dateMode=button.dataset.dateMode;
    state.rangeAnchor=null;
    if(state.dateMode==="single")state.dateEnd=state.dateStart;
    render();
  });
  document.querySelectorAll("[data-date-shift]").forEach(button=>button.onclick=()=>{
    state.quickPreset=null;
    const amount=Number(button.dataset.dateShift);
    resetMapScope();
    state.dateStart=addDays(state.dateStart,amount);
    state.dateEnd=addDays(state.dateEnd,amount);
    state.calendarMonth=state.dateStart.slice(0,7);
    state.rangeAnchor=null;
    render();
  });
  document.querySelectorAll("[data-month-shift]").forEach(button=>button.onclick=()=>{
    state.calendarMonth=monthShift(state.calendarMonth,Number(button.dataset.monthShift));
    state.calendarOpen=true;
    render();
  });
  document.querySelectorAll("[data-date]").forEach(button=>button.onclick=()=>chooseDate(button.dataset.date));
}

function handleMapMarker(hit){
  const shell=document.querySelector(".shell");
  if(hit.type==="group"){
    state.venueFilter={ids:hit.events.map(event=>event.id),venue:hit.venue};
    state.listMode="events";
    shell.classList.remove("results-collapsed");
    document.querySelector("#resultsToggle .drawer-arrow").textContent="›";
    render();
    setTimeout(()=>mapUI?.map.invalidateSize(),240);
    return;
  }
  if(shell.classList.contains("results-collapsed"))mapUI?.showEventPopup(hit.event);
  else selectEvent(hit.event.id);
}

function openEventDetail(id){
  const event=filterEvents(state.events,state).find(item=>item.id===id)||state.events.find(item=>item.id===id);
  if(!event)return;
  const detailRoot=document.querySelector("#eventDetailRoot");
  detailRoot.innerHTML=EventDetail(event,state.saved.has(id));
  detailRoot.classList.add("open");
}
function closeEventDetail(){
  const detailRoot=document.querySelector("#eventDetailRoot");
  detailRoot.classList.remove("open");
  detailRoot.innerHTML="";
}
function selectEvent(id){
  const target=document.querySelector('[data-event-id="'+CSS.escape(id)+'"]');
  document.querySelectorAll(".card").forEach(card=>card.classList.toggle("selected",card.dataset.eventId===id));
  target?.scrollIntoView({behavior:"smooth",block:"center"});
  mapUI?.selectEvent(id);
}

document.querySelector("#resultsToggle").onclick=()=>{
  state.venueFilter=null;
  const shell=document.querySelector(".shell");
  shell.classList.toggle("results-collapsed");
  document.querySelector("#resultsToggle .drawer-arrow").textContent=shell.classList.contains("results-collapsed")?"‹":"›";
  setTimeout(()=>mapUI?.map.invalidateSize(),240);
};
document.querySelector("#discoveryToggle").onclick=()=>{
  const shell=document.querySelector(".shell");
  shell.classList.toggle("discovery-collapsed");
  document.querySelector("#discoveryToggle .drawer-arrow").textContent=shell.classList.contains("discovery-collapsed")?"›":"‹";
  setTimeout(()=>mapUI?.map.invalidateSize(),240);
};

const sidebar=document.querySelector("#sidebar");
sidebar.addEventListener("click",event=>{
  const removeArea=event.target.closest("[data-remove-area]");
  if(removeArea){
    removeAreaSelection(removeArea.dataset.removeArea);
    return;
  }

  const saveButton=event.target.closest("[data-save-event]");
  if(saveButton){
    event.preventDefault();
    event.stopPropagation();
    const id=saveButton.dataset.saveEvent;
    state.saved.has(id)?state.saved.delete(id):state.saved.add(id);
    localStorage.setItem("locale-saved",JSON.stringify([...state.saved]));
    renderSidebarFromState();
    return;
  }

  if(event.target.closest(".event-action"))return;

  const listMode=event.target.closest("[data-list-mode]");
  if(listMode){
    state.listMode=listMode.dataset.listMode;
    renderSidebarFromState();
    return;
  }

  if(event.target.closest("#clearVenueFilter")){
    state.venueFilter=null;
    render();
    return;
  }

  if(event.target.closest("#showAllNearby")){
    state.resultScope="nearby";
    state.viewport=null;
    state.venueFilter=null;
    render();
    return;
  }

  const row=event.target.closest("[data-event-id]");
  if(!row)return;
  const wasSelected=row.classList.contains("selected");
  selectEvent(row.dataset.eventId);
  if(wasSelected)openEventDetail(row.dataset.eventId);
});
sidebar.addEventListener("change",event=>{
  if(!event.target.matches("#sortEvents"))return;
  state.sort=event.target.value;
  renderSidebarFromState();
});
sidebar.addEventListener("mouseover",event=>{
  const row=event.target.closest("[data-event-id]");
  if(!row||row.contains(event.relatedTarget))return;
  mapUI?.hoverEvent(row.dataset.eventId,true);
});
sidebar.addEventListener("mouseout",event=>{
  const row=event.target.closest("[data-event-id]");
  if(!row||row.contains(event.relatedTarget))return;
  mapUI?.hoverEvent(row.dataset.eventId,false);
});

document.querySelector("#radius").oninput=event=>{
  state.radius=Number(event.target.value);
  resetMapScope();
  document.querySelector("#radiusLabel").textContent=state.radius+" miles";
  document.querySelector("#mapRadiusLabel").textContent=state.radius+" miles";
  render();
};
document.querySelector("#useMapCenter").onclick=()=>{
  if(state.selectedAreaIds.size)clearAreaSelection({renderNow:false});
  state.venueFilter=null;
  state.resultScope="nearby";
  state.viewport=null;
  mapUI?.useMapCenter();
};
document.querySelector("#clearAreaSelectionMap").onclick=()=>clearAreaSelection();
document.querySelector("#viewAllHighlights").onclick=()=>{
  state.listMode="events";
  state.resultScope="nearby";
  state.viewport=null;
  state.venueFilter=null;
  document.querySelector(".shell").classList.remove("results-collapsed");
  document.querySelector("#resultsToggle .drawer-arrow").textContent="›";
  render();
};

const mapStyle=document.querySelector("#mapStyle");
mapStyle.value=state.mapStyle;
function applyMapStyle(value){
  if(!["standard","humanitarian","satellite"].includes(value))return;
  state.mapStyle=value;
  localStorage.setItem("locale-map-style",value);
  if(mapUI)mapUI.setStyle(value);else initMapLater();
}
mapStyle.addEventListener("change",event=>applyMapStyle(event.target.value));

document.querySelector("#placeSearch").addEventListener("keydown",async event=>{
  if(event.key!=="Enter"||!event.target.value.trim())return;
  event.target.disabled=true;
  try{
    const place=await geocode(event.target.value.trim());
    if(place){
      if(state.selectedAreaIds.size)clearAreaSelection({renderNow:false});
      state.center={lat:place.lat,lng:place.lng};
      state.placeLabel=place.label||event.target.value.trim();
      state.zoom=11;
      resetMapScope();
      mapUI?.setSearchCenter(state.center,{recenter:true,zoom:11});
      render();
    }
  }finally{
    event.target.disabled=false;
  }
});

render();
requestAnimationFrame(()=>document.documentElement.classList.add("locale-ready"));
Promise.allSettled([
  loadEvents(),
  loadAreaGeometry({regionId:CONFIG.defaultRegionId})
]).then(([eventsResult,areasResult])=>{
  let events=eventsResult.status==="fulfilled"?eventsResult.value:[];
  if(eventsResult.status==="rejected")console.error(eventsResult.reason);

  if(areasResult.status==="fulfilled"){
    const collection=areasResult.value;
    state.areaFeatures=collection.features||[];
    const lookup=createAreaLookup(collection);
    state.areaNameById=Object.fromEntries([...lookup].map(([id,feature])=>[id,feature.properties?.name||id]));
    state.selectedAreaIds=new Set([...state.selectedAreaIds].filter(id=>lookup.has(id)));
    persistSelectedAreas();
    state.areasReady=true;
    events=annotateEventsWithAreas(events,collection,{isEligible:hasPreciseLocation});
    state.areaRevision++;
  }else{
    console.error(areasResult.reason);
    state.areasReady=true;
    state.areaFeatures=[];
    state.selectedAreaIds=new Set;
    persistSelectedAreas();
  }

  state.events=events;
  render();
  finishSplash();
});
setTimeout(initMapLater,100);

document.querySelector("#eventDetailRoot").addEventListener("click",event=>{if(event.target.closest("[data-close-detail]"))closeEventDetail()});
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeEventDetail()});
