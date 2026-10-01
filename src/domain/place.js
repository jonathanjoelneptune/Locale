export const PLACE_CONTRACT_VERSION=1;
export const PLACE_MONITOR_TIERS=new Set(["A","B","C"]);

export function normalizePlace(place={}){
  return {
    id:place.id||null,
    regionId:place.regionId||null,
    name:place.name||"",
    canonicalName:place.canonicalName||place.name||"",
    venueKey:place.venueKey||null,
    address:place.address||null,
    city:place.city||null,
    administrativeArea:place.administrativeArea||null,
    countryCode:place.countryCode||null,
    lat:Number.isFinite(Number(place.lat))?Number(place.lat):null,
    lng:Number.isFinite(Number(place.lng))?Number(place.lng):null,
    locationPrecision:place.locationPrecision||null,
    eventCategories:Array.isArray(place.eventCategories)?place.eventCategories:[],
    monitorTier:PLACE_MONITOR_TIERS.has(place.monitorTier)?place.monitorTier:"B",
    eventCount:Number(place.eventCount)||0,
    sourceIds:Array.isArray(place.sourceIds)?place.sourceIds:[],
    sourceCount:Number(place.sourceCount)||0,
    firstEventAt:place.firstEventAt||null,
    lastEventAt:place.lastEventAt||null,
    lastVerified:place.lastVerified||null,
    discoveredBy:place.discoveredBy||"unknown"
  };
}
