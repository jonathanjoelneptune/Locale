import {classifyEvent} from "../event-classification.mjs";
import {zonedLocalIso} from "../weekly-recurrence.mjs";

const USER_AGENT="Mozilla/5.0 (compatible; LocaleEvents/2.0; +https://jonathanjoelneptune.github.io/Locale/)";
const DEFAULT_PAGES=[
  "https://www.sandiego.gov/public-library/admitone",
  "https://www.sandiego.gov/public-library/steam",
  "https://www.sandiego.gov/public-library/careerprep",
  "https://www.sandiego.gov/public-library/concertseries"
];
const MONTHS={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const MONTH_NAMES=Object.keys(MONTHS).join("|");
const WEEKDAYS="Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";
const DATE_LINE=new RegExp(
  `^(?:(?:${WEEKDAYS})s?,?\\s+)?(${MONTH_NAMES})\\s+(\\d{1,2}),\\s*(20\\d{2})(?:\\s*-\\s*(${MONTH_NAMES})\\s+(\\d{1,2}),\\s*(20\\d{2}))?\\s*\\|\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)?\\s*-\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)$`,
  "i"
);
const decode=value=>String(value||"")
  .replace(/&#(x?[0-9a-f]+);/gi,(_,raw)=>String.fromCodePoint(parseInt(raw[0].toLowerCase()==="x"?raw.slice(1):raw,raw[0].toLowerCase()==="x"?16:10)))
  .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash);/gi,(_,name)=>({nbsp:" ",amp:"&",quot:'"',apos:"'",lt:"<",gt:">",ndash:"–",mdash:"—"}[name.toLowerCase()]))
  .replace(/&[^;]+;/g," ")
  .replace(/\s+/g," ")
  .trim();

const textLines=html=>String(html||"")
  .replace(/<script[\s\S]*?<\/script>/gi," ")
  .replace(/<style[\s\S]*?<\/style>/gi," ")
  .replace(/<(?:br\s*\/?|\/p|\/li|\/div|\/h[1-6]|\/section|\/article)>/gi,"\n")
  .replace(/<[^>]+>/g," ")
  .split(/\n+/)
  .map(decode)
  .filter(Boolean);

const slug=value=>String(value||"event").toLowerCase().normalize("NFKD")
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,72);

function clock(hour,minute,meridiem){
  let h=Number(hour),m=Number(minute||0);
  const ap=String(meridiem||"").toLowerCase().replace(/\./g,"");
  if(ap==="pm"&&h<12)h+=12;
  if(ap==="am"&&h===12)h=0;
  return {hour:h,minute:m};
}

function localIso(year,month,day,time){
  return zonedLocalIso({year:Number(year),month:Number(month),day:Number(day),hour:time.hour,minute:time.minute,timeZone:"America/Los_Angeles"});
}

