import {jsonLdEvents} from "./jsonld.mjs";

const BASE="https://www.sandiegoreader.com";
const pad=value=>String(value).padStart(2,"0");
const MONTHS=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

async function fetchHtml(url){
  const response=await fetch(url,{
    headers:{"User-Agent":"Locale-events/1.0","Accept":"text/html"},
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error(`San Diego Reader calendar ${response.status} ${url}`);
  return response.text();
}

function dailyUrl(date){
  return `${BASE}/events/${date.getUTCFullYear()}/${MONTHS[date.getUTCMonth()]}/${pad(date.getUTCDate())}/`;
}

function detailLinks(html){
  const links=[];
  for(const match of String(html||"").matchAll(/href=["'](\/events\/20\d{2}\/[a-z]{3}\/\d{2}\/[^"'?#/]+\/?(?:\?[^"']*)?)["']/gi)){
    const url=new URL(match[1],BASE);
    url.search="";
    links.push(url.href);
  }
  return [...new Set(links)];
}

export async function sanDiegoReaderCalendarEvents({days=14,maxLinks=260,fallbackCenter={lat:32.7157,lng:-117.1611}}={}){
  const today=new Date();
  const pages=[];
  for(let offset=0;offset<days;offset++){
    const date=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()+offset));
    pages.push(dailyUrl(date));
  }

  const discovered=[];
  for(let index=0;index<pages.length;index+=5){
    const batch=pages.slice(index,index+5);
    const settled=await Promise.allSettled(batch.map(async url=>detailLinks(await fetchHtml(url))));
    for(const result of settled)if(result.status==="fulfilled")discovered.push(...result.value);
  }

  const links=[...new Set(discovered)].slice(0,maxLinks);
  const out=[];
  for(let index=0;index<links.length;index+=8){
    const batch=links.slice(index,index+8);
    const settled=await Promise.allSettled(batch.map(url=>jsonLdEvents({
      endpoint:url,
      sourceName:"San Diego Reader",
      sourceId:"sandiego-reader",
      fallbackCenter
    })));
    for(const result of settled)if(result.status==="fulfilled")out.push(...result.value);
  }

  return [...new Map(out.map(event=>[event.id,event])).values()];
}
