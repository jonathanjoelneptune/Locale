import {readFile,writeFile} from "node:fs/promises";

const CACHE_PATH="src/data/venue-geocode-cache.json";
export const VENUE_GEOCODER_VERSION=2;
let loaded=false;
let cache={};
let dirty=false;
let newLookups=0;
const MAX_NEW_LOOKUPS_PER_RUN=160;
const NEGATIVE_CACHE_MS=24*3600000;
const PROVIDER_COOLDOWN_MS=10*60*1000;
const providerState={
  census:{lastRequestAt:0,minIntervalMs:150,failures:0,cooldownUntil:0},
  photon:{lastRequestAt:0,minIntervalMs:350,failures:0,cooldownUntil:0},
  nominatim:{lastRequestAt:0,minIntervalMs:1100,failures:0,cooldownUntil:0}
};
const telemetry={
  queries:0,cacheHits:0,negativeCacheHits:0,resolved:0,misses:0,
  providers:{
    census:{attempted:0,resolved:0,noMatch:0,errors:0,skipped:0},
    photon:{attempted:0,resolved:0,noMatch:0,errors:0,skipped:0},
    nominatim:{attempted:0,resolved:0,noMatch:0,errors:0,skipped:0}
  }
};

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

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const likelyStreetAddress=value=>/^\s*\d+[A-Za-z0-9-]*\s+\S+/.test(String(value||""));

async function throttle(name){
  const state=providerState[name];
  const wait=Math.max(0,state.minIntervalMs-(Date.now()-state.lastRequestAt));
  if(wait)await sleep(wait);
  state.lastRequestAt=Date.now();
}
const providerAvailable=name=>Date.now()>=Number(providerState[name].cooldownUntil||0);
function providerError(name){
  const state=providerState[name];
  state.failures++;
  telemetry.providers[name].errors++;
  if(state.failures>=3)state.cooldownUntil=Date.now()+PROVIDER_COOLDOWN_MS;
}
function providerSuccess(name){
  providerState[name].failures=0;
  providerState[name].cooldownUntil=0;
}
function distanceMiles(a,b){
  if(!a||!b)return Infinity;
  const rad=x=>x*Math.PI/180,R=3958.7613;
  const dLat=rad(Number(b.lat)-Number(a.lat)),dLon=rad(Number(b.lng)-Number(a.lng));
  const lat1=rad(Number(a.lat)),lat2=rad(Number(b.lat));
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}
function plausible(point,region){
  if(!point||!Number.isFinite(Number(point.lat))||!Number.isFinite(Number(point.lng)))return false;
  if(!region?.center)return true;
  return distanceMiles(point,region.center)<=Math.max(25,Number(region.ingestRadiusMiles||50)+20);
}

export function parseCensusPoint(payload){
  const first=payload?.result?.addressMatches?.[0];
  const lat=Number(first?.coordinates?.y),lng=Number(first?.coordinates?.x);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  return {lat,lng,displayName:first?.matchedAddress||null,provider:"census"};
}
export function parsePhotonPoint(payload){
  const first=payload?.features?.[0];
  const coordinates=first?.geometry?.coordinates;
  const lng=Number(coordinates?.[0]),lat=Number(coordinates?.[1]);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  const p=first?.properties||{};
  const street=p.street?(p.housenumber?String(p.housenumber)+" "+p.street:p.street):null;
  const displayName=[p.name,street,p.city||p.district,p.state,p.postcode,p.country]
    .filter(Boolean).filter((value,index,array)=>array.indexOf(value)===index).join(", ");
  return {lat,lng,displayName:displayName||p.name||null,provider:"photon"};
}
export function parseNominatimPoint(payload){
  const first=Array.isArray(payload)?payload[0]:null;
  const lat=Number(first?.lat),lng=Number(first?.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
  return {lat,lng,displayName:first?.display_name||null,provider:"nominatim"};
}

async function requestJson(name,url,fetchImpl=globalThis.fetch){
  if(!providerAvailable(name)){
    telemetry.providers[name].skipped++;
    return null;
  }
  telemetry.providers[name].attempted++;
  await throttle(name);
  try{
    const response=await fetchImpl(url,{
      headers:{"User-Agent":"Locale-events/2.0 (https://github.com/jonathanjoelneptune/Locale)","Accept":"application/json"},
      signal:AbortSignal.timeout(5000)
    });
    if(!response.ok){
      if(response.status===429||response.status>=500)providerError(name);
      else telemetry.providers[name].noMatch++;
      return null;
    }
    const payload=await response.json();
    providerSuccess(name);
    return payload;
  }catch{
    providerError(name);
    return null;
  }
}

async function censusGeocode(clean,region,fetchImpl){
  if(String(region?.countryCode||"US").toUpperCase()!=="US"||!likelyStreetAddress(clean)){
    telemetry.providers.census.skipped++;
    return null;
  }
  const url=new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address",searchQueryFor(clean,region));
  url.searchParams.set("benchmark","Public_AR_Current");
  url.searchParams.set("format","json");
  const payload=await requestJson("census",url,fetchImpl);
  if(!payload)return null;
  const point=parseCensusPoint(payload);
  if(!point||!plausible(point,region)){telemetry.providers.census.noMatch++;return null}
  telemetry.providers.census.resolved++;
  return point;
}
async function photonGeocode(clean,region,fetchImpl){
  const url=new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q",searchQueryFor(clean,region));
  url.searchParams.set("limit","1");
  if(region?.center){
    url.searchParams.set("lat",String(region.center.lat));
    url.searchParams.set("lon",String(region.center.lng));
    url.searchParams.set("zoom","10");
    url.searchParams.set("location_bias_scale","0.15");
  }
  if(region?.countryCode)url.searchParams.set("countrycode",String(region.countryCode).toUpperCase());
  const payload=await requestJson("photon",url,fetchImpl);
  if(!payload)return null;
  const point=parsePhotonPoint(payload);
  if(!point||!plausible(point,region)){telemetry.providers.photon.noMatch++;return null}
  telemetry.providers.photon.resolved++;
  return point;
}
async function nominatimGeocode(clean,region,fetchImpl){
  const url=new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format","jsonv2");
  url.searchParams.set("limit","1");
  url.searchParams.set("q",searchQueryFor(clean,region));
  if(region?.countryCode)url.searchParams.set("countrycodes",String(region.countryCode).toLowerCase());
  const payload=await requestJson("nominatim",url,fetchImpl);
  if(!payload)return null;
  const point=parseNominatimPoint(payload);
  if(!point||!plausible(point,region)){telemetry.providers.nominatim.noMatch++;return null}
  telemetry.providers.nominatim.resolved++;
  return point;
}

export async function geocodeVenueUncached(venue,region,{fetchImpl=globalThis.fetch}={}){
  const clean=String(venue||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
  if(!clean||clean.length>180||vague.test(clean))return null;
  for(const provider of [censusGeocode,photonGeocode,nominatimGeocode]){
    const point=await provider(clean,region,fetchImpl);
    if(point)return point;
  }
  return null;
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
