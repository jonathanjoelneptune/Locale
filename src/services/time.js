export function inWindow(event,windowName,now=new Date(),timeZone=null){
 const start=new Date(event.start),end=event.end?new Date(event.end):start;
 const dayStart=d=>{const key=dateKeyInZone(d,timeZone);return localDateFromKey(key)};
 const add=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
 const today=dayStart(now);
 if(event.timeStatus==="unknown"&&(windowName==="now"||windowName==="tonight"))return false;
 if(windowName==="now")return start<=now&&end>=now;
 if(windowName==="today")return start<add(today,1)&&end>=today;
 if(windowName==="tonight"){const s=new Date(today);s.setHours(17);return start<add(today,1)&&end>=s}
 if(windowName==="tomorrow"){const s=add(today,1);return start<add(today,2)&&end>=s}
 if(windowName==="weekend"){const dow=today.getDay(),untilSat=(6-dow+7)%7,s=add(today,untilSat);return start<add(s,2)&&end>=s}
 if(windowName==="7days")return start<add(today,7)&&end>=today;
 if(windowName==="30days")return start<add(today,30)&&end>=today;
 return true;
}

export function dateKeyInZone(date,timeZone){
  if(!timeZone)return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
  return new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(date).replace(/(\d{2})\/(\d{2})\/(\d{4})/,"$3-$1-$2");
}

function localDateFromKey(key){
  const [year,month,day]=String(key||"").split("-").map(Number);
  return new Date(year,month-1,day);
}

export function inDateRange(event,startKey,endKey,timeZone=null){
  if(timeZone){
    if(!startKey||!endKey)return true;
    const eventStart=dateKeyInZone(new Date(event.start),timeZone);
    const eventEnd=dateKeyInZone(new Date(event.end||event.start),timeZone);
    return eventStart<=endKey&&eventEnd>=startKey;
  }
  if(!startKey||!endKey)return true;
  const startBoundary=localDateFromKey(startKey);
  const endBoundary=localDateFromKey(endKey);
  endBoundary.setDate(endBoundary.getDate()+1);
  const eventStart=new Date(event.start);
  const eventEnd=event.end?new Date(event.end):eventStart;
  return eventStart<endBoundary&&eventEnd>=startBoundary;
}
