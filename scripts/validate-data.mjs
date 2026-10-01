import {readFile} from "node:fs/promises";
import {DEFAULT_REGION_ID,REGIONS} from "./regions.mjs";
import {loadAllSources,sourcesForRegionFrom} from "./source-catalog.mjs";

const SOURCES=await loadAllSources();

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
  if(source.excludedFromLocale&&source.enabled!==false)fail(`Excluded source ${source.id} must be disabled`);
  if(source.ownerEntityKind&&!["place","organizer"].includes(source.ownerEntityKind))fail(`Source ${source.id} has invalid ownerEntityKind ${source.ownerEntityKind}`);
  if(source.ownerEntityKind&&!source.ownerName)fail(`Source ${source.id} has ownerEntityKind without ownerName`);
  if(["local","regional"].includes(source.scope)){
    if(!Array.isArray(source.regions)||!source.regions.length)fail(`${source.scope} source ${source.id} has no regions`);
    for(const regionId of source.regions||[])if(!regionIds.has(regionId))fail(`Source ${source.id} references unknown region ${regionId}`);
  }
}
for(const region of Object.values(REGIONS)){
  for(const source of sourcesForRegionFrom(SOURCES,region)){
    if(!sourceIds.has(source.id))fail(`Region ${region.id} resolved unknown source ${source.id}`);
  }
}

const events=await parseJson("src/data/events.json");
const coverage=await parseJson("src/data/coverage.json");
const geocodeCache=await parseJson("src/data/geocode-cache.json");
const venueGeocodeCache=await parseJson("src/data/venue-geocode-cache.json");
const places=await parseJson("src/data/places.json");
const organizers=await parseJson("src/data/organizers.json");
const series=await parseJson("src/data/series.json");
const entitySourceLinks=await parseJson("src/data/entity-source-links.json");

const placeIds=new Set;
const organizerIds=new Set;
const seriesIds=new Set;

if(Array.isArray(places)){
  for(const [index,place] of places.entries()){
    const label=`places[${index}]`;
    for(const field of ["id","regionId","name","monitorTier"]){
      if(place[field]===undefined||place[field]===null||place[field]==="")fail(`${label} missing ${field}`);
    }
    if(placeIds.has(place.id))fail(`Duplicate place id ${place.id}`);
    placeIds.add(place.id);
    if(!regionIds.has(place.regionId))fail(`${label} references unknown region ${place.regionId}`);
    if(!["A","B","C"].includes(place.monitorTier))fail(`${label} has invalid monitorTier ${place.monitorTier}`);
    if(coverage?.registryPlaceQualityVersion>=1&&(String(place.name||"").length>110||/^\s*\$/.test(String(place.name||""))||/class\s*=|aria-label\s*=|thumbnail|\.png\b|\.jpe?g\b|\.webp\b|https?:\/\/|www\.|<[^>]+>/i.test(String(place.name||""))))fail(`${label} contains page chrome instead of a canonical place name`);
    if(place.lat!==null&&!finite(place.lat,-90,90))fail(`${label} has invalid latitude`);
    if(place.lng!==null&&!finite(place.lng,-180,180))fail(`${label} has invalid longitude`);
    if(!Array.isArray(place.sourceIds))fail(`${label} sourceIds must be an array`);
    for(const sourceId of place.sourceIds||[])if(!sourceIds.has(sourceId))fail(`${label} references unknown source ${sourceId}`);
  }
}else if(places!==null)fail("src/data/places.json must contain an array");

if(Array.isArray(organizers)){
  for(const [index,organizer] of organizers.entries()){
    const label=`organizers[${index}]`;
    for(const field of ["id","regionId","name"]){
      if(organizer[field]===undefined||organizer[field]===null||organizer[field]==="")fail(`${label} missing ${field}`);
    }
    if(organizerIds.has(organizer.id))fail(`Duplicate organizer id ${organizer.id}`);
    organizerIds.add(organizer.id);
    if(!regionIds.has(organizer.regionId))fail(`${label} references unknown region ${organizer.regionId}`);
    if(organizer.monitorTier!=="D")fail(`${label} must use monitorTier D`);
    for(const sourceId of organizer.sourceIds||[])if(!sourceIds.has(sourceId))fail(`${label} references unknown source ${sourceId}`);
  }
}else if(organizers!==null)fail("src/data/organizers.json must contain an array");

if(Array.isArray(series)){
  for(const [index,item] of series.entries()){
    const label=`series[${index}]`;
    for(const field of ["id","regionId","name","venueId"]){
      if(item[field]===undefined||item[field]===null||item[field]==="")fail(`${label} missing ${field}`);
    }
    if(seriesIds.has(item.id))fail(`Duplicate series id ${item.id}`);
    seriesIds.add(item.id);
    if(!regionIds.has(item.regionId))fail(`${label} references unknown region ${item.regionId}`);
    if(!placeIds.has(item.venueId))fail(`${label} references unknown venueId ${item.venueId}`);
    if(item.organizerId&&!organizerIds.has(item.organizerId))fail(`${label} references unknown organizerId ${item.organizerId}`);
    if(!item.recurrence||typeof item.recurrence!=="object")fail(`${label} is missing recurrence`);
    if(item.status!=="confirmed"&&item.status!=="candidate")fail(`${label} has invalid status ${item.status}`);
  }
}else if(series!==null)fail("src/data/series.json must contain an array");

