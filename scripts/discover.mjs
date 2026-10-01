import {readFile,writeFile,mkdir} from "node:fs/promises";
import {REGIONS} from "./regions.mjs";
import {discoverCellPlaces} from "./discovery-overpass.mjs";
import {buildDiscoveryCells,discoveryCellSummary} from "./discovery-grid.mjs";
import {qualifyDiscoveryCandidate} from "./discovery-probe.mjs";

const QUEUE_PATH="src/data/discovery-queue.json";
const SOURCES_PATH="src/data/discovered-sources.json";
const STATE_PATH="src/data/discovery-state.json";
const COVERAGE_PATH="src/data/discovery-coverage.json";
const MAX_PROBES_PER_RUN=8;
const DISCOVERY_SWEEP_VERSION=3;
const CELLS_PER_RUN=2;
const CELL_RETRY_MS=2*60*60*1000;
const MAX_QUEUE=6000;

const readJson=async(path,fallback)=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch{return fallback}
};
const nowIso=()=>new Date().toISOString();
const norm=value=>String(value||"").toLowerCase().replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
const finite=value=>Number.isFinite(Number(value));
const due=item=>!item.nextCheckAt||Date.parse(item.nextCheckAt)<=Date.now();
const hoursFromNow=hours=>new Date(Date.now()+hours*3600000).toISOString();

