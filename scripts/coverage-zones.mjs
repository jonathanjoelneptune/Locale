export const COVERAGE_CLASS_TARGETS={
  "entertainment-core":{fridaySaturdayNightAverage:8,recurringLocalOccurrences30d:5},
  "urban-core":{fridaySaturdayNightAverage:6,recurringLocalOccurrences30d:4},
  urban:{fridaySaturdayNightAverage:5,recurringLocalOccurrences30d:4},
  mixed:{fridaySaturdayNightAverage:4,recurringLocalOccurrences30d:3},
  suburban:{fridaySaturdayNightAverage:3,recurringLocalOccurrences30d:2},
  outer:{fridaySaturdayNightAverage:2,recurringLocalOccurrences30d:1},
  rural:{fridaySaturdayNightAverage:1,recurringLocalOccurrences30d:1}
};

export const coverageTargets=zone=>COVERAGE_CLASS_TARGETS[zone?.coverageClass]||COVERAGE_CLASS_TARGETS.mixed;

export function milesBetween(a,b){
  const finite=value=>Number.isFinite(Number(value));
  if(!finite(a?.lat)||!finite(a?.lng)||!finite(b?.lat)||!finite(b?.lng))return Infinity;
  const R=3958.7613,toRad=value=>Number(value)*Math.PI/180;
  const dLat=toRad(Number(b.lat)-Number(a.lat)),dLng=toRad(Number(b.lng)-Number(a.lng));
  const lat1=toRad(a.lat),lat2=toRad(b.lat);
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

export function containingCoverageZones(point,zones,{regionId=null}={}){
  return (zones||[])
    .filter(zone=>(!regionId||zone.regionId===regionId)&&milesBetween(point,zone)<=Number(zone.radiusMiles||0))
    .sort((a,b)=>Number(a.radiusMiles||99)-Number(b.radiusMiles||99)||Number(b.discoveryPriority||0)-Number(a.discoveryPriority||0)||a.name.localeCompare(b.name));
}

export function areaGapScore(row){
  if(!row)return 0;
  const targetNight=Number(row.targets?.fridaySaturdayNightAverage||1);
  const targetRecurring=Number(row.targets?.recurringLocalOccurrences30d||1);
  const nightRatio=Math.min(1,Number(row.fridaySaturdayNightAverage||0)/targetNight);
  const recurringRatio=Math.min(1,Number(row.recurringLocalOccurrences30d||0)/targetRecurring);
  const venueSignal=Math.min(1,Number(row.uniqueVenuesNext28d||0)/Math.max(3,targetNight*2));
  return Math.round(100*(1-(nightRatio*.55+recurringRatio*.3+venueSignal*.15)));
}
