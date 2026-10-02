import {readFile,readdir} from "node:fs/promises";

const BASE="src/data/acquisition";
const readJson=async path=>JSON.parse(await readFile(path,"utf8"));
const sourceFiles=[
  "sources-tier-a.json",
  "sources-tier-b-1.json",
  "sources-tier-b-2.json",
  "sources-tier-b-3.json",
  "sources-tier-c.json"
];

export async function loadAcquisitionRegistry(){
  const sourceDocs=await Promise.all(sourceFiles.map(file=>readJson(`${BASE}/${file}`)));
  const sources=sourceDocs.flatMap(doc=>doc.sources||[]);
  const neighborhoodFiles=(await readdir(`${BASE}/neighborhoods`))
    .filter(file=>file.endsWith(".json"))
    .sort();
  const neighborhoodDocs=await Promise.all(neighborhoodFiles.map(file=>readJson(`${BASE}/neighborhoods/${file}`)));
  const areas=neighborhoodDocs.flatMap(doc=>doc.areas||[]);
  const taxonomy=await readJson(`${BASE}/taxonomy.json`);
  const states={};
  const priorities={A:0,B:0,C:0};
  for(const source of sources){
    const state=source.integrationState||"candidate";
    states[state]=(states[state]||0)+1;
    priorities[source.priority]=(priorities[source.priority]||0)+1;
  }
  return {
    schemaVersion:3,
    strategy:"source-first",
    regionId:"san-diego",
    sources,
    areas,
    taxonomy,
    sourceFiles,
    neighborhoodFiles,
    summary:{
      sourceCount:sources.length,
      priorities,
      states,
      areaCount:areas.length,
      taxonomyFamilyCount:Number(taxonomy.familyCount||taxonomy.rows?.length||0)
    }
  };
}

export const sourceAcquisitionById=registry=>new Map((registry?.sources||[]).map(source=>[source.id,source]));
export const neighborhoodAcquisitionByName=registry=>new Map((registry?.areas||[]).map(area=>[area.area,area]));
