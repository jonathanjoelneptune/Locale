import {classifyEvent} from "../event-classification.mjs";

const decode=value=>String(value||"")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/<[^>]+>/g," ")
  .replace(/&amp;/gi,"&").replace(/&nbsp;/gi," ").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();

const tag=(xml,name)=>{
  const match=xml.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"));
  return match?decode(match[1]):"";
};

export async function rssEvents({endpoint,sourceName,sourceId,fallbackCenter}){
  const response=await fetch(endpoint,{headers:{"User-Agent":"Locale-events/1.0",Accept:"application/rss+xml, application/xml, text/xml"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`${sourceName} RSS ${response.status}`);
  const xml=await response.text();
  const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match=>match[1]);
  const verified=new Date().toISOString();
  const out=[];
  for(const item of items){
    const title=tag(item,"title");
    const link=tag(item,"link")||tag(item,"guid");
    const description=tag(item,"description");
    const start=tag(item,"event:start")||tag(item,"ev:startdate")||tag(item,"dc:date")||tag(item,"pubDate");
    const venue=tag(item,"event:venue")||tag(item,"venue")||sourceName;
    if(!title||!start)continue;
    const parsed=Date.parse(start);
    if(!Number.isFinite(parsed))continue;
    out.push({
      id:`${sourceId}:${String(link||title).replace(/[^0-9A-Za-z]+/g,"").slice(-90)}:${new Date(parsed).toISOString().slice(0,10)}`,
      title,
      category:classifyEvent(title,description,venue),
      venue,
      lat:fallbackCenter.lat,lng:fallbackCenter.lng,locationPrecision:"source-center",
      start:new Date(parsed).toISOString(),end:null,
      price:/\bfree\b/i.test(description)?"Free":null,
      priceStatus:/\bfree\b/i.test(description)?"free":"unknown",
      url:link||endpoint,source:sourceName,description,featured:false,image:null,
      sourceUrl:link||endpoint,lastVerified:verified
    });
  }
  return out;
}
