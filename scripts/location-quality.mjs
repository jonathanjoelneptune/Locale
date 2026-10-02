export const PRECISE_LOCATION_PRECISIONS=new Set([
  "source","venue-geocoded","venue-canonical","venue-known","address","exact","coordinates"
]);
export const APPROXIMATE_LOCATION_PRECISIONS=new Set([
  "source-center","city-only","region-only","campus-only","unresolved","unknown",""
]);

export function isPreciseLocation(value){
  const precision=String(value?.locationPrecision??value??"").toLowerCase();
  return PRECISE_LOCATION_PRECISIONS.has(precision);
}

export function locationQuality(value){
  const precision=String(value?.locationPrecision??value??"").toLowerCase();
  if(PRECISE_LOCATION_PRECISIONS.has(precision))return "precise";
  if(APPROXIMATE_LOCATION_PRECISIONS.has(precision))return "approximate";
  return "approximate";
}
