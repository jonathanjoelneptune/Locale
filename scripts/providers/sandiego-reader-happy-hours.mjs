import {weeklyOccurrences,parseClock} from "../weekly-recurrence.mjs";

const BASE="https://www.sandiegoreader.com/specials";
const DAYS=["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const UA="Mozilla/5.0 (compatible; LocaleEvents/1.4; +https://jonathanjoelneptune.github.io/Locale/)";

const decode=value=>String(value||"")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v[0].toLowerCase()==="x"?v.slice(1):v,v[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">",ndash:"–",mdash:"—"}[name.toLowerCase()]))
  .replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
const strip=value=>decode(String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));

export function parseReaderSpecials(html,day){
  const source=String(html||"");
  const headings=[...source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)].map(m=>({index:m.index,name:strip(m[1])})).filter(x=>x.name);
  const anchors=[...source.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({index:m.index,url:m[1],name:strip(m[2])})).filter(x=>x.name);
  const specials=[...source.matchAll(/>\s*Special\s*</gi)].map(m=>m.index);
  const out=[];
  for(const pos of specials){
    const before=anchors.filter(item=>item.index<pos).at(-1);
    if(!before||before.name.length>100)continue;
    const neighborhood=headings.filter(item=>item.index<before.index).at(-1)?.name||null;
    const nextAnchor=anchors.find(item=>item.index>pos);
    const end=nextAnchor?.index||Math.min(source.length,pos+1800);
    const detail=strip(source.slice(pos,end)).replace(/^Special\s*/i,"").trim();
    if(!detail||detail.length<4)continue;
    let url=before.url;
    try{url=new URL(before.url,BASE).href}catch{}
    out.push({day,venue:before.name,neighborhood,detail,url});
  }
  return [...new Map(out.map(item=>[`${item.venue}|${item.neighborhood}|${item.detail}`,item])).values()];
}

function startClock(detail){
  if(/^all day\b/i.test(detail))return {hour:12,minute:0,known:false};
  if(/^open\s*-/i.test(detail))return {hour:12,minute:0,known:false};
  const parsed=parseClock(detail);
  return parsed?{...parsed,known:true}:{hour:16,minute:0,known:false};
}

export async function sanDiegoReaderHappyHourEvents({days=45}={}){
  const settled=await Promise.allSettled(DAYS.map(async day=>{
    const endpoint=`${BASE}/${day}/`;
    const response=await fetch(endpoint,{headers:{"User-Agent":UA,Accept:"text/html","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`Reader specials ${day} ${response.status}`);
    return parseReaderSpecials(await response.text(),day);
  }));
  const verified=new Date().toISOString(),out=[];
  for(const result of settled){
    if(result.status!=="fulfilled")continue;
    for(const item of result.value){
      const clock=startClock(item.detail);
      const starts=weeklyOccurrences({day:item.day,time:{hour:clock.hour,minute:clock.minute},days,timeZone:"America/Los_Angeles"});
      for(const start of starts){
        out.push({
          id:`reader-happy-hour:${item.day}:${item.venue.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,65)}:${start}`,
          title:`Happy Hour at ${item.venue}`,
          category:"food",subcategories:["happy-hour","recurring-special"],tags:["happy-hour","deal","recurring-special",item.day],
          venue:item.venue,address:null,lat:32.7157,lng:-117.1611,locationPrecision:"source-center",
          start,end:null,timeStatus:clock.known?"known":"unknown",timeZone:"America/Los_Angeles",
          price:/\$\s*\d/.test(item.detail)?item.detail.match(/\$\s*\d+(?:\.\d{1,2})?/)?.[0]||null:null,
          priceStatus:/\$\s*\d/.test(item.detail)?"source-text":"unknown",
          url:item.url,source:"San Diego Reader Happy Hours",
          description:[item.neighborhood,item.detail].filter(Boolean).join(" · "),
          featured:false,image:null,sourceUrl:`${BASE}/${item.day}/`,lastVerified:verified,
          recurring:true,dealType:"happy-hour",neighborhood:item.neighborhood||null
        });
      }
    }
  }
  if(!out.length)throw new Error("San Diego Reader happy-hour adapter returned no specials");
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
