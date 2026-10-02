import {readFile} from "node:fs/promises";
import {REGIONS} from "./regions.mjs";

const failures=[];
const fail=message=>failures.push(message);
const read=async(path,fallback)=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch(error){fail(`${path}: invalid JSON (${error.message})`);return fallback}
};
const finite=(value,min=-Infinity,max=Infinity)=>Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max;

const [coverageAreas,queue,locationCoverage,dashboard]=await Promise.all([
  read("src/data/coverage-zones.json",[]),
  read("src/data/location-resolution-queue.json",[]),
  read("src/data/location-resolution-coverage.json",{regions:{}}),
  read("src/data/coverage-dashboard.json",{regions:{}})
]);

if(!Array.isArray(coverageAreas))fail("coverage-zones.json must contain an array");
if(!Array.isArray(queue))fail("location-resolution-queue.json must contain an array");

const areaIds=new Set;
const allowedClasses=new Set(["entertainment-core","urban","mixed","suburban","outer","rural"]);
for(const [index,row] of coverageAreas.entries()){
  const label=`coverage-zones[${index}]`;
  for(const field of ["id","name","regionId","group","coverageClass"])if(!row?.[field])fail(`${label} missing ${field}`);
  if(areaIds.has(row.id))fail(`Duplicate coverage area id ${row.id}`);
  areaIds.add(row.id);
  if(!REGIONS[row.regionId])fail(`${label} references unknown region ${row.regionId}`);
  if(!allowedClasses.has(row.coverageClass))fail(`${label} has invalid coverageClass ${row.coverageClass}`);
  if(!finite(row.lat,-90,90)||!finite(row.lng,-180,180))fail(`${label} has invalid coordinates`);
  if(!finite(row.radiusMiles,.1,10))fail(`${label} has invalid radiusMiles`);
  if(!finite(row.discoveryPriority,0,100))fail(`${label} has invalid discoveryPriority`);
}

const queueKeys=new Set;
const statuses=new Set(["pending","retry","resolved"]);
for(const [index,item] of queue.entries()){
  const label=`location-resolution-queue[${index}]`;
  if(!item.key||!item.regionId||!item.query)fail(`${label} missing identity fields`);
  if(queueKeys.has(item.key))fail(`Duplicate location queue key ${item.key}`);
  queueKeys.add(item.key);
  if(!REGIONS[item.regionId])fail(`${label} references unknown region ${item.regionId}`);
  if(!statuses.has(item.status))fail(`${label} has invalid status ${item.status}`);
  if(!finite(item.priority,0))fail(`${label} has invalid priority`);
  if(!finite(item.eventCount,0))fail(`${label} has invalid eventCount`);
  if(item.status==="resolved"&&(!finite(item.point?.lat,-90,90)||!finite(item.point?.lng,-180,180)))fail(`${label} is resolved without valid point`);
}

for(const [regionId,region] of Object.entries(dashboard.regions||{})){
  if(!REGIONS[regionId])fail(`coverage-dashboard references unknown region ${regionId}`);
  if(!finite(region.preciseLocationRate,0,1))fail(`coverage-dashboard ${regionId} has invalid preciseLocationRate`);
  if(!finite(region.discovery?.promotionRate,0,1))fail(`coverage-dashboard ${regionId} has invalid discovery promotionRate`);
  const configured=new Set(coverageAreas.filter(item=>item.regionId===regionId).map(item=>item.id));
  const measured=new Set((region.coverageAreas||region.neighborhoods||[]).map(item=>item.id));
  if(configured.size!==measured.size||[...configured].some(id=>!measured.has(id)))fail(`coverage-dashboard ${regionId} coverage area set is stale`);
  for(const item of region.coverageAreas||region.neighborhoods||[]){
    if(!finite(item.fridaySaturdayNightAverage,0))fail(`${regionId}/${item.id} has invalid Friday/Saturday average`);
    if(!finite(item.recurringLocalOccurrences30d,0))fail(`${regionId}/${item.id} has invalid recurring count`);
    if(!finite(item.gapScore,0,100))fail(`${regionId}/${item.id} has invalid gapScore`);
    if(typeof item.acceptance?.pass!=="boolean")fail(`${regionId}/${item.id} missing acceptance result`);
    if(item.discovery){
      for(const field of ["candidateCount","withWebsiteCount","qualifiedCount","retryCount"]){
        if(!finite(item.discovery[field],0))fail(`${regionId}/${item.id} has invalid discovery ${field}`);
      }
    }
  }
  if(region.coverageAreaAcceptance){
    if(Number(region.coverageAreaAcceptance.measured)!==configured.size)fail(`coverage-dashboard ${regionId} area acceptance count mismatch`);
    if(!finite(region.coverageAreaAcceptance.passing,0,configured.size))fail(`coverage-dashboard ${regionId} has invalid passing area count`);
  }
}

for(const [regionId,summary] of Object.entries(locationCoverage.regions||{})){
  if(!REGIONS[regionId])fail(`location-resolution-coverage references unknown region ${regionId}`);
  for(const field of ["unresolvedVenueCount","resolvedPendingRefreshCount","representedEventCount","highPriorityCount"]){
    if(!finite(summary[field],0))fail(`location-resolution-coverage ${regionId} has invalid ${field}`);
  }
}

if(failures.length){
  console.error("Locale coverage validation failed:");
  for(const failure of failures)console.error(" - "+failure);
  process.exit(1);
}
console.log(`Locale coverage validation passed: ${coverageAreas.length} coverage areas, ${queue.length} location queries.`);