function likelyTitle(line){
  if(!line||line.length<3||line.length>180)return false;
  if(/^image[: ]|^register here$|^learn more|^october$|^november$|^december$|^september$|^featured/i.test(line))return false;
  if(/\bages?\s+\d|^#|^https?:/i.test(line))return false;
  return !DATE_LINE.test(line);
}
function venueFrom(lines,index){
  for(let offset=1;offset<=5;offset++){
    const line=lines[index+offset];
    if(!line)continue;
    const match=line.match(/^(.+?(?:Library|Central Library|Performance Annex(?:\s*&\s*IDEA Lab)?))(?:\s*\|.*)?$/i);
    if(match)return decode(match[1]);
  }
  return null;
}
function titleFrom(lines,index){
  for(let offset=1;offset<=7;offset++){
    const line=lines[index-offset];
    if(likelyTitle(line))return line;
  }
  return null;
}
function descriptionFrom(lines,index){
  return lines.slice(index+1,index+7)
    .filter(line=>!/^register here$/i.test(line))
    .join(" ")
    .slice(0,900);
}
function recurrenceStarts(match){
  const startMonth=MONTHS[match[1].toLowerCase()];
  const startDay=Number(match[2]),startYear=Number(match[3]);
  const endMonth=match[4]?MONTHS[match[4].toLowerCase()]:null;
  const endDay=match[5]?Number(match[5]):null,endYear=match[6]?Number(match[6]):null;
  const endMeridiem=match[12],startMeridiem=match[9]||endMeridiem;
  const startClock=clock(match[7],match[8],startMeridiem);
  const starts=[localIso(startYear,startMonth,startDay,startClock)];
  if(!endMonth||!endDay||!endYear)return starts;

  const endDate=Date.UTC(endYear,endMonth-1,endDay,23,59,59);
  let cursor=Date.UTC(startYear,startMonth-1,startDay)+7*86400000;
  while(cursor<=endDate&&starts.length<12){
    const date=new Date(cursor);
    starts.push(localIso(date.getUTCFullYear(),date.getUTCMonth()+1,date.getUTCDate(),startClock));
    cursor+=7*86400000;
  }
  return starts;
}

export function parseSdplProgramPage(html,{url="https://www.sandiego.gov/public-library",now=Date.now(),days=45}={}){
  const lines=textLines(html),out=[];
  const horizon=Number(now)+days*86400000;
  for(let index=0;index<lines.length;index++){
    const match=lines[index].match(DATE_LINE);
    if(!match)continue;
    const title=titleFrom(lines,index);
    const venue=venueFrom(lines,index);
    if(!title||!venue)continue;
    const starts=recurrenceStarts(match);
    const endMeridiem=match[11];
    const endClock=clock(match[10],match[11]?match[10]&&match[10].includes(":")?undefined:match[10]:match[10],endMeridiem);
    const description=descriptionFrom(lines,index);
    for(const start of starts){
      const time=Date.parse(start);
      if(!Number.isFinite(time)||time<Number(now)-86400000||time>horizon)continue;
      const date=new Date(start);
      let end=null;
      if(endMeridiem){
        const ending=clock(match[10],match[11],endMeridiem);
        const parts=Object.fromEntries(
          new Intl.DateTimeFormat("en-US",{
            timeZone:"America/Los_Angeles",year:"numeric",month:"numeric",day:"numeric"
          }).formatToParts(date).filter(part=>part.type!=="literal").map(part=>[part.type,Number(part.value)])
        );
        end=zonedLocalIso({
          year:parts.year,month:parts.month,day:parts.day,
          hour:ending.hour,minute:ending.minute,timeZone:"America/Los_Angeles"
        });
      }
      const branch=venue.replace(/\s*-\s*(?:Teen Center|Community Room.*|IDEA Lab.*)$/i,"").trim();
      out.push({
        id:`sdpl:${slug(title)}:${slug(branch)}:${start}`,
        title,
        category:classifyEvent(title,description,"library"),
        subcategories:["library-program"],
        tags:["library","community"],
        venue,
        address:null,
        geocodeQuery:`${branch}, San Diego, CA`,
        lat:32.7157,lng:-117.1611,locationPrecision:"source-center",
        start,end,timeStatus:"known",timeZone:"America/Los_Angeles",
        price:/\bfree\b/i.test(description)?"Free":null,
        priceStatus:/\bfree\b/i.test(description)?"free":"unknown",
        url,source:"San Diego Public Library",description,featured:false,image:null,sourceUrl:url,lastVerified:new Date(Number(now)).toISOString()
      });
    }
  }
  return [...new Map(out.map(event=>[`${event.title}|${event.start}|${event.venue}`,event])).values()];
}

export async function sdplEvents({days=45,endpoints=DEFAULT_PAGES}={}){
  const settled=await Promise.allSettled(endpoints.map(async endpoint=>{
    const response=await fetch(endpoint,{
      headers:{"User-Agent":USER_AGENT,Accept:"text/html,application/xhtml+xml","Accept-Language":"en-US,en;q=0.9"},
      signal:AbortSignal.timeout(12000)
    });
    if(!response.ok)throw new Error(`SDPL program page ${response.status}: ${endpoint}`);
    return parseSdplProgramPage(await response.text(),{url:endpoint,days});
  }));
  const events=settled.flatMap(result=>result.status==="fulfilled"?result.value:[]);
  if(!events.length){
    const failures=settled.filter(result=>result.status==="rejected").map(result=>String(result.reason?.message||result.reason));
    throw new Error(`SDPL public program pages returned no events${failures.length?": "+failures.join(" | "):""}`);
  }
  return [...new Map(events.map(event=>[`${event.title}|${event.start}|${event.venue}`,event])).values()];
}
