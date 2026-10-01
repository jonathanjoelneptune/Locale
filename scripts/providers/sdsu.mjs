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

const SDSU_VENUES=[
  [/snapdragon stadium/i,"Snapdragon Stadium",32.7841,-117.1225],
  [/conrad prebys aztec student union|student union courtyard|goldberg courtyard/i,"Conrad Prebys Aztec Student Union",32.7753,-117.0725],
  [/campanile walkway/i,"Campanile Walkway",32.7750,-117.0716],
  [/aztec recreation center courtyard|arc courtyard/i,"Aztec Recreation Center Courtyard",32.7740,-117.0698],
  [/viejas arena/i,"Viejas Arena",32.7738,-117.0746]
];
export async function sdsuEvents({days=45}={}){
  const endpoint="https://as.sdsu.edu/events/";
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`SDSU events ${response.status}`);
  const html=await response.text(),text=strip(html),now=new Date(),horizon=Date.now()+days*86400000,verified=new Date().toISOString(),out=[];
  const re=/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s+THRU\s+\d{1,2}\/\d{2})?(?:\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))?\s+(.{3,120}?)\s+(.{0,900}?)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+(.{3,120}?)(?=\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}|$)/gi;
  for(const m of text.matchAll(re)){
    const month=MONTH[m[1].toLowerCase()],year=now.getFullYear()+(month<now.getMonth()-1?1:0);
    const t=clock(m[5],m[6],m[7]),start=iso(year,month,Number(m[2]),t.hour,t.minute);
    if(!start||Date.parse(start)<Date.now()-86400000||Date.parse(start)>horizon)continue;
    const title=strip(m[3]),description=strip(m[4]),locationText=strip(m[11]);
    const hit=SDSU_VENUES.find(([re])=>re.test(locationText+" "+description));
    const venue=hit?hit[1]:(locationText.slice(0,100)||"San Diego State University");
    out.push({
      id:"sdsu-as:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80)+":"+start,
      title,category:classifyEvent(title,description),venue,
      lat:hit?hit[2]:32.7757,lng:hit?hit[3]:-117.0719,locationPrecision:hit?"venue-known":"campus-only",
      start,end:null,price:/\bfree\b/i.test(description)?"Free":null,priceStatus:/\bfree\b/i.test(description)?"free":"unknown",
      url:endpoint,source:"SDSU Associated Students",description:description.slice(0,700),featured:false,image:null,sourceUrl:endpoint,lastVerified:verified
    });
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
