import {classifyEvent} from "../event-classification.mjs";
import {zonedLocalIso,parseClock} from "../weekly-recurrence.mjs";

const ENDPOINT="https://sandiegomuseumcouncil.org/events/";
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const strip=value=>String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&#8217;|&#39;/g,"'").replace(/\s+/g," ").trim();
const yearFor=(month,now)=>month<now.getMonth()+1-2?now.getFullYear()+1:now.getFullYear();

export function parseMuseumCouncil(html,{now=new Date()}={}){
  const source=String(html||"");
  const headings=[...source.matchAll(/<h4\b[^>]*>([\s\S]*?)<\/h4>/gi)];
  const out=[];
  for(let i=0;i<headings.length;i++){
    const heading=headings[i],block=source.slice(heading.index+heading[0].length,i+1<headings.length?headings[i+1].index:source.length);
    const title=strip(heading[1]);
    const urlRaw=heading[1].match(/href=["']([^"']+)["']/i)?.[1]||ENDPOINT;
    const host=strip(block.match(/Hosted by:\s*[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i)?.[1]||"")||"San Diego Museum Council";
    const text=strip(block);
    const dm=text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s*\|\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if(!title||!dm)continue;
    const month=MONTHS[dm[1].toLowerCase()],day=Number(dm[2]),clock=parseClock(dm[3]);
    if(!clock)continue;
    const start=zonedLocalIso({year:yearFor(month,now),month,day,hour:clock.hour,minute:clock.minute,timeZone:"America/Los_Angeles"});
    if(Date.parse(start)<now.getTime()-86400000)continue;
    let url=urlRaw; try{url=new URL(urlRaw,ENDPOINT).href}catch{}
    out.push({title,host,start,url,description:text.slice(0,900)});
  }
  return out;
}

export async function museumCouncilEvents(){
  const response=await fetch(ENDPOINT,{headers:{"User-Agent":"Mozilla/5.0 (compatible; LocaleEvents/1.4; +https://jonathanjoelneptune.github.io/Locale/)",Accept:"text/html"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`San Diego Museum Council ${response.status}`);
  const verified=new Date().toISOString();
  const out=parseMuseumCouncil(await response.text()).map(item=>({
    id:`sd-museum-council:${item.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)}:${item.start}`,
    title:item.title,category:classifyEvent(item.title,item.description,item.host,"museum"),subcategories:["museum"],tags:["museum","culture"],
    venue:item.host,address:null,lat:32.7157,lng:-117.1611,locationPrecision:"source-center",
    start:item.start,end:null,timeStatus:"known",timeZone:"America/Los_Angeles",
    price:/\bfree\b/i.test(item.description)?"Free":null,priceStatus:/\bfree\b/i.test(item.description)?"free":"unknown",
    url:item.url,source:"San Diego Museum Council",description:item.description,featured:false,image:null,sourceUrl:ENDPOINT,lastVerified:verified
  }));
  if(!out.length)throw new Error("San Diego Museum Council returned no parseable events");
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
