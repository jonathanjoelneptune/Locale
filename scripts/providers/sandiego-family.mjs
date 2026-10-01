import {classifyEvent} from "../event-classification.mjs";
const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();

const MONTH={january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const GARBAGE_MARKERS=[
  "San Diego Family Magazine","Event options","Invite Print","Menu Resources",
  "Resources Education Directory","Search Search","CURRENT & PAST ISSUES"
];
const GENERIC_PLACE=/^(?:San Diego(?:,\s*CA)?|Temecula(?:,\s*CA)?|El Cajon(?:,\s*CA)?|Fallbrook(?:,\s*CA)?|La Jolla(?:,\s*CA)?|Oceanside(?:,\s*CA)?|Carlsbad(?:,\s*CA)?)$/i;
const COARSE_PLACES=[
  [/^San Diego(?:,\s*CA)?$/i,{lat:32.7157,lng:-117.1611}],
  [/^Temecula(?:,\s*CA)?$/i,{lat:33.4936,lng:-117.1484}],
  [/^El Cajon(?:,\s*CA)?$/i,{lat:32.7948,lng:-116.9625}],
  [/^Fallbrook(?:,\s*CA)?$/i,{lat:33.3764,lng:-117.2511}],
  [/^La Jolla(?:,\s*CA)?$/i,{lat:32.8328,lng:-117.2713}],
  [/^Oceanside(?:,\s*CA)?$/i,{lat:33.1959,lng:-117.3795}],
  [/^Carlsbad(?:,\s*CA)?$/i,{lat:33.1581,lng:-117.3506}]
];
const coarsePoint=venue=>COARSE_PLACES.find(([re])=>re.test(venue))?.[1]||{lat:32.7157,lng:-117.1611};

function cleanVenue(value){
  let venue=strip(value||"");
  for(const marker of GARBAGE_MARKERS){
    const index=venue.toLowerCase().indexOf(marker.toLowerCase());
    if(index>0)venue=venue.slice(0,index).trim();
  }
  venue=venue.replace(/\s+(?:On|At)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\b[\s\S]*$/i,"").trim();
  if(venue.length>140)venue=venue.slice(0,140).replace(/\s+\S*$/,"").trim();
  return venue||"San Diego, CA";
}

function extractVenue(html,text){
  const rawPatterns=[
    /\bAt\s+(?:<[^>]+>\s*)*([^<\r\n]{2,140})/i,
    /class=["'][^"']*(?:location|venue)[^"']*["'][^>]*>([\s\S]*?)<\//i
  ];
  for(const pattern of rawPatterns){
    const match=html.match(pattern);
    const value=cleanVenue(match?.[1]);
    if(value&&!/^At$/i.test(value)&&!GENERIC_PLACE.test(value))return value;
  }
  const flat=text.match(/\bAt\s+(.+?)(?=\s+(?:Posted by|Categories:|Event repeats|San Diego Family Magazine|Event options|Menu Resources|Search Search))/i);
  return cleanVenue(flat?.[1]||"San Diego, CA");
}

function eventDate(text){
  const m=text.match(/\bOn\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i);
  if(!m)return null;
  return {year:Number(m[3]),month:MONTH[m[1].toLowerCase()],day:Number(m[2])};
}

function eventTime(text){
  const m=text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  return m?{hour:Number(m[1]),minute:Number(m[2]||0),ampm:m[3].toLowerCase()}:null;
}

function toIso(date,time){
  let hour=time?time.hour:12,minute=time?time.minute:0;
  if(time?.ampm==="pm"&&hour<12)hour+=12;
  if(time?.ampm==="am"&&hour===12)hour=0;
  const offset=date.month>=2&&date.month<=10?"-07:00":"-08:00";
  const iso=`${date.year}-${String(date.month+1).padStart(2,"0")}-${String(date.day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00${offset}`;
  const parsed=new Date(iso);
  return Number.isNaN(+parsed)?null:parsed.toISOString();
}

async function fetchText(url){
  const response=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`San Diego Family ${response.status}`);
  return response.text();
}

export async function sanDiegoFamilyEvents({days=45}={}){
  const base="https://www.sandiegofamily.com";
  const now=new Date(),verified=new Date().toISOString();
  const links=new Set;

  const dayUrls=[];
  for(let offset=0;offset<days;offset++){
    const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset);
    dayUrls.push(`${base}/things-to-do/events-calendar/day/${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}-${date.getFullYear()}`);
  }

  for(let index=0;index<dayUrls.length;index+=6){
    const batch=dayUrls.slice(index,index+6);
    const settled=await Promise.allSettled(batch.map(fetchText));
    for(const result of settled){
      if(result.status!=="fulfilled")continue;
      for(const match of result.value.matchAll(/href=["']([^"']*\/things-to-do\/events-calendar\/event\/[^"']+)["']/gi)){
        try{links.add(new URL(match[1],base).href)}catch{}
      }
    }
    if(index+6<dayUrls.length)await sleep(50);
  }

  const out=[];
  const urls=[...links].slice(0,180);
  for(let index=0;index<urls.length;index+=6){
    const batch=urls.slice(index,index+6);
    const settled=await Promise.allSettled(batch.map(async url=>({url,html:await fetchText(url)})));
    for(const result of settled){
      if(result.status!=="fulfilled")continue;
      const {url,html}=result.value;
      const title=strip((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)||[])[1]||"");
      const text=strip(html);
      const date=eventDate(text);
      if(!title||!date)continue;
      const time=eventTime(text);
      const start=toIso(date,time);
      if(!start)continue;
      const venue=extractVenue(html,text);
      const approximate=GENERIC_PLACE.test(venue);
      const point=approximate?coarsePoint(venue):{lat:32.7157,lng:-117.1611};
      const categories=strip((text.match(/Categories:\s*(.+?)(?=\s+(?:Event repeats|\b[A-Z][a-z]+\s+[A-Z]))/i)||[])[1]||"");
      const descriptionStart=text.indexOf("Categories:");
      const description=descriptionStart>=0?text.slice(descriptionStart).replace(/^Categories:\s*[^.]*\.?/i,"").split(/Event repeats/i)[0].trim():"";
      out.push({
        id:"sandiego-family:"+url.split("/").filter(Boolean).pop(),
        title,category:classifyEvent(title,categories,description,venue),venue,
        lat:point.lat,lng:point.lng,locationPrecision:approximate?"city-only":"source-center",
        start,end:null,timeStatus:time?"known":"unknown",
        price:/\bFREE\b/.test(text)?"Free":null,priceStatus:/\bFREE\b/.test(text)?"free":"unknown",
        url,source:"San Diego Family",description:description||categories,
        featured:false,image:null,sourceUrl:url,lastVerified:verified
      });
    }
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
