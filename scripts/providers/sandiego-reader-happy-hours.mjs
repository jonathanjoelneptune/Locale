import {readFile,writeFile} from "node:fs/promises";
import {weeklyOccurrences,parseClock} from "../weekly-recurrence.mjs";

const BASE="https://www.sandiegoreader.com/specials";
const DAYS=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const UA="Mozilla/5.0 (compatible; LocaleEvents/1.5; +https://jonathanjoelneptune.github.io/Locale/)";
const PLACE_CACHE_PATH="src/data/reader-place-cache.json";
const PLACE_CACHE_MAX_AGE_MS=30*86400000;

const decode=value=>String(value||"")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v[0].toLowerCase()==="x"?v.slice(1):v,v[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">",ndash:"–",mdash:"—"}[name.toLowerCase()]))
  .replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
const strip=value=>decode(String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));

const finite=value=>Number.isFinite(Number(value));
const cleanAddress=value=>decode(value).replace(/\s+,/g,",").replace(/,\s*,/g,",").trim();

function jsonObjects(value,out=[]){
  if(!value||typeof value!=="object")return out;
  if(Array.isArray(value)){for(const item of value)jsonObjects(item,out);return out}
  out.push(value);
  for(const child of Object.values(value))if(child&&typeof child==="object")jsonObjects(child,out);
  return out;
}

function structuredAddress(value){
  if(!value)return null;
  if(typeof value==="string")return cleanAddress(value);
  if(typeof value!=="object")return null;
  const parts=[value.streetAddress,value.addressLocality,value.addressRegion,value.postalCode].filter(Boolean);
  return parts.length?cleanAddress(parts.join(", ")):null;
}

