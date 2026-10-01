import test from "node:test";
import assert from "node:assert/strict";
import {classifyEvent,refineEventCategory} from "./event-classification.mjs";

test("music performances outrank generic community and performance words",()=>{
  assert.equal(classifyEvent("Allison Adams Tucker Quartet","live performance"),"music");
  assert.equal(classifyEvent("San Diego Tijuana International Jazz Festival","festival performance"),"music");
  assert.equal(refineEventCategory({
    title:"Kat Hall",
    category:"community",
    description:"Live music performance Friday evening",
    venue:"Duke's La Jolla",
    source:"Example"
  }),"music");
});

test("venue and event semantics classify theater, comedy, festival, and family",()=>{
  assert.equal(classifyEvent("Begin Again","Old Globe Theatre"),"theater");
  assert.equal(classifyEvent("Annie Lederman","Comedy Store - La Jolla"),"comedy");
  assert.equal(classifyEvent("Oktoberfest in El Cajon","German American Societies"),"festival");
  assert.equal(classifyEvent("Goff Family Pumpkin Patch at Liberty Station"),"family");
});

test("broad categories are refined while trusted categories remain stable",()=>{
  assert.equal(refineEventCategory({title:"Concert in the Park",category:"community",description:"live band"}),"music");
  assert.equal(refineEventCategory({title:"Padres vs Dodgers",category:"sports"}),"sports");
  assert.equal(classifyEvent("CETYS University Town Hall","65 Years of Binational Impact"),"community");
});
