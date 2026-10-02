import {classifyEvent} from "../event-classification.mjs";
import {zonedLocalIso} from "../weekly-recurrence.mjs";

const ENDPOINT="https://www.visitsandiego.com/calendar";
const ADDRESS="111 W Harbor Dr, San Diego, CA 92101";
const strip=value=>String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();

export function parseConventionCenter(html,{now=new Date()}={}){
  const source=String(html||"");
  const headings=[...source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)];
  const out=[];
  for(let i=0;i<headings.length;i++){
    const title=strip(headings[i][1]);
    if(!title||/^Private Event:/i.test(title))continue;
    const block=source.slice(headings[i].index+headings[i][0].length,i+1<headings.length?headings[i+1].index:source.length);
    const text=strip(block);
    const dates=text.match(/(\d{2})\/(\d{2})\/(20\d{2})\s+(\d{2})\/(\d{2})\/(20\d{2})/);
    if(!dates)continue;
    const start=zonedLocalIso({year:Number(dates[3]),month:Number(dates[1]),day:Number(dates[2]),hour:12,minute:0,timeZone:"America/Los_Angeles"});
    if(Date.parse(start)<now.getTime()-86400000)continue;
    const end=zonedLocalIso({year:Number(dates[6]),month:Number(dates[4]),day:Number(dates[5]),hour:23,minute:59,timeZone:"America/Los_Angeles"});
    const type=text.match(/\b(Convention with Trade Show|Convention Only|Meeting\/Seminar|Consumer Show|Local Trade Show|Corporate & Incentive)\b/i)?.[1]||"Convention";
    const attendance=text.match(/Attendance:\s*([\d,]+)/i)?.[1]||null;
    let url=headings[i][1].match(/href=["']([^"']+)["']/i)?.[1]||ENDPOINT;
    try{url=new URL(url,ENDPOINT).href}catch{}
    out.push({title,start,end,type,attendance,url});
  }
  return out;
}

export async function conventionCenterEvents(){
  const response=await fetch(ENDPOINT,{headers:{"User-Agent":"Mozilla/5.0 (compatible; LocaleEvents/1.4; +https://jonathanjoelneptune.github.io/Locale/)",Accept:"text/html"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error("Convention Center "+response.status);
  const verified=new Date().toISOString();
  const out=parseConventionCenter(await response.text()).map(item=>({
    id:"sd-convention-center:"+item.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)+":"+item.start.slice(0,10),
    title:item.title,category:classifyEvent(item.title,item.type),subcategories:["convention",item.type.toLowerCase().replace(/[^a-z0-9]+/g,"-")],tags:["convention",item.type,item.attendance?"attendance-"+item.attendance.replace(/,/g,""):null].filter(Boolean),
    venue:"San Diego Convention Center",address:ADDRESS,lat:32.7068,lng:-117.1624,locationPrecision:"source",
    start:item.start,end:item.end,timeStatus:"unknown",timeZone:"America/Los_Angeles",
    price:null,priceStatus:"unknown",url:item.url,source:"San Diego Convention Center",
    description:[item.type,item.attendance?"Expected attendance: "+item.attendance:null].filter(Boolean).join(" · "),
    featured:false,image:null,sourceUrl:ENDPOINT,lastVerified:verified
  }));
  if(!out.length)throw new Error("Convention Center returned no public events");
  return out;
}
