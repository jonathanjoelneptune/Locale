import {regionList,DEFAULT_REGION_ID} from "../data/regions.js";
const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function Header(regionId=DEFAULT_REGION_ID){
  const region=regionList.find(item=>item.id===regionId)||regionList[0];
  return `<div class="locale-identity"><div class="locale-mark">⌖</div><div><div class="brand">Locale</div><div class="tagline">Explore what's happening around you</div></div></div>
    <div class="region-picker"><label for="regionSelect">EXPLORE CITY</label>
      <select id="regionSelect" aria-label="Select Locale city">${regionList.map(item=>`<option value="${escape(item.id)}" ${item.id===regionId?"selected":""}>${escape(item.name)}, ${escape(item.administrativeArea)}</option>`).join("")}</select>
    </div>
    <div class="location-block"><label for="placeSearch">SEARCH LOCATION</label><div class="search-wrap"><span>⌕</span><input id="placeSearch" class="search" placeholder="${escape(region.name)}, ${escape(region.administrativeArea)}" aria-label="Search location"></div></div>`;
}
