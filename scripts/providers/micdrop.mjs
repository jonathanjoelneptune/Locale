const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();

const MONTH={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};

function localDate(year,month,day,hour,minute,ampm){
  let h=Number(hour),m=Number(minute||0);
  if(ampm.toUpperCase()==="PM"&&h<12)h+=12;
  if(ampm.toUpperCase()==="AM"&&h===12)h=0;
  const offset=month>=2&&month<=10?"-07:00":"-08:00";
  const iso=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00${offset}`;
  const date=new Date(iso);
  return Number.isNaN(+date)?null:date;
}

function showtimes(text,now){
  const out=[];
  const re=/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?[,\s|]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})[,]?\s+(\d{4})[^0-9]{0,12}(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi;
  for(const m of text.matchAll(re)){
    const date=localDate(Number(m[3]),MONTH[m[1].slice(0,3).toLowerCase()],Number(m[2]),m[4],m[5],m[6]);
    if(date&&date>=now)out.push(date);
  }
  return out;
}

export async function micDropEvents({days=45}={}){
  const endpoint="https://www.micdropcomedysandiego.com/events";
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Mic Drop listing ${response.status}`);
  const html=await response.text();
  const now=new Date(),horizon=new Date(now.getTime()+days*86400000),verified=new Date().toISOString();
  const headings=[...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  const out=[];
  for(let i=0;i<headings.length;i++){
    const title=strip(headings[i][1]);
    if(!title)continue;
    const startIndex=headings[i].index+(headings[i][0]?.length||0);
    const endIndex=headings[i+1]?.index??Math.min(html.length,startIndex+5000);
    const after=strip(html.slice(startIndex,endIndex));
    const before=strip(html.slice(Math.max(0,headings[i].index-1200),headings[i].index));
    let dates=showtimes(after,now);
    if(!dates.length)dates=showtimes(before,now).slice(-1);
    for(const start of dates){
      if(start>horizon)continue;
      out.push({
        id:"mic-drop:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80)+":"+start.toISOString(),
        title,category:"comedy",venue:"Mic Drop Comedy",
        address:"8878 Clairemont Mesa Blvd, San Diego, CA 92123",
        lat:32.8325,lng:-117.1371,locationPrecision:"venue-known",
        start:start.toISOString(),end:null,price:null,priceStatus:"unknown",
        url:endpoint,source:"Mic Drop Comedy",description:after.slice(0,600),
        featured:false,image:null,sourceUrl:endpoint,lastVerified:verified
      });
    }
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
