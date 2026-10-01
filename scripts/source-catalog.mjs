import {readFile} from "node:fs/promises";
import {SOURCES as STATIC_SOURCES,sourceCoversRegion} from "./source-registry.mjs";

const readJson=async(path,fallback)=>{
  try{return JSON.parse(await readFile(path,"utf8"))}
  catch{return fallback}
};

export async function loadDiscoveredSources(){
  const sources=await readJson("src/data/discovered-sources.json",[]);
  return Array.isArray(sources)?sources:[];
}

export async function loadAllSources(){
  const discovered=await loadDiscoveredSources();
  const byId=new Map(STATIC_SOURCES.map(source=>[source.id,source]));
  for(const source of discovered){
    if(!source?.id||source.enabled===false)continue;
    if(byId.has(source.id))continue;
    byId.set(source.id,source);
  }
  return [...byId.values()];
}

export const sourcesForRegionFrom=(sources,region)=>
  (sources||[]).filter(source=>sourceCoversRegion(source,region));

export {sourceCoversRegion,STATIC_SOURCES};
