import {readFile,writeFile,mkdir} from "node:fs/promises";
import {ticketmasterEvents} from "./providers/ticketmaster.mjs";
import {sanDiegoCityEvents} from "./providers/sandiego-city.mjs";
import {powayEvents} from "./providers/poway.mjs";
import {localistEvents} from "./providers/localist.mjs";
import {tribeEvents} from "./providers/tribe.mjs";
import {jsonLdEvents} from "./providers/jsonld.mjs";
import {rssEvents,rssDetailEvents} from "./providers/rss.mjs";
import {jsonLdCrawlEvents} from "./providers/jsonld-crawl.mjs";
import {novaEvents} from "./providers/nova.mjs";
import {spinEvents} from "./providers/spin.mjs";
import {comedyStoreEvents} from "./providers/comedy-store.mjs";
import {micDropEvents} from "./providers/micdrop.mjs";
import {embeddedJsonEvents} from "./providers/embedded-json.mjs";
import {sanDiegoFamilyEvents} from "./providers/sandiego-family.mjs";
import {sanDiegoParksEvents} from "./providers/sandiego-parks.mjs";
import {usdEvents} from "./providers/usd.mjs";
import {sdsuEvents} from "./providers/sdsu.mjs";
import {icsEvents} from "./providers/ics.mjs";
import {sdplEvents} from "./providers/sdpl.mjs";
import {midwayEvents} from "./providers/midway.mjs";
import {sunsetTriviaEvents} from "./providers/sunset-trivia.mjs";
import {canonicalizeVenue} from "./venue-canonical.mjs";
import {geocodeVenue,saveVenueGeocodeCache} from "./venue-geocode.mjs";
import {SOURCES,sourcesForRegion} from "./source-registry.mjs";
import {buildRegistry} from "./registry.mjs";
import {REGIONS} from "./regions.mjs";
import {cellFor} from "./geo-index.mjs";

const adapters={
  "sunset-trivia":async()=>sunsetTriviaEvents(),
  midway:async()=>midwayEvents(),
  sdpl:async()=>sdplEvents(),
  "san-diego-parks":async()=>sanDiegoParksEvents(),
  usd:async()=>usdEvents(),
  sdsu:async()=>sdsuEvents(),
  ics:async(region,source)=>icsEvents({endpoint:source.endpoint,sourceName:source.name,sourceId:source.id,fallbackCenter:source.fallbackCenter,days:45}),
  "sandiego-family":async()=>sanDiegoFamilyEvents(),
  nova:async()=>novaEvents(),
  spin:async()=>spinEvents(),
  "comedy-store":async()=>comedyStoreEvents(),
  micdrop:async()=>micDropEvents(),
  "embedded-json":async (region,source)=>embeddedJsonEvents({
    endpoint:source.endpoint,sourceName:source.name,sourceId:source.id,
    fallbackCenter:source.fallbackCenter,days:45
  }),
  ticketmaster:async region=>ticketmasterEvents({
    apiKey:process.env.TICKETMASTER_API_KEY,
    center:region.center,
    radiusMiles:region.ingestRadiusMiles,
    regionId:region.id,
    countryCode:region.countryCode
  }),
  "san-diego-city":async()=>sanDiegoCityEvents(),
  poway:async()=>powayEvents(),
  localist:async (region,source)=>localistEvents({
    endpoint:source.endpoint,
    sourceName:source.name,
    sourceId:source.id,
    fallbackCenter:source.fallbackCenter,
    days:45
  }),
  tribe:async (region,source)=>tribeEvents({
    endpoint:source.endpoint,
    sourceName:source.name,
    sourceId:source.id,
    fallbackCenter:source.fallbackCenter,
    days:45
  }),
  jsonld:async (region,source)=>jsonLdEvents({
    endpoint:source.endpoint,
    sourceName:source.name,
    sourceId:source.id,
    fallbackCenter:source.fallbackCenter
  }),
  rss:async (region,source)=>rssEvents({
    endpoint:source.endpoint,
    sourceName:source.name,
    sourceId:source.id,
    fallbackCenter:source.fallbackCenter
  }),
  "rss-detail":async (region,source)=>rssDetailEvents({
    endpoint:source.endpoint,
    sourceName:source.name,
    sourceId:source.id,
    fallbackCenter:source.fallbackCenter,
    maxLinks:50
  }),
  "jsonld-crawl":async (region,source)=>jsonLdCrawlEvents({
    endpoint:source.endpoint,
    sourceName:source.name,
    sourceId:source.id,
    fallbackCenter:source.fallbackCenter,
    linkPattern:source.linkPattern
  })
};

