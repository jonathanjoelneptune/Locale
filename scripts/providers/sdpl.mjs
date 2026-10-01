import {classifyEvent} from "../event-classification.mjs";

const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();
const MONTH={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
const clock=(h,m,ap)=>{let hour=Number(h),minute=Number(m||0);if(ap.toLowerCase()==="pm"&&hour<12)hour+=12;if(ap.toLowerCase()==="am"&&hour===12)hour=0;return{hour,minute}};
const iso=(y,m,d,h,min)=>new Date(`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00-07:00`).toISOString();

export async function sdplEvents({days=45}={}){
  const endpoint="https://sandiego.events.mylibrary.digital/embed/event_calendar?height=1100px&showTitle=true&view=list&width=100%25";
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`SDPL calendar ${response.status}`);
  const html=await response.text(),now=Date.now(),horizon=now+days*86400000,verified=new Date().toISOString(),out=[];
  const headings=[...html.matchAll(/<h[2-5]\b[^>]*>([\s\S]*?)<\/h[2-5]>/gi)];
  for(let i=0;i<headings.length;i++){
    const title=strip(headings[i][1]);
    if(!title||/^(events|calendar|more category events)$/i.test(title))continue;
    const startIndex=headings[i].index+(headings[i][0]?.length||0);
    const endIndex=headings[i+1]?.index??Math.min(html.length,startIndex+1800);
    const block=strip(html.slice(startIndex,endIndex));
    const d=block.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{4})\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if(!d)continue;
    const t=clock(d[4],d[5],d[6]),start=iso(Number(d[3]),MONTH[d[1].toLowerCase()],Number(d[2]),t.hour,t.minute);
    if(Date.parse(start)<now-86400000||Date.parse(start)>horizon)continue;
    const venueMatch=block.match(/(?:AM|PM)\s+(.+?Library|Central Library|City Heights Performance Annex(?: & IDEA Lab)?|Virtual Events|Outreach)(?:\s|$)/i);
    const venue=strip(venueMatch?.[1]||"San Diego Public Library");
    out.push({
      id:"sdpl:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,90)+":"+start,
      title,category:classifyEvent(title,block),venue,
      lat:32.7084,lng:-117.1541,locationPrecision:"source-center",
      start,end:null,price:/\bfree\b/i.test(block)?"Free":null,priceStatus:/\bfree\b/i.test(block)?"free":"unknown",
      url:endpoint,source:"San Diego Public Library",description:block.slice(0,650),featured:false,image:null,sourceUrl:endpoint,lastVerified:verified
    });
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
