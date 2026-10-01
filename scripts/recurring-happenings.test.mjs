import test from "node:test";
import assert from "node:assert/strict";
import {weeklyOccurrences,parseClock,zonedLocalIso} from "./weekly-recurrence.mjs";
import {extractSinghubVenueLinks,parseSinghubVenuePage} from "./providers/singhub-karaoke.mjs";
import {parseTacoTuesdayVenueBlocks} from "./providers/taco-tuesday.mjs";

test("weekly recurrence preserves San Diego local clock time across DST",()=>{
  const before=zonedLocalIso({year:2026,month:10,day:27,hour:20,minute:0,timeZone:"America/Los_Angeles"});
  const after=zonedLocalIso({year:2026,month:11,day:3,hour:20,minute:0,timeZone:"America/Los_Angeles"});
  assert.equal(before,"2026-10-28T03:00:00.000Z");
  assert.equal(after,"2026-11-04T04:00:00.000Z");
  assert.deepEqual(parseClock("9:30 PM"),{hour:21,minute:30});

  const now=new Date("2026-10-01T12:00:00.000Z");
  const tuesdays=weeklyOccurrences({day:"Tuesday",time:"8:00 PM",days:14,timeZone:"America/Los_Angeles",now});
  assert.equal(tuesdays.length,2);
  assert.equal(tuesdays[0],"2026-10-07T03:00:00.000Z");
});

test("SingHUB parser finds venue profiles and weekly schedules",()=>{
  const finder='<a href="/venues/1-fifth-avenue">One</a><a href="/venues/u-31?x=1">Two</a>';
  assert.deepEqual(extractSinghubVenueLinks(finder),[
    "https://singhub.app/venues/1-fifth-avenue",
    "https://singhub.app/venues/u-31"
  ]);
  const page=`
    <h1>#1 Fifth Avenue</h1>
    <div>Hillcrest · 3845 Fifth Ave, San Diego, CA 92103</div>
    <h2>Weekly schedule</h2>
    <div>Tuesday</div><div>Bobbi and Danny</div><div>8 PM</div>
    <div>Thursday • 10:00 PM to 12:30 AM • KJ: Navy Nick</div>
    <h2>Good to know</h2>
    <div>Address</div><div>3845 Fifth Ave, San Diego, CA 92103</div>
  `;
  const parsed=parseSinghubVenuePage(page,"https://singhub.app/venues/1-fifth-avenue");
  assert.equal(parsed.name,"#1 Fifth Avenue");
  assert.equal(parsed.address,"3845 Fifth Ave, San Diego, CA 92103");
  assert.deepEqual(parsed.schedules,[
    {day:"Tuesday",time:"8 PM"},
    {day:"Thursday",time:"10:00 PM"}
  ]);
});

test("Taco Tuesday parser extracts recurring venue specials",()=>{
  const html=`
    <h3>Whiskey Girl</h3>
    <p>Address: 702 Fifth Ave</p>
    <p>Taco Tuesday: 4:00 PM – 10:00 PM</p>
    <p>$3.50 tacos and $5 margaritas.</p>
    <h3>Not A Taco Venue</h3><p>Wednesday special only.</p>
  `;
  const rows=parseTacoTuesdayVenueBlocks(html);
  assert.equal(rows.length,1);
  assert.equal(rows[0].venue,"Whiskey Girl");
  assert.equal(rows[0].address,"702 Fifth Ave");
  assert.deepEqual(rows[0].clock,{hour:16,minute:0});
});
