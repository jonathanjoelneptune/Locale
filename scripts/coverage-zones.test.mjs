import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {COVERAGE_CLASS_TARGETS,containingCoverageZones,areaGapScore} from "./coverage-zones.mjs";

const zones=JSON.parse(await readFile("src/data/coverage-zones.json","utf8"));

test("San Diego coverage grid preserves broad and granular geography",()=>{
  assert.ok(zones.length>=185);
  const ids=new Set(zones.map(zone=>zone.id));
  for(const id of [
    "north-park","hillcrest","pacific-beach","kearny-mesa","convoy","mira-mesa",
    "la-jolla","university-city-utc","east-village","gaslamp","marina-seaport",
    "university-heights","barrio-logan","coronado","balboa-park","santee",
    "blossom-valley","lakeside","mission-valley","fashion-valley","normal-heights",
    "el-cajon","la-mesa","otay-mesa","otay-ranch","chula-vista","national-city",
    "carlsbad","oceanside","encinitas","escondido","san-marcos","vista",
    "campo","rainbow","warner-springs","mount-laguna","pala","camp-pendleton-mainside",
    "lake-san-marcos","hidden-meadows","dulzura","palomar-mountain","viejas-reservation"
  ])assert.ok(ids.has(id),`missing required coverage area ${id}`);
});

test("coverage grid spans all San Diego operating groups",()=>{
  const groups=new Set(zones.map(zone=>zone.group));
  assert.deepEqual([...groups].sort(),[
    "central-core","central-west","east-county","north-central","north-county-coast",
    "north-county-inland","north-inland","south-bay","uptown-midcity"
  ]);
  assert.equal(new Set(zones.map(zone=>zone.id)).size,zones.length);
});

test("coverage classes scale expectations to local density",()=>{
  assert.ok(COVERAGE_CLASS_TARGETS["entertainment-core"].fridaySaturdayNightAverage>
    COVERAGE_CLASS_TARGETS["urban-core"].fridaySaturdayNightAverage);
  assert.ok(COVERAGE_CLASS_TARGETS["urban-core"].fridaySaturdayNightAverage>=
    COVERAGE_CLASS_TARGETS.urban.fridaySaturdayNightAverage);
  assert.ok(COVERAGE_CLASS_TARGETS.urban.fridaySaturdayNightAverage>
    COVERAGE_CLASS_TARGETS.suburban.fridaySaturdayNightAverage);
  assert.ok(COVERAGE_CLASS_TARGETS.suburban.fridaySaturdayNightAverage>
    COVERAGE_CLASS_TARGETS.outer.fridaySaturdayNightAverage);
});

test("point-to-area matching prefers the smallest local area",()=>{
  const hits=containingCoverageZones({lat:32.8255,lng:-117.1547},zones,{regionId:"san-diego"});
  assert.ok(hits.length>=2);
  assert.equal(hits[0].id,"convoy");
  assert.ok(hits.some(zone=>zone.id==="kearny-mesa"));
});

test("gap score stays bounded and falls as coverage improves",()=>{
  const weak=areaGapScore({
    fridaySaturdayNightAverage:0,recurringLocalOccurrences30d:0,uniqueVenuesNext28d:0,
    targets:{fridaySaturdayNightAverage:8,recurringLocalOccurrences30d:5}
  });
  const strong=areaGapScore({
    fridaySaturdayNightAverage:8,recurringLocalOccurrences30d:5,uniqueVenuesNext28d:20,
    targets:{fridaySaturdayNightAverage:8,recurringLocalOccurrences30d:5}
  });
  assert.equal(weak,100);
  assert.equal(strong,0);
});
