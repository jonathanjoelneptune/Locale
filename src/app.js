import {CONFIG} from "./config.js";
import {Header} from "./components/header.js";
import {Filters} from "./components/filters.js";
import {renderSidebar} from "./components/sidebar.js";
import {createMap} from "./components/map.js";
import {EventDetail} from "./components/eventDetail.js";
import {loadEvents} from "./providers/index.js";
import {filterEvents} from "./services/events.js";
import {rankHighlights} from "./services/highlights.js";
import {geocode} from "./services/geocode.js";
import {ensureLeaflet} from "./services/leaflet.js";

const saved=new Set(JSON.parse(localStorage.getItem("locale-saved")||"[]"));
const state={center:{...CONFIG.defaultCenter},placeLabel:"San Diego, CA",radius:CONFIG.defaultRadiusMiles,zoom:CONFIG.defaultZoom,window:"today",category:"all",events:[],hasFit:false,sort:"time",listMode:"events",saved,venueFilter:null,mapStyle:["standard","humanitarian","satellite"].includes(localStorage.getItem("locale-map-style"))?localStorage.getItem("locale-map-style"):"standard"};
const root=document.querySelector("#app");
root.innerHTML=`<div id="eventDetailRoot"></div><div id="splash" class="locale-splash"><div class="splash-mark">⌖</div><strong>Locale</strong><span>Finding what’s happening around you…</span></div><div class="shell"><aside class="discovery-panel">${Header()}<section class="radius-panel"><div class="radius-title"><span id="placeLabel">${state.placeLabel}</span><strong id="radiusLabel">${state.radius} miles</strong></div><input id="radius" type="range" min="5" max="50" step="5" value="${state.radius}"><div class="radius-ticks"><span>5</span><span>15</span><span>25</span><span>35</span><span>50</span></div></section><div id="filters" class="filters-panel"></div></aside><button id="discoveryToggle" class="discovery-toggle" type="button" aria-label="Toggle search filters"><span class="drawer-arrow">‹</span><span class="drawer-label">Search</span></button><main class="map-stage"><div id="map" class="map"></div><button id="useMapCenter" class="search-area-button" type="button">⟳ &nbsp; Search This Area</button><div class="map-radius-label" id="mapRadiusLabel">${state.radius} miles</div><div class="map-style-picker"><label>MAP</label><select id="mapStyle"><option value="standard">Standard</option><option value="humanitarian">Humanitarian</option><option value="satellite">Satellite</option></select></div></main><aside id="sidebar" class="sidebar results-panel"></aside><button id="resultsToggle" class="results-toggle" type="button" aria-label="Toggle event results"><span class="drawer-arrow">›</span><span class="drawer-label">Events</span><span id="resultsCount">0</span></button><section class="highlights"><div class="highlight-heading"><div><strong>Today's Highlights</strong><span>Top events happening around your search area</span></div><button id="viewAllHighlights" type="button">View All →</button></div><div id="highlightCards" class="highlight-cards"></div></section></div>`;

