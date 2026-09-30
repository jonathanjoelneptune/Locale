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