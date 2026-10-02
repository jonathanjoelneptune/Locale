const EVENT_LIKELY_CATEGORIES=new Set([
  "music-venue","nightclub","bar","pub","brewery","theatre","cinema","arts-centre",
  "community-centre","events-venue","conference-centre","casino","marketplace","library",
  "museum","gallery","attraction","zoo","theme-park","stadium","sports-centre","bowling-alley"
]);
const FOOD_CATEGORIES=new Set(["restaurant","cafe"]);
const EVENT_SIGNAL=/\b(events?|calendar|tickets?|live\s*music|music|concert|show|performance|theat(?:re|er)|comedy|trivia|karaoke|bingo|open\s*mic|dance|festival|brew(?:ery|ing)?|taproom|pub|bar|club|nightlife|stadium|museum|gallery|arts?|community)\b/i;

export const PROBE_LANE_ORDER=["event-likely","event-evidence","food-evidence","exploratory","low-value","cold-sample"];

export function eventEvidence(item){
  const text=[
    item?.name,item?.category,item?.website,item?.socialUrl,
    item?.lastResult?.detail,item?.lastResult?.url
  ].filter(Boolean).join(" ");
  return EVENT_SIGNAL.test(text);
}

export function probeLane(item){
  const category=String(item?.category||"").toLowerCase();
  const evidence=eventEvidence(item);
  if(item?.status==="cold")return "cold-sample";
  if(EVENT_LIKELY_CATEGORIES.has(category))return "event-likely";
  if(FOOD_CATEGORIES.has(category)&&evidence)return "food-evidence";
  if(evidence)return "event-evidence";
  if(!FOOD_CATEGORIES.has(category))return "exploratory";
  return "low-value";
}

export function isLowValueCandidate(item){
  return probeLane(item)==="low-value";
}

export function probeLaneTargets(limit){
  const n=Math.max(0,Math.floor(Number(limit||0)));
  if(!n)return {};
  const eventLikely=Math.floor(n*.57);
  const eventEvidence=Math.floor(n*.20);
  const foodEvidence=Math.floor(n*.10);
  const coldSample=n>=10?1:0;
  const lowValue=n>=10?1:0;
  const exploratory=Math.max(0,n-eventLikely-eventEvidence-foodEvidence-lowValue-coldSample);
  return {
    "event-likely":eventLikely,
    "event-evidence":eventEvidence,
    "food-evidence":foodEvidence,
    exploratory,
    "low-value":lowValue,
    "cold-sample":coldSample
  };
}

export function selectProbeCandidates(items,limit,{scoreFn=item=>Number(item?.priority||0),hostFn}={}){
  const targets=probeLaneTargets(limit);
  const lanes=new Map(PROBE_LANE_ORDER.map(lane=>[lane,[]]));
  for(const item of items||[]){
    const lane=probeLane(item);
    if(!lanes.has(lane))continue;
    lanes.get(lane).push(item);
  }
  for(const rows of lanes.values())rows.sort((a,b)=>scoreFn(b)-scoreFn(a)||String(a.discoveredAt||"").localeCompare(String(b.discoveredAt||"")));

  const selected=[];
  const selectedHosts=new Set;
  const counts=Object.fromEntries(PROBE_LANE_ORDER.map(lane=>[lane,0]));
  const take=(lane,max)=>{
    const rows=lanes.get(lane)||[];
    while(rows.length&&counts[lane]<max&&selected.length<limit){
      const item=rows.shift();
      const host=hostFn?.(item)||null;
      if(host&&selectedHosts.has(host))continue;
      if(host)selectedHosts.add(host);
      selected.push(item);
      counts[lane]++;
    }
  };

  for(const lane of PROBE_LANE_ORDER)take(lane,targets[lane]||0);

  // Reallocate unused capacity only to productive/non-low-value lanes.
  let changed=true;
  while(selected.length<limit&&changed){
    changed=false;
    for(const lane of ["event-likely","event-evidence","food-evidence","exploratory"]){
      const before=selected.length;
      take(lane,Number.MAX_SAFE_INTEGER);
      if(selected.length>before)changed=true;
      if(selected.length>=limit)break;
    }
  }
  return {selected,counts,targets};
}

export function coldStorageDays(item,result){
  const attempts=Math.max(1,Number(item?.attempts||1));
  const lane=probeLane({...item,status:item?.status==="cold"?"candidate":item?.status});
  if(result?.reason==="no-supported-calendar"){
    if(lane==="low-value")return attempts<=1?45:attempts===2?90:180;
    if(lane==="food-evidence")return attempts<=1?14:30;
  }
  if(result?.reason==="website-fetch-failed"&&lane==="low-value"&&attempts>=3)return 30;
  return 0;
}

export function shouldColdStore(item,result){
  return coldStorageDays(item,result)>0;
}
