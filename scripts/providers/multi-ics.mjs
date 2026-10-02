import {icsEvents} from "./ics.mjs";

export async function multiIcsEvents({
  endpoints=[],
  sourceName,
  sourceId,
  fallbackCenter,
  days=45
}={}){
  if(!Array.isArray(endpoints)||!endpoints.length)throw new Error("multi-ics requires at least one endpoint");
  const settled=await Promise.allSettled(endpoints.map((endpoint,index)=>icsEvents({
    endpoint,
    sourceName,
    sourceId:`${sourceId}:${index+1}`,
    fallbackCenter,
    days
  })));
  const out=[];
  const failures=[];
  for(const [index,result] of settled.entries()){
    if(result.status==="fulfilled")out.push(...result.value);
    else failures.push(`${endpoints[index]}: ${result.reason?.message||result.reason}`);
  }
  if(!out.length&&failures.length)throw new Error(`${sourceName} multi-ICS failed: ${failures.join(" | ")}`);
  return [...new Map(out.map(event=>[`${event.title}|${event.start}|${event.venue}`,{
    ...event,
    id:`${sourceId}:${String(event.id).split(":").slice(2).join(":")||event.id}`
  }])).values()];
}