let mapUI=null;
const mapEl=document.querySelector("#map");
mapEl.innerHTML=`<div class="map-loading">Map starting…</div>`;

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
      mapUI=createMap(mapEl,state,(center,zoom)=>{state.center=center;state.zoom=zoom;state.venueFilter=null;render()},handleMapMarker,()=>{if(state.venueFilter){state.venueFilter=null;state.hasFit=true;render()}else{document.querySelectorAll(".card.selected").forEach(x=>x.classList.remove("selected"));mapUI?.selectEvent("__none__")}});
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
function render(){
  document.querySelector("#filters").innerHTML=Filters(state);
  let visible=filterEvents(state.events,state);
  if(state.venueFilter)visible=visible.filter(e=>state.venueFilter.ids.includes(e.id));
  document.querySelector("#resultsCount").textContent=visible.length;
  renderSidebar(document.querySelector("#sidebar"),visible,state);
  document.querySelectorAll("[data-save-event]").forEach(b=>{const on=state.saved.has(b.dataset.saveEvent);b.classList.toggle("is-saved",on);b.setAttribute("aria-pressed",String(on))});
  mapUI?.setRadius(state.radius,state.center);
  mapUI?.renderEvents(visible);
  if(state.events.length&&!state.hasFit&&visible.length){mapUI?.fitEvents(visible);state.hasFit=true}
  renderHighlights(visible);
  bindFilters();
}
function renderHighlights(events){
  const section=document.querySelector(".highlights");
  const el=document.querySelector("#highlightCards");
  section.classList.toggle("is-empty",!events.length);
  const highlights=rankHighlights(events,{limit:4});
  el.innerHTML=highlights.length?highlights.map(e=>`<button class="highlight-card" data-highlight="${e.id}" data-url="${e.url||""}"><span class="highlight-art category-bg-${e.category}">${e.image?`<img src="${e.image}" alt="" loading="lazy">`:e.category.slice(0,1).toUpperCase()}</span><span class="highlight-copy"><strong>${e.title}</strong><small>${e.venue} · ${e.distance.toFixed(1)} mi</small><em>Explore event →</em></span></button>`).join(""):`<div class="highlight-empty">Highlights will appear here as real event sources come online.</div>`;
  el.querySelectorAll("[data-highlight]").forEach(b=>b.onclick=()=>{selectEvent(b.dataset.highlight);openEventDetail(b.dataset.highlight)});
}
function bindFilters(){
  document.querySelectorAll("[data-list-mode]").forEach(b=>b.onclick=()=>{state.listMode=b.dataset.listMode;render()});
  document.querySelector("#clearVenueFilter")?.addEventListener("click",()=>{state.venueFilter=null;state.hasFit=false;render()});
  document.querySelector("#sortEvents")?.addEventListener("change",e=>{state.sort=e.target.value;render()});
  document.querySelectorAll("[data-window]").forEach(b=>b.onclick=()=>{state.venueFilter=null;state.window=b.dataset.window;state.hasFit=false;render()});
  document.querySelectorAll("[data-category]").forEach(b=>b.onclick=()=>{state.venueFilter=null;state.category=b.dataset.category;state.hasFit=false;render()});
  document.querySelector("#clearCategory")?.addEventListener("click",()=>{state.category="all";render()});
}
function handleMapMarker(hit){
  const shell=document.querySelector(".shell");
  if(hit.type==="group"){
    state.venueFilter={ids:hit.events.map(e=>e.id),venue:hit.venue};
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
  const e=filterEvents(state.events,state).find(x=>x.id===id)||state.events.find(x=>x.id===id);
  if(!e)return;
  const root=document.querySelector("#eventDetailRoot");
  root.innerHTML=EventDetail(e,state.saved.has(id));
  root.classList.add("open");
}
function closeEventDetail(){const root=document.querySelector("#eventDetailRoot");root.classList.remove("open");root.innerHTML=""}
function selectEvent(id){
  const target=document.querySelector('[data-event-id="'+CSS.escape(id)+'"]');
  document.querySelectorAll(".card").forEach(c=>c.classList.toggle("selected",c.dataset.eventId===id));
  target?.scrollIntoView({behavior:"smooth",block:"center"});
  mapUI?.selectEvent(id);
}
document.querySelector("#resultsToggle").onclick=()=>{state.venueFilter=null;const shell=document.querySelector(".shell");shell.classList.toggle("results-collapsed");document.querySelector("#resultsToggle .drawer-arrow").textContent=shell.classList.contains("results-collapsed")?"‹":"›";setTimeout(()=>mapUI?.map.invalidateSize(),240)};
document.querySelector("#discoveryToggle").onclick=()=>{const shell=document.querySelector(".shell");shell.classList.toggle("discovery-collapsed");document.querySelector("#discoveryToggle .drawer-arrow").textContent=shell.classList.contains("discovery-collapsed")?"›":"‹";setTimeout(()=>mapUI?.map.invalidateSize(),240)};
document.querySelector("#sidebar").addEventListener("click",e=>{
  const heart=e.target.closest("[data-save-event]");
  if(!heart)return;
  e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  const id=heart.dataset.saveEvent;
  const on=!state.saved.has(id);
  on?state.saved.add(id):state.saved.delete(id);
  localStorage.setItem("locale-saved",JSON.stringify([...state.saved]));
  document.querySelectorAll("[data-save-event]").forEach(btn=>{
    if(btn.dataset.saveEvent!==id)return;
    btn.classList.toggle("is-saved",on);
    btn.setAttribute("aria-pressed",String(on));btn.setAttribute("aria-label",on?"Remove saved event":"Save event");
  });
  if(state.listMode==="saved")requestAnimationFrame(render);
},true);
document.querySelector("#sidebar").addEventListener("click",e=>{
  if(e.target.closest(".event-action"))return;
  const row=e.target.closest("[data-event-id]");
  if(!row)return;
  const wasSelected=row.classList.contains("selected");
  selectEvent(row.dataset.eventId);
  if(wasSelected)openEventDetail(row.dataset.eventId);
});

document.querySelector("#radius").oninput=e=>{state.radius=Number(e.target.value);state.hasFit=false;document.querySelector("#radiusLabel").textContent=state.radius+" miles";document.querySelector("#mapRadiusLabel").textContent=state.radius+" miles";render()};
document.querySelector("#useMapCenter").onclick=()=>{state.venueFilter=null;mapUI?.useMapCenter()};
document.querySelector("#viewAllHighlights").onclick=()=>{state.listMode="events";document.querySelector(".shell").classList.remove("results-collapsed");render()};
const mapStyle=document.querySelector("#mapStyle");
mapStyle.value=state.mapStyle;
function applyMapStyle(value){
  if(!["standard","humanitarian","satellite"].includes(value))return;
  state.mapStyle=value;
  localStorage.setItem("locale-map-style",value);
  if(mapUI)mapUI.setStyle(value);else initMapLater();
}
mapStyle.addEventListener("input",e=>applyMapStyle(e.target.value));
mapStyle.addEventListener("change",e=>applyMapStyle(e.target.value));
document.querySelector("#placeSearch").addEventListener("keydown",async e=>{
  if(e.key!=="Enter"||!e.target.value.trim())return;
  e.target.disabled=true;
  try{
    const p=await geocode(e.target.value.trim());
    if(p){
      state.center={lat:p.lat,lng:p.lng};
      state.zoom=11;state.hasFit=false;
      mapUI?.setSearchCenter(state.center,{recenter:true,zoom:11});
      render();
    }
  }finally{e.target.disabled=false}
});

render();
requestAnimationFrame(()=>document.documentElement.classList.add("locale-ready"));
loadEvents().then(events=>{state.events=events;render();document.querySelector("#splash")?.classList.add("is-done");setTimeout(()=>document.querySelector("#splash")?.remove(),350)}).catch(error=>{console.error(error);render();document.querySelector("#splash")?.classList.add("is-done")});
setTimeout(initMapLater,100);

document.querySelector("#eventDetailRoot").addEventListener("click",e=>{if(e.target.closest("[data-close-detail]"))closeEventDetail()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeEventDetail()});
