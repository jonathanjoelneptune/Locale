import {createHash} from "node:crypto";
import {tribeEvents} from "./providers/tribe.mjs";
import {jsonLdEvents} from "./providers/jsonld.mjs";
import {jsonLdCrawlEvents} from "./providers/jsonld-crawl.mjs";
import {embeddedJsonEvents} from "./providers/embedded-json.mjs";
import {icsEvents} from "./providers/ics.mjs";
import {calendarLinksEvents} from "./providers/calendar-links.mjs";
import {probeLane} from "./discovery-priority.mjs";

const USER_AGENT="Mozilla/5.0 (compatible; LocaleDiscovery/1.2; +https://jonathanjoelneptune.github.io/Locale/)";
const EVENT_PATH=/\b(event|events|calendar|whats-on|whatson|happenings|live-music|music|shows?|schedule|entertainment|trivia|karaoke|bingo|open-mic|openmic|specials?|lineup|tickets?|event-details?|experience)\b/i;

const esc=value=>String(value||"").replace(/\s+/g," ").trim();
const stableHash=value=>createHash("sha1").update(String(value)).digest("hex").slice(0,12);

const sourceIdFor=(candidate,adapter,endpoint)=>
  `discovered-${candidate.regionId}-${stableHash(`${candidate.key}|${adapter}|${endpoint}`)}`;

const futureEvents=events=>{
  const now=Date.now()-86400000;
  const horizon=Date.now()+75*86400000;
  return (events||[]).filter(event=>{
    const time=Date.parse(event?.start);
    return Number.isFinite(time)&&time>=now&&time<=horizon;
  });
};

