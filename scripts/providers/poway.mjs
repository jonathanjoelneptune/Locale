import {readFile,writeFile} from "node:fs/promises";
const URL="https://www.poway.org/m/calendar?cat=0";
const CACHE="src/data/geocode-cache.json";
const clean=s=>String(s||"").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
async function geocode(q,cache){
 if(cache[q])return cache[q];
 const u="https://nominatim.openstreetmap.org/search?format=json&limit=1&q="+encodeURIComponent(q+", Poway, CA");
 const r=await fetch(u,{headers:{"User-Agent":"Locale-events/1.0"}});
 if(!r.ok)return null;const a=await r.json();if(!a[0])return null;
 const p={lat:Number(a[0].lat),lng:Number(a[0].lon)};cache[q]=p;await new Promise(x=>setTimeout(x,1100));return p;
}
export async function powayEvents(){
 const now=new Date(),end=new Date(now.getTime()+45*86400000);
 const url=URL+"&startDate="+now.toISOString().slice(0,10)+"&endDate="+end.toISOString().slice(0,10);
 const html=await (await fetch(url)).text();
 let cache={};try{cache=JSON.parse(await readFile(CACHE,"utf8"))}catch{}
 const out=[];
 const re=/<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?(?:(?:MON|TUE|WED|THU|FRI|SAT|SUN),\s*)?([A-Z]{3})\s+(\d{1,2})[^|<]*\|\s*([^<]+)[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
 const months={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
 for(const m of html.matchAll(re)){
  const title=clean(m[1]),mon=months[m[2].toUpperCase()],day=Number(m[3]),time=clean(m[4]),body=clean(m[5]);
  if(mon==null||!title||/closed|city council/i.test(title))continue;
  let year=now.getFullYear();if(mon<now.getMonth()-2)year++;
  const tm=time.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);let hour=tm?Number(tm[1]):12,min=tm?Number(tm[2]||0):0;
  if(tm&&tm[3].toUpperCase()==="PM"&&hour<12)hour+=12;if(tm&&tm[3].toUpperCase()==="AM"&&hour===12)hour=0;
  const venue=(body.match(/(?:at|@)\s+([^.!]+?)(?:\.|$)/i)?.[1]||"Poway, CA").trim();
  const pos=await geocode(venue,cache);if(!pos)continue;
  const start=new Date(year,mon,day,hour,min).toISOString();
  out.push({id:"poway:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-")+"-"+start.slice(0,10),title,category:/concert|music|festival/i.test(title)?"music":/movie|family|kid/i.test(title)?"family":/run|fishing|sport/i.test(title)?"sports":"community",venue,...pos,start,end:null,price:/\bfree\b/i.test(body)?"Free":null,priceStatus:/\bfree\b/i.test(body)?"free":"unknown",url:url,source:"City of Poway",description:body,featured:false,image:null,sourceUrl:url,lastVerified:new Date().toISOString()});
 }
 await writeFile(CACHE,JSON.stringify(cache,null,2)+"\n");
 return out;
}