import {jsonLdEvents} from "./jsonld.mjs";
import {embeddedJsonEvents} from "./embedded-json.mjs";

const USER_AGENT="Mozilla/5.0 (compatible; LocaleEvents/1.2; +https://jonathanjoelneptune.github.io/Locale/)";
const EVENT_PATH=/\b(event|events|calendar|whats-on|whatson|happenings|live-music|music|shows?|schedule|entertainment|trivia|karaoke|bingo|open-mic|openmic|specials?|lineup|tickets?|event-details?|experience)\b/i;
const TRUSTED_EXTERNAL=[
  "eventbrite.com","www.eventbrite.com",
  "dice.fm","www.dice.fm",
  "ticketweb.com","www.ticketweb.com",
  "seetickets.us","www.seetickets.us",
  "bandsintown.com","www.bandsintown.com",
  "ticketleap.events","www.ticketleap.events",
  "tockhq.com","www.exploretock.com","exploretock.com",
  "tickettailor.com","www.tickettailor.com",
  "tixr.com","www.tixr.com",
  "axs.com","www.axs.com",
  "simpletix.com","www.simpletix.com",
  "humanitix.com","events.humanitix.com",
  "universe.com","www.universe.com",
  "posh.vip","www.posh.vip",
  "shotgun.live","www.shotgun.live",
  "feverup.com","m.feverup.com"
];

const futureEvents=events=>{
  const now=Date.now()-86400000,horizon=Date.now()+75*86400000;
  return (events||[]).filter(event=>{
    const time=Date.parse(event?.start);
    return Number.isFinite(time)&&time>=now&&time<=horizon;
  });
};

async function fetchHtml(url){
  const response=await fetch(url,{
    headers:{"User-Agent":USER_AGENT,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},
    redirect:"follow",
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok)throw new Error(`calendar links ${response.status} ${url}`);
  return {html:await response.text(),url:response.url||url};
}

const trustedExternal=url=>TRUSTED_EXTERNAL.some(host=>url.hostname===host||url.hostname.endsWith("."+host));

export function extractCalendarEventLinks(html,base,{maxLinks=40}={}){
  let origin;
  try{origin=new URL(base).origin}catch{return []}
  const rows=[];
  for(const match of String(html||"").matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    try{
      const url=new URL(match[1],base);
      if(!["http:","https:"].includes(url.protocol))continue;
      const label=String(match[2]||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
      const local=url.origin===origin;
      if(!local&&!trustedExternal(url))continue;
      const text=`${url.pathname} ${url.search} ${label}`;
      if(!EVENT_PATH.test(text))continue;
      url.hash="";
      const score=
        /calendar|events|whats-on|happenings/i.test(text)?5:
        /live-music|shows?|lineup|schedule/i.test(text)?4:
        /trivia|karaoke|bingo|open.?mic/i.test(text)?4:
        /tickets?|event-details?|experience/i.test(text)?3:1;
      rows.push({href:url.href,score,local});
    }catch{}
  }
  return [...new Map(rows.map(row=>[row.href,row])).values()]
    .sort((a,b)=>b.score-a.score||Number(b.local)-Number(a.local)||a.href.length-b.href.length)
    .slice(0,maxLinks)
    .map(row=>row.href);
}

async function eventsFromPage({url,sourceName,sourceId,fallbackCenter}){
  const out=[];
  try{out.push(...await jsonLdEvents({endpoint:url,sourceName,sourceId,fallbackCenter}))}catch{}
  try{out.push(...await embeddedJsonEvents({endpoint:url,sourceName,sourceId,fallbackCenter,days:60}))}catch{}
  return futureEvents([...new Map(out.map(event=>[event.id,event])).values()]);
}

export async function calendarLinksEvents({endpoint,sourceName,sourceId,fallbackCenter,maxLinks=30}){
  const root=await fetchHtml(endpoint);
  const direct=await eventsFromPage({url:root.url,sourceName,sourceId,fallbackCenter});
  const links=extractCalendarEventLinks(root.html,root.url,{maxLinks});
  const out=[...direct];

  for(let index=0;index<links.length;index+=5){
    const batch=links.slice(index,index+5);
    const settled=await Promise.allSettled(batch.map(url=>eventsFromPage({url,sourceName,sourceId,fallbackCenter})));
    for(const result of settled)if(result.status==="fulfilled")out.push(...result.value);
  }
  return [...new Map(out.map(event=>[`${event.title}|${event.start}|${event.venue}`,event])).values()];
}
