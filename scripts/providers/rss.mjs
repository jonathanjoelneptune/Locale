import {classifyEvent} from "../event-classification.mjs";
import {jsonLdEvents} from "./jsonld.mjs";

const decode=value=>String(value||"")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/<[^>]+>/g," ")
  .replace(/&amp;/gi,"&").replace(/&nbsp;/gi," ").replace(/&#39;/g,"'").replace(/&quot;/gi,'"')
  .replace(/\s+/g," ").trim();

const tag=(xml,name)=>{
  const match=xml.match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"));
  return match?decode(match[1]):"";
};

const linkFromBlock=block=>{
  const direct=tag(block,"link");
  if(direct)return direct;
  const atom=block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i);
  return atom?.[1]||tag(block,"guid")||"";
};

async function feedBlocks(endpoint,sourceName){
  const response=await fetch(endpoint,{headers:{"User-Agent":"Locale-events/1.0",Accept:"application/rss+xml, application/atom+xml, application/xml, text/xml"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`${sourceName} RSS ${response.status}`);
  const xml=await response.text();
  const items=[...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match=>match[1]);
  if(items.length)return items;
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(match=>match[1]);
}

export async function rssEvents({endpoint,sourceName,sourceId,fallbackCenter}){
  const items=await feedBlocks(endpoint,sourceName);
  const verified=new Date().toISOString();
  const out=[];
  for(const item of items){
    const title=tag(item,"title");
    const link=linkFromBlock(item);
    const description=tag(item,"description")||tag(item,"summary")||tag(item,"content");
    const start=tag(item,"event:start")||tag(item,"ev:startdate")||tag(item,"dc:date")||tag(item,"pubDate")||tag(item,"published")||tag(item,"updated");
    const venue=tag(item,"event:venue")||tag(item,"venue")||sourceName;
    if(!title||!start)continue;
    const parsed=Date.parse(start);
    if(!Number.isFinite(parsed))continue;
    out.push({
      id:`${sourceId}:${String(link||title).replace(/[^0-9A-Za-z]+/g,"").slice(-90)}:${new Date(parsed).toISOString().slice(0,10)}`,
      title,category:classifyEvent(title,description,venue),venue,
      lat:fallbackCenter.lat,lng:fallbackCenter.lng,locationPrecision:"source-center",
      start:new Date(parsed).toISOString(),end:null,
      price:/\bfree\b/i.test(description)?"Free":null,priceStatus:/\bfree\b/i.test(description)?"free":"unknown",
      url:link||endpoint,source:sourceName,description,featured:false,image:null,
      sourceUrl:link||endpoint,lastVerified:verified
    });
  }
  return out;
}

export async function rssDetailEvents({endpoint,sourceName,sourceId,fallbackCenter,maxLinks=50}){
  const blocks=await feedBlocks(endpoint,sourceName);
  const links=[...new Set(blocks.map(linkFromBlock).filter(Boolean))].slice(0,maxLinks);
  const out=[];
  for(let index=0;index<links.length;index+=5){
    const batch=links.slice(index,index+5);
    const settled=await Promise.allSettled(batch.map(url=>jsonLdEvents({endpoint:url,sourceName,sourceId,fallbackCenter})));
    for(const result of settled)if(result.status==="fulfilled")out.push(...result.value);
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