let previousEvents=[];
let previousRegistry={places:[]};
try{
  const prior=JSON.parse(await readFile("src/data/events.json","utf8"));
  if(Array.isArray(prior))previousEvents=prior;
}catch{}
try{
  const priorPlaces=JSON.parse(await readFile("src/data/places.json","utf8"));
  if(Array.isArray(priorPlaces))previousRegistry.places=priorPlaces;
}catch{}

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runWithRetry(job,attempts=3){
  let lastError;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const value=await job.run(job.region,job.source);
      if(job.source.minExpectedEvents&&Array.isArray(value)&&value.length<job.source.minExpectedEvents){
        throw new Error(`${job.source.id} returned ${value.length} events; expected at least ${job.source.minExpectedEvents}`);
      }
      return value;
    }
    catch(error){
      lastError=error;
      if(attempt<attempts)await sleep(750*attempt);
    }
  }
  throw lastError;
}

const jobs=[];
for(const region of Object.values(REGIONS)){
  for(const source of sourcesForRegion(region)){
    const run=adapters[source.adapter];
    if(run)jobs.push({region,source,run});
    else console.warn(`No adapter registered for source ${source.id}`);
  }
}

const results=await Promise.allSettled(jobs.map(job=>runWithRetry(job)));
const events=[];
const sourceStats=[];
results.forEach((result,index)=>{
  const {region,source}=jobs[index];
  if(result.status==="fulfilled"){
    if(!Array.isArray(result.value)){
      console.error(`${region.id}/${source.id} returned a non-array payload`);
      return;
    }
    sourceStats.push({regionId:region.id,sourceId:source.id,count:result.value.length,status:"ok"});
    events.push(...result.value.map(event=>canonicalizeVenue({
      ...event,
      regionId:event.regionId||region.id,
      sourceId:source.id,
      countryCode:event.countryCode||region.countryCode,
      timeZone:event.timeZone||region.timeZone
    })));
    console.log(`${region.id}/${source.id}: ${result.value.length} events`);
  }else{
    const preserved=previousEvents.filter(event=>
      event.regionId===region.id&&(
        event.sourceId===source.id||
        (Array.isArray(event.sources)&&event.sources.some(item=>item?.id===source.id))
      )
    ).map(event=>({
      ...event,
      staleSourceIds:[...new Set([...(event.staleSourceIds||[]),source.id])]
    }));
    events.push(...preserved);
    sourceStats.push({regionId:region.id,sourceId:source.id,count:preserved.length,status:preserved.length?"stale-preserved":"failed"});
    console.error(`${region.id}/${source.id} failed after retries; preserved ${preserved.length} last-known-good events:`,result.reason);
  }
});

if(!events.length){
  console.log("Providers returned no events; leaving current event files unchanged.");
  process.exit(0);
}

let enrichedLocations=0;
for(let index=0;index<events.length;index++){
  const event=events[index];
  if(event.locationPrecision!=="source-center")continue;
  const region=REGIONS[event.regionId];
  const point=await geocodeVenue(event.address||event.venue,region);
  if(!point)continue;
  events[index]={...event,lat:point.lat,lng:point.lng,locationPrecision:"venue-geocoded"};
  enrichedLocations++;
}
await saveVenueGeocodeCache();
console.log(`Venue enrichment: ${enrichedLocations} source-center events resolved to named venues.`);

const words=value=>new Set(String(value||"").toLowerCase().replace(/\b(202[0-9]|annual|the|presented by)\b/g,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean));
const similarity=(a,b)=>{
  const A=words(a),B=words(b);
  if(!A.size||!B.size)return 0;
  let matches=0;
  for(const value of A)if(B.has(value))matches++;
  return matches/Math.max(A.size,B.size);
};
const sameEvent=(a,b)=>String(a.start).slice(0,10)===String(b.start).slice(0,10)
  &&(a.venueKey&&b.venueKey?a.venueKey===b.venueKey:similarity(a.venue,b.venue)>=.72)
  &&similarity(a.title,b.title)>=.68;
const provenance=event=>event.sources||[{id:event.sourceId,name:event.source,url:event.sourceUrl||event.url}];
const merge=(a,b)=>{
  const sources=[...provenance(a),...provenance(b)];
  const uniqueSources=[...new Map(sources.filter(source=>source.name).map(source=>[(source.id||source.name)+"|"+(source.url||""),source])).values()]
    .sort((left,right)=>String(left.id||left.name).localeCompare(String(right.id||right.name)));
  const primary=a.source==="Ticketmaster"?a:b.source==="Ticketmaster"?b:a;
  const other=primary===a?b:a;
  return {
    ...other,
    ...primary,
    description:primary.description||other.description||"",
    image:primary.image||other.image||null,
    price:primary.price||other.price||null,
    priceStatus:primary.priceStatus!=="unknown"?primary.priceStatus:other.priceStatus||"unknown",
    sources:uniqueSources,
    sourceCount:uniqueSources.length
  };
};