async function fetchHtml(url){
  const response=await fetch(url,{
    headers:{
      "User-Agent":USER_AGENT,
      Accept:"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":"en-US,en;q=0.9",
      "Cache-Control":"no-cache"
    },
    redirect:"follow",
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw Object.assign(new Error(`HTTP ${response.status}`),{status:response.status});
  return {html:await response.text(),url:response.url||url};
}

export function discoveryWebsiteAlternates(value){
  let url;
  try{url=new URL(value)}catch{return []}
  const out=[url.href];
  if(url.pathname!=="/"||url.search){
    const root=new URL(url.origin+"/");
    out.push(root.href);
  }
  const toggled=new URL(url.href);
  if(toggled.hostname.startsWith("www."))toggled.hostname=toggled.hostname.slice(4);
  else toggled.hostname="www."+toggled.hostname;
  out.push(toggled.href);
  if(toggled.pathname!=="/"||toggled.search)out.push(new URL(toggled.origin+"/").href);
  return [...new Set(out)];
}

async function fetchCandidateRoot(candidate){
  let lastError;
  for(const url of discoveryWebsiteAlternates(candidate.website)){
    try{return await fetchHtml(url)}
    catch(error){
      lastError=error;
      if(error?.status===429)break;
    }
  }
  throw lastError||new Error("website fetch failed");
}

export function discoveryCommonEventPages(base,candidate){
  let origin;
  try{origin=new URL(base).origin}catch{return []}
  const lane=probeLane(candidate);
  if(!["event-likely","event-evidence","food-evidence"].includes(lane))return [];
  const category=String(candidate.category||"");
  const paths=["/events/","/calendar/"];
  if(/music|bar|pub|brew|nightclub|theat|arts|venue/i.test(category))paths.push("/live-music/","/shows/");
  return paths.map(path=>new URL(path,origin).href);
}

export function discoveryEventLinks(html,base){
  let origin;
  try{origin=new URL(base).origin}catch{return []}
  const scored=[];
  for(const match of String(html||"").matchAll(/href=["']([^"'#]+)["']/gi)){
    try{
      const url=new URL(match[1],base);
      if(url.origin!==origin||!["http:","https:"].includes(url.protocol))continue;
      if(!EVENT_PATH.test(url.pathname+" "+url.search))continue;
      url.hash="";
      const href=url.href;
      const score=/calendar|events|whats-on|happenings/i.test(url.pathname)?4:
        /live-music|music|shows|schedule|entertainment|trivia|karaoke/i.test(url.pathname)?3:1;
      scored.push({href,score});
    }catch{}
  }
  return [...new Map(scored.map(item=>[item.href,item])).values()]
    .sort((a,b)=>b.score-a.score||a.href.length-b.href.length)
    .map(item=>item.href)
    .slice(0,6);
}

export function discoveryIcsLinks(html,base){
  const out=[];
  for(const match of String(html||"").matchAll(/href=["']([^"']+(?:\.ics(?:\?[^"']*)?|ical[^"']*|calendar[^"']*\.ics[^"']*))["']/gi)){
    try{
      const url=new URL(match[1],base);
      if(["http:","https:"].includes(url.protocol))out.push(url.href);
    }catch{}
  }
  return [...new Set(out)].slice(0,4);
}

const fallbackCenter=candidate=>({lat:Number(candidate.lat),lng:Number(candidate.lng)});

function buildSource(candidate,{adapter,endpoint,eventCount,linkPattern=null}){
  const source={
    id:sourceIdFor(candidate,adapter,endpoint),
    name:candidate.name,
    scope:"local",
    regions:[candidate.regionId],
    adapter,
    sourceKind:"discovered",
    ownerEntityKind:"place",
    ownerName:candidate.name,
    endpoint,
    fallbackCenter:fallbackCenter(candidate),
    refreshHours:12,
    minExpectedEvents:1,
    discoveredBy:candidate.discoveryMethod||"queue",
    discoveryCandidateKey:candidate.key,
    discoveredAt:new Date().toISOString(),
    discoveryEventCount:eventCount,
    enabled:true
  };
  if(linkPattern)source.linkPattern=linkPattern;
  return source;
}

async function tryProvider(run,minEvents=1){
  try{
    const events=futureEvents(await run());
    return events.length>=minEvents?events:null;
  }catch{return null}
}

export function discoveryMinimumEvents(candidate){
  return ["event-likely","event-evidence","food-evidence"].includes(probeLane(candidate))?1:2;
}

export async function qualifyDiscoveryCandidate(candidate){
  if(!candidate?.website)return {qualified:false,reason:"no-website"};
  let root;
  try{root=await fetchCandidateRoot(candidate)}
  catch(error){return {qualified:false,reason:"website-fetch-failed",detail:error.message,statusCode:error?.status||null}};

  const baseUrl=root.url;
  let origin;
  try{origin=new URL(baseUrl).origin}catch{return {qualified:false,reason:"invalid-website"}}
  const fallback=fallbackCenter(candidate);

  const tribe=await tryProvider(()=>tribeEvents({
    endpoint:origin,sourceName:candidate.name,sourceId:"probe",fallbackCenter:fallback,days:60,maxPages:2
  }),1);
  if(tribe)return {
    qualified:true,
    source:buildSource(candidate,{adapter:"tribe",endpoint:origin,eventCount:tribe.length}),
    evidence:{kind:"tribe",eventCount:tribe.length,url:origin}
  };

  const lane=probeLane(candidate);
  const structuredMin=discoveryMinimumEvents(candidate);
  const linkedPages=discoveryEventLinks(root.html,baseUrl);
  const commonPages=linkedPages.length>=2?[]:discoveryCommonEventPages(baseUrl,candidate).slice(0,2);
  const pages=[baseUrl,...linkedPages,...commonPages];
  const seen=new Set;
  for(const page of pages){
    if(seen.has(page))continue;
    seen.add(page);
    let fetched=page===baseUrl?root:null;
    if(!fetched){
      try{fetched=await fetchHtml(page)}catch{continue}
    }

    for(const ics of discoveryIcsLinks(fetched.html,fetched.url)){
      const events=await tryProvider(()=>icsEvents({
        endpoint:ics,sourceName:candidate.name,sourceId:"probe",fallbackCenter:fallback,days:60
      }),1);
      if(events)return {
        qualified:true,
        source:buildSource(candidate,{adapter:"ics",endpoint:ics,eventCount:events.length}),
        evidence:{kind:"ics",eventCount:events.length,url:ics}
      };
    }

    const jsonld=await tryProvider(()=>jsonLdEvents({
      endpoint:fetched.url,sourceName:candidate.name,sourceId:"probe",fallbackCenter:fallback
    }),structuredMin);
    if(jsonld)return {
      qualified:true,
      source:buildSource(candidate,{adapter:"jsonld",endpoint:fetched.url,eventCount:jsonld.length}),
      evidence:{kind:"jsonld",eventCount:jsonld.length,url:fetched.url}
    };

    const embedded=await tryProvider(()=>embeddedJsonEvents({
      endpoint:fetched.url,sourceName:candidate.name,sourceId:"probe",fallbackCenter:fallback,days:60
    }),2);
    if(embedded)return {
      qualified:true,
      source:buildSource(candidate,{adapter:"embedded-json",endpoint:fetched.url,eventCount:embedded.length}),
      evidence:{kind:"embedded-json",eventCount:embedded.length,url:fetched.url}
    };

    if(EVENT_PATH.test(new URL(fetched.url).pathname)){
      for(const linkPattern of ["/event/","/events/"]){
        const crawled=await tryProvider(()=>jsonLdCrawlEvents({
          endpoint:fetched.url,sourceName:candidate.name,sourceId:"probe",
          fallbackCenter:fallback,linkPattern,maxLinks:15
        }),structuredMin);
        if(crawled)return {
          qualified:true,
          source:buildSource(candidate,{adapter:"jsonld-crawl",endpoint:fetched.url,eventCount:crawled.length,linkPattern}),
          evidence:{kind:"jsonld-crawl",eventCount:crawled.length,url:fetched.url,linkPattern}
        };
      }
    }
  }

  const linked=await tryProvider(()=>calendarLinksEvents({
    endpoint:baseUrl,
    sourceName:candidate.name,
    sourceId:"probe",
    fallbackCenter:fallback,
    maxLinks:24
  }),structuredMin);
  if(linked)return {
    qualified:true,
    source:buildSource(candidate,{adapter:"calendar-links",endpoint:baseUrl,eventCount:linked.length}),
    evidence:{kind:"calendar-links",eventCount:linked.length,url:baseUrl}
  };

  return {
    qualified:false,
    reason:"no-supported-calendar",
    detail:`Checked ${seen.size} page${seen.size===1?"":"s"} on ${esc(candidate.name)} (${lane})`
  };
}
