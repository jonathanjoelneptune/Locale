import {zonedLocalIso,parseClock} from "../weekly-recurrence.mjs";

const ENDPOINT="https://www.casbahmusic.com/calendar/";
const MONTHS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const decode=value=>String(value||"").replace(/&#(x?[0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v[0].toLowerCase()==="x"?v.slice(1):v,v[0].toLowerCase()==="x"?16:10))).replace(/&(nbsp|amp|quot|apos);/gi,(_,n)=>({nbsp:" ",amp:"&",quot:'"',apos:"'"}[n])).replace(/&[^;]+;/g," ").replace(/\s+/g," ").trim();
const strip=value=>decode(String(value||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," "));

const yearFor=(month,now=new Date())=>{
  let year=now.getFullYear();
  if(month<now.getMonth()+1-2)year++;
  return year;
};

export function parseCasbahCalendar(html,{now=new Date()}={}){
  const source=String(html||"");
  const markers=[...source.matchAll(/(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})/gi)];
  const out=[];
  for(let i=0;i<markers.length;i++){
    const month=MONTHS[markers[i][1].toLowerCase()],day=Number(markers[i][2]);
    const startAt=markers[i].index+markers[i][0].length;
    const endAt=i+1<markers.length?markers[i+1].index:Math.min(source.length,startAt+7000);
    const block=source.slice(startAt,endAt);
    const text=strip(block);
    const anchors=[...block.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map(m=>({url:m[1],title:strip(m[2])}))
      .filter(x=>x.title&&!/buy tickets|sold out|coming soon|more info/i.test(x.title));
    const headline=anchors[0];
    const venue=text.match(/\bat\s+(.+?)\s+Doors:/i)?.[1]?.trim();
    const show=text.match(/Show:\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i)?.[1];
    const doors=text.match(/Doors:\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))/i)?.[1];
    const time=parseClock(show||doors||"");
    if(!headline||!venue||!time)continue;
    const year=yearFor(month,now);
    const start=zonedLocalIso({year,month,day,hour:time.hour,minute:time.minute,timeZone:"America/Los_Angeles"});
    if(Date.parse(start)<now.getTime()-86400000)continue;
    let url=headline.url;
    try{url=new URL(url,ENDPOINT).href}catch{}
    const price=text.match(/\$\s*\d+(?:\.\d{1,2})?(?:\s*-\s*\$?\d+(?:\.\d{1,2})?)?/i)?.[0]||null;
    const genre=text.split(/\s+/).slice(-4).join(" ").match(/\b(Indie|Electronic|Emo|Rock|Punk|Metal|Jazz|Hip-Hop|Country|Pop)\b/i)?.[1]||null;
    out.push({title:headline.title,venue,start,url,price,genre,description:text.slice(0,900)});
  }
  return out;
}

export async function casbahPresentsEvents(){
  const response=await fetch(ENDPOINT,{headers:{"User-Agent":"Mozilla/5.0 (compatible; LocaleEvents/1.4; +https://jonathanjoelneptune.github.io/Locale/)",Accept:"text/html"},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new Error(`Casbah Presents ${response.status}`);
  const verified=new Date().toISOString();
  const out=parseCasbahCalendar(await response.text()).map(item=>({
    id:`casbah-presents:${item.title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,70)}:${item.start}`,
    title:item.title,category:"music",subcategories:["live-music"],tags:["concert",item.genre].filter(Boolean),
    venue:item.venue,address:null,lat:32.7157,lng:-117.1611,locationPrecision:"source-center",
    start:item.start,end:null,timeStatus:"known",timeZone:"America/Los_Angeles",
    price:item.price,priceStatus:item.price?"source-text":"unknown",
    url:item.url,source:"Casbah Presents",description:item.description,featured:false,image:null,sourceUrl:ENDPOINT,lastVerified:verified
  }));
  if(!out.length)throw new Error("Casbah Presents returned no parseable events");
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
