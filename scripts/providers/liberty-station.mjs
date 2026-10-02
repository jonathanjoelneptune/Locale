import {jsonLdEvents} from "./jsonld.mjs";
import {embeddedJsonEvents} from "./embedded-json.mjs";
import {classifyEvent} from "../event-classification.mjs";

const USER_AGENT="Mozilla/5.0 (compatible; LocaleEvents/1.3; +https://jonathanjoelneptune.github.io/Locale/)";

const decode=value=>String(value||"")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v[0].toLowerCase()==="x"?v.slice(1):v,v[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">"}[name.toLowerCase()]))
  .replace(/&[^;]+;/g," ")
  .replace(/\s+/g," ")
  .trim();

const textLines=html=>String(html||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<(?:br\s*\/?|\/p|\/li|\/div|\/h[1-6])>/gi,"\n")
  .replace(/<[^>]+>/g," ")
  .split(/\n+/)
  .map(decode)
  .filter(Boolean);

const titleFrom=html=>decode(String(html||"").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"");

const linkRows=(html,base)=>{
  const out=[];
  for(const match of String(html||"").matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    try{
      const url=new URL(match[1],base);
      if(url.origin!==new URL(base).origin||!url.pathname.startsWith("/do/"))continue;
      const label=decode(match[2].replace(/<[^>]+>/g," "));
      if(!label||label.length<3)continue;
      out.push({url:url.href,label});
    }catch{}
  }
  return [...new Map(out.map(row=>[row.url,row])).values()];
};

const MONTH="Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const WEEKDAY="Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?";
const DATE_RE=new RegExp(`(?:${WEEKDAY}),?\\s+(${MONTH})\\s+(\\d{1,2}),\\s+(\\d{4})\\s+(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))\\s*-\\s*(\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))`,"ig");

const MONTH_INDEX={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const clockParts=value=>{
  const match=String(value||"").trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if(!match)return null;
  let hour=Number(match[1]),minute=Number(match[2]||0);
  const meridiem=match[3].toLowerCase();
  if(hour===12)hour=0;
  if(meridiem==="pm")hour+=12;
  return {hour,minute};
};
const zonedIso=(year,monthIndex,day,hour,minute,timeZone="America/Los_Angeles")=>{
  let utc=Date.UTC(year,monthIndex,day,hour,minute);
  const formatter=new Intl.DateTimeFormat("en-US",{
    timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  });
  for(let pass=0;pass<2;pass++){
    const parts=Object.fromEntries(formatter.formatToParts(new Date(utc))
      .filter(part=>part.type!=="literal").map(part=>[part.type,Number(part.value)]));
    const represented=Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute);
    const desired=Date.UTC(year,monthIndex,day,hour,minute);
    utc+=desired-represented;
  }
  return new Date(utc).toISOString();
};
const parseTime=(month,day,year,time)=>{
  const clock=clockParts(time);
  const monthIndex=MONTH_INDEX[String(month).slice(0,3).toLowerCase()];
  if(!clock||monthIndex===undefined)return null;
  return zonedIso(Number(year),monthIndex,Number(day),clock.hour,clock.minute);
};

function fallbackEvents({html,url,sourceName,sourceId,fallbackCenter}){
  const lines=textLines(html);
  const title=titleFrom(html);
  if(!title)return [];
  const joined=lines.join(" ");
  const rows=[];
  for(const match of joined.matchAll(DATE_RE)){
    const start=parseTime(match[1],match[2],match[3],match[4]);
    const end=parseTime(match[1],match[2],match[3],match[5]);
    if(!start)continue;
    const locationIndex=lines.findIndex(line=>/^location$/i.test(line));
    const venue=locationIndex>=0?lines[locationIndex+1]||sourceName:sourceName;
    const address=locationIndex>=0?lines[locationIndex+2]||null:null;
    rows.push({
      id:`${sourceId}:${Buffer.from(title+"|"+start).toString("base64url").slice(0,80)}`,
      title,
      category:classifyEvent(title,joined),
      venue,
      address,
      lat:fallbackCenter?.lat,
      lng:fallbackCenter?.lng,
      locationPrecision:fallbackCenter?"source-center":"unknown",
      start,
      end,
      price:/\bcost\s+free\b|\bfree\b/i.test(joined)?"Free":null,
      priceStatus:/\bcost\s+free\b|\bfree\b/i.test(joined)?"free":"unknown",
      url,
      source:sourceName,
      description:joined.slice(0,1200),
      featured:false,
      image:null,
      sourceUrl:url,
      lastVerified:new Date().toISOString()
    });
  }
  return rows;
}

async function fetchHtml(url){
  const response=await fetch(url,{
    headers:{"User-Agent":USER_AGENT,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},
    redirect:"follow",
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error(`Liberty Station ${response.status} ${url}`);
  return {html:await response.text(),url:response.url||url};
}

async function detailEvents({url,sourceName,sourceId,fallbackCenter}){
  const out=[];
  try{out.push(...await jsonLdEvents({endpoint:url,sourceName,sourceId,fallbackCenter}))}catch{}
  try{out.push(...await embeddedJsonEvents({endpoint:url,sourceName,sourceId,fallbackCenter,days:75}))}catch{}
  if(out.length)return out;
  const page=await fetchHtml(url);
  return fallbackEvents({html:page.html,url:page.url,sourceName,sourceId,fallbackCenter});
}

export async function libertyStationEvents({
  endpoint="https://libertystation.com/events/calendar",
  sourceName="Liberty Station",
  sourceId="liberty-station",
  fallbackCenter={lat:32.7390,lng:-117.2122},
  maxLinks=80
}={}){
  const listing=await fetchHtml(endpoint);
  const links=linkRows(listing.html,listing.url).slice(0,maxLinks);
  const out=[];
  for(let index=0;index<links.length;index+=6){
    const batch=links.slice(index,index+6);
    const settled=await Promise.allSettled(batch.map(row=>detailEvents({
      url:row.url,sourceName,sourceId,fallbackCenter
    })));
    for(const result of settled)if(result.status==="fulfilled")out.push(...result.value);
  }
  const now=Date.now()-86400000,horizon=Date.now()+75*86400000;
  return [...new Map(out.filter(event=>{
    const time=Date.parse(event.start);
    return Number.isFinite(time)&&time>=now&&time<=horizon;
  }).map(event=>[`${event.title}|${event.start}|${event.venue}`,event])).values()];
}
