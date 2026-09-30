import {readFile} from "node:fs/promises";
import {DEFAULT_REGION_ID,REGIONS} from "./regions.mjs";
import {SOURCES,sourcesForRegion} from "./source-registry.mjs";

const failures=[];
const fail=message=>failures.push(message);
const parseJson=async path=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch(error){fail(`${path}: invalid JSON (${error.message})`);return null}
};
const finite=(value,min,max)=>Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max;

if(!REGIONS[DEFAULT_REGION_ID])fail(`Default region ${DEFAULT_REGION_ID} is not configured`);
const regionIds=new Set(Object.keys(REGIONS));
for(const [key,region] of Object.entries(REGIONS)){
  if(region.id!==key)fail(`Region key ${key} does not match id ${region.id}`);
  if(!region.name)fail(`Region ${key} is missing name`);
  if(!/^[A-Z]{2}$/.test(region.countryCode||""))fail(`Region ${key} has invalid countryCode`);
  if(!finite(region.center?.lat,-90,90)||!finite(region.center?.lng,-180,180))fail(`Region ${key} has invalid center`);
  if(!region.timeZone)fail(`Region ${key} is missing timeZone`);
  if(!region.locale)fail(`Region ${key} is missing locale`);
}

const sourceIds=new Set;
for(const source of SOURCES){
  if(sourceIds.has(source.id))fail(`Duplicate source id ${source.id}`);
  sourceIds.add(source.id);
  if(!source.adapter)fail(`Source ${source.id} is missing adapter`);
  if(source.scope==="country"&&(!Array.isArray(source.countries)||!source.countries.length))fail(`Country source ${source.id} has no countries`);
  if(["local","regional"].includes(source.scope)){
    if(!Array.isArray(source.regions)||!source.regions.length)fail(`${source.scope} source ${source.id} has no regions`);
    for(const regionId of source.regions||[])if(!regionIds.has(regionId))fail(`Source ${source.id} references unknown region ${regionId}`);
  }
}
for(const region of Object.values(REGIONS)){
  for(const source of sourcesForRegion(region)){
    if(!sourceIds.has(source.id))fail(`Region ${region.id} resolved unknown source ${source.id}`);
  }
}

const events=await parseJson("src/data/events.json");
const coverage=await parseJson("src/data/coverage.json");
const geocodeCache=await parseJson("src/data/geocode-cache.json");
const venueGeocodeCache=await parseJson("src/data/venue-geocode-cache.json");

if(Array.isArray(events)){
  const eventIds=new Set;
  let previousTime=-Infinity;
  for(const [index,event] of events.entries()){
    const label=`events[${index}]`;
    for(const field of ["id","title","start","venue","category","sourceId","regionId"]){
      if(event[field]===undefined||event[field]===null||event[field]==="")fail(`${label} missing ${field}`);
    }
    if(eventIds.has(event.id))fail(`Duplicate canonical event id ${event.id}`);
    eventIds.add(event.id);
    if(!regionIds.has(event.regionId))fail(`${label} references unknown region ${event.regionId}`);
    if(!sourceIds.has(event.sourceId))fail(`${label} references unknown source ${event.sourceId}`);
    if(!finite(event.lat,-90,90)||!finite(event.lng,-180,180))fail(`${label} has invalid coordinates`);
    if(String(event.venue||"").length>180)fail(`${label} venue is suspiciously long`);
    if(/San Diego Family Magazine|CURRENT & PAST ISSUES|Resources Education Directory/i.test(String(event.venue||"")))fail(`${label} venue contains page chrome`);
    const time=Date.parse(event.start);
    if(!Number.isFinite(time))fail(`${label} has invalid start ${event.start}`);
    if(Number.isFinite(time)&&time<previousTime)fail("events.json is not sorted chronologically");
    if(Number.isFinite(time))previousTime=time;
    if(!Array.isArray(event.sources)||!event.sources.length)fail(`${label} has no provenance sources`);
  }
}else if(events!==null){
  fail("src/data/events.json must contain an array");
}

if(coverage){
  if(!coverage.regions||typeof coverage.regions!=="object")fail("coverage.json is missing regions");
  for(const regionId of regionIds)if(!coverage.regions?.[regionId])fail(`coverage.json missing region ${regionId}`);
}

if(geocodeCache&&typeof geocodeCache==="object"){
  for(const [query,point] of Object.entries(geocodeCache)){
    if(!finite(point?.lat,-90,90)||!finite(point?.lng,-180,180))fail(`geocode-cache entry "${query}" has invalid coordinates`);
  }
}
if(venueGeocodeCache&&typeof venueGeocodeCache==="object"){
  for(const [query,point] of Object.entries(venueGeocodeCache)){
    if(!finite(point?.lat,-90,90)||!finite(point?.lng,-180,180))fail(`venue-geocode-cache entry "${query}" has invalid coordinates`);
  }
}

if(failures.length){
  console.error("Locale foundation validation failed:");
  for(const failure of failures)console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`Locale foundation validation passed: ${regionIds.size} regions, ${sourceIds.size} sources, ${Array.isArray(events)?events.length:0} events.`);
