import {LocalProvider} from "./local.js";
import {validateProviderEvents} from "./provider.js";
import {dedupe} from "../services/events.js";

const providers=[new LocalProvider()];

export async function loadEvents(regionId=null){
  const settled=await Promise.allSettled(providers.map(async provider=>{
    const events=await provider.getEvents(regionId);
    return validateProviderEvents(provider,events);
  }));
  const events=[];
  settled.forEach((result,index)=>{
    if(result.status==="fulfilled")events.push(...result.value);
    else console.error(`Event provider ${providers[index].id} failed:`,result.reason);
  });
  return dedupe(regionId?events.filter(event=>event.regionId===regionId):events);
}
