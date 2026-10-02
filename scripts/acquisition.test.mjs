import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {loadAcquisitionRegistry} from "./acquisition-registry.mjs";
import {parseBiblioCommonsPage,biblioCommonsEvents,biblioCommonsLocationNames,biblioCommonsEventLocation} from "./providers/bibliocommons.mjs";
import {parseReaderSpecials} from "./providers/sandiego-reader-happy-hours.mjs";
import {parseCasbahCalendar} from "./providers/casbah-presents.mjs";
import {parseMuseumCouncil} from "./providers/museum-council.mjs";
import {parseConventionCenter} from "./providers/convention-center.mjs";
import {parseFairgroundsPrint} from "./providers/del-mar-fairgrounds.mjs";
import {parseSanteeCalendar} from "./providers/santee-calendar.mjs";
import {SOURCES} from "./source-registry.mjs";
import {venueGeocodeKey} from "./venue-geocode.mjs";

test("workbook acquisition registry preserves the complete source, area, and taxonomy inventory",async()=>{
  const registry=await loadAcquisitionRegistry();
  assert.equal(registry.sources.length,97);
  assert.deepEqual(registry.summary.priorities,{A:17,B:66,C:14});
  assert.equal(registry.areas.length,158);
  assert.equal(registry.taxonomy.familyCount,38);
  assert.equal(registry.taxonomy.rows.length,38);

  const ids=new Set(registry.sources.map(source=>source.id));
  assert.equal(ids.size,97);

  const zones=JSON.parse(await readFile("src/data/coverage-zones.json","utf8"));
  const configured=new Set(zones.filter(zone=>zone.regionId==="san-diego").map(zone=>zone.name));
  const mapped=new Set(registry.areas.map(area=>area.area));
  assert.equal(mapped.size,158);
  assert.deepEqual([...mapped].filter(name=>!configured.has(name)),[]);
  assert.deepEqual([...configured].filter(name=>!mapped.has(name)),[]);
});

test("BiblioCommons parser extracts dated hyperlocal library activities",()=>{
  const html=`
    <h3><a href="/events/storytime">Family Storytime</a></h3>
    <div>Friday, October 9, 2026, 10:00am Event location: Alpine Library
      Find more events in: Kids
      Find more events in: Storytime
      <a href="/events/storytime">View event</a>
    </div>
  `;
  const rows=parseBiblioCommonsPage(html);
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,"Family Storytime");
  assert.equal(rows[0].venue,"Alpine Library");
  assert.ok(rows[0].start.startsWith("2026-10-09T"));
});

