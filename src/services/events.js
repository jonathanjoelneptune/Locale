import {milesBetween} from "./geo.js";
import {inWindow} from "./time.js";
import {eventIdentityKey,normalizeEvent} from "../domain/event.js";

const VENUES=[
  {re:/\bpetco park\b/i,lat:32.7076,lng:-117.1570,venue:"PETCO Park"},
  {re:/\bsnapdragon stadium\b/i,lat:32.7841,lng:-117.1225,venue:"Snapdragon Stadium"},
  {re:/\brady shell(?: at jacobs park)?\b/i,lat:32.7049,lng:-117.1653,venue:"The Rady Shell at Jacobs Park"},
  {re:/\b(?:the )?observatory north park\b/i,lat:32.7542,lng:-117.1305,venue:"The Observatory North Park"}
];

function canonicalVenue(event){
  const venue=VENUES.find(candidate=>candidate.re.test(event.venue||""));
  return venue?{...event,lat:venue.lat,lng:venue.lng,venue:venue.venue}:event;
}

export function normalize(event){
  return normalizeEvent(canonicalVenue(event));
}

export function dedupe(events){
  const unique=new Map;
  for(const event of events){
    const key=eventIdentityKey(event);
    if(!unique.has(key))unique.set(key,event);
  }
  return [...unique.values()];
}

const APPROXIMATE_PRECISIONS=new Set(["source-center","city-only","region-only","campus-only","unresolved"]);
export const hasPreciseLocation=event=>!APPROXIMATE_PRECISIONS.has(event.locationPrecision||"")&&Number.isFinite(Number(event.lat))&&Number.isFinite(Number(event.lng));

export function filterEvents(events,state){
  return events
    .map(event=>{
      const filterDistance=milesBetween(state.center,event);
      return {...event,_filterDistance:filterDistance,distance:hasPreciseLocation(event)?filterDistance:null};
    })
    .filter(event=>event._filterDistance<=state.radius&&(state.category==="all"||event.category===state.category)&&inWindow(event,state.window))
    .sort((a,b)=>new Date(a.start)-new Date(b.start)||(a.distance??Infinity)-(b.distance??Infinity));
}