function miles(a,b){
  if(!finite(a?.lat)||!finite(a?.lng)||!finite(b?.lat)||!finite(b?.lng))return Infinity;
  const R=3958.7613,toRad=value=>Number(value)*Math.PI/180;
  const dLat=toRad(Number(b.lat)-Number(a.lat)),dLng=toRad(Number(b.lng)-Number(a.lng));
  const lat1=toRad(a.lat),lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

function baseQueueItem(candidate){
  const now=nowIso();
  return {
    ...candidate,
    status:candidate.website?"candidate":"needs-website",
    attempts:0,
    discoveredAt:now,
    updatedAt:now,
    lastCheckedAt:null,
    nextCheckAt:candidate.website?now:null,
    sourceId:null,
    lastResult:null
  };
}

function mergeCandidate(queue,candidate){
  let existing=queue.find(item=>item.key===candidate.key);
  if(!existing){
    existing=queue.find(item=>
      item.regionId===candidate.regionId&&
      norm(item.name)===norm(candidate.name)&&
      miles(item,candidate)<=0.6
    );
  }
  if(!existing){
    queue.push(baseQueueItem(candidate));
    return {added:true,item:queue.at(-1)};
  }
  const hadWebsite=!!existing.website;
  Object.assign(existing,{
    name:candidate.name||existing.name,
    category:candidate.category||existing.category,
    website:candidate.website||existing.website,
    socialUrl:candidate.socialUrl||existing.socialUrl,
    address:candidate.address||existing.address,
    lat:finite(candidate.lat)?candidate.lat:existing.lat,
    lng:finite(candidate.lng)?candidate.lng:existing.lng,
    priority:Math.max(Number(existing.priority||0),Number(candidate.priority||0)),
    monitorTier:existing.monitorTier||candidate.monitorTier||"C",
    externalId:candidate.externalId||existing.externalId,
    discoveryCellId:candidate.discoveryCellId||existing.discoveryCellId||null,
    osmTags:candidate.osmTags||existing.osmTags,
    discoveryMethod:[...new Set(String(existing.discoveryMethod||"").split("+").filter(Boolean).concat(candidate.discoveryMethod||[]))].join("+"),
    updatedAt:nowIso()
  });
  if(!hadWebsite&&existing.website&&existing.status==="needs-website"){
    existing.status="candidate";
    existing.nextCheckAt=nowIso();
  }
  return {added:false,item:existing};
}

function seedObservedPlaces(queue,places,entityLinks){
  const officialPlaceIds=new Set(
    (entityLinks||[])
      .filter(link=>link.entityType==="place"&&(link.roles||[]).includes("official"))
      .map(link=>link.entityId)
  );
  let added=0;
  for(const place of places||[]){
    if(!place?.id||officialPlaceIds.has(place.id))continue;
    if(!["A","B","C"].includes(place.monitorTier))continue;
    const candidate={
      key:`${place.regionId}|registry|${place.id}`,
      regionId:place.regionId,
      discoveryMethod:"registry",
      externalId:place.id,
      name:place.name,
      category:"observed-venue",
      website:null,
      socialUrl:null,
      address:place.address||null,
      lat:place.lat,lng:place.lng,
      priority:place.monitorTier==="A"?96:place.monitorTier==="B"?78:60,
      monitorTier:"C"
    };
    if(mergeCandidate(queue,candidate).added)added++;
  }
  return added;
}

function retryHours(item,result){
  const attempts=Number(item.attempts||0);
  if(result.reason==="website-fetch-failed")return Math.min(24*Math.max(1,attempts),168);
  if(result.reason==="no-supported-calendar")return attempts<2?72:Math.min(168*Math.max(1,attempts-1),720);
  return 168;
}

function sourceDuplicate(sources,source){
  let endpoint;
  try{endpoint=new URL(source.endpoint).href.replace(/\/$/,"")}catch{endpoint=source.endpoint}
  return sources.find(existing=>{
    if(existing.id===source.id)return true;
    let other;
    try{other=new URL(existing.endpoint).href.replace(/\/$/,"")}catch{other=existing.endpoint}
    return existing.adapter===source.adapter&&other===endpoint;
  });
}

function buildCoverage(queue,sources,runStats){
  const regions={};
  for(const region of Object.values(REGIONS)){
    const rows=queue.filter(item=>item.regionId===region.id);
    const statusCounts={};
    const categoryCounts={};
    for(const row of rows){
      statusCounts[row.status]=(statusCounts[row.status]||0)+1;
      categoryCounts[row.category||"unknown"]=(categoryCounts[row.category||"unknown"]||0)+1;
    }
    const regionState=state?.regions?.[region.id]||{};
    const cellSummary=regionState.cellSummary||discoveryCellSummary(region);
    regions[region.id]={
      candidateCount:rows.length,
      withWebsiteCount:rows.filter(row=>!!row.website).length,
      qualifiedCount:rows.filter(row=>row.status==="qualified").length,
      needsWebsiteCount:rows.filter(row=>row.status==="needs-website").length,
      dueCount:rows.filter(row=>row.website&&row.status!=="qualified"&&due(row)).length,
      statusCounts,
      categoryCounts,
      discoveredSourceCount:sources.filter(source=>source.regions?.includes(region.id)).length,
      discoveryCells:{
        version:regionState.cellSweepVersion||DISCOVERY_SWEEP_VERSION,
        total:cellSummary.total,
        high:cellSummary.high,
        dining:cellSummary.dining,
        completed:Number(regionState.completedCellCount||regionState.completedCells?.length||0),
        failed:Object.keys(regionState.failedCells||{}).length,
        remaining:Number(regionState.remainingCellCount??cellSummary.total)
      }
    };
  }
  return {generatedAt:nowIso(),run:runStats,regions};
}

const queue=await readJson(QUEUE_PATH,[]);
const discoveredSources=await readJson(SOURCES_PATH,[]);
const state=await readJson(STATE_PATH,{});
const places=await readJson("src/data/places.json",[]);
const entityLinks=await readJson("src/data/entity-source-links.json",[]);

if(!Array.isArray(queue)||!Array.isArray(discoveredSources))throw new Error("Discovery data files must contain arrays");

const stats={
  startedAt:nowIso(),
  seededFromRegistry:0,
  seededFromRegionalSweep:0,
  sweptRegionId:null,
  probed:0,
  promoted:0,
  failed:0
};

stats.seededFromRegistry=seedObservedPlaces(queue,places,entityLinks);

function ensureCellSweep(region){
  state.regions=state.regions||{};
  const current=state.regions[region.id]||{};
  if(current.cellSweepVersion!==DISCOVERY_SWEEP_VERSION){
    state.regions[region.id]={
      ...current,
      cellSweepVersion:DISCOVERY_SWEEP_VERSION,
      cellSweepStartedAt:nowIso(),
      completedCells:[],
      failedCells:{},
      lastCellRunAt:null
    };
  }else{
    state.regions[region.id]=current;
    current.completedCells=Array.isArray(current.completedCells)?current.completedCells:[];
    current.failedCells=current.failedCells&&typeof current.failedCells==="object"?current.failedCells:{};
  }
  return state.regions[region.id];
}

function nextDueCell(region,regionState){
  const completed=new Set(regionState.completedCells||[]);
  const failed=regionState.failedCells||{};
  for(const phase of ["high","dining"]){
    const cells=buildDiscoveryCells(region,phase);
    for(const cell of cells){
      if(completed.has(cell.id))continue;
      const retryAt=Date.parse(failed[cell.id]?.nextAttemptAt||0)||0;
      if(retryAt>Date.now())continue;
      return cell;
    }
  }
  return null;
}

const regionWork=Object.values(REGIONS)
  .map(region=>{
    const regionState=ensureCellSweep(region);
    return {
      region,
      regionState,
      next:nextDueCell(region,regionState),
      last:Date.parse(regionState.lastCellRunAt||0)||0
    };
  })
  .filter(item=>item.next)
  .sort((a,b)=>a.last-b.last||Number(b.region.discoveryPriority||0)-Number(a.region.discoveryPriority||0)||a.region.id.localeCompare(b.region.id))[0];

if(regionWork){
  const {region,regionState}=regionWork;
  stats.sweptRegionId=region.id;
  stats.discoveryCells=[];
  for(let index=0;index<CELLS_PER_RUN;index++){
    const cell=nextDueCell(region,regionState);
    if(!cell)break;
    const attemptAt=nowIso();
    regionState.lastCellRunAt=attemptAt;
    try{
      const cellCandidates=await discoverCellPlaces(region,cell);
      let added=0;
      for(const candidate of cellCandidates){
        if(mergeCandidate(queue,candidate).added){stats.seededFromRegionalSweep++;added++}
      }
      if(!regionState.completedCells.includes(cell.id))regionState.completedCells.push(cell.id);
      delete regionState.failedCells[cell.id];
      stats.discoveryCells.push({id:cell.id,phase:cell.phase,status:"ok",candidateCount:cellCandidates.length,newCount:added});
      console.log(`${region.id}/${cell.id}: discovered ${cellCandidates.length} website-backed venues; ${added} new.`);
    }catch(error){
      const previous=regionState.failedCells[cell.id]||{attempts:0};
      const attempts=Number(previous.attempts||0)+1;
      regionState.failedCells[cell.id]={
        attempts,
        lastAttemptAt:attemptAt,
        nextAttemptAt:new Date(Date.now()+Math.min(CELL_RETRY_MS*attempts,12*60*60*1000)).toISOString(),
        error:String(error?.message||error)
      };
      stats.discoveryCells.push({id:cell.id,phase:cell.phase,status:"failed",error:String(error?.message||error)});
      console.error(`${region.id}/${cell.id}: discovery failed:`,error);
    }
  }
  const summary=discoveryCellSummary(region);
  regionState.cellSummary=summary;
  regionState.completedCellCount=(regionState.completedCells||[]).length;
  regionState.remainingCellCount=Math.max(0,summary.total-regionState.completedCellCount);
  if(regionState.remainingCellCount===0&&!regionState.cellSweepCompletedAt)regionState.cellSweepCompletedAt=nowIso();
}

const candidates=queue
  .filter(item=>item.website&&item.status!=="qualified"&&due(item))
  .sort((a,b)=>Number(b.priority||0)-Number(a.priority||0)||Number(a.attempts||0)-Number(b.attempts||0)||String(a.discoveredAt).localeCompare(String(b.discoveredAt)))
  .slice(0,MAX_PROBES_PER_RUN);

for(const item of candidates){
  stats.probed++;
  item.lastCheckedAt=nowIso();
  item.attempts=Number(item.attempts||0)+1;
  try{
    const result=await qualifyDiscoveryCandidate(item);
    item.lastResult=result.qualified?result.evidence:{reason:result.reason,detail:result.detail||null};
    if(result.qualified){
      const existing=sourceDuplicate(discoveredSources,result.source);
      const source=existing||result.source;
      if(!existing){
        discoveredSources.push(source);
        stats.promoted++;
        console.log(`PROMOTED ${item.name}: ${source.adapter} ${source.endpoint} (${result.evidence.eventCount} events)`);
      }else{
        console.log(`QUALIFIED ${item.name}: reusing source ${existing.id}`);
      }
      item.status="qualified";
      item.sourceId=source.id;
      item.qualifiedAt=nowIso();
      item.nextCheckAt=null;
    }else{
      stats.failed++;
      item.status=result.reason==="no-website"?"needs-website":"retry";
      item.nextCheckAt=hoursFromNow(retryHours(item,result));
      console.log(`RETRY ${item.name}: ${result.reason}; next check ${item.nextCheckAt}`);
    }
  }catch(error){
    stats.failed++;
    item.status="retry";
    item.lastResult={reason:"probe-error",detail:String(error?.message||error)};
    item.nextCheckAt=hoursFromNow(retryHours(item,{reason:"probe-error"}));
    console.error(`Probe failed for ${item.name}:`,error);
  }
  item.updatedAt=nowIso();
}

queue.sort((a,b)=>a.regionId.localeCompare(b.regionId)||Number(b.priority||0)-Number(a.priority||0)||a.name.localeCompare(b.name));
if(queue.length>MAX_QUEUE){
  const keep=queue.filter(item=>item.status==="qualified"||item.website);
  const remainder=queue.filter(item=>!keep.includes(item)).slice(0,Math.max(0,MAX_QUEUE-keep.length));
  queue.splice(0,queue.length,...keep,...remainder);
}

stats.finishedAt=nowIso();
state.lastRunAt=stats.finishedAt;
state.lastRun=stats;

await mkdir("src/data",{recursive:true});
await writeFile(QUEUE_PATH,JSON.stringify(queue,null,2)+"\n");
await writeFile(SOURCES_PATH,JSON.stringify(discoveredSources.sort((a,b)=>a.id.localeCompare(b.id)),null,2)+"\n");
await writeFile(STATE_PATH,JSON.stringify(state,null,2)+"\n");
await writeFile(COVERAGE_PATH,JSON.stringify(buildCoverage(queue,discoveredSources,stats),null,2)+"\n");

console.log(`Discovery run complete: ${queue.length} queued places, ${stats.probed} probed, ${stats.promoted} promoted, ${discoveredSources.length} dynamic sources total.`);
