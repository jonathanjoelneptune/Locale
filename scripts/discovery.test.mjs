import test from "node:test";
import assert from "node:assert/strict";
import {buildOverpassQueries,candidateFromOverpassElement} from "./discovery-overpass.mjs";
import {discoveryEventLinks,discoveryIcsLinks} from "./discovery-probe.mjs";

const region={
  id:"san-diego",
  center:{lat:32.7157,lng:-117.1611},
  ingestRadiusMiles:50
};

test("regional discovery query targets event-capable venue categories with websites",()=>{
  const batches=buildOverpassQueries(region);
  assert.equal(batches.length,2);
  const core=batches.find(batch=>batch.id==="core-venues").query;
  const dining=batches.find(batch=>batch.id==="dining-venues").query;
  assert.match(core,/around:80467,32\.7157,-117\.1611/);
  assert.match(core,/amenity"~"\^\(nightclub\|bar\|pub/);
  assert.match(core,/craft"="brewery"/);
  assert.match(dining,/amenity"~"\^\(restaurant\|cafe\)\$"/);
  assert.doesNotMatch(core,/university|school/);
  assert.doesNotMatch(dining,/university|school/);
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
  assert.equal(candidate.priority,92);
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
