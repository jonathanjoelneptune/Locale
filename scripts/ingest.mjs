import {writeFile,mkdir} from "node:fs/promises";
import {ticketmasterEvents} from "./providers/ticketmaster.mjs";
import {sanDiegoCityEvents} from "./providers/sandiego-city.mjs";
import {powayEvents} from "./providers/poway.mjs";
import {canonicalizeVenue} from "./venue-canonical.mjs";

const providers=[
  ["ticketmaster",()=>ticketmasterEvents({apiKey:process.env.TICKETMASTER_API_KEY})],
  ["san-diego-city",()=>sanDiegoCityEvents()],
  ["poway",()=>powayEvents()]
];
const results=await Promise.allSettled(providers.map(([,run])=>run()));
const events=[];
results.forEach((r,i)=>{
  const name=providers[i][0];
  if(r.status==="fulfilled"){events.push(...r.value.map(canonicalizeVenue));console.log(`${name}: ${r.value.length} events`)}
  else console.error(`${name} failed:`,r.reason);
});
if(!events.length){console.log("Providers returned no events; leaving current event file unchanged.");process.exit(0)}

const words=s=>new Set(String(s||"").toLowerCase().replace(/\b(202[0-9]|annual|the|presented by)\b/g,"").replace(/[^a-z0-9]+/g," ").trim().split(/\s+/).filter(Boolean));
const similarity=(a,b)=>{const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let n=0;for(const x of A)if(B.has(x))n++;return n/Math.max(A.size,B.size)};
const sameEvent=(a,b)=>{
  if(String(a.start).slice(0,10)!==String(b.start).slice(0,10))return false;
  const venueMatch=a.venueKey&&b.venueKey?a.venueKey===b.venueKey:similarity(a.venue,b.venue)>=.72;
  return venueMatch&&similarity(a.title,b.title)>=.68;
};
const merge=(a,b)=>{
  const sources=[...(a.sources||[{name:a.source,url:a.sourceUrl||a.url}]),...(b.sources||[{name:b.source,url:b.sourceUrl||b.url}])];
  const uniq=[...new Map(sources.filter(x=>x.name).map(x=>[x.name+"|"+(x.url||""),x])).values()];
  const primary=a.source==="Ticketmaster"?a:b.source==="Ticketmaster"?b:a;
  const other=primary===a?b:a;
  return {...other,...primary,
    description:primary.description||other.description||"",
    image:primary.image||other.image||null,
    price:primary.price||other.price||null,
    priceStatus:primary.priceStatus!=="unknown"?primary.priceStatus:other.priceStatus||"unknown",
    sources:uniq,
    sourceCount:uniq.length
  };
};
const unique=[];
for(const e of events){
  const i=unique.findIndex(x=>sameEvent(x,e));
  if(i<0)unique.push({...e,sources:[{name:e.source,url:e.sourceUrl||e.url}],sourceCount:1});
  else unique[i]=merge(unique[i],e);
}
const sorted=unique.sort((a,b)=>new Date(a.start)-new Date(b.start));
await mkdir("src/data",{recursive:true});
await writeFile("src/data/events.json",JSON.stringify(sorted,null,2)+"\\n");
console.log(`Wrote ${sorted.length} canonical events from ${events.length} provider records.`);
