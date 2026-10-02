import test from "node:test";
import assert from "node:assert/strict";
import {neighborhoodCoverage} from "./build-coverage-dashboard.mjs";

const neighborhood={id:"test",name:"Test District",regionId:"san-diego",lat:32.75,lng:-117.13,radiusMiles:1.25};
const region={id:"san-diego",timeZone:"America/Los_Angeles"};
const now=new Date("2026-10-01T12:00:00.000Z");

function event(id,start,{lat=32.75,lng=-117.13,title="Live Music",precision="source",venue="Venue"}={}){
  return {id,regionId:"san-diego",title,description:"",venue,lat,lng,locationPrecision:precision,start};
}

test("neighborhood density only counts precise nearby upcoming events",()=>{
  const events=[
    event("a","2026-10-03T02:00:00.000Z"),
    event("b","2026-10-03T03:00:00.000Z",{title:"Trivia Night"}),
    event("c","2026-10-04T03:00:00.000Z",{precision:"source-center"}),
    event("d","2026-10-03T03:00:00.000Z",{lat:33.1,lng:-117.13})
  ];
  const row=neighborhoodCoverage(events,neighborhood,region,{now,days:7});
  assert.equal(row.preciseEventsNext28d,2);
  assert.equal(row.uniqueVenuesNext28d,1);
  assert.equal(row.recurringLocalOccurrences30d,1);
  assert.ok(row.fridaySaturdayNightAverage>0);
});

test("neighborhood acceptance passes once both density targets are met",()=>{
  const starts=[
    "2026-10-03T02:00:00.000Z","2026-10-04T02:00:00.000Z",
    "2026-10-10T02:00:00.000Z","2026-10-11T02:00:00.000Z",
    "2026-10-17T02:00:00.000Z","2026-10-18T02:00:00.000Z",
    "2026-10-24T02:00:00.000Z","2026-10-25T02:00:00.000Z"
  ];
  const events=[];
  for(const [nightIndex,start] of starts.entries()){
    for(let i=0;i<8;i++)events.push(event(\`night-\${nightIndex}-\${i}\`,start,{venue:\`Venue \${i}\`,title:i===0?"Karaoke Night":"Live Music"}));
  }
  const row=neighborhoodCoverage(events,neighborhood,region,{now,days:28});
  assert.equal(row.fridaySaturdayNightAverage,8);
  assert.ok(row.recurringLocalOccurrences30d>=5);
  assert.equal(row.acceptance.pass,true);
});
