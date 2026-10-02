import {EventCard} from "./eventCard.js";

const distanceValue=event=>Number.isFinite(event.distance)?event.distance:Infinity;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const dateLabel=state=>{
  const fmt=key=>{
    const [year,month,day]=String(key||"").split("-").map(Number);
    return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric"}).format(new Date(year,month-1,day));
  };
  return state.dateStart===state.dateEnd?fmt(state.dateStart):`${fmt(state.dateStart)} – ${fmt(state.dateEnd)}`;
};

export function renderSidebar(el,events,state){
 const shown=state.listMode==="saved"?events.filter(e=>state.saved.has(e.id)):events;
 const sorts=[["time","Time"],["distance","Distance"],["title","Name"]];
 const ordered=[...shown].sort((a,b)=>state.sort==="distance"?distanceValue(a)-distanceValue(b):state.sort==="title"?a.title.localeCompare(b.title):new Date(a.start)-new Date(b.start)||distanceValue(a)-distanceValue(b));
 const viewportMode=state.listMode!=="saved"&&state.resultScope==="viewport";
 const selectedAreaIds=state.selectedAreaIds instanceof Set?[...state.selectedAreaIds]:[];
 const areaMode=selectedAreaIds.length>0;
 const areaNames=selectedAreaIds.map(id=>state.areaNameById?.[id]||id);
 const compactAreaNames=areaNames.length>3?`${areaNames.slice(0,3).join(" + ")} +${areaNames.length-3} more`:areaNames.join(" + ");
 const title=state.listMode==="saved"?"Saved":viewportMode?"Events in Map View":areaMode?"Events in Selected Areas":"Events Nearby";
 const subtitle=state.listMode==="saved"?(areaMode?`Your saved events · ${compactAreaNames}`:"Your saved events"):viewportMode?"Current visible map area":areaMode?`${dateLabel(state)} · ${compactAreaNames}`:`${dateLabel(state)} · Within ${state.radius} miles`;
 const areaBar=areaMode?`<div class="area-result-bar"><span>Areas</span><div>${areaNames.map((name,index)=>`<button type="button" data-remove-area="${esc(selectedAreaIds[index])}" title="Remove ${esc(name)}">${esc(name)} <b>×</b></button>`).join("")}</div></div>`:"";
 el.innerHTML=`<div class="results-tabs"><button data-list-mode="events" class="${state.listMode!=="saved"?"active":""}">▣ &nbsp;Events</button><button data-list-mode="saved" class="${state.listMode==="saved"?"active":""}">♡ &nbsp;My List</button></div>${areaBar}${state.venueFilter?`<div class="venue-filter-bar"><button id="clearVenueFilter" type="button">← All Events</button><span>${state.venueFilter.venue||"Selected location"}</span></div>`:""}${viewportMode?`<div class="venue-filter-bar viewport-filter-bar"><button id="showAllNearby" type="button">← Selected Areas</button><span>Map View</span></div>`:""}<div class="results-head"><div><h1><em>${ordered.length}</em> ${title}</h1><p>${subtitle}</p></div><select id="sortEvents" class="sort-button" aria-label="Sort events">${sorts.map(([v,l])=>`<option value="${v}" ${state.sort===v?"selected":""}>Sort: ${l}</option>`).join("")}</select></div><div class="cards">${ordered.length?ordered.map(e=>EventCard(e,state.saved.has(e.id))).join(""):`<div class="empty"><strong>${state.listMode==="saved"?"Your list is empty.":viewportMode?"No events visible on this part of the map.":"No events in this view yet."}</strong><span>${state.listMode==="saved"?"Save an event from its card to keep it here.":viewportMode?"Pan or zoom out to see more events.":areaMode?"Try another area or a wider date range.":"Try a wider radius or time window."}</span></div>`}</div>`;
}