import {readFile} from "node:fs/promises";
import {REGIONS} from "./regions.mjs";
import {STATIC_SOURCES} from "./source-catalog.mjs";

const failures=[];
const fail=message=>failures.push(message);
const read=async(path,fallback)=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch(error){fail(`${path}: invalid JSON (${error.message})`);return fallback}
};
const readOptional=async path=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch(error){
    if(error?.code==="ENOENT")return null;
    fail(`${path}: invalid JSON (${error.message})`);
    return null;
  }
};
const validUrl=value=>{
  try{
    const url=new URL(value);
    return ["http:","https:"].includes(url.protocol);
  }catch{return false}
};

const queue=await read("src/data/discovery-queue.json",[]);
const sources=await read("src/data/discovered-sources.json",[]);
const state=await read("src/data/discovery-state.json",{});
const coverage=await read("src/data/discovery-coverage.json",{});
const coverageAreas=await read("src/data/coverage-zones.json",[]);
const live=await readOptional("src/data/discovery-live.json");

if(!Array.isArray(queue))fail("discovery-queue.json must contain an array");
if(!Array.isArray(sources))fail("discovered-sources.json must contain an array");

const regionIds=new Set(Object.keys(REGIONS));
const coverageAreaIds=new Set((coverageAreas||[]).map(item=>item.id));
const staticIds=new Set(STATIC_SOURCES.map(source=>source.id));
const sourceIds=new Set;
const sourceEndpointKeys=new Set;
const allowedAdapters=new Set(["tribe","jsonld","jsonld-crawl","ics","embedded-json","calendar-links"]);

for(const [index,source] of (sources||[]).entries()){
  const label=`discovered-sources[${index}]`;
  for(const field of ["id","name","adapter","endpoint"]){
    if(!source?.[field])fail(`${label} missing ${field}`);
  }
  if(staticIds.has(source.id))fail(`${label} collides with static source ${source.id}`);
  if(sourceIds.has(source.id))fail(`Duplicate discovered source id ${source.id}`);
  sourceIds.add(source.id);
  if(!allowedAdapters.has(source.adapter))fail(`${label} uses unsupported adapter ${source.adapter}`);
  if(!validUrl(source.endpoint))fail(`${label} has invalid endpoint ${source.endpoint}`);
  if(source.scope!=="local")fail(`${label} must have local scope`);
  if(!Array.isArray(source.regions)||source.regions.length!==1||!regionIds.has(source.regions[0]))fail(`${label} must reference exactly one known region`);
  if(source.ownerEntityKind!=="place"||!source.ownerName)fail(`${label} must identify its owning place`);
  if(!source.discoveryCandidateKey)fail(`${label} missing discoveryCandidateKey`);
  if(source.aliasOf){
    if(source.enabled!==false)fail(`${label} alias must be disabled`);
    if(!staticIds.has(source.aliasOf)&&!sourceIds.has(source.aliasOf))fail(`${label} references unknown aliasOf ${source.aliasOf}`);
  }else{
    const endpointKey=`${source.adapter}|${String(source.endpoint).replace(/\/$/,"")}`;
    if(sourceEndpointKeys.has(endpointKey))fail(`Duplicate discovered endpoint ${endpointKey}`);
    sourceEndpointKeys.add(endpointKey);
  }
}

