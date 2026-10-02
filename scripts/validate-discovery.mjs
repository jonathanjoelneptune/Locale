import {readFile} from "node:fs/promises";
import {REGIONS} from "./regions.mjs";
import {STATIC_SOURCES} from "./source-catalog.mjs";
import {loadAcquisitionRegistry} from "./acquisition-registry.mjs";

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
const acquisitionManifest=await read("src/data/source-acquisition-catalog.json",{});
const acquisitionRegistry=await loadAcquisitionRegistry();

if(!Array.isArray(queue))fail("discovery-queue.json must contain an array");
if(!Array.isArray(sources))fail("discovered-sources.json must contain an array");

const regionIds=new Set(Object.keys(REGIONS));
const coverageAreaIds=new Set((coverageAreas||[]).map(item=>item.id));
const coverageAreaNames=new Set((coverageAreas||[]).filter(item=>item.regionId==="san-diego").map(item=>item.name));
const staticIds=new Set(STATIC_SOURCES.map(source=>source.id));
const discoveredIds=new Set((sources||[]).map(source=>source?.id).filter(Boolean));
const sourceIds=new Set;
const sourceEndpointKeys=new Set;
const allowedAdapters=new Set(["tribe","jsonld","jsonld-crawl","ics","embedded-json","calendar-links"]);
const acquisitionStatuses=new Set(["active","candidate","blocked","disabled"]);
if(acquisitionManifest.strategy!=="source-first")fail("source-acquisition-catalog.json must use source-first strategy");
if(Number(acquisitionManifest.sourceCount)!==97)fail("source-acquisition-catalog.json must declare 97 workbook sources");
if(Number(acquisitionManifest.areaCount)!==188)fail("source-acquisition-catalog.json must declare 188 workbook area mappings");
if(Number(acquisitionManifest.taxonomyFamilyCount)!==38)fail("source-acquisition-catalog.json must declare 38 taxonomy families");

const acquisitionSources=acquisitionRegistry.sources||[];
const acquisitionAreas=acquisitionRegistry.areas||[];
const acquisitionTaxonomy=acquisitionRegistry.taxonomy||{};
if(acquisitionSources.length!==97)fail(`Workbook acquisition registry must contain 97 sources; found ${acquisitionSources.length}`);
const acquisitionPriorityCounts={A:0,B:0,C:0};
const acquisitionSourceIds=new Set;
for(const [index,row] of acquisitionSources.entries()){
  const label=`acquisition source[${index}]`;
  if(!row?.id||!row?.name||!row?.url||!row?.coverageLayer||!row?.priority||!row?.integrationState)fail(`${label} missing required fields`);
  if(acquisitionSourceIds.has(row.id))fail(`Duplicate workbook acquisition source id ${row.id}`);
  acquisitionSourceIds.add(row.id);
  if(!["A","B","C"].includes(row.priority))fail(`${label} has invalid priority ${row.priority}`);
  else acquisitionPriorityCounts[row.priority]++;
  if(!acquisitionStatuses.has(row.integrationState))fail(`${label} has invalid integrationState ${row.integrationState}`);
  if(!validUrl(row.url))fail(`${label} has invalid url ${row.url}`);
  if(row.integrationState==="active"){
    if(!row.sourceId)fail(`${label} active source missing sourceId`);
    if(row.sourceId&&!staticIds.has(row.sourceId)&&!discoveredIds.has(row.sourceId))fail(`${label} references unknown active source ${row.sourceId}`);
  }
}
for(const [priority,expected] of Object.entries({A:17,B:66,C:14})){
  if(acquisitionPriorityCounts[priority]!==expected)fail(`Workbook acquisition priority ${priority} must contain ${expected}; found ${acquisitionPriorityCounts[priority]}`);
}

if(acquisitionAreas.length!==188)fail(`Workbook neighborhood mapping must contain 188 areas; found ${acquisitionAreas.length}`);
const acquisitionAreaNames=new Set;
for(const [index,row] of acquisitionAreas.entries()){
  const label=`acquisition area[${index}]`;
  if(!row?.area||!row?.coverageGroup||!row?.coverageConfidence)fail(`${label} missing required fields`);
  if(acquisitionAreaNames.has(row.area))fail(`Duplicate workbook acquisition area ${row.area}`);
  acquisitionAreaNames.add(row.area);
  if(!coverageAreaNames.has(row.area))fail(`${label} references unknown configured coverage area ${row.area}`);
  for(const field of ["primarySources","umbrellaSources","baselineSources"]){
    if(!Array.isArray(row[field]))fail(`${label} ${field} must be an array`);
  }
}
for(const areaName of coverageAreaNames){
  if(!acquisitionAreaNames.has(areaName))fail(`Workbook acquisition mapping missing configured area ${areaName}`);
}

const taxonomyRows=Array.isArray(acquisitionTaxonomy.rows)?acquisitionTaxonomy.rows:[];
if(Number(acquisitionTaxonomy.familyCount)!==38||taxonomyRows.length!==38)fail(`Workbook taxonomy must contain 38 families; found ${taxonomyRows.length}`);
const taxonomyFamilies=new Set;
for(const [index,row] of taxonomyRows.entries()){
  const [category,family,bestSources,tags,strength]=Array.isArray(row)?row:[];
  const label=`acquisition taxonomy[${index}]`;
  if(!category||!family||!strength)fail(`${label} missing category/family/strength`);
  if(taxonomyFamilies.has(family))fail(`Duplicate acquisition taxonomy family ${family}`);
  taxonomyFamilies.add(family);
  if(!Array.isArray(bestSources)||!bestSources.length)fail(`${label} must identify source families`);
  if(!Array.isArray(tags)||!tags.length)fail(`${label} must identify tags`);
}

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
  if(!["place","organizer"].includes(source.ownerEntityKind)||!source.ownerName)fail(`${label} must identify an owning place or organizer`);
  if(source.qualifierVersion!==undefined&&(!Number.isInteger(Number(source.qualifierVersion))||Number(source.qualifierVersion)<1))fail(`${label} has invalid qualifierVersion`);
  if(!source.discoveryCandidateKey)fail(`${label} missing discoveryCandidateKey`);
  if(source.aliasOf){
    if(source.enabled!==false)fail(`${label} alias must be disabled`);
    if(!staticIds.has(source.aliasOf)&&!discoveredIds.has(source.aliasOf))fail(`${label} references unknown aliasOf ${source.aliasOf}`);
  }else if(source.enabled!==false){
    const endpointKey=`${source.adapter}|${String(source.endpoint).replace(/\/$/,"")}`;
    if(sourceEndpointKeys.has(endpointKey))fail(`Duplicate active discovered endpoint ${endpointKey}`);
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
      const expectedTotal=(version>=4?Number(cells.core||0):0)+Number(cells.high||0)+Number(cells.dining||0)+Number(cells.outer||0);
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
