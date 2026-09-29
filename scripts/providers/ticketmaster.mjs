const API="https://app.ticketmaster.com/discovery/v2/events.json";

function category(event){
  const segment=event.classifications?.[0]?.segment?.name?.toLowerCase()||"";
  const genre=event.classifications?.[0]?.genre?.name?.toLowerCase()||"";
  if(segment.includes("music")) return "music";
  if(segment.includes("sports")) return "sports";
  if(segment.includes("arts")||genre.includes("theatre")||genre.includes("theater")) return "theater";
  if(genre.includes("comedy")) return "comedy";
  if(segment.includes("family")) return "family";
  return "other";
}
function price(event){
  const ranges=event.priceRanges||[];
  if(!ranges.length) return null;
  const low=Math.min(...ranges.map(r=>Number(r.min)).filter(Number.isFinite));
  const high=Math.max(...ranges.map(r=>Number(r.max)).filter(Number.isFinite));
  if(!Number.isFinite(low)) return null;
  return Number.isFinite(high)&&high>low ? `$${low.toFixed(0)}–$${high.toFixed(0)}` : `$${low.toFixed(0)}+`;
}
export async function ticketmasterEvents({apiKey,days=45}){
  if(!apiKey) return [];
  const start=new Date();
  const end=new Date(start.getTime()+days*86400000);
  const params=new URLSearchParams({
    apikey:apiKey,city:"San Diego",stateCode:"CA",countryCode:"US",
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
      out.push({
        id:`ticketmaster:${e.id}`,title:e.name,category:category(e),venue:v?.name||"Location TBA",
        lat,lng,start:e.dates?.start?.dateTime||e.dates?.start?.localDate,end:null,
        price:price(e),url:e.url||null,source:"Ticketmaster",description:e.info||e.pleaseNote||"",
        featured:false,image:(e.images||[]).filter(i=>i.url).sort((a,b)=>(b.width||0)-(a.width||0))[0]?.url||null,sourceUrl:e.url||null,lastVerified:new Date().toISOString()
      });
    }
    if(page>=Number(data.page?.totalPages||1)-1) break;
  }
  return out;
}
