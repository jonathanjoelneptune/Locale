import {readFile,writeFile} from "node:fs/promises";

const CACHE_PATH="src/data/venue-geocode-cache.json";
let loaded=false;
let cache={};
let lastRequestAt=0;
let dirty=false;
let newLookups=0;
const MAX_NEW_LOOKUPS_PER_RUN=120;
const NEGATIVE_CACHE_MS=7*86400000;

const keyFor=(venue,region)=>[venue,region?.name,region?.administrativeArea,region?.countryCode]
  .filter(Boolean).join(", ").replace(/\s+/g," ").trim();
const searchQueryFor=(venue,region)=>{
  const clean=String(venue||"").replace(/\s+/g," ").trim();
  const lower=clean.toLowerCase();
  const alreadyScoped=[region?.name,region?.administrativeArea,"san diego","chicago"]
    .filter(Boolean).some(value=>lower.includes(String(value).toLowerCase()));
  return alreadyScoped?clean:keyFor(clean,region);
};

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
  if(!clean||clean.length>180||vague.test(clean))return null;
  const key=keyFor(clean,region);
  const cached=cache[key];
  if(cached?.miss){
    const checked=Date.parse(cached.checkedAt||"");
    if(Number.isFinite(checked)&&Date.now()-checked<NEGATIVE_CACHE_MS)return null;
  }else if(cached&&Number.isFinite(Number(cached.lat))&&Number.isFinite(Number(cached.lng))){
    return cached;
  }
  if(newLookups>=MAX_NEW_LOOKUPS_PER_RUN)return null;
  newLookups++;

  await throttle();
  const url=new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format","jsonv2");
  url.searchParams.set("limit","1");
  url.searchParams.set("q",searchQueryFor(clean,region));
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
