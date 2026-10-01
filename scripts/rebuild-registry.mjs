import {readFile,writeFile} from "node:fs/promises";
import {buildRegistry} from "./registry.mjs";
import {SOURCES} from "./source-registry.mjs";

const readJson=async path=>JSON.parse(await readFile(path,"utf8"));

const events=await readJson("src/data/events.json");
const coverage=await readJson("src/data/coverage.json");
let previousPlaces=[];
try{previousPlaces=await readJson("src/data/places.json")}catch{}
if(!Array.isArray(events))throw new Error("src/data/events.json must contain an array");

const registry=buildRegistry(events,SOURCES,{places:Array.isArray(previousPlaces)?previousPlaces:[]});
coverage.registryContractVersion=registry.coverage.contractVersion;
coverage.registryPlaceQualityVersion=1;
for(const [regionId,summary] of Object.entries(registry.coverage.regions)){
  if(!coverage.regions?.[regionId])continue;
  coverage.regions[regionId].registry=summary;
}

await writeFile("src/data/events.json",JSON.stringify(registry.events,null,2)+"\n");
await writeFile("src/data/places.json",JSON.stringify(registry.places,null,2)+"\n");
await writeFile("src/data/organizers.json",JSON.stringify(registry.organizers,null,2)+"\n");
await writeFile("src/data/series.json",JSON.stringify(registry.series,null,2)+"\n");
await writeFile("src/data/entity-source-links.json",JSON.stringify(registry.entitySources,null,2)+"\n");
await writeFile("src/data/coverage.json",JSON.stringify(coverage,null,2)+"\n");

console.log(`Rebuilt registry from current snapshot: ${registry.places.length} places, ${registry.organizers.length} organizers, ${registry.series.length} series, ${registry.entitySources.length} source links.`);
