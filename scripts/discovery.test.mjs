import test from "node:test";
import assert from "node:assert/strict";
import {buildCellOverpassQuery,candidateFromOverpassElement} from "./discovery-overpass.mjs";
import {buildDiscoveryCells,discoveryCellSummary} from "./discovery-grid.mjs";
import {discoveryEventLinks,discoveryIcsLinks} from "./discovery-probe.mjs";
import {extractCalendarEventLinks} from "./providers/calendar-links.mjs";

const region={
  id:"san-diego",
  center:{lat:32.7157,lng:-117.1611},
  ingestRadiusMiles:50
};

test("discovery grid covers a region in bounded center-first cells",()=>{
  const core=buildDiscoveryCells({...region,discoveryCoreRadiusMiles:15},"core");
  const high=buildDiscoveryCells({...region,discoveryRadiusMiles:35},"high");
  const dining=buildDiscoveryCells({...region,discoveryDiningRadiusMiles:20},"dining");
  assert.ok(core.length>20);
  assert.ok(high.length>20);
  assert.ok(dining.length>10);
  assert.equal(core[0].distanceMiles,0);
  assert.equal(core[0].phase,"core");
  assert.ok(core[0].queryRadiusMiles<high[0].queryRadiusMiles);
  const summary=discoveryCellSummary({...region,discoveryCoreRadiusMiles:15,discoveryRadiusMiles:35,discoveryDiningRadiusMiles:20});
  assert.equal(summary.total,core.length+high.length+dining.length);
});

test("cell queries prioritize local nightlife/culture and keep dining separate",()=>{
  const highCell=buildDiscoveryCells({...region,discoveryRadiusMiles:35},"high")[0];
  const diningCell=buildDiscoveryCells({...region,discoveryDiningRadiusMiles:20},"dining")[0];
  const highQuery=buildCellOverpassQuery(highCell);
  const diningQuery=buildCellOverpassQuery(diningCell);
  assert.match(highQuery,/around:8047,32\.7157,-117\.1611/);
  assert.match(highQuery,/nightclub\|bar\|pub\|music_venue/);
  assert.match(highQuery,/theatre\|cinema\|arts_centre\|community_centre/);
  assert.match(highQuery,/craft"="brewery"/);
  assert.doesNotMatch(highQuery,/restaurant\|cafe/);
  assert.match(diningQuery,/restaurant\|cafe/);
  assert.doesNotMatch(diningQuery,/nightclub\|bar/);
  assert.doesNotMatch(highQuery,/university|school/);
});

test("OpenStreetMap venue candidates become Tier C queue entries",()=>{
  const candidate=candidateFromOverpassElement({
    type:"node",
    id:123,
    lat:32.75,
    lon:-117.13,
    tags:{
      name:"Example Bar",
      amenity:"bar",
      website:"example.com/events",
      "addr:housenumber":"123",
      "addr:street":"Main St",
      "addr:city":"San Diego",
      "addr:state":"CA"
    }
  },region);
  assert.equal(candidate.key,"san-diego|osm|node|123");
  assert.equal(candidate.website,"https://example.com/events");
  assert.equal(candidate.category,"bar");
  assert.equal(candidate.monitorTier,"C");
  assert.equal(candidate.priority,110);
  assert.match(candidate.address,/123 Main St/);
});

test("discovery probe only follows same-site event/calendar links",()=>{
  const html=`
    <a href="/events/">Events</a>
    <a href="/calendar/live-music">Live Music</a>
    <a href="/about">About</a>
    <a href="https://evil.example/events">Other site</a>
  `;
  const links=discoveryEventLinks(html,"https://venue.example/");
  assert.deepEqual(links,[
    "https://venue.example/events/",
    "https://venue.example/calendar/live-music"
  ]);
});

test("discovery probe extracts calendar feeds",()=>{
  const html=`
    <a href="/calendar/events.ics">Subscribe</a>
    <a href="https://venue.example/feed/calendar.ics?x=1">iCal</a>
  `;
  assert.deepEqual(discoveryIcsLinks(html,"https://venue.example/"),[
    "https://venue.example/calendar/events.ics",
    "https://venue.example/feed/calendar.ics?x=1"
  ]);
});


test("generic calendar-link adapter follows same-site and trusted ticketing event links",()=>{
  const html=`
    <a href="/events/friday-show">Friday Show</a>
    <a href="https://www.eventbrite.com/e/example-event-123">Tickets</a>
    <a href="https://dice.fm/event/abc">Live music tickets</a>
    <a href="https://random.example/events/other">Other site</a>
    <a href="/about">About</a>
  `;
  const links=extractCalendarEventLinks(html,"https://venue.example/");
  assert.ok(links.includes("https://venue.example/events/friday-show"));
  assert.ok(links.includes("https://www.eventbrite.com/e/example-event-123"));
  assert.ok(links.includes("https://dice.fm/event/abc"));
  assert.ok(!links.includes("https://random.example/events/other"));
});
