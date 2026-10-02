import {readFile,writeFile} from "node:fs/promises";
import {REGIONS} from "./regions.mjs";
import {geocodeVenue,saveVenueGeocodeCache} from "./venue-geocode.mjs";

const QUEUE_PATH="src/data/location-resolution-queue.json";
const COVERAGE_PATH="src/data/location-resolution-coverage.json";
const DEFAULT_TARGET_PRECISION=.90;
const AGGRESSIVE_MAX_RESOLUTIONS=160;
const CATCHUP_MAX_RESOLUTIONS=60;
const MAINTENANCE_MAX_RESOLUTIONS=20;
const APPROXIMATE=new Set(["source-center","city-only","region-only","campus-only","unresolved","unknown",""]);
const RECURRING=/\b(trivia|karaoke|taco\s+tuesday|open\s+mic|bingo|happy\s+hour|weekly|every\s+(?:mon|tue|wed|thu|fri|sat|sun))\b/i;

const readJson=async(path,fallback)=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch{return fallback}
};
const norm=value=>String(value||"").toLowerCase().replace(/&amp;|&#x27;|&#39;/g," ").replace(/[^a-z0-9]+/g," ").trim();
const nowIso=()=>new Date().toISOString();
const due=item=>!item.nextCheckAt||Date.parse(item.nextCheckAt)<=Date.now();
const vague=/^(?:tbd|location tba|location|unknown|various|multiple locations?|san diego|chicago)$/i;

function cleanQuery(value){
  return String(value||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}
function queryFor(event){
  const hint=cleanQuery(event.geocodeQuery);
  if(hint&&hint.length<=180&&!/[{}\[\]"@]|schema\.org/i.test(hint)&&!vague.test(hint))return {query:hint,hasAddress:false,kind:"hint"};
  const address=cleanQuery(event.address);
  if(address&&address.length<=180&&!/[{}\[\]"@]|schema\.org/i.test(address))return {query:address,hasAddress:true,kind:"address"};
  const venue=cleanQuery(event.venue);
  if(!venue||venue.length>140||vague.test(venue))return null;
  return {query:venue,hasAddress:false,kind:"venue"};
}

function priorityFor(group){
  let score=Math.min(50,group.eventCount*2);
  if(group.hasAddress)score+=30;
  if(group.recurringCount)score+=25;
  if(group.categories.includes("nightlife"))score+=15;
  if(group.categories.includes("music"))score+=10;
  return score;
}

const events=await readJson("src/data/events.json",[]);
const eventCoverage=await readJson("src/data/coverage.json",{regions:{}});
const previous=await readJson(QUEUE_PATH,[]);
const regionRates=Object.values(eventCoverage.regions||{}).map(region=>Number(region?.preciseLocationRate)).filter(Number.isFinite);
const lowestPrecisionRate=regionRates.length?Math.min(...regionRates):0;
const MAX_RESOLUTIONS_PER_RUN=lowestPrecisionRate<DEFAULT_TARGET_PRECISION
  ?AGGRESSIVE_MAX_RESOLUTIONS
  :lowestPrecisionRate<.95?CATCHUP_MAX_RESOLUTIONS:MAINTENANCE_MAX_RESOLUTIONS;
const resolutionMode=lowestPrecisionRate<DEFAULT_TARGET_PRECISION?"aggressive":lowestPrecisionRate<.95?"catchup":"maintenance";
const previousByKey=new Map((Array.isArray(previous)?previous:[]).map(item=>[item.key,item]));
const groups=new Map();

for(const event of events){
  const precision=String(event.locationPrecision||"");
  if(!APPROXIMATE.has(precision))continue;
  const target=queryFor(event);
  if(!target)continue;
  const key=`${event.regionId}|${norm(target.query)}`;
  if(!groups.has(key))groups.set(key,{
    key,regionId:event.regionId,query:target.query,queryKind:target.kind||"venue",venue:event.venue||null,address:event.address||null,
    hasAddress:target.hasAddress,eventCount:0,recurringCount:0,categories:new Set,sourceIds:new Set
  });
  const group=groups.get(key);
  group.eventCount++;
  if(RECURRING.test(`${event.title||""} ${event.description||""}`))group.recurringCount++;
  if(event.category)group.categories.add(event.category);
  for(const source of event.sources||[{id:event.sourceId}])if(source?.id)group.sourceIds.add(source.id);
}

const queue=[...groups.values()].map(group=>{
  const prior=previousByKey.get(group.key)||{};
  const item={
    key:group.key,
    regionId:group.regionId,
    query:group.query,
    queryKind:group.queryKind,
    venue:group.venue,
    address:group.address,
    hasAddress:group.hasAddress,
    eventCount:group.eventCount,
    recurringCount:group.recurringCount,
    categories:[...group.categories].sort(),
    sourceIds:[...group.sourceIds].sort(),
    priority:0,
    status:prior.status==="resolved"?"resolved":"pending",
    attempts:Number(prior.attempts||0),
    firstSeenAt:prior.firstSeenAt||nowIso(),
    lastAttemptAt:prior.lastAttemptAt||null,
    nextCheckAt:prior.nextCheckAt||null,
    resolvedAt:prior.resolvedAt||null,
    point:prior.point||null
  };
  item.priority=priorityFor(item);
  return item;
});

const candidates=queue
  .filter(item=>item.status!=="resolved"&&due(item))
  .sort((a,b)=>b.priority-a.priority||b.eventCount-a.eventCount||a.query.localeCompare(b.query))
  .slice(0,MAX_RESOLUTIONS_PER_RUN);

let resolved=0,failed=0;
for(const item of candidates){
  const region=REGIONS[item.regionId];
  if(!region)continue;
  item.attempts++;
  item.lastAttemptAt=nowIso();
  const point=await geocodeVenue(item.query,region);
  if(point){
    item.status="resolved";
    item.resolvedAt=nowIso();
    item.nextCheckAt=null;
    item.point={lat:point.lat,lng:point.lng,displayName:point.displayName||item.query};
    resolved++;
  }else{
    item.status="retry";
    item.nextCheckAt=new Date(Date.now()+Math.min(7*86400000,Math.max(24,24*item.attempts)*3600000)).toISOString();
    failed++;
  }
}
await saveVenueGeocodeCache();

const regions={};
for(const region of Object.values(REGIONS)){
  const rows=queue.filter(item=>item.regionId===region.id);
  regions[region.id]={
    unresolvedVenueCount:rows.filter(item=>item.status!=="resolved").length,
    resolvedPendingRefreshCount:rows.filter(item=>item.status==="resolved").length,
    representedEventCount:rows.reduce((sum,item)=>sum+item.eventCount,0),
    highPriorityCount:rows.filter(item=>item.priority>=50&&item.status!=="resolved").length,
    recurringEventCount:rows.reduce((sum,item)=>sum+item.recurringCount,0),
    attemptedThisRun:candidates.filter(item=>item.regionId===region.id).length
  };
}

queue.sort((a,b)=>a.regionId.localeCompare(b.regionId)||Number(b.status==="resolved")-Number(a.status==="resolved")||b.priority-a.priority||a.query.localeCompare(b.query));
await writeFile(QUEUE_PATH,JSON.stringify(queue,null,2)+"\n");
await writeFile(COVERAGE_PATH,JSON.stringify({
  generatedAt:nowIso(),
  run:{
    attempted:candidates.length,resolved,failed,maxPerRun:MAX_RESOLUTIONS_PER_RUN,
    mode:resolutionMode,targetPrecision:DEFAULT_TARGET_PRECISION,startingPrecisionRate:lowestPrecisionRate
  },
  regions
},null,2)+"\n");

console.log(`Location resolution (${resolutionMode}, starting precision ${(lowestPrecisionRate*100).toFixed(1)}%): ${candidates.length} attempted, ${resolved} resolved, ${failed} unresolved; ${queue.length} venue queries tracked.`);
