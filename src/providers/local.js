import {EventProvider} from "./provider.js";import {normalize} from "../services/events.js";
export class LocalProvider extends EventProvider{
 constructor(){super("Locale bootstrap")}
 async getEvents(){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
   const r=await fetch("./src/data/events.json",{cache:"no-store",signal:controller.signal});
   if(!r.ok)throw new Error("Could not load bootstrap events");
   return (await r.json()).map(normalize);
  }finally{clearTimeout(timer)}
 }
}