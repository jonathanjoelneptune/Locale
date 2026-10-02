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

export const sourceEndpointKey=source=>{
  if(!source?.adapter||!source?.endpoint)return null;
  let endpoint;
  try{endpoint=new URL(source.endpoint).href.replace(/\/$/,"")}catch{endpoint=String(source.endpoint).replace(/\/$/,"")}
  return `${source.adapter}|${endpoint}`;
};

export function mergeSourceCatalog(staticSources,discoveredSources){
  const byId=new Map((staticSources||[]).map(source=>[source.id,source]));
  const canonicalByEndpoint=new Map(
    (staticSources||[])
      .filter(source=>source.enabled!==false)
      .map(source=>[sourceEndpointKey(source),source])
      .filter(([key])=>!!key)
  );

  for(const source of discoveredSources||[]){
    if(!source?.id||byId.has(source.id))continue;
    const key=sourceEndpointKey(source);
    const canonical=key?canonicalByEndpoint.get(key):null;

    if(source.aliasOf||canonical){
      byId.set(source.id,{
        ...source,
        enabled:false,
        sourceKind:"alias",
        aliasOf:source.aliasOf||canonical.id
      });
      continue;
    }
    if(source.enabled===false){
      // Keep disabled discovered-source tombstones in the catalog so historical
      // events/entity links remain referentially valid, while sourceCoversRegion
      // prevents them from being ingested again.
      byId.set(source.id,source);
      continue;
    }

    byId.set(source.id,source);
    if(key)canonicalByEndpoint.set(key,source);
  }
  return [...byId.values()];
}

export async function loadAllSources(){
  const discovered=await loadDiscoveredSources();
  return mergeSourceCatalog(STATIC_SOURCES,discovered);
}

export const sourcesForRegionFrom=(sources,region)=>
  (sources||[]).filter(source=>sourceCoversRegion(source,region));

export {sourceCoversRegion,STATIC_SOURCES};
