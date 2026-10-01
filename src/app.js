import {CONFIG} from "./config.js";
import {Header} from "./components/header.js";
import {Filters} from "./components/filters.js";
import {DateControls,todayKey,addDays} from "./components/dateControls.js";
import {renderSidebar} from "./components/sidebar.js";
import {createMap} from "./components/map.js";
import {EventDetail} from "./components/eventDetail.js";
import {loadEvents} from "./providers/index.js";
import {filterEvents,hasPreciseLocation} from "./services/events.js";
import {rankHighlights} from "./services/highlights.js";
import {geocode} from "./services/geocode.js";
import {ensureLeaflet} from "./services/leaflet.js";

const saved=new Set(JSON.parse(localStorage.getItem("locale-saved")||"[]"));
const today=todayKey();
const state={
  center:{...CONFIG.defaultCenter},
  placeLabel:CONFIG.defaultPlaceLabel,
  radius:CONFIG.defaultRadiusMiles,
  zoom:CONFIG.defaultZoom,
  dateStart:today,
  dateEnd:today,
  dateMode:"single",
  calendarOpen:false,
  calendarMonth:today.slice(0,7),
  rangeAnchor:null,
  categories:new Set,
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
<div class="shell unified-shell">
  <aside class="unified-panel">
    <div class="unified-controls">
      ${Header()}
      <section class="radius-panel">
        <div class="radius-title"><span id="placeLabel">${state.placeLabel}</span><strong id="radiusLabel">${state.radius} miles</strong></div>
        <input id="radius" type="range" min="5" max="50" step="5" value="${state.radius}">
        <div class="radius-ticks"><span>5</span><span>15</span><span>25</span><span>35</span><span>50</span></div>
      </section>
      <div id="dateControls"></div>
      <div id="filters" class="filters-panel"></div>
    </div>
    <aside id="sidebar" class="sidebar results-panel"></aside>
  </aside>
  <button id="railToggle" class="rail-toggle" type="button" aria-label="Toggle event panel"><span class="drawer-arrow">‹</span><span class="drawer-label">Events</span><span id="railCount">0</span></button>
  <main class="map-stage">
    <div id="map" class="map"></div>
    <button id="useMapCenter" class="search-area-button" type="button">⟳ &nbsp; Search This Area</button>
    <div class="map-radius-label" id="mapRadiusLabel">${state.radius} miles</div>
    <div class="map-style-picker"><label>MAP</label><select id="mapStyle"><option value="standard">Standard</option><option value="humanitarian">Humanitarian</option><option value="satellite">Satellite</option></select></div>
  </main>
  <section class="highlights">
    <div class="highlight-heading"><div><strong>Highlights</strong><span>Top events in your selected dates and search area</span></div><button id="viewAllHighlights" type="button">View All →</button></div>
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
        }
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

function renderSidebarFromState(){
  const {visible}=currentEventView();
  const count=document.querySelector("#railCount");
  if(count)count.textContent=visible.length;
  renderSidebar(document.querySelector("#sidebar"),visible,state);
}

function render(){
  document.querySelector("#dateControls").innerHTML=DateControls(state);
  document.querySelector("#filters").innerHTML=Filters(state);
  document.querySelector("#placeLabel").textContent=state.placeLabel;
  const {nearby,visible}=currentEventView();
  const count=document.querySelector("#railCount");
  if(count)count.textContent=visible.length;
  renderSidebar(document.querySelector("#sidebar"),visible,state);
  mapUI?.setRadius(state.radius,state.center);
  mapUI?.renderEvents(visible);
  if(state.events.length&&!state.hasFit&&nearby.length){
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
}

function chooseDate(key){
  resetMapScope();
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

  document.querySelector("#dateSummary")?.addEventListener("click",()=>{
    state.calendarOpen=!state.calendarOpen;
    render();
  });
  document.querySelector("#todayDate")?.addEventListener("click",()=>{
    const key=todayKey();
    resetMapScope();
    state.dateMode="single";
    state.dateStart=key;
    state.dateEnd=key;
    state.rangeAnchor=null;
    state.calendarMonth=key.slice(0,7);
    render();
  });
  document.querySelectorAll("[data-date-mode]").forEach(button=>button.onclick=()=>{
    state.dateMode=button.dataset.dateMode;
    state.rangeAnchor=null;
    if(state.dateMode==="single")state.dateEnd=state.dateStart;
    render();
  });
  document.querySelectorAll("[data-date-shift]").forEach(button=>button.onclick=()=>{
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
    shell.classList.remove("rail-collapsed");
    document.querySelector("#railToggle .drawer-arrow").textContent="‹";
    render();
    setTimeout(()=>mapUI?.map.invalidateSize(),240);
    return;
  }
  if(shell.classList.contains("rail-collapsed"))mapUI?.showEventPopup(hit.event);
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

document.querySelector("#railToggle").onclick=()=>{
  state.venueFilter=null;
  const shell=document.querySelector(".shell");
  shell.classList.toggle("rail-collapsed");
  document.querySelector("#railToggle .drawer-arrow").textContent=shell.classList.contains("rail-collapsed")?"›":"‹";
  setTimeout(()=>mapUI?.map.invalidateSize(),240);
};

const sidebar=document.querySelector("#sidebar");
sidebar.addEventListener("click",event=>{
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
  state.venueFilter=null;
  state.resultScope="nearby";
  state.viewport=null;
  mapUI?.useMapCenter();
};
document.querySelector("#viewAllHighlights").onclick=()=>{
  state.listMode="events";
  state.resultScope="nearby";
  state.viewport=null;
  state.venueFilter=null;
  document.querySelector(".shell").classList.remove("rail-collapsed");
  document.querySelector("#railToggle .drawer-arrow").textContent="‹";
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
loadEvents()
  .then(events=>{state.events=events;render();finishSplash()})
  .catch(error=>{console.error(error);render();finishSplash()});
setTimeout(initMapLater,100);

document.querySelector("#eventDetailRoot").addEventListener("click",event=>{if(event.target.closest("[data-close-detail]"))closeEventDetail()});
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeEventDetail()});
