import {weeklyOccurrences,parseClock} from "../weekly-recurrence.mjs";

const ENDPOINT="https://tacotuesday.com/san-diego-taco-tuesday-the-best-taco-deals-every-tuesday/";

const decode=value=>String(value||"")
  .replace(/&nbsp;/gi," ")
  .replace(/&amp;/gi,"&")
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&ndash;|&#8211;/gi,"–")
  .replace(/&mdash;|&#8212;/gi,"—")
  .replace(/\s+/g," ")
  .trim();

const strip=value=>decode(String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));

export function parseTacoTuesdayVenueBlocks(html){
  const out=[];
  const regex=/<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h[23]\b|$)/gi;
  for(const match of String(html||"").matchAll(regex)){
    const venue=strip(match[1]).replace(/[“”"]/g,"").replace(/\s+[–—-]\s+(?:FORTYTWOSDAYS|.*?Taco Tuesday)$/i,"").trim();
    const body=strip(match[2]);
    if(!venue||!/taco/i.test(body))continue;
    const address=body.match(/Address:\s*([^|]+?)(?=\s+(?:Taco Tuesday|$))/i)?.[1]?.trim()||null;
    const scheduleText=body.match(/Taco Tuesday(?:\s*\([^)]*\))?\s*:\s*([^|.]+(?:\s*[AP]M)?)/i)?.[1]?.trim()||"";
    const clock=parseClock(scheduleText);
    out.push({venue,address,scheduleText,clock,body});
  }
  return out;
}

export async function tacoTuesdayEvents({days=45}={}){
  const response=await fetch(ENDPOINT,{headers:{"User-Agent":"Locale-events/1.0","Accept":"text/html"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`TacoTuesday.com ${response.status}`);
  const html=await response.text();
  const verified=new Date().toISOString();
  const out=[];

  for(const item of parseTacoTuesdayVenueBlocks(html)){
    const clock=item.clock||{hour:12,minute:0};
    const address=item.address&& !/\bCA\b/i.test(item.address)
      ?`${item.address}, San Diego, CA`
      :item.address;
    for(const start of weeklyOccurrences({day:"Tuesday",time:clock,days,timeZone:"America/Los_Angeles"})){
      out.push({
        id:`taco-tuesday:${item.venue.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)}:${start}`,
        title:`Taco Tuesday at ${item.venue}`,
        category:"food",
        venue:item.venue,
        address:address||null,
        lat:32.7157,lng:-117.1611,locationPrecision:"source-center",
        start,end:null,
        timeStatus:item.clock?"known":"unknown",
        price:null,priceStatus:"unknown",
        url:ENDPOINT,source:"TacoTuesday.com",
        description:decode(item.body).slice(0,700),
        featured:false,image:null,sourceUrl:ENDPOINT,lastVerified:verified,
        timeZone:"America/Los_Angeles"
      });
    }
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
