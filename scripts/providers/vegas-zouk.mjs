import {classifyEvent} from "../event-classification.mjs";

// Zouk's official event URLs encode the actual performance date as YYYYMMDD.
// Requiring a dated per-event URL avoids treating generic venue/artist pages as shows.
export function parseZoukLinks(html,base,{now=new Date(),days=60,sourceName="Zouk Group Las Vegas",sourceId="lv-zouk"}={}){
  const startKey=new Date(now.getTime()-86400000).toISOString().slice(0,10);
  const endKey=new Date(now.getTime()+days*86400000).toISOString().slice(0,10);
  const output=new Map();
  for(const match of String(html||"").matchAll(/href=["']([^"'#]+)["']/gi)){
    let url;
    try{url=new URL(match[1].replace(/&amp;/g,"&"),base)}catch{continue}
    if(url.origin!==new URL(base).origin)continue;
    const path=url.pathname.match(/\/event\/[^/]*?(20\d{6})\/([^/]+)\/?$/i);
    if(!path)continue;
    const raw=path[1],day=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
    if(day<startKey||day>endKey||Number.isNaN(Date.parse(day+"T12:00:00")))continue;
    const name=decodeURIComponent(path[2]).replace(/[-_]+/g," ").replace(/\s+/g," ").trim();
    if(!name||name.length<2)continue;
    const title=name.replace(/\b\w/g,s=>s.toUpperCase());
    output.set(url.pathname,{
      id:`${sourceId}:${raw}:${path[2]}`,
      title,category:classifyEvent(title,"nightlife DJ", "nightlife"),
      venue:"Zouk Nightclub",address:"3000 S Las Vegas Blvd, Las Vegas, NV 89109",
      lat:36.1334,lng:-115.1650,locationPrecision:"venue-known",
      start:day,end:null,timeStatus:"unknown",price:null,priceStatus:"unknown",
      url:url.href,source:sourceName,sourceUrl:url.href,description:"",
      featured:false,image:null,lastVerified:new Date(now).toISOString()
    });
  }
  return [...output.values()].sort((a,b)=>a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
}

export async function vegasZoukEvents({endpoint="https://zoukgrouplv.com/events/",sourceName="Zouk Group Las Vegas",sourceId="lv-zouk",days=60}={}){
  const res=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 (compatible; LocaleEvents/1.2)",Accept:"text/html,application/xhtml+xml"},signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw new Error(`${sourceName} calendar HTTP ${res.status}`);
  return parseZoukLinks(await res.text(),res.url||endpoint,{sourceName,sourceId,days});
}
