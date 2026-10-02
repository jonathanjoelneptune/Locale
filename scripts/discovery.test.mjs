import test from "node:test";
import assert from "node:assert/strict";
import {buildCellOverpassQuery,candidateFromOverpassElement,fetchOverpass} from "./discovery-overpass.mjs";
import {adaptiveDiscoveryPlan,isOverpassDue} from "./discovery-budget.mjs";
import {probeLane,selectProbeCandidates,coldStorageDays,shouldColdStore} from "./discovery-priority.mjs";
import {buildDiscoveryCells,discoveryCellSummary} from "./discovery-grid.mjs";
import {discoveryEventLinks,discoveryIcsLinks,discoveryWebsiteAlternates,discoveryCommonEventPages,discoveryMinimumEvents,discoveryScopedTribeEvents} from "./discovery-probe.mjs";
import {extractCalendarEventLinks} from "./providers/calendar-links.mjs";
import {tribeEvents} from "./providers/tribe.mjs";
import {mergeSourceCatalog,sourceEndpointKey} from "./source-catalog.mjs";

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
  assert.match(highQuery,/\[bbox:32\.64324,-117\.24723,32\.78816,-117\.07497\]/);
  assert.match(highQuery,/nightclub\|bar\|pub\|music_venue/);
  assert.match(highQuery,/theatre\|cinema\|arts_centre\|community_centre/);
  assert.match(highQuery,/craft"="brewery"/);
  assert.match(highQuery,/events_venue/);
  assert.match(highQuery,/library/);
  assert.match(highQuery,/sports_centre/);
  assert.doesNotMatch(highQuery,/restaurant\|cafe/);
  assert.match(diningQuery,/restaurant\|cafe/);
  assert.doesNotMatch(highQuery,/around:/);
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
    <a href="https://www.tickettailor.com/events/example/123">Tickets</a>
    <a href="https://random.example/events/other">Other site</a>
    <a href="/about">About</a>
  `;
  const links=extractCalendarEventLinks(html,"https://venue.example/");
  assert.ok(links.includes("https://venue.example/events/friday-show"));
  assert.ok(links.includes("https://www.eventbrite.com/e/example-event-123"));
  assert.ok(links.includes("https://dice.fm/event/abc"));
  assert.ok(links.includes("https://www.tickettailor.com/events/example/123"));
  assert.ok(!links.includes("https://random.example/events/other"));
});


test("focused area cells use the high-value venue discovery query",()=>{
  const focusQuery=buildCellOverpassQuery({
    id:"area:north-park",phase:"focus",lat:32.7475,lng:-117.1297,queryRadiusMiles:1.7
  });
  assert.match(focusQuery,/nightclub\|bar\|pub\|music_venue/);
  assert.match(focusQuery,/events_venue/);
  assert.doesNotMatch(focusQuery,/amenity"~"\^\(restaurant\|cafe\)\$"/);
});


test("Overpass failover skips a failed endpoint and succeeds on the next endpoint",async()=>{
  const calls=[];
  const health=new Map;
  const fetchImpl=async url=>{
    calls.push(url);
    if(url==="https://one.example/api/interpreter"){
      return {ok:false,status:503,headers:{get:()=>null}};
    }
    return {
      ok:true,
      status:200,
      headers:{get:()=>null},
      json:async()=>({elements:[{id:1}]})
    };
  };
  const result=await fetchOverpass("[out:json];node(0,0,0,0);out;",{
    fetchImpl,
    endpoints:[
      "https://one.example/api/interpreter",
      "https://two.example/api/interpreter"
    ],
    timeoutMs:1000,
    health,
    now:()=>0
  });
  assert.deepEqual(calls,[
    "https://one.example/api/interpreter",
    "https://two.example/api/interpreter"
  ]);
  assert.equal(result.elements.length,1);
  assert.ok(health.get("https://one.example/api/interpreter").cooldownUntil>=30000);
});

test("adaptive discovery stays aggressive while coverage is immature",()=>{
  const rows=Array.from({length:158},(_,index)=>({
    id:`area-${index}`,
    gapScore:index<8?0:90,
    acceptance:{pass:index<8}
  }));
  const zones=rows.map(row=>({id:row.id,regionId:"san-diego"}));
  const plan=adaptiveDiscoveryPlan({
    regions:{
      "san-diego":{
        coverageAreas:rows,
        coverageAreaAcceptance:{measured:158,passing:8}
      }
    }
  },zones,["san-diego"]);
  assert.equal(plan.mode,"bootstrap");
  assert.equal(plan.budget.probeLimit,30);
  assert.equal(plan.budget.probeConcurrency,3);
  assert.equal(plan.budget.overpassMinIntervalMinutes,60);
});

test("adaptive discovery tapers only after at least 95 percent coverage with no severe gaps",()=>{
  const rows=Array.from({length:158},(_,index)=>({
    id:`area-${index}`,
    gapScore:index<151?0:20,
    acceptance:{pass:index<151}
  }));
  const zones=rows.map(row=>({id:row.id,regionId:"san-diego"}));
  const mature=adaptiveDiscoveryPlan({
    regions:{
      "san-diego":{
        coverageAreas:rows,
        coverageAreaAcceptance:{measured:158,passing:151}
      }
    }
  },zones,["san-diego"]);
  assert.equal(mature.mode,"maintenance");
  assert.equal(mature.budget.probeLimit,10);

  rows[157]={...rows[157],gapScore:90};
  const severe=adaptiveDiscoveryPlan({
    regions:{
      "san-diego":{
        coverageAreas:rows,
        coverageAreaAcceptance:{measured:158,passing:151}
      }
    }
  },zones,["san-diego"]);
  assert.equal(severe.mode,"convergence");
});

test("Overpass cadence is independent from the faster discovery worker cadence",()=>{
  const now=Date.parse("2026-10-01T20:00:00Z");
  assert.equal(isOverpassDue(null,60,now),true);
  assert.equal(isOverpassDue("2026-10-01T19:30:01Z",60,now),false);
  assert.equal(isOverpassDue("2026-10-01T18:59:59Z",60,now),true);
});


test("probe lanes prioritize event-producing venues ahead of ordinary dining",()=>{
  assert.equal(probeLane({category:"music-venue",name:"The Sound"}),"event-likely");
  assert.equal(probeLane({category:"restaurant",name:"Oggi's Pizza and Brewing Co."}),"food-evidence");
  assert.equal(probeLane({category:"observed-venue",name:"Neighborhood Hall Events"}),"event-evidence");
  assert.equal(probeLane({category:"observed-venue",name:"Unknown Venue"}),"exploratory");
  assert.equal(probeLane({category:"restaurant",name:"Denny's"}),"low-value");
});

test("priority lane selection does not let ordinary restaurants consume bootstrap probes",()=>{
  const rows=[];
  for(let i=0;i<30;i++)rows.push({key:"music-"+i,category:"music-venue",name:"Music "+i,website:"https://music"+i+".example/",priority:100,discoveredAt:"2026-10-01T00:00:00Z"});
  for(let i=0;i<50;i++)rows.push({key:"food-"+i,category:"restaurant",name:"Restaurant "+i,website:"https://food"+i+".example/",priority:120,discoveredAt:"2026-10-01T00:00:00Z"});
  const result=selectProbeCandidates(rows,30,{
    scoreFn:item=>item.priority,
    hostFn:item=>new URL(item.website).hostname
  });
  assert.equal(result.selected.length,30);
  assert.equal(result.selected.filter(item=>item.category==="restaurant").length,1);
  assert.equal(result.selected.filter(item=>probeLane(item)==="low-value").length,1);
});

test("low-value calendar misses move to long-lived cold storage",()=>{
  const item={category:"restaurant",name:"Plain Restaurant",attempts:1,status:"retry"};
  const result={reason:"no-supported-calendar"};
  assert.equal(shouldColdStore(item,result),true);
  assert.equal(coldStorageDays(item,result),45);
  assert.equal(coldStorageDays({...item,attempts:2},result),90);
  assert.equal(coldStorageDays({...item,attempts:3},result),180);
  assert.equal(shouldColdStore({category:"bar",name:"Live Bar",attempts:1,status:"retry"},result),false);
});

test("cold candidates are sampled without taking over the hot queue",()=>{
  const rows=[];
  for(let i=0;i<20;i++)rows.push({key:"event-"+i,category:"bar",name:"Bar "+i,website:"https://bar"+i+".example/",priority:100,status:"candidate"});
  for(let i=0;i<10;i++)rows.push({key:"cold-"+i,category:"restaurant",name:"Cold "+i,website:"https://cold"+i+".example/",priority:200,status:"cold"});
  const result=selectProbeCandidates(rows,30,{hostFn:item=>new URL(item.website).hostname});
  assert.equal(result.selected.filter(item=>item.status==="cold").length,1);
});


test("discovery retries compatible website variants and root URLs",()=>{
  assert.deepEqual(discoveryWebsiteAlternates("https://venue.example/deep/events?x=1"),[
    "https://venue.example/deep/events?x=1",
    "https://venue.example/",
    "https://www.venue.example/deep/events?x=1",
    "https://www.venue.example/"
  ]);
});

test("high-confidence venue lanes can qualify from one future structured event",()=>{
  assert.equal(discoveryMinimumEvents({category:"theatre",name:"Example Theatre"}),1);
  assert.equal(discoveryMinimumEvents({category:"restaurant",name:"Example Brew Pub"}),1);
  assert.equal(discoveryMinimumEvents({category:"observed-venue",name:"Unknown Venue"}),2);
});

test("high-confidence venues get bounded common event-page fallbacks",()=>{
  assert.deepEqual(
    discoveryCommonEventPages("https://venue.example/about",{category:"music-venue",name:"Venue"}),
    [
      "https://venue.example/events/",
      "https://venue.example/calendar/",
      "https://venue.example/live-music/",
      "https://venue.example/shows/"
    ]
  );
  assert.deepEqual(
    discoveryCommonEventPages("https://food.example/",{category:"restaurant",name:"Plain Restaurant"}),
    []
  );
});


test("Tribe provider falls back to public HTML event pages when REST is blocked",async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes("/wp-json/tribe/events/v1/events"))return {ok:false,status:403};
    if(url==="https://venue.example/events/")return {
      ok:true,status:200,
      text:async()=>'<a href="/event/fall-show">Fall Show</a>'
    };
    if(url==="https://venue.example/event/fall-show")return {
      ok:true,status:200,
      text:async()=>`<script type="application/ld+json">{"@type":"Event","name":"Fall Show","startDate":"2026-10-15T19:00:00-07:00","url":"https://venue.example/event/fall-show"}</script>`
    };
    throw new Error("unexpected URL "+url);
  };
  try{
    const events=await tribeEvents({
      endpoint:"https://venue.example",
      sourceName:"Example Venue",
      sourceId:"example",
      fallbackCenter:{lat:32.7,lng:-117.1},
      days:45,
      maxPages:1
    });
    assert.equal(events.length,1);
    assert.equal(events[0].title,"Fall Show");
  }finally{
    globalThis.fetch=originalFetch;
  }
});


test("Tribe provider prefers a public iCalendar feed when REST is blocked",async()=>{
  const originalFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async input=>{
    const url=String(input);
    calls.push(url);
    if(url.includes("/wp-json/tribe/events/v1/events"))return {ok:false,status:403};
    if(url==="https://venue.example/events/?ical=1")return {
      ok:true,status:200,
      text:async()=>[
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:fall-show@example",
        "DTSTART:20261015T190000",
        "DTEND:20261015T210000",
        "SUMMARY:Fall Show",
        "LOCATION:Example Venue",
        "URL:https://venue.example/event/fall-show",
        "END:VEVENT",
        "END:VCALENDAR"
      ].join("\r\n")
    };
    throw new Error("unexpected URL "+url);
  };
  try{
    const events=await tribeEvents({
      endpoint:"https://venue.example",
      sourceName:"Example Venue",
      sourceId:"example",
      fallbackCenter:{lat:32.7,lng:-117.1},
      days:45,
      maxPages:1
    });
    assert.equal(events.length,1);
    assert.equal(events[0].title,"Fall Show");
    assert.ok(calls.includes("https://venue.example/events/?ical=1"));
    assert.ok(!calls.includes("https://venue.example/events/"));
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test("deep branch pages reject broad organization-wide Tribe calendars",()=>{
  const candidate={
    name:"Copley-Price Family YMCA",
    website:"https://www.ymcasd.org/locations/copley-price-family-ymca",
    lat:32.7556,lng:-117.1014
  };
  const events=[
    {venue:"Copley-Price Family YMCA",lat:32.7557,lng:-117.1013,locationPrecision:"source"},
    {venue:"Toby Wells YMCA",lat:32.8320,lng:-117.1570,locationPrecision:"source"},
    {venue:"McGrath Family YMCA",lat:32.7810,lng:-116.9630,locationPrecision:"source"},
    {venue:"Ryan Family YMCA",lat:32.8140,lng:-117.2160,locationPrecision:"source"}
  ];
  assert.deepEqual(discoveryScopedTribeEvents(candidate,events),[]);
});

test("deep venue pages can use Tribe calendars when events are scoped to that venue",()=>{
  const candidate={
    name:"Example Theatre",
    website:"https://example.org/venues/example-theatre",
    lat:32.75,lng:-117.13
  };
  const events=[
    {venue:"Example Theatre",lat:32.7501,lng:-117.1301,locationPrecision:"source"},
    {venue:"Example Theatre",lat:32.7502,lng:-117.1300,locationPrecision:"source"},
    {venue:"Example Theatre",lat:32.7499,lng:-117.1299,locationPrecision:"source"}
  ];
  assert.equal(discoveryScopedTribeEvents(candidate,events).length,3);
});

test("root venue sites can use site-wide Tribe calendars",()=>{
  const candidate={name:"Example Venue",website:"https://example.org/",lat:32.75,lng:-117.13};
  const events=[
    {venue:"Room A",lat:32.75,lng:-117.13,locationPrecision:"source"},
    {venue:"Room B",lat:32.75,lng:-117.13,locationPrecision:"source"}
  ];
  assert.equal(discoveryScopedTribeEvents(candidate,events).length,2);
});

test("static sources win over rediscovered dynamic copies of the same endpoint",()=>{
  const staticSources=[
    {id:"balboa-park",adapter:"tribe",endpoint:"https://balboapark.org",enabled:true}
  ];
  const discovered=[
    {id:"dynamic-balboa",adapter:"tribe",endpoint:"https://balboapark.org/",enabled:true},
    {id:"new-theatre",adapter:"jsonld",endpoint:"https://theatre.example/events",enabled:true}
  ];
  const merged=mergeSourceCatalog(staticSources,discovered);
  assert.deepEqual(merged.map(source=>source.id),["balboa-park","dynamic-balboa","new-theatre"]);
  const alias=merged.find(source=>source.id==="dynamic-balboa");
  assert.equal(alias.enabled,false);
  assert.equal(alias.sourceKind,"alias");
  assert.equal(alias.aliasOf,"balboa-park");
  assert.equal(sourceEndpointKey(staticSources[0]),sourceEndpointKey(discovered[0]));
});
