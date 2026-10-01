import {classifyEvent} from "../event-classification.mjs";
const unfold=text=>text.replace(/\r?\n[ \t]/g,"");
const unescape=value=>String(value||"").replace(/\\n/gi," ").replace(/\\,/g,",").replace(/\\;/g,";").replace(/\\\\/g,"\\").trim();
const value=(block,name)=>{
  const match=block.match(new RegExp("^"+name+"(?:;[^:]*)?:(.*)$","mi"));
  return match?unescape(match[1]):"";
};
function parseDate(raw){
  if(!raw)return null;
  const compact=raw.replace(/Z$/,"");
  const m=compact.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
  if(!m)return null;
  const iso=`${m[1]}-${m[2]}-${m[3]}T${m[4]||"12"}:${m[5]||"00"}:${m[6]||"00"}-07:00`;
  const d=new Date(iso); return Number.isNaN(+d)?null:d.toISOString();
}
export async function icsEvents({endpoint,sourceName,sourceId,fallbackCenter,days=45}){
  const response=await fetch(endpoint,{headers:{"User-Agent":"Locale-events/1.0",Accept:"text/calendar"},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`${sourceName} ICS ${response.status}`);
  const text=unfold(await response.text()),now=Date.now(),horizon=now+days*86400000,verified=new Date().toISOString(),out=[];
  for(const match of text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)){
    const block=match[1],title=value(block,"SUMMARY"),start=parseDate(value(block,"DTSTART"));
    if(!title||!start||Date.parse(start)<now-86400000||Date.parse(start)>horizon)continue;
    const venue=value(block,"LOCATION")||sourceName,description=value(block,"DESCRIPTION"),url=value(block,"URL")||endpoint;
    out.push({
      id:`${sourceId}:${value(block,"UID")||title.replace(/[^a-z0-9]+/gi,"-")}:${start}`,
      title,category:classifyEvent(title,description,venue),venue,
      lat:fallbackCenter.lat,lng:fallbackCenter.lng,locationPrecision:"source-center",
      start,end:parseDate(value(block,"DTEND")),price:/\bfree\b/i.test(description)?"Free":null,priceStatus:/\bfree\b/i.test(description)?"free":"unknown",
      url,source:sourceName,description,featured:false,image:null,sourceUrl:url,lastVerified:verified
    });
  }
  return [...new Map(out.map(event=>[event.id,event])).values()];
}
