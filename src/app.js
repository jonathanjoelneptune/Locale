import {CONFIG} from "./config.js";
import {Header} from "./components/header.js";
import {Filters} from "./components/filters.js";
import {renderSidebar} from "./components/sidebar.js";
import {createMap} from "./components/map.js";
import {loadEvents} from "./providers/index.js";
import {filterEvents} from "./services/events.js";
import {rankHighlights} from "./services/highlights.js";
import {geocode} from "./services/geocode.js";
import {ensureLeaflet} from "./services/leaflet.js";

const saved=new Set(JSON.parse(localStorage.getItem("locale-saved")||"[]"));
const state={center:{...CONFIG.defaultCenter},radius:CONFIG.defaultRadiusMiles,zoom:CONFIG.defaultZoom,window:"today",category:"all",events:[],hasFit:false,sort:"time",listMode:"events",saved,mapStyle:localStorage.getItem("locale-map-style")||"standard"};
const root=document.querySelector("#app");
root.innerHTML=`<div id="splash" class="locale-splash"><div class="splash-mark">⌖</div><strong>Locale</strong><span>Finding what’s happening around you…</span></div><div class="shell"><aside class="discovery-panel">${Header()}<section class="radius-panel"><div class="radius-title"><span>San Diego, CA</span><strong id="radiusLabel">${state.radius} miles</strong></div><input id="radius" type="range" min="5" max="50" step="5" value="${state.radius}"><div class="radius-ticks"><span>5</span><span>15</span><span>25</span><span>35</span><span>50</span></div></section><div id="filters" class="filters-panel"></div></aside><button id="discoveryToggle" class="discovery-toggle" type="button" aria-label="Toggle search filters"><span class="drawer-arrow">‹</span><span class="drawer-label">Search</span></button><main class="map-stage"><div id="map" class="map"></div><button id="useMapCenter" class="search-area-button" type="button">⟳ &nbsp; Search This Area</button><div class="map-radius-label" id="mapRadiusLabel">${state.radius} miles</div><div class="map-style-picker"><label>MAP</label><select id="mapStyle"><option value="standard">Standard</option><option value="humanitarian">Humanitarian</option><option value="satellite">Satellite</option></select></div></main><aside id="sidebar" class="sidebar results-panel"></aside><button id="resultsToggle" class="results-toggle" type="button" aria-label="Toggle event results"><span class="drawer-arrow">›</span><span class="drawer-label">Events</span><span id="resultsCount">0</span></button><section class="highlights"><div class="highlight-heading"><div><strong>Today's Highlights</strong><span>Top events happening around your search area</span></div><button id="viewAllHighlights" type="button">View All →</button></div><div id="highlightCards" class="highlight-cards"></div></section></div>`;

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
      mapUI=createMap(mapEl,state,(center,zoom)=>{state.center=center;state.zoom=zoom;render()});
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
  const visible=filterEvents(state.events,state);
  document.querySelector("#resultsCount").textContent=visible.length;
  renderSidebar(document.querySelector("#sidebar"),visible,state);
  document.querySelectorAll("[data-save-event]").forEach(b=>{b.textContent=state.saved.has(b.dataset.saveEvent)?"♥":"♡"});
  mapUI?.setRadius(state.radius,state.center);
  mapUI?.renderEvents(visible,selectEvent);
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
  el.querySelectorAll("[data-highlight]").forEach(b=>b.onclick=()=>{selectEvent(b.dataset.highlight);if(b.dataset.url)window.open(b.dataset.url,"_blank","noopener")});
}
function bindFilters(){
  document.querySelectorAll("[data-list-mode]").forEach(b=>b.onclick=()=>{state.listMode=b.dataset.listMode;render()});
  document.querySelector("#sortEvents")?.addEventListener("change",e=>{state.sort=e.target.value;render()});
  document.querySelectorAll("[data-save-event]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const id=b.dataset.saveEvent;if(state.saved.has(id)){state.saved.delete(id)}else{state.saved.add(id)}localStorage.setItem("locale-saved",JSON.stringify([...state.saved]));document.querySelectorAll(`[data-save-event="${CSS.escape(id)}"]`).forEach(x=>{x.textContent=state.saved.has(id)?"♥":"♡";x.classList.toggle("is-saved",state.saved.has(id));x.setAttribute("aria-label",state.saved.has(id)?"Remove saved event":"Save event")});if(state.listMode==="saved")render()});
  document.querySelectorAll("[data-window]").forEach(b=>b.onclick=()=>{state.window=b.dataset.window;state.hasFit=false;render()});
  document.querySelectorAll("[data-category]").forEach(b=>b.onclick=()=>{state.category=b.dataset.category;state.hasFit=false;render()});
  document.querySelector("#clearCategory")?.addEventListener("click",()=>{state.category="all";render()});
}
function selectEvent(id){
  const target=document.querySelector('[data-event-id="'+CSS.escape(id)+'"]');
  document.querySelectorAll(".card").forEach(c=>c.classList.toggle("selected",c.dataset.eventId===id));
  target?.scrollIntoView({behavior:"smooth",block:"center"});
  mapUI?.selectEvent(id);
}
document.querySelector("#resultsToggle").onclick=()=>{const shell=document.querySelector(".shell");shell.classList.toggle("results-collapsed");document.querySelector("#resultsToggle .drawer-arrow").textContent=shell.classList.contains("results-collapsed")?"‹":"›";setTimeout(()=>mapUI?.map.invalidateSize(),240)};
document.querySelector("#discoveryToggle").onclick=()=>{const shell=document.querySelector(".shell");shell.classList.toggle("discovery-collapsed");document.querySelector("#discoveryToggle .drawer-arrow").textContent=shell.classList.contains("discovery-collapsed")?"›":"‹";setTimeout(()=>mapUI?.map.invalidateSize(),240)};
document.querySelector("#sidebar").addEventListener("click",e=>{
  const row=e.target.closest("[data-event-id]");
  if(!row)return;
  const wasSelected=row.classList.contains("selected");
  selectEvent(row.dataset.eventId);
  if(wasSelected&&row.dataset.eventUrl)window.open(row.dataset.eventUrl,"_blank","noopener");
});

document.querySelector("#radius").oninput=e=>{state.radius=Number(e.target.value);state.hasFit=false;document.querySelector("#radiusLabel").textContent=state.radius+" miles";document.querySelector("#mapRadiusLabel").textContent=state.radius+" miles";render()};
document.querySelector("#useMapCenter").onclick=()=>mapUI?.useMapCenter();
document.querySelector("#viewAllHighlights").onclick=()=>{state.listMode="events";document.querySelector(".shell").classList.remove("results-collapsed");render()};
const mapStyle=document.querySelector("#mapStyle");mapStyle.value=state.mapStyle;mapStyle.onchange=e=>{state.mapStyle=e.target.value;localStorage.setItem("locale-map-style",state.mapStyle);mapUI?.setStyle(state.mapStyle)};
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
