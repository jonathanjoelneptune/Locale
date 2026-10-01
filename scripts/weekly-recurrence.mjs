const DAY_INDEX={sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6};

const formatterFor=timeZone=>new Intl.DateTimeFormat("en-US",{
  timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
});

const partsObject=(date,timeZone)=>Object.fromEntries(
  formatterFor(timeZone).formatToParts(date).filter(part=>part.type!=="literal").map(part=>[part.type,part.value])
);

export function zonedLocalIso({year,month,day,hour=0,minute=0,timeZone="America/Los_Angeles"}){
  const desired=Date.UTC(year,month-1,day,hour,minute,0);
  let guess=desired;
  for(let iteration=0;iteration<3;iteration++){
    const parts=partsObject(new Date(guess),timeZone);
    const represented=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
    const delta=desired-represented;
    guess+=delta;
    if(Math.abs(delta)<1000)break;
  }
  return new Date(guess).toISOString();
}

export function parseClock(value){
  const text=String(value||"").trim();
  const match=text.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if(!match)return null;
  let hour=Number(match[1]),minute=Number(match[2]||0);
  const ap=match[3].toUpperCase();
  if(ap==="PM"&&hour<12)hour+=12;
  if(ap==="AM"&&hour===12)hour=0;
  return {hour,minute};
}

export function weeklyOccurrences({day,time,days=45,timeZone="America/Los_Angeles",now=new Date()}){
  const dayIndex=typeof day==="number"?day:DAY_INDEX[String(day||"").toLowerCase()];
  const clock=typeof time==="string"?parseClock(time):time;
  if(!Number.isInteger(dayIndex)||!clock)return [];
  const local=partsObject(now,timeZone);
  const base=new Date(Date.UTC(Number(local.year),Number(local.month)-1,Number(local.day)));
  const out=[];
  for(let offset=0;offset<=days;offset++){
    const candidate=new Date(base.getTime()+offset*86400000);
    if(candidate.getUTCDay()!==dayIndex)continue;
    const iso=zonedLocalIso({
      year:candidate.getUTCFullYear(),
      month:candidate.getUTCMonth()+1,
      day:candidate.getUTCDate(),
      hour:clock.hour,
      minute:clock.minute,
      timeZone
    });
    if(new Date(iso)<now)continue;
    out.push(iso);
  }
  return out;
}

export const WEEKDAY_NAMES=Object.keys(DAY_INDEX);
