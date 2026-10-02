import {readFile,writeFile} from "node:fs/promises";

const readJson=async(path,fallback)=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch{return fallback}
};
const ageMinutes=(value,now)=>{
  const time=Date.parse(value||"");
  return Number.isFinite(time)?Number(((now-time)/60000).toFixed(1)):null;
};

export async function buildSystemHealth({now=Date.now()}={}){
  const [discoveryState,dashboard,eventCoverage,locationCoverage]=await Promise.all([
    readJson("src/data/discovery-state.json",{}),
    readJson("src/data/coverage-dashboard.json",{}),
    readJson("src/data/coverage.json",{}),
    readJson("src/data/location-resolution-coverage.json",{})
  ]);
  const discoveryAge=ageMinutes(discoveryState.lastRunAt,now);
  const reconcileAge=ageMinutes(dashboard.generatedAt,now);
  const eventAge=ageMinutes(eventCoverage.generatedAt,now);
  const locationAge=ageMinutes(locationCoverage.generatedAt,now);
  const discoveryStale=discoveryAge===null||discoveryAge>20;
  const reconcileStale=reconcileAge===null||reconcileAge>30;
  const eventStale=eventAge===null||eventAge>420;
  const locationStale=locationAge===null||locationAge>120;
  const output={
    generatedAt:new Date(now).toISOString(),
    status:discoveryStale||reconcileStale?"degraded":eventStale||locationStale?"warning":"healthy",
    discovery:{
      expectedCadenceMinutes:10,
      staleAfterMinutes:20,
      lastRunAt:discoveryState.lastRunAt||null,
      ageMinutes:discoveryAge,
      stale:discoveryStale
    },
    reconciliation:{
      expectedCadenceMinutes:15,
      staleAfterMinutes:30,
      lastGeneratedAt:dashboard.generatedAt||null,
      ageMinutes:reconcileAge,
      stale:reconcileStale
    },
    eventRefresh:{
      expectedCadenceMinutes:360,
      staleAfterMinutes:420,
      lastGeneratedAt:eventCoverage.generatedAt||null,
      ageMinutes:eventAge,
      stale:eventStale
    },
    locationResolution:{
      expectedCadenceMinutes:60,
      staleAfterMinutes:120,
      lastGeneratedAt:locationCoverage.generatedAt||null,
      ageMinutes:locationAge,
      stale:locationStale
    }
  };
  await writeFile("src/data/system-health.json",JSON.stringify(output,null,2)+"\n");
  return output;
}

if(import.meta.url===`file://${process.argv[1]}`)await buildSystemHealth();
