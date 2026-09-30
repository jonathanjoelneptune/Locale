import {jsonLdEvents} from "./jsonld.mjs";

export async function jsonLdCrawlEvents({endpoint,sourceName,sourceId,fallbackCenter,linkPattern="/event/",maxLinks=40}){
  const response=await fetch(endpoint,{headers:{"User-Agent":"Mozilla/5.0 Locale-events/1.0",Accept:"text/html"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`${sourceName} listing ${response.status}`);
  const html=await response.text();
  const links=[];
  for(const match of html.matchAll(/href=["']([^"'#]+)["']/gi)){
    try{
      const url=new URL(match[1],endpoint);
      if(!url.pathname.includes(linkPattern))continue;
      const value=url.href;
      if(!links.includes(value))links.push(value);
      if(links.length>=maxLinks)break;
    }catch{}
  }
  const out=[];
  for(let index=0;index<links.length;index+=5){
    const batch=links.slice(index,index+5);
    const settled=await Promise.allSettled(batch.map(url=>jsonLdEvents({endpoint:url,sourceName,sourceId,fallbackCenter})));
    for(const result of settled)if(result.status==="fulfilled")out.push(...result.value);
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
