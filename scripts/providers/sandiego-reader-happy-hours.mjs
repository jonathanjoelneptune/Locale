import {readFile,writeFile} from "node:fs/promises";
import {weeklyOccurrences,parseClock} from "../weekly-recurrence.mjs";

const BASE="https://www.sandiegoreader.com/specials";
const DAYS=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const UA="Mozilla/5.0 (compatible; LocaleEvents/1.4; +https://jonathanjoelneptune.github.io/Locale/)";
const PLACE_CACHE_PATH="src/data/reader-place-cache.json";
const POSITIVE_PLACE_TTL_MS=90*86400000;
const NEGATIVE_PLACE_TTL_MS=7*86400000;
const MAX_NEW_PLACE_LOOKUPS_PER_RUN=60;

const decode=value=>String(value||"")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v[0].toLowerCase()==="x"?v.slice(1):v,v[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">",ndash:"–",mdash:"—"}[name.toLowerCase()]))
  .replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
const strip=value=>decode(String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));

export function parseReaderPlaceMetadata(html){
  const source=String(html||"");
  const payloads=[];
  for(const match of source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{payloads.push(JSON.parse(match[1]))}catch{}
  }

  const objects=[];
  const walk=value=>{
    if(!value)return;
    if(Array.isArray(value)){for(const item of value)walk(item);return}
    if(typeof value!=="object")return;
    objects.push(value);
    for(const child of Object.values(value))walk(child);
  };
  walk(payloads);

  for(const object of objects){
    const address=object?.address;
    if(!address||typeof address!=="object")continue;
    const street=decode(address.streetAddress);
    const locality=decode(address.addressLocality);
    const region=decode(address.addressRegion);
    const postal=decode(address.postalCode);
    if(!street||!locality||!/\bCA\b/i.test(region||"CA")||!/^\d{5}(?:-\d{4})?$/.test(postal||""))continue;
    const lat=Number(object?.geo?.latitude),lng=Number(object?.geo?.longitude);
    return {
      address:[street,locality,region||"CA",postal].filter(Boolean).join(", "),
      lat:Number.isFinite(lat)?lat:null,
      lng:Number.isFinite(lng)?lng:null
    };
  }

  const text=strip(source);
  const match=text.match(/\b(\d{1,6}\s+[A-Za-z0-9][A-Za-z0-9 .#'’&\/-]{2,100}),\s*([A-Za-z .'-]{2,60}),\s*CA\s+(\d{5}(?:-\d{4})?)\b/);
  if(match)return {address:`${match[1]}, ${match[2]}, CA ${match[3]}`,lat:null,lng:null};
  return null;
}

async function readPlaceCache(){
  try{return JSON.parse(await readFile(PLACE_CACHE_PATH,"utf8"))}
  catch{return {}}
}
async function writePlaceCache(cache){
  const ordered=Object.fromEntries(Object.entries(cache).sort(([a],[b])=>a.localeCompare(b)));
  await writeFile(PLACE_CACHE_PATH,JSON.stringify(ordered,null,2)+"\n");
}
const placeCacheFresh=(entry,now=Date.now())=>{
  if(!entry?.checkedAt)return false;
  const age=now-Date.parse(entry.checkedAt);
  if(!Number.isFinite(age))return false;
  return age<(entry.miss?NEGATIVE_PLACE_TTL_MS:POSITIVE_PLACE_TTL_MS);
};
const readerPlaceUrl=value=>{
  try{
    const url=new URL(value);
    return url.hostname==="www.sandiegoreader.com"&&url.pathname.startsWith("/places/")?url.href:null;
  }catch{return null}
};

async function enrichReaderPlaces(items){
  const cache=await readPlaceCache();
  const urls=[...new Set(items.map(item=>readerPlaceUrl(item.url)).filter(Boolean))];
  const missing=urls.filter(url=>!placeCacheFresh(cache[url])).slice(0,MAX_NEW_PLACE_LOOKUPS_PER_RUN);
  let dirty=false;

  for(let index=0;index<missing.length;index+=8){
    const batch=missing.slice(index,index+8);
    const settled=await Promise.allSettled(batch.map(async url=>{
      const response=await fetch(url,{
        headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},
        signal:AbortSignal.timeout(10000)
      });
      if(!response.ok)throw new Error(`Reader place ${response.status}`);
      return {url,meta:parseReaderPlaceMetadata(await response.text())};
    }));
    for(const [offset,result] of settled.entries()){
      const url=batch[offset];
      if(result.status==="fulfilled"){
        cache[url]=result.value.meta
          ?{...result.value.meta,checkedAt:new Date().toISOString()}
          :{miss:true,checkedAt:new Date().toISOString()};
      }else{
        cache[url]={miss:true,checkedAt:new Date().toISOString(),error:String(result.reason?.message||result.reason)};
      }
      dirty=true;
    }
  }
  if(dirty)await writePlaceCache(cache);

  return new Map(items.map(item=>{
    const url=readerPlaceUrl(item.url);
    const meta=url&&!cache[url]?.miss?cache[url]:null;
    return [`${item.day}|${item.venue}|${item.neighborhood}|${item.detail}`,meta];
  }));
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

export async function sanDiegoReaderHappyHourEvents({days=45,enrichPlaces=true}={}){
  const settled=await Promise.allSettled(DAYS.map(async day=>{
    const endpoint=`${BASE}/${day}/`;
    const response=await fetch(endpoint,{headers:{"User-Agent":UA,Accept:"text/html","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`Reader specials ${day} ${response.status}`);
    return parseReaderSpecials(await response.text(),day);
  }));
  const allItems=settled.flatMap(result=>result.status==="fulfilled"?result.value:[]);
  const placeMetadata=enrichPlaces?await enrichReaderPlaces(allItems):new Map();
  const verified=new Date().toISOString(),out=[];
  for(const result of settled){
    if(result.status!=="fulfilled")continue;
    for(const item of result.value){
      const meta=placeMetadata.get(`${item.day}|${item.venue}|${item.neighborhood}|${item.detail}`)||null;
      const clock=startClock(item.detail);
      const starts=weeklyOccurrences({day:item.day,time:{hour:clock.hour,minute:clock.minute},days,timeZone:"America/Los_Angeles"});
      for(const start of starts){
        out.push({
          id:`reader-happy-hour:${item.day}:${item.venue.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,65)}:${start}`,
          title:`Happy Hour at ${item.venue}`,
          category:"food",subcategories:["happy-hour","recurring-special"],tags:["happy-hour","deal","recurring-special",item.day],
          venue:item.venue,address:meta?.address||null,
          geocodeQuery:meta?.address||[item.venue,item.neighborhood,"San Diego County, CA"].filter(Boolean).join(", "),
          lat:meta?.lat!==null&&meta?.lat!==undefined&&Number.isFinite(Number(meta.lat))?Number(meta.lat):32.7157,
          lng:meta?.lng!==null&&meta?.lng!==undefined&&Number.isFinite(Number(meta.lng))?Number(meta.lng):-117.1611,
          locationPrecision:meta?.lat!==null&&meta?.lat!==undefined&&meta?.lng!==null&&meta?.lng!==undefined&&Number.isFinite(Number(meta.lat))&&Number.isFinite(Number(meta.lng))?"source":"source-center",
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
  }
  if(!out.length)throw new Error("San Diego Reader happy-hour adapter returned no specials");
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
