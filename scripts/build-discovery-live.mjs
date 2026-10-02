import {readFile,writeFile} from "node:fs/promises";

const readJson=async(path,fallback)=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch{return fallback}
};

export async function buildDiscoveryLive(){
  const [queue,sources,state]=await Promise.all([
    readJson("src/data/discovery-queue.json",[]),
    readJson("src/data/discovered-sources.json",[]),
    readJson("src/data/discovery-state.json",{})
  ]);
  const lastRun=state.lastRun||null;
  const recentProbeResults=[...queue]
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
      probeLane:item.probeLane||null,
      attempts:item.attempts||0,
      lastCheckedAt:item.lastCheckedAt,
      nextCheckAt:item.nextCheckAt||null,
      coldUntil:item.coldUntil||null,
      sourceId:item.sourceId||null,
      lastResult:item.lastResult||null
    }));
  const recentPromotions=[...sources].filter(source=>source.enabled!==false&&!source.aliasOf)
    .sort((a,b)=>String(b.discoveredAt||"").localeCompare(String(a.discoveredAt||"")))
    .slice(0,30)
    .map(source=>({
      id:source.id,name:source.name,regions:source.regions,adapter:source.adapter,
      endpoint:source.endpoint,discoveredAt:source.discoveredAt,
      discoveryEventCount:source.discoveryEventCount||0
    }));
  const output={
    generatedAt:new Date().toISOString(),
    lastRun,
    runHistory:Array.isArray(state.runHistory)?state.runHistory:[],
    lastOverpassRunAt:state.lastOverpassRunAt||null,
    regions:state.regions||{},
    recentProbeResults,
    recentPromotions
  };
  await writeFile("src/data/discovery-live.json",JSON.stringify(output,null,2)+"\n");
  return output;
}

if(import.meta.url===`file://${process.argv[1]}`)await buildDiscoveryLive();
