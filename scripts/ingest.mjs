import {writeFile,mkdir} from "node:fs/promises";
import {ticketmasterEvents} from "./providers/ticketmaster.mjs";
import {sanDiegoCityEvents} from "./providers/sandiego-city.mjs";
import {powayEvents} from "./providers/poway.mjs";
import {canonicalizeVenue} from "./venue-canonical.mjs";
import {SOURCES,sourcesForRegion} from "./source-registry.mjs";
import {REGIONS} from "./regions.mjs";
import {cellFor} from "./geo-index.mjs";

const adapters={
 ticketmaster:async region=>ticketmasterEvents({apiKey:process.env.TICKETMASTER_API_KEY,center:region.center,radiusMiles:region.ingestRadiusMiles,regionId:region.id}),
 "san-diego-city":async()=>sanDiegoCityEvents(),
 poway:async()=>powayEvents()
};
const jobs=[];
for(const region of Object.values(REGIONS)){
 for(const source of sourcesForRegion(region.id,region.country)){
  const run=adapters[source.adapter];if(run)jobs.push({region,source,run});
 }
}
const results=await Promise.allSettled(jobs.map(j=>j.run(j.region)));
const events=[];
results.forEach((r,i)=>{
 const {region,source}=jobs[i];
 if(r.status==="fulfilled"){
  events.push(...r.value.map(e=>canonicalizeVenue({...e,regionId:e.regionId||region.id,sourceId:source.id})));
  console.log(`${region.id}/${source.id}: ${r.value.length} events`);
 }else console.error(`${region.id}/${source.id} failed:`,r.reason);
});
if(!events.length){console.log("Providers returned no events; leaving current event file unchanged.");process.exit(0)}

const words=s=>new Set(String(s||"").toLowerCase().replace(/\b(202[0-9]|annual|the|presented by)\b/g,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean));
const similarity=(a,b)=>{const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.max(A.size,B.size)};
const sameEvent=(a,b)=>String(a.start).slice(0,10)===String(b.start).slice(0,10)&&(a.venueKey&&b.venueKey?a.venueKey===b.venueKey:similarity(a.venue,b.venue)>=.72)&&similarity(a.title,b.title)>=.68;
const merge=(a,b)=>{
 const sources=[...(a.sources||[{id:a.sourceId,name:a.source,url:a.sourceUrl||a.url}]),...(b.sources||[{id:b.sourceId,name:b.source,url:b.sourceUrl||b.url}])];
 const uniq=[...new Map(sources.filter(x=>x.name).map(x=>[(x.id||x.name)+"|"+(x.url||""),x])).values()];
 const primary=a.source==="Ticketmaster"?a:b.source==="Ticketmaster"?b:a,other=primary===a?b:a;
 return {...other,...primary,description:primary.description||other.description||"",image:primary.image||other.image||null,price:primary.price||other.price||null,priceStatus:primary.priceStatus!=="unknown"?primary.priceStatus:other.priceStatus||"unknown",sources:uniq,sourceCount:uniq.length};
};
const unique=[];
for(const raw of events){
 const e={...raw,geoCell:cellFor(raw.lat,raw.lng)};
 const i=unique.findIndex(x=>sameEvent(x,e));if(i<0)unique.push({...e,sources:[{id:e.sourceId,name:e.source,url:e.sourceUrl||e.url}],sourceCount:1});else unique[i]=merge(unique[i],e);
}
const sorted=unique.sort((a,b)=>new Date(a.start)-new Date(b.start));
const coverage={generatedAt:new Date().toISOString(),regions:{}};
for(const region of Object.values(REGIONS)){
 const re=sorted.filter(e=>e.regionId===region.id);
 coverage.regions[region.id]={eventCount:re.length,sourceIds:[...new Set(re.map(e=>e.sourceId).filter(Boolean))],cells:[...new Set(re.map(e=>e.geoCell))].length};
}
await mkdir("src/data",{recursive:true});
await writeFile("src/data/events.json",JSON.stringify(sorted,null,2)+"\n");
await writeFile("src/data/coverage.json",JSON.stringify(coverage,null,2)+"\n");
console.log(`Wrote ${sorted.length} canonical events from ${events.length} provider records across ${Object.keys(REGIONS).length} regions.`);
