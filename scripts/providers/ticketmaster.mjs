import {canonicalizeVenue} from "../venue-canonical.mjs";
import {classifyEvent} from "../event-classification.mjs";
const API="https://app.ticketmaster.com/discovery/v2/events.json";

function category(event){
  const classification=event.classifications?.[0]||{};
  return classifyEvent(event.name,classification.segment?.name,classification.genre?.name,classification.subGenre?.name,event.info,event.pleaseNote);
}
function price(event){
  if(event.dates?.status?.code==="cancelled") return null;
  const ranges=event.priceRanges||[];
  if(!ranges.length){
    const text=[event.info,event.pleaseNote].filter(Boolean).join(" ");
    const m=text.match(/(?:ticket\s*price|tickets?\s*(?:start(?:ing)?\s*)?(?:at|from)?|admission)\s*:?\s*\$\s*(\d+(?:\.\d{1,2})?)/i);
    return m?("$"+Number(m[1]).toFixed(Number(m[1])%1?2:0)+" source") : null;
  }
  const low=Math.min(...ranges.map(r=>Number(r.min)).filter(Number.isFinite));
  const high=Math.max(...ranges.map(r=>Number(r.max)).filter(Number.isFinite));
  if(!Number.isFinite(low)) return null;
  return Number.isFinite(high)&&high>low ? `$${low.toFixed(0)}–$${high.toFixed(0)}` : `$${low.toFixed(0)}+`;
}
export async function ticketmasterEvents({apiKey,center,radiusMiles=50,regionId=null,countryCode,days=45}){
  if(!apiKey) return [];
  if(!center||!Number.isFinite(Number(center.lat))||!Number.isFinite(Number(center.lng)))throw new Error("Ticketmaster provider requires a valid center");
  if(!countryCode)throw new Error("Ticketmaster provider requires countryCode");
  const start=new Date();
  const end=new Date(start.getTime()+days*86400000);
  const params=new URLSearchParams({
    apikey:apiKey,latlong:`${center.lat},${center.lng}`,radius:String(radiusMiles),unit:"miles",countryCode,
    startDateTime:start.toISOString().replace(/\.\d{3}Z$/,"Z"),
    endDateTime:end.toISOString().replace(/\.\d{3}Z$/,"Z"),
    size:"200",sort:"date,asc"
  });
  const out=[];
  for(let page=0;page<5;page++){
    params.set("page",String(page));
    const res=await fetch(`${API}?${params}`);
    if(!res.ok) throw new Error(`Ticketmaster ${res.status}: ${await res.text()}`);
    const data=await res.json();
    for(const e of data._embedded?.events||[]){
      const v=e._embedded?.venues?.[0];
      const lat=Number(v?.location?.latitude),lng=Number(v?.location?.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)) continue;
      const eventPrice=price(e);
      out.push(canonicalizeVenue({
        id:`ticketmaster:${e.id}`,regionId,title:e.name,category:category(e),venue:v?.name||"Location TBA",
        lat,lng,start:e.dates?.start?.dateTime||e.dates?.start?.localDate,end:null,
        price:eventPrice,priceStatus:e.priceRanges?.length?"known":(eventPrice?"source-text":"unknown"),url:e.url||null,source:"Ticketmaster",description:e.info||e.pleaseNote||"",
        featured:false,image:(e.images||[]).filter(i=>i.url&&(!i.ratio||i.ratio==="16_9")).sort((a,b)=>Math.abs((a.width||640)-640)-Math.abs((b.width||640)-640))[0]?.url||null,sourceUrl:e.url||null,lastVerified:new Date().toISOString()
      }));
    }
    if(page>=Number(data.page?.totalPages||1)-1) break;
  }
  return out;
}
