import {readFile,writeFile} from "node:fs/promises";

const CACHE_PATH="src/data/venue-geocode-cache.json";
let loaded=false;
let cache={};
let lastRequestAt=0;
let dirty=false;

const keyFor=(venue,region)=>[venue,region?.name,region?.administrativeArea,region?.countryCode]
  .filter(Boolean).join(", ").replace(/\s+/g," ").trim();

const vague=/^(?:tbd|to be determined|location tba|uc san diego|balboa park|class and trip locations vary|location details to come!?|email .* location|seating is limited)/i;

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

export async function geocodeVenue(venue,region){
  await load();
  const clean=String(venue||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
  if(!clean||vague.test(clean))return null;
  const key=keyFor(clean,region);
  if(cache[key])return cache[key];

  await throttle();
  const url=new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format","jsonv2");
  url.searchParams.set("limit","1");
  url.searchParams.set("q",key);
  try{
    const response=await fetch(url,{
      headers:{"User-Agent":"Locale-events/1.0 (https://github.com/jonathanjoelneptune/Locale)"},
      signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)return null;
    const rows=await response.json();
    const first=rows?.[0];
    const lat=Number(first?.lat),lng=Number(first?.lon);
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
    const point={lat,lng,displayName:first.display_name||clean};
    cache[key]=point;
    dirty=true;
    return point;
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