export function parseReaderPlaceDetails(html,expectedName=null){
  const source=String(html||"");
  const candidates=[];
  for(const match of source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{candidates.push(...jsonObjects(JSON.parse(match[1])))}catch{}
  }
  const expected=String(expectedName||"").toLowerCase();
  const ranked=candidates
    .filter(item=>item&&typeof item==="object"&&(item.address||item.geo))
    .sort((a,b)=>{
      const score=item=>{
        const type=Array.isArray(item["@type"])?item["@type"].join(" "):String(item["@type"]||"");
        let n=/Restaurant|BarOrPub|FoodEstablishment|LocalBusiness/i.test(type)?4:0;
        if(expected&&String(item.name||"").toLowerCase().includes(expected))n+=4;
        if(item.address)n+=2;
        if(item.geo)n+=1;
        return n;
      };
      return score(b)-score(a);
    });
  for(const item of ranked){
    const address=structuredAddress(item.address);
    const lat=Number(item.geo?.latitude??item.latitude);
    const lng=Number(item.geo?.longitude??item.longitude);
    if(address||finite(lat)&&finite(lng))return {
      address:address||null,
      lat:finite(lat)?lat:null,
      lng:finite(lng)?lng:null
    };
  }

  const text=strip(source);
  const address=text.match(/\b\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9 .#'’\-]+(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Drive|Dr|Way|Lane|Ln|Court|Ct|Highway|Hwy|Parkway|Pkwy|Plaza)(?:\s+(?:#|Suite|Ste\.?)[A-Za-z0-9-]+)?\s*,\s*[A-Za-z .'-]+\s*,\s*CA\s*\d{5}\b/i)?.[0]||null;
  const coordinate=source.match(/(?:"latitude"|latitude)\s*[:=]\s*["']?(-?\d{2}\.\d+)/i);
  const longitude=source.match(/(?:"longitude"|longitude)\s*[:=]\s*["']?(-?\d{2,3}\.\d+)/i);
  return {
    address:address?cleanAddress(address):null,
    lat:coordinate?Number(coordinate[1]):null,
    lng:longitude?Number(longitude[1]):null
  };
}

async function readPlaceCache(path){
  if(!path)return {};
  try{return JSON.parse(await readFile(path,"utf8"))}catch{return {}}
}

async function enrichReaderPlaces(items,{cachePath=PLACE_CACHE_PATH,maxPlaceFetches=80}={}){
  const cache=await readPlaceCache(cachePath);
  const now=Date.now();
  const frequency=new Map;
  for(const item of items){
    if(!/\/places\//i.test(item.url||""))continue;
    frequency.set(item.url,(frequency.get(item.url)||0)+1);
  }
  const urls=[...frequency].sort((a,b)=>b[1]-a[1]).map(([url])=>url);
  let fetched=0,dirty=false;
  for(const url of urls){
    const cached=cache[url];
    const checked=Date.parse(cached?.checkedAt||"");
    if(cached&&Number.isFinite(checked)&&now-checked<PLACE_CACHE_MAX_AGE_MS)continue;
    if(fetched>=maxPlaceFetches)continue;
    fetched++;
    try{
      const response=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const venue=items.find(item=>item.url===url)?.venue||null;
      const detail=parseReaderPlaceDetails(await response.text(),venue);
      cache[url]={...detail,checkedAt:new Date().toISOString(),status:detail.address||finite(detail.lat)&&finite(detail.lng)?"ok":"no-location"};
      dirty=true;
    }catch(error){
      cache[url]={address:null,lat:null,lng:null,checkedAt:new Date().toISOString(),status:"fetch-failed",error:String(error?.message||error)};
      dirty=true;
    }
  }
  if(dirty&&cachePath)await writeFile(cachePath,JSON.stringify(cache,null,2)+"\n");
  return cache;
}

export function parseReaderSpecials(html,day){
  const source=String(html||"");
  const headings=[...source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m=>({index:m.index,name:strip(m[1])})).filter(x=>x.name);
  const anchors=[...source.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({index:m.index,url:m[1],name:strip(m[2])})).filter(x=>x.name);
  const specials=[...source.matchAll(/>\s*Special\s*</gi)].map(m=>m.index);
  const out=[];
  for(const pos of specials){
    const before=anchors.filter(item=>item.index<pos).at(-1);
    if(!before||before.name.length>100)continue;
    const neighborhood=headings.filter(item=>item.index<before.index).at(-1)?.name||null;
    const nextAnchor=anchors.find(item=>item.index>pos);
    const end=nextAnchor?.index||Math.min(source.length,pos+1800);
    const detail=strip(source.slice(pos,end)).replace(/^Special\s*/i,"").trim();
    if(!detail||detail.length<4)continue;
    let url=before.url;
    try{url=new URL(before.url,BASE).href}catch{}
    out.push({day,venue:before.name,neighborhood,detail,url});
  }
  return [...new Map(out.map(item=>[`${item.venue}|${item.neighborhood}|${item.detail}`,item])).values()];
}

function startClock(detail){
  if(/^all day\b/i.test(detail))return {hour:12,minute:0,known:false};
  if(/^open\s*-/i.test(detail))return {hour:12,minute:0,known:false};
  const parsed=parseClock(detail);
  return parsed?{...parsed,known:true}:{hour:16,minute:0,known:false};
}

export async function sanDiegoReaderHappyHourEvents({
  days=45,
  enrichPlaces=true,
  cachePath=PLACE_CACHE_PATH,
  maxPlaceFetches=80
}={}){
  const settled=await Promise.allSettled(DAYS.map(async day=>{
    const endpoint=`${BASE}/${day}/`;
    const response=await fetch(endpoint,{headers:{"User-Agent":UA,Accept:"text/html","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`Reader specials ${day} ${response.status}`);
    return parseReaderSpecials(await response.text(),day);
  }));
  const verified=new Date().toISOString(),out=[];
  const items=settled.filter(result=>result.status==="fulfilled").flatMap(result=>result.value);
  const placeCache=enrichPlaces?await enrichReaderPlaces(items,{cachePath,maxPlaceFetches}):{};
  for(const item of items){
      const clock=startClock(item.detail);
      const place=placeCache[item.url]||null;
      const hasPoint=finite(place?.lat)&&finite(place?.lng);
      const address=place?.address||null;
      const starts=weeklyOccurrences({day:item.day,time:{hour:clock.hour,minute:clock.minute},days,timeZone:"America/Los_Angeles"});
      for(const start of starts){
        out.push({
          id:`reader-happy-hour:${item.day}:${item.venue.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,65)}:${start}`,
          title:`Happy Hour at ${item.venue}`,
          category:"food",subcategories:["happy-hour","recurring-special"],tags:["happy-hour","deal","recurring-special",item.day],
          venue:item.venue,address,
          geocodeQuery:address||[item.venue,item.neighborhood,"San Diego County, CA"].filter(Boolean).join(", "),
          lat:hasPoint?Number(place.lat):32.7157,lng:hasPoint?Number(place.lng):-117.1611,
          locationPrecision:hasPoint?"source":"source-center",
          start,end:null,timeStatus:clock.known?"known":"unknown",timeZone:"America/Los_Angeles",
          price:/\$\s*\d/.test(item.detail)?item.detail.match(/\$\s*\d+(?:\.\d{1,2})?/)?.[0]||null:null,
          priceStatus:/\$\s*\d/.test(item.detail)?"source-text":"unknown",
          url:item.url,source:"San Diego Reader Happy Hours",
          description:[item.neighborhood,item.detail].filter(Boolean).join(" · "),
          featured:false,image:null,sourceUrl:`${BASE}/${item.day}/`,lastVerified:verified,
          recurring:true,dealType:"happy-hour",neighborhood:item.neighborhood||null
        });
      }
  }
  if(!out.length)throw new Error("San Diego Reader happy-hour adapter returned no specials");
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
