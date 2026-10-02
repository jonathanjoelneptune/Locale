import {classifyEvent} from "../event-classification.mjs";
import {zonedLocalIso,parseClock} from "../weekly-recurrence.mjs";

const UA="Mozilla/5.0 (compatible; LocaleEvents/1.5; +https://jonathanjoelneptune.github.io/Locale/)";
const CIVIC_ONLY=/\b(?:city council|planning commission|civil service commission|traffic safety committee|board of trustees|oversight committee|commission meeting|committee meeting|closed session|city offices closed|council meeting)\b/i;

const decode=value=>String(value||"")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v[0].toLowerCase()==="x"?v.slice(1):v,v[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">",ndash:"–",mdash:"—"}[name.toLowerCase()]))
  .replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
const strip=value=>decode(String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));
const slug=value=>String(value||"event").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"event";

function parseDateParts(text){
  const matches=[...String(text||"").matchAll(/(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM)))?/gi)];
  if(!matches.length)return null;
  const first=matches[0];
  const startClock=first[4]?parseClock(first[4]):null;
  const start=zonedLocalIso({
    year:Number(first[3]),month:Number(first[1]),day:Number(first[2]),
    hour:startClock?.hour??12,minute:startClock?.minute??0,timeZone:"America/Los_Angeles"
  });

  let end=null;
  const explicitFull=String(text||"").match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*-\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
  const sameDay=String(text||"").match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})\s+(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
  const dateRange=String(text||"").match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})\s*-\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/i);
  if(explicitFull){
    const c=parseClock(explicitFull[8]);
    end=zonedLocalIso({year:Number(explicitFull[7]),month:Number(explicitFull[5]),day:Number(explicitFull[6]),hour:c?.hour??23,minute:c?.minute??59,timeZone:"America/Los_Angeles"});
  }else if(sameDay){
    const c=parseClock(sameDay[5]);
    end=zonedLocalIso({year:Number(sameDay[3]),month:Number(sameDay[1]),day:Number(sameDay[2]),hour:c?.hour??23,minute:c?.minute??59,timeZone:"America/Los_Angeles"});
  }else if(dateRange){
    end=zonedLocalIso({year:Number(dateRange[6]),month:Number(dateRange[4]),day:Number(dateRange[5]),hour:23,minute:59,timeZone:"America/Los_Angeles"});
  }
  return {start,end,timeStatus:startClock?"known":"unknown"};
}

function absoluteUrl(href,base){
  try{return new URL(href,base).href}catch{return base}
}

export function parseGranicusListRows(html,baseUrl){
  const rows=[];
  for(const match of String(html||"").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const row=match[1];
    const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>cell[1]);
    if(cells.length<2)continue;
    const first=strip(cells[0]),dateText=strip(cells[1]);
    if(!first||/^event$/i.test(first)||!/(?:\d{1,2}\/\d{1,2}\/20\d{2})/.test(dateText))continue;
    const link=cells[0].match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1]||null;
    const dates=parseDateParts(dateText);
    if(!dates)continue;
    rows.push({title:first,dateText,url:link?absoluteUrl(link,baseUrl):baseUrl,...dates});
  }
  return rows;
}

