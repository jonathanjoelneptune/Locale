export function inWindow(event,windowName,now=new Date()){
 const start=new Date(event.start),end=event.end?new Date(event.end):start;
 const dayStart=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
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

function localDateFromKey(key){
  const [year,month,day]=String(key||"").split("-").map(Number);
  return new Date(year,month-1,day);
}

export function inDateRange(event,startKey,endKey){
  if(!startKey||!endKey)return true;
  // Source calendars sometimes supply a confirmed date without a performance time.
  // Date-only values represent that calendar day, not UTC midnight (the prior day in Vegas).
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(event.start||""))){
    const endKeyOfEvent=String(event.end||event.start).slice(0,10);
    return event.start<=endKey&&endKeyOfEvent>=startKey;
  }
  const startBoundary=localDateFromKey(startKey);
  const endBoundary=localDateFromKey(endKey);
  endBoundary.setDate(endBoundary.getDate()+1);
  const eventStart=new Date(event.start);
  const eventEnd=event.end?new Date(event.end):eventStart;
  return eventStart<endBoundary&&eventEnd>=startBoundary;
}
