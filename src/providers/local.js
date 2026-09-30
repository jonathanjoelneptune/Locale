import {EventProvider} from "./provider.js";
import {normalize} from "../services/events.js";

export class LocalProvider extends EventProvider{
  constructor(){super({id:"locale-bootstrap",name:"Locale bootstrap",kind:"snapshot"})}

  async getEvents(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch("./src/data/events.json",{cache:"no-store",signal:controller.signal});
      if(!response.ok)throw new Error(`Could not load bootstrap events (${response.status})`);
      const payload=await response.json();
      if(!Array.isArray(payload))throw new Error("Bootstrap event payload is not an array");
      return payload.map(normalize);
    }finally{
      clearTimeout(timer);
    }
  }
}