export function parseGranicusDetail(html,{cityName=null}={}){
  const text=strip(html);
  const coordinate=text.match(/(-?\d{2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)/);
  const address=text.match(/\b\d{2,6}\s+[A-Za-z0-9][A-Za-z0-9 .#'’\-]+\s(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Ln|Lane|Ct|Court|Pkwy|Parkway|Plaza|Mission Road|National City Blvd)(?:\.?)(?:,?\s+[A-Za-z .'-]+)?(?:,?\s*CA)?\s*\d{5}\b/i)?.[0]||null;
  const loc=text.match(/(?:Event location|Location):\s*(.+?)(?=\s+(?:Date|Time|When|Contact|Description|Share|Add to Calendar|Tagged as):|$)/i)?.[1]?.trim()||null;
  const description=text.match(/(?:Description|Details):\s*(.+?)(?=\s+(?:Location|Date|Time|Contact|Share|Add to Calendar):|$)/i)?.[1]?.trim()||null;
  const venue=loc&&loc.length<=140?loc.replace(address||"","").replace(/^[\s,–—-]+|[\s,–—-]+$/g,"").trim()||loc:null;
  return {
    venue:venue||null,
    address,
    lat:coordinate?Number(coordinate[1]):null,
    lng:coordinate?Number(coordinate[2]):null,
    description:description||null,
    geocodeQuery:address||(venue?[venue,cityName,"CA"].filter(Boolean).join(", "):null)
  };
}

function hintFor(title,source){
  for(const hint of source.locationHints||[]){
    try{
      if(new RegExp(hint.match,"i").test(title))return hint;
    }catch{}
  }
  return null;
}

async function fetchHtml(url){
  const response=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Granicus ${response.status} ${url}`);
  return {html:await response.text(),url:response.url||url};
}

function pageUrl(endpoint,page){
  if(page<=1)return endpoint;
  if(/\/-npage-\d+/i.test(endpoint))return endpoint.replace(/\/-npage-\d+/i,`/-npage-${page}`);
  if(/\/-sortd-(?:asc|desc)/i.test(endpoint))return endpoint.replace(/(\/-sortd-(?:asc|desc))/i,`/-npage-${page}$1`);
  return endpoint.replace(/\/$/,"")+`/-npage-${page}`;
}

function totalPages(html,maxPages){
  const text=strip(html);
  const total=Number(text.match(/\b\d+\s*-\s*\d+\s+of\s+([\d,]+)\s+items\b/i)?.[1]?.replace(/,/g,"")||0);
  return Math.max(1,Math.min(maxPages,total?Math.ceil(total/20):1));
}

export async function granicusMunicipalEvents({
  endpoints=[],
  sourceName,
  sourceId,
  fallbackCenter,
  cityName,
  locationHints=[],
  days=45,
  maxPages=8,
  maxDetails=120
}={}){
  const source={locationHints};
  const endpointList=(Array.isArray(endpoints)?endpoints:[endpoints]).filter(Boolean);
  if(!endpointList.length)throw new Error(`${sourceName} Granicus adapter requires endpoint`);
  const listingRows=[];
  const endpointErrors=[];
  for(const endpoint of endpointList){
    let first;
    try{first=await fetchHtml(endpoint)}
    catch(error){endpointErrors.push(String(error?.message||error));continue}
    listingRows.push(...parseGranicusListRows(first.html,first.url));
    const pages=totalPages(first.html,maxPages);
    for(let page=2;page<=pages;page++){
      try{
        const next=await fetchHtml(pageUrl(endpoint,page));
        listingRows.push(...parseGranicusListRows(next.html,next.url));
      }catch{}
    }
  }
  if(!listingRows.length&&endpointErrors.length){
    throw new Error(`${sourceName} Granicus endpoints failed: ${endpointErrors.join(" | ")}`);
  }

  const uniqueRows=[...new Map(listingRows.map(row=>[`${row.title}|${row.start}|${row.url}`,row])).values()]
    .filter(row=>!CIVIC_ONLY.test(row.title)&&!/\bcancel(?:led|ed)\b/i.test(row.title));
  const detailUrls=[...new Set(uniqueRows.map(row=>row.url).filter(url=>url&&!endpointList.includes(url)))].slice(0,maxDetails);
  const detailByUrl=new Map;
  for(let offset=0;offset<detailUrls.length;offset+=8){
    const batch=detailUrls.slice(offset,offset+8);
    const settled=await Promise.allSettled(batch.map(async url=>{
      const page=await fetchHtml(url);
      return [url,parseGranicusDetail(page.html,{cityName})];
    }));
    for(const result of settled)if(result.status==="fulfilled")detailByUrl.set(result.value[0],result.value[1]);
  }

  const now=Date.now()-86400000,horizon=Date.now()+days*86400000,verified=new Date().toISOString();
  const out=[];
  for(const row of uniqueRows){
    const startMs=Date.parse(row.start);
    if(!Number.isFinite(startMs)||startMs<now||startMs>horizon)continue;
    const detail=detailByUrl.get(row.url)||{};
    const hint=hintFor(row.title,source);
    const venue=detail.venue||hint?.venue||sourceName;
    const address=detail.address||hint?.address||null;
    const lat=Number.isFinite(Number(detail.lat))?Number(detail.lat):Number.isFinite(Number(hint?.lat))?Number(hint.lat):fallbackCenter?.lat;
    const lng=Number.isFinite(Number(detail.lng))?Number(detail.lng):Number.isFinite(Number(hint?.lng))?Number(hint.lng):fallbackCenter?.lng;
    const precise=Number.isFinite(Number(detail.lat))&&Number.isFinite(Number(detail.lng))||Number.isFinite(Number(hint?.lat))&&Number.isFinite(Number(hint?.lng));
    const geocodeQuery=detail.geocodeQuery||hint?.query||address||(venue!==sourceName?[venue,cityName,"CA"].filter(Boolean).join(", "):null);
    const description=detail.description||row.dateText;
    out.push({
      id:`${sourceId}:${slug(row.title)}:${slug(venue)}:${row.start}`,
      title:row.title,
      category:classifyEvent(row.title,description,venue),
      subcategories:["municipal-community"],
      tags:["municipal",cityName].filter(Boolean),
      venue,address,geocodeQuery,
      lat,lng,locationPrecision:precise?"source":"source-center",
      start:row.start,end:row.end||null,timeStatus:row.timeStatus,timeZone:"America/Los_Angeles",
      price:/\bfree\b/i.test(row.title+" "+description)?"Free":null,
      priceStatus:/\bfree\b/i.test(row.title+" "+description)?"free":"unknown",
      url:row.url,source:sourceName,description,featured:false,image:null,sourceUrl:row.url,lastVerified:verified
    });
  }
  if(!out.length)throw new Error(`${sourceName} Granicus adapter returned no public events`);
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
