import test from "node:test";
import assert from "node:assert/strict";
import {getRegion,regionList} from "../src/data/regions.js";
import {dateKeyInZone,inDateRange} from "../src/services/time.js";
import {sourceCoversRegion,SOURCES} from "./source-registry.mjs";
import {readFile} from "node:fs/promises";

test("Vegas Strip region is independent of San Diego and Chicago",()=>{
 const vegas=getRegion("las-vegas");
 assert.equal(vegas.timeZone,"America/Los_Angeles");
 assert.ok(vegas.ingestRadiusMiles<=8);
 assert.ok(vegas.eventBounds.north<=36.145);
 assert.equal(regionList.length,3);
 assert.notDeepEqual(vegas.center,getRegion("san-diego").center);
});
test("Vegas Strip areas are scoped and uniquely identified",async()=>{
 const zones=JSON.parse(await readFile("src/data/coverage-zones.json","utf8"));
 const vegas=zones.filter(zone=>zone.regionId==="las-vegas");
 assert.ok(vegas.length>=9);
 assert.equal(new Set(vegas.map(zone=>zone.id)).size,vegas.length);
 assert.ok(vegas.every(zone=>zone.radiusMiles<=1));
});
test("Vegas ingestion sources are scoped to the Vegas region",()=>{
 const vegas=getRegion("las-vegas");
 const local=SOURCES.filter(s=>s.id.startsWith("vegas-")&&s.enabled!==false);
 assert.ok(local.length>=5);
 for(const source of local){assert.equal(sourceCoversRegion(source,vegas),true);assert.equal(sourceCoversRegion(source,getRegion("san-diego")),false)}
});
test("date matching is correct at a midnight timezone boundary",()=>{
 const event={start:"2026-11-26T07:30:00Z"};
 assert.equal(dateKeyInZone(new Date(event.start),"America/Los_Angeles"),"2026-11-25");
 assert.equal(inDateRange(event,"2026-11-25","2026-11-25","America/Los_Angeles"),true);
 assert.equal(inDateRange(event,"2026-11-26","2026-11-26","America/Los_Angeles"),false);
});
