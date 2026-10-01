const DAY_NAMES=["S","M","T","W","T","F","S"];
const monthFormatter=new Intl.DateTimeFormat("en-US",{month:"long",year:"numeric"});
const shortFormatter=new Intl.DateTimeFormat("en-US",{weekday:"short",month:"short",day:"numeric"});

function parseKey(key){
  const [year,month,day]=String(key||"").split("-").map(Number);
  return new Date(year,month-1,day);
}
function keyFor(date){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
function addDays(key,days){
  const date=parseKey(key);
  date.setDate(date.getDate()+days);
  return keyFor(date);
}
function compare(a,b){return String(a).localeCompare(String(b))}
function monthKey(key){
  const date=parseKey(key);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
}
function monthStart(key){
  const [year,month]=String(key).split("-").map(Number);
  return new Date(year,month-1,1);
}
function summary(state){
  if(state.dateStart===state.dateEnd)return shortFormatter.format(parseKey(state.dateStart));
  return `${shortFormatter.format(parseKey(state.dateStart))} – ${shortFormatter.format(parseKey(state.dateEnd))}`;
}

export function todayKey(now=new Date()){return keyFor(now)}
export {addDays};

export function DateControls(state){
  const calendarMonth=state.calendarMonth||monthKey(state.dateStart);
  const first=monthStart(calendarMonth);
  const gridStart=new Date(first);
  gridStart.setDate(first.getDate()-first.getDay());
  const days=[];
  for(let index=0;index<42;index++){
    const date=new Date(gridStart);
    date.setDate(gridStart.getDate()+index);
    const key=keyFor(date);
    const inMonth=date.getMonth()===first.getMonth();
    const selected=key===state.dateStart||key===state.dateEnd;
    const inRange=compare(key,state.dateStart)>=0&&compare(key,state.dateEnd)<=0;
    const pending=state.rangeAnchor===key;
    days.push(`<button type="button" class="calendar-day ${inMonth?"":"outside"} ${inRange?"in-range":""} ${selected?"selected":""} ${pending?"range-anchor":""}" data-date="${key}" aria-pressed="${selected}">${date.getDate()}</button>`);
  }
  return `<section class="date-filter">
    <div class="date-filter-label"><span>DATE</span><button id="todayDate" type="button">Today</button></div>
    <div class="date-navigator">
      <button class="date-step" type="button" data-date-shift="-1" aria-label="Previous day">‹</button>
      <button id="dateSummary" class="date-summary" type="button" aria-expanded="${state.calendarOpen}"><span>${summary(state)}</span><b>▾</b></button>
      <button class="date-step" type="button" data-date-shift="1" aria-label="Next day">›</button>
    </div>
    <div class="date-mode">
      <button id="dateModeSingle" type="button" data-date-mode="single" class="${state.dateMode==="single"?"active":""}">Single day</button>
      <button id="dateModeRange" type="button" data-date-mode="range" class="${state.dateMode==="range"?"active":""}">Date range</button>
    </div>
    <div class="calendar-popover ${state.calendarOpen?"open":""}">
      <div class="calendar-head">
        <button type="button" data-month-shift="-1" aria-label="Previous month">‹</button>
        <strong>${monthFormatter.format(first)}</strong>
        <button type="button" data-month-shift="1" aria-label="Next month">›</button>
      </div>
      <div class="calendar-weekdays">${DAY_NAMES.map(day=>`<span>${day}</span>`).join("")}</div>
      <div class="calendar-grid">${days.join("")}</div>
      <div class="calendar-help">${state.dateMode==="range"?(state.rangeAnchor?"Choose the end date":"Choose a start date, then an end date"):"Choose one day"}</div>
    </div>
  </section>`;
}
