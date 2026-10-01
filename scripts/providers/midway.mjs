import {classifyEvent} from "../event-classification.mjs";
const strip=value=>String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g," ").trim();
const MONTH={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
const iso=(y,m,d,h=12,min=0)=>new Date(`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00-07:00`).toISOString();
export async function midwayEvents({days=60}={}){
  const endpoint="https://www.midway.org/visit/midway-events";
  const r=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error(`USS Midway ${r.status}`);
  const text=strip(await r.text()),now=Date.now(),horizon=now+days*86400000,verified=new Date().toISOString(),out=[];
  const re=/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:[—-](\d{1,2}))?,\s*(\d{4})(?:,\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm))?\s+(.+?)(?=(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}|$)/gi;
  for(const m of text.matchAll(re)){
    const month=MONTH[m[1].toLowerCase()],hourRaw=m[5]?Number(m[5]):12,min=Number(m[6]||0),ampm=String(m[7]||"").toLowerCase();
    let hour=hourRaw;if(ampm==="pm"&&hour<12)hour+=12;if(ampm==="am"&&hour===12)hour=0;
    const start=iso(Number(m[4]),month,Number(m[2]),hour,min);
    if(Date.parse(start)<now-86400000||Date.parse(start)>horizon)continue;
    const body=strip(m[8]); const title=(body.match(/^(.{3,120}?)(?=(?:Adventure|Join|An annual|Where|Featuring|Enjoy|Celebrate|Experience)\b)/i)||[])[1]||body.slice(0,120);
    out.push({
      id:"uss-midway:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80)+":"+start,
      title,category:classifyEvent(title,body,"museum attraction family"),venue:"USS Midway Museum",
      lat:32.7137,lng:-117.1751,locationPrecision:"venue-known",start,end:m[3]?iso(Number(m[4]),month,Number(m[3]),23,59):null,
      price:/\bfree\b/i.test(body)?"Free":null,priceStatus:/\bfree\b/i.test(body)?"free":"unknown",
      url:endpoint,source:"USS Midway Museum",description:body.slice(title.length).trim().slice(0,700),featured:false,image:null,sourceUrl:endpoint,lastVerified:verified
    });
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
