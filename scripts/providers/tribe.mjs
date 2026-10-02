import {jsonLdCrawlEvents} from "./jsonld-crawl.mjs";
import {classifyEvent} from "../event-classification.mjs";
const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,value)=>String.fromCodePoint(parseInt(value[0].toLowerCase()==="x"?value.slice(1):value,value[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">"}[name.toLowerCase()]))
  .replace(/\s+/g," ")
  .trim();

function category(event){
  return classifyEvent(event.title,(event.categories||[]).map(x=>x.name),event.description,event.excerpt,event.venue?.venue);
}

function coordinates(event,fallback){
  const venue=event.venue||{};
  const lat=Number(venue.geo_lat??venue.latitude??event.geo_lat);
  const lng=Number(venue.geo_lng??venue.longitude??event.geo_lng);
  if(Number.isFinite(lat)&&Number.isFinite(lng))return {lat,lng,locationPrecision:"source"};
  return fallback?{...fallback,locationPrecision:"source-center"}:null;
}

function cost(event){
  const text=strip(event.cost||"");
  if(/\bfree\b/i.test(text)||text==="$0")return {price:"Free",priceStatus:"free"};
  const match=text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return match?{price:text,priceStatus:"source-text"}:{price:null,priceStatus:"unknown"};
}

async function tribeHtmlFallback({base,sourceName,sourceId,fallbackCenter}){
  for(const listing of [base+"/events/",base+"/events/list/"]){
    try{
      const events=await jsonLdCrawlEvents({
        endpoint:listing,sourceName,sourceId,fallbackCenter,linkPattern:"/event/",maxLinks:40
      });
      if(events.length)return events;
    }catch{}
  }
  return [];
}

export async function tribeEvents({endpoint,sourceName,sourceId,fallbackCenter,days=45,maxPages=12}){
  if(!endpoint)throw new Error("Tribe adapter requires endpoint");
  const base=endpoint.replace(/\/$/,"");
  const now=new Date();
  const end=new Date(now.getTime()+days*86400000);
  const verified=new Date().toISOString();
  const out=[];

  for(let page=1;page<=maxPages;page++){
    const url=new URL(base+"/wp-json/tribe/events/v1/events");
    url.searchParams.set("start_date",now.toISOString().slice(0,10));
    url.searchParams.set("end_date",end.toISOString().slice(0,10));
    url.searchParams.set("per_page","50");
    url.searchParams.set("page",String(page));
    const response=await fetch(url,{headers:{
      Accept:"application/json",
      "User-Agent":"Mozilla/5.0 (compatible; LocaleEvents/1.2; +https://jonathanjoelneptune.github.io/Locale/)",
      "Accept-Language":"en-US,en;q=0.9"
    },signal:AbortSignal.timeout(10000)});
    if(!response.ok){
      if(page===1&&[401,403,404,429].includes(response.status)){
        const fallback=await tribeHtmlFallback({base,sourceName,sourceId,fallbackCenter});
        if(fallback.length)return fallback;
      }
      throw new Error(`${sourceName} Tribe ${response.status}`);
    }
    const payload=await response.json();
    const rows=Array.isArray(payload.events)?payload.events:[];
    for(const event of rows){
      const location=coordinates(event,fallbackCenter);
      if(!event?.id||!event?.title||!event?.start_date||!location)continue;
      const venue=event.venue?.venue||event.venue?.address||sourceName;
      out.push({
        id:`${sourceId}:${event.id}`,
        title:strip(event.title),
        category:category(event),
        venue:strip(venue)||sourceName,
        lat:location.lat,
        lng:location.lng,
        locationPrecision:location.locationPrecision,
        address:[event.venue?.address,event.venue?.city,event.venue?.state,event.venue?.zip].filter(Boolean).map(strip).join(", ")||null,
        start:event.start_date,
        end:event.end_date||null,
        ...cost(event),
        url:event.url||base,
        source:sourceName,
        description:strip(event.description||event.excerpt||""),
        featured:!!event.featured,
        image:event.image?.url||null,
        sourceUrl:event.url||base,
        lastVerified:verified
      });
    }
    if(!rows.length||!payload.next_rest_url)break;
  }
  return out;
}