test("BiblioCommons listing context recovers real branch names from embedded events",async()=>{
  const originalFetch=globalThis.fetch;
  const html=`
    <div>Location Locations 4S Ranch (397) Alpine (383) Del Mar (91) Audience Adults (100)</div>
    <div>Event items</div>
    <script type="application/ld+json">
      {"@type":"Event","name":"Chinese Mahjong Meetup","startDate":"2026-10-09T10:00:00-07:00","description":"Weekly mahjong"}
    </script>
    <h3><a href="/events/mahjong">Chinese Mahjong Meetup</a></h3>
    <div>Friday, October 9, 2026, 10:00am–12:00pm Alpine Event location: Alpine
      Find more events in: Gaming
      <a href="/events/mahjong">View event</a>
    </div>
  `;
  assert.deepEqual(new Set(biblioCommonsLocationNames(html)),new Set(["4S Ranch","Alpine","Del Mar"]));
  assert.deepEqual(biblioCommonsEventLocation(html,"Chinese Mahjong Meetup"),{name:"Alpine",kind:"library"});

  globalThis.fetch=async input=>({ok:true,status:200,url:String(input),text:async()=>html});
  try{
    const events=await biblioCommonsEvents({
      endpoint:"https://library.example/v2/events",
      sourceName:"San Diego County Library Events",
      sourceId:"sd-county-library",
      fallbackCenter:{lat:32.85,lng:-117.05},
      days:45,maxPages:1
    });
    const event=events.find(item=>item.title==="Chinese Mahjong Meetup");
    assert.ok(event);
    assert.equal(event.venue,"Alpine Library");
    assert.equal(event.geocodeQuery,"Alpine Library, San Diego County, CA");
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test("BiblioCommons ingestion parses already-fetched HTML without refetching detail pages",async()=>{
  const originalFetch=globalThis.fetch;
  let calls=0;
  const html=`
    <div>1 to 20 of 1 items</div>
    <script type="application/ld+json">
      {"@type":"Event","name":"Library Craft","startDate":"2026-10-10T10:00:00-07:00","location":{"name":"Alpine Library"}}
    </script>
    <h3><a href="/events/craft">Library Craft</a></h3>
    <div>Saturday, October 10, 2026, 10:00am Event location: Alpine Library
      Find more events in: Arts and Culture
      <a href="/events/craft">View event</a>
    </div>
  `;
  globalThis.fetch=async input=>{
    calls++;
    return {ok:true,status:200,url:String(input),text:async()=>html};
  };
  try{
    const events=await biblioCommonsEvents({
      endpoint:"https://library.example/v2/events",
      sourceName:"Example Library",
      sourceId:"example-library",
      fallbackCenter:{lat:32.8,lng:-117.1},
      days:45,
      maxPages:5
    });
    assert.equal(calls,1);
    assert.ok(events.length>=1);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test("County Library IDs stay unique when the same program occurs at different branches",async()=>{
  const originalFetch=globalThis.fetch;
  const makePage=branch=>`
    <div>1 to 20 of 1 items</div>
    <div>Location Locations Alpine (383) Poway (221) Audience Adults (100)</div>
    <div>Event items</div>
    <script type="application/ld+json">
      {"@type":"Event","name":"Family Storytime","startDate":"2026-10-09T10:30:00-07:00"}
    </script>
    <h3>Family Storytime</h3>
    <div>Friday, October 9, 2026, 10:30am ${branch} Event location: ${branch}</div>
  `;
  let call=0;
  globalThis.fetch=async input=>({ok:true,status:200,url:String(input),text:async()=>makePage(call++===0?"Alpine":"Poway")});
  try{
    const alpine=await biblioCommonsEvents({
      endpoint:"https://library.example/v2/events",sourceName:"San Diego County Library Events",
      sourceId:"sd-county-library",fallbackCenter:{lat:32.85,lng:-117.05},days:45,maxPages:1
    });
    const poway=await biblioCommonsEvents({
      endpoint:"https://library.example/v2/events",sourceName:"San Diego County Library Events",
      sourceId:"sd-county-library",fallbackCenter:{lat:32.85,lng:-117.05},days:45,maxPages:1
    });
    assert.equal(alpine[0].venue,"Alpine Library");
    assert.equal(poway[0].venue,"Poway Library");
    assert.notEqual(alpine[0].id,poway[0].id);
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test("qualified geocoder hints do not append the metro name twice",()=>{
  const region={name:"San Diego",administrativeArea:"CA",countryCode:"US"};
  assert.equal(
    venueGeocodeKey("Alpine Library, San Diego County, CA",region),
    "Alpine Library, San Diego County, CA, US"
  );
  assert.equal(
    venueGeocodeKey("Example Bar",region),
    "Example Bar, San Diego, CA, US"
  );
});

test("Reader specials parser keeps neighborhood, venue, and deal text",()=>{
  const html=`
    <h2>North Park</h2>
    <a href="/places/example-bar/">Example Bar</a>
    <div><strong>Special</strong> 3 PM - 6 PM: $5 appetizers and $6 cocktails</div>
    <a href="/places/next-bar/">Next Bar</a>
  `;
  const rows=parseReaderSpecials(html,"tuesday");
  assert.equal(rows.length,1);
  assert.equal(rows[0].venue,"Example Bar");
  assert.equal(rows[0].neighborhood,"North Park");
  assert.match(rows[0].detail,/\$5 appetizers/);
});

test("Reader happy-hour events preserve neighborhood as a geocoding hint",async()=>{
  const originalFetch=globalThis.fetch;
  const html=`
    <h2>North Park</h2>
    <a href="/places/example-bar/">Example Bar</a>
    <div><strong>Special</strong> 3 PM - 6 PM: $5 appetizers</div>
    <a href="/places/next-bar/">Next Bar</a>
  `;
  globalThis.fetch=async()=>({ok:true,status:200,text:async()=>html});
  try{
    const {sanDiegoReaderHappyHourEvents}=await import("./providers/sandiego-reader-happy-hours.mjs");
    const events=await sanDiegoReaderHappyHourEvents({days:7});
    const event=events.find(item=>item.venue==="Example Bar");
    assert.ok(event);
    assert.equal(event.address,null);
    assert.equal(event.geocodeQuery,"Example Bar, North Park, San Diego County, CA");
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test("Casbah parser treats promoter calendar venues as separate event locations",()=>{
  const html=`
    <div>Fri Oct 9
      <a href="/event/example-band">Example Band</a>
      at The Observatory North Park
      Doors: 7:00 PM Show: 8:00 PM
      $25 Rock
    </div>
  `;
  const rows=parseCasbahCalendar(html,{now:new Date("2026-10-02T12:00:00Z")});
  assert.equal(rows.length,1);
  assert.equal(rows[0].venue,"The Observatory North Park");
  assert.equal(rows[0].title,"Example Band");
});

test("Museum Council parser retains the hosting museum",()=>{
  const html=`
    <h4><a href="/event/museum-night">Museum Night</a></h4>
    <div>Hosted by: <a>Museum of Us</a> Oct 10 | 6:00 pm</div>
  `;
  const rows=parseMuseumCouncil(html,{now:new Date("2026-10-02T12:00:00Z")});
  assert.equal(rows.length,1);
  assert.equal(rows[0].host,"Museum of Us");
});

test("Convention Center parser excludes private events and keeps public date ranges",()=>{
  const html=`
    <h2>Public Expo</h2><div>Attendance: 5,000 Convention with Trade Show 10/10/2026 10/12/2026</div>
    <h2>Private Event: Internal Meeting</h2><div>Attendance: 50 Meeting/Seminar 10/15/2026 10/15/2026</div>
  `;
  const rows=parseConventionCenter(html,{now:new Date("2026-10-02T12:00:00Z")});
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,"Public Expo");
  assert.equal(rows[0].attendance,"5,000");
});

test("Fairgrounds print parser extracts flattened calendar events and skips public meetings",()=>{
  const html=`
    <div><strong>Friday, Oct. 9</strong></div>
    <section><span>9:30 AM</span><span>22nd DAA Board Meeting</span><span> - Location: Del Mar Fairgrounds | 5</span></section>
    <section><span>10:00 AM</span><span>Pumpkin Station</span><span> - Location: East Parking Lot | 2</span></section>
    <section><span>8:00 PM</span><span>Example Concert -</span><span> - Location: The Sound | 4</span></section>
  `;
  const rows=parseFairgroundsPrint(html,{now:new Date("2026-10-02T12:00:00Z")});
  assert.equal(rows.length,2);
  assert.ok(rows.some(row=>row.title==="Pumpkin Station"&&row.venue==="East Parking Lot"));
  assert.ok(rows.some(row=>row.title==="Example Concert"&&row.venue==="The Sound"));
  assert.ok(!rows.some(row=>/Board Meeting/i.test(row.title)));
});

test("Escondido municipal source treats an empty valid City Events feed as healthy",()=>{
  const source=SOURCES.find(item=>item.id==="escondido-calendar");
  assert.ok(source);
  assert.equal(source.adapter,"multi-ics");
  assert.equal(source.minExpectedEvents,undefined);
});

test("Santee parser extracts community activities while preserving address",()=>{
  const html=`
    <h1><a href="/calendar/event/bingo">Family Bingo Night</a></h1>
    <div>Location: Santee Teen Center 8115 Main St, Santee, CA 92071
      Date: Friday, October 9, 2026
      Time: 6:00 PM
    </div>
  `;
  const rows=parseSanteeCalendar(html,{now:new Date("2026-10-02T12:00:00Z")});
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,"Family Bingo Night");
  assert.match(rows[0].address,/Santee, CA 92071/);
});
