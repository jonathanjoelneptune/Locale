import {readFile,writeFile} from "node:fs/promises";
import {isPreciseLocation} from "./location-quality.mjs";
import {REGIONS} from "./regions.mjs";

const OUT="src/data/coverage-dashboard.json";
const readJson=async(path,fallback)=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch{return fallback}
};
const finite=value=>Number.isFinite(Number(value));
const recurringPattern=/\b(trivia|karaoke|taco\s+tuesday|open\s+mic|bingo|happy\s+hour)\b/i;

function miles(a,b){
  if(!finite(a?.lat)||!finite(a?.lng)||!finite(b?.lat)||!finite(b?.lng))return Infinity;
  const R=3958.7613,toRad=value=>Number(value)*Math.PI/180;
  const dLat=toRad(Number(b.lat)-Number(a.lat)),dLng=toRad(Number(b.lng)-Number(a.lng));
  const lat1=toRad(a.lat),lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

function localParts(date,timeZone){
  const parts=new Intl.DateTimeFormat("en-US",{
    timeZone,weekday:"short",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(part=>part.type!=="literal").map(part=>[part.type,part.value]));
}

function localDateKey(date,timeZone){
  const p=localParts(date,timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

function upcomingWeekendNights(now,timeZone,days=28){
  const keys=[];
  for(let offset=0;offset<days;offset++){
    const date=new Date(now.getTime()+offset*86400000);
    const p=localParts(date,timeZone);
    if(p.weekday==="Fri"||p.weekday==="Sat")keys.push(`${p.year}-${p.month}-${p.day}`);
  }
  return [...new Set(keys)];
}

export function neighborhoodCoverage(events,neighborhood,region,{now=new Date(),days=28}={}){
  const horizon=now.getTime()+days*86400000;
  const nightKeys=upcomingWeekendNights(now,region.timeZone,days);
  const nightCounts=Object.fromEntries(nightKeys.map(key=>[key,0]));
  const relevant=(events||[]).filter(event=>{
    if(event.regionId!==neighborhood.regionId||!isPreciseLocation(event))return false;
    const start=Date.parse(event.start);
    if(!Number.isFinite(start)||start<now.getTime()-3600000||start>horizon)return false;
    return miles(event,neighborhood)<=Number(neighborhood.radiusMiles);
  });
  const venues=new Set;
  let recurring30d=0;
  for(const event of relevant){
    venues.add(event.venueId||event.venue||event.id);
    if(recurringPattern.test(`${event.title||""} ${event.description||""}`))recurring30d++;
    const date=new Date(event.start);
    const p=localParts(date,region.timeZone);
    const key=localDateKey(date,region.timeZone);
    const hour=Number(p.hour);
    if((p.weekday==="Fri"||p.weekday==="Sat")&&hour>=16&&nightCounts[key]!==undefined)nightCounts[key]++;
  }
  const counts=Object.values(nightCounts);
  const avg=counts.length?counts.reduce((sum,value)=>sum+value,0)/counts.length:0;
  const activeNights=counts.filter(value=>value>0).length;
  const targetAverage=8,targetRecurring=5;
  return {
    id:neighborhood.id,
    name:neighborhood.name,
    radiusMiles:neighborhood.radiusMiles,
    preciseEventsNext28d:relevant.length,
    uniqueVenuesNext28d:venues.size,
    fridaySaturdayNightAverage:Number(avg.toFixed(1)),
    fridaySaturdayNightMax:counts.length?Math.max(...counts):0,
    activeFridaySaturdayNights:activeNights,
    measuredFridaySaturdayNights:counts.length,
    recurringLocalOccurrences30d:recurring30d,
    targets:{fridaySaturdayNightAverage:targetAverage,recurringLocalOccurrences30d:targetRecurring},
    acceptance:{
      density:avg>=targetAverage,
      recurring:recurring30d>=targetRecurring,
      pass:avg>=targetAverage&&recurring30d>=targetRecurring
    },
    nightCounts
  };
}

function reasonCounts(queue){
  const out={};
  for(const item of queue||[]){
    const reason=item?.lastResult?.reason||item?.status||"unknown";
    out[reason]=(out[reason]||0)+1;
  }
  return Object.fromEntries(Object.entries(out).sort((a,b)=>b[1]-a[1]));
}

function sourceSummary(sourceHealth=[]){
  return [...sourceHealth].sort((a,b)=>{
    const rank=value=>value==="failed"?0:value==="stale-preserved"?1:2;
    return rank(a.status)-rank(b.status)||a.count-b.count||a.sourceId.localeCompare(b.sourceId);
  });
}

export async function buildCoverageDashboard({now=new Date()}={}){
  const [events,coverage,places,discoveryCoverage,discoveryQueue,discoveredSources,locationCoverage,locationQueue,neighborhoods]=await Promise.all([
    readJson("src/data/events.json",[]),
    readJson("src/data/coverage.json",{regions:{}}),
    readJson("src/data/places.json",[]),
    readJson("src/data/discovery-coverage.json",{regions:{}}),
    readJson("src/data/discovery-queue.json",[]),
    readJson("src/data/discovered-sources.json",[]),
    readJson("src/data/location-resolution-coverage.json",{regions:{}}),
    readJson("src/data/location-resolution-queue.json",[]),
    readJson("src/data/neighborhoods.json",[])
  ]);

  const regions={};
  for(const region of Object.values(REGIONS)){
    const eventCoverage=coverage.regions?.[region.id]||{};
    const discovery=discoveryCoverage.regions?.[region.id]||{};
    const location=locationCoverage.regions?.[region.id]||{};
    const regionEvents=events.filter(event=>event.regionId===region.id);
    const regionPlaces=places.filter(place=>place.regionId===region.id);
    const regionDiscovery=discoveryQueue.filter(item=>item.regionId===region.id);
    const regionLocationQueue=locationQueue.filter(item=>item.regionId===region.id);
    const precise=regionEvents.filter(isPreciseLocation).length;
    const neighborhoodRows=neighborhoods
      .filter(item=>item.regionId===region.id)
      .map(item=>neighborhoodCoverage(regionEvents,item,region,{now}));

    regions[region.id]={
      name:region.name,
      eventCount:regionEvents.length,
      preciseLocationCount:precise,
      preciseLocationRate:Number((precise/Math.max(1,regionEvents.length)).toFixed(3)),
      preciseLocationTarget:0.9,
      preciseLocationTargetMet:precise/Math.max(1,regionEvents.length)>=0.9,
      placeCount:regionPlaces.length,
      sourceCount:(eventCoverage.sourceIds||[]).length,
      dynamicSourceCount:discoveredSources.filter(source=>source.regions?.includes(region.id)).length,
      categoryCounts:eventCoverage.categoryCounts||{},
      recurringActivityCounts:eventCoverage.recurringActivityCounts||{},
      sourceHealth:sourceSummary(eventCoverage.sourceHealth||[]),
      discovery:{
        candidateCount:regionDiscovery.length,
        withWebsiteCount:regionDiscovery.filter(item=>!!item.website).length,
        qualifiedCount:regionDiscovery.filter(item=>item.status==="qualified").length,
        retryCount:regionDiscovery.filter(item=>item.status==="retry").length,
        needsWebsiteCount:regionDiscovery.filter(item=>item.status==="needs-website").length,
        dueCount:discovery.dueCount||0,
        promotionRate:Number((regionDiscovery.filter(item=>item.status==="qualified").length/Math.max(1,regionDiscovery.filter(item=>!!item.website).length)).toFixed(3)),
        cells:discovery.discoveryCells||null,
        failureReasons:reasonCounts(regionDiscovery.filter(item=>item.status!=="qualified"))
      },
      locationResolution:{
        unresolvedVenueCount:regionLocationQueue.filter(item=>item.status!=="resolved").length,
        resolvedPendingRefreshCount:regionLocationQueue.filter(item=>item.status==="resolved").length,
        representedEventCount:regionLocationQueue.reduce((sum,item)=>sum+Number(item.eventCount||0),0),
        highPriorityCount:regionLocationQueue.filter(item=>item.status!=="resolved"&&Number(item.priority||0)>=50).length,
        run:locationCoverage.run||null
      },
      neighborhoods:neighborhoodRows,
      neighborhoodAcceptance:{
        measured:neighborhoodRows.length,
        passing:neighborhoodRows.filter(row=>row.acceptance.pass).length
      }
    };
  }

  const output={
    generatedAt:new Date().toISOString(),
    metricVersion:1,
    targets:{
      regionPreciseLocationRate:0.9,
      neighborhoodFridaySaturdayNightAverage:8,
      neighborhoodRecurringLocalOccurrences30d:5
    },
    regions
  };
  await writeFile(OUT,JSON.stringify(output,null,2)+"\n");
  return output;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const output=await buildCoverageDashboard();
  for(const [id,region] of Object.entries(output.regions)){
    console.log(`${id}: ${(region.preciseLocationRate*100).toFixed(1)}% precise, ${region.discovery.qualifiedCount}/${region.discovery.withWebsiteCount} discovery sources qualified, ${region.neighborhoodAcceptance.passing}/${region.neighborhoodAcceptance.measured} neighborhood checks passing.`);
  }
}
