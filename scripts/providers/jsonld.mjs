import {classifyEvent} from "../event-classification.mjs";

const strip=value=>String(value||"").replace(/<[^>]+>/g," ").replace(/&amp;/gi,"&").replace(/&nbsp;/gi," ").replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g," ").trim();

function flatten(value,out=[]){
  if(!value)return out;
  if(Array.isArray(value)){for(const item of value)flatten(item,out);return out}
  if(typeof value!=="object")return out;
  const type=value["@type"];
  if(type==="Event"||(Array.isArray(type)&&type.includes("Event")))out.push(value);
  for(const child of Object.values(value))if(child&&typeof child==="object")flatten(child,out);
  return out;
}

function point(event,fallback){
  const place=Array.isArray(event.location)?event.location[0]:event.location;
  const geo=place?.geo||event.geo||{};
  const lat=Number(geo.latitude),lng=Number(geo.longitude);
  if(Number.isFinite(lat)&&Number.isFinite(lng))return {lat,lng,locationPrecision:"source"};
  return fallback?{...fallback,locationPrecision:"source-center"}:null;
}

function price(event){
  const offers=Array.isArray(event.offers)?event.offers:[event.offers].filter(Boolean);
  const values=offers.map(x=>Number(x?.lowPrice??x?.price)).filter(Number.isFinite);
  if(values.some(v=>v===0))return {price:"Free",priceStatus:"free"};
  if(values.length)return {price:"$"+Math.min(...values).toFixed(0)+"+",priceStatus:"known"};
  return {price:null,priceStatus:"unknown"};
}

export async function jsonLdEvents({endpoint,sourceName,sourceId,fallbackCenter}){
  const response=await fetch(endpoint,{headers:{"User-Agent":"Locale-events/1.0",Accept:"text/html"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`${sourceName} page ${response.status}`);
  const html=await response.text();
  const scripts=[...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const objects=[];
  for(const match of scripts){
    try{objects.push(JSON.parse(match[1]))}catch{}
  }
  const events=[...new Map(flatten(objects).map(event=>[String(event["@id"]||event.url||event.name)+"|"+String(event.startDate||""),event])).values()];
  const verified=new Date().toISOString();
  const out=[];
  for(const event of events){
    const location=point(event,fallbackCenter);
    const start=event.startDate;
    if(!event.name||!start||!location)continue;
    const place=Array.isArray(event.location)?event.location[0]:event.location;
    const venue=place?.name||place?.address?.streetAddress||sourceName;
    const address=typeof place?.address==="string"?place.address:[place?.address?.streetAddress,place?.address?.addressLocality,place?.address?.addressRegion,place?.address?.postalCode].filter(Boolean).join(", ");
    const title=strip(event.name);
    const description=strip(event.description||"");
    out.push({
      id:`${sourceId}:${String(event["@id"]||event.url||title).replace(/[^0-9A-Za-z]+/g,"").slice(-80)}:${String(start).replace(/[^0-9A-Za-z]+/g,"")}`,
      title,
      category:classifyEvent(title,description,event.eventStatus,event.keywords,venue),
      venue:strip(venue)||sourceName,
      address:address||null,
      lat:location.lat,lng:location.lng,locationPrecision:location.locationPrecision,
      start,end:event.endDate||null,...price(event),
      url:event.url||endpoint,source:sourceName,description,featured:false,
      image:Array.isArray(event.image)?event.image[0]:event.image||null,
      sourceUrl:event.url||endpoint,lastVerified:verified
    });
  }
  return out;
}
