import {milesBetween} from "./geo.js";
import {inWindow} from "./time.js";
const VENUES=[
 {re:/\bpetco park\b/i,lat:32.7076,lng:-117.1570,venue:"PETCO Park"},
 {re:/\bsnapdragon stadium\b/i,lat:32.7841,lng:-117.1225,venue:"Snapdragon Stadium"},
 {re:/\brady shell(?: at jacobs park)?\b/i,lat:32.7049,lng:-117.1653,venue:"The Rady Shell at Jacobs Park"},
 {re:/\b(?:the )?observatory north park\b/i,lat:32.7542,lng:-117.1305,venue:"The Observatory North Park"}
];
function canonicalVenue(e){const v=VENUES.find(x=>x.re.test(e.venue||""));return v?{...e,lat:v.lat,lng:v.lng,venue:v.venue}:e}
export function normalize(e){e=canonicalVenue(e);return{id:e.id,regionId:e.regionId||null,geoCell:e.geoCell||null,sourceId:e.sourceId||null,title:e.title,category:e.category||"other",venue:e.venue||"Location TBA",lat:Number(e.lat),lng:Number(e.lng),start:e.start,end:e.end||null,price:e.price||null,priceStatus:e.priceStatus||"unknown",url:e.url||null,source:e.source||"Unknown",sources:e.sources||[{name:e.source||"Unknown",url:e.sourceUrl||e.url||null}],sourceCount:e.sourceCount||1,description:e.description||"",featured:!!e.featured,image:e.image||null,sourceUrl:e.sourceUrl||e.url||null,lastVerified:e.lastVerified||null}}
export function dedupe(events){const m=new Map;for(const e of events){const key=(e.title+"|"+e.venue+"|"+e.start.slice(0,10)).toLowerCase();if(!m.has(key))m.set(key,e)}return [...m.values()]}
export function filterEvents(events,state){return events.map(e=>({...e,distance:milesBetween(state.center,e)})).filter(e=>e.distance<=state.radius&&(state.category==="all"||e.category===state.category)&&inWindow(e,state.window)).sort((a,b)=>new Date(a.start)-new Date(b.start)||a.distance-b.distance)}
