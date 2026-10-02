import {embeddedJsonEventsFromHtml} from "./embedded-json.mjs";
import {classifyEvent} from "../event-classification.mjs";
import {zonedLocalIso} from "../weekly-recurrence.mjs";

const UA="Mozilla/5.0 (compatible; LocaleEvents/1.4; +https://jonathanjoelneptune.github.io/Locale/)";
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};

const decode=value=>String(value||"")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v[0].toLowerCase()==="x"?v.slice(1):v,v[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">"}[name.toLowerCase()]))
  .replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
const strip=value=>decode(String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));

const escapeRegExp=value=>String(value||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const idPart=value=>String(value||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"location";

export function biblioCommonsLocationNames(html){
  const text=strip(html);
  const section=text.match(/\bLocations\s+(.+?)\s+Audience\b/i)?.[1]||"";
  const names=[];
  for(const match of section.matchAll(/([A-Za-z0-9][A-Za-z0-9 &'’().\/-]{1,80}?)\s+\([\d,]+\)/g)){
    const name=match[1].trim().replace(/^Locations\s+/i,"");
    if(name&&!names.includes(name))names.push(name);
  }
  return names.sort((a,b)=>b.length-a.length);
}

export function biblioCommonsEventLocation(html,title,knownLocations=biblioCommonsLocationNames(html)){
  const text=strip(html);
  const eventItemsIndex=text.search(/\bEvent items\b/i);
  const haystack=eventItemsIndex>=0?text.slice(eventItemsIndex):text;
  const titleIndex=haystack.toLowerCase().indexOf(String(title||"").trim().toLowerCase());
  if(titleIndex<0)return null;
  const window=haystack.slice(titleIndex,titleIndex+2600);

  for(const location of knownLocations){
    const escaped=escapeRegExp(location);
    if(new RegExp(`${escaped}\\s*Event location:\\s*${escaped}(?:\\s|$)`,"i").test(window)){
      return {name:location,kind:"library"};
    }
  }

  const repeated=window.match(/([A-Za-z0-9][A-Za-z0-9 &'’().\/-]{2,100}?)\s*Event location:\s*\1(?:\s|$)/i);
  if(repeated?.[1]){
    const name=repeated[1]
      .replace(/^(?:View all dates|In Progress|Featured Event|Featured)\s*/i,"")
      .trim();
    if(name&&name.length<=100)return {name,kind:"offsite"};
  }
  return null;
}

function libraryVenue(location){
  if(!location)return null;
  if(location.kind==="library")return {
    venue:/\blibrary\b/i.test(location.name)?location.name:`${location.name} Library`,
    geocodeQuery:/\blibrary\b/i.test(location.name)
      ?`${location.name}, San Diego County, CA`
      :`${location.name} Library, San Diego County, CA`
  };
  return {
    venue:location.name,
    geocodeQuery:`${location.name}, San Diego County, CA`
  };
}


function clock(value){
  const m=String(value||"").match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if(!m)return null;
  let hour=Number(m[1]),minute=Number(m[2]||0);
  if(hour===12)hour=0;
  if(m[3].toLowerCase()==="pm")hour+=12;
  return {hour,minute};
}
function parseStart(text){
  const m=String(text||"").match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+on\s+)?(?:[A-Za-z]+\s+)?(\d{1,2}),\s*(20\d{2}),\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i)
    ||String(text||"").match(/([A-Za-z]+)\s+(\d{1,2}),\s*(20\d{2}),\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
  if(!m)return null;
  const shifted=m.length===6;
  const month=MONTHS[String(m[1]).toLowerCase()];
  const day=Number(m[2]);
  const year=Number(shifted?m[4]:m[3]);
  const t=clock(shifted?m[5]:m[4]);
  if(!month||!t)return null;
  return zonedLocalIso({year,month,day,hour:t.hour,minute:t.minute,timeZone:"America/Los_Angeles"});
}
export function parseBiblioCommonsPage(html){
  const out=[];
  const knownLocations=biblioCommonsLocationNames(html);
  const headings=[...String(html||"").matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  for(let i=0;i<headings.length;i++){
    const title=strip(headings[i][1]);
    if(!title||/event filters|active event filters/i.test(title))continue;
    const start=headings[i].index+headings[i][0].length;
    const end=i+1<headings.length?headings[i+1].index:Math.min(String(html).length,start+9000);
    const fragment=String(html).slice(start,end);
    const text=strip(fragment);
    const eventStart=parseStart(text);
    if(!eventStart)continue;
    const contextual=libraryVenue(biblioCommonsEventLocation(html,title,knownLocations));
    const location=contextual?.venue
      ||text.match(/Event location:\s*(.+?)(?=\s+Find more events in:|\s+View event|\s+Audience:|\s+Program:|$)/i)?.[1]?.trim()
      ||fragment.match(/Event location:\s*<[^>]+>\s*([^<]{2,140})/i)?.[1]?.trim()
      ||"San Diego County Library";
    const tags=[...new Set([...fragment.matchAll(/Find more events in:\s*([^<]{2,80})/gi)].map(m=>strip(m[1])).filter(Boolean))];
    const link=fragment.match(/href=["']([^"']*\/events\/[^"'?#]+)["']/i)?.[1]
      ||headings[i][0].match(/href=["']([^"']+)["']/i)?.[1]
      ||null;
    out.push({
      title,start:eventStart,venue:location,
      geocodeQuery:contextual?.geocodeQuery||(/\blibrary\b/i.test(location)?`${location}, San Diego County, CA`:null),
      tags,description:text.slice(0,1400),link
    });
  }
  return out;
}

async function fetchPage(endpoint,page,startDate,endDate){
  const url=new URL(endpoint);
  url.searchParams.set("startDate",startDate);
  url.searchParams.set("endDate",endDate);
  url.searchParams.set("page",String(page));
  const response=await fetch(url,{headers:{"User-Agent":UA,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`BiblioCommons ${response.status} page ${page}`);
  return {html:await response.text(),url:url.href};
}

export async function biblioCommonsEvents({
  endpoint,
  sourceName,
  sourceId,
  fallbackCenter,
  days=45,
  maxPages=70
}={}){
  if(!endpoint)throw new Error("BiblioCommons adapter requires endpoint");
  const now=new Date(),end=new Date(now.getTime()+days*86400000);
  const startDate=now.toISOString().slice(0,10),endDate=end.toISOString().slice(0,10);
  const first=await fetchPage(endpoint,1,startDate,endDate);
  const count=Number(strip(first.html).match(/1\s+to\s+20\s+of\s+([\d,]+)\s+items/i)?.[1]?.replace(/,/g,"")||0);
  const pages=Math.max(1,Math.min(maxPages,count?Math.ceil(count/20):1));
  const htmlPages=[first];
  for(let offset=2;offset<=pages;offset+=5){
    const batch=[];
    for(let page=offset;page<Math.min(offset+5,pages+1);page++)batch.push(fetchPage(endpoint,page,startDate,endDate));
    const settled=await Promise.allSettled(batch);
    for(const result of settled)if(result.status==="fulfilled")htmlPages.push(result.value);
  }

  const out=[];
  for(const page of htmlPages){
    const knownLocations=biblioCommonsLocationNames(page.html);
    try{
      const embedded=embeddedJsonEventsFromHtml({
        html:page.html,endpoint:page.url,sourceName,sourceId,fallbackCenter,days
      }).map(event=>{
        if(event.locationPrecision!=="source-center"||event.venue!==sourceName)return event;
        const context=libraryVenue(biblioCommonsEventLocation(page.html,event.title,knownLocations));
        return context?{...event,...context,id:`${event.id}:${idPart(context.venue)}`}:event;
      });
      out.push(...embedded);
    }catch{}
    for(const item of parseBiblioCommonsPage(page.html)){
      let url=page.url;
      try{if(item.link)url=new URL(item.link,page.url).href}catch{}
      out.push({
        id:`${sourceId}:${item.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)}:${item.start}:${idPart(item.venue)}`,
        title:item.title,
        category:classifyEvent(item.title,item.description,item.tags),
        subcategories:item.tags.map(value=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-")).filter(Boolean),
        tags:item.tags,
        venue:item.venue,
        geocodeQuery:item.geocodeQuery||(/\blibrary\b/i.test(item.venue)
          ?`${item.venue}, San Diego County, CA`
          :`${item.venue}, San Diego County, CA`),
        lat:fallbackCenter.lat,lng:fallbackCenter.lng,locationPrecision:"source-center",
        start:item.start,end:null,timeStatus:"known",timeZone:"America/Los_Angeles",
        price:/\bfree\b/i.test(item.description)?"Free":null,
        priceStatus:/\bfree\b/i.test(item.description)?"free":"unknown",
        url,source:sourceName,description:item.description,featured:false,image:null,sourceUrl:url,lastVerified:new Date().toISOString()
      });
    }
  }
  return [...new Map(out.map(event=>[`${event.title}|${event.start}|${event.venue}`,event])).values()];
}
