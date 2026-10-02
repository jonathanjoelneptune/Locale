import {classifyEvent} from "../event-classification.mjs";
import {zonedLocalIso,parseClock} from "../weekly-recurrence.mjs";

const UA="Mozilla/5.0 (compatible; LocaleEvents/1.5; +https://jonathanjoelneptune.github.io/Locale/)";
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const CIVIC_ONLY=/\b(?:city council|planning commission|youth commission|commission meeting|committee meeting|city offices closed|closed session|public hearing)\b/i;

const decode=value=>String(value||"")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v[0].toLowerCase()==="x"?v.slice(1):v,v[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">",ndash:"–",mdash:"—"}[name.toLowerCase()]))
  .replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
const strip=value=>decode(String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));
const slug=value=>String(value||"event").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"event";

function abs(href,base){
  try{return new URL(href,base).href}catch{return null}
}

export function parseSanMarcosListingLinks(html,baseUrl){
  const source=String(html||""),out=[];
  for(const match of source.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const title=strip(match[2]);
    const url=abs(match[1],baseUrl);
    if(!title||!url)continue;
    let parsed;
    try{parsed=new URL(url)}catch{continue}
    if(!parsed.pathname.startsWith("/Meetings-Events/")||parsed.pathname==="/Meetings-Events/")continue;
    if(/^(Home|Back to top|Kids & family|Meeting|Newsletter signup|Online Services|Council Meetings)$/i.test(title))continue;
    const context=strip(source.slice(match.index+match[0].length,Math.min(source.length,match.index+match[0].length+900)));
    if(!/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2}\b/i.test(context))continue;
    out.push({title,url});
  }
  return [...new Map(out.map(row=>[row.url,row])).values()];
}

function parseWhen(text){
  const out=[];
  const re=/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(20\d{2})\s*\|\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))(?:\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM)))?/gi;
  for(const match of String(text||"").matchAll(re)){
    const month=MONTHS[match[1].toLowerCase()],day=Number(match[2]),year=Number(match[3]);
    const startClock=parseClock(match[4]),endClock=match[5]?parseClock(match[5]):null;
    if(!month||!startClock)continue;
    const start=zonedLocalIso({year,month,day,hour:startClock.hour,minute:startClock.minute,timeZone:"America/Los_Angeles"});
    const end=endClock?zonedLocalIso({year,month,day,hour:endClock.hour,minute:endClock.minute,timeZone:"America/Los_Angeles"}):null;
    out.push({start,end});
  }
  return [...new Map(out.map(row=>[row.start,row])).values()];
}

export function parseSanMarcosDetail(html,url){
  const text=strip(html);
  const title=strip(String(html||"").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"");
  const whens=parseWhen(text);
  const coordinate=text.match(/(-?\d{2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)/);
  const meetingLocation=text.match(/Meeting location:\s*(.+?)(?=\s+(?:Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Difficulty:|##|When|Location)|$)/i)?.[1]?.trim();
  const location=text.match(/(?:^|\s)Location:\s*(.+?)(?=\s+(?:This event|For more information|When|Add to Calendar|Tagged as|Contact)|$)/i)?.[1]?.trim();
  const address=(meetingLocation||location||text).match(/\b\d{2,6}\s+[A-Za-z0-9][A-Za-z0-9 .#'’\-]+(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Ln|Lane|Ct|Court|Pkwy|Parkway|Mission Road)(?:\.?)(?:,?\s+[A-Za-z .'-]+)?(?:,?\s*CA)?\s*\d{5}\b/i)?.[0]||null;
  const venue=(meetingLocation||location||"San Marcos").replace(address||"","").replace(/^[\s,–—-]+|[\s,–—-]+$/g,"").trim()||"San Marcos";
  const tag=text.match(/Tagged as:\s*(.+?)(?=\s+Back to top|$)/i)?.[1]?.trim()||null;
  const description=text.match(/Next date:[\s\S]*?(.*?)(?=\s+When\s|\s+Location\s|\s+Add to Calendar)/i)?.[1]?.trim()||text.slice(0,1200);
  return {
    title,url,whens,venue,address,
    lat:coordinate?Number(coordinate[1]):null,
    lng:coordinate?Number(coordinate[2]):null,
    tag,description
  };
}

async function fetchHtml(url){
  const response=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`San Marcos ${response.status} ${url}`);
  return {html:await response.text(),url:response.url||url};
}

export async function sanMarcosCalendarEvents({
  endpoint="https://www.sanmarcosca.gov/Meetings-Events",
  sourceName="City of San Marcos Calendar",
  sourceId="san-marcos-calendar",
  fallbackCenter={lat:33.1434,lng:-117.1661},
  days=45,
  maxDetails=60
}={}){
  const listing=await fetchHtml(endpoint);
  const links=parseSanMarcosListingLinks(listing.html,listing.url).slice(0,maxDetails);
  const details=[];
  for(let offset=0;offset<links.length;offset+=6){
    const batch=links.slice(offset,offset+6);
    const settled=await Promise.allSettled(batch.map(async row=>{
      const page=await fetchHtml(row.url);
      return parseSanMarcosDetail(page.html,page.url);
    }));
    for(const result of settled)if(result.status==="fulfilled")details.push(result.value);
  }
  const now=Date.now()-86400000,horizon=Date.now()+days*86400000,verified=new Date().toISOString(),out=[];
  for(const detail of details){
    if(!detail.title||CIVIC_ONLY.test(detail.title)||!/\S/.test(detail.description||""))continue;
    for(const when of detail.whens){
      const ms=Date.parse(when.start);
      if(!Number.isFinite(ms)||ms<now||ms>horizon)continue;
      const hasPoint=Number.isFinite(Number(detail.lat))&&Number.isFinite(Number(detail.lng));
      const geocodeQuery=detail.address||([detail.venue,"San Marcos","CA"].filter(Boolean).join(", "));
      out.push({
        id:`${sourceId}:${slug(detail.title)}:${slug(detail.venue)}:${when.start}`,
        title:detail.title,
        category:classifyEvent(detail.title,detail.description,detail.tag,detail.venue),
        subcategories:["municipal-community"],
        tags:["san-marcos",detail.tag].filter(Boolean),
        venue:detail.venue,address:detail.address,geocodeQuery,
        lat:hasPoint?Number(detail.lat):fallbackCenter.lat,
        lng:hasPoint?Number(detail.lng):fallbackCenter.lng,
        locationPrecision:hasPoint?"source":"source-center",
        start:when.start,end:when.end,timeStatus:"known",timeZone:"America/Los_Angeles",
        price:/\bfree\b/i.test(detail.description)?"Free":null,
        priceStatus:/\bfree\b/i.test(detail.description)?"free":"unknown",
        url:detail.url,source:sourceName,description:detail.description,featured:false,image:null,sourceUrl:detail.url,lastVerified:verified
      });
    }
  }
  if(!out.length)throw new Error("City of San Marcos dedicated adapter returned no public events");
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
