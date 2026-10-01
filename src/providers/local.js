import {EventProvider} from "./provider.js";
import {normalize} from "../services/events.js";

const BUNDLED_EVENTS="./src/data/events.json";
const LIVE_EVENTS="https://raw.githubusercontent.com/jonathanjoelneptune/Locale/main/src/data/events.json";

async function fetchEvents(url,timeoutMs){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const separator=url.includes("?")?"&":"?";
    const cacheBust=url.startsWith("https://raw.githubusercontent.com/")
      ?separator+"locale="+Math.floor(Date.now()/300000)
      :"";
    const response=await fetch(url+cacheBust,{cache:"no-store",signal:controller.signal});
    if(!response.ok)throw new Error(`Event snapshot ${response.status} from ${url}`);
    const payload=await response.json();
    if(!Array.isArray(payload))throw new Error(`Event snapshot from ${url} is not an array`);
    return payload;
  }finally{
    clearTimeout(timer);
  }
}

export class LocalProvider extends EventProvider{
  constructor(){super({id:"locale-bootstrap",name:"Locale bootstrap",kind:"snapshot"})}

  async getEvents(){
    const production=location.hostname==="jonathanjoelneptune.github.io";
    const sources=production
      ?[[LIVE_EVENTS,2500],[BUNDLED_EVENTS,4000]]
      :[[BUNDLED_EVENTS,4000]];

    let lastError;
    for(const [url,timeout] of sources){
      try{
        return (await fetchEvents(url,timeout)).map(normalize);
      }catch(error){
        lastError=error;
        console.warn("Locale event snapshot fallback:",error);
      }
    }
    throw lastError||new Error("Could not load Locale events");
  }
}
