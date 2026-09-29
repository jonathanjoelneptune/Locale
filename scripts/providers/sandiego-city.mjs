const URL="https://www.sandiego.gov/specialevents-filming/calendar/printer/this_week";
const strip=s=>s.replace(/<br\s*\/?\s*>/gi," ").replace(/<[^>]*>/g," ").replace(/&amp;/g,"&").replace(/&#039;/g,"'").replace(/\s+/g," ").trim();
const cat=s=>/market|food/i.test(s)?"food":/festival|fair|oktober/i.test(s)?"festival":/run|walk|race|swim/i.test(s)?"sports":/music|concert/i.test(s)?"music":"community";
async function geo(address){
 const q=encodeURIComponent(address);
 const r=await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q="+q,{headers:{"User-Agent":"Locale/1.0 event discovery"}});
 if(!r.ok)return null;
 const a=await r.json(),x=a[0]; return x?{lat:+x.lat,lng:+x.lon}:null;
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
  const title=cells[1].split(/\s{2,}|The |This /)[0].trim()||cells[1];
  const start=new Date(date[2]+" "+date[3]+", "+date[4]+" "+date[5].split("-")[0].trim()+" PDT");
  if(Number.isNaN(+start))continue;
  out.push({id:"sd-city:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-")+":"+start.toISOString().slice(0,10),title,category:cat(title+" "+cells[1]),venue:address,lat:point.lat,lng:point.lng,start:start.toISOString(),end:null,price:null,url:URL,source:"City of San Diego",description:cells[1],featured:false,image:null,sourceUrl:URL,lastVerified:verified});
  await new Promise(x=>setTimeout(x,1100));
 }
 return out;
}
