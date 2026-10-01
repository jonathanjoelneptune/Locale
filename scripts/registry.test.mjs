import test from "node:test";
import assert from "node:assert/strict";
import {buildRegistry} from "./registry.mjs";

const verified="2026-10-01T12:00:00.000Z";
const sunset={
  id:"sunset-trivia",
  name:"Sunset Trivia",
  scope:"regional",
  regions:["san-diego"],
  sourceKind:"organizer",
  ownerEntityKind:"organizer",
  ownerName:"Sunset Trivia"
};
const micdrop={
  id:"mic-drop-comedy",
  name:"Mic Drop Comedy",
  scope:"local",
  regions:["san-diego"],
  sourceKind:"official",
  ownerEntityKind:"place",
  ownerName:"Mic Drop Comedy"
};

const recurringDates=["2026-10-04T19:00:00.000Z","2026-10-11T19:00:00.000Z","2026-10-18T19:00:00.000Z"];
const recurringEvents=recurringDates.map((start,index)=>({
  id:`trivia:${index}`,
  regionId:"san-diego",
  title:"Trivia Night at Example Taproom",
  category:"nightlife",
  venue:"Example Taproom",
  address:"123 Main St, San Diego, CA 92101",
  lat:32.715,
  lng:-117.161,
  locationPrecision:"venue-geocoded",
  start,
  sourceId:"sunset-trivia",
  source:"Sunset Trivia",
  sources:[{id:"sunset-trivia",name:"Sunset Trivia",url:"https://example.com/trivia"}],
  lastVerified:verified
}));

test("registry creates stable places, organizer links, and recurring series",()=>{
  const registry=buildRegistry(recurringEvents,[sunset]);
  assert.equal(registry.places.length,1);
  assert.equal(registry.organizers.length,1);
  assert.equal(registry.series.length,1);

  const [place]=registry.places;
  const [organizer]=registry.organizers;
  const [series]=registry.series;
  assert.equal(place.monitorTier,"A");
  assert.equal(organizer.monitorTier,"D");
  assert.equal(series.recurrence.kind,"weekly");
  assert.equal(series.recurrence.rrule,"FREQ=WEEKLY;BYDAY=SU");
  assert.equal(series.venueId,place.id);
  assert.equal(series.organizerId,organizer.id);

  for(const event of registry.events){
    assert.equal(event.venueId,place.id);
    assert.equal(event.organizerId,organizer.id);
    assert.equal(event.seriesId,series.id);
  }

  const organizerLink=registry.entitySources.find(link=>link.entityType==="organizer"&&link.entityId===organizer.id&&link.sourceId==="sunset-trivia");
  assert.ok(organizerLink);
  assert.deepEqual(organizerLink.roles,["event-observed","official"]);

  const reversed=buildRegistry([...recurringEvents].reverse(),[sunset]);
  assert.equal(reversed.places[0].id,place.id);
  assert.equal(reversed.organizers[0].id,organizer.id);
  assert.equal(reversed.series[0].id,series.id);
});

test("official place sources attach to the canonical place",()=>{
  const events=[{
    id:"micdrop:1",
    regionId:"san-diego",
    title:"Friday Stand-Up",
    category:"comedy",
    venue:"Mic Drop Comedy",
    lat:32.8325,
    lng:-117.1371,
    locationPrecision:"venue-canonical",
    start:"2026-10-09T20:00:00.000Z",
    sourceId:"mic-drop-comedy",
    source:"Mic Drop Comedy",
    sources:[{id:"mic-drop-comedy",name:"Mic Drop Comedy",url:"https://example.com"}],
    lastVerified:verified
  }];
  const registry=buildRegistry(events,[micdrop]);
  assert.equal(registry.places.length,1);
  const link=registry.entitySources.find(item=>item.entityType==="place"&&item.sourceId==="mic-drop-comedy");
  assert.ok(link);
  assert.deepEqual(link.roles,["event-observed","official"]);
});

test("generic locations do not become monitored places",()=>{
  const registry=buildRegistry([{
    id:"unknown:1",
    regionId:"san-diego",
    title:"Mystery Event",
    category:"community",
    venue:"Location TBA",
    lat:32.7157,
    lng:-117.1611,
    locationPrecision:"source-center",
    start:"2026-10-10T12:00:00.000Z",
    sourceId:"example",
    source:"Example",
    sources:[{id:"example",name:"Example"}],
    lastVerified:verified
  }],[]);
  assert.equal(registry.places.length,0);
  assert.equal(registry.events[0].venueId,null);
});
