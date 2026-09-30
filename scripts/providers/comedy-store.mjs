const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();

const MONTH={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

function parseDate(text,now=new Date()){
  const m=text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?\s*\|?\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,\s*(\d{4}))?\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if(!m)return null;
  const month=MONTH[m[1].slice(0,3).toLowerCase()];
  let year=m[3]?Number(m[3]):now.getFullYear();
  if(!m[3]&&month<now.getMonth()-1)year++;
  let hour=Number(m[4]),minute=Number(m[5]||0);
  if(m[6].toUpperCase()==="PM"&&hour<12)hour+=12;
  if(m[6].toUpperCase()==="AM"&&hour===12)hour=0;
  const offset=month>=2&&month<=10?"-07:00":"-08:00";
  const iso=`${year}-${String(month+1).padStart(2,"0")}-${String(Number(m[2])).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00${offset}`;
  const date=new Date(iso);
  return Number.isNaN(+date)?null:date;
}

export async function comedyStoreEvents({days=45}={}){
  const base="https://www.thecomedystore.com/la-jolla/calendar";
  const pages=["", "/P20","/P40","/P60","/P80","/P100"];
  const now=new Date(),horizon=new Date(now.getTime()+days*86400000),verified=new Date().toISOString();
  const out=[];
  for(const suffix of pages){
    const response=await fetch(base+suffix,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
    if(!response.ok)continue;
    const html=await response.text();
    const headings=[...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
    for(let i=0;i<headings.length;i++){
      const title=strip(headings[i][1]);
      if(!title||/^(calendar|coming to la jolla|tonight at la jolla)$/i.test(title))continue;
      const startIndex=headings[i].index+(headings[i][0]?.length||0);
      const endIndex=headings[i+1]?.index??Math.min(html.length,startIndex+2500);
      const block=strip(html.slice(startIndex,endIndex));
      const start=parseDate(block,now);
      if(!start||start<now||start>horizon)continue;
      const href=(html.slice(startIndex,endIndex).match(/href=["']([^"']+)["']/i)||[])[1];
      let url=base;
      try{if(href)url=new URL(href,base).href}catch{}
      out.push({
        id:"comedy-store-la-jolla:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80)+":"+start.toISOString(),
        title,category:"comedy",venue:"The Comedy Store La Jolla",
        address:"916 Pearl St, La Jolla, CA 92037",
        lat:32.8396,lng:-117.2769,locationPrecision:"venue-known",
        start:start.toISOString(),end:null,price:null,priceStatus:"unknown",
        url,source:"The Comedy Store La Jolla",description:block.slice(0,500),
        featured:false,image:null,sourceUrl:url,lastVerified:verified
      });
    }
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
