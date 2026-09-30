const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();

const MONTH={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};

function parseDate(details,now=new Date()){
  const m=details.match(/(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),?\s*(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})/i);
  if(!m)return null;
  const month=MONTH[m[1].toLowerCase()];
  let year=now.getFullYear();
  if(month<now.getMonth()-2)year++;
  const t=details.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  let hour=t?Number(t[1]):21,min=t?Number(t[2]||0):0;
  if(t&&t[3].toUpperCase()==="PM"&&hour<12)hour+=12;
  if(t&&t[3].toUpperCase()==="AM"&&hour===12)hour=0;
  const date=new Date(Date.UTC(year,month,Number(m[2]),hour+7,min));
  return Number.isNaN(+date)?null:date.toISOString();
}

export async function spinEvents(){
  const endpoint="https://spinnightclub.com/";
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Spin listing ${response.status}`);
  const html=await response.text();
  const out=[],verified=new Date().toISOString();
  const blocks=[...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]{0,1800}?)<h4[^>]*>([\s\S]*?)<\/h4>/gi)];
  for(const block of blocks){
    const title=strip(block[1]),details=strip(block[3]);
    if(!title||/^calendar$/i.test(title))continue;
    const start=parseDate(details);
    if(!start)continue;
    const href=(block[2].match(/href=["']([^"']+)["']/i)||[])[1];
    let url=endpoint;
    try{if(href)url=new URL(href,endpoint).href}catch{}
    out.push({
      id:"spin-nightclub:"+title.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80)+":"+start.slice(0,10),
      title,category:"nightlife",venue:"Spin Nightclub",
      address:"2028 Hancock Street, San Diego, CA 92110",
      lat:32.7423,lng:-117.1836,locationPrecision:"venue-known",
      start,end:null,price:null,priceStatus:"unknown",url,source:"Spin Nightclub",
      description:"Nightlife event at Spin Nightclub.",featured:false,image:null,
      sourceUrl:endpoint,lastVerified:verified
    });
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
