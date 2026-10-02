import {classifyEvent} from "../event-classification.mjs";

const strip=value=>String(value||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
const first=(object,keys)=>keys.map(key=>object?.[key]).find(value=>value!==undefined&&value!==null&&value!=="");

function collect(value,out=[]){
  if(!value||typeof value!=="object")return out;
  if(Array.isArray(value)){for(const item of value)collect(item,out);return out}
  const title=first(value,["title","name","eventTitle","event_name","summary"]);
  const start=first(value,["startDate","start_date","start","startsAt","starts_at","dateTime","datetime","date"]);
  if(title&&start&&Number.isFinite(Date.parse(start)))out.push(value);
  for(const child of Object.values(value))if(child&&typeof child==="object")collect(child,out);
  return out;
}

function locationOf(event,sourceName,fallbackCenter){
  const location=first(event,["location","venue","place"]);
  if(typeof location==="string")return {venue:strip(location)||sourceName,address:null,...fallbackCenter,locationPrecision:"source-center"};
  const venue=first(location||{},["name","title","venue"])||sourceName;
  const addressValue=first(location||{},["address","formattedAddress","streetAddress"]);
  const address=typeof addressValue==="string"?addressValue:
    [addressValue?.streetAddress,addressValue?.addressLocality,addressValue?.addressRegion,addressValue?.postalCode].filter(Boolean).join(", ");
  const geo=(location||{}).geo||event.geo||{};
  const lat=Number(first(geo,["latitude","lat"])??event.latitude??event.lat);
  const lng=Number(first(geo,["longitude","lng","lon"])??event.longitude??event.lng);
  if(Number.isFinite(lat)&&Number.isFinite(lng))return {venue:strip(venue),address:address||null,lat,lng,locationPrecision:"source"};
  return {venue:strip(venue),address:address||null,...fallbackCenter,locationPrecision:"source-center"};
}

export async function embeddedJsonEvents({endpoint,sourceName,sourceId,fallbackCenter,days=45}){
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 (compatible; LocaleEvents/1.2; +https://jonathanjoelneptune.github.io/Locale/)",Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`${sourceName} embedded JSON page ${response.status}`);
  const html=await response.text();
  const payloads=[];
  for(const match of html.matchAll(/<script\b[^>]*(?:type=["']application\/(?:ld\+)?json["']|id=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/gi)){
    try{payloads.push(JSON.parse(match[1]))}catch{}
  }
  const now=Date.now(),horizon=now+days*86400000,verified=new Date().toISOString();
  const candidates=collect(payloads);
  const out=[];
  for(const event of candidates){
    const startValue=first(event,["startDate","start_date","start","startsAt","starts_at","dateTime","datetime","date"]);
    const startTime=Date.parse(startValue);
    if(!Number.isFinite(startTime)||startTime<now-86400000||startTime>horizon)continue;
    const title=strip(first(event,["title","name","eventTitle","event_name","summary"]));
    if(!title)continue;
    const location=locationOf(event,sourceName,fallbackCenter);
    const description=strip(first(event,["description","excerpt","body","details"])||"");
    const urlValue=first(event,["url","link","eventUrl","event_url","permalink"]);
    let url=endpoint;
    try{if(urlValue)url=new URL(urlValue,endpoint).href}catch{}
    out.push({
      id:`${sourceId}:${String(first(event,["id","_id","uuid","slug"])||title).replace(/[^0-9A-Za-z]+/g,"").slice(-80)}:${new Date(startTime).toISOString()}`,
      title,category:classifyEvent(title,description,event.tags,event.categories),
      venue:location.venue,address:location.address,lat:location.lat,lng:location.lng,locationPrecision:location.locationPrecision,
      start:new Date(startTime).toISOString(),
      end:first(event,["endDate","end_date","end","endsAt","ends_at"])||null,
      price:/\bfree\b/i.test(description)?"Free":null,priceStatus:/\bfree\b/i.test(description)?"free":"unknown",
      url,source:sourceName,description,featured:false,image:null,sourceUrl:url,lastVerified:verified
    });
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
