import {classifyEvent} from "../event-classification.mjs";

const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();

const DAYS={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};
const SD_CITIES=/\b(?:San Diego|La Jolla|Oceanside|Carlsbad|Vista|Encinitas|Escondido|San Marcos|Chula Vista|La Mesa|El Cajon|Santee|Lakeside|Poway|Solana Beach|Del Mar|Coronado|National City|Imperial Beach|Ramona|Fallbrook|Spring Valley|Lemon Grove)\b/i;

function nextDates(dayName,hour,minute,ampm,days=45,intervalWeeks=1){
  let h=Number(hour),m=Number(minute||0);
  if(ampm.toUpperCase()==="PM"&&h<12)h+=12;
  if(ampm.toUpperCase()==="AM"&&h===12)h=0;
  const now=new Date(),target=DAYS[dayName.toLowerCase()],out=[];
  const first=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  first.setDate(first.getDate()+((target-first.getDay()+7)%7));
  first.setHours(h,m,0,0);
  if(first<now)first.setDate(first.getDate()+7);
  for(let date=new Date(first);date<=new Date(now.getTime()+days*86400000);date.setDate(date.getDate()+7*intervalWeeks)){
    out.push(new Date(date).toISOString());
  }
  return out;
}

export async function sunsetTriviaEvents({days=45}={}){
  const endpoint="https://sunsettrivia.com/locations";
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Sunset Trivia ${response.status}`);
  const html=await response.text(),verified=new Date().toISOString(),out=[];
  const headings=[...html.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>/gi)];
  for(let i=0;i<headings.length;i++){
    const venue=strip(headings[i][1]);
    if(!venue)continue;
    const start=headings[i].index+(headings[i][0]?.length||0);
    const end=headings[i+1]?.index??Math.min(html.length,start+2200);
    const block=strip(html.slice(start,end));
    if(!SD_CITIES.test(venue+" "+block)&&!(/\b9(?:19|20|21)\d{2}\b/.test(block)))continue;
    const addressMatch=block.match(/(\d{2,6}\s+.{2,100}?(?:CA|California)\s*\d{5})/i);
    const address=strip(addressMatch?.[1]||"");
    const schedule=/\b(Every other|Every|Monthly on)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/gi;
    for(const match of block.matchAll(schedule)){
      const interval=/every other/i.test(match[1])?2:1;
      const dates=nextDates(match[2],match[3],match[4],match[5],days,interval);
      const monthly=/monthly/i.test(match[1]);
      const selected=monthly?dates.slice(0,1):dates;
      for(const eventStart of selected){
        out.push({
          id:"sunset-trivia:"+venue.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,80)+":"+eventStart,
          title:`Trivia Night at ${venue}`,category:"nightlife",venue,address:address||null,
          lat:32.7157,lng:-117.1611,locationPrecision:"source-center",
          start:eventStart,end:null,price:null,priceStatus:"unknown",
          url:endpoint,source:"Sunset Trivia",description:`Recurring trivia night at ${venue}. ${address}`.trim(),
          featured:false,image:null,sourceUrl:endpoint,lastVerified:verified
        });
      }
    }
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
