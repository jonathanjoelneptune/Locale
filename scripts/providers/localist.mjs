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
  const text=[event.title,event.description_text,event.description,event.event_types,event.filters]
    .flat(Infinity).filter(Boolean).join(" ").toLowerCase();
  if(/concert|music|orchestra|choir|band|dj\b|opera/.test(text))return "music";
  if(/soccer|basketball|baseball|volleyball|water polo|athletic|sports?|game\b|match\b/.test(text))return "sports";
  if(/theat|play\b|dance|performance|film|cinema/.test(text))return "theater";
  if(/festival|fair|celebration|homecoming|expo/.test(text))return "festival";
  if(/food|dining|culinary|coffee|tasting/.test(text))return "food";
  if(/family|children|kids?\b/.test(text))return "family";
  return "community";
}

function price(event){
  const text=[event.cost,event.description_text,event.description].filter(Boolean).join(" ");
  if(/\bfree\b/i.test(text))return {price:"Free",priceStatus:"free"};
  const match=text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return match?{price:"$"+Number(match[1]).toFixed(Number(match[1])%1?2:0),priceStatus:"source-text"}:{price:null,priceStatus:"unknown"};
}

function point(event,fallback){
  const lat=Number(event.geo?.latitude??event.latitude??event.venue?.latitude);
  const lng=Number(event.geo?.longitude??event.longitude??event.venue?.longitude);
  if(Number.isFinite(lat)&&Number.isFinite(lng))return {lat,lng};
  return fallback||null;
}

export async function localistEvents({endpoint,sourceName,sourceId,fallbackCenter,days=45,maxPages=10}){
  if(!endpoint)throw new Error("Localist adapter requires endpoint");
  const base=endpoint.replace(/\/$/,"");
  const out=[];
  const verified=new Date().toISOString();

  for(let page=1;page<=maxPages;page++){
    const url=new URL(base+"/api/2/events");
    url.searchParams.set("days",String(days));
    url.searchParams.set("pp","100");
    url.searchParams.set("page",String(page));
    const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":"Locale-events/1.0"},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error(`${sourceName} Localist ${response.status}`);
    const payload=await response.json();
    const rows=Array.isArray(payload.events)?payload.events:[];
    for(const wrapper of rows){
      const event=wrapper.event||wrapper;
      const location=point(event,fallbackCenter);
      if(!event?.id||!event?.title||!event?.starts_at||!location)continue;
      const cost=price(event);
      const venue=event.location_name||event.room_number||event.address||sourceName;
      out.push({
        id:`${sourceId}:${event.id}`,
        title:strip(event.title),
        category:category(event),
        venue:strip(venue)||sourceName,
        lat:location.lat,
        lng:location.lng,
        start:event.starts_at,
        end:event.ends_at||null,
        ...cost,
        url:event.localist_url||event.url||base,
        source:sourceName,
        description:strip(event.description_text||event.description||""),
        featured:!!event.featured,
        image:event.photo_url||event.photo?.url||null,
        sourceUrl:event.localist_url||event.url||base,
        lastVerified:verified
      });
    }
    const current=Number(payload.page?.current??page);
    const total=Number(payload.page?.total??payload.page?.total_pages??page);
    if(!rows.length||current>=total)break;
  }
  return out;
}
