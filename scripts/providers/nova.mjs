const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();

const MONTH={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};

function parseDate(text){
  const m=text.match(/date:\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
  const t=text.match(/Door Time:\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if(!m)return null;
  let hour=t?Number(t[1]):20,min=t?Number(t[2]||0):0;
  if(t&&t[3].toUpperCase()==="PM"&&hour<12)hour+=12;
  if(t&&t[3].toUpperCase()==="AM"&&hour===12)hour=0;
  const date=new Date(Date.UTC(Number(m[3]),MONTH[m[1].toLowerCase()],Number(m[2]),hour+7,min));
  return Number.isNaN(+date)?null:date.toISOString();
}

export async function novaEvents(){
  const base="https://novasd.com/";
  const response=await fetch(base,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`NOVA listing ${response.status}`);
  const html=await response.text();
  const links=[];
  for(const match of html.matchAll(/href=["']([^"']*\/event\/[^"']+)["']/gi)){
    try{const url=new URL(match[1],base).href;if(!links.includes(url))links.push(url)}catch{}
  }
  const out=[];
  const verified=new Date().toISOString();
  for(let index=0;index<links.length;index+=5){
    const batch=links.slice(index,index+5);
    const settled=await Promise.allSettled(batch.map(async url=>{
      const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
      if(!r.ok)return null;
      const raw=await r.text(),text=strip(raw);
      const title=(text.match(/(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}\s+(.+?)\s+Venue:\s*Nova SD/i)||[])[1]
        ||(raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||[])[1];
      const start=parseDate(text);
      if(!title||!start)return null;
      const cleanTitle=strip(title);
      return {
        id:"nova-sd:"+url.split("/").filter(Boolean).pop()+":"+start.slice(0,10),
        title:cleanTitle,category:"nightlife",venue:"NOVA SD",
        address:"454 Sixth Ave, San Diego, CA 92101",
        lat:32.7108,lng:-117.1596,locationPrecision:"venue-known",
        start,end:null,price:null,priceStatus:"unknown",url,source:"NOVA SD",
        description:/\b21\+\b/.test(text)?"21+ nightlife event at NOVA SD.":"Nightlife event at NOVA SD.",
        featured:false,image:null,sourceUrl:url,lastVerified:verified
      };
    }));
    for(const result of settled)if(result.status==="fulfilled"&&result.value)out.push(result.value);
  }
  return out;
}
