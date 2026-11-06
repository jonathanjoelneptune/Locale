import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {REGIONS} from "./regions.mjs";
import {isWithinVegasStrip} from "../src/data/vegasStrip.js";
import {filterEvents} from "../src/services/events.js";
import {inDateRange} from "../src/services/time.js";
import {parseZoukLinks} from "./providers/vegas-zouk.mjs";

test("Vegas region is configured for the Strip and a Thanksgiving 2026 range",()=>{
  const region=REGIONS["las-vegas"];
  assert.equal(region.timeZone,"America/Los_Angeles");
  assert.deepEqual(region.featuredDateRange,["2026-11-25","2026-11-28"]);
  assert.ok(region.defaultRadiusMiles<=5);
});
test("Strip polygon includes resort corridor and excludes the valley",async()=>{
  const zones=JSON.parse(await readFile("src/data/coverage-zones.json","utf8"));
  const vegasZones=zones.filter(row=>row.regionId==="las-vegas");
  assert.equal(vegasZones.length,8);
  vegasZones.forEach(zone=>assert.equal(isWithinVegasStrip(zone),true,`Out-of-bounds zone: ${zone.name}`));
  assert.equal(isWithinVegasStrip({lat:36.121,lng:-115.1595}),true,"Sphere");
  assert.equal(isWithinVegasStrip({lat:36.1029,lng:-115.1784}),true,"T-Mobile Arena");
  assert.equal(isWithinVegasStrip({lat:36.1708,lng:-115.144}),false,"Downtown Las Vegas");
  assert.equal(isWithinVegasStrip({lat:36.0909,lng:-115.1835}),false,"Allegiant Stadium");
  assert.equal(isWithinVegasStrip({lat:36.1,lng:-115.208}),false,"AREA15");
});
test("region event filtering never exposes off-Strip or San Diego events",()=>{
  const base={id:"vegas-1",regionId:"las-vegas",start:"2026-11-27",category:"nightlife",lat:36.1334,lng:-115.165,locationPrecision:"source"};
  const events=[base,{...base,id:"offstrip",lat:36.17,lng:-115.14},{...base,id:"sd-event",regionId:"san-diego"}];
  const state={regionId:"las-vegas",center:REGIONS["las-vegas"].center,radius:50,categories:new Set,
    selectedAreaIds:new Set,quickPreset:null,dateStart:"2026-11-25",dateEnd:"2026-11-28"};
  assert.deepEqual(filterEvents(events,state).map(item=>item.id),["vegas-1"]);
});
test("date-only events stay on the published Vegas calendar day",()=>{
  const e={start:"2026-11-27",end:null};
  assert.equal(inDateRange(e,"2026-11-27","2026-11-27"),true);
  assert.equal(inDateRange(e,"2026-11-26","2026-11-26"),false);
});
test("Zouk parser accepts only real dated performance links, with no invented times",()=>{
  const html='<a href="/event/EVE50511500020261127/james-hype/">James Hype</a>'+
    '<a href="/event/EVE50511500020261127/james-hype/">duplicate</a>'+
    '<a href="/event/EVE50511500020261121/lil-wayne/">Lil Wayne</a>'+
    '<a href="/events/">general events</a>';
  const events=parseZoukLinks(html,"https://zoukgrouplv.com/events/",{now:new Date("2026-11-06T20:00:00Z"),days:30});
  assert.equal(events.length,2);
  const james=events.find(event=>event.start==="2026-11-27");
  assert.equal(james?.title,"James Hype");
  assert.equal(james?.timeStatus,"unknown");
  assert.match(james?.url||"",/20261127/);
});