const queueKeys=new Set;
const validStatuses=new Set(["candidate","needs-website","retry","cold","qualified"]);
const validProbeLanes=new Set(["event-likely","event-evidence","food-evidence","exploratory","cold-sample","low-value"]);
for(const [index,item] of (queue||[]).entries()){
  const label=`discovery-queue[${index}]`;
  for(const field of ["key","regionId","name","status","monitorTier"]){
    if(item?.[field]===undefined||item?.[field]===null||item?.[field]==="")fail(`${label} missing ${field}`);
  }
  if(queueKeys.has(item.key))fail(`Duplicate discovery queue key ${item.key}`);
  queueKeys.add(item.key);
  if(!regionIds.has(item.regionId))fail(`${label} references unknown region ${item.regionId}`);
  if(!validStatuses.has(item.status))fail(`${label} has invalid status ${item.status}`);
  if(item.monitorTier!=="C")fail(`${label} must use monitorTier C`);
  if(item.website&&!validUrl(item.website))fail(`${label} has invalid website ${item.website}`);
  if(item.probeLane!==undefined&&!validProbeLanes.has(item.probeLane))fail(`${label} has invalid probeLane ${item.probeLane}`);
  if(item.status==="cold"){
    if(!item.coldUntil||!Number.isFinite(Date.parse(item.coldUntil)))fail(`${label} is cold without valid coldUntil`);
    if(item.nextCheckAt!==item.coldUntil)fail(`${label} cold nextCheckAt must equal coldUntil`);
  }
  if(item.coverageAreaIds!==undefined){
    if(!Array.isArray(item.coverageAreaIds))fail(`${label} coverageAreaIds must be an array`);
    else for(const areaId of item.coverageAreaIds)if(!coverageAreaIds.has(areaId))fail(`${label} references unknown coverage area ${areaId}`);
  }
  if(item.status==="qualified"){
    if(!item.sourceId)fail(`${label} is qualified without sourceId`);
    if(item.sourceId&&!sourceIds.has(item.sourceId)&&!staticIds.has(item.sourceId))fail(`${label} references unknown source ${item.sourceId}`);
  }
}

if(coverage?.regions){
  for(const regionId of regionIds){
    const summary=coverage.regions[regionId];
    if(!summary)continue;
    const expected=queue.filter(item=>item.regionId===regionId).length;
    if(summary.candidateCount!==expected)fail(`Discovery coverage candidateCount mismatch for ${regionId}`);
    if(summary.discoveryCells){
      const cells=summary.discoveryCells;
      const version=Number(cells.version||0);
      const required=version>=4?["total","core","high","dining","completed","failed","remaining"]:["total","high","dining","completed","failed","remaining"];
      for(const field of required){
        if(!Number.isInteger(Number(cells[field]))||Number(cells[field])<0)fail(`Discovery coverage ${regionId} has invalid cell count ${field}`);
      }
      const expectedTotal=(version>=4?Number(cells.core||0):0)+Number(cells.high||0)+Number(cells.dining||0);
      if(expectedTotal!==Number(cells.total))fail(`Discovery coverage ${regionId} cell total mismatch`);
      if(Number(cells.completed)>Number(cells.total))fail(`Discovery coverage ${regionId} completed cells exceed total`);
    }
  }
}
if(state&&typeof state!=="object")fail("discovery-state.json must contain an object");
if(live){
  if(!live.generatedAt||!Number.isFinite(Date.parse(live.generatedAt)))fail("discovery-live.json missing valid generatedAt");
  if(!live.lastRun||typeof live.lastRun!=="object")fail("discovery-live.json missing lastRun");
  if(!Array.isArray(live.runHistory))fail("discovery-live.json runHistory must be an array");
  if(!Array.isArray(live.recentProbeResults))fail("discovery-live.json recentProbeResults must be an array");
  if(!Array.isArray(live.recentPromotions))fail("discovery-live.json recentPromotions must be an array");
  if(!live.regions||typeof live.regions!=="object")fail("discovery-live.json regions must be an object");
  for(const [index,item] of (live.recentProbeResults||[]).entries()){
    if(!regionIds.has(item.regionId))fail(`discovery-live recentProbeResults[${index}] references unknown region ${item.regionId}`);
    if(!item.name||!item.status)fail(`discovery-live recentProbeResults[${index}] missing name/status`);
  }
}

if(failures.length){
  console.error("Locale discovery validation failed:");
  for(const failure of failures)console.error(" - "+failure);
  process.exit(1);
}
console.log(`Locale discovery validation passed: ${queue.length} candidates, ${sources.length} auto-discovered sources.`);
