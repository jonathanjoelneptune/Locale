export const EVENT_CONTRACT_VERSION=1;
export const PRICE_STATUSES=new Set(["known","source-text","free","unknown"]);

export function normalizeEvent(event={}){
  return {
    id:event.id,
    canonicalEventId:event.canonicalEventId||event.id||null,
    regionId:event.regionId||null,
    geoCell:event.geoCell||null,
    sourceId:event.sourceId||null,
    title:event.title||"",
    description:event.description||"",
    category:event.category||"other",
    subcategories:Array.isArray(event.subcategories)?event.subcategories:[],
    tags:Array.isArray(event.tags)?event.tags:[],
    start:event.start,
    end:event.end||null,
    timeZone:event.timeZone||null,
    venueId:event.venueId||null,
    venue:event.venue||"Location TBA",
    lat:Number(event.lat),
    lng:Number(event.lng),
    locationPrecision:event.locationPrecision||null,
    address:event.address||null,
    city:event.city||null,
    administrativeArea:event.administrativeArea||event.state||null,
    countryCode:event.countryCode||event.country||null,
    organizerId:event.organizerId||null,
    seriesId:event.seriesId||null,
    price:event.price||null,
    priceMin:event.priceMin??null,
    priceMax:event.priceMax??null,
    priceStatus:PRICE_STATUSES.has(event.priceStatus)?event.priceStatus:"unknown",
    currency:event.currency||null,
    url:event.url||null,
    ticketUrls:Array.isArray(event.ticketUrls)?event.ticketUrls:[],
    registrationUrl:event.registrationUrl||null,
    source:event.source||"Unknown",
    sources:Array.isArray(event.sources)&&event.sources.length?event.sources:[{id:event.sourceId||null,name:event.source||"Unknown",url:event.sourceUrl||event.url||null}],
    sourceCount:Number(event.sourceCount)||1,
    sourceUrl:event.sourceUrl||event.url||null,
    lastVerified:event.lastVerified||null,
    confidence:event.confidence??null,
    featured:!!event.featured,
    image:event.image||null,
    importance:event.importance??null,
    localSignificance:event.localSignificance??null
  };
}

export function eventIdentityKey(event){
  const day=String(event.start||"").slice(0,10);
  return [event.title,event.venue,day].map(value=>String(value||"").trim().toLowerCase()).join("|");
}
