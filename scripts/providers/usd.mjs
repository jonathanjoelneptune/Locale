import {classifyEvent} from "../event-classification.mjs";
const strip=value=>String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g," ").trim();
const MONTH={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
const VENUES=[[/torero stadium/i,"Torero Stadium",32.7767,-117.1838],[/jenny craig pavilion/i,"Jenny Craig Pavilion",32.7738,-117.1859],[/sports center pool/i,"USD Sports Center Pool",32.7717,-117.1870],[/sports center/i,"USD Sports Center",32.7717,-117.1870]];
const clock=(h,m,ap)=>{let hour=Number(h),minute=Number(m||0);if(String(ap).toLowerCase().startsWith("p")&&hour<12)hour+=12;if(String(ap).toLowerCase().startsWith("a")&&hour===12)hour=0;return{hour,minute}};
const iso=(y,m,d,h,min)=>new Date(`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00-07:00`).toISOString();
export async function usdEvents({days=45}={}){
  const endpoint="https://www.sandiego.edu/events";
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`USD events ${response.status}`);
  const text=strip(await response.text()),now=Date.now(),horizon=now+days*86400000,verified=new Date().toISOString(),out=[];
  const re=/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d+(?:-\d+)?\s+(.{3,160}?)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,\s*|\s+)(\d{4})(?:\s*-\s*(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?)?/gi;
  const matches=[...text.matchAll(re)];
  for(let i=0;i<matches.length;i++){
    const m=matches[i],title=strip(m[1]); if(!title)continue;
    const t=m[6]?clock(m[6],m[7],m[8]):{hour:12,minute:0},start=iso(Number(m[5]),MONTH[m[3].toLowerCase()],Number(m[4]),t.hour,t.minute);
    if(Date.parse(start)<now-86400000||Date.parse(start)>horizon)continue;
    const description=text.slice((m.index||0)+m[0].length,matches[i+1]?.index??Math.min(text.length,(m.index||0)+m[0].length+900)).trim();
    const hit=VENUES.find(([re])=>re.test(title+" "+description));
    out.push({
      id:"usd:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80)+":"+start,
      title,category:classifyEvent(title,description),venue:hit?hit[1]:"University of San Diego",
      lat:hit?hit[2]:32.7717,lng:hit?hit[3]:-117.1883,locationPrecision:hit?"venue-known":"campus-only",
      start,end:null,timeStatus:m[6]?"known":"unknown",price:/\bFREE\b/i.test(description)?"Free":null,priceStatus:/\bFREE\b/i.test(description)?"free":"unknown",
      url:endpoint,source:"University of San Diego",description:description.slice(0,700),featured:false,image:null,sourceUrl:endpoint,lastVerified:verified
    });
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
