import {classifyEvent} from "../event-classification.mjs";
import {zonedLocalIso,parseClock} from "../weekly-recurrence.mjs";

const ENDPOINT="https://www.cityofsanteeca.gov/calendar/events";
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const strip=value=>String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;|&#8217;/g,"'").replace(/\s+/g," ").trim();

export function parseSanteeCalendar(html,{now=new Date()}={}){
  const source=String(html||"");
  const headings=[...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  const out=[];
  for(let i=0;i<headings.length;i++){
    const title=strip(headings[i][1]);
    if(!title||/^(Calendar|September|October|November|December|January|February|March|April|May|June|July|August)\b/i.test(title))continue;
    const block=source.slice(headings[i].index+headings[i][0].length,i+1<headings.length?headings[i+1].index:source.length);
    const text=strip(block);
    const date=text.match(/Date:\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*([A-Za-z]+)\s+(\d{1,2}),\s*(20\d{2})/i);
    const time=text.match(/Time:\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i);
    if(!date||!time)continue;
    const month=MONTHS[date[1].toLowerCase()],clock=parseClock(time[1]);
    if(!month||!clock)continue;
    const start=zonedLocalIso({year:Number(date[3]),month,day:Number(date[2]),hour:clock.hour,minute:clock.minute,timeZone:"America/Los_Angeles"});
    if(Date.parse(start)<now.getTime()-86400000)continue;
    const afterLocation=text.split(/Location:\s*/i)[1]||"";
    const location=afterLocation.split(/(?:Date:|Time:|$)/)[0].trim();
    const parts=location.split(/(?=\d{2,6}\s+[A-Za-z])/);
    const venue=(parts[0]||"Santee").replace(/\s+Santee, CA.*$/i,"").trim()||"Santee";
    const address=(location.match(/\d{2,6}\s+[^,]+,?\s*Santee,\s*CA\s*\d{5}/i)?.[0]||null);
    let url=headings[i][1].match(/href=["']([^"']+)["']/i)?.[1]||ENDPOINT;
    try{url=new URL(url,ENDPOINT).href}catch{}
    out.push({title,start,venue,address,url,description:text.slice(0,1000)});
  }
  return out;
}

export async function santeeCalendarEvents(){
  const response=await fetch(ENDPOINT,{headers:{"User-Agent":"Mozilla/5.0 (compatible; LocaleEvents/1.4; +https://jonathanjoelneptune.github.io/Locale/)",Accept:"text/html"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error("Santee calendar "+response.status);
  const verified=new Date().toISOString();
  const out=parseSanteeCalendar(await response.text()).filter(item=>!/City Council|Committee|Commission/i.test(item.title)).map(item=>({
    id:"santee-calendar:"+item.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)+":"+item.start,
    title:item.title,category:classifyEvent(item.title,item.description,item.venue),subcategories:["municipal-community"],tags:["santee","community"],
    venue:item.venue,address:item.address,lat:32.8384,lng:-116.9739,locationPrecision:item.address?"source-center":"source-center",
    start:item.start,end:null,timeStatus:"known",timeZone:"America/Los_Angeles",
    price:/\bfree\b/i.test(item.description)?"Free":null,priceStatus:/\bfree\b/i.test(item.description)?"free":"unknown",
    url:item.url,source:"City of Santee",description:item.description,featured:false,image:null,sourceUrl:ENDPOINT,lastVerified:verified
  }));
  if(!out.length)throw new Error("Santee calendar returned no public activities");
  return out;
}
