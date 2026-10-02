import {readFile,writeFile,mkdir} from "node:fs/promises";
import {REGIONS} from "./regions.mjs";
import {discoverCellPlaces,overpassTelemetrySnapshot} from "./discovery-overpass.mjs";
import {buildDiscoveryCells,discoveryCellSummary} from "./discovery-grid.mjs";
import {qualifyDiscoveryCandidate} from "./discovery-probe.mjs";
import {containingCoverageZones} from "./coverage-zones.mjs";
import {adaptiveDiscoveryPlan,isOverpassDue} from "./discovery-budget.mjs";

const QUEUE_PATH="src/data/discovery-queue.json";
const SOURCES_PATH="src/data/discovered-sources.json";
const STATE_PATH="src/data/discovery-state.json";
const COVERAGE_PATH="src/data/discovery-coverage.json";
const LIVE_DIAGNOSTICS_PATH="src/data/discovery-live.json";
const DISCOVERY_SWEEP_VERSION=4;
const AREA_SWEEP_VERSION=1;
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
    coverageAreaIds:[...new Set([...(existing.coverageAreaIds||[]),...(candidate.coverageAreaIds||[])])],
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
        core:cellSummary.core,
        high:cellSummary.high,
        dining:cellSummary.dining,
        completed:Number(regionState.completedCellCount||regionState.completedCells?.length||0),
        failed:Object.keys(regionState.failedCells||{}).length,
        remaining:Number(regionState.remainingCellCount??cellSummary.total)
      },
      coverageAreaSweeps:{
        version:regionState.coverageAreaSweepVersion||AREA_SWEEP_VERSION,
        tracked:Object.keys(regionState.coverageAreaSweeps||{}).length,
        completed:Object.values(regionState.coverageAreaSweeps||{}).filter(item=>!!item.lastCompletedAt).length,
        failed:Object.values(regionState.coverageAreaSweeps||{}).filter(item=>!!item.error&&!item.lastCompletedAt).length,
        sweptThisRun:(runStats.focusAreas||[]).filter(item=>item.regionId===region.id).length
      },
      adaptiveDiscovery:{
        ...discoveryPlan.profiles?.[region.id],
        activeMode:discoveryPlan.mode,
        probeLimit:discoveryBudget.probeLimit,
        probeConcurrency:discoveryBudget.probeConcurrency,
        overpassMinIntervalMinutes:discoveryBudget.overpassMinIntervalMinutes
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
const coverageAreas=await readJson("src/data/coverage-zones.json",[]);
const coverageDashboard=await readJson("src/data/coverage-dashboard.json",{regions:{}});

if(!Array.isArray(queue)||!Array.isArray(discoveredSources))throw new Error("Discovery data files must contain arrays");

const discoveryPlan=adaptiveDiscoveryPlan(
  coverageDashboard,
  coverageAreas,
  Object.keys(REGIONS)
);
const discoveryBudget=discoveryPlan.budget;
const runOverpass=isOverpassDue(
  state.lastOverpassRunAt,
  discoveryBudget.overpassMinIntervalMinutes
);

const queueSnapshot=()=>({
  total:queue.length,
  withWebsite:queue.filter(item=>!!item.website).length,
  due:queue.filter(item=>item.website&&item.status!=="qualified"&&due(item)).length,
  retry:queue.filter(item=>item.status==="retry").length,
  qualified:queue.filter(item=>item.status==="qualified").length,
  needsWebsite:queue.filter(item=>item.status==="needs-website").length
});

const stats={
  startedAt:nowIso(),
  queueBefore:queueSnapshot(),
  seededFromRegistry:0,
  seededFromRegionalSweep:0,
  seededFromAreaSweep:0,
  sweptRegionId:null,
  focusAreas:[],
  discoveryMode:discoveryPlan.mode,
  discoveryBudget,
  regionProfiles:discoveryPlan.profiles,
  overpassRun:runOverpass,
  probeResults:[],
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
  for(const phase of ["core","high","dining"]){
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

function ensureAreaSweepState(region){
  const regionState=ensureCellSweep(region);
  if(regionState.coverageAreaSweepVersion!==AREA_SWEEP_VERSION){
    regionState.coverageAreaSweepVersion=AREA_SWEEP_VERSION;
    regionState.coverageAreaSweeps={};
  }
  regionState.coverageAreaSweeps=regionState.coverageAreaSweeps&&typeof regionState.coverageAreaSweeps==="object"?regionState.coverageAreaSweeps:{};
  return regionState;
}

function areaMetric(zone){
  const rows=coverageDashboard.regions?.[zone.regionId]?.coverageAreas||coverageDashboard.regions?.[zone.regionId]?.neighborhoods||[];
  return rows.find(row=>row.id===zone.id)||null;
}

function areaSweepIntervalMs(zone,row){
  if(row?.acceptance?.pass)return 14*86400000;
  const gap=Number(row?.gapScore||50);
  if(gap>=70||Number(zone.discoveryPriority||0)>=95)return 2*86400000;
  if(gap>=45)return 4*86400000;
  return 7*86400000;
}

function nextCoverageAreaSweep(){
  const now=Date.now();
  return coverageAreas
    .map(zone=>{
      const region=REGIONS[zone.regionId];
      if(!region)return null;
      const regionState=ensureAreaSweepState(region);
      const sweep=regionState.coverageAreaSweeps[zone.id]||{};
      const retryAt=Date.parse(sweep.nextAttemptAt||0)||0;
      const completedAt=Date.parse(sweep.lastCompletedAt||0)||0;
      const row=areaMetric(zone);
      const dueAt=completedAt+areaSweepIntervalMs(zone,row);
      if(retryAt>now||completedAt&&dueAt>now)return null;
      const gap=Number(row?.gapScore||50);
      const score=Number(zone.discoveryPriority||50)+gap*.8-(completedAt?Math.min(20,(now-completedAt)/86400000):0);
      return {zone,region,regionState,sweep,row,score,completedAt};
    })
    .filter(Boolean)
    .sort((a,b)=>b.score-a.score||a.completedAt-b.completedAt||a.zone.name.localeCompare(b.zone.name))[0]||null;
}

if(runOverpass){
let stopOverpass=false;
for(let index=0;index<discoveryBudget.areaSweeps&&!stopOverpass;index++){
  const work=nextCoverageAreaSweep();
  if(!work)break;
  const {zone,region,regionState,sweep,row}=work;
  const attemptAt=nowIso();
  regionState.coverageAreaSweeps[zone.id]={...sweep,lastAttemptAt:attemptAt};
  const cell={
    id:`area:${zone.id}`,
    phase:"focus",
    lat:Number(zone.lat),
    lng:Number(zone.lng),
    queryRadiusMiles:Math.min(3.2,Math.max(1.2,Number(zone.radiusMiles||1)+0.45))
  };
  try{
    const cellCandidates=await discoverCellPlaces(region,cell);
    let added=0;
    for(const raw of cellCandidates){
      const candidate={...raw,coverageAreaIds:[zone.id],discoveryCellId:cell.id};
      if(mergeCandidate(queue,candidate).added){stats.seededFromAreaSweep++;added++}
    }
    regionState.coverageAreaSweeps[zone.id]={
      lastAttemptAt:attemptAt,
      lastCompletedAt:nowIso(),
      candidateCount:cellCandidates.length,
      newCount:added,
      attempts:0,
      nextAttemptAt:null
    };
    stats.focusAreas.push({regionId:region.id,id:zone.id,name:zone.name,gapScore:Number(row?.gapScore||0),status:"ok",candidateCount:cellCandidates.length,newCount:added});
    console.log(`${region.id}/area:${zone.id}: discovered ${cellCandidates.length} focused venues; ${added} new.`);
  }catch(error){
    const attempts=Number(sweep.attempts||0)+1;
    regionState.coverageAreaSweeps[zone.id]={
      ...sweep,
      attempts,
      lastAttemptAt:attemptAt,
      nextAttemptAt:new Date(Date.now()+Math.min(discoveryBudget.failedSweepRetryMinutes*60000*attempts,12*60*60*1000)).toISOString(),
      error:String(error?.message||error)
    };
    stats.focusAreas.push({regionId:region.id,id:zone.id,name:zone.name,gapScore:Number(row?.gapScore||0),status:"failed",error:String(error?.message||error)});
    if(["OVERPASS_ALL_FAILED","OVERPASS_COOLDOWN"].includes(error?.code))stopOverpass=true;
    console.error(`${region.id}/area:${zone.id}: focused discovery failed:`,error);
  }
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

if(!stopOverpass&&regionWork){
  const {region,regionState}=regionWork;
  stats.sweptRegionId=region.id;
  stats.discoveryCells=[];
  for(let index=0;index<discoveryBudget.regionalCells;index++){
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
        nextAttemptAt:new Date(Date.now()+Math.min(discoveryBudget.failedSweepRetryMinutes*60000*attempts,12*60*60*1000)).toISOString(),
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
state.lastOverpassRunAt=nowIso();
}

const producerSignal=item=>/\b(bar|pub|brew|music|theat|club|comedy|museum|gallery|arts|community|stadium|karaoke|trivia|live|concert|taproom|tavern|lounge)\b/i.test(
  [item.name,item.category,item.website,item.lastResult?.detail].filter(Boolean).join(" ")
)?18:0;

const coverageGapBoost=item=>{
  const zones=containingCoverageZones(item,coverageAreas,{regionId:item.regionId});
  let best=0;
  for(const zone of zones){
    const row=areaMetric(zone);
    const gap=Number(row?.gapScore||0);
    const boost=gap*.45+Number(zone.discoveryPriority||0)*.12+(row?.acceptance?.pass?0:8);
    if(boost>best)best=boost;
  }
  return Math.round(best);
};

const probeScore=item=>Number(item.priority||0)+producerSignal(item)+coverageGapBoost(item)-Math.min(20,Number(item.attempts||0)*3);

const probeHost=item=>{
  try{return new URL(item.website).hostname.toLowerCase().replace(/^www\./,"")}
  catch{return null}
};

const rankedCandidates=queue
  .filter(item=>item.website&&item.status!=="qualified"&&due(item))
  .sort((a,b)=>probeScore(b)-probeScore(a)||String(a.discoveredAt).localeCompare(String(b.discoveredAt)));

const candidates=[];
const selectedHosts=new Set;
for(const item of rankedCandidates){
  const host=probeHost(item);
  if(host&&selectedHosts.has(host))continue;
  if(host)selectedHosts.add(host);
  candidates.push(item);
  if(candidates.length>=discoveryBudget.probeLimit)break;
}

async function probeCandidate(item){
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
  stats.probeResults.push({
    regionId:item.regionId,
    key:item.key,
    name:item.name,
    category:item.category||null,
    website:item.website||null,
    attempts:item.attempts,
    status:item.status,
    result:item.lastResult||null,
    sourceId:item.sourceId||null,
    nextCheckAt:item.nextCheckAt||null,
    checkedAt:item.lastCheckedAt||null
  });
}

let probeCursor=0;
async function probeWorker(){
  while(true){
    const index=probeCursor++;
    if(index>=candidates.length)return;
    await probeCandidate(candidates[index]);
  }
}
const workerCount=Math.min(discoveryBudget.probeConcurrency,candidates.length);
if(workerCount>0){
  await Promise.all(Array.from({length:workerCount},()=>probeWorker()));
}

queue.sort((a,b)=>a.regionId.localeCompare(b.regionId)||Number(b.priority||0)-Number(a.priority||0)||a.name.localeCompare(b.name));
if(queue.length>MAX_QUEUE){
  const keep=queue.filter(item=>item.status==="qualified"||item.website);
  const remainder=queue.filter(item=>!keep.includes(item)).slice(0,Math.max(0,MAX_QUEUE-keep.length));
  queue.splice(0,queue.length,...keep,...remainder);
}

stats.finishedAt=nowIso();
stats.durationMs=Math.max(0,Date.parse(stats.finishedAt)-Date.parse(stats.startedAt));
stats.queueAfter=queueSnapshot();
stats.overpassEndpoints=overpassTelemetrySnapshot();
state.lastRunAt=stats.finishedAt;
state.lastRun=stats;
const compactRun={
  startedAt:stats.startedAt,
  finishedAt:stats.finishedAt,
  durationMs:stats.durationMs,
  discoveryMode:stats.discoveryMode,
  probed:stats.probed,
  promoted:stats.promoted,
  failed:stats.failed,
  overpassRun:stats.overpassRun,
  overpassEndpoints:stats.overpassEndpoints,
  seededFromRegistry:stats.seededFromRegistry,
  seededFromRegionalSweep:stats.seededFromRegionalSweep,
  seededFromAreaSweep:stats.seededFromAreaSweep,
  focusAreas:stats.focusAreas,
  discoveryCells:stats.discoveryCells||[],
  queueBefore:stats.queueBefore,
  queueAfter:stats.queueAfter
};
state.runHistory=[compactRun,...(Array.isArray(state.runHistory)?state.runHistory:[])].slice(0,72);

const recentProbeResults=queue
  .filter(item=>item.lastCheckedAt)
  .sort((a,b)=>String(b.lastCheckedAt).localeCompare(String(a.lastCheckedAt)))
  .slice(0,60)
  .map(item=>({
    regionId:item.regionId,
    key:item.key,
    name:item.name,
    category:item.category||null,
    website:item.website||null,
    status:item.status,
    attempts:item.attempts||0,
    lastCheckedAt:item.lastCheckedAt,
    nextCheckAt:item.nextCheckAt||null,
    sourceId:item.sourceId||null,
    lastResult:item.lastResult||null
  }));
const recentPromotions=[...discoveredSources]
  .sort((a,b)=>String(b.discoveredAt||"").localeCompare(String(a.discoveredAt||"")))
  .slice(0,30)
  .map(source=>({
    id:source.id,
    name:source.name,
    regions:source.regions,
    adapter:source.adapter,
    endpoint:source.endpoint,
    discoveredAt:source.discoveredAt,
    discoveryEventCount:source.discoveryEventCount||0
  }));
const liveDiagnostics={
  generatedAt:stats.finishedAt,
  lastRun:stats,
  runHistory:state.runHistory,
  lastOverpassRunAt:state.lastOverpassRunAt||null,
  regions:state.regions||{},
  recentProbeResults,
  recentPromotions
};

await mkdir("src/data",{recursive:true});
await writeFile(QUEUE_PATH,JSON.stringify(queue,null,2)+"\n");
await writeFile(SOURCES_PATH,JSON.stringify(discoveredSources.sort((a,b)=>a.id.localeCompare(b.id)),null,2)+"\n");
await writeFile(STATE_PATH,JSON.stringify(state,null,2)+"\n");
await writeFile(COVERAGE_PATH,JSON.stringify(buildCoverage(queue,discoveredSources,stats),null,2)+"\n");
await writeFile(LIVE_DIAGNOSTICS_PATH,JSON.stringify(liveDiagnostics,null,2)+"\n");

console.log(`Discovery run complete [${discoveryPlan.mode}]: ${queue.length} queued places, ${stats.probed} probed at concurrency ${discoveryBudget.probeConcurrency}, ${stats.promoted} promoted, ${discoveredSources.length} dynamic sources total. Overpass ${runOverpass?"ran":"deferred"}.`);
