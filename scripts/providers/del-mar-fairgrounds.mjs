import {classifyEvent} from "../event-classification.mjs";
import {zonedLocalIso,parseClock} from "../weekly-recurrence.mjs";

const ENDPOINT="https://www.delmarfairgrounds.com/eventsprint.aspx";
const ADDRESS="2260 Jimmy Durante Blvd, Del Mar, CA 92014";
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
const decode=value=>String(value||"").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;|&#8217;/g,"'").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();

const localYear=(month,now)=>month<now.getMonth()+1-2?now.getFullYear()+1:now.getFullYear();

export function parseFairgroundsPrint(html,{now=new Date(),days=75}={}){
  const text=decode(
    String(html||"")
      .replace(/<script[\s\S]*?<\/script>/gi," ")
      .replace(/<style[\s\S]*?<\/style>/gi," ")
      .replace(/<[^>]+>/g," ")
  );
  const dateRe=/(?:TODAY\s*-\s*)?(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2})/gi;
  const dateMatches=[...text.matchAll(dateRe)];
  const out=[],horizon=now.getTime()+days*86400000;

  for(let dateIndex=0;dateIndex<dateMatches.length;dateIndex++){
    const dateMatch=dateMatches[dateIndex];
    const month=MONTHS[dateMatch[1].toLowerCase()],day=Number(dateMatch[2]);
    const year=localYear(month,now);
    const chunkStart=dateMatch.index+dateMatch[0].length;
    const chunkEnd=dateIndex+1<dateMatches.length?dateMatches[dateIndex+1].index:text.length;
    const chunk=text.slice(chunkStart,chunkEnd);
    const timeRe=/(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/gi;
    const timeMatches=[...chunk.matchAll(timeRe)];

    for(let timeIndex=0;timeIndex<timeMatches.length;timeIndex++){
      const timeMatch=timeMatches[timeIndex];
      const time=parseClock(timeMatch[1]);
      if(!time)continue;
      const eventStart=timeMatch.index+timeMatch[0].length;
      const eventEnd=timeIndex+1<timeMatches.length?timeMatches[timeIndex+1].index:chunk.length;
      const eventChunk=chunk.slice(eventStart,eventEnd);
      const eventRe=/([^|]{2,220}?)\s+-\s+Location:\s*([^|]{2,140}?)\s*\|\s*([1-7])\b/gi;

      for(const match of eventChunk.matchAll(eventRe)){
        const title=decode(match[1]).replace(/(?:\s+-\s*)+$/,"").replace(/^[-–—\s]+/,"").trim();
        const venue=decode(match[2]);
        const categoryCode=match[3];
        if(!title||!venue||categoryCode==="5")continue;
        const startIso=zonedLocalIso({year,month,day,hour:time.hour,minute:time.minute,timeZone:"America/Los_Angeles"});
        const ms=Date.parse(startIso);
        if(ms<now.getTime()-86400000||ms>horizon)continue;
        out.push({title,venue,start:startIso,categoryCode});
      }
    }
  }
  return [...new Map(out.map(item=>[`${item.title}|${item.start}|${item.venue}`,item])).values()];
}

export async function delMarFairgroundsEvents(){
  const response=await fetch(ENDPOINT,{headers:{"User-Agent":"Mozilla/5.0 (compatible; LocaleEvents/1.4; +https://jonathanjoelneptune.github.io/Locale/)",Accept:"text/html"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error("Del Mar Fairgrounds "+response.status);
  const verified=new Date().toISOString();
  const labels={"1":"arts-crafts","2":"holiday-seasonal","3":"horse-racing","4":"music-entertainment","5":"public-meeting","6":"shopping-retail","7":"sports-recreation"};
  const out=parseFairgroundsPrint(await response.text()).map(item=>({
    id:"del-mar-fairgrounds:"+item.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)+":"+item.start,
    title:item.title,category:classifyEvent(item.title,labels[item.categoryCode],item.venue),subcategories:[labels[item.categoryCode]].filter(Boolean),tags:["fairgrounds",labels[item.categoryCode]].filter(Boolean),
    venue:item.venue==="The Sound"?"The Sound":("Del Mar Fairgrounds - "+item.venue),
    address:ADDRESS,lat:32.9736,lng:-117.2618,locationPrecision:"source",
    start:item.start,end:null,timeStatus:"known",timeZone:"America/Los_Angeles",
    price:null,priceStatus:"unknown",url:"https://www.delmarfairgrounds.com/events",source:"Del Mar Fairgrounds",
    description:labels[item.categoryCode]?labels[item.categoryCode].replaceAll("-"," "):"",featured:false,image:null,sourceUrl:ENDPOINT,lastVerified:verified
  }));
  if(!out.length)throw new Error("Del Mar Fairgrounds returned no parseable events");
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
