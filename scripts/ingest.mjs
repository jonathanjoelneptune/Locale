import {writeFile,mkdir} from "node:fs/promises";
import {ticketmasterEvents} from "./providers/ticketmaster.mjs";

const providers=[
  ["ticketmaster",()=>ticketmasterEvents({apiKey:process.env.TICKETMASTER_API_KEY})]
];
const results=await Promise.allSettled(providers.map(([,run])=>run()));
const events=[];
results.forEach((r,i)=>{
  const name=providers[i][0];
  if(r.status==="fulfilled"){events.push(...r.value);console.log(`${name}: ${r.value.length} events`)}
  else console.error(`${name} failed:`,r.reason);
});
if(!events.length){
  if(!process.env.TICKETMASTER_API_KEY) console.log("No provider credentials configured; leaving current event file unchanged.");
  else console.log("Providers returned no events; leaving current event file unchanged.");
  process.exit(0);
}
const unique=new Map();
for(const e of events){
  const key=`${e.title}|${e.venue}|${String(e.start).slice(0,10)}`.toLowerCase();
  if(!unique.has(key)) unique.set(key,e);
}
const sorted=[...unique.values()].sort((a,b)=>new Date(a.start)-new Date(b.start));
await mkdir("src/data",{recursive:true});
await writeFile("src/data/events.json",JSON.stringify(sorted,null,2)+"\n");
console.log(`Wrote ${sorted.length} normalized events.`);
