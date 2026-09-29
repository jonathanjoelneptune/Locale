import {readFile,writeFile} from "node:fs/promises";
// Official rolling 7-day permitted special-events feed. Geocodes persist between refreshes.
const URL="https://www.sandiego.gov/specialevents-filming/calendar/printer/this_week";
const strip=s=>s.replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&#039;/g,"'").replace(/\s+/g," ").trim();
const cat=s=>/market|food/i.test(s)?"food":/festival|fair|oktober/i.test(s)?"festival":/run|walk|race|swim/i.test(s)?"sports":/music|concert/i.test(s)?"music":"community";
const addrKey=s=>s.replace(/\s+/g," ").replace(/\s+,/g,",").trim();
let cache={}; try{const raw=JSON.parse(await readFile("src/data/geocode-cache.json","utf8")); for(const [k,v] of Object.entries(raw))cache[addrKey(k)]=v}catch{};
async function geo(address){
 const key=addrKey(address); if(cache[key])return cache[key];
 const q=new URLSearchParams({address,benchmark:"Public_AR_Current",format:"json"});
 const r=await fetch("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?"+q);
 if(!r.ok)return null;
 const a=await r.json(),x=a.result?.addressMatches?.[0]?.coordinates;
 if(!x)return null; const point={lat:+x.y,lng:+x.x}; cache[key]=point; return point;
}
export async function sanDiegoCityEvents(){
 const r=await fetch(URL); if(!r.ok)throw new Error("City events "+r.status);
 const html=await r.text(),rows=[...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)],out=[],verified=new Date().toISOString();
 for(const row of rows){
  const cells=[...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>strip(x[1]));
  if(cells.length<3||!/2026/.test(cells[0]))continue;
  const date=cells[0].match(/(\w+),\s+(\w+)\s+(\d{1,2}),\s+(\d{4}),\s+(.+)/);
  const address=(cells[2].match(/Address:\s*(.*?)(?:Details:|$)/i)||[])[1];
  if(!date||!address)continue;
  const point=await geo(address); if(!point)continue;
  const title=cells[1].split(/(?=The Pacific|This weekday|San Diego\x27s|Check out|The Gaslamp|Come and)/)[0].trim()||cells[1];
  let first=date[5].split("-")[0].trim(),last=date[5].split("-").pop().trim();
  const suffix=(last.match(/(am|pm)/i)||[])[1]; if(suffix&&!/(am|pm)/i.test(first))first+=" "+suffix;
  const start=new Date(date[2]+" "+date[3]+", "+date[4]+" "+first+" PDT");
  if(Number.isNaN(+start))continue;
  out.push({id:"sd-city:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-")+":"+start.toISOString().slice(0,10),title,category:cat(title+" "+cells[1]),venue:address,lat:point.lat,lng:point.lng,start:start.toISOString(),end:null,price:null,url:URL,source:"City of San Diego",description:cells[1],featured:false,image:null,sourceUrl:URL,lastVerified:verified});
 }
 await writeFile("src/data/geocode-cache.json",JSON.stringify(cache,null,2)+"\\n");
 return out;
}
