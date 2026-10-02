import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {loadAcquisitionRegistry} from "./acquisition-registry.mjs";
import {parseBiblioCommonsPage} from "./providers/bibliocommons.mjs";
import {parseReaderSpecials} from "./providers/sandiego-reader-happy-hours.mjs";
import {parseCasbahCalendar} from "./providers/casbah-presents.mjs";
import {parseMuseumCouncil} from "./providers/museum-council.mjs";
import {parseConventionCenter} from "./providers/convention-center.mjs";
import {parseFairgroundsPrint} from "./providers/del-mar-fairgrounds.mjs";
import {parseSanteeCalendar} from "./providers/santee-calendar.mjs";

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

test("Fairgrounds print parser extracts dated sub-venue events",()=>{
  const html=`
    <div>Friday, Oct. 9</div>
    <div>7:00 PM</div>
    <div>Example Concert - Location: The Sound | 4</div>
  `;
  const rows=parseFairgroundsPrint(html,{now:new Date("2026-10-02T12:00:00Z")});
  assert.equal(rows.length,1);
  assert.equal(rows[0].title,"Example Concert");
  assert.equal(rows[0].venue,"The Sound");
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
