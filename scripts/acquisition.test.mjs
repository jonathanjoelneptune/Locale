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
import {parseGranicusListRows,parseGranicusDetail,granicusMunicipalEvents} from "./providers/granicus-calendar.mjs";
import {parseSanMarcosListingLinks,parseSanMarcosDetail,sanMarcosCalendarEvents} from "./providers/san-marcos-calendar.mjs";

test("workbook acquisition registry preserves the complete source, area, and taxonomy inventory",async()=>{
  const registry=await loadAcquisitionRegistry();
  assert.equal(registry.sources.length,97);
  assert.deepEqual(registry.summary.priorities,{A:17,B:66,C:14});
  assert.equal(registry.areas.length,188);
  assert.equal(registry.taxonomy.familyCount,38);
  assert.equal(registry.taxonomy.rows.length,38);

  const ids=new Set(registry.sources.map(source=>source.id));
  assert.equal(ids.size,97);

  const zones=JSON.parse(await readFile("src/data/coverage-zones.json","utf8"));
  const configured=new Set(zones.filter(zone=>zone.regionId==="san-diego").map(zone=>zone.name));
  const mapped=new Set(registry.areas.map(area=>area.area));
  assert.equal(mapped.size,188);
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

test("BiblioCommons event identity includes branch location",async()=>{
  const originalFetch=globalThis.fetch;
  const html=`
    <div>1 to 20 of 2 items</div>
    <div>Location Locations Alpine (1) Poway (1) Audience Adults (2)</div>
    <div>Event items</div>

    <h3><a href="/events/storytime-a">Family Storytime</a></h3>
    <div>Friday, October 9, 2026, 10:00am Alpine Event location: Alpine
      Find more events in: Kids
      <a href="/events/storytime-a">View event</a>
    </div>

    <h3><a href="/events/storytime-b">Family Storytime</a></h3>
    <div>Friday, October 9, 2026, 10:00am Poway Event location: Poway
      Find more events in: Kids
      <a href="/events/storytime-b">View event</a>
    </div>
  `;
  globalThis.fetch=async input=>({ok:true,status:200,url:String(input),text:async()=>html});
  try{
    const events=await biblioCommonsEvents({
      endpoint:"https://library.example/v2/events",
      sourceName:"San Diego County Library Events",
      sourceId:"sd-county-library",
      fallbackCenter:{lat:32.85,lng:-117.05},
      days:45,maxPages:1
    });
    const storytimes=events.filter(event=>event.title==="Family Storytime");
    assert.equal(storytimes.length,2);
    assert.equal(new Set(storytimes.map(event=>event.id)).size,2);
    assert.ok(storytimes.some(event=>event.id.includes(":alpine-library:")));
    assert.ok(storytimes.some(event=>event.id.includes(":poway-library:")));
  }finally{
    globalThis.fetch=originalFetch;
  }
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


test("Granicus list parser extracts municipal activities and date ranges",()=>{
  const html=`
    <table>
      <tr><th>Event</th><th>Date/Time</th></tr>
      <tr>
        <td><a href="/Home/Components/Calendar/Event/1/1">TCG Tuesdays</a></td>
        <td>10/06/2026 5:00 PM - 6:30 PM 10/06/2026 5:00 PM 10/06/2026 6:30 PM</td>
      </tr>
      <tr>
        <td><a href="/Home/Components/Calendar/Event/2/1">Ballet Folklorico</a></td>
        <td>10/07/2026 - 10/09/2026</td>
      </tr>
    </table>
  `;
  const rows=parseGranicusListRows(html,"https://city.example/calendar");
  assert.equal(rows.length,2);
  assert.equal(rows[0].title,"TCG Tuesdays");
  assert.ok(rows[0].start.startsWith("2026-10-07T00:00:00")||rows[0].start.startsWith("2026-10-06T"));
  assert.ok(rows[0].end);
  assert.equal(rows[1].timeStatus,"unknown");
});

test("Granicus detail parser extracts coordinates, address, and venue",()=>{
  const html=`
    <h1>Fire Open House</h1>
    <div>Description: Family-friendly open house.</div>
    <div>Location: Fire Station 1 180 West Mission Road, San Marcos, CA 92069</div>
    <div>33.143494, -117.164563</div>
    <div>Date: Saturday</div>
  `;
  const row=parseGranicusDetail(html,{cityName:"San Marcos"});
  assert.equal(row.lat,33.143494);
  assert.equal(row.lng,-117.164563);
  assert.match(row.address,/180 West Mission Road/);
});

test("Dedicated Granicus adapter filters civic meetings and applies facility hints",async()=>{
  const originalFetch=globalThis.fetch;
  const listing=`
    <div>1 - 20 of 2 items</div>
    <table>
      <tr><th>Event</th><th>Date/Time</th></tr>
      <tr><td> <a href="/event/library">TCG Tuesdays</a></td><td>10/06/2026 5:00 PM - 6:30 PM</td></tr>
      <tr><td> <a href="/event/council">City Council Meeting</a></td><td>10/06/2026 6:00 PM - 8:00 PM</td></tr>
    </table>
  `;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url==="https://city.example/calendar")return {ok:true,status:200,url,text:async()=>listing};
    if(url==="https://city.example/event/library")return {ok:true,status:200,url,text:async()=>"<div>Description: Weekly card game.</div>"};
    if(url==="https://city.example/event/council")return {ok:true,status:200,url,text:async()=>"<div>Location: City Hall</div>"};
    throw new Error("unexpected URL "+url);
  };
  try{
    const events=await granicusMunicipalEvents({
      endpoints:["https://city.example/calendar"],
      sourceName:"National City Calendar of Events",
      sourceId:"national-city-calendar",
      fallbackCenter:{lat:32.6781,lng:-117.0992},
      cityName:"National City",
      locationHints:[{
        match:"TCG Tuesdays",
        venue:"National City Public Library",
        address:"1401 National City Blvd, National City, CA 91950",
        query:"1401 National City Blvd, National City, CA 91950"
      }],
      days:45,maxPages:2,maxDetails:10
    });
    assert.equal(events.length,1);
    assert.equal(events[0].title,"TCG Tuesdays");
    assert.equal(events[0].venue,"National City Public Library");
    assert.equal(events[0].address,"1401 National City Blvd, National City, CA 91950");
    assert.ok(!events.some(event=>/Council Meeting/.test(event.title)));
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test("San Marcos listing finds dated event detail links",()=>{
  const html=`
    <a href="/Meetings-Events/Parks-Recreation/City-Hikes/October-City-Hike">October City Hike</a>
    <div>03 Oct 2026 Hike to the summit.</div>
    <a href="/Online-Services">Online Services</a>
  `;
  const rows=parseSanMarcosListingLinks(html,"https://www.sanmarcosca.gov/Meetings-Events");
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,"October City Hike");
});

test("San Marcos detail parser preserves precise event coordinates and dates",()=>{
  const html=`
    <h1>San Marcos Fire Department Open House</h1>
    <div>Next date: Saturday, October 03, 2026 | 10:00 AM to 02:00 PM</div>
    <div>Join us for a free family-friendly event. Location: San Marcos Fire Station 1</div>
    <div>When Saturday, October 03, 2026 | 10:00 AM - 02:00 PM</div>
    <div>Location 180 West Mission Road, San Marcos, CA 92069 33.143494, -117.164563</div>
    <div>Tagged as: Kids & family Back to top</div>
  `;
  const row=parseSanMarcosDetail(html,"https://www.sanmarcosca.gov/event");
  assert.equal(row.title,"San Marcos Fire Department Open House");
  assert.ok(row.whens.length>=1);
  assert.equal(row.lat,33.143494);
  assert.equal(row.lng,-117.164563);
});

test("municipal workbook candidates are active only with dedicated adapters",()=>{
  const national=SOURCES.find(source=>source.id==="national-city-calendar");
  const chula=SOURCES.find(source=>source.id==="chula-vista-calendar");
  const sanMarcos=SOURCES.find(source=>source.id==="san-marcos-calendar");
  assert.equal(national.adapter,"granicus-calendar");
  assert.equal(chula.adapter,"granicus-calendar");
  assert.equal(sanMarcos.adapter,"san-marcos-calendar");
  assert.notEqual(national.enabled,false);
  assert.notEqual(chula.enabled,false);
  assert.notEqual(sanMarcos.enabled,false);
});
