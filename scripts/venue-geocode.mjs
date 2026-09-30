import {readFile,writeFile} from "node:fs/promises";

const CACHE_PATH="src/data/venue-geocode-cache.json";
let loaded=false;
let cache={};
let lastRequestAt=0;
let dirty=false;
let newLookups=0;
const MAX_NEW_LOOKUPS_PER_RUN=20;
const EARTH_MILES=3958.8;

const norm=value=>String(value||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const keyFor=(venue,region,{sourceName,address}={})=>[
  venue,
  address||sourceName,
  region?.name,
  region?.administrativeArea,
  region?.countryCode
].filter(Boolean).join(", ").replace(/\s+/g," ").trim();

const vague=/^(?:tbd|to be determined|location tba|uc san diego|balboa park|class and trip locations vary|location details to come!?|email .* location|seating is limited)/i;

function milesBetween(a,b){
  if(!a||!b)return Infinity;
  const toRad=value=>Number(value)*Math.PI/180;
  const dLat=toRad(Number(b.lat)-Number(a.lat));
  const dLng=toRad(Number(b.lng)-Number(a.lng));
  const lat1=toRad(a.lat),lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*EARTH_MILES*Math.asin(Math.min(1,Math.sqrt(h)));
}

async function load(){
  if(loaded)return;
  loaded=true;
  try{cache=JSON.parse(await readFile(CACHE_PATH,"utf8"))}catch{cache={}}
}

async function throttle(){
  const wait=Math.max(0,1100-(Date.now()-lastRequestAt));
  if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  lastRequestAt=Date.now();
}

export async function geocodeVenue(venue,region,{sourceName,address,origin,maxMiles=8}={}){
  await load();
  const clean=norm(venue);
  if(!clean||vague.test(clean))return null;
  const key=keyFor(clean,region,{sourceName:sourceName&&sourceName!==clean?sourceName:null,address:norm(address)});
  const cached=cache[key];
  if(cached?.miss)return null;
  if(cached?.lat!=null&&cached?.lng!=null)return cached;
  if(newLookups>=MAX_NEW_LOOKUPS_PER_RUN)return null;
  newLookups++;

  await throttle();
  const url=new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format","jsonv2");
  url.searchParams.set("limit","1");
  url.searchParams.set("q",key);
  try{
    const response=await fetch(url,{
      headers:{"User-Agent":"Locale-events/1.0 (https://github.com/jonathanjoelneptune/Locale)"},
      signal:AbortSignal.timeout(3000)
    });
    if(!response.ok)return null;
    const rows=await response.json();
    const first=rows?.[0];
    const lat=Number(first?.lat),lng=Number(first?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)){
      cache[key]={miss:true,checkedAt:new Date().toISOString()};
      dirty=true;
      return null;
    }
    const point={lat,lng};
    if(origin&&Number.isFinite(Number(origin.lat))&&Number.isFinite(Number(origin.lng))&&milesBetween(origin,point)>maxMiles){
      cache[key]={miss:true,checkedAt:new Date().toISOString(),reason:"outside-source-footprint"};
      dirty=true;
      return null;
    }
    const resolved={...point,displayName:first.display_name||clean};
    cache[key]=resolved;
    dirty=true;
    return resolved;
  }catch{
    return null;
  }
}

export async function saveVenueGeocodeCache(){
  if(!loaded||!dirty)return;
  const ordered=Object.fromEntries(Object.entries(cache).sort(([a],[b])=>a.localeCompare(b)));
  await writeFile(CACHE_PATH,JSON.stringify(ordered,null,2)+"\n");
  dirty=false;
}