if(Array.isArray(entitySourceLinks)){
  const linkIds=new Set;
  for(const [index,link] of entitySourceLinks.entries()){
    const label=`entity-source-links[${index}]`;
    for(const field of ["id","entityType","entityId","sourceId"]){
      if(link[field]===undefined||link[field]===null||link[field]==="")fail(`${label} missing ${field}`);
    }
    if(linkIds.has(link.id))fail(`Duplicate entity source link id ${link.id}`);
    linkIds.add(link.id);
    if(!sourceIds.has(link.sourceId))fail(`${label} references unknown source ${link.sourceId}`);
    const knownEntity=link.entityType==="place"?placeIds.has(link.entityId):link.entityType==="organizer"?organizerIds.has(link.entityId):link.entityType==="series"?seriesIds.has(link.entityId):false;
    if(!knownEntity)fail(`${label} references unknown ${link.entityType} ${link.entityId}`);
    if(!Array.isArray(link.roles)||!link.roles.length)fail(`${label} must contain at least one role`);
  }
}else if(entitySourceLinks!==null)fail("src/data/entity-source-links.json must contain an array");

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
    if(coverage?.locationQualityVersion>=1&&String(event.venue||"").length>180)fail(`${label} venue is suspiciously long`);
    if(coverage?.locationQualityVersion>=1&&/San Diego Family Magazine|CURRENT & PAST ISSUES|Resources Education Directory/i.test(String(event.venue||"")))fail(`${label} venue contains page chrome`);
    const time=Date.parse(event.start);
    if(!Number.isFinite(time))fail(`${label} has invalid start ${event.start}`);
    if(Number.isFinite(time)&&time<previousTime)fail("events.json is not sorted chronologically");
    if(Number.isFinite(time))previousTime=time;
    if(!Array.isArray(event.sources)||!event.sources.length)fail(`${label} has no provenance sources`);
    if(event.venueId&&!placeIds.has(event.venueId))fail(`${label} references unknown venueId ${event.venueId}`);
    if(event.organizerId&&!organizerIds.has(event.organizerId))fail(`${label} references unknown organizerId ${event.organizerId}`);
    if(event.seriesId&&!seriesIds.has(event.seriesId))fail(`${label} references unknown seriesId ${event.seriesId}`);
  }
}else if(events!==null){
  fail("src/data/events.json must contain an array");
}

if(coverage){
  if(!coverage.regions||typeof coverage.regions!=="object")fail("coverage.json is missing regions");
  for(const regionId of regionIds)if(!coverage.regions?.[regionId])fail(`coverage.json missing region ${regionId}`);
  if(coverage.registryContractVersion>=1){
    for(const regionId of regionIds){
      const registry=coverage.regions?.[regionId]?.registry;
      if(!registry){fail(`coverage.json missing registry summary for ${regionId}`);continue;}
      const expectedPlaces=Array.isArray(places)?places.filter(place=>place.regionId===regionId).length:0;
      const expectedOrganizers=Array.isArray(organizers)?organizers.filter(organizer=>organizer.regionId===regionId).length:0;
      const expectedSeries=Array.isArray(series)?series.filter(item=>item.regionId===regionId).length:0;
      if(registry.placeCount!==expectedPlaces)fail(`coverage registry placeCount mismatch for ${regionId}`);
      if(registry.organizerCount!==expectedOrganizers)fail(`coverage registry organizerCount mismatch for ${regionId}`);
      if(registry.seriesCount!==expectedSeries)fail(`coverage registry seriesCount mismatch for ${regionId}`);
    }
  }
}

if(geocodeCache&&typeof geocodeCache==="object"){
  for(const [query,point] of Object.entries(geocodeCache)){
    if(!finite(point?.lat,-90,90)||!finite(point?.lng,-180,180))fail(`geocode-cache entry "${query}" has invalid coordinates`);
  }
}
if(venueGeocodeCache&&typeof venueGeocodeCache==="object"){
  for(const [query,point] of Object.entries(venueGeocodeCache)){
    if(point?.miss){
      if(point.checkedAt&&!Number.isFinite(Date.parse(point.checkedAt)))fail(`venue-geocode-cache miss "${query}" has invalid checkedAt`);
      continue;
    }
    if(!finite(point?.lat,-90,90)||!finite(point?.lng,-180,180))fail(`venue-geocode-cache entry "${query}" has invalid coordinates`);
  }
}

if(failures.length){
  console.error("Locale foundation validation failed:");
  for(const failure of failures)console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`Locale foundation validation passed: ${regionIds.size} regions, ${sourceIds.size} sources, ${Array.isArray(events)?events.length:0} events, ${placeIds.size} places, ${organizerIds.size} organizers, ${seriesIds.size} series.`);
