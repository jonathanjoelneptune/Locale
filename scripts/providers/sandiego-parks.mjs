import {classifyEvent} from "../event-classification.mjs";

const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();
const MONTH={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
jan:0,feb:1,mar:2,apr:3,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
const iso=(year,month,day,hour=12,minute=0)=>{
  const offset=month>=2&&month<=10?"-07:00":"-08:00";
  const date=new Date(`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00${offset}`);
  return Number.isNaN(+date)?null:date.toISOString();
};
const clock=(hour,minute,ampm)=>{
  let h=Number(hour),m=Number(minute||0);
  if(String(ampm).toLowerCase().startsWith("p")&&h<12)h+=12;
  if(String(ampm).toLowerCase().startsWith("a")&&h===12)h=0;
  return {hour:h,minute:m};
};

export async function sanDiegoParksEvents({days=45}={}){
  const endpoint="https://www.sandiego.gov/park-and-recreation/event-calendar";
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`San Diego Parks ${response.status}`);
  const html=await response.text(),now=Date.now(),horizon=now+days*86400000,verified=new Date().toISOString(),out=[];
  const anchors=[...html.matchAll(/<a\b[^>]*href=["']([^"']*\/event\/[^"']*event-date=[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for(const match of anchors){
    let url; try{url=new URL(match[1],endpoint)}catch{continue}
    const title=strip(match[2]); if(!title)continue;
    const raw=url.searchParams.get("event-date")||"";
    const d=raw.match(/(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
    if(!d)continue;
    const t=clock(d[4],d[5],d[6]),start=iso(Number(d[3]),MONTH[d[1].toLowerCase()],Number(d[2]),t.hour,t.minute);
    if(!start||Date.parse(start)<now-86400000||Date.parse(start)>horizon)continue;
    const venueMatch=title.match(/\bat\s+(.+)$/i);
    const venue=strip(venueMatch?.[1]||"City of San Diego Park");
    out.push({
      id:"sd-parks:"+url.pathname.split("/").filter(Boolean).pop()+":"+start,
      title,category:classifyEvent(title,"park recreation outdoors nature walk"),
      venue,lat:32.7157,lng:-117.1611,locationPrecision:"source-center",
      start,end:null,price:null,priceStatus:"unknown",url:url.href,source:"City of San Diego Parks & Recreation",
      description:title,featured:false,image:null,sourceUrl:url.href,lastVerified:verified
    });
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
