const strip=value=>String(value||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<[^>]+>/g," ")
  .replace(/&nbsp;/gi," ")
  .replace(/&amp;/gi,"&")
  .replace(/&#39;/g,"'")
  .replace(/&quot;/gi,'"')
  .replace(/\s+/g," ")
  .trim();

function category(event){
  const text=[event.title,event.description,event.excerpt,(event.categories||[]).map(x=>x.name)].flat(Infinity).filter(Boolean).join(" ").toLowerCase();
  if(/concert|music|orchestra|choir|band|opera/.test(text))return "music";
  if(/soccer|basketball|baseball|volleyball|athletic|sport|game\b|race\b|run\b/.test(text))return "sports";
  if(/theat|play\b|dance|performance|film|cinema/.test(text))return "theater";
  if(/festival|fair|celebration|parade|expo/.test(text))return "festival";
  if(/food|culinary|tasting|dining/.test(text))return "food";
  if(/family|children|kids?\b/.test(text))return "family";
  return "community";
}

function coordinates(event,fallback){
  const venue=event.venue||{};
  const lat=Number(venue.geo_lat??venue.latitude??event.geo_lat);
  const lng=Number(venue.geo_lng??venue.longitude??event.geo_lng);
  if(Number.isFinite(lat)&&Number.isFinite(lng))return {lat,lng};
  return fallback||null;
}

function cost(event){
  const text=strip(event.cost||"");
  if(/\bfree\b/i.test(text)||text==="$0")return {price:"Free",priceStatus:"free"};
  const match=text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return match?{price:text,priceStatus:"source-text"}:{price:null,priceStatus:"unknown"};
}

export async function tribeEvents({endpoint,sourceName,sourceId,fallbackCenter,days=45,maxPages=12}){
  if(!endpoint)throw new Error("Tribe adapter requires endpoint");
  const base=endpoint.replace(/\/$/,"");
  const now=new Date();
  const end=new Date(now.getTime()+days*86400000);
  const verified=new Date().toISOString();
  const out=[];

  for(let page=1;page<=maxPages;page++){
    const url=new URL(base+"/wp-json/tribe/events/v1/events");
    url.searchParams.set("start_date",now.toISOString().slice(0,10));
    url.searchParams.set("end_date",end.toISOString().slice(0,10));
    url.searchParams.set("per_page","50");
    url.searchParams.set("page",String(page));
    const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":"Locale-events/1.0"}});
    if(!response.ok)throw new Error(`${sourceName} Tribe ${response.status}`);
    const payload=await response.json();
    const rows=Array.isArray(payload.events)?payload.events:[];
    for(const event of rows){
      const location=coordinates(event,fallbackCenter);
      if(!event?.id||!event?.title||!event?.start_date||!location)continue;
      const venue=event.venue?.venue||event.venue?.address||sourceName;
      out.push({
        id:`${sourceId}:${event.id}`,
        title:strip(event.title),
        category:category(event),
        venue:strip(venue)||sourceName,
        lat:location.lat,
        lng:location.lng,
        start:event.start_date,
        end:event.end_date||null,
        ...cost(event),
        url:event.url||base,
        source:sourceName,
        description:strip(event.description||event.excerpt||""),
        featured:!!event.featured,
        image:event.image?.url||null,
        sourceUrl:event.url||base,
        lastVerified:verified
      });
    }
    if(!rows.length||!payload.next_rest_url)break;
  }
  return out;
}