const unique=[];
for(const raw of events){
  const event={...raw,geoCell:cellFor(raw.lat,raw.lng)};
  const matchIndex=unique.findIndex(candidate=>sameEvent(candidate,event));
  if(matchIndex<0){
    unique.push({...event,sources:provenance(event),sourceCount:1});
  }else{
    unique[matchIndex]=merge(unique[matchIndex],event);
  }
}

const sorted=unique.sort((a,b)=>{
  const timeDifference=new Date(a.start)-new Date(b.start);
  return timeDifference||String(a.id).localeCompare(String(b.id));
});

const registry=buildRegistry(sorted,SOURCES,previousRegistry);
const canonicalEvents=registry.events;

const coverage={generatedAt:new Date().toISOString(),locationQualityVersion:1,registryContractVersion:registry.coverage.contractVersion,registryPlaceQualityVersion:1,regions:{}};
for(const region of Object.values(REGIONS)){
  const regionEvents=canonicalEvents.filter(event=>event.regionId===region.id);
  const sourceIds=[...new Set(regionEvents.flatMap(event=>provenance(event).map(source=>source.id)).filter(Boolean))].sort();
  const categoryCounts={};
  const sourceCounts={};
  const categorySourceCounts={};
  const categorySourceDiversity={};
  const locationPrecisionCounts={};
  const approximatePrecisions=new Set(["source-center","city-only","region-only","campus-only","unresolved"]);
  let approximateLocationCount=0;
  for(const event of regionEvents){
    const category=event.category||"other";
    categoryCounts[category]=(categoryCounts[category]||0)+1;
    const precision=event.locationPrecision||"unknown";
    locationPrecisionCounts[precision]=(locationPrecisionCounts[precision]||0)+1;
    if(approximatePrecisions.has(precision))approximateLocationCount++;
    if(!categorySourceCounts[category])categorySourceCounts[category]={};
    for(const source of provenance(event)){
      const key=source.id||source.name||"unknown";
      sourceCounts[key]=(sourceCounts[key]||0)+1;
      categorySourceCounts[category][key]=(categorySourceCounts[category][key]||0)+1;
    }
  }
  for(const [category,counts] of Object.entries(categorySourceCounts)){
    categorySourceDiversity[category]=Object.keys(counts).length;
  }
  coverage.regions[region.id]={
    eventCount:regionEvents.length,
    sourceIds,
    cells:[...new Set(regionEvents.map(event=>event.geoCell).filter(Boolean))].length,
    categoryCounts,
    sourceCounts,
    categorySourceCounts,
    categorySourceDiversity,
    sourceHealth:sourceStats.filter(stat=>stat.regionId===region.id),
    locationPrecisionCounts,
    preciseLocationCount:regionEvents.length-approximateLocationCount,
    approximateLocationCount,
    preciseLocationRate:Number(((regionEvents.length-approximateLocationCount)/Math.max(1,regionEvents.length)).toFixed(3)),
    registry:registry.coverage.regions[region.id]||{
      placeCount:0,organizerCount:0,seriesCount:0,entitySourceLinkCount:0,
      monitorTierCounts:{A:0,B:0,C:0,D:0},multiSourcePlaceCount:0,
      recurringEventCount:0,eventsWithVenueId:0,eventsWithOrganizerId:0
    }
  };
  console.log(`${region.id} location quality: ${regionEvents.length-approximateLocationCount}/${regionEvents.length} precise (${(coverage.regions[region.id].preciseLocationRate*100).toFixed(1)}%), ${approximateLocationCount} approximate.`);
}

await mkdir("src/data",{recursive:true});
await writeFile("src/data/events.json",JSON.stringify(canonicalEvents,null,2)+"\n");
await writeFile("src/data/places.json",JSON.stringify(registry.places,null,2)+"\n");
await writeFile("src/data/organizers.json",JSON.stringify(registry.organizers,null,2)+"\n");
await writeFile("src/data/series.json",JSON.stringify(registry.series,null,2)+"\n");
await writeFile("src/data/entity-source-links.json",JSON.stringify(registry.entitySources,null,2)+"\n");
await writeFile("src/data/coverage.json",JSON.stringify(coverage,null,2)+"\n");
console.log(`Registry: ${registry.places.length} places, ${registry.organizers.length} organizers, ${registry.series.length} recurring series, ${registry.entitySources.length} entity/source links.`);
console.log(`Wrote ${canonicalEvents.length} canonical events from ${events.length} provider records across ${Object.keys(REGIONS).length} regions.`);
