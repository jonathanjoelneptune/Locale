import {weeklyOccurrences,parseClock} from "../weekly-recurrence.mjs";

const FINDER="https://singhub.app/find-karaoke?type=live";
const DAYS=/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i;

const decode=value=>String(value||"")
  .replace(/&nbsp;/gi," ")
  .replace(/&amp;/gi,"&")
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&ndash;|&#8211;/gi,"–")
  .replace(/&mdash;|&#8212;/gi,"—")
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
  .replace(/\s+/g," ")
  .trim();

const strip=value=>decode(String(value||"").replace(/<[^>]+>/g," "));

function textLines(html){
  return String(html||"")
    .replace(/<(?:br|hr)\b[^>]*>/gi,"\n")
    .replace(/<\/(?:p|div|li|h[1-6]|section|article|button|a)>/gi,"\n")
    .replace(/<[^>]+>/g," ")
    .split(/\n+/)
    .map(decode)
    .filter(Boolean);
}

export function extractSinghubVenueLinks(html){
  const links=[];
  for(const match of String(html||"").matchAll(/href=["'](\/venues\/[^"'?#]+)["']/gi)){
    links.push(new URL(match[1],"https://singhub.app").href);
  }
  return [...new Set(links)];
}

export function parseSinghubVenuePage(html,url){
  const name=strip(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"");
  if(!name)return null;
  const lines=textLines(html);
  const addressIndex=lines.findIndex(line=>/^Address$/i.test(line));
  let address=addressIndex>=0?lines[addressIndex+1]||"":lines.find(line=>/\d{2,6}\s+.+(?:CA\s+\d{5}|San Diego(?:\s|,|$)|La Mesa(?:\s|,|$)|Santee(?:\s|,|$)|Chula Vista(?:\s|,|$)|Spring Valley(?:\s|,|$)|El Cajon(?:\s|,|$)|Lakeside(?:\s|,|$)|Oceanside(?:\s|,|$))/i.test(line))||"";
  address=decode(address.replace(/^Address\s*/i,""));
  const scheduleStart=lines.findIndex(line=>/Weekly schedule/i.test(line));
  if(scheduleStart<0)return {name,address,url,schedules:[]};
  const scheduleEnd=lines.findIndex((line,index)=>index>scheduleStart&&/Good to know|About the room|Singers Say/i.test(line));
  const scheduleLines=lines.slice(scheduleStart+1,scheduleEnd>scheduleStart?scheduleEnd:Math.min(lines.length,scheduleStart+30));
  const schedules=[];
  let pendingDay=null;

  for(const line of scheduleLines){
    const dayMatch=line.match(DAYS);
    const timeMatch=line.match(/\b\d{1,2}(?::\d{2})?\s*(?:AM|PM)\b/i);
    if(dayMatch&&timeMatch){
      schedules.push({day:dayMatch[1],time:timeMatch[0]});
      pendingDay=null;
      continue;
    }
    if(dayMatch&&line.trim().toLowerCase()===dayMatch[1].toLowerCase()){
      pendingDay=dayMatch[1];
      continue;
    }
    if(pendingDay&&timeMatch){
      schedules.push({day:pendingDay,time:timeMatch[0]});
      pendingDay=null;
    }
  }
  const unique=[...new Map(schedules.filter(item=>parseClock(item.time)).map(item=>[item.day.toLowerCase()+"|"+item.time.toLowerCase(),item])).values()];
  return {name,address,url,schedules:unique};
}

async function fetchHtml(url){
  const response=await fetch(url,{
    headers:{"User-Agent":"Locale-events/1.0","Accept":"text/html"},
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error(`SingHUB ${response.status} ${url}`);
  return response.text();
}

export async function singhubKaraokeEvents({days=45,maxVenues=100}={}){
  const finderHtml=await fetchHtml(FINDER);
  const links=extractSinghubVenueLinks(finderHtml).slice(0,maxVenues);
  const venues=[];
  for(let index=0;index<links.length;index+=8){
    const batch=links.slice(index,index+8);
    const settled=await Promise.allSettled(batch.map(async url=>parseSinghubVenuePage(await fetchHtml(url),url)));
    for(const result of settled)if(result.status==="fulfilled"&&result.value)venues.push(result.value);
  }

  const verified=new Date().toISOString();
  const out=[];
  for(const venue of venues){
    for(const schedule of venue.schedules){
      for(const start of weeklyOccurrences({day:schedule.day,time:schedule.time,days,timeZone:"America/Los_Angeles"})){
        out.push({
          id:`singhub-karaoke:${venue.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)}:${start}`,
          title:`Karaoke at ${venue.name}`,
          category:"nightlife",
          venue:venue.name,
          address:venue.address||null,
          lat:32.7157,lng:-117.1611,locationPrecision:"source-center",
          start,end:null,
          price:null,priceStatus:"unknown",
          url:venue.url,source:"SingHUB",
          description:`Recurring ${schedule.day} karaoke at ${schedule.time}. Schedule sourced from SingHUB; venue schedules can change.`,
          featured:false,image:null,sourceUrl:venue.url,lastVerified:verified,
          timeZone:"America/Los_Angeles"
        });
      }
    }
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
