import {createHash} from "node:crypto";
import {normalizePlace} from "../src/domain/place.js";
import {normalizeOrganizer} from "../src/domain/organizer.js";
import {normalizeSeries} from "../src/domain/series.js";

export const REGISTRY_CONTRACT_VERSION=1;

const DAY_MS=86400000;
const GENERIC_VENUES=new Set(["","location tba","tba","online","virtual","san diego","chicago"]);
const PRECISION_RANK={
  "venue-canonical":7,
  "venue-known":6,
  "venue-geocoded":5,
  "source":4,
  "unknown":3,
  "source-center":2,
  "city-only":1,
  "region-only":0,
  "campus-only":0,
  "unresolved":0
};
const DAYS=["SU","MO","TU","WE","TH","FR","SA"];

const clean=value=>String(value??"").replace(/\s+/g," ").trim();
const norm=value=>clean(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
const slug=value=>norm(value).replace(/\s+/g,"-").replace(/^-|-$/g,"").slice(0,52)||"entity";
const hash=value=>createHash("sha1").update(String(value)).digest("hex").slice(0,10);
const stableId=(prefix,label,key)=>`${prefix}_${slug(label)}_${hash(key)}`;
const provenance=event=>Array.isArray(event.sources)&&event.sources.length?event.sources:[{id:event.sourceId,name:event.source,url:event.sourceUrl||event.url||null}];
const isoMin=values=>values.filter(Boolean).sort()[0]||null;
const isoMax=values=>values.filter(Boolean).sort().at(-1)||null;

function meaningfulVenue(event){
  const name=norm(event.venue);
  return !!name&&!GENERIC_VENUES.has(name);
}

function specificPlaceKey(event){
  if(event.venueKey)return `${event.regionId}|venue-key|${event.venueKey}`;
  const address=norm(event.address);
  if(address)return `${event.regionId}|name-address|${norm(event.venue)}|${address}`;
  const precise=!["source-center","city-only","region-only","campus-only","unresolved"].includes(event.locationPrecision||"");
  if(precise&&Number.isFinite(Number(event.lat))&&Number.isFinite(Number(event.lng))){
    return `${event.regionId}|name-point|${norm(event.venue)}|${Number(event.lat).toFixed(4)}|${Number(event.lng).toFixed(4)}`;
  }
  return null;
}

const venueNameKey=event=>`${event.regionId}|${norm(event.venue)}`;

function bestLocation(events){
  return [...events].sort((a,b)=>(PRECISION_RANK[b.locationPrecision||"unknown"]??0)-(PRECISION_RANK[a.locationPrecision||"unknown"]??0))[0]||{};
}

function sourceOwnerOrganizer(source,regionId){
  if(source?.ownerEntityKind!=="organizer"||!source.ownerName)return null;
  if(source.scope==="country"||source.scope==="global")return null;
  if(Array.isArray(source.regions)&&!source.regions.includes(regionId))return null;
  const key=`${regionId}|${norm(source.ownerName)}`;
  return {
    id:stableId("org",source.ownerName,key),
    regionId,
    name:source.ownerName,
    sourceId:source.id
  };
}

function inferRecurrence(events){
  const dates=[...new Set(events.map(event=>String(event.start||"")).filter(Boolean))]
    .map(value=>new Date(value))
    .filter(date=>Number.isFinite(date.getTime()))
    .sort((a,b)=>a-b);
  if(dates.length<3)return null;
  const spanDays=(dates.at(-1)-dates[0])/DAY_MS;
  if(spanDays<12)return null;
  const diffs=[];
  for(let i=1;i<dates.length;i++)diffs.push((dates[i]-dates[i-1])/DAY_MS);
  const near=(target,tolerance=1)=>diffs.length&&diffs.every(value=>Math.abs(value-target)<=tolerance);
  const sameWeekday=dates.every(date=>date.getDay()===dates[0].getDay());

  if(sameWeekday&&near(7)){
    const byDay=DAYS[dates[0].getDay()];
    return {kind:"weekly",interval:1,byDay,rrule:`FREQ=WEEKLY;BYDAY=${byDay}`};
  }
  if(sameWeekday&&near(14)){
    const byDay=DAYS[dates[0].getDay()];
    return {kind:"weekly",interval:2,byDay,rrule:`FREQ=WEEKLY;INTERVAL=2;BYDAY=${byDay}`};
  }

  const monthSteps=[];
  for(let i=1;i<dates.length;i++)monthSteps.push((dates[i].getUTCFullYear()-dates[i-1].getUTCFullYear())*12+dates[i].getUTCMonth()-dates[i-1].getUTCMonth());
  if(monthSteps.length&&monthSteps.every(value=>value===1)){
    const sameMonthDay=dates.every(date=>date.getUTCDate()===dates[0].getUTCDate());
    if(sameMonthDay){
      const day=dates[0].getUTCDate();
      return {kind:"monthly",interval:1,byDay:null,rrule:`FREQ=MONTHLY;BYMONTHDAY=${day}`};
    }
    if(sameWeekday){
      const ordinal=Math.ceil(dates[0].getUTCDate()/7);
      if(ordinal<=4&&dates.every(date=>Math.ceil(date.getUTCDate()/7)===ordinal)){
        const byDay=`${ordinal}${DAYS[dates[0].getUTCDay()]}`;
        return {kind:"monthly",interval:1,byDay,rrule:`FREQ=MONTHLY;BYDAY=${byDay}`};
      }
    }
  }
  return null;
}

export function buildRegistry(events,sources=[],previousRegistry={}){
  const sourceById=new Map(sources.map(source=>[source.id,source]));
  const previousPlaces=Array.isArray(previousRegistry.places)?previousRegistry.places:[];
  const previousPlacesByName=new Map();
  for(const place of previousPlaces){
    const key=`${place.regionId}|${norm(place.name)}`;
    if(!previousPlacesByName.has(key))previousPlacesByName.set(key,[]);
    previousPlacesByName.get(key).push(place);
  }
  const previousPlaceFor=(sample,group)=>{
    const candidates=previousPlacesByName.get(`${sample.regionId}|${norm(sample.venue)}`)||[];
    if(!candidates.length)return null;
    if(sample.venueKey){
      const hit=candidates.find(place=>place.venueKey===sample.venueKey);
      if(hit)return hit;
    }
    const address=norm(sample.address);
    if(address){
      const hit=candidates.find(place=>norm(place.address)===address);
      if(hit)return hit;
    }
    const lat=Number(sample.lat),lng=Number(sample.lng);
    if(Number.isFinite(lat)&&Number.isFinite(lng)){
      const hit=candidates.find(place=>Number.isFinite(Number(place.lat))&&Number.isFinite(Number(place.lng))&&Math.abs(Number(place.lat)-lat)<.003&&Math.abs(Number(place.lng)-lng)<.003);
      if(hit)return hit;
    }
    return candidates.length===1?candidates[0]:null;
  };
  const placeGroups=new Map();
  const specificKeysByName=new Map();
  const vagueEvents=[];

  for(const event of events){
    if(!event?.regionId||!meaningfulVenue(event))continue;
    const key=specificPlaceKey(event);
    if(!key){vagueEvents.push(event);continue;}
    if(!placeGroups.has(key))placeGroups.set(key,[]);
    placeGroups.get(key).push(event);
    const nameKey=venueNameKey(event);
    if(!specificKeysByName.has(nameKey))specificKeysByName.set(nameKey,new Set);
    specificKeysByName.get(nameKey).add(key);
  }

  for(const event of vagueEvents){
    const candidates=[...(specificKeysByName.get(venueNameKey(event))||[])];
    const key=candidates.length===1?candidates[0]:`${event.regionId}|name|${norm(event.venue)}`;
    if(!placeGroups.has(key))placeGroups.set(key,[]);
    placeGroups.get(key).push(event);
  }

  const places=[];
  const placeIdByEventId=new Map();
  const placeIdByKey=new Map();
  for(const [key,group] of placeGroups){
    const sample=bestLocation(group);
    const name=clean(sample.venue||group[0].venue);
    const previous=previousPlaceFor(sample,group);
    const id=previous?.id||stableId("place",name,key);
    const sourceIds=[...new Set(group.flatMap(event=>provenance(event).map(source=>source.id)).filter(Boolean))].sort();
    const directSource=sourceIds.some(sourceId=>sourceById.get(sourceId)?.ownerEntityKind==="place");
    const starts=group.map(event=>event.start).filter(Boolean);
    const verified=group.map(event=>event.lastVerified).filter(Boolean);
    const place=normalizePlace({
      id,
      regionId:sample.regionId,
      name,
      canonicalName:name,
      venueKey:sample.venueKey||null,
      address:sample.address||null,
      city:sample.city||null,
      administrativeArea:sample.administrativeArea||null,
      countryCode:sample.countryCode||null,
      lat:Number(sample.lat),
      lng:Number(sample.lng),
      locationPrecision:sample.locationPrecision||null,
      eventCategories:[...new Set(group.map(event=>event.category||"other"))].sort(),
      monitorTier:directSource||group.length>=3?"A":"B",
      eventCount:group.length,
      sourceIds,
      sourceCount:sourceIds.length,
      firstEventAt:isoMin(starts),
      lastEventAt:isoMax(starts),
      lastVerified:isoMax(verified),
      discoveredBy:"event-bootstrap"
    });
    places.push(place);
    placeIdByKey.set(key,id);
    for(const event of group)placeIdByEventId.set(event.id,id);
  }
  places.sort((a,b)=>a.regionId.localeCompare(b.regionId)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));

  const organizerSeeds=new Map();
  for(const event of events){
    const candidates=provenance(event)
      .map(source=>sourceOwnerOrganizer(sourceById.get(source.id),event.regionId))
      .filter(Boolean);
    for(const candidate of candidates){
      if(!organizerSeeds.has(candidate.id))organizerSeeds.set(candidate.id,{...candidate,events:[]});
      organizerSeeds.get(candidate.id).events.push(event);
    }
  }
  for(const source of sources){
    if(source.ownerEntityKind!=="organizer"||!source.ownerName)continue;
    for(const regionId of source.regions||[]){
      const seed=sourceOwnerOrganizer(source,regionId);
      if(seed&&!organizerSeeds.has(seed.id))organizerSeeds.set(seed.id,{...seed,events:[]});
    }
  }

  const organizers=[];
  const organizerIdBySourceRegion=new Map();
  for(const seed of organizerSeeds.values()){
    const sourceIds=[...new Set([seed.sourceId,...seed.events.flatMap(event=>provenance(event).map(source=>source.id))].filter(Boolean))].sort();
    const starts=seed.events.map(event=>event.start).filter(Boolean);
    const verified=seed.events.map(event=>event.lastVerified).filter(Boolean);
    const organizer=normalizeOrganizer({
      id:seed.id,
      regionId:seed.regionId,
      name:seed.name,
      sourceIds,
      sourceCount:sourceIds.length,
      eventCount:seed.events.length,
      firstEventAt:isoMin(starts),
      lastEventAt:isoMax(starts),
      lastVerified:isoMax(verified),
      discoveredBy:"source-registry"
    });
    organizers.push(organizer);
    organizerIdBySourceRegion.set(`${seed.regionId}|${seed.sourceId}`,seed.id);
  }
  organizers.sort((a,b)=>a.regionId.localeCompare(b.regionId)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));

  const annotated=events.map(event=>{
    const venueId=placeIdByEventId.get(event.id)||null;
    const organizerSource=provenance(event).find(source=>organizerIdBySourceRegion.has(`${event.regionId}|${source.id}`));
    const organizerId=organizerSource?organizerIdBySourceRegion.get(`${event.regionId}|${organizerSource.id}`):null;
    return {...event,venueId,organizerId,seriesId:null};
  });

  const seriesGroups=new Map();
  for(const event of annotated){
    if(!event.venueId)continue;
    const key=`${event.regionId}|${event.venueId}|${norm(event.title)}`;
    if(!seriesGroups.has(key))seriesGroups.set(key,[]);
    seriesGroups.get(key).push(event);
  }

  const series=[];
  const seriesIdByEventId=new Map();
  for(const [key,group] of seriesGroups){
    const recurrence=inferRecurrence(group);
    if(!recurrence)continue;
    const sample=group[0];
    const id=stableId("series",sample.title,key);
    const sourceIds=[...new Set(group.flatMap(event=>provenance(event).map(source=>source.id)).filter(Boolean))].sort();
    const item=normalizeSeries({
      id,
      regionId:sample.regionId,
      name:sample.title,
      venueId:sample.venueId,
      organizerId:sample.organizerId||null,
      status:"confirmed",
      recurrence,
      occurrenceCount:group.length,
      firstStart:isoMin(group.map(event=>event.start)),
      lastStart:isoMax(group.map(event=>event.start)),
      sourceIds,
      lastVerified:isoMax(group.map(event=>event.lastVerified))
    });
    series.push(item);
    for(const event of group)seriesIdByEventId.set(event.id,id);
  }
  series.sort((a,b)=>a.regionId.localeCompare(b.regionId)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));

  const canonicalEvents=annotated.map(event=>({...event,seriesId:seriesIdByEventId.get(event.id)||null}));

  const linkMap=new Map();
  const addLink=(entityType,entityId,sourceId,{role="observed",event=null}={})=>{
    if(!entityId||!sourceId)return;
    const key=`${entityType}|${entityId}|${sourceId}`;
    if(!linkMap.has(key))linkMap.set(key,{
      id:`link_${hash(key)}`,
      entityType,entityId,sourceId,
      roles:new Set,
      eventIds:new Set,
      observedAt:[]
    });
    const link=linkMap.get(key);
    link.roles.add(role);
    if(event?.id)link.eventIds.add(event.id);
    if(event?.lastVerified)link.observedAt.push(event.lastVerified);
  };

  for(const event of canonicalEvents){
    for(const source of provenance(event)){
      if(event.venueId)addLink("place",event.venueId,source.id,{role:"event-observed",event});
      if(event.organizerId)addLink("organizer",event.organizerId,source.id,{role:"event-observed",event});
      if(event.seriesId)addLink("series",event.seriesId,source.id,{role:"event-observed",event});
    }
  }
  for(const source of sources){
    if(source.ownerEntityKind==="organizer"&&source.ownerName){
      for(const regionId of source.regions||[]){
        const organizerId=organizerIdBySourceRegion.get(`${regionId}|${source.id}`);
        if(organizerId)addLink("organizer",organizerId,source.id,{role:"official"});
      }
    }
    if(source.ownerEntityKind==="place"&&source.ownerName){
      for(const regionId of source.regions||[]){
        const place=places.find(candidate=>candidate.regionId===regionId&&norm(candidate.name)===norm(source.ownerName));
        if(place)addLink("place",place.id,source.id,{role:"official"});
      }
    }
  }

  const entitySources=[...linkMap.values()].map(link=>({
    id:link.id,
    entityType:link.entityType,
    entityId:link.entityId,
    sourceId:link.sourceId,
    roles:[...link.roles].sort(),
    eventCount:link.eventIds.size,
    firstObservedAt:isoMin(link.observedAt),
    lastObservedAt:isoMax(link.observedAt)
  })).sort((a,b)=>a.entityType.localeCompare(b.entityType)||a.entityId.localeCompare(b.entityId)||a.sourceId.localeCompare(b.sourceId));

  const regionIds=[...new Set(canonicalEvents.map(event=>event.regionId).filter(Boolean))];
  const coverage={contractVersion:REGISTRY_CONTRACT_VERSION,regions:{}};
  for(const regionId of regionIds){
    const regionPlaces=places.filter(place=>place.regionId===regionId);
    const regionOrganizers=organizers.filter(organizer=>organizer.regionId===regionId);
    const regionSeries=series.filter(item=>item.regionId===regionId);
    const entityIds=new Set([...regionPlaces.map(x=>x.id),...regionOrganizers.map(x=>x.id),...regionSeries.map(x=>x.id)]);
    const regionLinks=entitySources.filter(link=>entityIds.has(link.entityId));
    const monitorTierCounts={A:0,B:0,C:0,D:regionOrganizers.length};
    for(const place of regionPlaces)monitorTierCounts[place.monitorTier]=(monitorTierCounts[place.monitorTier]||0)+1;
    coverage.regions[regionId]={
      placeCount:regionPlaces.length,
      organizerCount:regionOrganizers.length,
      seriesCount:regionSeries.length,
      entitySourceLinkCount:regionLinks.length,
      monitorTierCounts,
      multiSourcePlaceCount:regionPlaces.filter(place=>place.sourceCount>1).length,
      recurringEventCount:canonicalEvents.filter(event=>event.regionId===regionId&&event.seriesId).length,
      eventsWithVenueId:canonicalEvents.filter(event=>event.regionId===regionId&&event.venueId).length,
      eventsWithOrganizerId:canonicalEvents.filter(event=>event.regionId===regionId&&event.organizerId).length
    };
  }

  return {events:canonicalEvents,places,organizers,series,entitySources,coverage};
}
