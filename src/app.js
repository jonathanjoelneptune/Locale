import {CONFIG} from "./config.js";
import {Header} from "./components/header.js";
import {Filters} from "./components/filters.js";
import {renderSidebar} from "./components/sidebar.js";
import {createMap} from "./components/map.js";
import {loadEvents} from "./providers/index.js";
import {filterEvents} from "./services/events.js";
import {geocode} from "./services/geocode.js";
import {ensureLeaflet} from "./services/leaflet.js";

const bootRoot=document.querySelector("#app");
bootRoot.innerHTML=`<div class="boot-status">Loading Locale…</div>`;
try{await ensureLeaflet()}catch(error){bootRoot.innerHTML=`<div class="boot-error"><strong>Locale could not load the map.</strong><span>${error.message}</span><button onclick="location.reload()">Retry</button></div>`;throw error}

const state={center:{...CONFIG.defaultCenter},radius:CONFIG.defaultRadiusMiles,zoom:CONFIG.defaultZoom,window:"today",category:"all",events:[]};
const root=document.querySelector("#app");
root.innerHTML=`<div class="shell"><aside class="discovery-panel">${Header()}<section class="radius-panel"><div class="radius-title"><span>San Diego, CA</span><strong id="radiusLabel">${state.radius} miles</strong></div><input id="radius" type="range" min="1" max="${CONFIG.maxRadiusMiles}" value="${state.radius}"><div class="radius-ticks"><span>1</span><span>15</span><span>30</span><span>50</span><span>75</span></div></section><div id="filters" class="filters-panel"></div></aside><main class="map-stage"><div id="map" class="map"></div><button id="useMapCenter" class="search-area-button" type="button">⟳ &nbsp; Search This Area</button><div class="map-radius-label" id="mapRadiusLabel">${state.radius} miles</div></main><aside id="sidebar" class="sidebar results-panel"></aside><section class="highlights"><div class="highlight-heading"><div><strong>Today's Highlights</strong><span>Top events happening around your search area</span></div><button>View All →</button></div><div id="highlightCards" class="highlight-cards"></div></section></div>`;

const mapUI=createMap(document.querySelector("#map"),state,(center,zoom)=>{state.center=center;state.zoom=zoom;render()});

function render(){
  document.querySelector("#filters").innerHTML=Filters(state);
  const visible=filterEvents(state.events,state);
  renderSidebar(document.querySelector("#sidebar"),visible,state);
  mapUI.setRadius(state.radius,state.center);
  mapUI.renderEvents(visible,selectEvent);
  renderHighlights(visible);\n  bindFilters();
}
function renderHighlights(events){\n  const el=document.querySelector("#highlightCards");\n  el.innerHTML=events.length?events.slice(0,6).map(e=>`<button class="highlight-card" data-highlight="${e.id}"><span class="highlight-art category-bg-${e.category}">${e.category.slice(0,1).toUpperCase()}</span><strong>${e.title}</strong><small>${e.venue} · ${e.distance.toFixed(1)} mi</small></button>`).join(""):`<div class="highlight-empty">Highlights will appear here as real event sources come online.</div>`;\n  el.querySelectorAll("[data-highlight]").forEach(b=>b.onclick=()=>selectEvent(b.dataset.highlight));\n}\nfunction bindFilters(){
  document.querySelectorAll("[data-window]").forEach(b=>b.onclick=()=>{state.window=b.dataset.window;render()});
  document.querySelectorAll("[data-category]").forEach(b=>b.onclick=()=>{state.category=b.dataset.category;render()});\n  document.querySelector("#clearCategory")?.addEventListener("click",()=>{state.category="all";render()});
}
function selectEvent(id){
  document.querySelectorAll(".card").forEach(c=>c.classList.toggle("selected",c.dataset.eventId===id));
  document.querySelector('[data-event-id="'+CSS.escape(id)+'"]')?.scrollIntoView({behavior:"smooth",block:"center"});
}

document.querySelector("#radius").oninput=e=>{state.radius=Number(e.target.value);document.querySelector("#radiusLabel").textContent=state.radius+" miles";document.querySelector("#mapRadiusLabel").textContent=state.radius+" miles";render()};
document.querySelector("#useMapCenter").onclick=()=>mapUI.useMapCenter();
document.querySelector("#placeSearch").addEventListener("keydown",async e=>{
  if(e.key!=="Enter"||!e.target.value.trim())return;
  e.target.disabled=true;
  try{
    const p=await geocode(e.target.value.trim());
    if(p){
      state.center={lat:p.lat,lng:p.lng};
      state.zoom=11;
      mapUI.setSearchCenter(state.center,{recenter:true,zoom:11});
      render();
    }
  }finally{e.target.disabled=false}
});

render();
loadEvents().then(events=>{state.events=events;render()}).catch(console.error);
