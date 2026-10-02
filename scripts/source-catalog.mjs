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
  const endpointKeys=new Set(
    (staticSources||[]).filter(source=>source.enabled!==false).map(sourceEndpointKey).filter(Boolean)
  );
  for(const source of discoveredSources||[]){
    if(!source?.id||source.enabled===false)continue;
    if(byId.has(source.id))continue;
    const key=sourceEndpointKey(source);
    if(key&&endpointKeys.has(key))continue;
    byId.set(source.id,source);
    if(key)endpointKeys.add(key);
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
