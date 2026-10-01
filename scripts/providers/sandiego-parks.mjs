import {classifyEvent} from "../event-classification.mjs";
const strip=value=>String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"').replace(/\s+/g," ").trim();
const MONTH={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
const clock=(h,m,ap)=>{let hour=Number(h),minute=Number(m||0);if(String(ap).toLowerCase()==="pm"&&hour<12)hour+=12;if(String(ap).toLowerCase()==="am"&&hour===12)hour=0;return{hour,minute}};
const iso=(y,m,d,h,min)=>new Date(`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:00-07:00`).toISOString();
async function get(url){const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`San Diego Parks ${r.status}`);return r.text()}
export async function sanDiegoParksEvents({days=45}={}){
  const endpoint="https://www.sandiego.gov/park-and-recreation/event-calendar";
  const html=await get(endpoint),links=[];
  for(const match of html.matchAll(/href=["']([^"']*\/event\/[^"']+)["']/gi)){
    try{const url=new URL(match[1].replace(/&amp;/g,"&"),endpoint).href;if(!links.includes(url))links.push(url)}catch{}
  }
  const now=Date.now(),horizon=now+days*86400000,verified=new Date().toISOString(),out=[];
  for(let index=0;index<links.length;index+=6){
    const batch=links.slice(index,index+6);
    const settled=await Promise.allSettled(batch.map(async url=>({url,html:await get(url)})));
    for(const result of settled){
      if(result.status!=="fulfilled")continue;
      const {url,html}=result.value,text=strip(html);
      const title=strip((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||"");
      const d=text.match(/(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4}),\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
      if(!title||!d)continue;
      const t=clock(d[4],d[5],d[6]),start=iso(Number(d[3]),MONTH[d[1].toLowerCase()],Number(d[2]),t.hour,t.minute);
      if(Date.parse(start)<now-86400000||Date.parse(start)>horizon)continue;
      const venue=strip((title.match(/\bat\s+(.+)$/i)||[])[1]||"City of San Diego Park");
      out.push({
        id:"sd-parks:"+new URL(url).pathname.split("/").filter(Boolean).pop()+":"+start,
        title,category:classifyEvent(title,text,"park recreation outdoors nature walk"),venue,
        lat:32.7157,lng:-117.1611,locationPrecision:"source-center",start,end:null,price:null,priceStatus:"unknown",
        url,source:"City of San Diego Parks & Recreation",description:(text.match(/Event Details:\s*(.{1,700})/i)||[])[1]||title,
        featured:false,image:null,sourceUrl:url,lastVerified:verified
      });
    }
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
